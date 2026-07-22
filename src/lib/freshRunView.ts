import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  missionRetentionAvailableAt,
  normalizeAcademyProgressState,
} from './academyProgress'
import {
  loadFreshRunState,
  normalizeQuestTour,
  type FreshRunState,
} from './questSession'
import {
  ACADEMY_EVIDENCE_VERSION,
  type AcademyProgressState,
  type BossDefeatEvidence,
  type MissionCompletionEvidence,
  type MissionPracticeEvidence,
  type NonEmptyAcademyLearningEvidenceIds,
  type RealmQuizEvidence,
} from '../types/academy'
import type { ProblemId, RealmId } from '../types/curriculum'

/* ============================================================================
   Fresh-run progress view.

   The RUN VIEW is what every read-side progress surface (levels page, 3D
   overworld beats/HUD/world map, boss entry, mission entry) presents while a
   fresh run is active. It serves both run controls:

   - "Reset run" must replicate the FULL brand-new-user experience: street
     missions present as unplayed and re-clear one by one, the leg HUD counts
     "mission 1 of 9" again, and realms re-lock ahead of the trail. On or
     ahead of the trail the view is a masked SUBSET of durable evidence — a
     mission shows as practiced only when the run itself earned it (replayed
     cleanly this run via the run ledger, or practiced for real AFTER the
     reset).

   - "Skip to realm N" must present everything BEHIND the run anchor as
     completed: realms 0..N-1 read as run-passed (missions done, boss down and
     rematchable) even when they were never durably played. Where durable
     evidence exists it is kept verbatim; only the GAPS are filled with
     clearly-synthetic run grants (`run-skip:*` sentinel IDs). The realm QUIZ
     is never granted — the strict mastery claim (assessment + retention)
     stays honest, so a skipped realm reads "Boss down", never "Mastered".

   Durable evidence itself is never touched; this is a read-side projection.
   Durable consumers (evidence recorders, cloud sync, certification) keep
   reading `academyProgress` directly, and their validators only accept real
   linked learning events — a synthesized grant can never become durable.
   ========================================================================== */

/** Sentinel timestamp for run-granted (skip) evidence — clearly synthetic. */
const RUN_GRANT_AT = '2000-01-01T00:00:00.000Z'

function runGrantIds(id: string): NonEmptyAcademyLearningEvidenceIds {
  return [`run-skip:${id}`]
}

function grantedPractice(problemId: ProblemId): MissionPracticeEvidence {
  const ids = runGrantIds(problemId)
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    problemId,
    acquiredAt: RUN_GRANT_AT,
    practicedAt: RUN_GRANT_AT,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: ids,
    transferEventIds: ids,
    codeTestEventIds: ids,
  }
}

/**
 * Granted completions read as retained AND cloud-verified so no surface ever
 * offers a retention check (or queues cloud reconciliation) for a mission the
 * player skipped past — those flows validate against durable evidence and
 * would dead-end.
 */
function grantedCompletion(
  practice: MissionPracticeEvidence,
): MissionCompletionEvidence {
  const retainedAt = missionRetentionAvailableAt(practice)
  return {
    ...practice,
    delayedRetrievalPassed: true,
    retainedAt,
    completedAt: retainedAt,
    delayedRetrievalEventIds: runGrantIds(practice.problemId),
    cloudVerifiedAt: retainedAt,
  }
}

function grantedBossDefeat(realmId: RealmId): BossDefeatEvidence {
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    realmId,
    defeatedAt: RUN_GRANT_AT,
    defeatIds: runGrantIds(realmId),
    learningEventIds: runGrantIds(realmId),
  }
}

export function freshRunProgressView(
  durable: AcademyProgressState,
  run: FreshRunState,
): AcademyProgressState {
  const state = normalizeAcademyProgressState(durable)
  const tour = normalizeQuestTour(run.tour)
  const realms = NEETCODE_150_MANIFEST.realms
  // Replay run finished — the view converges back to full durable progress.
  if (tour.world >= realms.length) return state

  const startedAtMs = Date.parse(run.startedAt)
  const replayed = new Set(run.missions)
  const missionPractices: Partial<
    Record<ProblemId, MissionPracticeEvidence>
  > = {}
  const missionCompletions: Partial<
    Record<ProblemId, MissionCompletionEvidence>
  > = {}
  const realmQuizzes: Partial<Record<RealmId, RealmQuizEvidence>> = {}
  const bossDefeats: Partial<Record<RealmId, BossDefeatEvidence>> = {}

  realms.forEach((realm, worldIndex) => {
    if (worldIndex > tour.world) return
    // A realm strictly behind the run anchor presents as RUN-PASSED whether it
    // was genuinely earned or skipped past: durable facts render verbatim and
    // only the gaps receive run grants (boss down, missions retained). The
    // quiz is never granted — mastery stays a real, durable claim.
    const skipped = worldIndex < tour.world
    if (skipped) {
      const quiz = state.realmQuizzes[realm.id]
      if (quiz) realmQuizzes[realm.id] = quiz
      bossDefeats[realm.id] =
        state.bossDefeats[realm.id] ?? grantedBossDefeat(realm.id)
    }
    realm.trackIds.forEach((trackId, part) => {
      const behind = skipped || part < tour.stage
      const problemIds =
        NEETCODE_150_TRACK_BY_ID.get(trackId)?.problemIds ?? []
      for (const problemId of problemIds) {
        const practice = state.missionPractices[problemId]
        if (!practice) {
          // Never durably practiced. Behind the anchor of a SKIPPED realm the
          // mission still presents as complete; a behind leg of the CURRENT
          // realm was genuinely re-cleared to get here, so nothing is granted.
          if (skipped) {
            const granted = grantedPractice(problemId)
            missionPractices[problemId] = granted
            missionCompletions[problemId] = grantedCompletion(granted)
          }
          continue
        }
        const earnedThisRun =
          replayed.has(problemId) ||
          (Number.isFinite(startedAtMs) &&
            Date.parse(practice.practicedAt) >= startedAtMs)
        if (!behind && !earnedThisRun) continue
        missionPractices[problemId] = practice
        const completion = state.missionCompletions[problemId]
        if (completion) missionCompletions[problemId] = completion
      }
    })
  })

  return {
    ...state,
    missionPractices,
    missionCompletions,
    realmQuizzes,
    bossDefeats,
  }
}

/**
 * The progress state read-side surfaces should present RIGHT NOW: the masked
 * fresh-run projection while a run is active (reset or skip), or normalized
 * durable progress otherwise. Read at mount/derivation time — the anchor only
 * changes through explicit run controls or overworld navigation.
 */
export function activeRunProgressView(
  durable: AcademyProgressState,
): AcademyProgressState {
  const run = loadFreshRunState()
  return run
    ? freshRunProgressView(durable, run)
    : normalizeAcademyProgressState(durable)
}
