import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  emptyAcademyProgressState,
  recordMissionCompletion,
} from './academyProgress'
import {
  emptyState,
  loadLocal,
  loadLocalResult,
  saveLocal,
  type ProgressStorage,
} from './localProgress'

class TestStorage implements ProgressStorage {
  readonly values = new Map<string, string>()
  failWrites = false
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded')
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('guest legacy progress', () => {
  it('survives repeated provider-style loads', () => {
    const storage = new TestStorage()
    const guest = emptyState()
    guest.streak = {
      current: 3,
      longest: 3,
      lastActivityDate: '2026-07-11',
    }
    saveLocal('guest', guest, storage)

    const firstLoad = loadLocal('guest', storage)
    const secondLoad = loadLocal('guest', storage)
    expect(firstLoad.streak).toEqual(guest.streak)
    expect(secondLoad.streak).toEqual(guest.streak)
  })

  it('loads snapshots written before academy progress existed', () => {
    const storage = new TestStorage()
    storage.setItem(
      'alphacode.progress.legacy-user',
      JSON.stringify({
        streak: { current: 1, longest: 2 },
        lessons: {},
        badgeCounts: {},
      }),
    )

    const loaded = loadLocal('legacy-user', storage)
    expect(loaded.academyProgress).toBeUndefined()
    expect(loaded.lessons).toEqual({})
  })

  it('round-trips normalized academy evidence without inventing lesson mappings', () => {
    const storage = new TestStorage()
    const state = emptyState()
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    state.academyProgress = recordMissionCompletion(
      emptyAcademyProgressState(),
      {
        problemId,
        completedAt: '2026-07-11T12:00:00.000Z',
        acquisitionPassed: true,
        transferPassed: true,
        codeTestsPassed: true,
        acquisitionEventIds: ['event:a'],
        transferEventIds: ['event:python'],
        codeTestEventIds: ['event:python'],
      },
    )
    for (let index = 1; index <= 6; index += 1) {
      state.lessons[`legacy-world-${index}`] = {
        lessonId: `legacy-world-${index}`,
        status: 'completed',
        currentStepIndex: 1,
        completedStepIds: ['done'],
        correctCount: 1,
        wrongCount: 0,
        totalAttempts: 1,
        correctFirstTry: 1,
        accuracy: 100,
        masteryScore: 100,
        unlockNextLesson: true,
      }
    }

    saveLocal('academy-user', state, storage)
    const loaded = loadLocal('academy-user', storage)
    expect(Object.keys(loaded.academyProgress?.missionPractices ?? {})).toEqual([
      problemId,
    ])
    expect(loaded.academyProgress?.missionCompletions).toEqual({})
    expect(Object.keys(loaded.lessons)).toHaveLength(6)
  })

  it('never translates six completed legacy lessons into academy missions', () => {
    const storage = new TestStorage()
    const state = emptyState()
    for (let index = 1; index <= 6; index += 1) {
      state.lessons[`legacy-world-${index}`] = {
        lessonId: `legacy-world-${index}`,
        status: 'completed',
        currentStepIndex: 1,
        completedStepIds: ['done'],
        correctCount: 1,
        wrongCount: 0,
        totalAttempts: 1,
        correctFirstTry: 1,
        accuracy: 100,
        masteryScore: 100,
        unlockNextLesson: true,
      }
    }
    saveLocal('legacy-only', state, storage)

    const loaded = loadLocal('legacy-only', storage)
    expect(loaded.academyProgress).toBeUndefined()
  })

  it('preserves invalid bytes and refuses a later empty overwrite', () => {
    const storage = new TestStorage()
    const key = 'alphacode.progress.corrupt-user'
    const original = '{"streak":'
    storage.values.set(key, original)

    const loaded = loadLocalResult('corrupt-user', storage)
    expect(loaded.status).toBe('error')
    expect(loaded.state).toEqual(emptyState())
    const saved = saveLocal('corrupt-user', emptyState(), storage)
    expect(saved.status).toBe('error')
    expect(storage.values.get(key)).toBe(original)
  })

  it('surfaces quota failures without replacing the prior snapshot', () => {
    const storage = new TestStorage()
    const original = emptyState()
    original.streak.current = 2
    expect(saveLocal('quota-user', original, storage).status).toBe('ok')
    const before = storage.values.get('alphacode.progress.quota-user')

    storage.failWrites = true
    const next = emptyState()
    next.streak.current = 3
    const result = saveLocal('quota-user', next, storage)
    expect(result.status).toBe('error')
    expect(storage.values.get('alphacode.progress.quota-user')).toBe(before)
  })
})
