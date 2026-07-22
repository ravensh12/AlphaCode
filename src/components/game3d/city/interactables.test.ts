import { describe, expect, it } from 'vitest'
import {
  ACADEMY_REALM_QUIZ_PASS_SCORE,
  emptyAcademyProgressState,
  markMissionRetentionCloudVerified,
  recordMissionPractice,
  recordMissionRetention,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
} from '../../../lib/academyProgress'
import { COURIER_ROUTES } from '../../../lib/cityLife'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../../../content/curricula/neetcode150'
import type { AcademyProgressState } from '../../../types/academy'
import type { ProblemId, RealmId, TrackId } from '../../../types/curriculum'
import {
  INTERACT_PRIORITY,
  INTERACT_RADIUS,
  buildCityInteractables,
  nearestInteractable,
  type CityInteractable,
  type CityInteractablesInput,
} from './interactables'

const BASE_TIME = '2026-07-11T12:00:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000
/** After every practice below has passed its 24 h retention wait. */
const RETENTION_DUE_NOW = Date.parse(BASE_TIME) + DAY_MS + 60 * 60 * 1000
/** Before any retention wait has elapsed. */
const TOO_EARLY_NOW = Date.parse(BASE_TIME) + 60 * 60 * 1000

function practiceProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
  acquiredAt = BASE_TIME,
): AcademyProgressState {
  return recordMissionPractice(state, {
    problemId,
    acquiredAt,
    practicedAt: acquiredAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
}

function completeProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
  acquiredAt = BASE_TIME,
): AcademyProgressState {
  return recordMissionRetention(practiceProblem(state, problemId, acquiredAt), {
    problemId,
    retainedAt: new Date(Date.parse(acquiredAt) + DAY_MS).toISOString(),
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:${problemId}:retention`],
  })
}

function practiceTrack(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const track = NEETCODE_150_TRACK_BY_ID.get(trackId)!
  return track.problemIds.reduce(
    (next, problemId) => practiceProblem(next, problemId),
    state,
  )
}

function completeTrack(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const track = NEETCODE_150_TRACK_BY_ID.get(trackId)!
  return track.problemIds.reduce(
    (next, problemId) => completeProblem(next, problemId),
    state,
  )
}

function clearRealm(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const realm = NEETCODE_150_MANIFEST.realms.find(({ id }) => id === realmId)!
  let next = realm.trackIds.reduce(completeTrack, state)
  next = recordRealmQuizAttempt(next, {
    realmId,
    attemptId: `quiz:${realmId}:pass`,
    attemptedAt: BASE_TIME,
    score: ACADEMY_REALM_QUIZ_PASS_SCORE,
    openEndedTransferPassed: true,
    learningEventIds: [`event:quiz:${realmId}`],
  })
  return recordRealmBossDefeat(next, {
    realmId,
    defeatId: `battle:${realmId}:win`,
    defeatedAt: BASE_TIME,
    learningEventIds: [`event:battle:${realmId}`],
  })
}

function buildInput(
  overrides: Partial<CityInteractablesInput> = {},
): CityInteractablesInput {
  return {
    academyProgress: emptyAcademyProgressState(),
    isGuest: false,
    isShowcaseAccount: false,
    now: TOO_EARLY_NOW,
    cloudEnabled: false,
    firstDeliveryDone: false,
    hasReviewHistory: false,
    ...overrides,
  }
}

function ofKind(list: readonly CityInteractable[], kind: string) {
  return list.filter(({ payload }) => payload.kind === kind)
}

function dojoAt(list: readonly CityInteractable[], world: number, part: number) {
  return list.find(
    ({ payload }) =>
      payload.kind === 'dojo' &&
      payload.worldIndex === world &&
      payload.part === part,
  )
}

describe('gating table — guests', () => {
  it('guests see dojo and boss targets ONLY', () => {
    const list = buildCityInteractables(buildInput({ isGuest: true }))
    const kinds = new Set(list.map(({ payload }) => payload.kind))
    expect([...kinds].sort()).toEqual(['boss', 'dojo'])
    expect(ofKind(list, 'dojo')).toHaveLength(18)
    expect(ofKind(list, 'boss')).toHaveLength(6)
  })

  it('guest locks: first gate open, later gates and all bosses locked', () => {
    const list = buildCityInteractables(buildInput({ isGuest: true }))
    expect(dojoAt(list, 0, 0)!.target.locked).toBe(false)
    expect(dojoAt(list, 0, 1)!.target.locked).toBe(true)
    expect(dojoAt(list, 1, 0)!.target.locked).toBe(true)
    expect(dojoAt(list, 0, 1)!.prompt.lockedLabel).toBe('Sign in to train here')
    for (const boss of ofKind(list, 'boss')) {
      expect(boss.target.locked).toBe(true)
    }
  })
})

describe('gating table — dojo active/revisit and boss', () => {
  it('a fresh player has exactly the first gate active, everything else locked', () => {
    const list = buildCityInteractables(buildInput())
    const first = dojoAt(list, 0, 0)!
    expect(first.target.locked).toBe(false)
    expect(first.payload).toMatchObject({
      kind: 'dojo',
      realmId: 'realm1',
      trackId: 'arrays-hashing',
      mode: 'active',
    })
    expect(first.prompt.verb).toBe('Enter')
    expect(dojoAt(list, 0, 1)!.target.locked).toBe(true)
    expect(dojoAt(list, 0, 1)!.prompt.lockedLabel).toBe(
      'Clear the earlier checkpoint first',
    )
    expect(dojoAt(list, 1, 0)!.target.locked).toBe(true)
  })

  it('practice-complete flips a gate to an unlocked revisit and opens the next', () => {
    const progress = practiceTrack(
      emptyAcademyProgressState(),
      'arrays-hashing',
    )
    const list = buildCityInteractables(buildInput({ academyProgress: progress }))
    const revisit = dojoAt(list, 0, 0)!
    expect(revisit.target.locked).toBe(false)
    expect(revisit.payload).toMatchObject({ mode: 'revisit' })
    expect(revisit.target.cleared).toBe(false) // retention still pending
    const next = dojoAt(list, 0, 1)!
    expect(next.target.locked).toBe(false)
    expect(next.payload).toMatchObject({ mode: 'active' })
  })

  it('a fully retained track marks its dojo cleared', () => {
    const progress = completeTrack(emptyAcademyProgressState(), 'arrays-hashing')
    const list = buildCityInteractables(
      buildInput({ academyProgress: progress, now: RETENTION_DUE_NOW }),
    )
    expect(dojoAt(list, 0, 0)!.target.cleared).toBe(true)
  })

  it('boss gating is unchanged: locked until all three tracks complete', () => {
    const cleared = clearRealm(emptyAcademyProgressState(), 'realm1')
    const before = buildCityInteractables(buildInput())
    const after = buildCityInteractables(
      buildInput({ academyProgress: cleared, now: RETENTION_DUE_NOW }),
    )
    const bossBefore = ofKind(before, 'boss')[0]
    const bossAfter = ofKind(after, 'boss')[0]
    expect(bossBefore.target.locked).toBe(true)
    expect(bossBefore.target.cleared).toBe(false)
    expect(bossAfter.target.locked).toBe(false)
    expect(bossAfter.target.cleared).toBe(true)
  })
})

describe('gating table — memory crystals (ripe-only)', () => {
  const PROBLEM = NEETCODE_150_TRACK_BY_ID.get('arrays-hashing')!.problemIds[0]

  it('no crystal target before the retention wait has passed', () => {
    const progress = practiceProblem(emptyAcademyProgressState(), PROBLEM)
    const list = buildCityInteractables(
      buildInput({ academyProgress: progress, now: TOO_EARLY_NOW }),
    )
    expect(ofKind(list, 'memoryCrystal')).toHaveLength(0)
  })

  it('a ripe crystal becomes an unlocked, high-priority, tight-radius target', () => {
    const progress = practiceProblem(emptyAcademyProgressState(), PROBLEM)
    const list = buildCityInteractables(
      buildInput({ academyProgress: progress, now: RETENTION_DUE_NOW }),
    )
    const crystals = ofKind(list, 'memoryCrystal')
    expect(crystals).toHaveLength(1)
    const crystal = crystals[0]
    expect(crystal.target.locked).toBe(false)
    expect(crystal.target.radius).toBe(INTERACT_RADIUS.memoryCrystal)
    expect(crystal.target.priority).toBe(INTERACT_PRIORITY.memoryCrystal)
    expect(crystal.payload).toMatchObject({
      kind: 'memoryCrystal',
      crystal: { state: 'ripe', problemIds: [PROBLEM] },
    })
    expect(crystal.prompt.verb).toBe('Harvest')
  })

  it('pendingCloud crystals stay harvestable and say so; cleared ones vanish', () => {
    const completed = completeProblem(emptyAcademyProgressState(), PROBLEM)
    const pending = buildCityInteractables(
      buildInput({
        academyProgress: completed,
        now: RETENTION_DUE_NOW,
        cloudEnabled: true,
      }),
    )
    const crystal = ofKind(pending, 'memoryCrystal')[0]
    expect(crystal.payload).toMatchObject({
      crystal: { state: 'pendingCloud' },
    })
    expect(crystal.prompt.label).toContain('cloud check')

    // Cloud off → the same completion reads cleared → no target.
    const offline = buildCityInteractables(
      buildInput({ academyProgress: completed, now: RETENTION_DUE_NOW }),
    )
    expect(ofKind(offline, 'memoryCrystal')).toHaveLength(0)

    // Cloud-verified → cleared → no target either.
    const verified = markMissionRetentionCloudVerified(
      completed,
      PROBLEM,
      new Date(RETENTION_DUE_NOW).toISOString(),
    )
    const done = buildCityInteractables(
      buildInput({
        academyProgress: verified,
        now: RETENTION_DUE_NOW,
        cloudEnabled: true,
      }),
    )
    expect(ofKind(done, 'memoryCrystal')).toHaveLength(0)
  })
})

describe('gating table — arcade, npc, courier, vehicle, photo', () => {
  it('the arcade is never locked and flags the empty session state', () => {
    const empty = ofKind(buildCityInteractables(buildInput()), 'arcade')[0]
    expect(empty.target.locked).toBe(false)
    expect(empty.payload).toMatchObject({ kind: 'arcade', empty: true })

    const playable = ofKind(
      buildCityInteractables(buildInput({ hasReviewHistory: true })),
      'arcade',
    )[0]
    expect(playable.payload).toMatchObject({ empty: false })
    expect(playable.target.locked).toBe(false)
  })

  it('exactly one NPC per unlocked district, quizzing its active track', () => {
    const fresh = buildCityInteractables(buildInput())
    const freshNpcs = ofKind(fresh, 'npc')
    expect(freshNpcs).toHaveLength(1)
    expect(freshNpcs[0].payload).toMatchObject({
      districtIndex: 0,
      realmId: 'realm1',
      trackId: 'arrays-hashing',
    })
    expect(freshNpcs[0].target.locked).toBe(false)

    const realmCleared = clearRealm(emptyAcademyProgressState(), 'realm1')
    const two = ofKind(
      buildCityInteractables(
        buildInput({ academyProgress: realmCleared, now: RETENTION_DUE_NOW }),
      ),
      'npc',
    )
    expect(two).toHaveLength(2)
    // District 0 is fully complete → its NPC falls back to the first track.
    expect(two[0].payload).toMatchObject({ districtIndex: 0, trackId: 'arrays-hashing' })
    expect(two[1].payload).toMatchObject({ districtIndex: 1, realmId: 'realm2' })
  })

  it('courier and photo spots are always present and never locked', () => {
    const list = buildCityInteractables(buildInput())
    const courier = ofKind(list, 'courier')[0]
    expect(courier.target.locked).toBe(false)
    expect(courier.payload).toMatchObject({
      routeIds: COURIER_ROUTES.map(({ id }) => id),
    })
    const photos = ofKind(list, 'photo')
    expect(photos).toHaveLength(6)
    for (const photo of photos) {
      expect(photo.target.locked).toBe(false)
    }
  })

  it('the vehicle unlocks behind the first-delivery flag', () => {
    const before = ofKind(buildCityInteractables(buildInput()), 'vehicle')[0]
    expect(before.target.locked).toBe(true)
    expect(before.prompt.lockedLabel).toBe(
      'Finish your first delivery to unlock',
    )
    const after = ofKind(
      buildCityInteractables(buildInput({ firstDeliveryDone: true })),
      'vehicle',
    )[0]
    expect(after.target.locked).toBe(false)
  })
})

describe('gating table — showcase account', () => {
  it('opens every dojo and boss without inventing any progress', () => {
    const list = buildCityInteractables(
      buildInput({ isShowcaseAccount: true }),
    )
    for (const dojo of ofKind(list, 'dojo')) {
      expect(dojo.target.locked).toBe(false)
      expect(dojo.target.cleared).toBe(false) // facts stay real
    }
    for (const boss of ofKind(list, 'boss')) {
      expect(boss.target.locked).toBe(false)
      expect(boss.target.cleared).toBe(false)
    }
    // Crystals are evidence-backed — an empty showcase account grows none.
    expect(ofKind(list, 'memoryCrystal')).toHaveLength(0)
  })

  it('shows all six district NPCs and keeps the vehicle reward-gated', () => {
    const list = buildCityInteractables(
      buildInput({ isShowcaseAccount: true }),
    )
    expect(ofKind(list, 'npc')).toHaveLength(6)
    expect(ofKind(list, 'vehicle')[0].target.locked).toBe(true)
  })
})

describe('target shape and pick contract', () => {
  it('every target carries radius, priority, world, and a stable key', () => {
    const list = buildCityInteractables(
      buildInput({ isShowcaseAccount: true, hasReviewHistory: true }),
    )
    const keys = new Set(list.map(({ target }) => target.key))
    expect(keys.size).toBe(list.length)
    for (const { target, payload } of list) {
      expect(target.kind).toBe(payload.kind)
      expect(target.radius).toBe(INTERACT_RADIUS[payload.kind])
      expect(target.priority).toBe(INTERACT_PRIORITY[payload.kind])
      expect(target.world).toBeDefined()
      expect(Number.isFinite(target.x)).toBe(true)
      expect(Number.isFinite(target.z)).toBe(true)
    }
  })

  it('nearestInteractable prefers priority inside radius, then distance', () => {
    const progress = practiceProblem(
      emptyAcademyProgressState(),
      NEETCODE_150_TRACK_BY_ID.get('arrays-hashing')!.problemIds[0],
    )
    const list = buildCityInteractables(
      buildInput({ academyProgress: progress, now: RETENTION_DUE_NOW }),
    )
    const crystal = ofKind(list, 'memoryCrystal')[0]

    // Standing right at the crystal: it out-ranks any overlapping door.
    const picked = nearestInteractable(list, crystal.target.x, crystal.target.z)
    expect(picked?.target.key).toBe(crystal.target.key)

    // Far out in the void, nothing is in range.
    expect(nearestInteractable(list, 9_999, 9_999)).toBeNull()

    // Ties on priority resolve to the nearest target.
    const photos = ofKind(list, 'photo')
    const nearPhoto = nearestInteractable(
      list,
      photos[2].target.x + 0.5,
      photos[2].target.z,
    )
    expect(nearPhoto?.target.key).toBe(photos[2].target.key)
  })
})
