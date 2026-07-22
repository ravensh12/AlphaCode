import { describe, expect, it } from 'vitest'
import type { AttemptEvent } from '../types/learning'
import {
  EASY_RESPONSE_MS,
  ratingForAttempt,
  retrievability,
  scheduleReview,
} from './fsrsScheduler'

const attempt = (
  overrides: Partial<AttemptEvent> = {},
): AttemptEvent =>
  ({
    schemaVersion: 1,
    id: 'event-1',
    interactionId: 'interaction-1',
    sessionId: 'session-1',
    deviceId: 'device-1',
    deviceSeq: 1,
    source: 'lesson-quiz',
    problemId: 'problem:two-sum',
    skillIds: ['skill:frequency-map'],
    attemptNumber: 1,
    isCorrect: true,
    resolved: true,
    firstTryCorrect: true,
    usedHint: false,
    revealed: false,
    occurredAt: '2026-07-11T12:00:00.000Z',
    ...overrides,
  }) as AttemptEvent

describe('ratingForAttempt', () => {
  it('maps unresolved, failure, hint/retry, and clean recall deterministically', () => {
    expect(ratingForAttempt(attempt({ resolved: false }))).toBeNull()
    expect(ratingForAttempt(attempt({ isCorrect: false }))).toBe('again')
    expect(ratingForAttempt(attempt({ revealed: true }))).toBe('again')
    expect(ratingForAttempt(attempt({ usedHint: true }))).toBe('hard')
    expect(
      ratingForAttempt(
        attempt({ attemptNumber: 2, firstTryCorrect: false }),
      ),
    ).toBe('hard')
    expect(ratingForAttempt(attempt({ responseMs: EASY_RESPONSE_MS + 1 }))).toBe(
      'good',
    )
    expect(ratingForAttempt(attempt({ responseMs: EASY_RESPONSE_MS }))).toBe(
      'easy',
    )
  })
})

describe('scheduleReview', () => {
  it('produces exact deterministic due dates from supplied timestamps', () => {
    const at = '2026-07-11T12:00:00.000Z'
    expect(scheduleReview(undefined, 'good', at).dueAt).toBe(
      '2026-07-12T12:00:00.000Z',
    )
    expect(scheduleReview(undefined, 'easy', at).dueAt).toBe(
      '2026-07-15T12:00:00.000Z',
    )
  })

  it('preserves lapses and lowers current stability after failure', () => {
    const good = scheduleReview(
      undefined,
      'easy',
      '2026-07-11T12:00:00.000Z',
    )
    const failed = scheduleReview(
      { ...good, lapses: 4 },
      'again',
      '2026-07-12T12:00:00.000Z',
    )
    expect(failed.lapses).toBe(5)
    expect(failed.stabilityDays).toBeLessThan(good.stabilityDays)
    expect(failed.dueAt).toBe('2026-07-12T12:10:00.000Z')
    expect(failed.phase).toBe('relearning')
  })

  it('clamps state and returns a bounded forgetting curve', () => {
    const state = scheduleReview(
      undefined,
      'good',
      '2026-07-11T12:00:00.000Z',
    )
    expect(retrievability(state, state.lastReviewAt!)).toBe(1)
    expect(retrievability(state, state.dueAt)).toBeCloseTo(0.9, 8)

    const clamped = scheduleReview(
      {
        ...state,
        stabilityDays: Number.POSITIVE_INFINITY,
        difficulty: -100,
        reps: -5,
        lapses: 7,
      },
      'easy',
      '2026-07-12T12:00:00.000Z',
    )
    expect(clamped.stabilityDays).toBeGreaterThan(0)
    expect(clamped.stabilityDays).toBeLessThanOrEqual(3650)
    expect(clamped.difficulty).toBeGreaterThanOrEqual(1)
    expect(clamped.lapses).toBe(7)
  })
})
