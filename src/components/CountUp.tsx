import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Animates a whole number from 0 up to `end` once on mount using a single
 * requestAnimationFrame ramp (no persistent loop). Respects reduced motion by
 * rendering the final value immediately.
 */
export function CountUp({
  end,
  durationMs = 800,
  suffix = '',
}: {
  end: number
  durationMs?: number
  suffix?: string
}) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? end : 0))
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(end)
      return
    }
    const start = performance.now()
    const from = 0
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic for a satisfying settle.
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (end - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [end, durationMs])

  return (
    <span className="countup">
      {value}
      {suffix}
    </span>
  )
}
