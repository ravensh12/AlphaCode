import { useEffect, useMemo, useState } from 'react'
import './Confetti.css'

const COLORS = ['#6d4afe', '#14d39a', '#ffd23f', '#2dd4ee', '#ff5a5f', '#ff9e2c']

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Dependency-free CSS confetti burst. Spawns `count` pieces once on mount, then
 * unmounts itself after the animation finishes (auto-cleanup). Pure
 * transform/opacity animation — no JS loop. Renders nothing when the user
 * prefers reduced motion.
 */
export function Confetti({
  count = 80,
  durationMs = 1200,
  onDone,
}: {
  count?: number
  durationMs?: number
  onDone?: () => void
}) {
  const reduced = prefersReducedMotion()
  const [gone, setGone] = useState(false)

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 7 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        drift: `${(Math.random() * 2 - 1) * 28}vw`,
        rotate: `${Math.random() * 720 - 360}deg`,
        delay: `${Math.random() * 0.2}s`,
        dur: `${durationMs / 1000 + Math.random() * 0.4}s`,
      })),
    [count, durationMs],
  )

  useEffect(() => {
    if (reduced) {
      onDone?.()
      return
    }
    const t = window.setTimeout(() => {
      setGone(true)
      onDone?.()
    }, durationMs + 600)
    return () => window.clearTimeout(t)
  }, [reduced, durationMs, onDone])

  if (reduced || gone) return null

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            ['--cf-x' as string]: p.drift,
            ['--cf-r' as string]: p.rotate,
            ['--cf-delay' as string]: p.delay,
            ['--cf-dur' as string]: p.dur,
          }}
        />
      ))}
    </div>
  )
}
