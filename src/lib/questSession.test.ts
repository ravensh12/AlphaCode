import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINTS_3D,
  START_3D,
  WORLD_GATES,
  questDoor,
} from '../components/game3d/layout'
import {
  consumeAcademyReviewReturn,
  clearQuestRun,
  FRESH_RUN_KEY,
  INTRO_KEY,
  loadFreshRunState,
  loadFreshRunTour,
  markAcademyReviewReturn,
  recordFreshRunMissionCleared,
  resolveQuestResume,
  saveFreshRunTour,
  spawnAfterQuestEntry,
  spawnAtLevel,
  spawnForQuestObjective,
  startFreshQuestRun,
  TOUR_KEY,
} from './questSession'

describe('quest objective and spawn reconciliation', () => {
  it('keeps a placement spawn when it names the durable starting realm', () => {
    const placement = { world: 3, stage: 0 }
    const spawn = spawnAtLevel(placement.world)

    expect(spawn).toMatchObject(
      questDoor(CHECKPOINTS_3D[placement.world - 1].boss, 6.5),
    )
    expect(resolveQuestResume(placement, placement, spawn)).toEqual({
      tour: placement,
      spawn,
    })
  })

  it('lets the first incomplete durable objective override stale placement', () => {
    const stalePlacement = { world: 4, stage: 0 }
    const staleSpawn = spawnAtLevel(stalePlacement.world)
    const durable = { world: 1, stage: 2 }
    const resolved = resolveQuestResume(
      durable,
      stalePlacement,
      staleSpawn,
    )

    expect(resolved.tour).toEqual(durable)
    expect(resolved.spawn).toEqual(spawnForQuestObjective(durable))
    expect(resolved.spawn).not.toEqual(staleSpawn)
  })

  it('refreshes a progressed learner at the preceding durable checkpoint', () => {
    const durable = { world: 4, stage: 2 }
    const resolved = resolveQuestResume(durable, null, null)
    const expectedHere = questDoor(WORLD_GATES[4][1], 6.5)

    expect(resolved.spawn).toMatchObject(expectedHere)
    expect(resolved.spawn).not.toMatchObject(START_3D)
  })

  it('preserves a live progressed position only for the matching objective', () => {
    const durable = { world: 5, stage: 1 }
    const livePosition = { x: -351.25, z: -272.5, h: 1.125 }

    expect(resolveQuestResume(durable, durable, livePosition)).toEqual({
      tour: durable,
      spawn: livePosition,
    })
  })

  it('saves entry coordinates from the entered target world', () => {
    const academyEntry = spawnAfterQuestEntry(4, 1)
    const academyDoor = questDoor(WORLD_GATES[4][1], 6.5)
    expect(academyEntry).toMatchObject(academyDoor)
    expect(academyEntry).not.toMatchObject(
      questDoor(WORLD_GATES[0][1], 6.5),
    )

    const bossEntry = spawnAfterQuestEntry(5, 3)
    expect(bossEntry).toMatchObject(
      questDoor(CHECKPOINTS_3D[5].boss, 6.5),
    )
  })
})

describe('fresh run (Reset run → brand-new start at Level 1)', () => {
  function memorySessionStorage(seed: Record<string, string> = {}) {
    const map = new Map(Object.entries(seed))
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, String(value))
      },
      removeItem: (key: string) => {
        map.delete(key)
      },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size
      },
    }
  }

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memorySessionStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('anchors the run at Level 1 with the intro re-armed, keeping only the anchor', () => {
    sessionStorage.setItem(INTRO_KEY, '1')
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world: 4, stage: 2 }))

    startFreshQuestRun()

    expect(loadFreshRunTour()).toEqual({ world: 0, stage: 0 })
    expect(sessionStorage.getItem(INTRO_KEY)).toBeNull()
    expect(sessionStorage.getItem(TOUR_KEY)).toBeNull()
  })

  it('overrides a completed account durable objective back to the spawn plaza', () => {
    startFreshQuestRun()
    const durableDone = { world: WORLD_GATES.length, stage: 0 }
    const resume = resolveQuestResume(
      loadFreshRunTour() ?? durableDone,
      null,
      null,
    )
    expect(resume.tour).toEqual({ world: 0, stage: 0 })
    expect(resume.spawn).toMatchObject({ x: START_3D.x, z: START_3D.z })
  })

  it('follows the replay run and normalizes garbage anchors away', () => {
    saveFreshRunTour({ world: 2, stage: 1 })
    expect(loadFreshRunTour()).toEqual({ world: 2, stage: 1 })

    sessionStorage.setItem(FRESH_RUN_KEY, '{"world":"nope"}')
    expect(loadFreshRunTour()).toBeNull()
    sessionStorage.setItem(FRESH_RUN_KEY, 'not json')
    expect(loadFreshRunTour()).toBeNull()
  })

  it('starts a brand-new run: Level 1 anchor, empty mission ledger', () => {
    startFreshQuestRun()
    const state = loadFreshRunState()
    expect(state?.tour).toEqual({ world: 0, stage: 0 })
    expect(state?.missions).toEqual([])
    expect(Number.isFinite(Date.parse(state?.startedAt ?? ''))).toBe(true)
  })

  it('ledgers each replayed mission once; tour saves keep the ledger', () => {
    startFreshQuestRun()
    const startedAt = loadFreshRunState()?.startedAt
    recordFreshRunMissionCleared('problem:contains-duplicate')
    recordFreshRunMissionCleared('problem:contains-duplicate')
    recordFreshRunMissionCleared('problem:valid-anagram')
    expect(loadFreshRunState()?.missions).toEqual([
      'problem:contains-duplicate',
      'problem:valid-anagram',
    ])

    saveFreshRunTour({ world: 0, stage: 1 })
    const state = loadFreshRunState()
    expect(state?.tour).toEqual({ world: 0, stage: 1 })
    expect(state?.missions).toEqual([
      'problem:contains-duplicate',
      'problem:valid-anagram',
    ])
    expect(state?.startedAt).toBe(startedAt)
  })

  it('never ledgers a mission when no fresh run is active', () => {
    recordFreshRunMissionCleared('problem:contains-duplicate')
    expect(loadFreshRunState()).toBeNull()
  })

  it('saveFreshRunTour starts a fresh anchor when none is active (skip to realm)', () => {
    saveFreshRunTour({ world: 3, stage: 0 })
    const state = loadFreshRunState()
    expect(state?.tour).toEqual({ world: 3, stage: 0 })
    expect(state?.missions).toEqual([])
    expect(Number.isFinite(Date.parse(state?.startedAt ?? ''))).toBe(true)
  })

  it('tolerates a legacy anchor without ledger fields', () => {
    sessionStorage.setItem(FRESH_RUN_KEY, '{"world":1,"stage":2}')
    const state = loadFreshRunState()
    expect(state?.tour).toEqual({ world: 1, stage: 2 })
    expect(state?.missions).toEqual([])
    expect(Number.isFinite(Date.parse(state?.startedAt ?? ''))).toBe(true)
  })

  it('clearQuestRun ends the fresh run and returns authority to durable progress', () => {
    startFreshQuestRun()
    clearQuestRun()
    expect(loadFreshRunTour()).toBeNull()
  })

  it('review returns round-trip once and validate their shape', () => {
    markAcademyReviewReturn('realm1', 'arrays-hashing')
    expect(consumeAcademyReviewReturn()).toEqual({
      realmId: 'realm1',
      trackId: 'arrays-hashing',
    })
    // Consumed — a second read yields nothing.
    expect(consumeAcademyReviewReturn()).toBeNull()
  })
})
