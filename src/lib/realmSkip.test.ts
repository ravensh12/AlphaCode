import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  loadRealmsReached,
  recordRealmsReached,
  skipRunToRealm,
} from './realmSkip'
import {
  INTRO_KEY,
  LEVEL_WELCOME_KEY,
  loadFreshRunState,
  loadFreshRunTour,
  recordFreshRunMissionCleared,
  startFreshQuestRun,
  TOUR_KEY,
} from './questSession'
import { activeRunProgressView } from './freshRunView'
import {
  ACADEMY_REALM_QUIZ_PASS_SCORE,
  emptyAcademyProgressState,
  recordMissionPractice,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
  selectRealmProgress,
} from './academyProgress'
import { canEnterAcademyBoss, isRealmRunPassed } from './academyQuest'
import type { AcademyProgressState } from '../types/academy'
import type { RealmId } from '../types/curriculum'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('skipRunToRealm', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memoryStorage())
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves the session tour and anchors a fresh run at the realm', () => {
    skipRunToRealm(3)

    expect(JSON.parse(sessionStorage.getItem(TOUR_KEY) ?? 'null')).toEqual({
      world: 3,
      stage: 0,
    })
    expect(loadFreshRunTour()).toEqual({ world: 3, stage: 0 })
    // The player already knows how to play: intro suppressed, welcome queued.
    expect(sessionStorage.getItem(INTRO_KEY)).toBe('1')
    expect(sessionStorage.getItem(LEVEL_WELCOME_KEY)).toBe('3')
  })

  it('keeps an active replay run ledger when jumping ahead', () => {
    startFreshQuestRun()
    recordFreshRunMissionCleared('problem:contains-duplicate')

    skipRunToRealm(2)

    const state = loadFreshRunState()
    expect(state?.tour).toEqual({ world: 2, stage: 0 })
    expect(state?.missions).toEqual(['problem:contains-duplicate'])
  })

  it('clamps out-of-range realm indexes into the valid worlds', () => {
    skipRunToRealm(99)
    const tour = JSON.parse(sessionStorage.getItem(TOUR_KEY) ?? 'null')
    expect(tour.stage).toBe(0)
    expect(tour.world).toBeGreaterThanOrEqual(0)
    expect(tour.world).toBeLessThan(99)
  })

  it('durably records the destination and everything behind it', () => {
    skipRunToRealm(3, 'user-a')
    expect([...loadRealmsReached('user-a')].sort()).toEqual([0, 1, 2, 3])
    // Other identities never inherit the reach memory.
    expect(loadRealmsReached('user-b').size).toBe(0)
  })
})

/** Durably pass one realm (all missions practiced + quiz + boss). */
function passRealmDurably(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const realm = NEETCODE_150_MANIFEST.realms.find(({ id }) => id === realmId)
  if (!realm) throw new Error(`Missing test realm ${realmId}`)
  const at = '2026-07-01T12:00:00.000Z'
  let next = state
  for (const trackId of realm.trackIds) {
    const track = NEETCODE_150_MANIFEST.tracks.find(({ id }) => id === trackId)
    for (const problemId of track?.problemIds ?? []) {
      next = recordMissionPractice(next, {
        problemId,
        acquiredAt: at,
        practicedAt: at,
        acquisitionPassed: true,
        transferPassed: true,
        codeTestsPassed: true,
        acquisitionEventIds: [`event:${problemId}:acquisition`],
        transferEventIds: [`event:${problemId}:python`],
        codeTestEventIds: [`event:${problemId}:python`],
      })
    }
  }
  next = recordRealmQuizAttempt(next, {
    realmId,
    attemptId: `quiz:${realmId}:pass`,
    attemptedAt: at,
    score: ACADEMY_REALM_QUIZ_PASS_SCORE,
    openEndedTransferPassed: true,
    learningEventIds: [`event:quiz:${realmId}`],
  })
  return recordRealmBossDefeat(next, {
    realmId,
    defeatId: `battle:${realmId}:win`,
    defeatedAt: at,
    learningEventIds: [`event:battle:${realmId}`],
  })
}

describe('run controls drive the progress view every surface presents', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memoryStorage())
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const realm1 = NEETCODE_150_MANIFEST.realms[0]
  const realm2 = NEETCODE_150_MANIFEST.realms[1]

  it('skip marks prior realms complete and their bosses rematchable', () => {
    // Brand-new account, no durable evidence at all.
    skipRunToRealm(2)

    const view = activeRunProgressView(emptyAcademyProgressState())
    for (const realm of [realm1, realm2]) {
      const progress = selectRealmProgress(view, realm.id)
      expect(progress.practicedProblems).toBe(progress.totalProblems)
      expect(progress.completedProblems).toBe(progress.totalProblems)
      expect(isRealmRunPassed(progress)).toBe(true)
      // The exact rematch gates BossBattlePage checks.
      expect(canEnterAcademyBoss(view, realm.id)).toBe(true)
      // Mastery is never faked: the quiz gate stays open.
      expect(progress.quizPassed).toBe(false)
      expect(progress.cleared).toBe(false)
    }
  })

  it('reset presents a durably completed account as not-completed', () => {
    const durable = passRealmDurably(
      passRealmDurably(emptyAcademyProgressState(), realm1.id),
      realm2.id,
    )
    // Sanity: durably run-passed before the reset.
    expect(
      isRealmRunPassed(selectRealmProgress(durable, realm1.id)),
    ).toBe(true)

    startFreshQuestRun()

    const view = activeRunProgressView(durable)
    for (const realm of [realm1, realm2]) {
      const progress = selectRealmProgress(view, realm.id)
      expect(progress.practicedProblems).toBe(0)
      expect(progress.completedProblems).toBe(0)
      expect(progress.bossDefeated).toBe(false)
      expect(isRealmRunPassed(progress)).toBe(false)
    }
    // Durable evidence itself is untouched by the reset.
    expect(
      isRealmRunPassed(selectRealmProgress(durable, realm2.id)),
    ).toBe(true)
  })

  it('is the plain durable state when no run is active', () => {
    const durable = passRealmDurably(emptyAcademyProgressState(), realm1.id)
    const view = activeRunProgressView(durable)
    expect(view.missionPractices).toEqual(durable.missionPractices)
    expect(view.bossDefeats).toEqual(durable.bossDefeats)
  })
})

describe('realm reach memory', () => {
  it('merges, persists, and only ever grows', () => {
    const store = memoryStorage()
    recordRealmsReached([0, 1], 'user-a', store)
    recordRealmsReached([4], 'user-a', store)
    expect([...loadRealmsReached('user-a', store)].sort()).toEqual([0, 1, 4])
    // Recording nothing new keeps the set intact (a run reset writes nothing).
    recordRealmsReached([], 'user-a', store)
    expect(loadRealmsReached('user-a', store).size).toBe(3)
  })

  it('ignores malformed storage and invalid indexes', () => {
    const store = memoryStorage()
    store.setItem('alphacode.realmskip.reached.v1.guest', 'not json')
    expect(loadRealmsReached(null, store).size).toBe(0)
    recordRealmsReached([2.5, -1, 3], null, store)
    expect([...loadRealmsReached(null, store)]).toEqual([3])
  })
})
