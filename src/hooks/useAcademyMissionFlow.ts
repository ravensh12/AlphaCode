import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  NEETCODE_150_PROBLEM_BY_ID,
  loadProblemLesson,
  NEETCODE_150_MANIFEST,
} from '../content/curricula/neetcode150'
import { compileProblemLesson } from '../content/curricula/problemLessonCompiler'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import {
  academyMissionPath,
  academyTrackPath,
  checkpointIndexForTrack,
  resolveAcademyMissionRoute,
  worldIndexForRealmId,
  type AcademyRouteRedirect,
  type ValidAcademyMissionRoute,
} from '../lib/academyQuest'
import {
  canAccessAcademyMissionEntryWithShowcase,
  canEnterAcademyCheckpointWithShowcase,
} from '../lib/showcaseOverride'
import { isLearnComplete, type CourseSection } from '../lib/lessonSections'
import {
  markAcademyCheckpointReturn,
  markAcademyReviewReturn,
  recordFreshRunMissionCleared,
} from '../lib/questSession'
import {
  isMissionRetentionDue,
  missionRetentionAvailableAt,
} from '../lib/academyProgress'
import { activeRunProgressView } from '../lib/freshRunView'
import {
  makeMissionStashHandle,
  type MissionStashHandle,
} from '../lib/missionStash'
import { assessmentEvidenceKinds } from '../types/assessment'
import type {
  AcademyMissionPracticeInput,
  AcademyMissionRetentionInput,
  AcademyProgressState,
} from '../types/academy'
import type { ProblemSummary, RealmId, TrackId } from '../types/curriculum'
import type { Lesson } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import type { LessonResult } from './useLessonEngine'
import { useRetentionClock } from './useRetentionClock'

/**
 * Headless orchestration for one academy mission, extracted verbatim from
 * AcademyMissionPage so other surfaces (e.g. the Living Code City) can run the
 * same load → authorize → practice/retain → record-evidence flow without the
 * page markup. Behavior parity with the pre-extraction page is pinned by
 * useAcademyMissionFlow.test.ts.
 */

const REQUIRED_MISSION_EVIDENCE = [
  'acquisition',
  'independent-transfer',
  'code-tests',
] as const

function requiredMissionStepIds(lesson: Lesson): string[] {
  return REQUIRED_MISSION_EVIDENCE.map(
    (evidenceKind) =>
      lesson.steps.find(
        (step) =>
          !!step.assessment &&
          assessmentEvidenceKinds(step.assessment).includes(evidenceKind),
      )?.id,
  ).filter((id): id is string => !!id)
}

/**
 * Evidence that counts toward mission completion: the assessment was resolved
 * by a genuinely CORRECT answer, not by giving up (revealed answers resolve a
 * step but prove nothing). Retries and hints are allowed — the authored
 * failure policies grant up to 10 attempts on the Python challenge, so wrong
 * tries are an expected part of the work, not a disqualifier. First-try
 * cleanliness still feeds the learner model and badges; it just doesn't
 * gate whether the mission counts.
 */
function passingEvidence(
  result: LessonResult | undefined,
): NonNullable<LessonResult['assessmentEvidence']> {
  return (result?.assessmentEvidence ?? []).filter(
    (evidence) =>
      evidence.resolved && evidence.isCorrect && !evidence.revealed,
  )
}

export function missionPracticeFromResult(
  lesson: Lesson,
  result: LessonResult | undefined,
): AcademyMissionPracticeInput | null {
  if (!result) return null
  const required = requiredMissionStepIds(lesson)
  const reviewById = new Map(
    result.stepReviews.map((review) => [review.id, review]),
  )
  // Every required step must appear in this run's reviews — a partial review
  // rerun (only previously-missed steps) can never log a fresh practice.
  if (
    required.length !== REQUIRED_MISSION_EVIDENCE.length ||
    !required.every((stepId) => reviewById.has(stepId))
  ) {
    return null
  }

  const evidence = passingEvidence(result)
  const acquisition = evidence.filter((item) =>
    item.evidenceKinds.includes('acquisition'),
  )
  const sharedPython = evidence.filter(
    (item) =>
      item.assessmentKind === 'pythonCode' &&
      item.evidenceKinds.includes('independent-transfer') &&
      item.evidenceKinds.includes('code-tests'),
  )
  if (acquisition.length === 0 || sharedPython.length === 0) return null

  const acquisitionEventIds = acquisition.map(({ eventId }) => eventId)
  const pythonEventIds = sharedPython.map(({ eventId }) => eventId)
  const acquiredAt = acquisition.map(({ occurredAt }) => occurredAt).sort()[0]
  const practicedAt = [...acquisition, ...sharedPython]
    .map(({ occurredAt }) => occurredAt)
    .sort()
    .at(-1)
  const problemId = lesson.contentRef?.problemId
  if (!problemId || !acquiredAt || !practicedAt) return null
  return {
    problemId,
    acquiredAt,
    practicedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds,
    transferEventIds: pythonEventIds,
    codeTestEventIds: pythonEventIds,
  }
}

export function missionRetentionFromResult(
  lesson: Lesson,
  result: LessonResult | undefined,
): AcademyMissionRetentionInput | null {
  const evidence = passingEvidence(result).filter((item) =>
    item.evidenceKinds.includes('delayed-retrieval'),
  )
  const problemId = lesson.contentRef?.problemId
  const retainedAt = evidence.map(({ occurredAt }) => occurredAt).sort().at(-1)
  if (!problemId || evidence.length === 0 || !retainedAt) return null
  return {
    problemId,
    retainedAt,
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: evidence.map(({ eventId }) => eventId),
  }
}

export function missionAssessmentsPassed(
  lesson: Lesson,
  result: LessonResult | undefined,
): boolean {
  return missionPracticeFromResult(lesson, result) !== null
}

export function canRecoverMissionCompletion(
  lesson: Lesson,
  progress: LessonProgress | undefined,
): boolean {
  // Legacy lesson snapshots do not contain immutable learning-event IDs.
  // Treating them as academy evidence would fabricate an audit trail.
  void lesson
  void progress
  return false
}

/** Which section a freshly loaded mission opens in. */
export function resolveMissionSection(
  retentionMode: boolean,
  saved: LessonProgress | undefined,
  compiled: Lesson,
): 'learn' | 'quiz' {
  return retentionMode || isLearnComplete(saved, compiled) ? 'quiz' : 'learn'
}

/**
 * Retention mode runs only the authored delayed-retrieval step. Returns null
 * when the mission does not contain one.
 */
export function retentionRunnerLesson(lesson: Lesson): Lesson | null {
  const delayedRetrievalStep = lesson.steps.find(
    (step) =>
      !!step.assessment &&
      assessmentEvidenceKinds(step.assessment).includes('delayed-retrieval'),
  )
  if (!delayedRetrievalStep) return null
  return {
    ...lesson,
    title: `${lesson.title} Retention Check`,
    steps: [delayedRetrievalStep],
  }
}

/**
 * Authorization for the mission route, in the exact order the page renders
 * its gates: redirect → progress loading → academy checkpoint sequencing →
 * guest mission-1 teach preview → physical Code City entry.
 */
export type AcademyMissionAccess =
  | { kind: 'redirect'; to: string; notice: string }
  | { kind: 'loading'; route: ValidAcademyMissionRoute }
  | { kind: 'checkpoint-locked'; route: ValidAcademyMissionRoute }
  | { kind: 'guest-blocked'; route: ValidAcademyMissionRoute }
  | { kind: 'entry-blocked'; route: ValidAcademyMissionRoute }
  | { kind: 'authorized'; route: ValidAcademyMissionRoute }

export function resolveAcademyMissionAccess(input: {
  route: ValidAcademyMissionRoute | AcademyRouteRedirect
  ready: boolean
  isGuest: boolean
  isShowcaseAccount: boolean
  academyProgress: AcademyProgressState
  /**
   * The active run's progress view (see freshRunView.ts). When provided, the
   * checkpoint sequencing gate also accepts it — a "Skip to realm" run
   * presents skipped realms as run-passed, opening their checkpoints for
   * replay. Entry only ever widens; durable access is never revoked.
   */
  runProgress?: AcademyProgressState
  entryAuthorized: boolean
}): AcademyMissionAccess {
  const { route, entryAuthorized } = input
  if (route.kind === 'redirect') {
    return { kind: 'redirect', to: route.to, notice: route.notice }
  }
  if (!input.ready) return { kind: 'loading', route }

  const worldIndex = worldIndexForRealmId(route.realm.id)
  const checkpointIndex = checkpointIndexForTrack(
    route.realm.id,
    route.track.id,
  )
  if (
    !canEnterAcademyCheckpointWithShowcase(
      input.isShowcaseAccount,
      input.academyProgress,
      worldIndex,
      checkpointIndex,
    ) &&
    !(
      input.runProgress &&
      canEnterAcademyCheckpointWithShowcase(
        input.isShowcaseAccount,
        input.runProgress,
        worldIndex,
        checkpointIndex,
      )
    )
  ) {
    return { kind: 'checkpoint-locked', route }
  }

  if (input.isGuest && route.problem.globalOrder !== 1) {
    return { kind: 'guest-blocked', route }
  }

  if (!entryAuthorized) return { kind: 'entry-blocked', route }
  return { kind: 'authorized', route }
}

export type AcademyMissionFinishDeps = {
  lesson: Lesson | null
  route: { realmId: RealmId; trackId: TrackId } | null
  retentionMode: boolean
  /**
   * Non-recording replay of an already practiced/completed mission: no
   * evidence is written, existing completion stays untouched. A cleanly
   * passed replay quiz marks the review return so a fresh (reset) run can
   * advance its replay trail.
   */
  reviewMode?: boolean
  markReviewReturn?: (realmId: RealmId, trackId: TrackId) => void
  /**
   * Logs a cleanly replayed mission into the fresh (reset) run's ledger so
   * the overworld's street trail advances one MISSION at a time. No-op when
   * no fresh run is active; never writes durable evidence.
   */
  recordFreshRunMission?: (problemId: string) => void
  /**
   * Mission was entered from an encounter beat in the 3D city (?from=city):
   * a successful practice returns to the overworld instead of chaining into
   * the next 2D mission — the next beat waits down the street.
   */
  returnToCity?: boolean
  nextProblem: Pick<ProblemSummary, 'leetcodeSlug'> | null
  recordMissionPractice: (input: AcademyMissionPracticeInput) => Promise<void>
  recordMissionRetention: (input: AcademyMissionRetentionInput) => Promise<void>
  markCheckpointReturn: (realmId: RealmId, trackId: TrackId) => void
  navigate: (to: string, options: { replace: boolean }) => void
  onError: (message: string) => void
  /**
   * The finished run can't count as practice (e.g. a review-only rerun that
   * skipped required steps, or a revealed answer). When provided, the host
   * restarts a fresh full quiz instead of surfacing a dead-end error page.
   */
  onPracticeRejected?: () => void
  /**
   * Drops the mission's in-flight stash (draft answers + tutor chat) once the
   * run is settled — evidence recorded, or a rejected run restarting fresh.
   * Never called on the error path, so an unsaved draft survives a retry.
   */
  clearStash?: () => void
}

/**
 * Quiz-completion orchestration, verbatim from the page's finishMission:
 * every guard, error message, evidence input, and navigation is preserved.
 */
export async function finishAcademyMission(
  deps: AcademyMissionFinishDeps,
  result?: LessonResult,
): Promise<void> {
  const { lesson, route } = deps
  if (!route || !lesson) return
  try {
    if (deps.reviewMode) {
      // Replay runs record nothing — completion evidence already exists and
      // must not be re-written. A cleanly passed full quiz still counts as a
      // replay clear for the fresh-run trail: the mission joins the run's
      // ledger (advancing the street trail one beat) and the review-return
      // signal lets the overworld advance the checkpoint when the leg is done.
      if (missionPracticeFromResult(lesson, result)) {
        const problemId = lesson.contentRef?.problemId
        if (problemId) deps.recordFreshRunMission?.(problemId)
        deps.markReviewReturn?.(route.realmId, route.trackId)
      }
      deps.navigate(
        deps.returnToCity
          ? '/quest'
          : academyTrackPath(route.realmId, route.trackId),
        { replace: true },
      )
      return
    }

    if (deps.retentionMode) {
      const retention = missionRetentionFromResult(lesson, result)
      if (!retention) {
        throw new Error(
          'Pass the delayed-retrieval check cleanly before this mission can be retained.',
        )
      }
      await deps.recordMissionRetention(retention)
      deps.clearStash?.()
      deps.navigate(academyTrackPath(route.realmId, route.trackId), {
        replace: true,
      })
      return
    }

    const practice = missionPracticeFromResult(lesson, result)
    if (!practice) {
      if (deps.onPracticeRejected) {
        // The rejected run restarts as a fresh full quiz — stale drafts from
        // the rejected attempt must not reseed it.
        deps.clearStash?.()
        deps.onPracticeRejected()
        return
      }
      throw new Error(
        'This mission still needs clean acquisition plus one Python event that passes transfer and code tests.',
      )
    }
    await deps.recordMissionPractice(practice)
    // A fresh (reset) run also advances on a 2D practice clear. Durable
    // practice merges timestamps to the EARLIEST occurrence, so a
    // re-practiced mission's practicedAt predates the run start and the run
    // view's frontier timestamp check can never count it — the run ledger is
    // the signal that does. No-op when no fresh run is active.
    deps.recordFreshRunMission?.(practice.problemId)
    deps.clearStash?.()

    if (deps.returnToCity) {
      if (!deps.nextProblem) {
        deps.markCheckpointReturn(route.realmId, route.trackId)
      }
      deps.navigate('/quest', { replace: true })
      return
    }

    if (deps.nextProblem) {
      deps.navigate(
        academyMissionPath(
          route.realmId,
          route.trackId,
          deps.nextProblem.leetcodeSlug,
        ),
        { replace: true },
      )
      return
    }

    deps.markCheckpointReturn(route.realmId, route.trackId)
    deps.navigate('/quest', { replace: true })
  } catch (error) {
    deps.onError(
      error instanceof Error ? error.message : 'Mission evidence was not saved.',
    )
  }
}

/** The exact prop bundle AcademyMissionPage passes to LessonRunner. */
export type AcademyMissionRunnerProps = {
  key: string
  lessonId: string
  lessonOverride: Lesson
  section: CourseSection
  initial: LessonProgress | undefined
  onSave: (progress: LessonProgress) => void
  onAttempt: (attempt: AttemptRecord) => void
  streakCurrent: number
  nextLessonTitle: string | null
  isLastLesson: boolean
  onNext: (() => void) | undefined
  onTakeQuiz: () => void
  onExit: () => void
  onQuizComplete: (result?: LessonResult) => Promise<void>
  assessmentMetadata: { academyMode: 'retention' | 'practice' | 'review' }
  /** In-flight draft persistence — practice runs only. */
  stash: MissionStashHandle | null
  /** AI tutor availability — never on retention checks. */
  tutor: { title: string } | null
}

export type AcademyMissionFlow = {
  access: AcademyMissionAccess
  routeNotice: string | undefined
  /** Set after a finished run couldn't count — a fresh full quiz is live. */
  practiceRetryNotice: string | null
  retentionMode: boolean
  /**
   * Replay of an already practiced/completed mission (?mode=review). The full
   * lesson and quiz run without recording evidence or touching completion.
   */
  reviewMode: boolean
  /** Entered from an encounter beat in the 3D city (?from=city). */
  fromCity: boolean
  cloudEnabled: boolean
  isGuest: boolean
  missionPracticed: boolean
  missionCompleted: boolean
  retentionCloudVerified: boolean
  /** Retention clock: when the delayed-retrieval check unlocks, and "now". */
  retentionAvailableAt: string | null
  retentionNow: number
  retentionDue: boolean
  lesson: Lesson | null
  loadError: string | null
  section: 'learn' | 'quiz'
  previewFinished: boolean
  /** Retention mode was requested but the mission has no authored check. */
  retentionUnavailable: boolean
  nextProblem: ProblemSummary | null
  lessonRunner: AcademyMissionRunnerProps | null
  finishMission: (result?: LessonResult) => Promise<void>
}

export function useAcademyMissionFlow(): AcademyMissionFlow {
  const { realmId, trackId, problemSlug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { isGuest, isShowcaseAccount, identityId } = useAuth()
  const {
    ready,
    cloudEnabled,
    academyProgress,
    lessons,
    getLessonProgress,
    saveLessonProgress,
    logAttempt,
    recordMissionPractice,
    recordMissionRetention,
    streak,
  } = useProgress()
  const route = resolveAcademyMissionRoute(realmId, trackId, problemSlug)
  const routeNotice = (
    location.state as { academyNotice?: string } | null
  )?.academyNotice
  const validRoute = route.kind === 'valid' ? route : null
  const problemId = validRoute?.problem.id ?? null
  const retentionMode = searchParams.get('mode') === 'retention'
  const reviewRequested = searchParams.get('mode') === 'review'
  /** Review replays open at the quiz directly with ?mode=review&start=quiz. */
  const reviewStartAtQuiz = searchParams.get('start') === 'quiz'
  const fromCity = searchParams.get('from') === 'city'
  const missionPracticed =
    !!validRoute &&
    !!academyProgress.missionPractices[validRoute.problem.id]
  const missionCompleted =
    !!validRoute &&
    !!academyProgress.missionCompletions[validRoute.problem.id]
  // Review mode is a privilege of PRIOR evidence: an unpracticed mission
  // requested with ?mode=review simply runs as normal practice.
  const reviewMode = reviewRequested && (missionPracticed || missionCompleted)
  const retentionCloudVerified =
    !!validRoute &&
    !!academyProgress.missionCompletions[validRoute.problem.id]?.cloudVerifiedAt
  const practice =
    validRoute?.problem.id == null
      ? undefined
      : academyProgress.missionPractices[validRoute.problem.id]
  const retentionAvailableAt = practice
    ? missionRetentionAvailableAt(practice)
    : null
  const retentionNow = useRetentionClock(retentionAvailableAt)
  const guestPreview =
    !!validRoute && isGuest && validRoute.problem.globalOrder === 1
  // The active run's view (identical to durable progress outside a fresh
  // run). A "Skip to realm" run presents skipped realms' missions as
  // completed, so they are enterable and replayable like genuinely completed
  // content. Evidence decisions (review mode, retention, recording) below
  // keep reading durable `academyProgress` — the view only widens ENTRY.
  const runViewProgress = useMemo(
    () => activeRunProgressView(academyProgress),
    [academyProgress],
  )
  const runViewCompleted =
    !!validRoute &&
    (!!runViewProgress.missionPractices[validRoute.problem.id] ||
      !!runViewProgress.missionCompletions[validRoute.problem.id])
  const entryAuthorized =
    !!validRoute &&
    canAccessAcademyMissionEntryWithShowcase(
      isShowcaseAccount,
      validRoute.realm.id,
      validRoute.track.id,
      {
        completed: missionPracticed || missionCompleted || runViewCompleted,
        guestPreview,
      },
    )
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [section, setSection] = useState<'learn' | 'quiz'>('learn')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [previewFinished, setPreviewFinished] = useState(false)
  // Bumped when a finished run can't count as practice (revealed answer /
  // partial review rerun): remounts the runner into a fresh FULL quiz instead
  // of dead-ending on an error page.
  const [retryRun, setRetryRun] = useState(0)

  useEffect(() => {
    if (!problemId || !entryAuthorized) return
    let cancelled = false
    setLesson(null)
    setLoadError(null)
    setPreviewFinished(false)

    void loadProblemLesson(problemId)
      .then((spec) => {
        if (!spec) throw new Error('No authored mission was registered.')
        const compiled = compileProblemLesson(spec, NEETCODE_150_MANIFEST)
        if (cancelled) return
        const saved = getLessonProgress(problemId)
        // A replay always starts from the top of the lesson (or straight at
        // the quiz when requested) — saved progress must not skip it ahead.
        setSection(
          reviewMode
            ? reviewStartAtQuiz
              ? 'quiz'
              : 'learn'
            : resolveMissionSection(retentionMode, saved, compiled),
        )
        setLesson(compiled)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'The mission could not load.',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    entryAuthorized,
    getLessonProgress,
    problemId,
    retentionMode,
    reviewMode,
    reviewStartAtQuiz,
  ])

  const nextProblem = useMemo(() => {
    if (!validRoute) return null
    const index = validRoute.track.problemIds.indexOf(validRoute.problem.id)
    const nextId = validRoute.track.problemIds[index + 1]
    return nextId ? (NEETCODE_150_PROBLEM_BY_ID.get(nextId) ?? null) : null
  }, [validRoute])

  // In-flight stash: practice runs only. Retention/review replays start
  // clean by design and must never restore (or overwrite) a practice draft.
  const missionStash = useMemo(
    () =>
      problemId && !retentionMode && !reviewMode
        ? makeMissionStashHandle(problemId, identityId)
        : null,
    [problemId, retentionMode, reviewMode, identityId],
  )

  const finishMission = useCallback(
    (result?: LessonResult) =>
      finishAcademyMission(
        {
          lesson,
          route: validRoute
            ? {
                realmId: validRoute.realm.id,
                trackId: validRoute.track.id,
              }
            : null,
          retentionMode,
          reviewMode,
          markReviewReturn: markAcademyReviewReturn,
          recordFreshRunMission: recordFreshRunMissionCleared,
          returnToCity: fromCity,
          nextProblem,
          recordMissionPractice,
          recordMissionRetention,
          markCheckpointReturn: markAcademyCheckpointReturn,
          navigate,
          onError: setLoadError,
          onPracticeRejected: () => setRetryRun((n) => n + 1),
          clearStash: missionStash?.clear,
        },
        result,
      ),
    [
      lesson,
      missionStash,
      navigate,
      nextProblem,
      recordMissionPractice,
      recordMissionRetention,
      retentionMode,
      reviewMode,
      fromCity,
      validRoute,
    ],
  )

  const access = resolveAcademyMissionAccess({
    route,
    ready,
    isGuest,
    isShowcaseAccount,
    academyProgress,
    runProgress: runViewProgress,
    entryAuthorized,
  })

  const retentionDue =
    !!validRoute &&
    ((missionCompleted && !retentionCloudVerified) ||
      isMissionRetentionDue(
        academyProgress,
        validRoute.problem.id,
        retentionNow,
      ))

  const retentionLesson =
    retentionMode && lesson ? retentionRunnerLesson(lesson) : null
  const retentionUnavailable = retentionMode && !!lesson && !retentionLesson
  const runnerLesson =
    retentionMode && retentionLesson ? retentionLesson : lesson
  const saved = validRoute ? lessons[validRoute.problem.id] : undefined

  const lessonRunner: AcademyMissionRunnerProps | null =
    validRoute && runnerLesson
      ? {
          key: `${validRoute.problem.id}:${section}:${retentionMode ? 'retention' : reviewMode ? 'review' : 'practice'}:r${retryRun}`,
          lessonId: validRoute.problem.id,
          lessonOverride: runnerLesson,
          section: retentionMode ? 'quiz' : section,
          // A practice-rejected retry must be a fresh FULL quiz: saved progress
          // would resume a review-only run, which can never record practice.
          // Review replays also start fresh so the saved completion snapshot
          // is neither resumed nor overwritten.
          initial:
            retentionMode || reviewMode || retryRun > 0 ? undefined : saved,
          onSave: retentionMode || reviewMode ? () => {} : saveLessonProgress,
          onAttempt: logAttempt,
          streakCurrent: streak.current,
          nextLessonTitle: nextProblem?.title ?? null,
          isLastLesson: !nextProblem,
          onNext: nextProblem
            ? () =>
                navigate(
                  academyMissionPath(
                    validRoute.realm.id,
                    validRoute.track.id,
                    nextProblem.leetcodeSlug,
                  ),
                )
            : undefined,
          onTakeQuiz: () => {
            if (isGuest) setPreviewFinished(true)
            else setSection('quiz')
          },
          onExit: () =>
            navigate(
              fromCity
                ? '/quest'
                : academyTrackPath(validRoute.realm.id, validRoute.track.id),
            ),
          onQuizComplete: finishMission,
          assessmentMetadata: {
            academyMode: retentionMode
              ? 'retention'
              : reviewMode
                ? 'review'
                : 'practice',
          },
          // A rejected run remounts as a fresh full quiz — no stale draft.
          stash: retryRun > 0 ? null : missionStash,
          // Tutor on practice + review; never on the delayed retention check.
          tutor: retentionMode ? null : { title: validRoute.problem.title },
        }
      : null

  return {
    access,
    routeNotice,
    /** Set after a finished run couldn't count — a fresh full quiz is live. */
    practiceRetryNotice:
      retryRun > 0
        ? 'So close! A revealed answer (or a partial review run) can\u2019t count as practice — the quiz restarted fresh. Beat every check to log the mission.'
        : null,
    retentionMode,
    reviewMode,
    fromCity,
    cloudEnabled,
    isGuest,
    missionPracticed,
    missionCompleted,
    retentionCloudVerified,
    retentionAvailableAt,
    retentionNow,
    retentionDue,
    lesson,
    loadError,
    section,
    previewFinished,
    retentionUnavailable,
    nextProblem,
    lessonRunner,
    finishMission,
  }
}
