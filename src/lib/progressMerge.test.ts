import { describe, it, expect } from 'vitest'
import {
  mergeInProgress,
  mergeCompleted,
  reconcileLessonProgress,
  mergeProgressStates,
} from './progressMerge'
import { emptyState } from './localProgress'
import type { LessonProgress } from '../types/progress'

/** Fully-specified lesson snapshot so merge tests are deterministic. */
function lp(over: Partial<LessonProgress> = {}): LessonProgress {
  return {
    lessonId: 'lesson-1',
    status: 'inProgress',
    currentStepIndex: 0,
    completedStepIds: [],
    correctCount: 0,
    wrongCount: 0,
    totalAttempts: 0,
    correctFirstTry: 0,
    accuracy: 0,
    masteryScore: 0,
    unlockNextLesson: false,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  }
}

describe('mergeInProgress', () => {
  it('keeps the furthest step and unions completed step ids', () => {
    const merged = mergeInProgress(
      lp({ currentStepIndex: 5, completedStepIds: ['a', 'b'], correctCount: 4 }),
      lp({ currentStepIndex: 3, completedStepIds: ['b', 'c'], correctCount: 2 }),
    )
    expect(merged.currentStepIndex).toBe(5)
    expect(merged.completedStepIds.sort()).toEqual(['a', 'b', 'c'])
    expect(merged.correctCount).toBe(4)
  })

  it('never loses the learnCompleted latch', () => {
    const merged = mergeInProgress(lp({ learnCompleted: true }), lp({ learnCompleted: undefined }))
    expect(merged.learnCompleted).toBe(true)
  })
})

describe('mergeCompleted', () => {
  it('keeps best metrics and the earliest completion timestamp', () => {
    const merged = mergeCompleted(
      lp({
        status: 'completed',
        masteryScore: 80,
        accuracy: 90,
        completedAt: '2026-06-01T00:00:00.000Z',
      }),
      lp({
        status: 'completed',
        masteryScore: 60,
        accuracy: 95,
        completedAt: '2026-06-15T00:00:00.000Z',
      }),
    )
    expect(merged.status).toBe('completed')
    expect(merged.masteryScore).toBe(80)
    expect(merged.accuracy).toBe(95)
    expect(merged.completedAt).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('reconcileLessonProgress', () => {
  it('a completed copy always beats an in-progress copy', () => {
    const done = lp({ status: 'completed', masteryScore: 75, unlockNextLesson: true })
    const wip = lp({ status: 'inProgress', currentStepIndex: 9 })
    for (const [a, b] of [
      [done, wip],
      [wip, done],
    ] as const) {
      const rec = reconcileLessonProgress(a, b)
      expect(rec.status).toBe('completed')
      expect(rec.unlockNextLesson).toBe(true)
      expect(rec.currentStepIndex).toBe(9)
    }
  })
})

describe('mergeProgressStates (cloud ⇄ local)', () => {
  it('unions lessons and never drops local-only progress', () => {
    const cloud = emptyState()
    cloud.lessons['a'] = lp({ lessonId: 'a', status: 'completed', masteryScore: 70 })
    const local = emptyState()
    local.lessons['a'] = lp({ lessonId: 'a', currentStepIndex: 4 })
    local.lessons['b'] = lp({ lessonId: 'b', currentStepIndex: 2 })

    const merged = mergeProgressStates(cloud, local)
    expect(merged.lessons['a'].status).toBe('completed')
    expect(merged.lessons['b'].currentStepIndex).toBe(2)
  })

  it('keeps the one-way Threshold latch with the earliest timestamp', () => {
    const cloud = emptyState()
    const local = emptyState()
    local.interZoneComplete = true
    local.interZoneCompletedAt = '2026-06-20T00:00:00.000Z'
    const merged = mergeProgressStates(cloud, local)
    expect(merged.interZoneComplete).toBe(true)
    expect(merged.interZoneCompletedAt).toBe('2026-06-20T00:00:00.000Z')
  })

  it('reconciles streaks by most recent activity date', () => {
    const cloud = emptyState()
    cloud.streak = { current: 3, longest: 8, lastActivityDate: '2026-06-28' }
    const local = emptyState()
    local.streak = { current: 5, longest: 5, lastActivityDate: '2026-07-01' }
    const merged = mergeProgressStates(cloud, local)
    expect(merged.streak.current).toBe(5)
    expect(merged.streak.lastActivityDate).toBe('2026-07-01')
  })

  it('badge counts survive a partial cloud sync (max per badge wins)', () => {
    const cloud = emptyState()
    cloud.badgeCounts = { lightning: 6, quick: 0, 'speed-demon': 1, flawless: 0 }
    const local = emptyState()
    local.badgeCounts = { lightning: 2, quick: 3, 'speed-demon': 0, flawless: 1 }
    const merged = mergeProgressStates(cloud, local)
    expect(merged.badgeCounts.lightning).toBeGreaterThanOrEqual(6)
    expect(merged.badgeCounts.quick).toBeGreaterThanOrEqual(3)
    expect(merged.badgeCounts.flawless).toBeGreaterThanOrEqual(1)
  })
})
