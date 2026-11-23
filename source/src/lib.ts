import { ACCREDITATIONS, parseMulti, SERVICES, TRAININGS, typeById, visibleFields, type TypeId, type Units, type Values } from './schema'

/* ---------- missing-value marker (used only in the live preview) ---------- */
export const MISS_OPEN = '⁣⟦'
export const MISS_CLOSE = '⟧⁣'
const MISS = (label: string) => `${MISS_OPEN}${label}${MISS_CLOSE}`
export const LATER = 'يُحدَّد لاحقاً'

/* ---------- helpers ---------- */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
export const latinDigits = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, (d) => String(AR_DIGITS.indexOf(d) >= 0 ? AR_DIGITS.indexOf(d) : FA_DIGITS.indexOf(d)))

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const parseDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], date: new Date(+m[1], +m[2] - 1, +m[3]) }
}

export const dayName = (iso: string) => {
  const p = parseDate(iso)
  return p ? DAYS[p.date.getDay()] : ''
}

export const fmtDate = (iso: string) => {
  const p = parseDate(iso)
  if (!p) return ''
  // LRM keeps the date in day-month-year order inside Arabic lines (Teams and WhatsApp included)
  return `\u200E${String(p.d).padStart(2, '0')}-${String(p.mo).padStart(2, '0')}-${p.y}`
}

export const fmtTime = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return ''
  const h = +m[1]
  const mm = m[2]
  const period = h < 12 ? 'صباحاً' : h < 15 ? 'ظهراً' : 'مساءً'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${period}`
}

const isNum = (s: string) => /^\d+(\.\d+)?$/.test(latinDigits(s.trim()))

/* ---------- text builder ---------- */
type Getter = (key: string) => string

function makeGetter(typeId: TypeId, v: Values): Getter {
  const t = typeById(typeId)
  const fields = visibleFields(t, v)
  return (key) => {
    const f = fields.find((x) => x.key === key)
    const raw = (v[key] ?? '').trim()
    if (!f) return raw
    if (!raw) return f.required ? MISS(f.label) : f.later ? LATER : ''
    if (f.kind === 'time') return fmtTime(raw)
    if (f.kind === 'date') return fmtDate(raw)
    if (f.kind === 'multi') {
      const picked = (f.options ?? []).filter((o) => parseMulti(raw).includes(o))
      return picked.every((x) => /[\u0600-\u06FF]/.test(x)) ? picked.join(' و') : picked.join('، ')
    }
    if (f.kind === 'count') {
      const n = countOf(raw)
      return f.units && n ? counted(n, f.units) : latinDigits(raw)
    }
    if (f.kind === 'hours') return fmtHours(raw, f.units)
    return raw
  }
}

const L = (label: string, value: string) => (value ? `${label}: ${value}` : `${label}:`)

const multiline = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trimEnd())
    .filter((x, i, arr) => x || (i > 0 && arr[i - 1]))

const join = (blocks: (string[] | false | null | undefined)[]) =>
  blocks
    .filter((b): b is string[] => !!b && b.length > 0)
    .map((b) => b.join('\n'))
    .join('\n\n')

/**
 * Arabic counted phrases with correct agreement:
 * 1 → noun + «واحد/ة», 2 → dual, 3–10 → digits + plural, 11+ → digits + singular (accusative where needed).
 */
type Counted = Units

function counted(n: number, f: Counted) {
  if (n === 1) return f.one
  if (n === 2) return f.two
  if (n <= 10) return `${n} ${f.few}`
  return `${n} ${f.many}`
}

function fmtHours(raw: string, units?: Units) {
  const t = latinDigits(raw).replace(/\s+/g, '')
  const u = units ?? { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' }
  const range = /^(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)$/.exec(t)
  if (range) {
    const b = parseFloat(range[2])
    // LRM keeps «6-7» in reading order inside an Arabic line
    return `\u200E${range[1]}-${range[2]} ${Number.isInteger(b) && b >= 3 && b <= 10 ? u.few : u.many}`
  }
  if (/^\d+$/.test(t)) return counted(parseInt(t, 10), u)
  if (/^\d+\.\d+$/.test(t)) return `${t} ${u.many}`
  return raw
}

const joinAnd = (xs: string[]) => xs.join(' و')

const countOf = (s?: string) => {
  const n = parseInt(latinDigits((s ?? '').trim()), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function autoRequired(v: Values) {
  const svcs = parseMulti(v.services)
  const lvl = (v.level ?? '').trim()
  const L = lvl ? ` ${lvl}` : ''
  const out: string[] = []
  if (svcs.includes('عيادة')) {
    const n = countOf(v.clinicCount)
    out.push(
      n
        ? `${counted(n, {
            one: `عيادة طبية${L} واحدة`,
            two: `عيادتان طبيتان${L}`,
            few: `عيادات طبية${L}`,
            many: `عيادة طبية${L}`,
          })} مع الطاقم`
        : `${MISS('عدد العيادات')} عيادات طبية${L} مع الطاقم`,
    )
  }
  if (svcs.includes('إسعاف')) {
    const n = countOf(v.ambCount)
    out.push(
      n
        ? `${counted(n, {
            one: `سيارة إسعاف${L} واحدة`,
            two: `سيارتا إسعاف${L}`,
            few: `سيارات إسعاف${L}`,
            many: `سيارة إسعاف${L}`,
          })} مع الطاقم`
        : `${MISS('عدد سيارات الإسعاف')} سيارات إسعاف${L} مع الطاقم`,
    )
  }
  if (svcs.includes('فرق راجلة')) {
    const n = countOf(v.footCount)
    out.push(
      n
        ? `${counted(n, { one: 'مسعف واحد', two: 'مسعفان', few: 'مسعفين', many: 'مسعفاً' })} (فرقة راجلة)`
        : `${MISS('عدد المسعفين')} مسعفين (فرقة راجلة)`,
    )
  }
  return out
}

function dayDate(g: Getter, v: Values) {
  const date = g('date')
  return [L('اليوم', dayName(v.date ?? '')), L('التاريخ', date)]
}

function transferText(typeId: 'internal' | 'external', v: Values) {
  const g = makeGetter(typeId, v)
  const kind = typeId === 'internal' ? 'داخلية' : 'خارجية'
  const trip = g('trip') || 'ذهاب'
  const age = g('age')
  const weight = g('weight')
  const pickup = g('pickup')
  const dropoff = g('dropoff')
  const condition = g('condition')
  const notes = g('notes')
  const flight = typeId === 'external' ? g('flightTime') : ''

  return join([
    [`📮 *رحلة ${kind} ${trip}* 📮`],
    dayDate(g, v),
    [L('الفرقة', g('team'))],
    [
      L('وقت التواجد في المركز', g('tCenter')),
      L('وقت التحرك إلى موقع المريض', g('tMove')),
      L('وقت الوصول إلى موقع المريض', g('tArrive')),
    ],
    [
      L('رقم الإسعاف', g('ambulanceNo')),
      L('الأجهزة', g('equipment')),
      L('رقم الشنطة الإسعافية', g('bagNo')),
      L('رقم شنطة الأدوية', g('drugBagNo')),
    ],
    [
      L('اسم المريض', g('patientName')),
      L('رقم الهوية', g('patientId')),
      L('العمر', age && isNum(age) ? `${age} سنة` : age),
      L('الوزن التقريبي', weight && isNum(weight) ? `${weight} كجم` : weight),
    ],
    ['الحالة الصحية:', ...multiline(condition)],
    flight ? [L('وقت وصول الطائرة', flight)] : null,
    [`اتجاه الرحلة: من ${pickup} إلى ${dropoff}`],
    [L('موقع الاستلام', pickup), ...(g('pickupLink') ? [g('pickupLink')] : [])],
    [L('موقع التسليم', dropoff), ...(g('dropoffLink') ? [g('dropoffLink')] : [])],
    [L('رقم التواصل', g('contact'))],
    notes ? ['ملاحظات:', ...multiline(notes)] : null,
  ])
}

function coverageText(v: Values) {
  const g = makeGetter('coverage', v)
  const svcs = SERVICES.filter((x) => parseMulti(v.services).includes(x))
  const ambulance = svcs.includes('إسعاف')
  const needsLevel = ambulance || svcs.includes('عيادة')
  const title = svcs.length === 1 && ambulance ? 'تغطية إسعافية' : 'تغطية طبية'
  const reqLines = g('required')
    ? multiline(g('required')).filter(Boolean).map((x) => (x.startsWith('-') ? x : `- ${x}`))
    : autoRequired(v).map((x) => `- ${x}`)
  const positions = g('positions')
  const entry = g('entry')
  const notes = g('notes')

  return join([
    [`📮 *${title}* 📮`],
    [L('اسم الفعالية', g('eventName')), ...dayDate(g, v)],
    [L('الفرقة', g('team'))],
    [L('وقت التواجد في المركز', g('tCenter')), L('وقت التحرك إلى موقع الفعالية', g('tMove'))],
    [
      !v.eventFrom && !v.eventTo
        ? `وقت الفعالية: ${LATER}`
        : `وقت الفعالية: من ${g('eventFrom')} إلى ${v.eventTo ? g('eventTo') : `(${LATER})`}`,
    ],
    ['المطلوب:', ...reqLines],
    [
      L('نوع الفعالية', g('eventType')),
      L('نوع الخدمة', svcs.length ? joinAnd(svcs) : g('services')),
      ...(needsLevel ? [L('مستوى الخدمة', g('level'))] : []),
      L('رقم المشروع', g('projectNo')),
    ],
    [
      ...(ambulance ? [L('رقم الإسعاف', g('ambulanceNo'))] : []),
      L('الأجهزة', g('equipment')),
      L('رقم الشنطة الإسعافية', g('bagNo')),
      L('رقم شنطة الأدوية', g('drugBagNo')),
    ],
    positions ? ['نقاط التمركز:', ...multiline(positions)] : null,
    entry ? ['مسار الدخول:', ...multiline(entry)] : null,
    [L('اسم المنظم', g('organizer')), L('رقم المنظم', g('organizerPhone'))],
    [L('موقع الفعالية', g('location')), ...(g('locationLink') ? [g('locationLink')] : [])],
    notes ? ['ملاحظات:', ...multiline(notes)] : null,
  ])
}

function accreditationLines(v: Values) {
  const picked = ACCREDITATIONS.filter((x) => parseMulti(v.accreditation).includes(x))
  if (picked.length <= 1) return [L('جهة الاعتماد', picked[0] ?? '')]
  return ['جهة الاعتماد:', ...picked.map((x) => `- ${x}`)]
}

function trainingLines(g: Getter, v: Values) {
  const picked = TRAININGS.filter((x) => parseMulti(v.trainingType).includes(x))
  if (picked.length <= 1) return [L('نوع التدريب', picked[0] ?? g('trainingType'))]
  return ['نوع التدريب:', ...picked.map((x) => `- ${x}`)]
}

function trainingText(v: Values) {
  const g = makeGetter('training', v)
  const notes = g('notes')
  return join([
    ['*تدريب* 📝 ⛑️'],
    [
      ...dayDate(g, v),
      L('المدينة', g('city')),
      ...trainingLines(g, v),
      ...accreditationLines(v),
      L('لغة التدريب', g('language')),
      L('مدة التدريب', g('duration')),
      L('عدد المتدربين', g('trainees')),
      L('عدد الجلسات', g('sessions')),
      L('وقت بدء التدريب', g('start')),
      L('اسم الجهة', g('org')),
    ],
    notes ? ['ملاحظات:', ...multiline(notes)] : null,
  ])
}

export function buildText(typeId: TypeId, v: Values) {
  switch (typeId) {
    case 'internal':
    case 'external':
      return transferText(typeId, v)
    case 'coverage':
      return coverageText(v)
    case 'training':
      return trainingText(v)
  }
}

/* ---------- validation ---------- */
export interface Check {
  missing: { key: string; label: string }[]
  warnings: { key: string; text: string }[]
  /** optional-for-now fields left empty: written as «يُحدَّد لاحقاً» */
  pending: { key: string; label: string }[]
}

const TEL_OK = [/^05\d{8}$/, /^(\+?966|00966)5\d{8}$/, /^0\d{9}$/, /^920\d{6}$/, /^800\d{7}$/]

export function check(typeId: TypeId, v: Values): Check {
  const t = typeById(typeId)
  const fields = visibleFields(t, v)
  const missing = fields
    .filter((f) => f.required && (!(v[f.key] ?? '').trim() || (f.kind === 'count' && countOf(v[f.key]) === 0)))
    .map((f) => ({ key: f.key, label: f.label }))
  const warnings: Check['warnings'] = []

  for (const f of fields) {
    const raw = (v[f.key] ?? '').trim()
    if (!raw) continue
    const n = latinDigits(raw).replace(/[\s-]/g, '')
    if (f.kind === 'tel' && !TEL_OK.some((r) => r.test(n)))
      warnings.push({ key: f.key, text: `${f.label}: الصيغة غير مألوفة (مثال: 05XXXXXXXX). راجعه قبل الإرسال.` })
    if (f.key === 'patientId' && !/^[12]\d{9}$/.test(n))
      warnings.push({ key: f.key, text: 'رقم الهوية ليس 10 أرقام تبدأ بـ 1 أو 2. راجعه (أو تجاهل التنبيه إن كان رقم جواز).' })
    if (f.kind === 'url' && !/^https?:\/\/\S+$/i.test(raw))
      warnings.push({ key: f.key, text: `${f.label}: لا يبدو رابطاً صحيحاً (يبدأ عادة بـ https://).` })
    if ((f.key === 'age' || f.key === 'weight') && !isNum(raw))
      warnings.push({ key: f.key, text: `${f.label}: يُفضّل رقم فقط، وتُضاف الوحدة تلقائياً.` })
  }

  const d = parseDate(v.date ?? '')
  if (d) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (d.date < today) warnings.push({ key: 'date', text: 'التاريخ في الماضي. تأكد أنه ليس خطأ.' })
  }
  if (typeId === 'coverage' && v.eventFrom && v.eventTo && v.eventTo <= v.eventFrom)
    warnings.push({ key: 'eventTo', text: 'نهاية الفعالية قبل بدايتها أو مساوية لها. هل تمتد لليوم التالي؟' })

  const pending = fields.filter((f) => f.later && !(v[f.key] ?? '').trim()).map((f) => ({ key: f.key, label: f.label }))
  return { missing, warnings, pending }
}

/* ---------- history (last 10, this browser only) ---------- */
export interface Saved {
  id: string
  typeId: TypeId
  savedAt: number
  values: Values
  text: string
}

const KEY = 'lazem-directives-history-v1'

export function loadHistory(): Saved[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    // keep only well-formed entries (older or damaged data must never break the page)
    return arr
      .filter(
        (x): x is Saved =>
          !!x &&
          typeof x === 'object' &&
          typeof x.id === 'string' &&
          typeof x.text === 'string' &&
          typeof x.savedAt === 'number' &&
          ['internal', 'external', 'coverage', 'training'].includes(x.typeId) &&
          !!x.values &&
          typeof x.values === 'object',
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

export function storeHistory(list: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
    return true
  } catch {
    return false
  }
}

export function pushHistory(list: Saved[], entry: Omit<Saved, 'id' | 'savedAt'>): Saved[] {
  const rest = list.filter((x) => x.text !== entry.text)
  const item: Saved = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() }
  return [item, ...rest].slice(0, 10)
}

/** values for "use as template": drop patient data, date and times */
export function templateValues(s: Saved): Values {
  const t = typeById(s.typeId)
  const fields = t.sections.flatMap((x) => x.fields)
  const out: Values = { ...t.defaults }
  for (const f of fields) {
    if (f.clearOnTemplate) continue
    if (s.values[f.key]) out[f.key] = s.values[f.key]
  }
  return out
}

export function historyTitle(s: Saved) {
  const v = s.values
  const t = typeById(s.typeId)
  if (s.typeId === 'internal' || s.typeId === 'external')
    return `${t.short} ${v.trip ?? ''} · إلى ${v.dropoff || '—'}`
  if (s.typeId === 'coverage') return `تغطية · ${v.eventName || v.location || '—'}`
  return `تدريب · ${v.org || '—'}`
}

/* ---------- clipboard ---------- */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
