import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  ACADEMY_REALM_QUIZ_PASS_SCORE,
  emptyAcademyProgressState,
  isMissionRetentionDue,
  recordMissionPractice,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
  selectRealmProgress,
  selectTrackProgress,
} from './academyProgress'
import { canEnterAcademyBoss, isRealmRunPassed } from './academyQuest'
import { freshRunProgressView } from './freshRunView'
import type { FreshRunState } from './questSession'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, RealmId, TrackId } from '../types/curriculum'

/* The masked fresh-run view: street missions on and ahead of the replay
   trail present as unplayed, legs behind it stay restored scenery, and the
   current realm reads "boss not yet fought" — all without ever touching the
   durable evidence the view is projected from. */

const EVIDENCE_TIME = '2026-07-01T12:00:00.000Z'
const RESET_TIME = '2026-07-10T12:00:00.000Z'
const AFTER_RESET_TIME = '2026-07-11T12:00:00.000Z'

const realm1 = NEETCODE_150_MANIFEST.realms[0]
const realm2 = NEETCODE_150_MANIFEST.realms[1]

function trackProblemIds(trackId: TrackId): readonly ProblemId[] {
  const track = NEETCODE_150_MANIFEST.tracks.find(({ id }) => id === trackId)
  if (!track) throw new Error(`Missing test track ${trackId}`)
  return track.problemIds
}

function practiceProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
  practicedAt = EVIDENCE_TIME,
): AcademyProgressState {
  return recordMissionPractice(state, {
    problemId,
    acquiredAt: practicedAt,
    practicedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
}

function practiceRealm(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const realm = NEETCODE_150_MANIFEST.realms.find(({ id }) => id === realmId)
  if (!realm) throw new Error(`Missing test realm ${realmId}`)
  return realm.trackIds.reduce(
    (next, trackId) =>
      trackProblemIds(trackId).reduce(
        (acc, problemId) => practiceProblem(acc, problemId),
        next,
      ),
    state,
  )
}

function passRealm(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const quizzed = recordRealmQuizAttempt(practiceRealm(state, realmId), {
    realmId,
    attemptId: `quiz:${realmId}:pass`,
    attemptedAt: EVIDENCE_TIME,
    score: ACADEMY_REALM_QUIZ_PASS_SCORE,
    openEndedTransferPassed: true,
    learningEventIds: [`event:quiz:${realmId}`],
  })
  return recordRealmBossDefeat(quizzed, {
    realmId,
    defeatId: `battle:${realmId}:win`,
    defeatedAt: EVIDENCE_TIME,
    learningEventIds: [`event:battle:${realmId}`],
  })
}

/** Realms 1 and 2 fully earned (practices + quiz + boss), long before reset. */
const durable = passRealm(passRealm(emptyAcademyProgressState(), realm1.id), realm2.id)

function run(
  tour: { world: number; stage: number },
  missions: readonly string[] = [],
): FreshRunState {
  return { tour, startedAt: RESET_TIME, missions }
}

describe('freshRunProgressView (post-reset brand-new-user projection)', () => {
  it('presents the whole account as unplayed at the run start', () => {
    const view = freshRunProgressView(durable, run({ world: 0, stage: 0 }))
    expect(Object.keys(view.missionPractices)).toEqual([])
    expect(Object.keys(view.missionCompletions)).toEqual([])
    expect(Object.keys(view.realmQuizzes)).toEqual([])
    expect(Object.keys(view.bossDefeats)).toEqual([])
  })

  it('re-clears the current leg mission by mission from the run ledger', () => {
    const trackId = realm1.trackIds[0]
    const [first, second] = trackProblemIds(trackId)
    const view = freshRunProgressView(
      durable,
      run({ world: 0, stage: 0 }, [first, second]),
    )
    const progress = selectTrackProgress(view, trackId)
    expect(progress.practicedProblems).toBe(2)
    expect(progress.practiceComplete).toBe(false)
    expect(view.missionPractices[first]).toEqual(
      durable.missionPractices[first],
    )
  })

  it('keeps legs behind the trail restored, masks the current leg', () => {
    const view = freshRunProgressView(durable, run({ world: 0, stage: 1 }))
    expect(
      selectTrackProgress(view, realm1.trackIds[0]).practiceComplete,
    ).toBe(true)
    expect(
      selectTrackProgress(view, realm1.trackIds[1]).practicedProblems,
    ).toBe(0)
    // The current realm's quiz/boss evidence stays hidden until it is passed.
    expect(view.realmQuizzes[realm1.id]).toBeUndefined()
    expect(view.bossDefeats[realm1.id]).toBeUndefined()
  })

  it('restores a passed realm whole once the trail moves beyond it', () => {
    const view = freshRunProgressView(durable, run({ world: 1, stage: 0 }))
    expect(view.realmQuizzes[realm1.id]).toEqual(
      durable.realmQuizzes[realm1.id],
    )
    expect(view.bossDefeats[realm1.id]).toEqual(durable.bossDefeats[realm1.id])
    for (const trackId of realm1.trackIds) {
      expect(selectTrackProgress(view, trackId).practiceComplete).toBe(true)
    }
    // The next realm re-locks: its street missions read unplayed again.
    expect(
      selectTrackProgress(view, realm2.trackIds[0]).practicedProblems,
    ).toBe(0)
    expect(view.bossDefeats[realm2.id]).toBeUndefined()
  })

  it('counts frontier practice recorded after the reset toward the trail', () => {
    // The replay caught up to real progress: realm 3 has no durable evidence,
    // so its missions record normally — and that NEW work counts by timestamp.
    const realm3 = NEETCODE_150_MANIFEST.realms[2]
    const trackId = realm3.trackIds[0]
    const [first] = trackProblemIds(trackId)
    const advanced = practiceProblem(durable, first, AFTER_RESET_TIME)
    const view = freshRunProgressView(advanced, run({ world: 2, stage: 0 }))
    expect(view.missionPractices[first]).toBeDefined()
    expect(selectTrackProgress(view, trackId).practicedProblems).toBe(1)
  })

  it('converges back to full durable progress when the replay run finishes', () => {
    const view = freshRunProgressView(
      durable,
      run({ world: NEETCODE_150_MANIFEST.realms.length, stage: 0 }),
    )
    expect(view.missionPractices).toEqual(durable.missionPractices)
    expect(view.realmQuizzes).toEqual(durable.realmQuizzes)
    expect(view.bossDefeats).toEqual(durable.bossDefeats)
  })
})

describe('skip-to-realm run grants (realms behind the anchor)', () => {
  const realm3 = NEETCODE_150_MANIFEST.realms[2]

  it('presents skipped realms as completed with the boss down and rematchable', () => {
    // Brand-new account skips straight to realm 3: realms 1-2 have NO durable
    // evidence, yet the run view must read them as run-passed.
    const view = freshRunProgressView(
      emptyAcademyProgressState(),
      run({ world: 2, stage: 0 }),
    )
    for (const realm of [realm1, realm2]) {
      const progress = selectRealmProgress(view, realm.id)
      expect(progress.practicedProblems).toBe(progress.totalProblems)
      expect(progress.completedProblems).toBe(progress.totalProblems)
      expect(progress.bossDefeated).toBe(true)
      expect(isRealmRunPassed(progress)).toBe(true)
      // The boss arena opens for a rematch through the same selector the
      // battle page uses.
      expect(canEnterAcademyBoss(view, realm.id)).toBe(true)
      // The quiz is never granted: mastery stays an honest, durable claim.
      expect(view.realmQuizzes[realm.id]).toBeUndefined()
      expect(progress.cleared).toBe(false)
    }
    // The destination realm itself starts unplayed.
    expect(
      selectRealmProgress(view, realm3.id).practicedProblems,
    ).toBe(0)
    expect(view.bossDefeats[realm3.id]).toBeUndefined()
  })

  it('never offers retention checks for granted (skipped) missions', () => {
    const view = freshRunProgressView(
      emptyAcademyProgressState(),
      run({ world: 1, stage: 0 }),
    )
    for (const problemId of trackProblemIds(realm1.trackIds[0])) {
      expect(isMissionRetentionDue(view, problemId, Date.now())).toBe(false)
      expect(view.missionCompletions[problemId]?.cloudVerifiedAt).toBeDefined()
    }
  })

  it('keeps real durable evidence verbatim and only fills the gaps', () => {
    const trackId = realm1.trackIds[0]
    const [first] = trackProblemIds(trackId)
    const partiallyPlayed = practiceProblem(emptyAcademyProgressState(), first)
    const view = freshRunProgressView(
      partiallyPlayed,
      run({ world: 1, stage: 0 }),
    )
    expect(view.missionPractices[first]).toEqual(
      partiallyPlayed.missionPractices[first],
    )
    expect(selectTrackProgress(view, trackId).practiceComplete).toBe(true)
  })

  it('grants nothing to the current realm or realms ahead of the anchor', () => {
    const view = freshRunProgressView(
      emptyAcademyProgressState(),
      run({ world: 1, stage: 0 }),
    )
    expect(Object.keys(view.bossDefeats)).toEqual([realm1.id])
    for (const trackId of realm2.trackIds) {
      expect(selectTrackProgress(view, trackId).practicedProblems).toBe(0)
    }
  })

  it('survives re-normalization — selectors never drop granted evidence', () => {
    // Every academy selector re-normalizes its input; a granted evidence
    // shape that normalization rejects would silently un-complete realms.
    const view = freshRunProgressView(
      emptyAcademyProgressState(),
      run({ world: 1, stage: 0 }),
    )
    const progress = selectRealmProgress(view, realm1.id)
    expect(progress.completedTracks).toBe(3)
    expect(progress.bossDefeated).toBe(true)
  })
})
