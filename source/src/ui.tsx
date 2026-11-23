import { useEffect, useRef, useState, type ReactNode } from 'react'
import logoWhite from './assets/logo-lazem-white.png'

export const EASE = [0.16, 1, 0.3, 1] as const

/** Header logo: tilts toward the pointer in 3D (from the Lazem site). */
export function Logo3D() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!ref.current || e.pointerType !== 'mouse') return
      ref.current.style.setProperty('--lx', String((e.clientX / window.innerWidth - 0.5) * 2))
      ref.current.style.setProperty('--ly', String((e.clientY / window.innerHeight - 0.5) * 2))
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [])
  return (
    <div className="logo-3d" ref={ref}>
      <div className="tilt">
        <img className="brand-logo" src={logoWhite} alt="شعار لازم للخدمات الطبية" />
      </div>
    </div>
  )
}

/** Glass card with the pointer glow used on the Lazem project cards (no tilt, so it stays steady under the mouse). */
export function TiltCard({
  children,
  className = '',
  onClick,
  selected,
  delay = 0,
  as = 'div',
  label,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  selected?: boolean
  delay?: number
  as?: 'div' | 'button'
  label?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  const props = {
    ref: ref as never,
    className: `glass card ${selected ? 'selected' : ''} ${className}`,
    style: { animationDelay: `${delay}s` },
    onPointerMove: onMove,
    onClick,
    'aria-label': label,
    'aria-pressed': as === 'button' ? !!selected : undefined,
  }
  return as === 'button' ? (
    <button type="button" {...props}>
      {children}
    </button>
  ) : (
    <div {...props}>{children}</div>
  )
}

/** Counts up to `to` like the stats on the Lazem site. */
export function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900)
      const v = Math.round(start + (to - start) * (1 - Math.pow(1 - k, 3)))
      setN(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{n}</>
}

/** The site's ECG pulse divider. */
export function PulseLine() {
  return (
    <div className="pulse-wrap h-[46px]" aria-hidden="true">
      <svg viewBox="0 0 1180 46" preserveAspectRatio="none">
        <path className="pulse-fade" d="M0 23 H1180" />
        <path
          className="pulse-line"
          d="M0 23 L250 23 L268 23 L280 6 L298 42 L314 14 L326 23 L560 23 L574 23 L586 4 L604 44 L620 12 L632 23 L900 23 L912 6 L930 42 L946 14 L958 23 L1180 23"
        />
      </svg>
    </div>
  )
}
