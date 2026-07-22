import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RETENTION_CLOCK_MAX_DELAY_MS,
  retentionClockDelay,
  scheduleRetentionClock,
} from './useRetentionClock'
import missionFlowSource from './useAcademyMissionFlow.ts?raw'
import trackSource from '../pages/AcademyTrackPage.tsx?raw'

describe('retention clock scheduling', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses bounded timers until the exact boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-11T12:00:00.000Z')
    const tick = vi.fn()
    const target = '2026-07-11T12:02:00.000Z'

    expect(retentionClockDelay(target, Date.now())).toBe(
      RETENTION_CLOCK_MAX_DELAY_MS,
    )
    scheduleRetentionClock(target, tick)
    vi.advanceTimersByTime(RETENTION_CLOCK_MAX_DELAY_MS - 1)
    expect(tick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(tick).toHaveBeenCalledOnce()
  })

  it('fires at a near boundary and stops once due', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-11T12:00:00.000Z')
    const tick = vi.fn()
    const target = '2026-07-11T12:00:00.500Z'

    scheduleRetentionClock(target, tick)
    vi.advanceTimersByTime(499)
    expect(tick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(tick).toHaveBeenCalledOnce()
    vi.setSystemTime(target)
    expect(scheduleRetentionClock(target, tick)).toBeUndefined()
  })

  it('drives both open academy retention views', () => {
    expect(missionFlowSource).toContain(
      'useRetentionClock(retentionAvailableAt)',
    )
    expect(trackSource).toContain('useRetentionClock(retentionTimes)')
  })
})
