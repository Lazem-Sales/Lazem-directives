export type TypeId = 'internal' | 'external' | 'coverage' | 'training'

export type FieldKind = 'text' | 'textarea' | 'date' | 'time' | 'tel' | 'num' | 'count' | 'hours' | 'city' | 'select' | 'segmented' | 'multi' | 'url'

/** Arabic counted noun forms: 1, 2 (dual), 3–10 (plural), 11+ */
export type Units = { one: string; two: string; few: string; many: string }

export interface Field {
  key: string
  label: string
  kind: FieldKind
  required?: boolean
  options?: string[]
  suggestions?: string[]
  placeholder?: string
  /** small helper text next to the label */
  hint?: string
  /** cleared when a saved directive is reused as a template */
  clearOnTemplate?: boolean
  /** latin / mixed content (links, English clinical notes) */
  dirAuto?: boolean
  wide?: boolean
  /** not blocking: when left empty the text says «يُحدَّد لاحقاً» and the app warns before copying */
  later?: boolean
  /** unit added to a count with correct Arabic agreement */
  units?: Units
  /** for map-link fields: key of the place-name field used to search the map */
  mapFor?: string
  /** multi-select: list each choice on its own line when more than one */
  listLines?: boolean
  /** only shown in the form when the predicate is true */
  when?: (v: Values) => boolean
}

export interface Section {
  title: string
  fields: Field[]
}

export interface DirectiveType {
  id: TypeId
  num: string
  title: string
  short: string
  sections: Section[]
  defaults: Values
}

export type Values = Record<string, string>

/** multi-select values are stored as one string joined with | */
export const MULTI_SEP = '|'
export const parseMulti = (s?: string) => (s ?? '').split(MULTI_SEP).map((x) => x.trim()).filter(Boolean)

export const SERVICES = ['عيادة', 'إسعاف', 'فرق راجلة']
export const ACCREDITATIONS = ['لازم للخدمات الطبية', 'American Safety & Health Institute (ASHI)', 'Highfield Qualifications']
export const LANGUAGES = ['العربية', 'الإنجليزية', 'الأردية']
export const TRAININGS = ['دورة توعية بالإسعافات الأولية', 'الإسعافات الأولية', 'السلامة من الحرائق', 'الصحة والسلامة المهنية']

const has = (v: Values, svc: string) => parseMulti(v.services).includes(svc)
const isAmbulance = (v: Values) => has(v, 'إسعاف')
const needsLevel = (v: Values) => has(v, 'إسعاف') || has(v, 'عيادة')

const crewKit = (moveLabel: string, arriveLabel?: string): Section[] => [
  {
    title: 'الفرقة والأوقات',
    fields: [
      { key: 'team', label: 'الفرقة', kind: 'text', wide: true, placeholder: 'أسماء أفراد الفرقة' },
      { key: 'tCenter', label: 'وقت التواجد في المركز', kind: 'time', clearOnTemplate: true },
      { key: 'tMove', label: moveLabel, kind: 'time', clearOnTemplate: true },
      ...(arriveLabel
        ? [{ key: 'tArrive', label: arriveLabel, kind: 'time' as const, clearOnTemplate: true }]
        : []),
    ],
  },
]

const kit = (ambulanceWhen?: (v: Values) => boolean): Section => ({
  title: 'التجهيز',
  fields: [
    { key: 'ambulanceNo', label: 'رقم الإسعاف', kind: 'text', when: ambulanceWhen },
    { key: 'equipment', label: 'الأجهزة', kind: 'text' },
    { key: 'bagNo', label: 'رقم الشنطة الإسعافية', kind: 'text' },
    { key: 'drugBagNo', label: 'رقم شنطة الأدوية', kind: 'text' },
  ],
})

const patient: Section = {
  title: 'بيانات المريض',
  fields: [
    { key: 'patientName', label: 'اسم المريض', kind: 'text', required: true, clearOnTemplate: true, wide: true },
    { key: 'patientId', label: 'رقم الهوية', kind: 'num', required: true, clearOnTemplate: true },
    { key: 'age', label: 'العمر', kind: 'num', required: true, clearOnTemplate: true, placeholder: 'بالسنوات' },
    { key: 'weight', label: 'الوزن التقريبي', kind: 'num', required: true, clearOnTemplate: true, placeholder: 'بالكيلوجرام' },
    {
      key: 'condition',
      label: 'الحالة الصحية',
      kind: 'textarea',
      required: true,
      clearOnTemplate: true,
      dirAuto: true,
      wide: true,
      placeholder: 'وصف الحالة كما سيُرسل للفرقة (عربي أو إنجليزي)',
    },
  ],
}

const route = (external: boolean): Section => ({
  title: 'المسار والتواصل',
  fields: [
    ...(external
      ? [{ key: 'flightTime', label: 'وقت وصول الطائرة', kind: 'time' as const, clearOnTemplate: true, placeholder: '' }]
      : []),
    {
      key: 'pickup',
      label: 'اسم موقع الاستلام',
      kind: 'text',
      required: true,
      clearOnTemplate: true,
      wide: true,
      placeholder: external ? 'مثال: مطار الدمام' : 'مثال: المنزل في حي عكاظ، الدور الأول',
    },
    { key: 'pickupLink', label: 'موقع الاستلام على الخريطة', kind: 'url', mapFor: 'pickup', clearOnTemplate: true, dirAuto: true, wide: true },
    {
      key: 'dropoff',
      label: 'اسم موقع التسليم',
      kind: 'text',
      required: true,
      clearOnTemplate: true,
      wide: true,
      placeholder: 'مثال: مدينة الملك فهد الطبية',
    },
    { key: 'dropoffLink', label: 'موقع التسليم على الخريطة', kind: 'url', mapFor: 'dropoff', clearOnTemplate: true, dirAuto: true, wide: true },
    { key: 'contact', label: 'رقم التواصل', kind: 'tel', required: true, clearOnTemplate: true },
  ],
})

const notes: Section = {
  title: 'ملاحظات خاصة',
  fields: [
    {
      key: 'notes',
      label: 'ملاحظات',
      kind: 'textarea',
      wide: true,
      clearOnTemplate: true,
      dirAuto: true,
      placeholder: 'تظهر في التوجيه فقط إذا كتبت فيها شيئاً',
    },
  ],
}

const transfer = (external: boolean): Section[] => [
  {
    title: 'نوع الرحلة والتاريخ',
    fields: [
      { key: 'trip', label: 'نوع الرحلة', kind: 'segmented', options: ['ذهاب', 'ذهاب وعودة'], required: true },
      { key: 'date', label: 'التاريخ', kind: 'date', required: true, clearOnTemplate: true },
    ],
  },
  ...crewKit('وقت التحرك إلى موقع المريض', 'وقت الوصول إلى موقع المريض'),
  kit(),
  patient,
  route(external),
  notes,
]

export const TYPES: DirectiveType[] = [
  {
    id: 'internal',
    num: '01',
    title: 'نقل إسعافي داخلي',
    short: 'رحلة داخلية',
    sections: transfer(false),
    defaults: { trip: 'ذهاب' },
  },
  {
    id: 'external',
    num: '02',
    title: 'نقل إسعافي خارجي',
    short: 'رحلة خارجية',
    sections: transfer(true),
    defaults: { trip: 'ذهاب' },
  },
  {
    id: 'coverage',
    num: '03',
    title: 'تغطية طبية',
    short: 'تغطية',
    defaults: {},
    sections: [
      {
        title: 'الفعالية والتاريخ',
        fields: [
          { key: 'eventName', label: 'اسم الفعالية', kind: 'text', wide: true },
          { key: 'date', label: 'التاريخ', kind: 'date', required: true, clearOnTemplate: true },
          {
            key: 'eventType',
            label: 'نوع الفعالية',
            kind: 'text',
            suggestions: ['تغطية فعالية', 'مباراة', 'مؤتمر', 'حفل', 'معرض', 'سباق'],
          },
          { key: 'eventFrom', label: 'بداية الفعالية', kind: 'time', later: true, hint: 'إن تُركت تُكتب «يُحدَّد لاحقاً»', clearOnTemplate: true },
          { key: 'eventTo', label: 'نهاية الفعالية', kind: 'time', later: true, hint: 'إن تُركت تُكتب «يُحدَّد لاحقاً»', clearOnTemplate: true },
        ],
      },
      {
        title: 'الخدمة',
        fields: [
          { key: 'services', label: 'نوع الخدمة', hint: 'يمكن اختيار أكثر من نوع', kind: 'multi', options: SERVICES, required: true, wide: true },
          { key: 'level', label: 'مستوى الخدمة', kind: 'segmented', options: ['ALS', 'BLS'], required: true, wide: true, when: needsLevel },
          { key: 'clinicCount', label: 'عدد العيادات', kind: 'count', required: true, placeholder: 'مثال: 1', when: (v) => has(v, 'عيادة') },
          { key: 'ambCount', label: 'عدد سيارات الإسعاف', kind: 'count', required: true, placeholder: 'مثال: 2', when: (v) => has(v, 'إسعاف') },
          { key: 'footCount', label: 'عدد المسعفين (الفرق الراجلة)', kind: 'count', required: true, placeholder: 'مثال: 4', when: (v) => has(v, 'فرق راجلة') },
          {
            key: 'required',
            label: 'المطلوب',
            kind: 'textarea',
            wide: true,
            placeholder: 'يُكتب تلقائياً من الخدمات وأعدادها. اكتب هنا فقط إذا أردت صياغة أخرى، كل بند في سطر',
          },
          { key: 'projectNo', label: 'رقم المشروع', kind: 'text' },
        ],
      },
      ...crewKit('وقت التحرك إلى موقع الفعالية'),
      kit(isAmbulance),
      {
        title: 'الموقع والمنظم',
        fields: [
          { key: 'location', label: 'اسم موقع الفعالية', kind: 'text', required: true, wide: true },
          { key: 'locationLink', label: 'موقع الفعالية على الخريطة', kind: 'url', mapFor: 'location', dirAuto: true, wide: true },
          { key: 'positions', label: 'نقاط التمركز', kind: 'textarea', wide: true, placeholder: 'تظهر فقط إذا كتبت فيها شيئاً' },
          { key: 'entry', label: 'مسار الدخول', kind: 'textarea', wide: true, placeholder: 'تظهر فقط إذا كتبت فيها شيئاً' },
          { key: 'organizer', label: 'اسم المنظم', kind: 'text', later: true, hint: 'إن تُرك يُكتب «يُحدَّد لاحقاً»' },
          { key: 'organizerPhone', label: 'رقم المنظم', kind: 'tel', later: true, hint: 'إن تُرك يُكتب «يُحدَّد لاحقاً»' },
        ],
      },
      notes,
    ],
  },
  {
    id: 'training',
    num: '04',
    title: 'تدريب',
    short: 'تدريب',
    defaults: {},
    sections: [
      {
        title: 'بيانات التدريب',
        fields: [
          { key: 'date', label: 'التاريخ', kind: 'date', required: true, clearOnTemplate: true },
          { key: 'start', label: 'وقت بدء التدريب', kind: 'time', required: true, clearOnTemplate: true },
          { key: 'city', label: 'المدينة', kind: 'city', required: true, placeholder: 'ابحث عن المدينة' },
          { key: 'org', label: 'اسم الجهة', kind: 'text', required: true },
          {
            key: 'trainingType',
            label: 'نوع التدريب',
            hint: 'يمكن اختيار أكثر من نوع',
            kind: 'multi',
            options: TRAININGS,
            required: true,
            wide: true,
          },
          {
            key: 'accreditation',
            label: 'جهة الاعتماد',
            hint: 'يمكن اختيار أكثر من جهة',
            kind: 'multi',
            options: ACCREDITATIONS,
            listLines: true,
            wide: true,
          },
          { key: 'language', label: 'لغة التدريب', hint: 'يمكن اختيار أكثر من لغة', kind: 'multi', options: LANGUAGES, wide: true },
          {
            key: 'duration',
            label: 'مدة التدريب بالساعات',
            kind: 'hours',
            placeholder: 'مثال: 7 أو 6-7',
            units: { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' },
          },
          {
            key: 'sessions',
            label: 'عدد الجلسات',
            kind: 'count',
            placeholder: 'مثال: 1',
            units: { one: 'جلسة واحدة', two: 'جلستان', few: 'جلسات', many: 'جلسة' },
          },
          {
            key: 'trainees',
            label: 'عدد المتدربين',
            kind: 'count',
            placeholder: 'مثال: 20',
            units: { one: 'متدرب واحد', two: 'متدربان', few: 'متدربين', many: 'متدرباً' },
          },
        ],
      },
      notes,
    ],
  },
]

export const typeById = (id: TypeId) => TYPES.find((t) => t.id === id)!

export const visibleFields = (t: DirectiveType, v: Values) =>
  t.sections.flatMap((s) => s.fields).filter((f) => !f.when || f.when(v))
