import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  markMissionRetentionCloudVerified,
  normalizeAcademyProgressState,
} from './academyProgress'
import {
  upsertAcademyMissionCloud,
  type AcademyCloudWriteResult,
} from './cloudProgress'

/* ============================================================================
   Retention cloud-verification reconciliation.

   A mission completion earns `cloudVerifiedAt` only when the server RPC
   accepts its linked evidence. The moment-of-completion write can fail
   transiently (offline, RLS, server validation), leaving the completion
   stuck as "retained locally · cloud check needed" with no retry.

   This pass re-submits every locally-retained-but-unverified completion
   INDIVIDUALLY. Per-mission isolation matters: the bulk
   `merge_academy_progress` RPC is atomic, so one server-rejected mission
   aborts the whole batch — a single poisoned row must never block the other
   149 from verifying.
   ========================================================================== */

export type RetentionReconcileSaver = (
  userId: string,
  state: AcademyProgressState,
  problemId: ProblemId,
) => Promise<AcademyCloudWriteResult>

export type RetentionReconcileResult = {
  /** Input state with every accepted completion marked cloud-verified. */
  readonly state: AcademyProgressState
  /** Missions the server accepted during this pass. */
  readonly verified: readonly ProblemId[]
  /** Missions whose submission threw (server rejection / network error). */
  readonly failed: readonly ProblemId[]
  /** Cloud reported not-configured / migration-missing; pass aborted. */
  readonly unavailable: boolean
}

/** Completions that are durable locally but the server never accepted. */
export function selectUnverifiedRetainedMissions(
  state: AcademyProgressState,
): ProblemId[] {
  const normalized = normalizeAcademyProgressState(state)
  return Object.values(normalized.missionCompletions)
    .filter(
      (completion): completion is NonNullable<typeof completion> =>
        !!completion && !completion.cloudVerifiedAt,
    )
    .map((completion) => completion.problemId)
    .sort()
}

export async function reconcileUnverifiedRetentions(options: {
  readonly userId: string
  readonly state: AcademyProgressState
  readonly save?: RetentionReconcileSaver
  readonly onError?: (problemId: ProblemId, error: unknown) => void
}): Promise<RetentionReconcileResult> {
  const save = options.save ?? upsertAcademyMissionCloud
  let state = normalizeAcademyProgressState(options.state)
  const pending = selectUnverifiedRetainedMissions(state)
  const verified: ProblemId[] = []
  const failed: ProblemId[] = []
  for (const problemId of pending) {
    try {
      const result = await save(options.userId, state, problemId)
      if (result.status !== 'ok') {
        // Unavailability is global (no config / missing migration): stop
        // instead of issuing 149 more calls that will fail the same way.
        return { state, verified, failed, unavailable: true }
      }
      state = markMissionRetentionCloudVerified(state, problemId)
      verified.push(problemId)
    } catch (error) {
      // Per-mission failure (e.g. the server rejected this mission's linked
      // evidence). Record it and keep going — other missions must not be
      // blocked by one poisoned row.
      failed.push(problemId)
      options.onError?.(problemId, error)
    }
  }
  return { state, verified, failed, unavailable: false }
}
