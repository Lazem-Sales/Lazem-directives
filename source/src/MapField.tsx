import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ClipboardPaste, Crosshair, Layers, Link2, Loader2, Maximize2, MapPin, Minimize2, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface LatLng {
  lat: number
  lng: number
}

interface Place {
  name: string
  address: string
  lat: number
  lng: number
}

/** Read coordinates out of a maps link (q=lat,lng · @lat,lng · ll=lat,lng). */
export function parseLatLng(link: string): LatLng | null {
  const m =
    /[?&](?:q|query|ll)=(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(link) || /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(link)
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null
}

/** "24.51, 46.67" (Latin or Arabic digits) → LatLng */
export function parseCoords(s: string): LatLng | null {
  const t = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(t)
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null
}

export const linkFor = (p: LatLng) => `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

const RIYADH: LatLng = { lat: 24.7136, lng: 46.6753 }
const SA_BBOX = '34.4,16.3,55.7,32.2' // minLon,minLat,maxLon,maxLat

const TILES = {
  map: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', subdomains: 'abc' },
} as const

const pinIcon = L.divIcon({
  className: 'lz-pin',
  html: '<span class="lz-pin-dot"></span><span class="lz-pin-ring"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/* ---------- search: Photon (type-ahead), Nominatim as fallback ---------- */
async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  try {
    const r = await fetch(`https://photon.komoot.io/api/?limit=7&bbox=${SA_BBOX}&q=${encodeURIComponent(q)}`, { signal })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as {
      features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[]
    }
    return d.features.map((f) => {
      const p = f.properties
      const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.state || '—'
      const address = [p.street && p.name ? p.street : '', p.district, p.city, p.state].filter((x) => x && x !== name).join('، ')
      return { name, address, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=sa&accept-language=ar&q=${encodeURIComponent(q)}`,
      { signal },
    )
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { display_name: string; name?: string; lat: string; lon: string }[]
    return d.map((x) => {
      const parts = x.display_name.split(/[،,]\s*/)
      return { name: x.name || parts[0], address: parts.slice(1, 4).join('، '), lat: parseFloat(x.lat), lng: parseFloat(x.lon) }
    })
  }
}

/**
 * Inline map field (Google-Maps-like): a search bar with suggestions as you type, tap to drop the pin,
 * drag to adjust, satellite view, my location, full screen. The value is a Google Maps link.
 */
export function MapField({
  id,
  value,
  onChange,
  placeName,
  onPlaceName,
  invalid,
  notify,
}: {
  id: string
  value: string
  onChange: (link: string) => void
  placeName: string
  onPlaceName: (name: string) => void
  invalid?: boolean
  notify: (msg: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const layerRef = useRef<L.TileLayer | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [ready, setReady] = useState(false)
  const [full, setFull] = useState(false)
  const [layer, setLayer] = useState<'map' | 'sat'>('map')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const [locating, setLocating] = useState(false)

  const point = useMemo(() => parseLatLng(value), [value])
  const otherLink = !point && /^https?:\/\//i.test(value.trim()) ? value.trim() : ''

  // build the map only once it scrolls into view
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setReady(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!ready || !boxRef.current) return
    const start = point ?? RIYADH
    const map = L.map(boxRef.current, {
      zoomControl: false,
      dragging: !isTouch, // on phones one finger scrolls the page; open full screen to pan
      tapTolerance: 12,
    }).setView([start.lat, start.lng], point ? 16 : 10)
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    map.attributionControl.setPrefix(false)
    map.on('click', (e: L.LeafletMouseEvent) => {
      onChange(linkFor({ lat: e.latlng.lat, lng: e.latlng.lng }))
      setOpen(false)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // tiles
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layerRef.current?.remove()
    const t = TILES[layer]
    let loaded = false
    let errors = 0
    const tl = L.tileLayer(t.url, { attribution: t.attribution, subdomains: t.subdomains, maxZoom: 19 })
    tl.on('tileload', () => {
      loaded = true
      setTilesFailed(false)
    })
    tl.on('tileerror', () => (errors += 1))
    tl.addTo(map)
    layerRef.current = tl
    const timer = setTimeout(() => !loaded && errors > 0 && setTilesFailed(true), 4000)
    return () => clearTimeout(timer)
  }, [layer, ready])

  // pin follows the value
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!point) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([point.lat, point.lng], { icon: pinIcon, draggable: true }).addTo(map)
      markerRef.current.on('dragend', () => {
        const ll = markerRef.current!.getLatLng()
        onChange(linkFor({ lat: ll.lat, lng: ll.lng }))
      })
    } else markerRef.current.setLatLng([point.lat, point.lng])
    if (!map.getBounds().pad(-0.1).contains([point.lat, point.lng])) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng, ready])

  // full screen: pan with one finger, lock the page behind
  useEffect(() => {
    const map = mapRef.current
    if (map) {
      if (full || !isTouch) map.dragging.enable()
      else map.dragging.disable()
      setTimeout(() => map.invalidateSize(), 60)
    }
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  // type-ahead search
  useEffect(() => {
    const text = q.trim()
    if (text.length < 2 || parseCoords(text) || /^https?:\/\//i.test(text)) {
      setResults([])
      setSearching(false)
      return
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setSearching(true)
      setSearchErr(false)
      try {
        const list = await searchPlaces(text, ac.signal)
        setResults(list)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setResults([])
          setSearchErr(true)
        }
      } finally {
        if (abortRef.current === ac) setSearching(false)
      }
    }, 380)
    return () => clearTimeout(t)
  }, [q])

  const pick = (p: Place) => {
    onChange(linkFor(p))
    if (!placeName.trim()) onPlaceName(p.name)
    setQ(p.name)
    setOpen(false)
    mapRef.current?.flyTo([p.lat, p.lng], 16, { duration: 0.7 })
  }

  const applyTyped = () => {
    const text = q.trim()
    const c = parseCoords(text)
    if (c) {
      onChange(linkFor(c))
      mapRef.current?.flyTo([c.lat, c.lng], 16, { duration: 0.7 })
    } else onChange(text)
    setOpen(false)
  }

  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim()
      if (!t) throw new Error('empty')
      const c = parseCoords(t)
      onChange(c ? linkFor(c) : t)
      const p = c ?? parseLatLng(t)
      if (p) mapRef.current?.flyTo([p.lat, p.lng], 16, { duration: 0.7 })
    } catch {
      notify('المتصفح لا يسمح باللصق التلقائي هنا. الصق الرابط في شريط البحث على الخريطة.')
      document.getElementById(`${id}-q`)?.focus()
    }
  }

  const locate = () => {
    if (!navigator.geolocation) return notify('هذا المتصفح لا يدعم تحديد الموقع الحالي.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        onChange(linkFor(p))
        mapRef.current?.flyTo([p.lat, p.lng], 17, { duration: 0.7 })
        setLocating(false)
      },
      () => {
        notify('لم يُسمح بتحديد موقعك الحالي. اسمح للمتصفح بالوصول إلى الموقع، أو حدّده على الخريطة.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  const typedIsLink = /^https?:\/\//i.test(q.trim()) || !!parseCoords(q)
  const showList = open && (results.length > 0 || typedIsLink || (!q.trim() && !!placeName.trim()) || searchErr || (q.trim().length >= 2 && !searching))

  return (
    <div ref={wrapRef} id={id} tabIndex={-1} className="outline-none">
      <div
        className={
          full
            ? 'fixed inset-0 z-[70] isolate flex flex-col bg-bg'
            : `relative isolate rounded-2xl overflow-hidden border ${invalid ? 'border-red/60' : 'border-white/10'} bg-[#0A242C]`
        }
      >
        {full && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2.5 border-b border-white/10">
            <div className="text-[15px] font-semibold text-white truncate">{placeName.trim() || 'تحديد الموقع'}</div>
            <button type="button" onClick={() => setFull(false)} className="rounded-full bg-mint text-bg text-[13px] font-bold px-5 py-2">
              تم
            </button>
          </div>
        )}

        <div className={`relative ${full ? 'flex-1 min-h-0' : 'h-[250px] sm:h-[290px]'}`}>
          <div ref={boxRef} dir="ltr" className="absolute inset-0" />

          {/* search bar, Google-Maps style */}
          <div className="absolute top-2.5 inset-x-2.5 z-[1001]">
            <div className="flex items-center gap-2 rounded-full bg-[#0B262E]/95 backdrop-blur border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,.45)] ps-3.5 pe-1.5 h-11">
              {searching ? <Loader2 className="w-4 h-4 text-mint animate-spin shrink-0" /> : <Search className="w-4 h-4 text-dim shrink-0" />}
              <input
                id={`${id}-q`}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (typedIsLink) applyTyped()
                    else if (results[0]) pick(results[0])
                  } else if (e.key === 'Escape') setOpen(false)
                }}
                placeholder={placeName.trim() ? `ابحث: ${placeName.trim()}` : 'ابحث في الخرائط أو الصق رابطاً'}
                enterKeyHint="search"
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-[14.5px] text-ink placeholder:text-faint"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} className="p-1.5 text-faint hover:text-ink" aria-label="مسح البحث">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {showList && (
              <ul className="mt-1.5 list-none p-1.5 m-0 rounded-2xl bg-[#0B262E] border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,.55)] max-h-[220px] overflow-auto scroll-y">
                {!q.trim() && placeName.trim() && (
                  <li>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ(placeName.trim())} className="lz-sug">
                      <Search className="w-4 h-4 text-mint shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[14px] text-white truncate">ابحث عن «{placeName.trim()}»</span>
                        <span className="block text-[11.5px] text-faint">من خانة اسم الموقع</span>
                      </span>
                    </button>
                  </li>
                )}
                {typedIsLink && (
                  <li>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyTyped} className="lz-sug">
                      <Link2 className="w-4 h-4 text-mint shrink-0" />
                      <span className="block text-[14px] text-white">استخدام هذا الرابط أو الإحداثيات</span>
                    </button>
                  </li>
                )}
                {results.map((r, i) => (
                  <li key={i}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} className="lz-sug">
                      <MapPin className="w-4 h-4 text-red shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[14px] text-white truncate">{r.name}</span>
                        {r.address && <span className="block text-[11.5px] text-faint truncate">{r.address}</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {!typedIsLink && q.trim().length >= 2 && !searching && !results.length && (
                  <li className="px-3 py-2.5 text-[12.5px] text-amber leading-5">
                    {searchErr ? 'تعذّر البحث الآن. اضغط على الخريطة لتحديد الموقع.' : 'لا نتائج. جرّب اسماً أقصر أو اضغط على الخريطة.'}
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* map controls */}
          <div className="absolute bottom-7 start-2.5 z-[1000] flex flex-col gap-2">
            <button type="button" onClick={() => setFull((f) => !f)} className="lz-mapbtn" aria-label={full ? 'تصغير' : 'ملء الشاشة'}>
              {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button type="button" onClick={locate} className="lz-mapbtn" aria-label="موقعي الحالي">
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => setLayer((l) => (l === 'map' ? 'sat' : 'map'))} className="lz-mapbtn" aria-label="قمر صناعي">
              <Layers className="w-4 h-4" />
            </button>
          </div>

          {!point && !full && !tilesFailed && (
            <div className="absolute bottom-7 inset-x-16 z-[999] pointer-events-none flex justify-center">
              <span className="rounded-full bg-[#0B262E]/90 border border-white/10 px-3 py-1 text-[11.5px] text-dim text-center">
                {isTouch ? 'اضغط لوضع الدبوس · ⤢ للتحريك' : 'اضغط على المكان لوضع الدبوس'}
              </span>
            </div>
          )}

          {tilesFailed && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center p-5 pt-16 text-center bg-[#0A242C]/92">
              <div className="max-w-xs text-[12.5px] leading-6 text-dim">
                تعذّر تحميل الخريطة. تحتاج اتصالاً بالإنترنت، وقد لا تظهر داخل معاينة claude.ai لكنها تعمل على رابط GitHub. يمكنك لصق رابط الموقع في شريط البحث.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* status row */}
      <div className="mt-2 flex flex-wrap items-center gap-2 min-h-[30px]">
        {point ? (
          <>
            <span className="badge badge-active">
              <span className="badge-dot" />
              تم تحديد الموقع
            </span>
            <span className="code">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </span>
          </>
        ) : otherLink ? (
          <span className="badge badge-active max-w-full">
            <Link2 className="w-3 h-3" />
            <span className="truncate" dir="ltr">
              {otherLink}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-faint">لم يُحدَّد موقع على الخريطة</span>
        )}
        <span className="ms-auto flex gap-1.5">
          <button type="button" onClick={paste} className="btn-ghost !py-1 !px-3 !text-[12px]">
            <ClipboardPaste className="w-3.5 h-3.5" /> لصق رابط
          </button>
          {value.trim() && (
            <button type="button" onClick={() => onChange('')} className="btn-ghost !py-1 !px-3 !text-[12px]" aria-label="إزالة الموقع">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
