import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  emptyAcademyProgressState,
  recordMissionPractice as applyMissionPractice,
} from '../lib/academyProgress'
import { resolveAcademyMissionRoute } from '../lib/academyQuest'
import { freshRunProgressView } from '../lib/freshRunView'
import {
  loadFreshRunState,
  recordFreshRunMissionCleared,
  startFreshQuestRun,
} from '../lib/questSession'
import type { AcademyMissionRetentionInput } from '../types/academy'
import type { Lesson } from '../types/lesson'
import type { LessonProgress } from '../types/progress'
import {
  finishAcademyMission,
  missionPracticeFromResult,
  missionRetentionFromResult,
  resolveAcademyMissionAccess,
  resolveMissionSection,
  retentionRunnerLesson,
  type AcademyMissionFinishDeps,
} from './useAcademyMissionFlow'
// Parity fixtures: the literal practice/retention inputs encode what the
// pre-refactor AcademyMissionPage produced for these LessonResults. The flow
// must keep them byte-for-byte.
import {
  cleanPassResult,
  EXPECTED_PRACTICE_INPUT,
  EXPECTED_RETENTION_INPUT,
  hintedResult,
  missedTransferResult,
  missionLesson,
  PRACTICE_GUARD_MESSAGE,
  RETENTION_GUARD_MESSAGE,
  retentionPassResult,
  revealedTransferResult,
  reviewOnlyRerunResult,
} from './useAcademyMissionFlow.fixtures'

function finishDeps(
  overrides: Partial<AcademyMissionFinishDeps> = {},
): AcademyMissionFinishDeps {
  return {
    lesson: missionLesson,
    route: { realmId: 'realm1', trackId: 'arrays-hashing' },
    retentionMode: false,
    nextProblem: { leetcodeSlug: 'valid-anagram' },
    recordMissionPractice: vi.fn(async () => {}),
    recordMissionRetention: vi.fn(async () => {}),
    markCheckpointReturn: vi.fn(),
    navigate: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
}

describe('academy mission evidence parity with the pre-refactor page', () => {
  it('builds the exact practice input for a clean pass', () => {
    expect(missionPracticeFromResult(missionLesson, cleanPassResult)).toEqual(
      EXPECTED_PRACTICE_INPUT,
    )
  })

  it('records that practice input verbatim and advances to the next mission', async () => {
    const deps = finishDeps()
    await finishAcademyMission(deps, cleanPassResult)

    expect(deps.recordMissionPractice).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(deps.recordMissionPractice).mock.calls[0]?.[0],
    ).toEqual(EXPECTED_PRACTICE_INPUT)
    expect(deps.navigate).toHaveBeenCalledWith(
      '/academy/realm1/arrays-hashing/valid-anagram',
      { replace: true },
    )
    expect(deps.markCheckpointReturn).not.toHaveBeenCalled()
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('marks the checkpoint return on the last mission of the track', async () => {
    const deps = finishDeps({ nextProblem: null })
    await finishAcademyMission(deps, cleanPassResult)

    expect(deps.recordMissionPractice).toHaveBeenCalledTimes(1)
    expect(deps.markCheckpointReturn).toHaveBeenCalledWith(
      'realm1',
      'arrays-hashing',
    )
    expect(deps.navigate).toHaveBeenCalledWith('/quest', { replace: true })
  })

  it('records hinted acquisition — hints are learning, not cheating', () => {
    expect(missionPracticeFromResult(missionLesson, hintedResult)).toEqual(
      EXPECTED_PRACTICE_INPUT,
    )
  })

  it('records a retried-but-passing python challenge (10 attempts are authored in)', async () => {
    expect(
      missionPracticeFromResult(missionLesson, missedTransferResult),
    ).toEqual(EXPECTED_PRACTICE_INPUT)

    const deps = finishDeps()
    await finishAcademyMission(deps, missedTransferResult)
    expect(deps.recordMissionPractice).toHaveBeenCalledTimes(1)
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('rejects a revealed python answer without recording', async () => {
    expect(
      missionPracticeFromResult(missionLesson, revealedTransferResult),
    ).toBeNull()

    const deps = finishDeps()
    await finishAcademyMission(deps, revealedTransferResult)
    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.onError).toHaveBeenCalledWith(PRACTICE_GUARD_MESSAGE)
  })

  it('rejects a review-only rerun that skipped required steps', async () => {
    expect(
      missionPracticeFromResult(missionLesson, reviewOnlyRerunResult),
    ).toBeNull()

    const deps = finishDeps()
    await finishAcademyMission(deps, reviewOnlyRerunResult)
    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
    expect(deps.onError).toHaveBeenCalledWith(PRACTICE_GUARD_MESSAGE)
  })

  it('prefers the retry callback over the dead-end error when provided', async () => {
    const onPracticeRejected = vi.fn()
    const deps = finishDeps({ onPracticeRejected })
    await finishAcademyMission(deps, revealedTransferResult)

    expect(onPracticeRejected).toHaveBeenCalledTimes(1)
    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('requires a result in both modes, exactly like the page guards', async () => {
    const practiceDeps = finishDeps()
    await finishAcademyMission(practiceDeps, undefined)
    expect(practiceDeps.recordMissionPractice).not.toHaveBeenCalled()
    expect(practiceDeps.onError).toHaveBeenCalledWith(PRACTICE_GUARD_MESSAGE)

    const retentionDeps = finishDeps({ retentionMode: true })
    await finishAcademyMission(retentionDeps, undefined)
    expect(retentionDeps.recordMissionRetention).not.toHaveBeenCalled()
    expect(retentionDeps.onError).toHaveBeenCalledWith(RETENTION_GUARD_MESSAGE)
  })

  it('does nothing without a resolved route or loaded lesson', async () => {
    const noRoute = finishDeps({ route: null })
    await finishAcademyMission(noRoute, cleanPassResult)
    const noLesson = finishDeps({ lesson: null })
    await finishAcademyMission(noLesson, cleanPassResult)

    for (const deps of [noRoute, noLesson]) {
      expect(deps.recordMissionPractice).not.toHaveBeenCalled()
      expect(deps.navigate).not.toHaveBeenCalled()
      expect(deps.onError).not.toHaveBeenCalled()
    }
  })

  it('builds the exact retention input for a clean delayed-retrieval pass', () => {
    expect(
      missionRetentionFromResult(missionLesson, retentionPassResult),
    ).toEqual(EXPECTED_RETENTION_INPUT)
  })

  it('records that retention input verbatim and returns to the track', async () => {
    const deps = finishDeps({ retentionMode: true })
    await finishAcademyMission(deps, retentionPassResult)

    expect(deps.recordMissionRetention).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(deps.recordMissionRetention).mock.calls[0]?.[0],
    ).toEqual(EXPECTED_RETENTION_INPUT)
    expect(deps.navigate).toHaveBeenCalledWith('/academy/realm1/arrays-hashing', {
      replace: true,
    })
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('surfaces a too-early retention rejection instead of navigating', async () => {
    // ProgressContext.recordMissionRetention throws this exact message when
    // the delayed-retrieval policy window has not elapsed (or cloud pending
    // state rejects the evidence); the flow must surface it as loadError.
    const recordMissionRetention = vi.fn(
      async (_input: AcademyMissionRetentionInput) => {
        throw new Error(
          'Delayed retrieval is not due or did not satisfy policy',
        )
      },
    )
    const deps = finishDeps({ retentionMode: true, recordMissionRetention })
    await finishAcademyMission(deps, retentionPassResult)

    expect(
      vi.mocked(recordMissionRetention).mock.calls[0]?.[0],
    ).toEqual(EXPECTED_RETENTION_INPUT)
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.onError).toHaveBeenCalledWith(
      'Delayed retrieval is not due or did not satisfy policy',
    )
  })

  it('reports non-Error rejections with the page fallback copy', async () => {
    const recordMissionPractice = vi.fn(async () => {
      // oxlint-disable-next-line no-throw-literal
      throw 'offline'
    })
    const deps = finishDeps({ recordMissionPractice })
    await finishAcademyMission(deps, cleanPassResult)
    expect(deps.onError).toHaveBeenCalledWith('Mission evidence was not saved.')
  })
})

describe('review-mode replays never record evidence', () => {
  it('records nothing and returns to the track, marking the replay clear', async () => {
    const markReviewReturn = vi.fn()
    const deps = finishDeps({ reviewMode: true, markReviewReturn })
    await finishAcademyMission(deps, cleanPassResult)

    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
    expect(deps.recordMissionRetention).not.toHaveBeenCalled()
    expect(deps.markCheckpointReturn).not.toHaveBeenCalled()
    expect(markReviewReturn).toHaveBeenCalledWith('realm1', 'arrays-hashing')
    expect(deps.navigate).toHaveBeenCalledWith('/academy/realm1/arrays-hashing', {
      replace: true,
    })
    expect(deps.onError).not.toHaveBeenCalled()
  })

  it('returns to the city for beat-entered replays', async () => {
    const deps = finishDeps({ reviewMode: true, returnToCity: true })
    await finishAcademyMission(deps, cleanPassResult)
    expect(deps.navigate).toHaveBeenCalledWith('/quest', { replace: true })
    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
  })

  it('logs a clean replay into the fresh-run ledger by problem id', async () => {
    const recordFreshRunMission = vi.fn()
    const deps = finishDeps({ reviewMode: true, recordFreshRunMission })
    await finishAcademyMission(deps, cleanPassResult)
    expect(recordFreshRunMission).toHaveBeenCalledWith(
      'problem:contains-duplicate',
    )

    const withheld = vi.fn()
    await finishAcademyMission(
      finishDeps({ reviewMode: true, recordFreshRunMission: withheld }),
      revealedTransferResult,
    )
    expect(withheld).not.toHaveBeenCalled()
  })

  it('withholds the replay clear when the run was not a clean full pass', async () => {
    const markReviewReturn = vi.fn()
    const deps = finishDeps({ reviewMode: true, markReviewReturn })
    await finishAcademyMission(deps, revealedTransferResult)

    expect(markReviewReturn).not.toHaveBeenCalled()
    expect(deps.recordMissionPractice).not.toHaveBeenCalled()
    expect(deps.onError).not.toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith('/academy/realm1/arrays-hashing', {
      replace: true,
    })
  })

  it('takes precedence over retention mode without touching retention evidence', async () => {
    const deps = finishDeps({ reviewMode: true, retentionMode: true })
    await finishAcademyMission(deps, retentionPassResult)
    expect(deps.recordMissionRetention).not.toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith('/academy/realm1/arrays-hashing', {
      replace: true,
    })
  })
})

describe('practice clears advance the fresh (reset) run', () => {
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

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ledgers a successful 2D practice clear by problem id', async () => {
    const recordFreshRunMission = vi.fn()
    const deps = finishDeps({ recordFreshRunMission })
    await finishAcademyMission(deps, cleanPassResult)

    expect(deps.recordMissionPractice).toHaveBeenCalledTimes(1)
    expect(recordFreshRunMission).toHaveBeenCalledWith(
      'problem:contains-duplicate',
    )

    // A rejected run never touches the ledger.
    const withheld = vi.fn()
    await finishAcademyMission(
      finishDeps({ recordFreshRunMission: withheld }),
      revealedTransferResult,
    )
    expect(withheld).not.toHaveBeenCalled()
  })

  it('re-practicing a durably-practiced mission reads completed in the run view', async () => {
    // The mission was durably practiced long BEFORE the reset. Durable
    // practice merges practicedAt to the EARLIEST timestamp, so the run
    // view's frontier (practiced-after-reset) check can never count this
    // re-clear — only the run ledger written on the practice path can.
    const durable = applyMissionPractice(
      emptyAcademyProgressState(),
      EXPECTED_PRACTICE_INPUT,
    )
    startFreshQuestRun()

    const maskedBefore = freshRunProgressView(durable, loadFreshRunState()!)
    expect(
      maskedBefore.missionPractices['problem:contains-duplicate'],
    ).toBeUndefined()

    const deps = finishDeps({
      recordFreshRunMission: recordFreshRunMissionCleared,
      // ProgressContext re-merges evidence: earliest timestamps win, so the
      // durable snapshot is unchanged by the re-practice.
      recordMissionPractice: vi.fn(async () => {}),
    })
    await finishAcademyMission(deps, cleanPassResult)

    const view = freshRunProgressView(durable, loadFreshRunState()!)
    expect(
      view.missionPractices['problem:contains-duplicate'],
    ).toEqual(durable.missionPractices['problem:contains-duplicate'])
    expect(
      view.missionCompletions['problem:contains-duplicate'],
    ).toEqual(durable.missionCompletions['problem:contains-duplicate'])
  })
})

describe('retention lesson override parity', () => {
  it('forces the single delayed-retrieval step with the Retention Check title', () => {
    const override = retentionRunnerLesson(missionLesson)
    expect(override?.title).toBe('Contains Duplicate Retention Check')
    expect(override?.steps.map(({ id }) => id)).toEqual(['step-retention'])
  })

  it('returns null when the mission has no authored delayed-retrieval step', () => {
    const withoutRetention: Lesson = {
      ...missionLesson,
      steps: missionLesson.steps.filter(({ id }) => id !== 'step-retention'),
    }
    expect(retentionRunnerLesson(withoutRetention)).toBeNull()
  })
})

describe('mission section resolution parity', () => {
  const completedProgress: LessonProgress = {
    lessonId: missionLesson.id,
    status: 'completed',
    currentStepIndex: 3,
    completedStepIds: missionLesson.steps.map(({ id }) => id),
    correctCount: 4,
    wrongCount: 0,
    totalAttempts: 4,
    correctFirstTry: 4,
    accuracy: 100,
    masteryScore: 100,
    unlockNextLesson: true,
  }

  it('matches the page: retention forces quiz, learn completion resumes quiz', () => {
    expect(resolveMissionSection(true, undefined, missionLesson)).toBe('quiz')
    expect(resolveMissionSection(false, undefined, missionLesson)).toBe('learn')
    expect(resolveMissionSection(false, completedProgress, missionLesson)).toBe(
      'quiz',
    )
  })
})

describe('mission access resolution parity', () => {
  const problems = NEETCODE_150_MANIFEST.problems
  const missionOne = problems.find(({ globalOrder }) => globalOrder === 1)!
  const missionTwo = problems.find(({ globalOrder }) => globalOrder === 2)!
  const realmOne = NEETCODE_150_MANIFEST.realms[0]
  const secondCheckpointProblem = problems.find(
    ({ trackId }) => trackId === realmOne.trackIds[1],
  )!

  function routeFor(problem: typeof missionOne) {
    return resolveAcademyMissionRoute(
      problem.realmId,
      problem.trackId,
      problem.leetcodeSlug,
    )
  }

  function accessInput(
    overrides: Partial<Parameters<typeof resolveAcademyMissionAccess>[0]> = {},
  ): Parameters<typeof resolveAcademyMissionAccess>[0] {
    return {
      route: routeFor(missionOne),
      ready: true,
      isGuest: false,
      isShowcaseAccount: false,
      academyProgress: emptyAcademyProgressState(),
      entryAuthorized: true,
      ...overrides,
    }
  }

  it('passes route redirects through untouched', () => {
    const redirect = resolveAcademyMissionRoute('nope', undefined, undefined)
    expect(redirect.kind).toBe('redirect')
    if (redirect.kind !== 'redirect') return
    expect(resolveAcademyMissionAccess(accessInput({ route: redirect }))).toEqual({
      kind: 'redirect',
      to: redirect.to,
      notice: redirect.notice,
    })
  })

  it('reports loading until progress is ready', () => {
    expect(
      resolveAcademyMissionAccess(accessInput({ ready: false })).kind,
    ).toBe('loading')
  })

  it('locks later checkpoints until earlier tracks are practiced', () => {
    expect(
      resolveAcademyMissionAccess(
        accessInput({ route: routeFor(secondCheckpointProblem) }),
      ).kind,
    ).toBe('checkpoint-locked')
  })

  it('lets the showcase account into any existing checkpoint', () => {
    expect(
      resolveAcademyMissionAccess(
        accessInput({
          route: routeFor(secondCheckpointProblem),
          isShowcaseAccount: true,
        }),
      ).kind,
    ).toBe('authorized')
  })

  it('blocks guests beyond the mission-1 teach preview', () => {
    expect(
      resolveAcademyMissionAccess(
        accessInput({ route: routeFor(missionTwo), isGuest: true }),
      ).kind,
    ).toBe('guest-blocked')
    expect(
      resolveAcademyMissionAccess(accessInput({ isGuest: true })).kind,
    ).toBe('authorized')
  })

  it('requires the physical Code City entry token last', () => {
    const access = resolveAcademyMissionAccess(
      accessInput({ entryAuthorized: false }),
    )
    expect(access.kind).toBe('entry-blocked')
    if (access.kind === 'entry-blocked') {
      expect(access.route.problem.id).toBe(missionOne.id)
    }
  })
})
