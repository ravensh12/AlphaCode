import { useCallback, useEffect, useRef, useState } from 'react'
import type { LessonStep } from '../types/lesson'

/** Easing curve inspired by Flutter's standard decelerate curve. */
export const LESSON_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function slideAutoplayMs(step: LessonStep, isDemo: boolean): number {
  if (step.type === 'thinkCheck') return 6500
  if (isDemo) {
    const textLen =
      (step.prompt?.length ?? 0) +
      (step.callout?.length ?? 0) +
      (step.bullets?.join('').length ?? 0)
    return Math.min(9000, Math.max(4800, 4000 + textLen * 16))
  }
  return 6000
}

export function canAutoplayStep(
  section: 'learn' | 'quiz',
  step: LessonStep,
  thinkRevealed: boolean,
): boolean {
  if (section !== 'learn') return false
  if (step.type === 'quizIntro') return false
  if (step.type === 'thinkCheck' && !thinkRevealed) return false
  return true
}

export function useLessonAutoplay({
  enabled,
  stepId,
  durationMs,
  onAdvance,
}: {
  enabled: boolean
  stepId: string
  durationMs: number
  onAdvance: () => void
}) {
  const [playing, setPlaying] = useState(enabled)
  const [progress, setProgress] = useState(0)
  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance

  useEffect(() => {
    setPlaying(enabled)
  }, [enabled, stepId])

  useEffect(() => {
    setProgress(0)
  }, [stepId])

  useEffect(() => {
    if (!enabled || !playing) return

    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setProgress(p)
      if (p >= 1) {
        onAdvanceRef.current()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, playing, stepId, durationMs])

  const toggle = useCallback(() => setPlaying((p) => !p), [])
  const pause = useCallback(() => setPlaying(false), [])

  return { playing, progress, toggle, pause }
}
