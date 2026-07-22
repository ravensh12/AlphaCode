import { describe, expect, it } from 'vitest'
import {
  BOSS_RUSH_STORE_KEY,
  ENDLESS_STORE_KEY,
  POSTGAME_GUEST_IDENTITY,
  formatRunMs,
  loadBossRushRecord,
  loadEndlessRecord,
  postgameIdentityStorageKey,
  recordBossRushRun,
  recordEndlessRun,
  resolvePostgameAccess,
  type PostgameStorage,
} from './postgame'

function fakeStorage(seed: Record<string, string> = {}): PostgameStorage & {
  data: Map<string, string>
} {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('post-campaign route gate', () => {
  it('never redirects while durable progress is still hydrating', () => {
    expect(resolvePostgameAccess(false, false, false)).toEqual({
      status: 'loading',
    })
    // Even a showcase account waits for hydration — no pre-hydration redirects.
    expect(resolvePostgameAccess(true, false, false)).toEqual({
      status: 'loading',
    })
  })

  it('stays locked before the campaign is complete', () => {
    expect(resolvePostgameAccess(false, true, false)).toEqual({
      status: 'redirect',
      to: '/quest',
    })
  })

  it('opens after campaign completion', () => {
    expect(resolvePostgameAccess(false, true, true)).toEqual({
      status: 'allowed',
    })
  })

  it('opens for the showcase account with zero campaign progress', () => {
    expect(resolvePostgameAccess(true, true, false)).toEqual({
      status: 'allowed',
    })
  })
})

describe('boss rush best-time persistence', () => {
  it('round-trips a first clear', () => {
    const store = fakeStorage()
    expect(loadBossRushRecord(store)).toBeNull()
    const { record, newBest } = recordBossRushRun(183_456, store)
    expect(newBest).toBe(true)
    expect(record).toEqual({ bestMs: 183_456 })
    expect(loadBossRushRecord(store)).toEqual({ bestMs: 183_456 })
  })

  it('keeps the fastest time and flags improvements', () => {
    const store = fakeStorage()
    recordBossRushRun(200_000, store)
    const worse = recordBossRushRun(240_000, store)
    expect(worse.newBest).toBe(false)
    expect(loadBossRushRecord(store)).toEqual({ bestMs: 200_000 })
    const better = recordBossRushRun(150_500, store)
    expect(better.newBest).toBe(true)
    expect(loadBossRushRecord(store)).toEqual({ bestMs: 150_500 })
  })

  it('ignores malformed or hostile stored values', () => {
    for (const raw of ['not json', '{}', '{"bestMs":"9"}', '{"bestMs":-4}', '{"bestMs":null}']) {
      const store = fakeStorage({ [BOSS_RUSH_STORE_KEY]: raw })
      expect(loadBossRushRecord(store)).toBeNull()
    }
  })

  it('survives an unavailable storage without throwing', () => {
    const broken: PostgameStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadBossRushRecord(broken)).toBeNull()
    expect(() => recordBossRushRun(1000, broken)).not.toThrow()
  })
})

describe('endless siege best-wave persistence', () => {
  it('round-trips a first run', () => {
    const store = fakeStorage()
    expect(loadEndlessRecord(store)).toBeNull()
    const { record, newBest } = recordEndlessRun(4, 57, store)
    expect(newBest).toBe(true)
    expect(record).toEqual({ bestWave: 4, bestKills: 57 })
    expect(loadEndlessRecord(store)).toEqual({ bestWave: 4, bestKills: 57 })
  })

  it('keeps the highest wave and the most kills independently', () => {
    const store = fakeStorage()
    recordEndlessRun(6, 90, store)
    // Lower wave but more kills: wave stands, kills improve.
    const mixed = recordEndlessRun(3, 120, store)
    expect(mixed.newBest).toBe(false)
    expect(loadEndlessRecord(store)).toEqual({ bestWave: 6, bestKills: 120 })
    // Higher wave with fewer kills: wave improves, kills stand.
    const higher = recordEndlessRun(9, 60, store)
    expect(higher.newBest).toBe(true)
    expect(loadEndlessRecord(store)).toEqual({ bestWave: 9, bestKills: 120 })
  })

  it('ignores malformed stored values', () => {
    for (const raw of ['[]', '{"bestWave":"7"}', '{"bestWave":0}', 'null']) {
      const store = fakeStorage({ [ENDLESS_STORE_KEY]: raw })
      expect(loadEndlessRecord(store)).toBeNull()
    }
  })
})

describe('identity-scoped records + migration', () => {
  it('isolates best-run records between two identities', () => {
    const store = fakeStorage()
    recordBossRushRun(200_000, store, 'user-a')
    recordEndlessRun(6, 40, store, 'user-a')

    expect(loadBossRushRecord(store, 'user-a')).toEqual({ bestMs: 200_000 })
    expect(loadEndlessRecord(store, 'user-a')).toEqual({
      bestWave: 6,
      bestKills: 40,
    })
    // A second account on the device starts with a clean leaderboard.
    expect(loadBossRushRecord(store, 'user-b')).toBeNull()
    expect(loadEndlessRecord(store, 'user-b')).toBeNull()

    recordBossRushRun(300_000, store, 'user-b')
    expect(loadBossRushRecord(store, 'user-b')).toEqual({ bestMs: 300_000 })
    // …and never disturbs the first account's best.
    expect(loadBossRushRecord(store, 'user-a')).toEqual({ bestMs: 200_000 })
  })

  it('defaults to the guest identity when none is given', () => {
    const store = fakeStorage()
    recordBossRushRun(120_000, store)
    expect(
      store.data.has(
        postgameIdentityStorageKey(BOSS_RUSH_STORE_KEY, POSTGAME_GUEST_IDENTITY),
      ),
    ).toBe(true)
    expect(loadBossRushRecord(store, POSTGAME_GUEST_IDENTITY)).toEqual({
      bestMs: 120_000,
    })
  })

  it('migrates a device-global record to the first reader, removing the legacy key', () => {
    const store = fakeStorage({
      [BOSS_RUSH_STORE_KEY]: JSON.stringify({ bestMs: 90_000 }),
      [ENDLESS_STORE_KEY]: JSON.stringify({ bestWave: 8, bestKills: 210 }),
    })
    // First identity to read keeps the device's existing records…
    expect(loadBossRushRecord(store, 'user-a')).toEqual({ bestMs: 90_000 })
    expect(loadEndlessRecord(store, 'user-a')).toEqual({
      bestWave: 8,
      bestKills: 210,
    })
    expect(store.data.has(BOSS_RUSH_STORE_KEY)).toBe(false)
    expect(store.data.has(ENDLESS_STORE_KEY)).toBe(false)
    // …later identities do NOT inherit them.
    expect(loadBossRushRecord(store, 'user-b')).toBeNull()
    expect(loadEndlessRecord(store, 'user-b')).toBeNull()
  })

  it('an existing identity record wins over a stale legacy value', () => {
    const store = fakeStorage({
      [BOSS_RUSH_STORE_KEY]: JSON.stringify({ bestMs: 300_000 }),
      [postgameIdentityStorageKey(BOSS_RUSH_STORE_KEY, 'user-a')]:
        JSON.stringify({ bestMs: 100_000 }),
    })
    expect(loadBossRushRecord(store, 'user-a')).toEqual({ bestMs: 100_000 })
  })
})

describe('run clock formatting', () => {
  it('renders m:ss.d', () => {
    expect(formatRunMs(0)).toBe('0:00.0')
    expect(formatRunMs(83_450)).toBe('1:23.4')
    expect(formatRunMs(600_000)).toBe('10:00.0')
    expect(formatRunMs(-50)).toBe('0:00.0')
  })
})
