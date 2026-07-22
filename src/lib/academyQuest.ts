import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_SLUG,
  NEETCODE_150_REALM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import type {
  AcademyProgressState,
  AcademyRealmProgress,
} from '../types/academy'
import type {
  ProblemSummary,
  RealmId,
  RealmSpec,
  TrackId,
  TrackSpec,
} from '../types/curriculum'
import {
  selectRealmProgress,
  selectTrackProgress,
} from './academyProgress'
import type { WorldState } from './questState'

export const ACADEMY_BOSS_STAGE = 3

export type AcademyTourPosition = {
  world: number
  stage: number
}

export type ValidAcademyTrackRoute = {
  kind: 'valid'
  realm: RealmSpec
  track: TrackSpec
}

export type ValidAcademyMissionRoute = ValidAcademyTrackRoute & {
  problem: ProblemSummary
}

export type AcademyRouteRedirect = {
  kind: 'redirect'
  to: string
  notice: string
}

export function academyTrackPath(realmId: RealmId, trackId: TrackId): string {
  return `/academy/${realmId}/${trackId}`
}

export function academyMissionPath(
  realmId: RealmId,
  trackId: TrackId,
  problemSlug: string,
): string {
  return `${academyTrackPath(realmId, trackId)}/${problemSlug}`
}

export function realmIdForWorldIndex(worldIndex: number): RealmId | null {
  return NEETCODE_150_MANIFEST.realms[worldIndex]?.id ?? null
}

export function worldIndexForRealmId(realmId: RealmId): number {
  return NEETCODE_150_MANIFEST.realms.findIndex(({ id }) => id === realmId)
}

export function trackIdForCheckpoint(
  worldIndex: number,
  checkpointIndex: number,
): TrackId | null {
  return (
    NEETCODE_150_MANIFEST.realms[worldIndex]?.trackIds[checkpointIndex] ?? null
  )
}

export function checkpointIndexForTrack(
  realmId: RealmId,
  trackId: TrackId,
): number {
  return (
    NEETCODE_150_REALM_BY_ID.get(realmId)?.trackIds.indexOf(trackId) ?? -1
  )
}

export function resolveAcademyTrackRoute(
  realmParam: string | undefined,
  trackParam: string | undefined,
): ValidAcademyTrackRoute | AcademyRouteRedirect {
  const realm = realmParam
    ? NEETCODE_150_REALM_BY_ID.get(realmParam as RealmId)
    : undefined
  if (!realm) {
    return {
      kind: 'redirect',
      to: '/quest/list',
      notice: 'That academy realm does not exist.',
    }
  }

  const track = trackParam
    ? NEETCODE_150_TRACK_BY_ID.get(trackParam as TrackId)
    : undefined
  if (!track) {
    return {
      kind: 'redirect',
      to: academyTrackPath(realm.id, realm.trackIds[0]),
      notice: `That topic is not part of ${realm.title}.`,
    }
  }
  if (track.realmId !== realm.id || !realm.trackIds.includes(track.id)) {
    return {
      kind: 'redirect',
      to: academyTrackPath(track.realmId, track.id),
      notice: `${track.title} belongs to a different realm. We opened its academy instead.`,
    }
  }

  return { kind: 'valid', realm, track }
}

export function resolveAcademyMissionRoute(
  realmParam: string | undefined,
  trackParam: string | undefined,
  problemSlug: string | undefined,
): ValidAcademyMissionRoute | AcademyRouteRedirect {
  const trackRoute = resolveAcademyTrackRoute(realmParam, trackParam)
  if (trackRoute.kind === 'redirect') return trackRoute

  const problem = problemSlug
    ? NEETCODE_150_PROBLEM_BY_SLUG.get(problemSlug)
    : undefined
  if (!problem) {
    return {
      kind: 'redirect',
      to: academyTrackPath(trackRoute.realm.id, trackRoute.track.id),
      notice: 'That mission is not part of this academy topic.',
    }
  }
  if (
    problem.realmId !== trackRoute.realm.id ||
    problem.trackId !== trackRoute.track.id
  ) {
    return {
      kind: 'redirect',
      to: academyMissionPath(
        problem.realmId,
        problem.trackId,
        problem.leetcodeSlug,
      ),
      notice: `${problem.title} belongs to a different academy topic. We opened the correct mission.`,
    }
  }

  return { ...trackRoute, problem }
}

/**
 * RUN-passed: the realm boss is durably defeated. Beating the boss advances
 * the physical run to the next realm immediately — the strict mastery claim
 * (`AcademyRealmProgress.cleared`: 80%+ assessment with open-ended transfer
 * plus delayed-retrieval retention on every mission) stays pending as an
 * optional side objective and is what certifications/final-gauntlet require.
 */
export function isRealmRunPassed(progress: AcademyRealmProgress): boolean {
  return progress.cleared || progress.bossDefeated
}

export function isAcademyRealmUnlocked(
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  const worldIndex = worldIndexForRealmId(realmId)
  if (worldIndex < 0) return false
  if (worldIndex === 0) return true
  const previousRealm = NEETCODE_150_MANIFEST.realms[worldIndex - 1]
  // A boss defeat opens the next realm for the run; mastery may still be
  // pending on the defeated realm without holding the trail hostage.
  return isRealmRunPassed(selectRealmProgress(state, previousRealm.id))
}

export function canEnterAcademyCheckpoint(
  state: AcademyProgressState,
  worldIndex: number,
  checkpointIndex: number,
): boolean {
  const realm = NEETCODE_150_MANIFEST.realms[worldIndex]
  if (!realm || checkpointIndex < 0 || checkpointIndex >= realm.trackIds.length) {
    return false
  }
  if (!isAcademyRealmUnlocked(state, realm.id)) return false
  return realm.trackIds
    .slice(0, checkpointIndex)
    .every((trackId) => selectTrackProgress(state, trackId).practiceComplete)
}

export function canEnterAcademyBoss(
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  const realm = NEETCODE_150_REALM_BY_ID.get(realmId)
  if (!realm) return false
  // The lair opens once every track is practiced — the same bar the trail
  // uses to point at the boss. Delayed-retrieval retention is part of the
  // optional mastery claim and never blocks the fight; the 80%+ realm
  // assessment before the fight still gates it inside the lair.
  return (
    isAcademyRealmUnlocked(state, realmId) &&
    realm.trackIds.every(
      (trackId) => selectTrackProgress(state, trackId).practiceComplete,
    )
  )
}

/**
 * The realm's OPTIONAL mastery-claim status, derived purely from durable
 * evidence. The run itself advances on the boss defeat (see isRealmRunPassed);
 * this selector only describes what is left to certify the realm — assessment
 * retake and/or the delayed-recall memory-crystal missions — so guidance can
 * offer the claim as a side quest without ever demanding a boss redo.
 */
export type RealmBossFollowUp =
  | { kind: 'fight' } // boss not yet durably defeated
  | { kind: 'retakeQuiz' } // boss beaten; the assessment gate is still open
  | { kind: 'retention'; missionsRemaining: number } // boss beaten; retention pending
  | { kind: 'cleared' } // both gates passed — mastery claimed

export function realmBossFollowUp(
  progress: AcademyRealmProgress,
): RealmBossFollowUp {
  if (progress.cleared) return { kind: 'cleared' }
  if (!progress.bossDefeated) return { kind: 'fight' }
  if (!progress.quizPassed) return { kind: 'retakeQuiz' }
  return {
    kind: 'retention',
    missionsRemaining: Math.max(
      0,
      progress.totalProblems - progress.completedProblems,
    ),
  }
}

/**
 * Durable academy facts are authoritative for the physical tour. Any stale
 * session position is reconciled to the first incomplete track, quiz, or boss.
 * A realm counts as passed for the RUN once its boss is defeated — the strict
 * mastery claim (quiz gate + retention) never holds the trail hostage.
 */
export function academyTourPosition(
  state: AcademyProgressState,
): AcademyTourPosition {
  for (let world = 0; world < NEETCODE_150_MANIFEST.realms.length; world++) {
    const realm = NEETCODE_150_MANIFEST.realms[world]
    const progress = selectRealmProgress(state, realm.id)
    if (isRealmRunPassed(progress)) continue

    const incompleteTrackIndex = realm.trackIds.findIndex(
      (trackId) => !selectTrackProgress(state, trackId).practiceComplete,
    )
    return {
      world,
      stage:
        incompleteTrackIndex >= 0
          ? incompleteTrackIndex
          : ACADEMY_BOSS_STAGE,
    }
  }

  return {
    world: NEETCODE_150_MANIFEST.realms.length,
    stage: 0,
  }
}

/** Game-facing projection that contains no legacy six-lesson mastery. */
export function academyWorldState(
  state: AcademyProgressState,
  worldIndex: number,
  options?: {
    /**
     * Treat the realm as reachable regardless of sequential unlocks (used by
     * the showcase-account override). All progress facts stay real.
     */
    assumeUnlocked?: boolean
  },
): WorldState {
  const realm = NEETCODE_150_MANIFEST.realms[worldIndex]
  if (!realm) {
    return {
      status: 'locked',
      unlocked: false,
      learnDone: false,
      quizStarted: false,
      mastered: false,
      mastery: 0,
      needsReview: false,
    }
  }

  const progress = selectRealmProgress(state, realm.id)
  const unlocked =
    options?.assumeUnlocked === true ||
    isAcademyRealmUnlocked(state, realm.id)
  const learnDone = progress.practicedTracks === 3
  const quizStarted = progress.quizAttemptCount > 0
  const mastered = progress.cleared
  const needsReview = quizStarted && !progress.quizPassed

  let status: WorldState['status']
  if (!unlocked) status = 'locked'
  else if (mastered) status = 'cleared'
  else if (!learnDone) status = progress.practicedTracks > 0 ? 'training' : 'new'
  else if (progress.knowledgePassed) status = 'bossReady'
  else if (needsReview) status = 'review'
  else if (quizStarted) status = 'bossFight'
  else status = 'bossReady'

  return {
    status,
    unlocked,
    learnDone,
    quizStarted,
    mastered,
    mastery: progress.quizBestScore,
    needsReview,
  }
}
