import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyOutcome,
  emptyGauntletState,
  loadGauntlet,
  markBossBeaten,
  mergeGauntletStates,
  recordExamCompletion,
  saveGauntlet,
} from './gauntletProgress'

describe('certification completion gate', () => {
  it('requires both the 80 percent boundary and explicit requirements', () => {
    const empty = emptyGauntletState()

    expect(recordExamCompletion(empty, 79, true)).toMatchObject({
      attempts: 1,
      bestScore: 79,
      certificationRequirementsPassed: false,
      examPassed: false,
    })
    expect(recordExamCompletion(empty, 80, false)).toMatchObject({
      attempts: 1,
      bestScore: 80,
      certificationRequirementsPassed: false,
      examPassed: false,
    })
    expect(recordExamCompletion(empty, 80, true)).toMatchObject({
      attempts: 1,
      bestScore: 80,
      certificationRequirementsPassed: true,
      examPassed: true,
    })
  })

  it('records retries and keeps a compliant pass sticky', () => {
    const passedAt = Date.parse('2026-07-11T18:00:00.000Z')
    const first = recordExamCompletion(
      emptyGauntletState(),
      72,
      false,
      passedAt - 1_000,
    )
    const passed = recordExamCompletion(first, 84, true, passedAt)
    const retried = recordExamCompletion(
      passed,
      68,
      false,
      passedAt + 1_000,
    )

    expect(first.attempts).toBe(1)
    expect(passed).toMatchObject({
      attempts: 2,
      bestScore: 84,
      examPassed: true,
      examPassedAt: '2026-07-11T18:00:00.000Z',
    })
    expect(retried).toMatchObject({
      attempts: 3,
      bestScore: 84,
      examPassed: true,
      examPassedAt: '2026-07-11T18:00:00.000Z',
      certificationRequirementsPassed: true,
    })
  })
})

describe('legacy gauntlet migration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps legacy concept statistics readable without trusting an old exam pass', () => {
    const legacy = {
      version: 1,
      bestScore: 100,
      attempts: 2,
      examPassed: true,
      examPassedAt: '2026-01-01T00:00:00.000Z',
      finalBossBeaten: false,
      concepts: {
        arrays: {
          concept: 'arrays',
          seen: 4,
          correctFirstTry: 3,
          box: 3,
          streak: 2,
          dueAt: 10,
          lastSeenAt: 5,
        },
      },
    }
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify(legacy)),
      setItem: vi.fn(),
    })

    const loaded = loadGauntlet('learner')

    expect(loaded.version).toBe(4)
    expect(loaded.concepts.arrays).toMatchObject({
      seen: 4,
      correctFirstTry: 3,
      box: 3,
    })
    expect(loaded.examPassed).toBe(false)
    expect(loaded.examPassedAt).toBeUndefined()
  })
})

describe('gauntlet monotonic merge', () => {
  it('keeps certification and final-boss latches across stale devices', () => {
    const passed = recordExamCompletion(
      emptyGauntletState(),
      88,
      true,
      Date.parse('2026-07-11T18:00:00.000Z'),
    )
    const boss = markBossBeaten(
      emptyGauntletState(),
      Date.parse('2026-07-12T18:00:00.000Z'),
    )
    const merged = mergeGauntletStates(passed, boss)
    expect(merged).toMatchObject({
      bestScore: 88,
      attempts: 1,
      examPassed: true,
      certificationRequirementsPassed: true,
      finalBossBeaten: true,
    })
    expect(mergeGauntletStates(boss, passed)).toEqual(merged)
  })

  it('unions disjoint certification attempts and concept outcomes', () => {
    const left = applyOutcome(
      recordExamCompletion(
        emptyGauntletState(),
        70,
        false,
        Date.parse('2026-07-11T12:00:00.000Z'),
        'cert:left',
      ),
      {
        questionId: 'q:left',
        concept: 'arrays',
        firstTryCorrect: true,
        attempts: 1,
        usedHint: false,
      },
      Date.parse('2026-07-11T12:01:00.000Z'),
      'outcome:left',
    )
    const right = applyOutcome(
      recordExamCompletion(
        emptyGauntletState(),
        90,
        true,
        Date.parse('2026-07-11T13:00:00.000Z'),
        'cert:right',
      ),
      {
        questionId: 'q:right',
        concept: 'arrays',
        firstTryCorrect: false,
        attempts: 2,
        usedHint: false,
      },
      Date.parse('2026-07-11T13:01:00.000Z'),
      'outcome:right',
    )

    const merged = mergeGauntletStates(left, right)
    expect(merged.attempts).toBe(2)
    expect(merged.bestScore).toBe(90)
    expect(merged.examPassed).toBe(true)
    expect(merged.concepts.arrays.seen).toBe(2)
    expect(Object.keys(merged.conceptOutcomes)).toEqual([
      'outcome:left',
      'outcome:right',
    ])
    expect(mergeGauntletStates(right, left)).toEqual(merged)
    expect(mergeGauntletStates(merged, left)).toEqual(merged)
  })

  it('keeps a failed cloud write durably pending in local storage', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    })
    const pending = recordExamCompletion(
      emptyGauntletState(),
      82,
      true,
      Date.parse('2026-07-11T12:00:00.000Z'),
      'cert:offline',
    )
    expect(saveGauntlet('offline-user', pending)).toBe(true)
    expect(loadGauntlet('offline-user')).toMatchObject({
      pendingCloudSync: true,
      attempts: 1,
      examPassed: true,
    })
    vi.unstubAllGlobals()
  })
})
