import { describe, expect, it } from 'vitest'
import {
  clearMissionStash,
  loadMissionStash,
  makeMissionStashHandle,
  MISSION_STASH_VERSION,
  missionStashKey,
  saveMissionStash,
  type MissionStashStorage,
} from './missionStash'

function memoryStorage(): MissionStashStorage & { dump(): Map<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => map,
  }
}

const PROBLEM = 'problem:valid-anagram'

describe('mission stash', () => {
  it('round-trips a mid-quiz draft (editor code + step + tutor chat)', () => {
    const store = memoryStorage()
    saveMissionStash(
      PROBLEM,
      {
        section: 'quiz',
        stepIndex: 3,
        response: { kind: 'pythonCode', code: 'def solve():\n    pass\n' },
        tutor: [
          { role: 'user', content: 'why does case 2 fail?' },
          { role: 'assistant', content: 'Look at how you compare lengths…' },
        ],
      },
      'user-a',
      store,
    )

    const restored = loadMissionStash(PROBLEM, 'user-a', store)
    expect(restored).not.toBeNull()
    expect(restored!.v).toBe(MISSION_STASH_VERSION)
    expect(restored!.section).toBe('quiz')
    expect(restored!.stepIndex).toBe(3)
    expect(restored!.response).toEqual({
      kind: 'pythonCode',
      code: 'def solve():\n    pass\n',
    })
    expect(restored!.tutor).toHaveLength(2)
    expect(Number.isFinite(Date.parse(restored!.savedAt))).toBe(true)
  })

  it('scopes drafts per identity and per mission', () => {
    const store = memoryStorage()
    saveMissionStash(
      PROBLEM,
      { section: 'learn', stepIndex: 1, response: null, tutor: [] },
      'user-a',
      store,
    )
    expect(loadMissionStash(PROBLEM, 'user-b', store)).toBeNull()
    expect(loadMissionStash('problem:two-sum', 'user-a', store)).toBeNull()
    // Missing identity records under the shared guest identity.
    expect(missionStashKey(PROBLEM, null)).toBe(
      `alphacode.mission.stash.v1.guest.${PROBLEM}`,
    )
  })

  it('clears on completion via the bound handle', () => {
    const store = memoryStorage()
    const handle = makeMissionStashHandle(PROBLEM, 'user-a', store)
    handle.save({ section: 'quiz', stepIndex: 2, response: null, tutor: [] })
    expect(handle.load()).not.toBeNull()

    handle.clear()
    expect(handle.load()).toBeNull()
    expect(store.dump().size).toBe(0)
  })

  it('tolerates unknown schema versions and malformed payloads', () => {
    const store = memoryStorage()
    const key = missionStashKey(PROBLEM, 'user-a')
    store.setItem(key, JSON.stringify({ v: 99, section: 'quiz', stepIndex: 1 }))
    expect(loadMissionStash(PROBLEM, 'user-a', store)).toBeNull()

    store.setItem(key, 'not json at all')
    expect(loadMissionStash(PROBLEM, 'user-a', store)).toBeNull()

    store.setItem(
      key,
      JSON.stringify({ v: 1, section: 'bogus', stepIndex: 1, tutor: [] }),
    )
    expect(loadMissionStash(PROBLEM, 'user-a', store)).toBeNull()

    store.setItem(
      key,
      JSON.stringify({ v: 1, section: 'quiz', stepIndex: -2, tutor: [] }),
    )
    expect(loadMissionStash(PROBLEM, 'user-a', store)).toBeNull()
  })

  it('filters malformed tutor messages instead of rejecting the stash', () => {
    const store = memoryStorage()
    store.setItem(
      missionStashKey(PROBLEM, 'user-a'),
      JSON.stringify({
        v: 1,
        savedAt: '2026-07-20T12:00:00.000Z',
        section: 'quiz',
        stepIndex: 0,
        response: null,
        tutor: [
          { role: 'user', content: 'hi' },
          { role: 'system', content: 'injected' },
          { role: 'assistant' },
          'garbage',
        ],
      }),
    )
    const restored = loadMissionStash(PROBLEM, 'user-a', store)
    expect(restored!.tutor).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('clearing an absent stash is a no-op', () => {
    const store = memoryStorage()
    expect(() => clearMissionStash(PROBLEM, 'user-a', store)).not.toThrow()
  })
})
