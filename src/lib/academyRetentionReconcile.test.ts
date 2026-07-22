import { describe, expect, it, vi } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  markMissionRetentionCloudVerified,
  recordMissionPractice,
  recordMissionRetention,
} from './academyProgress'
import {
  reconcileUnverifiedRetentions,
  selectUnverifiedRetainedMissions,
} from './academyRetentionReconcile'

const [PROBLEM_A, PROBLEM_B, PROBLEM_C] = NEETCODE_150_MANIFEST.problems.map(
  ({ id }) => id,
)
const ACQUIRED_AT = '2026-07-11T12:00:00.000Z'
const RETENTION_MS =
  NEETCODE_150_MANIFEST.masteryPolicy.delayedRetrievalMinimumHours *
  60 *
  60 *
  1000
const RETAINED_AT = new Date(
  Date.parse(ACQUIRED_AT) + RETENTION_MS,
).toISOString()

function withPractice(
  state: AcademyProgressState,
  problemId: ProblemId,
): AcademyProgressState {
  return recordMissionPractice(state, {
    problemId,
    acquiredAt: ACQUIRED_AT,
    practicedAt: ACQUIRED_AT,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
}

function withCompletion(
  state: AcademyProgressState,
  problemId: ProblemId,
): AcademyProgressState {
  return recordMissionRetention(withPractice(state, problemId), {
    problemId,
    retainedAt: RETAINED_AT,
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:${problemId}:retention`],
  })
}

describe('selectUnverifiedRetainedMissions', () => {
  it('returns only completions missing cloudVerifiedAt, sorted', () => {
    let state = withCompletion(emptyAcademyProgressState(), PROBLEM_A)
    state = withCompletion(state, PROBLEM_B)
    state = markMissionRetentionCloudVerified(state, PROBLEM_A)
    // Practice-only missions never appear: they have nothing to verify.
    state = withPractice(state, PROBLEM_C)
    expect(selectUnverifiedRetainedMissions(state)).toEqual([PROBLEM_B])
  })

  it('is empty when every completion is verified or none exist', () => {
    expect(
      selectUnverifiedRetainedMissions(emptyAcademyProgressState()),
    ).toEqual([])
    const verified = markMissionRetentionCloudVerified(
      withCompletion(emptyAcademyProgressState(), PROBLEM_A),
      PROBLEM_A,
    )
    expect(selectUnverifiedRetainedMissions(verified)).toEqual([])
  })
})

describe('reconcileUnverifiedRetentions', () => {
  it('marks each accepted completion cloud-verified', async () => {
    let state = withCompletion(emptyAcademyProgressState(), PROBLEM_A)
    state = withCompletion(state, PROBLEM_B)
    const save = vi.fn().mockResolvedValue({ status: 'ok' as const })

    const result = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state,
      save,
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(result.verified).toEqual([PROBLEM_A, PROBLEM_B].slice().sort())
    expect(result.failed).toEqual([])
    expect(result.unavailable).toBe(false)
    expect(result.state.missionCompletions[PROBLEM_A]?.cloudVerifiedAt).toBeTruthy()
    expect(result.state.missionCompletions[PROBLEM_B]?.cloudVerifiedAt).toBeTruthy()
    expect(selectUnverifiedRetainedMissions(result.state)).toEqual([])
  })

  it('isolates a rejected mission: the rest still verify', async () => {
    let state = withCompletion(emptyAcademyProgressState(), PROBLEM_A)
    state = withCompletion(state, PROBLEM_B)
    state = withCompletion(state, PROBLEM_C)
    const [first, second, third] = [PROBLEM_A, PROBLEM_B, PROBLEM_C]
      .slice()
      .sort()
    const errors: ProblemId[] = []
    const save = vi.fn(
      async (_userId: string, _state: AcademyProgressState, id: ProblemId) => {
        if (id === second) throw new Error('server rejected linked evidence')
        return { status: 'ok' as const }
      },
    )

    const result = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state,
      save,
      onError: (problemId) => errors.push(problemId),
    })

    expect(save).toHaveBeenCalledTimes(3)
    expect(result.verified).toEqual([first, third])
    expect(result.failed).toEqual([second])
    expect(errors).toEqual([second])
    expect(result.unavailable).toBe(false)
    expect(result.state.missionCompletions[first]?.cloudVerifiedAt).toBeTruthy()
    expect(result.state.missionCompletions[third]?.cloudVerifiedAt).toBeTruthy()
    expect(
      result.state.missionCompletions[second]?.cloudVerifiedAt,
    ).toBeUndefined()
  })

  it('stops immediately when the cloud is unavailable', async () => {
    let state = withCompletion(emptyAcademyProgressState(), PROBLEM_A)
    state = withCompletion(state, PROBLEM_B)
    const save = vi.fn().mockResolvedValue({
      status: 'unavailable' as const,
      reason: 'migration-missing' as const,
    })

    const result = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state,
      save,
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(result.verified).toEqual([])
    expect(result.unavailable).toBe(true)
    expect(selectUnverifiedRetainedMissions(result.state)).toHaveLength(2)
  })

  it('never calls the saver when nothing needs verification', async () => {
    const verified = markMissionRetentionCloudVerified(
      withCompletion(emptyAcademyProgressState(), PROBLEM_A),
      PROBLEM_A,
    )
    const save = vi.fn()

    const result = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state: verified,
      save,
    })

    expect(save).not.toHaveBeenCalled()
    expect(result.verified).toEqual([])
    expect(result.failed).toEqual([])
  })

  it('keeps the earliest verification timestamp on already-verified rows', async () => {
    // Re-running the pass must stay idempotent: a second reconciliation sees
    // no unverified completions and leaves the original receipt untouched.
    const state = withCompletion(emptyAcademyProgressState(), PROBLEM_A)
    const save = vi.fn().mockResolvedValue({ status: 'ok' as const })
    const first = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state,
      save,
    })
    const receipt = first.state.missionCompletions[PROBLEM_A]?.cloudVerifiedAt
    const second = await reconcileUnverifiedRetentions({
      userId: 'user-1',
      state: first.state,
      save,
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(second.state.missionCompletions[PROBLEM_A]?.cloudVerifiedAt).toBe(
      receipt,
    )
  })
})
