import { describe, expect, it } from 'vitest'
import type { AttemptEvent, MasteryProjection } from '../types/learning'
import {
  applyAttemptEvent,
  dedupeByNaturalKey,
  emptyMasteryProjection,
  preferredAttempt,
  rebuildLearningCache,
  rebuildMastery,
  selectDueProblemIds,
  selectWeakSkillIds,
} from './masteryProjection'

const event = (
  id: string,
  occurredAt: string,
  overrides: Partial<AttemptEvent> = {},
): AttemptEvent =>
  ({
    schemaVersion: 1,
    id,
    interactionId: `interaction-${id}`,
    sessionId: 'session-1',
    deviceId: 'device-1',
    deviceSeq: Number(id.replace(/\D/g, '')) || 1,
    source: 'lesson-quiz',
    problemId: 'problem:two-sum',
    skillIds: ['skill:frequency-map', 'skill:hash-membership'],
    attemptNumber: 1,
    isCorrect: true,
    resolved: true,
    firstTryCorrect: true,
    usedHint: false,
    revealed: false,
    responseMs: 3000,
    occurredAt,
    ...overrides,
  }) as AttemptEvent

describe('mastery projection', () => {
  it('projects one event into its problem and every unique skill', () => {
    const projected = applyAttemptEvent(
      emptyMasteryProjection(),
      event('event-1', '2026-07-11T12:00:00.000Z', {
        skillIds: [
          'skill:frequency-map',
          'skill:hash-membership',
          'skill:frequency-map',
        ],
      }),
    )

    expect(projected.problemMastery['problem:two-sum']?.reviewCount).toBe(1)
    expect(projected.skillMastery['skill:frequency-map']?.reviewCount).toBe(1)
    expect(projected.skillMastery['skill:hash-membership']?.reviewCount).toBe(1)
  })

  it('collapses natural-key duplicates to one canonical event and counts once', () => {
    const unresolved = event('miss', '2026-07-11T12:00:00.000Z', {
      interactionId: 'interaction:dup',
      attemptNumber: 1,
      isCorrect: false,
      resolved: false,
      firstTryCorrect: false,
    })
    const resolved = event('skip', '2026-07-11T12:00:05.000Z', {
      interactionId: 'interaction:dup',
      attemptNumber: 1,
      isCorrect: true,
      resolved: true,
      firstTryCorrect: true,
    })

    const cache = rebuildLearningCache('alice', [unresolved, resolved])
    // Resolved event wins; the attempt is projected exactly once.
    expect(cache.events).toHaveLength(1)
    expect(cache.events[0].id).toBe('skip')
    expect(cache.problemMastery['problem:two-sum']?.submissionCount).toBe(1)
    expect(cache.problemMastery['problem:two-sum']?.reviewCount).toBe(1)
  })

  it('applies the winner rule deterministically regardless of order', () => {
    const unresolved = event('a', '2026-07-11T12:00:00.000Z', {
      interactionId: 'interaction:dup',
      attemptNumber: 1,
      resolved: false,
      firstTryCorrect: false,
    })
    const resolvedEarly = event('b', '2026-07-11T11:59:00.000Z', {
      interactionId: 'interaction:dup',
      attemptNumber: 1,
      resolved: true,
      firstTryCorrect: false,
    })
    // Resolved beats unresolved even when the resolved event is older.
    expect(preferredAttempt(unresolved, resolvedEarly).id).toBe('b')
    expect(preferredAttempt(resolvedEarly, unresolved).id).toBe('b')
    // Folding across all orderings yields the same single winner.
    expect(dedupeByNaturalKey([unresolved, resolvedEarly])).toEqual(
      dedupeByNaturalKey([resolvedEarly, unresolved]),
    )
  })

  it('is a strict no-op for a duplicate event id', () => {
    const first = applyAttemptEvent(
      emptyMasteryProjection(),
      event('event-1', '2026-07-11T12:00:00.000Z'),
    )
    const duplicate = applyAttemptEvent(
      first,
      event('event-1', '2026-07-12T12:00:00.000Z'),
    )
    expect(duplicate).toBe(first)
    expect(duplicate.problemMastery['problem:two-sum']?.submissionCount).toBe(1)
  })

  it('keeps unresolved telemetry without changing the schedule', () => {
    const projected = applyAttemptEvent(
      emptyMasteryProjection(),
      event('event-1', '2026-07-11T12:00:00.000Z', {
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
      }),
    )
    const record = projected.problemMastery['problem:two-sum']!
    expect(record.submissionCount).toBe(1)
    expect(record.reviewCount).toBe(0)
    expect(record.schedule.reps).toBe(0)
    expect(record.ability).toBe(0.5)
  })

  it('lets a newer failure lower mastery and due date while preserving lapses', () => {
    const successful = applyAttemptEvent(
      emptyMasteryProjection(),
      event('event-1', '2026-07-11T12:00:00.000Z'),
    )
    const before = successful.problemMastery['problem:two-sum']!
    const seeded: MasteryProjection = {
      ...successful,
      problemMastery: {
        ...successful.problemMastery,
        'problem:two-sum': {
          ...before,
          schedule: { ...before.schedule, lapses: 3 },
        },
      },
    }
    const failed = applyAttemptEvent(
      seeded,
      event('event-2', '2026-07-12T12:00:00.000Z', {
        isCorrect: false,
        firstTryCorrect: false,
        responseMs: undefined,
      }),
    )
    const after = failed.problemMastery['problem:two-sum']!

    expect(after.ability).toBeLessThan(before.ability)
    expect(after.schedule.stabilityDays).toBeLessThan(
      before.schedule.stabilityDays,
    )
    expect(after.schedule.dueAt).toBe('2026-07-12T12:10:00.000Z')
    expect(after.schedule.lapses).toBe(4)
  })

  it('rebuilds deterministically regardless of input order', () => {
    const events = [
      event('event-1', '2026-07-11T12:00:00.000Z'),
      event('event-2', '2026-07-12T12:00:00.000Z', {
        attemptNumber: 2,
        firstTryCorrect: false,
        usedHint: true,
      }),
      event('event-3', '2026-07-14T12:00:00.000Z', {
        isCorrect: false,
        firstTryCorrect: false,
      }),
    ]
    expect(rebuildMastery(events)).toEqual(
      rebuildMastery([events[2], events[0], events[1], events[1]]),
    )
  })

  it('selects due problems and weakest practiced skills', () => {
    const projection = rebuildMastery([
      event('event-1', '2026-07-11T12:00:00.000Z'),
      event('event-2', '2026-07-11T13:00:00.000Z', {
        problemId: 'problem:valid-anagram',
        skillIds: ['skill:array-scan'],
        isCorrect: false,
        firstTryCorrect: false,
      }),
    ])
    expect(
      selectDueProblemIds(projection, '2026-07-16T14:00:00.000Z'),
    ).toContain('problem:two-sum')
    expect(selectWeakSkillIds(projection, 1)).toEqual(['skill:array-scan'])
  })
})
