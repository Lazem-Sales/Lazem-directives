import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Search, Check, Circle, Copy, Eye, GraduationCap, History, ListChecks, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import iconAmbulance from './assets/icon-ambulance.png'
import iconBoth from './assets/icon-both.png'
import {
  buildText,
  check,
  copyText,
  fmtDate,
  historyTitle,
  loadHistory,
  LATER,
  MISS_CLOSE,
  MISS_OPEN,
  pushHistory,
  storeHistory,
  templateValues,
  type Saved,
} from './lib'
import { MULTI_SEP, parseMulti, TYPES, typeById, visibleFields, type Field, type TypeId, type Values } from './schema'
import { CountUp, EASE, Logo3D, PulseLine, TiltCard } from './ui'
import { searchCities } from './cities'
import { MapField } from './MapField'

const TYPE_HINT: Record<TypeId, string> = {
  internal: 'ذهاب أو ذهاب وعودة داخل المدينة',
  external: 'نقل بين المدن، ذهاب أو ذهاب وعودة',
  coverage: 'عيادة، إسعاف، فرق راجلة',
  training: 'دورة تدريبية لجهة خارجية',
}

// icon-both.png = ambulance truck, icon-ambulance.png = paramedic beside an ambulance (file names as received)
function TypeIcon({ id }: { id: TypeId }) {
  if (id === 'internal') return <img src={iconBoth} alt="" />
  if (id === 'external') return <img src={iconBoth} alt="" style={{ transform: 'scaleX(-1)' }} />
  if (id === 'coverage') return <img src={iconAmbulance} alt="" style={{ height: 27 }} />
  return <GraduationCap className="w-[20px] h-[20px]" strokeWidth={1.7} />
}

const initialValues = (): Record<TypeId, Values> =>
  Object.fromEntries(TYPES.map((t) => [t.id, { ...t.defaults }])) as Record<TypeId, Values>

/* ------------------------------------------------------------------ */

/** "24.51, 46.67" → Google Maps link; anything else unchanged */
const coordsToLink = (s: string) => {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
  return m ? `https://maps.google.com/?q=${m[1]},${m[2]}` : s
}

function CityInput({ id, value, onChange, cls, placeholder }: { id: string; value: string; onChange: (v: string) => void; cls: string; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchCities(value), [value])
  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
  }
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (!open || !results.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % results.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + results.length) % results.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(results[active].name)
          } else if (e.key === 'Escape') setOpen(false)
        }}
        className={`${cls} has-icon`}
      />
      <Search className="absolute top-[23px] -translate-y-1/2 start-3.5 w-4 h-4 text-faint pointer-events-none" />
      {open && results.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="panel absolute z-20 inset-x-0 top-full mt-1.5 list-none m-0 p-1.5 max-h-[264px] overflow-auto scroll-y !rounded-2xl"
        >
          {results.map((c, i) => (
            <li
              key={c.name + c.region}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c.name)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer text-[14.5px] ${
                i === active ? 'bg-mint/15 text-white' : 'text-ink'
              }`}
            >
              <span>{c.name}</span>
              <span className="text-[11.5px] text-faint">{c.region}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FieldInput({
  f,
  value,
  onChange,
  invalid,
  warned,
  placeName,
  onPlaceName,
  notify,
}: {
  f: Field
  value: string
  onChange: (v: string) => void
  invalid: boolean
  warned: boolean
  placeName?: string
  onPlaceName?: (name: string) => void
  notify: (msg: string) => void
}) {
  const state = invalid ? 'invalid' : warned ? 'warned' : ''
  const id = `f-${f.key}`
  const listId = f.suggestions ? `${id}-list` : undefined

  let control: React.ReactNode
  if (f.kind === 'url' && f.mapFor) {
    control = (
      <MapField id={id} value={value} onChange={onChange} placeName={placeName ?? ''} onPlaceName={onPlaceName ?? (() => {})} invalid={invalid} notify={notify} />
    )
  } else if (f.kind === 'city') {
    control = <CityInput id={id} value={value} onChange={onChange} cls={`field ${state}`} placeholder={f.placeholder} />
  } else if (f.kind === 'multi') {
    const picked = parseMulti(value)
    const toggle = (o: string) => {
      const next = picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]
      onChange(f.options!.filter((x) => next.includes(x)).join(MULTI_SEP))
    }
    control = (
      <div id={id} tabIndex={-1} className={`flex flex-wrap gap-2 rounded-2xl outline-none ${invalid ? 'ring-1 ring-red/60 p-1.5' : ''}`}>
        {f.options!.map((o) => {
          const on = picked.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)} className={`chip ${on ? 'on' : ''}`}>
              <span
                className={`w-4 h-4 rounded-[5px] flex items-center justify-center border ${on ? 'bg-bg border-bg text-mint' : 'border-white/30'}`}
              >
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
              {o}
            </button>
          )
        })}
      </div>
    )
  } else if (f.kind === 'segmented' || f.kind === 'select') {
    control = (
      <div
        id={id}
        tabIndex={-1}
        className={`flex flex-wrap gap-2 rounded-2xl outline-none ${invalid ? 'ring-1 ring-red/60 p-1.5' : ''}`}
      >
        {f.options!.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)} className={`chip ${value === o ? 'on' : ''}`}>
            {value === o && <Check className="w-3.5 h-3.5" strokeWidth={2.4} />}
            {o}
          </button>
        ))}
      </div>
    )
  } else if (f.kind === 'textarea') {
    control = (
      <textarea
        id={id}
        rows={f.key === 'condition' ? 4 : 3}
        dir={f.dirAuto ? 'auto' : undefined}
        value={value}
        placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`field ${state} resize-y leading-7`}
      />
    )
  } else {
    const type = f.kind === 'date' ? 'date' : f.kind === 'time' ? 'time' : f.kind === 'tel' ? 'tel' : f.kind === 'url' ? 'url' : 'text'
    const ltr = ['date', 'time', 'tel', 'url', 'num', 'count', 'hours'].includes(f.kind)
    control = (
      <>
        <input
          id={id}
          type={type}
          inputMode={f.kind === 'num' || f.kind === 'tel' || f.kind === 'count' ? 'numeric' : f.kind === 'hours' ? 'decimal' : undefined}
          dir={ltr ? 'ltr' : f.dirAuto ? 'auto' : undefined}
          value={value}
          list={listId}
          placeholder={f.placeholder ?? (f.kind === 'url' ? 'https://maps.app.goo.gl/…' : f.kind === 'tel' ? '05XXXXXXXX' : undefined)}
          onChange={(e) => {
            const raw = e.target.value
            if (f.kind === 'count') return onChange(raw.replace(/[^0-9٠-٩]/g, '').slice(0, 3))
            if (f.kind === 'hours') return onChange(raw.replace(/[^0-9٠-٩.\-–]/g, '').slice(0, 7))
            if (f.kind === 'url') return onChange(coordsToLink(raw))
            onChange(raw)
          }}
          className={`field ${state} ${ltr ? 'text-right' : ''} ${['num', 'tel', 'count', 'hours'].includes(f.kind) ? 'font-mono text-[14px]' : ''}`}
        />
        {f.suggestions && (
          <datalist id={listId}>
            {f.suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    )
  }

  const Wrapper = ['multi', 'segmented', 'select'].includes(f.kind) || (f.kind === 'url' && f.mapFor) ? 'div' : 'label'
  return (
    <Wrapper className={`block ${f.wide ? 'sm:col-span-2' : ''}`}>
      <span className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[12.5px] font-medium text-dim">
        {f.label}
        {f.required && <span className="w-1.5 h-1.5 rounded-full bg-mint" aria-label="إلزامي" />}
        {f.hint && <span className="text-[11.5px] text-faint font-normal">· {f.hint}</span>}
        {invalid && <span className="text-[11px] text-[#FF8FA6]">مطلوب</span>}
      </span>
      {control}
    </Wrapper>
  )
}

/* ------------------------------------------------------------------ */

const markLater = (s: string) =>
  s.split(LATER).flatMap((x, i) => (i === 0 ? [x] : [<span key={i} className="text-amber">{LATER}</span>, x]))

function PreviewText({ text }: { text: string }) {
  return (
    <div className="text-[14px] leading-7 text-ink">
      {text.split('\n').map((ln, i) =>
        ln.trim() === '' ? (
          <div key={i} className="h-3" />
        ) : (
          <div key={i} className="preview-line break-words">
            {ln.split(MISS_OPEN).map((part, j) => {
              if (j === 0) return <span key={j}>{markLater(part)}</span>
              const [label, rest] = part.split(MISS_CLOSE)
              return (
                <span key={j}>
                  <span className="miss">{label} ناقص</span>
                  {markLater(rest ?? '')}
                </span>
              )
            })}
          </div>
        ),
      )}
    </div>
  )
}

function EcgBand({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 660 60" preserveAspectRatio="none" className={`w-full h-full ${className}`} aria-hidden="true">
      <path className="ecg-red" d="M0 34 H150 l14 -18 l16 36 l14 -30 l10 12 H330 l14 -18 l16 36 l14 -30 l10 12 H520 l14 -18 l16 36 l14 -30 l10 12 H660" opacity=".85" />
    </svg>
  )
}

function SectionHead({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 mb-[18px] rise" style={{ animationDelay: '.25s' }}>
      <h2 className="m-0 text-[19px] font-semibold text-ink">{title}</h2>
      <div className="flex items-center gap-3">
        {note && <span className="text-[12.5px] text-faint">{note}</span>}
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/* The form in progress is kept for this browser tab, so leaving the page (to another app or the map) loses nothing. */
const DRAFT_KEY = 'lazem-directives-draft-v1'
function loadDraft(): { typeId: TypeId; all: Record<TypeId, Values> } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || !TYPES.some((t) => t.id === d.typeId) || typeof d.all !== 'object') return null
    const base = initialValues()
    for (const t of TYPES) {
      const v = d.all[t.id]
      if (v && typeof v === 'object' && !Array.isArray(v))
        base[t.id] = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Values
    }
    return { typeId: d.typeId, all: base }
  } catch {
    return null
  }
}

export default function App() {
  const [typeId, setTypeId] = useState<TypeId>(() => loadDraft()?.typeId ?? 'internal')
  const [all, setAll] = useState<Record<TypeId, Values>>(() => loadDraft()?.all ?? initialValues())
  const [showErrors, setShowErrors] = useState(false)
  const [history, setHistory] = useState<Saved[]>(() => loadHistory())
  const [viewing, setViewing] = useState<Saved | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const t = typeById(typeId)
  const values = all[typeId]
  const text = useMemo(() => buildText(typeId, values), [typeId, values])
  const result = useMemo(() => check(typeId, values), [typeId, values])
  const ready = result.missing.length === 0
  const missingKeys = new Set(result.missing.map((m) => m.key))
  const warnKeys = new Set(result.warnings.map((w) => w.key))
  const requiredFields = visibleFields(t, values).filter((f) => f.required)

  // phones: hide the bottom bar while typing (keyboard open) and while the preview is on screen
  const [typing, setTyping] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    const onIn = (e: FocusEvent) => isField(e.target) && setTyping(true)
    const onOut = (e: FocusEvent) => isField(e.target) && setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    const io = new IntersectionObserver(([en]) => setPreviewVisible(en.isIntersecting), { threshold: 0.05 })
    if (previewRef.current) io.observe(previewRef.current)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      io.disconnect()
    }
  }, [])
  const showBar = !typing && (!previewVisible || !!toast)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ typeId, all }))
      } catch {
        /* storage unavailable: nothing to keep */
      }
    }, 250)
    return () => clearTimeout(id)
  }, [typeId, all])

  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setViewing(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing])

  const setField = (key: string, v: string) => {
    setAll((a) => ({ ...a, [typeId]: { ...a[typeId], [key]: v } }))
    setCopied(false)
    setConfirmPending(false)
  }

  const switchType = (id: TypeId) => {
    setConfirmPending(false)
    setTypeId(id)
    setShowErrors(false)
    setCopied(false)
    setConfirmClear(false)
  }

  const focusField = (key: string) => {
    const el = document.getElementById(`f-${key}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => (el as HTMLElement | null)?.focus({ preventScroll: true }), 350)
  }

  const onCopy = async () => {
    if (!ready) {
      setShowErrors(true)
      focusField(result.missing[0].key)
      setToast(`لا يمكن النسخ: ${result.missing.length} ${result.missing.length === 1 ? 'حقل إلزامي فارغ' : 'حقول إلزامية فارغة'}`)
      return
    }
    if (result.pending.length && !confirmPending) {
      setConfirmPending(true)
      return
    }
    const ok = await copyText(text)
    if (!ok) {
      setToast('تعذّر النسخ التلقائي في هذا المتصفح. حدّد النص من المعاينة وانسخه يدوياً.')
      return
    }
    setConfirmPending(false)
    setCopied(true)
    const next = pushHistory(history, { typeId, values, text })
    setHistory(next)
    const stored = storeHistory(next)
    setToast(stored ? 'تم النسخ. الصقه في محادثة الفريق على Teams.' : 'تم النسخ، لكن تعذّر الحفظ في سجل هذا المتصفح.')
  }

  const clearForm = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3500)
      return
    }
    setAll((a) => ({ ...a, [typeId]: { ...t.defaults } }))
    setShowErrors(false)
    setCopied(false)
    setConfirmClear(false)
  }

  const applyTemplate = (s: Saved) => {
    setAll((a) => ({ ...a, [s.typeId]: templateValues(s) }))
    setTypeId(s.typeId)
    setShowErrors(false)
    setCopied(false)
    setViewing(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setToast(
      s.typeId === 'internal' || s.typeId === 'external'
        ? 'تم تحميل القالب. بيانات المريض والمواقع والتاريخ والأوقات فارغة.'
        : 'تم تحميل القالب. التاريخ والأوقات فارغة.',
    )
  }

  const removeEntry = (id: string) => {
    const next = history.filter((h) => h.id !== id)
    setHistory(next)
    storeHistory(next)
  }

  const wipeHistory = () => {
    if (!confirmWipe) {
      setConfirmWipe(true)
      setTimeout(() => setConfirmWipe(false), 3500)
      return
    }
    setHistory([])
    storeHistory([])
    setConfirmWipe(false)
  }

  const copyViewing = async () => {
    if (!viewing) return
    const ok = await copyText(viewing.text)
    setToast(ok ? 'تم نسخ التوجيه المحفوظ.' : 'تعذّر النسخ التلقائي. حدّد النص وانسخه يدوياً.')
  }

  const fmtSaved = (ms: number) =>
    new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(ms)

  let sectionNo = 0

  return (
    <>
      <div className="bg-photo" />
      <div className="bg-wash" />
      <div className="bg-grid" />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-7 pt-9 sm:pt-16 pb-28 lg:pb-24">
        {/* ---------------- HEADER ---------------- */}
        <header className="rise flex items-end justify-between gap-7 sm:gap-9 flex-wrap">
          <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-[30px] min-w-0">
            <div className="flex items-center gap-5 sm:block px-3 sm:px-0">
              <Logo3D />
              <div className="sm:hidden">
                <p className="eyebrow m-0">
                  <span className="live-dot" />
                  لازم للخدمات الطبية
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <div className="hidden sm:block mb-3.5">
                <p className="eyebrow m-0">
                  <span className="live-dot" />
                  لازم للخدمات الطبية
                </p>
              </div>
              <h1 className="title-grad m-0 whitespace-nowrap text-[clamp(26px,8.6vw,34px)] sm:text-[clamp(38px,6vw,64px)]">التوجيهات التشغيلية</h1>
              <ul className="tagline">
                <li>نقل إسعافي</li>
                <li>تغطيات</li>
                <li>تدريب</li>
              </ul>
            </div>
          </div>
          <div className="stat">
            <b>
              <CountUp to={history.length} />
            </b>
            <span>عدد التوجيهات</span>
          </div>
        </header>

        <div className="my-9 sm:my-11">
          <PulseLine />
        </div>

        {/* ---------------- TYPE PICKER ---------------- */}
        <div ref={formRef} className="scroll-mt-4" />
        <SectionHead title="نوع التوجيه" note="اختر النوع، ثم املأ الحقول وانسخ النص" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-[18px]" style={{ perspective: 1500 }}>
          {TYPES.map((x, i) => {
            const on = x.id === typeId
            return (
              <TiltCard
                key={x.id}
                as="button"
                selected={on}
                delay={0.2 + i * 0.07}
                onClick={() => switchType(x.id)}
                label={x.title}
                className="text-right p-4 sm:p-[22px] flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-4 sm:mb-5">
                  <span className="tile-icon">
                    <TypeIcon id={x.id} />
                  </span>
                  <span className="code">{x.num}</span>
                </div>
                <div className="text-[15.5px] sm:text-[17.5px] font-semibold text-white leading-snug">{x.title}</div>
                <div className="mt-1 text-[12px] sm:text-[12.5px] text-dim leading-5">{TYPE_HINT[x.id]}</div>
                <div className="mt-auto pt-4 flex items-center justify-between">
                  {on ? (
                    <span className="badge badge-active">
                      <span className="badge-dot" />
                      محدد
                    </span>
                  ) : (
                    <span className="text-[12px] text-faint">اختيار</span>
                  )}
                  <span className="card-go" style={on ? { background: 'var(--mint)', color: 'var(--bg)' } : undefined}>
                    <ArrowLeft className="w-[15px] h-[15px]" />
                  </span>
                </div>
              </TiltCard>
            )
          })}
        </div>

        {/* ---------------- FORM + PREVIEW ---------------- */}
        <div className="mt-[18px] grid grid-cols-1 lg:grid-cols-12 gap-[18px] items-start">
          <div className="lg:col-span-7 space-y-[18px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={typeId}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                transition={{ duration: 0.4, ease: EASE }}
                className="space-y-[18px]"
              >
                {t.sections.map((s) => {
                  const fields = s.fields.filter((f) => !f.when || f.when(values))
                  if (!fields.length) return null
                  sectionNo += 1
                  return (
                    <section key={s.title} className="glass p-[18px] sm:p-[22px]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="m-0 text-[16px] sm:text-[17px] font-semibold text-white">{s.title}</h3>
                        <span className="code">{String(sectionNo).padStart(2, '0')}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                        {fields.map((f) => (
                          <FieldInput
                            key={f.key}
                            f={f}
                            value={values[f.key] ?? ''}
                            onChange={(v) => setField(f.key, v)}
                            invalid={showErrors && missingKeys.has(f.key)}
                            warned={warnKeys.has(f.key)}
                            placeName={f.mapFor ? values[f.mapFor] : undefined}
                            onPlaceName={f.mapFor ? (n: string) => setField(f.mapFor!, n) : undefined}
                            notify={setToast}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <span className="inline-flex items-center gap-2 text-[12px] text-faint">
                <span className="w-1.5 h-1.5 rounded-full bg-mint" /> حقل إلزامي. الحقول الأخرى تظهر فارغة في النص ليعبّئها فريق آخر.
              </span>
              <button type="button" onClick={clearForm} className={`btn-ghost ${confirmClear ? 'danger' : ''}`}>
                <RotateCcw className="w-3.5 h-3.5" />
                {confirmClear ? 'اضغط مرة أخرى للتأكيد' : 'تفريغ النموذج'}
              </button>
            </div>
          </div>

          {/* preview */}
          <div ref={previewRef} className="lg:col-span-5 scroll-mt-4 space-y-[18px]">
            <div className="panel overflow-hidden">
              <div className="relative h-[86px] bg-[#0A242C] overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_420px_160px_at_85%_0%,rgba(143,224,207,.22),transparent_70%)]" />
                <div className="absolute inset-x-0 top-1 h-[60px]">
                  <EcgBand />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-[#113742]" />
                <div className="absolute inset-x-[18px] bottom-2.5 flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-white">المعاينة الحيّة</span>
                  {ready ? (
                    <span className="badge badge-active">
                      <span className="badge-dot" />
                      جاهز للنسخ
                    </span>
                  ) : (
                    <span className={`badge ${showErrors ? 'badge-expired' : 'badge-soon'}`}>
                      <span className="badge-dot" />
                      ناقص {result.missing.length} {result.missing.length === 1 ? 'حقل' : 'حقول'}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-[18px] sm:p-[22px] pt-3 sm:pt-3">
                <div className="preview-box p-4 sm:p-5 select-text">
                  <PreviewText text={text} />
                </div>

                {ready && result.pending.length > 0 && (
                  <div className={`note-box mt-3 flex-col !gap-2 ${confirmPending ? '!border-amber/70 !bg-amber/[.14]' : ''}`}>
                    <div className="flex items-start gap-2 font-semibold">
                      <AlertTriangle className="w-4 h-4 mt-1 shrink-0" />
                      <span>
                        {confirmPending ? 'تنبيه قبل النسخ: ' : ''}
                        ستُكتب «يُحدَّد لاحقاً» في: {result.pending.map((p) => p.label).join('، ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.pending.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => focusField(p.key)}
                          className="rounded-full border px-2.5 py-0.5 text-[12px] hover:bg-white/5"
                          style={{ borderColor: 'currentColor' }}
                        >
                          تعبئة {p.label}
                        </button>
                      ))}
                    </div>
                    {confirmPending && (
                      <div className="text-[12.5px] text-amber/90 font-normal">
                        اضغط «نسخ على أي حال» للمتابعة، أو عبّئ الحقول الآن.
                      </div>
                    )}
                  </div>
                )}

                {result.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1.5 list-none p-0">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2 text-[12px] leading-5 text-amber">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{w.text}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <button type="button" onClick={onCopy} className={`btn btn-primary w-full sm:w-auto ${ready ? '' : 'blocked'}`}>
                    <span>{copied ? 'تم النسخ' : confirmPending ? 'نسخ على أي حال' : 'نسخ التوجيه'}</span>
                    <span className="go">{copied ? <Check className="w-4 h-4" strokeWidth={2.4} /> : <Copy className="w-4 h-4" />}</span>
                  </button>
                  <span className="text-[11.5px] text-faint leading-5">
                    يُحفظ عند النسخ ضمن آخر 10 توجيهات
                    <br className="hidden sm:block" /> على هذا المتصفح فقط.
                  </span>
                </div>
              </div>
            </div>

            <div className="glass p-[18px] sm:p-[22px]">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="m-0 text-[16px] font-semibold text-white flex items-center gap-2">
                  <ListChecks className="w-[18px] h-[18px] text-mint" /> الحقول الإلزامية
                </h3>
                <span className="code">
                  {requiredFields.length - result.missing.length}/{requiredFields.length}
                </span>
              </div>
              <ul className="list-none p-0 m-0 grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">
                {requiredFields.map((f) => {
                  const miss = missingKeys.has(f.key)
                  return (
                    <li key={f.key}>
                      <button
                        type="button"
                        onClick={() => focusField(f.key)}
                        className={`w-full h-full flex items-center gap-2 rounded-xl px-2.5 sm:px-3 py-2 text-[12.5px] sm:text-[13px] leading-5 text-right transition-colors border ${
                          miss
                            ? showErrors
                              ? 'border-red/40 bg-red/10 text-[#FF8FA6]'
                              : 'border-white/10 bg-white/[.03] text-dim hover:border-mint/40'
                            : 'border-mint/20 bg-mint/[.07] text-ink'
                        }`}
                      >
                        {miss ? (
                          <Circle className="w-4 h-4 shrink-0 opacity-70" strokeWidth={1.8} />
                        ) : (
                          <span className="w-4 h-4 shrink-0 rounded-full bg-mint text-bg flex items-center justify-center">
                            <Check className="w-3 h-3" strokeWidth={3} />
                          </span>
                        )}
                        {f.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3.5 mb-0 text-[12px] text-faint leading-5">
                لا يُنسخ التوجيه حتى تكتمل كلها. بقية الحقول اختيارية وتظهر فارغة في النص ليعبّئها فريق آخر.
              </p>
            </div>
          </div>
        </div>

        {/* ---------------- HISTORY ---------------- */}
        <section id="history" className="mt-14 sm:mt-20 scroll-mt-4">
          <SectionHead title="آخر التوجيهات" note={`${history.length} من 10`}>
            {history.length > 0 && (
              <button type="button" onClick={wipeHistory} className={`btn-ghost ${confirmWipe ? 'danger' : ''}`}>
                <Trash2 className="w-3.5 h-3.5" />
                {confirmWipe ? 'اضغط مرة أخرى للتأكيد' : 'مسح السجل'}
              </button>
            )}
          </SectionHead>

          {history.length === 0 ? (
            <div className="glass p-8 text-center text-[13.5px] text-faint">
              <span className="tile-icon mx-auto mb-3">
                <History className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </span>
              لا توجد توجيهات محفوظة بعد. كل توجيه تنسخه يُحفظ هنا تلقائياً.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]" style={{ perspective: 1500 }}>
              {history.map((h, i) => {
                const ht = typeById(h.typeId)
                return (
                  <TiltCard key={h.id} delay={0.1 + Math.min(i, 8) * 0.07} className="p-[18px] sm:p-[22px] flex flex-col cursor-default">
                    <div className="flex items-start gap-3.5">
                      <span className="tile-icon">
                        <TypeIcon id={h.typeId} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15.5px] font-semibold text-white leading-6 line-clamp-2">{historyTitle(h)}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="code">{ht.num}</span>
                          {h.values.date && <span className="code">{fmtDate(h.values.date).replace('‎', '')}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeEntry(h.id)} title="حذف من السجل" className="text-faint hover:text-[#FF8FA6] p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-3.5">
                      <span className="badge badge-active">
                        <span className="badge-dot" />
                        نُسخ {fmtSaved(h.savedAt)}
                      </span>
                    </div>
                    <div className="mt-auto pt-5 flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="btn-ghost" onClick={() => setViewing(h)}>
                        <Eye className="w-3.5 h-3.5" /> عرض كامل
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate(h)}
                        className="group inline-flex items-center gap-2 text-[13px] font-semibold text-mint"
                      >
                        استخدام كقالب
                        <span className="card-go group-hover:!bg-mint group-hover:!text-bg">
                          <ArrowLeft className="w-[15px] h-[15px]" />
                        </span>
                      </button>
                    </div>
                  </TiltCard>
                )
              })}
            </div>
          )}
        </section>

        <footer className="mt-14 pt-[22px] border-t border-white/10 flex justify-between gap-4 flex-wrap text-[12.5px] text-faint">
          <div className="flex flex-col gap-2">
            <span>لازم للخدمات الطبية · Lazem Medical Services</span>
            <div dir="ltr" className="flex justify-end">
              <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-2xl sm:rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 font-mono text-[10.5px] tracking-[.03em] text-faint">
                <span className="w-1.5 h-1.5 rounded-full bg-mint/80 shadow-[0_0_8px_rgba(143,224,207,.8)]" />
                <span className="text-dim">
                  Lazem Medical Services<sup className="text-mint text-[8px] ms-px">®</sup>
                </span>
                <span className="text-mint/40">|</span>
                <span>
                  By <span className="text-mint font-semibold">Yosif Khubrani</span>
                </span>
                <span className="text-faint/80">— Sales Department</span>
              </span>
            </div>
          </div>
          <span className="inline-flex items-start gap-2 max-w-xl leading-6">
            <ShieldCheck className="w-4 h-4 mt-1 shrink-0 text-mint/60" />
            يعمل محلياً بالكامل ولا يرسل أي بيانات. السجل في هذا المتصفح وحده ويتضمن بيانات المرضى كما أُدخلت؛ احذف ما لم تعد تحتاجه.
          </span>
        </footer>
      </div>

      {/* ---------------- MOBILE STATUS BAR (also shows messages on phones) ---------------- */}
      <div className={`lg:hidden fixed bottom-0 inset-x-0 z-30 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] bg-gradient-to-t from-bg via-bg/95 to-transparent transition-all duration-300 ${showBar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'}`}>
        <div className="mx-auto max-w-md flex items-center justify-between gap-3 rounded-[22px] bg-[#0B262E] border border-mint/25 ps-4 pe-1.5 py-1.5 shadow-2xl min-h-[52px]">
          <AnimatePresence mode="wait" initial={false}>
            {toast ? (
              <motion.span
                key="toast"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex-1 min-w-0 inline-flex items-start gap-2 text-[12.5px] leading-5 text-mint py-1"
              >
                <span className="live-dot mt-1.5" />
                <span className="min-w-0">{toast}</span>
              </motion.span>
            ) : (
              <motion.span
                key="status"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={`flex-1 min-w-0 inline-flex items-center gap-2 text-[12.5px] font-medium ${ready ? 'text-mint' : 'text-amber'}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${ready ? 'bg-mint' : 'bg-amber'}`} />
                {ready ? 'التوجيه مكتمل' : `ناقص ${result.missing.length} ${result.missing.length === 1 ? 'حقل' : 'حقول'}`}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="shrink-0 rounded-full bg-mint text-bg text-[12.5px] font-bold px-4 py-2.5"
          >
            إلى المعاينة
          </button>
        </div>
      </div>

      {/* ---------------- VIEW SAVED ---------------- */}
      <AnimatePresence>
        {viewing && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-[22px] bg-[rgba(3,14,18,.72)] backdrop-blur-[10px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewing(null)}
            style={{ perspective: 1600 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className="panel w-full max-w-[620px] max-h-[90vh] flex flex-col overflow-hidden"
              initial={{ opacity: 0, y: 40, rotateX: 16, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.6, ease: EASE }}
              style={{ transformOrigin: '50% 0%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative h-[110px] shrink-0 bg-[#0A242C] overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_420px_180px_at_15%_0%,rgba(143,224,207,.22),transparent_70%)]" />
                <div className="absolute inset-x-0 top-3 h-[60px]">
                  <EcgBand />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[#113742]" />
                <button type="button" onClick={() => setViewing(null)} className="close-btn absolute top-4 end-4" aria-label="إغلاق">
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute inset-x-[22px] bottom-2.5 flex items-center gap-2">
                  <span className="badge badge-active">
                    <span className="badge-dot" />
                    مرجع محفوظ · {fmtSaved(viewing.savedAt)}
                  </span>
                </div>
              </div>
              <div className="px-[18px] sm:px-7 pb-6 pt-2 flex flex-col min-h-0">
                <div className="flex items-center gap-3.5 mb-4">
                  <span className="tile-icon">
                    <TypeIcon id={viewing.typeId} />
                  </span>
                  <div className="text-[19px] font-bold text-white leading-7">{historyTitle(viewing)}</div>
                </div>
                <div className="preview-box p-4 sm:p-5 overflow-auto scroll-y min-h-0">
                  <PreviewText text={viewing.text} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 justify-between">
                  <button type="button" className="btn-ghost" onClick={copyViewing}>
                    <Copy className="w-3.5 h-3.5" /> نسخ هذا النص
                  </button>
                  <button type="button" onClick={() => applyTemplate(viewing)} className="btn btn-primary !text-[14px]">
                    <span>استخدام كقالب</span>
                    <span className="go !w-8 !h-8">
                      <ArrowLeft className="w-4 h-4" />
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- TOAST ---------------- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="hidden lg:flex fixed z-[60] bottom-7 inset-x-0 justify-center px-4 pointer-events-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <div className="eyebrow !bg-[#0B262E]/95 backdrop-blur-md shadow-2xl !leading-6 max-w-md text-center">
              <span className="live-dot" />
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
