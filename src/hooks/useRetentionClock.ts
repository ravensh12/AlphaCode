import { useEffect, useState } from 'react'

export const RETENTION_CLOCK_MAX_DELAY_MS = 60_000

export function retentionClockDelay(
  availableAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!availableAt) return null
  const target = Date.parse(availableAt)
  if (!Number.isFinite(target) || target <= nowMs) return null
  return Math.min(target - nowMs, RETENTION_CLOCK_MAX_DELAY_MS)
}

export function scheduleRetentionClock(
  availableAt: string | null | undefined,
  onTick: () => void,
  now = () => Date.now(),
  schedule = (callback: () => void, delayMs: number) =>
    globalThis.setTimeout(callback, delayMs),
): (() => void) | undefined {
  const delay = retentionClockDelay(availableAt, now())
  if (delay === null) return undefined
  const timer = schedule(onTick, delay)
  return () => globalThis.clearTimeout(timer)
}

/** Re-renders at least once per minute and exactly when a nearer boundary lands. */
export function useRetentionClock(
  availableAt:
    | string
    | readonly string[]
    | null
    | undefined,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const nextAvailableAt =
    typeof availableAt === 'string'
      ? availableAt
      : availableAt
          ?.filter((value) => Date.parse(value) > nowMs)
          .sort()[0]

  useEffect(
    () =>
      scheduleRetentionClock(nextAvailableAt, () => {
        setNowMs(Date.now())
      }),
    [nextAvailableAt, nowMs],
  )

  return nowMs
}
