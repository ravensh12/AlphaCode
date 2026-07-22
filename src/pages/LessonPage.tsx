import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { generateLesson, hasLesson } from '../content/lessons'
import { adaptLessonForLearner } from '../content/lessons/adaptive'
import { getWorld } from '../content/adventure'
import { LESSON_CATALOG, MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import { emptyBadgeCounts, getBadge } from '../content/badges'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { answerXp } from '../lib/playerLevel'
import { canGuestAccessLesson, canGuestAccessSection } from '../lib/guestAccess'
import {
  canAccessLessonPartWithShowcase,
  lessonUnlockedWithShowcase,
} from '../lib/showcaseOverride'
import { getWorldState } from '../lib/questState'
import {
  useLessonEngine,
  type AssessmentAttemptInfo,
  type GradeAssessment,
  type LessonResult,
} from '../hooks/useLessonEngine'
import { usePythonJudge } from '../hooks/usePythonJudge'
import { prefetchOverworld } from '../lib/prefetchOverworld'
import { diagramChangedIndices } from '../lib/diagramDiff'
import {
  canAutoplayStep,
  slideAutoplayMs,
  useLessonAutoplay,
} from '../hooks/useLessonAutoplay'
import { useDiagramSequence } from '../hooks/useDiagramSequence'
import type { Lesson, LessonStep, DiagramSpec } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import { CodePanel } from '../components/lesson/CodePanel'
import { VariableBoxes } from '../components/lesson/VariableBoxes'
import { AnswerTiles, AnswerChoiceSlot } from '../components/lesson/AnswerTiles'
import { FeedbackPanel } from '../components/lesson/FeedbackPanel'
import { AssessmentInput } from '../components/lesson/AssessmentInput'
import {
  ForcedRetakePrompt,
  ReviewLessonPrompt,
} from '../components/lesson/LessonReviewPrompts'
import { LessonReviewWalkthrough } from '../components/lesson/LessonReviewWalkthrough'
import { HintPanel } from '../components/lesson/HintPanel'
import { LevelTracker } from '../components/lesson/LevelTracker'
import { hasEverMastered, hasPendingMissedReview, markUnlockAchieved, meetsUnlockThreshold, applyReviewClear } from '../lib/mastery'
import {
  type CourseSection,
  interactiveStepsForSection,
  isLearnComplete,
  sectionResumeIndex,
  sectionResumeFrameIndex,
  reviewResumeFrameIndex,
  freshLessonProgress,
  stepsForSection,
} from '../lib/lessonSections'
import { VisualDiagram } from '../components/lesson/VisualDiagram'
import { CompletionView } from '../components/lesson/CompletionView'
import { PreviousTestReview } from '../components/lesson/PreviousTestReview'
import { stepToReview } from '../components/lesson/ReviewBreakdown'
import { Loader } from '../components/Loader'
import { IconArrowLeft } from '../components/icons'
import { lessonProblemId } from '../lib/problemIds'
import {
  isPythonJudgeInfrastructureError,
  pythonJudgeResultToAssessment,
} from '../lib/pythonAssessmentGrader'
import type { PythonJudgeRunner } from '../components/lesson/PythonWorkbench'
import { TutorPanel } from '../components/lesson/TutorPanel'
import type { TutorProblemContext } from '../lib/tutorClient'
import { readTutorRun } from '../lib/tutorContext'
import { describePythonAssessmentForTutor } from '../lib/tutorRunSummary'
import type {
  MissionStashHandle,
  TutorChatMessage,
} from '../lib/missionStash'
import type { PythonJudgeRunResult } from '../workers/pythonJudgeProtocol'
import type { JsonValue } from '../types/learning'
import { assessmentEvidenceKinds } from '../types/assessment'
import './LessonPage.css'

const TILE_COUNT = 8

function savedQuizResult(progress: LessonProgress): LessonResult | null {
  if (!progress.lastReview) return null
  return {
    accuracy: progress.accuracy,
    masteryScore: progress.masteryScore,
    totalAttempts: progress.totalAttempts,
    correctFirstTry: progress.correctFirstTry,
    unlockNext: meetsUnlockThreshold(progress.masteryScore),
    badgeCounts: progress.lastQuizBadgeCounts ?? emptyBadgeCounts(),
    badges: [],
    assessmentEvidence: [],
    stepReviews: progress.lastReview.steps
      .filter((s) => s.targetVariables.length > 0 || !!s.assessment)
      .map((s) =>
        stepToReview(s, progress.lastReview!.missedStepIds.includes(s.id)),
      ),
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function genTiles(step: LessonStep): (number | string)[] {
  if (step.answerTiles?.length) return step.answerTiles

  const corrects = step.targetVariables
    .map((v) => step.expectedState[v])
    .filter((v): v is number => typeof v === 'number')
  const correctSet = new Set<number>(corrects)

  const distractors = new Set<number>()
  for (const n of corrects) {
    for (const d of [n - 1, n + 1, n + 2, n - 2, n + 3, n - 3]) {
      if (d >= 0 && !correctSet.has(d)) distractors.add(d)
    }
  }
  let k = 4
  const base = corrects[0] ?? 5
  while (correctSet.size + distractors.size < TILE_COUNT) {
    const cand = base + k
    if (cand >= 0 && !correctSet.has(cand)) distractors.add(cand)
    k++
  }

  const tiles = [...correctSet]
  for (const d of shuffleInPlace([...distractors])) {
    if (tiles.length >= TILE_COUNT) break
    tiles.push(d)
  }
  return shuffleInPlace(tiles)
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function parseSection(raw: string | undefined): CourseSection | null {
  if (raw === 'learn' || raw === 'quiz') return raw
  return null
}

/** The learn section is split into this many checkpoint parts in the overworld. */
export const LESSON_PART_COUNT = 3

/** Contiguous [start, end) bounds for one balanced part of `n` slides. */
export function lessonPartBounds(n: number, part: number, count = LESSON_PART_COUNT): [number, number] {
  const base = Math.floor(n / count)
  const rem = n % count
  let start = 0
  for (let i = 0; i < part; i++) start += base + (i < rem ? 1 : 0)
  const size = base + (part < rem ? 1 : 0)
  return [start, start + size]
}

export function LessonPage() {
  const { lessonId, section: sectionParam } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const partParam = new URLSearchParams(location.search).get('part')
  const learnPart =
    partParam != null
      ? Math.max(0, Math.min(LESSON_PART_COUNT - 1, parseInt(partParam, 10) || 0))
      : null
  const { ready, lessons, saveLessonProgress, logAttempt, streak, isLessonUnlocked } =
    useProgress()
  const { isGuest, isShowcaseAccount } = useAuth()
  // The overworld entry token is one-time use — cache the access decision per
  // (level, part) so re-renders don't re-consume it and lock the player out.
  const lessonAccessRef = useRef<{ key: string; ok: boolean } | null>(null)

  // Lessons usually exit back into the 3D overworld — warm its route chunk
  // during idle time so the switch doesn't stall on fetch/parse.
  useEffect(() => {
    prefetchOverworld()
  }, [])

  if (!lessonId || !hasLesson(lessonId)) {
    return (
      <LessonNotice
        title="Lesson not found"
        message="This lesson isn't part of the course. Head back to pick one from your learning path."
      />
    )
  }

  const section = parseSection(sectionParam)
  if (!section) {
    return <Navigate to={`/lesson/${lessonId}/learn`} replace />
  }

  if (!ready) {
    return <Loader label="Loading lesson" night />
  }

  const baseLesson = generateLesson(lessonId)!
  const progress = lessons[lessonId]
  const catalogIndex = LESSON_CATALOG.findIndex((l) => l.id === lessonId)
  const summary = catalogIndex >= 0 ? LESSON_CATALOG[catalogIndex] : null

  if (summary && !isLessonUnlocked(summary)) {
    return (
      <LessonNotice
        title="Lesson locked"
        message={`Reach ${summary.unlockRequirements.minimumMastery ?? 75}% mastery on the previous lesson to unlock this one.`}
      />
    )
  }

  if (isGuest && !canGuestAccessLesson(lessonId)) {
    return (
      <LessonNotice
        title="Sign in to continue"
        message="Guest preview covers the first interactive lesson only. Create a free account to unlock the quiz and the rest of the course."
        action={{ label: 'Sign in', to: '/auth' }}
      />
    )
  }

  if (isGuest && !canGuestAccessSection(lessonId, section)) {
    return (
      <LessonNotice
        title="Sign in to unlock the quiz"
        message="You finished the preview lesson! Sign in to take the quiz, save progress, and unlock the full LeetCode prep course."
        action={{ label: 'Sign in', to: '/auth' }}
      />
    )
  }

  const world = getWorld(lessonId)
  const worldState = summary ? getWorldState(lessonId, progress, !!summary && isLessonUnlocked(summary)) : undefined
  const levelMastered = worldState?.mastered ?? false

  // Showcase may open the boss quiz from the list at any time; everyone else
  // must beat the level in Code City first.
  if (
    section === 'quiz' &&
    !lessonUnlockedWithShowcase(isShowcaseAccount, levelMastered)
  ) {
    return (
      <LessonNotice
        title="Boss quiz locked"
        message="Reach the boss in Code City after clearing every checkpoint — you can't take the quiz from the list until you've beaten this level once."
        action={{ label: 'Open Code City', to: '/quest' }}
      />
    )
  }

  if (section === 'learn' && world) {
    const accessKey = `${world.index}:${learnPart}`
    if (lessonAccessRef.current?.key !== accessKey) {
      lessonAccessRef.current = {
        key: accessKey,
        ok: canAccessLessonPartWithShowcase(
          isShowcaseAccount,
          world.index,
          learnPart,
          levelMastered,
        ),
      }
    }
    if (!lessonAccessRef.current.ok) {
      return (
        <LessonNotice
          title="Checkpoint locked"
          message="Travel to this checkpoint in Code City and press E at the building to start the lesson. List view unlocks after you clear the level."
          action={{ label: 'Open Code City', to: '/quest' }}
        />
      )
    }
  }

  if (section === 'quiz' && !isLearnComplete(progress, baseLesson)) {
    return (
      <LessonNotice
        title="Finish the lesson first"
        message="Complete the interactive lesson section before you take the quiz."
        action={{ label: 'Go to lesson', to: `/lesson/${lessonId}/learn` }}
      />
    )
  }

  const nextSummary = LESSON_CATALOG[catalogIndex + 1] ?? null
  const isLastLesson = catalogIndex === LESSON_CATALOG.length - 1

  function exitToQuest(opts?: { markPartDone?: boolean; part?: number; final?: boolean }) {
    if (opts?.markPartDone && section === 'learn' && learnPart != null) {
      const world = getWorld(lessonId!)
      if (world) {
        try {
          sessionStorage.setItem(
            'alphacode.partDone',
            JSON.stringify({
              world: world.index,
              part: opts.part ?? learnPart,
              final: opts.final ?? learnPart >= LESSON_PART_COUNT - 1,
            }),
          )
        } catch {
          /* ignore */
        }
      }
    }
    navigate('/quest')
  }

  return (
    <LessonRunner
      key={`${lessonId}:${section}:${learnPart ?? 'all'}`}
      lessonId={lessonId}
      section={section}
      learnPart={section === 'learn' ? learnPart : null}
      initial={progress}
      onSave={saveLessonProgress}
      onAttempt={logAttempt}
      streakCurrent={streak.current}
      nextLessonTitle={nextSummary?.title ?? null}
      isLastLesson={isLastLesson}
      onNext={
        nextSummary
          ? () => navigate('/quest')
          : undefined
      }
      onTakeQuiz={() => navigate('/quest')}
      onExit={() => exitToQuest()}
      onPartComplete={(part, final) => exitToQuest({ markPartDone: true, part, final })}
    />
  )
}

export function LessonNotice({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: { label: string; to: string }
}) {
  return (
    <div className="page">
      <AppHeader />
      <main className="container lp-missing">
        <div className="card lp-missing-card">
          <h1>{title}</h1>
          <p className="muted">{message}</p>
          {action ? (
            <Link className="btn" to={action.to}>
              {action.label}
            </Link>
          ) : (
            <Link className="btn" to="/quest">
              Back to map
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}

export function LessonRunner({
  lessonId,
  lessonOverride,
  section,
  learnPart = null,
  initial,
  onSave,
  onAttempt,
  streakCurrent,
  nextLessonTitle,
  isLastLesson,
  onNext,
  onTakeQuiz,
  onExit,
  onPartComplete,
  onQuizComplete,
  onGradeAssessment,
  assessmentMetadata,
  examMode,
  embedded,
  stash,
  tutor,
}: {
  lessonId: string
  /** Compiled academy content; legacy callers continue using generateLesson. */
  lessonOverride?: Lesson
  section: CourseSection
  /** When set (0-based), only this slice of the learn slides is shown. */
  learnPart?: number | null
  initial?: LessonProgress
  onSave: (p: LessonProgress) => void
  onAttempt: (a: AttemptRecord) => void
  streakCurrent: number
  nextLessonTitle: string | null
  isLastLesson: boolean
  onNext?: () => void
  onTakeQuiz: () => void
  onExit: () => void
  onPartComplete?: (part: number, final: boolean) => void
  /** Boss mode: fires once the quiz is fully finished (incl. review) → go fight. */
  onQuizComplete?: (result?: LessonResult) => void
  onGradeAssessment?: GradeAssessment
  /** Immutable-event metadata for specialized assessment runs. */
  assessmentMetadata?: Readonly<Record<string, JsonValue>>
  /**
   * Deferred-feedback exam (boss quizzes, certification): answers are graded
   * and recorded as usual, but no correctness signal is shown per question —
   * one attempt each, no hints, then auto-advance. Verdicts come at the end.
   */
  examMode?: boolean
  embedded?: boolean
  /** In-flight mission state that survives a tab close (see missionStash). */
  stash?: MissionStashHandle | null
  /** Enables the AI tutor drawer; never passed on exams/retention checks. */
  tutor?: { title: string } | null
}) {
  const { isGuest } = useAuth()
  const { getLessonProgress, restartQuizProgress, learnerModel } = useProgress()
  const { run: runPythonJudge } = usePythonJudge()
  // Full judge result of the latest graded Python submission, kept so the IDE
  // panel can show the per-case breakdown. Grading semantics are unchanged —
  // this is a read-only copy of what the judge already decided.
  const [pythonSubmitRun, setPythonSubmitRun] = useState<{
    assessmentId: string
    result: PythonJudgeRunResult
  } | null>(null)
  const gradeWithPythonJudge = useCallback<GradeAssessment>(
    async (assessment, response) => {
      if (
        assessment.kind !== 'pythonCode' ||
        response.kind !== 'pythonCode'
      ) {
        return null
      }
      const result = await runPythonJudge(assessment, response)
      if (isPythonJudgeInfrastructureError(result)) {
        throw new Error(result.error?.message ?? 'Python judge unavailable')
      }
      setPythonSubmitRun({ assessmentId: assessment.id, result })
      return pythonJudgeResultToAssessment(assessment, result)
    },
    [runPythonJudge],
  )
  const assessmentGrader = onGradeAssessment ?? gradeWithPythonJudge
  // Snapshot the learner model once per mount so quiz adaptation stays stable
  // through a run + its review (it must not reshuffle on every answer).
  const learnerSnapshot = useRef(learnerModel).current
  const liveProgress = getLessonProgress(lessonId) ?? initial
  const [round, setRound] = useState(0)
  const [reviewRound, setReviewRound] = useState(0)
  const [reviewFinished, setReviewFinished] = useState(false)
  const [reviewActive, setReviewActive] = useState(
    () => section === 'quiz' && !!initial && hasPendingMissedReview(initial),
  )
  const [forceFullQuiz, setForceFullQuiz] = useState(false)
  const quizResultRef = useRef<LessonResult | null>(null)
  // Feature: send the learner back through the teaching content — either a
  // voluntary per-miss "review" (place is preserved) or a forced full "retake"
  // after 3 consecutive misses (quiz restarts from question 1).
  const [teaching, setTeaching] = useState<'review' | 'retake' | null>(null)

  const missedStepIds = liveProgress?.lastReview?.missedStepIds ?? []
  const isReview =
    section === 'quiz' &&
    reviewActive &&
    !forceFullQuiz &&
    missedStepIds.length > 0

  const baseLesson = useMemo(() => {
    void round
    const raw = lessonOverride ?? generateLesson(lessonId)!
    // Personalize only the quiz, and only for signed-in learners with a model.
    if (section === 'quiz' && !isGuest && !lessonOverride) {
      return adaptLessonForLearner(raw, learnerSnapshot)
    }
    return raw
  }, [
    lessonId,
    lessonOverride,
    round,
    section,
    isGuest,
    learnerSnapshot,
  ])

  const sectionSteps = useMemo(
    () => stepsForSection(baseLesson.steps, section),
    [baseLesson, section],
  )
  // Teaching slides for the review/retake walkthrough (independent of section).
  const learnSteps = useMemo(
    () => stepsForSection(baseLesson.steps, 'learn'),
    [baseLesson],
  )

  const usePart = section === 'learn' && learnPart != null && !isReview
  const isFinalPart = learnPart != null && learnPart >= LESSON_PART_COUNT - 1

  const lesson = useMemo(() => {
    if (!isReview) {
      if (usePart && learnPart != null) {
        const [start, end] = lessonPartBounds(sectionSteps.length, learnPart)
        return { ...baseLesson, steps: sectionSteps.slice(start, end) }
      }
      return { ...baseLesson, steps: sectionSteps }
    }
    const idSet = new Set(missedStepIds)
    return {
      ...baseLesson,
      steps: sectionSteps.filter((s) => idSet.has(s.id)),
    }
  }, [baseLesson, sectionSteps, isReview, usePart, learnPart, missedStepIds.join('|')])

  const replay = useCallback(() => {
    if (section === 'quiz') {
      restartQuizProgress(lessonId)
    }
    quizResultRef.current = null
    setReviewActive(false)
    setForceFullQuiz(true)
    setReviewRound(0)
    setReviewFinished(false)
    setRound((r) => r + 1)
  }, [section, lessonId, restartQuizProgress])

  const redoMissed = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      const base = getLessonProgress(lessonId) ?? initial
      if (base?.lastReview) {
        onSave({
          ...base,
          lastReview: {
            ...base.lastReview,
            reviewStepIndex: 0,
            reviewFrameIndex: 0,
          },
          updatedAt: new Date().toISOString(),
        })
      }
      setReviewActive(true)
      setForceFullQuiz(false)
      setReviewFinished(false)
      setReviewRound((r) => r + 1)
    },
    [lessonId, getLessonProgress, initial, onSave],
  )

  const onReviewMasteryReached = useCallback(() => {
    setReviewActive(false)
    setReviewFinished(true)
  }, [])

  // The 3-strikes forced retake and the per-miss review box only make sense on
  // a normal quiz that actually has teaching content to send the learner back
  // to. Exams (deferred feedback, one attempt) and retention-only runs (no
  // teaching slides) never get it.
  const strikeRetakeSupported =
    section === 'quiz' && !examMode && learnSteps.length > 0

  const handleReviewLesson = useCallback(() => setTeaching('review'), [])
  const handleForceRetake = useCallback(() => setTeaching('retake'), [])

  // Wipe just the quiz run so a forced retake genuinely starts over from
  // question 1. Learn completion, mastery, and the review ledger are preserved,
  // and no completion/pass is recorded — the learner has not passed.
  const resetQuizForRetake = useCallback(() => {
    const base =
      getLessonProgress(lessonId) ?? initial ?? freshLessonProgress(lessonId, 'quiz')
    const quizIds = new Set(sectionSteps.map((s) => s.id))
    onSave({
      ...base,
      status: base.status === 'completed' ? 'completed' : 'inProgress',
      learnCompleted: true,
      currentStepIndex: 0,
      quizStepIndex: 0,
      quizFrameIndex: 0,
      completedStepIds: (base.completedStepIds ?? []).filter(
        (id) => !quizIds.has(id),
      ),
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
      correctFirstTry: 0,
      accuracy: 0,
      updatedAt: new Date().toISOString(),
    })
  }, [getLessonProgress, lessonId, initial, sectionSteps, onSave])

  const finishTeachingReview = useCallback(() => {
    if (teaching === 'retake') {
      resetQuizForRetake()
      // Remount the quiz round fresh from the top.
      setRound((r) => r + 1)
    }
    // A voluntary review resumes the quiz exactly where it was left — the quiz
    // round flushed its position when it unmounted, so it re-mounts and resumes.
    setTeaching(null)
  }, [teaching, resetQuizForRetake])

  useEffect(() => {
    if (
      section === 'quiz' &&
      initial &&
      hasPendingMissedReview(initial) &&
      !quizResultRef.current
    ) {
      const saved = savedQuizResult(initial)
      if (saved) quizResultRef.current = saved
    }
  }, [section, initial])

  // In boss mode (onQuizComplete provided) we always run the quiz, then hand off
  // to the fight — never short-circuit to a "mastered"/review summary screen.
  if (reviewFinished && !onQuizComplete) {
    const saved = getLessonProgress(lessonId) ?? initial
    const baseResult =
      quizResultRef.current ?? (saved ? savedQuizResult(saved) : null)
    if (saved) {
      const displayResult: LessonResult = baseResult ?? {
        accuracy: saved.accuracy,
        masteryScore: saved.masteryScore,
        totalAttempts: saved.totalAttempts,
        correctFirstTry: saved.correctFirstTry,
        unlockNext: meetsUnlockThreshold(saved.masteryScore),
        badgeCounts: saved.lastQuizBadgeCounts ?? emptyBadgeCounts(),
        badges: [],
        assessmentEvidence: [],
        stepReviews: [],
      }
      return (
        <RoundShell embedded={embedded}>
          <main className="container lp lp-quiz">
            <CompletionView
              result={{
                ...displayResult,
                masteryScore: saved.masteryScore,
                unlockNext: meetsUnlockThreshold(saved.masteryScore),
              }}
              streakCurrent={streakCurrent}
              lessonId={lessonId}
              lessonTitle={baseLesson.title}
              nextLessonTitle={nextLessonTitle}
              isLastLesson={isLastLesson}
              isGuest={isGuest}
              reviewCleared
              badgeCounts={displayResult.badgeCounts}
              onNext={onNext}
              onReturn={onExit}
              onReplay={replay}
            />
          </main>
        </RoundShell>
      )
    }
  }

  const showMasteredSummary =
    section === 'quiz' &&
    !onQuizComplete &&
    !forceFullQuiz &&
    !reviewActive &&
    !!liveProgress &&
    hasEverMastered(liveProgress) &&
    meetsUnlockThreshold(liveProgress.masteryScore) &&
    !hasPendingMissedReview(liveProgress)

  if (showMasteredSummary) {
    const baseResult =
      quizResultRef.current ?? savedQuizResult(liveProgress) ?? null
    const displayResult: LessonResult = baseResult ?? {
      accuracy: liveProgress.accuracy,
      masteryScore: liveProgress.masteryScore,
      totalAttempts: liveProgress.totalAttempts,
      correctFirstTry: liveProgress.correctFirstTry,
      unlockNext: true,
      badgeCounts: liveProgress.lastQuizBadgeCounts ?? emptyBadgeCounts(),
      badges: [],
      assessmentEvidence: [],
      stepReviews: liveProgress.lastReview
        ? liveProgress.lastReview.steps
            .filter((s) => s.targetVariables.length > 0 || !!s.assessment)
            .map((s) =>
              stepToReview(
                s,
                liveProgress.lastReview!.missedStepIds.includes(s.id),
              ),
            )
        : [],
    }
    return (
      <RoundShell embedded={embedded}>
        <main className="container lp lp-quiz">
          <CompletionView
            result={{
              ...displayResult,
              masteryScore: liveProgress.masteryScore,
              unlockNext: true,
            }}
            streakCurrent={streakCurrent}
            lessonId={lessonId}
            lessonTitle={baseLesson.title}
            nextLessonTitle={nextLessonTitle}
            isLastLesson={isLastLesson}
            isGuest={isGuest}
            badgeCounts={displayResult.badgeCounts}
            onNext={onNext}
            onReturn={onExit}
            onReplay={replay}
          />
        </main>
      </RoundShell>
    )
  }

  // Review / forced-retake walkthrough: re-present the teaching content, then
  // hand back to the quiz round (resume for review, fresh restart for retake).
  if (teaching) {
    return (
      <RoundShell embedded={embedded}>
        <main className="container lp lp-learn">
          <LessonReviewWalkthrough
            steps={learnSteps}
            title={baseLesson.title}
            mode={teaching}
            onDone={finishTeachingReview}
          />
        </main>
      </RoundShell>
    )
  }

  return (
    <LessonRound
      key={`${round}:${reviewRound}:${isReview ? missedStepIds.join('|') : 'all'}:p${learnPart ?? 'x'}`}
      lesson={lesson}
      fullLessonOverride={lessonOverride}
      section={section}
      isReview={isReview}
      learnPart={usePart ? learnPart : null}
      isFinalPart={isFinalPart}
      initial={isReview ? liveProgress : round === 0 && !isReview ? initial : undefined}
      quizResultRef={quizResultRef}
      onSave={onSave}
      onAttempt={onAttempt}
      streakCurrent={streakCurrent}
      nextLessonTitle={nextLessonTitle}
      isLastLesson={isLastLesson}
      onNext={onNext}
      onTakeQuiz={onTakeQuiz}
      onExit={onExit}
      onPartComplete={onPartComplete}
      onQuizComplete={onQuizComplete}
      onGradeAssessment={assessmentGrader}
      pythonJudge={runPythonJudge}
      pythonSubmitRun={pythonSubmitRun}
      assessmentMetadata={assessmentMetadata}
      examMode={examMode}
      onReplay={replay}
      onRedoMissed={redoMissed}
      onReviewMasteryReached={onReviewMasteryReached}
      onReviewLesson={strikeRetakeSupported ? handleReviewLesson : undefined}
      onForceRetake={strikeRetakeSupported ? handleForceRetake : undefined}
      enableStrikeRetake={strikeRetakeSupported}
      embedded={embedded}
      stash={stash}
      tutor={examMode ? null : tutor}
    />
  )
}

/**
 * Wraps a round view. Normally renders the full page chrome (header); when
 * `embedded` (e.g. inside a boss battle), it drops the header/page shell so the
 * quiz can live inside another layout.
 */
function RoundShell({
  embedded,
  children,
}: {
  embedded?: boolean
  children: ReactNode
}) {
  if (embedded) return <div className="lp-embedded">{children}</div>
  return (
    <div className="page">
      <AppHeader />
      {children}
    </div>
  )
}

export function LessonRound({
  lesson,
  fullLessonOverride,
  section,
  isReview,
  learnPart = null,
  isFinalPart = true,
  initial,
  quizResultRef,
  onSave,
  onAttempt,
  streakCurrent,
  nextLessonTitle,
  isLastLesson,
  onNext,
  onTakeQuiz,
  onExit,
  onPartComplete,
  onQuizComplete,
  onGradeAssessment,
  pythonJudge,
  pythonSubmitRun,
  assessmentMetadata,
  examMode = false,
  onReplay,
  onRedoMissed,
  onReviewMasteryReached,
  onReviewLesson,
  onForceRetake,
  enableStrikeRetake = false,
  embedded,
  stash,
  tutor,
}: {
  lesson: Lesson
  /** Full compiled lesson before its teach/quiz section is sliced. */
  fullLessonOverride?: Lesson
  section: CourseSection
  isReview: boolean
  /** 0-based part index when the learn section is split; null = full lesson. */
  learnPart?: number | null
  isFinalPart?: boolean
  initial?: LessonProgress
  quizResultRef: MutableRefObject<LessonResult | null>
  onSave: (p: LessonProgress) => void
  onAttempt: (a: AttemptRecord) => void
  streakCurrent: number
  nextLessonTitle: string | null
  isLastLesson: boolean
  onNext?: () => void
  onTakeQuiz: () => void
  onExit: () => void
  onPartComplete?: (part: number, final: boolean) => void
  onQuizComplete?: (result?: LessonResult) => void
  onGradeAssessment?: GradeAssessment
  /** Shared judge client — powers the pre-submit "Run code" IDE action. */
  pythonJudge?: PythonJudgeRunner
  /** Latest graded Python submission, for the post-submit case breakdown. */
  pythonSubmitRun?: { assessmentId: string; result: PythonJudgeRunResult } | null
  assessmentMetadata?: Readonly<Record<string, JsonValue>>
  /** Deferred-feedback exam mode — see LessonRunner. */
  examMode?: boolean
  onReplay: () => void
  onRedoMissed: (ids: string[]) => void
  onReviewMasteryReached: () => void
  /** Per-miss "review the lesson" navigation (normal quizzes only). */
  onReviewLesson?: () => void
  /** Forced full retake after 3 consecutive misses (normal quizzes only). */
  onForceRetake?: () => void
  /** Turns on the 3-strikes forced-retake rule for this round. */
  enableStrikeRetake?: boolean
  embedded?: boolean
  /** In-flight mission state that survives a tab close (see missionStash). */
  stash?: MissionStashHandle | null
  /** Enables the AI tutor drawer (already gated upstream for exam modes). */
  tutor?: { title: string } | null
}) {
  const isPart = learnPart != null && section === 'learn' && !isReview
  const { isGuest, isShowcaseAccount } = useAuth()
  const { addXp } = usePlayerLevel()
  const {
    getLessonProgress,
    recordConceptResult,
    recordLearningAttempt,
  } = useProgress()
  const fullLesson = useMemo(
    () => fullLessonOverride ?? generateLesson(lesson.id)!,
    [fullLessonOverride, lesson.id],
  )
  const savedProgress = getLessonProgress(lesson.id) ?? initial
  // Parts always start at the top of their slice — global resume indices don't
  // map onto a sliced lesson.
  const resumeIndex = isPart
    ? null
    : sectionResumeIndex(savedProgress ?? initial, section, fullLesson)
  const [liveMastery, setLiveMastery] = useState<number | null>(null)
  const engineRef = useRef<ReturnType<typeof useLessonEngine> | null>(null)

  const displayMastery =
    liveMastery ?? savedProgress?.masteryScore ?? 0
  const remainingMissed =
    savedProgress?.lastReview?.missedStepIds.length ?? 0

  const persistReviewProgress = useCallback(
    (
      stepIndex: number,
      frameIndex: number,
      reviewPatch?: Partial<NonNullable<LessonProgress['lastReview']>>,
      masteryScore?: number,
    ) => {
      const base = getLessonProgress(lesson.id) ?? initial
      if (!base?.lastReview) return

      const score = masteryScore ?? base.masteryScore
      const lastReview = {
        ...base.lastReview,
        ...reviewPatch,
        reviewStepIndex: reviewPatch?.reviewStepIndex ?? stepIndex,
        reviewFrameIndex: reviewPatch?.reviewFrameIndex ?? frameIndex,
      }

      onSave({
        ...base,
        masteryScore: score,
        unlockNextLesson: markUnlockAchieved(base, score),
        lastReview,
        updatedAt: new Date().toISOString(),
      })
    },
    [getLessonProgress, lesson.id, initial, onSave],
  )

  const handleReviewStepCleared = useCallback(
    (stepId: string) => {
      const progress = getLessonProgress(lesson.id) ?? initial
      if (!progress?.lastReview) return
      const currentMissed = progress.lastReview.missedStepIds
      if (!currentMissed.includes(stepId)) return

      const remaining = currentMissed.filter((id) => id !== stepId)
      const newMastery = applyReviewClear(
        progress.masteryScore,
        currentMissed.length,
      )

      const currentStepIndex =
        engineRef.current?.stepIndex ??
        progress.lastReview.reviewStepIndex ??
        0
      const nextReviewStepIndex =
        remaining.length > 0
          ? Math.min(currentStepIndex, remaining.length - 1)
          : 0

      persistReviewProgress(
        nextReviewStepIndex,
        0,
        {
          missedStepIds: remaining,
          recordedAt: new Date().toISOString(),
          reviewStepIndex: nextReviewStepIndex,
          reviewFrameIndex: 0,
        },
        newMastery,
      )

      setLiveMastery(newMastery)

      if (meetsUnlockThreshold(newMastery)) {
        onReviewMasteryReached()
      }
    },
    [
      getLessonProgress,
      lesson.id,
      initial,
      persistReviewProgress,
      onReviewMasteryReached,
    ],
  )

  const sectionInitial = useMemo((): LessonProgress | undefined => {
    const base = isReview ? savedProgress : (savedProgress ?? initial)
    if (!base) return undefined
    if (isReview && base.lastReview) {
      const step = Math.min(
        base.lastReview.reviewStepIndex ?? 0,
        Math.max(0, lesson.steps.length - 1),
      )
      return { ...base, currentStepIndex: step }
    }
    if (resumeIndex == null) return base
    return { ...base, currentStepIndex: resumeIndex }
  }, [isReview, savedProgress, initial, resumeIndex, lesson.steps.length])

  function handleSave(p: LessonProgress) {
    if (
      section === 'quiz' &&
      initial?.status === 'completed' &&
      p.status !== 'completed' &&
      !isReview
    ) {
      return
    }

    if (isReview) {
      persistReviewProgress(
        p.quizStepIndex ?? p.currentStepIndex ?? 0,
        p.quizFrameIndex ?? 0,
      )
      return
    }

    const teachInteractive = interactiveStepsForSection(fullLesson.steps, 'learn')
    const atLastTeachSlide = p.currentStepIndex >= lesson.steps.length - 1
    const interactiveDone =
      teachInteractive.length === 0 ||
      teachInteractive.every(
        (s) =>
          p.completedStepIds.includes(s.id) ||
          (initial?.completedStepIds ?? []).includes(s.id),
      )
    const markedLearnComplete =
      section === 'learn' && atLastTeachSlide && interactiveDone

    onSave({
      ...p,
      updatedAt: new Date().toISOString(),
      ...(section === 'learn' && initial
        ? {
            masteryScore: initial.masteryScore ?? 0,
            correctCount: initial.correctCount ?? 0,
            wrongCount: initial.wrongCount ?? 0,
            totalAttempts: initial.totalAttempts ?? 0,
            correctFirstTry: initial.correctFirstTry ?? 0,
            accuracy: initial.accuracy ?? 0,
            unlockNextLesson: initial.unlockNextLesson ?? false,
            lastReview: initial.lastReview,
            completedAt: initial.completedAt,
            status: initial.status === 'completed' ? 'completed' : 'inProgress',
            quizStepIndex: initial.quizStepIndex,
            quizFrameIndex: initial.quizFrameIndex,
          }
        : {}),
      learnCompleted:
        p.learnCompleted ||
        initial?.learnCompleted ||
        markedLearnComplete ||
        (section === 'quiz' ? true : undefined),
      learnStepIndex:
        section === 'learn'
          ? Math.max(
              initial?.learnStepIndex ?? 0,
              p.learnStepIndex ?? 0,
              p.currentStepIndex,
            )
          : initial?.learnStepIndex,
      learnFrameIndex:
        section === 'learn'
          ? (p.learnStepIndex ?? p.currentStepIndex) !== (initial?.learnStepIndex ?? -1)
            ? (p.learnFrameIndex ?? 0)
            : Math.max(initial?.learnFrameIndex ?? 0, p.learnFrameIndex ?? 0)
          : initial?.learnFrameIndex,
      quizStepIndex:
        section === 'quiz'
          ? Math.max(
              initial?.quizStepIndex ?? 0,
              p.quizStepIndex ?? p.currentStepIndex ?? 0,
            )
          : initial?.quizStepIndex,
      quizFrameIndex:
        section === 'quiz'
          ? (p.quizStepIndex ?? p.currentStepIndex) !== (initial?.quizStepIndex ?? -1)
            ? (p.quizFrameIndex ?? 0)
            : Math.max(initial?.quizFrameIndex ?? 0, p.quizFrameIndex ?? 0)
          : initial?.quizFrameIndex,
      ...(section === 'quiz'
        ? {
            unlockNextLesson: markUnlockAchieved(
              {
                lessonId: lesson.id,
                unlockNextLesson:
                  initial?.unlockNextLesson ??
                  savedProgress?.unlockNextLesson ??
                  false,
                masteryScore: p.masteryScore,
              } as LessonProgress,
              p.masteryScore,
            ),
          }
        : {}),
    })
  }

  const resumeFrameIndex = isReview
    ? reviewResumeFrameIndex(savedProgress)
    : sectionResumeFrameIndex(savedProgress ?? initial, section)

  // ---- Mission stash: restore the in-flight draft that LessonProgress
  // deliberately doesn't hold (current step's answer / editor code + tutor
  // chat). Loaded once per round; only applied when it names the exact step
  // the engine is about to resume, so it can never desync grading.
  const [stashSnapshot] = useState(() =>
    stash && !isReview ? stash.load() : null,
  )
  const engineStartIndex =
    !isGuest && (isReview || resumeIndex != null)
      ? (sectionInitial?.currentStepIndex ?? 0)
      : 0
  const restoredResponse =
    stashSnapshot &&
    stashSnapshot.section === section &&
    stashSnapshot.stepIndex === engineStartIndex
      ? stashSnapshot.response
      : null
  const tutorMessagesRef = useRef<TutorChatMessage[]>(stashSnapshot?.tutor ?? [])

  const handleAssessmentAttempt = useCallback(
    async (attempt: AssessmentAttemptInfo) => {
      const lessonStep = lesson.steps.find(({ id }) => id === attempt.stepId)
      const contentRef = lessonStep?.contentRef ?? lesson.contentRef
      const problemId =
        contentRef?.problemId ??
        lessonProblemId({
          lessonId: lesson.id,
          stepId: attempt.stepId,
          masteryId: attempt.masteryId,
          frameIndex: attempt.frameIndex,
        })
      const skillIds =
        attempt.assessment.skillIds ??
        lessonStep?.skillIds ??
        lesson.skillIds ??
        []
      const evidenceKinds = assessmentEvidenceKinds(attempt.assessment)

      return recordLearningAttempt({
        interactionId: attempt.interactionId,
        source: isReview
          ? 'lesson-review'
          : section === 'learn'
            ? 'lesson-learn'
            : 'lesson-quiz',
        problemId,
        skillIds,
        lessonId: lesson.id,
        stepId: attempt.stepId,
        frameIndex: attempt.frameIndex,
        attemptNumber: attempt.serializedAttempt.attemptNumber,
        isCorrect: attempt.result.isCorrect,
        resolved: attempt.resolved,
        firstTryCorrect:
          attempt.firstTry &&
          !attempt.usedHint &&
          attempt.result.isCorrect,
        usedHint: attempt.usedHint,
        revealed: attempt.serializedAttempt.revealed,
        responseMs: Math.round(attempt.responseMs),
        submittedAnswer: toJsonValue(attempt.response),
        expectedAnswer: attempt.result.expectedResponse,
        metadata: {
          assessmentId: attempt.assessmentId,
          masteryId: attempt.masteryId,
          assessmentKind: attempt.assessment.kind,
          evidenceKind: attempt.assessment.evidenceKind,
          evidenceKinds,
          ...(assessmentMetadata ?? {}),
          ...(attempt.frameId ? { frameId: attempt.frameId } : {}),
        },
      })
    },
    [
      assessmentMetadata,
      isReview,
      lesson,
      recordLearningAttempt,
      section,
    ],
  )

  const engine = useLessonEngine(lesson, {
    section,
    initialProgress: sectionInitial,
    initialFrameIndex:
      !isGuest && (isReview || resumeIndex != null) ? resumeFrameIndex : 0,
    resume: !isGuest && (isReview || resumeIndex != null),
    initialAssessmentResponse: restoredResponse,
    completeAsLesson: section === 'quiz' && !isReview,
    examMode,
    enableStrikeRetake,
    reviewMode: isReview
      ? { onStepCleared: handleReviewStepCleared }
      : undefined,
    onSave: handleSave,
    onAttempt,
    onGradeAssessment,
    onAssessmentAttempt: handleAssessmentAttempt,
    onCorrect: ({ firstTry, responseMs }) => addXp(answerXp(true, firstTry, responseMs)),
    onConceptResult: recordConceptResult,
  })

  engineRef.current = engine

  // Showcase-account dev bypass: one click finishes the whole quiz as a
  // perfect run with real persisted evidence, so every downstream gate
  // (mission practice, retention, mastery) records normally.
  const [skippingQuiz, setSkippingQuiz] = useState(false)
  const handleSkipQuiz = async () => {
    if (skippingQuiz) return
    setSkippingQuiz(true)
    try {
      await engine.skipQuiz()
    } finally {
      setSkippingQuiz(false)
    }
  }

  // Boss mode: the moment the quiz section is finished, jump straight to the
  // fight — no review loop, no "next lesson" completion screen. Beating the boss
  // is what clears the level now.
  const quizDoneFired = useRef(false)
  useEffect(() => {
    if (!onQuizComplete || section !== 'quiz') return
    if (engine.isComplete && engine.result && !quizDoneFired.current) {
      quizDoneFired.current = true
      onQuizComplete(engine.result)
    }
  }, [engine.isComplete, engine.result, onQuizComplete, section])

  // Learn checkpoint finished → jump straight back to Code City. The overworld
  // milestone popup carries the "checkpoint complete" message, so we skip the
  // redundant full-screen interstitial.
  const cityReturnFired = useRef(false)
  useEffect(() => {
    if (section !== 'learn' || isReview || cityReturnFired.current) return

    if (isPart && onPartComplete) {
      const done =
        lesson.steps.length === 0 || (engine.isComplete && !!engine.result)
      if (!done) return
      cityReturnFired.current = true
      onPartComplete(learnPart ?? 0, isFinalPart)
      return
    }

    if (!isPart && engine.isComplete && engine.result) {
      cityReturnFired.current = true
      onTakeQuiz()
    }
  }, [
    section,
    isReview,
    isPart,
    isFinalPart,
    onPartComplete,
    onTakeQuiz,
    lesson.steps.length,
    engine.isComplete,
    engine.result,
    learnPart,
  ])

  const flushSectionProgress = useCallback(() => {
    const eng = engineRef.current
    if (!eng || eng.isComplete || isReview) return
    const base = getLessonProgress(lesson.id) ?? initial ?? freshLessonProgress(lesson.id, section)
    const snap = eng.progressSnapshot

    handleSave({
      ...base,
      status: base.status === 'completed' ? 'completed' : 'inProgress',
      currentStepIndex: eng.stepIndex,
      completedStepIds: [
        ...new Set([...(base.completedStepIds ?? []), ...snap.completedStepIds]),
      ],
      correctCount: snap.correctCount,
      wrongCount: snap.wrongCount,
      totalAttempts: snap.totalAttempts,
      correctFirstTry: snap.correctFirstTry,
      accuracy: snap.accuracy,
      masteryScore: snap.masteryScore,
      unlockNextLesson: base.unlockNextLesson ?? false,
      ...(section === 'learn'
        ? {
            learnStepIndex: Math.max(base.learnStepIndex ?? 0, eng.stepIndex),
            learnFrameIndex: eng.frameIndex,
          }
        : {
            quizStepIndex: Math.max(base.quizStepIndex ?? 0, eng.stepIndex),
            quizFrameIndex: eng.frameIndex,
          }),
      updatedAt: new Date().toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSave reads latest progress via getLessonProgress.
  }, [isReview, getLessonProgress, lesson.id, section])

  const flushRef = useRef(flushSectionProgress)
  flushRef.current = flushSectionProgress
  const quizMarkedRef = useRef(false)

  useEffect(() => {
    if (quizMarkedRef.current || isGuest || isReview || section !== 'quiz') return
    quizMarkedRef.current = true
    const base = getLessonProgress(lesson.id) ?? initial
    if (!base || base.status === 'completed' || base.quizStepIndex != null) return
    handleSave({
      ...base,
      status: 'inProgress',
      learnCompleted: true,
      quizStepIndex: 0,
      quizFrameIndex: 0,
      currentStepIndex: 0,
      updatedAt: new Date().toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, isReview, isGuest, lesson.id])

  useEffect(() => {
    if (isGuest || isReview) return
    const base = getLessonProgress(lesson.id) ?? initial
    if (base) return
    handleSave(freshLessonProgress(lesson.id, section))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, isReview, lesson.id, section])

  useEffect(() => {
    const flush = () => flushRef.current()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  useEffect(() => {
    if (isReview || engine.isComplete) return
    flushRef.current()
  }, [engine.stepIndex, engine.frameIndex, isReview, engine.isComplete])

  useEffect(() => {
    return () => {
      flushRef.current()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (!isReview || !engineRef.current) return
      const eng = engineRef.current
      persistReviewProgress(eng.stepIndex, eng.frameIndex)
    }
  }, [isReview, persistReviewProgress])

  // ---- Mission stash writes: debounce keystroke-level changes, flush on tab
  // hide/close and on unmount, so the in-flight draft survives leaving.
  const stashRef = useRef(stash ?? null)
  stashRef.current = stash ?? null
  const writeStash = useCallback(() => {
    const store = stashRef.current
    const eng = engineRef.current
    if (!store || !eng || isReview || eng.isComplete) return
    store.save({
      section,
      stepIndex: eng.stepIndex,
      response: eng.assessmentResponse,
      tutor: tutorMessagesRef.current,
    })
  }, [isReview, section])

  useEffect(() => {
    if (!stash || isReview || engine.isComplete) return
    const timer = setTimeout(writeStash, 600)
    return () => clearTimeout(timer)
  }, [
    stash,
    isReview,
    writeStash,
    engine.assessmentResponse,
    engine.stepIndex,
    engine.isComplete,
  ])

  useEffect(() => {
    if (!stash) return
    const flush = () => writeStash()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [stash, writeStash])

  // Section finished: the draft is spent. A finished learn section rolls the
  // stash forward (tutor chat continues into the quiz); a finished quiz run
  // clears it — the mission flow also clears once evidence records.
  useEffect(() => {
    const store = stashRef.current
    if (!store || !engine.isComplete || isReview) return
    if (section === 'learn') {
      store.save({
        section: 'quiz',
        stepIndex: 0,
        response: null,
        tutor: tutorMessagesRef.current,
      })
    } else {
      store.clear()
    }
  }, [engine.isComplete, isReview, section])

  // ---- Tutor: context is read fresh at question time (current step prompt,
  // editor code, latest run verdict from the workbench mailbox).
  const handleTutorMessages = useCallback(
    (messages: TutorChatMessage[]) => {
      tutorMessagesRef.current = messages
      writeStash()
    },
    [writeStash],
  )

  const tutorTitle = tutor?.title ?? fullLesson.title
  const buildTutorContext = useCallback((): TutorProblemContext => {
    const eng = engineRef.current
    const step = eng?.displayStep
    const assessment = step?.assessment
    const parts: string[] = []
    if (step?.prompt) parts.push(step.prompt)
    if (assessment?.kind === 'pythonCode') {
      parts.push(describePythonAssessmentForTutor(assessment))
    }
    const response = eng?.assessmentResponse
    return {
      problemTitle: tutorTitle,
      problemStatement: parts.join('\n\n'),
      code: response?.kind === 'pythonCode' ? response.code : null,
      runSummary: readTutorRun(assessment?.id ?? null),
    }
  }, [tutorTitle])

  const completionSaved = useRef(false)
  useEffect(() => {
    if (!engine.isComplete || !engine.result || completionSaved.current) return
    completionSaved.current = true

    if (section === 'learn' && !isReview) {
      // A non-final part accumulates completed slides but does NOT finish the
      // lesson — only the final part flips learnCompleted.
      const completeLesson = !isPart || isFinalPart
      onSave({
        lessonId: lesson.id,
        status: 'inProgress',
        currentStepIndex: lesson.steps.length - 1,
        completedStepIds: [
          ...new Set([
            ...(initial?.completedStepIds ?? []),
            ...engine.completedStepIds,
          ]),
        ],
        correctCount: initial?.correctCount ?? 0,
        wrongCount: initial?.wrongCount ?? 0,
        totalAttempts: initial?.totalAttempts ?? 0,
        correctFirstTry: initial?.correctFirstTry ?? 0,
        accuracy: initial?.accuracy ?? 0,
        masteryScore: initial?.masteryScore ?? 0,
        unlockNextLesson: false,
        learnCompleted: completeLesson ? true : (initial?.learnCompleted ?? false),
        learnStepIndex: completeLesson
          ? Math.max(initial?.learnStepIndex ?? 0, lesson.steps.length - 1)
          : (initial?.learnStepIndex ?? 0),
        quizStepIndex: initial?.quizStepIndex,
        updatedAt: new Date().toISOString(),
      })
      return
    }

    if (section === 'quiz' && !isReview) {
      quizResultRef.current = engine.result
      const runBadges = engine.result.badgeCounts
      const interactive = stepsForSection(fullLesson.steps, 'quiz').filter(
        (s) =>
          s.type !== 'intro' &&
          s.type !== 'concept' &&
          s.type !== 'explore' &&
          s.type !== 'quizIntro',
      )
      const base = getLessonProgress(lesson.id) ?? initial
      if (base) {
        onSave({
          ...base,
          status: 'completed',
          masteryScore: engine.result.masteryScore,
          unlockNextLesson: markUnlockAchieved(base, engine.result.masteryScore),
          accuracy: engine.result.accuracy,
          lastQuizBadgeCounts: runBadges,
          pendingBadgeCounts: runBadges,
          lastReview: {
            steps: interactive,
            missedStepIds: engine.result.stepReviews
              .filter((s) => s.missed)
              .map((s) => s.id),
            recordedAt: new Date().toISOString(),
            reviewStepIndex: 0,
            reviewFrameIndex: 0,
          },
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }, [
    section,
    isReview,
    isPart,
    isFinalPart,
    lesson,
    fullLesson,
    engine.isComplete,
    engine.result,
    getLessonProgress,
    initial,
    onSave,
    quizResultRef,
  ])

  useEffect(() => {
    // Boss mode (onQuizComplete) never enters a review loop — it goes to the fight.
    if (onQuizComplete) return
    if (!engine.isComplete || !engine.result || section !== 'quiz' || isReview)
      return

    const missedIds = engine.result.stepReviews
      .filter((s) => s.missed)
      .map((s) => s.id)
    if (
      engine.result.masteryScore < MASTERY_UNLOCK_THRESHOLD &&
      missedIds.length > 0
    ) {
      quizResultRef.current = engine.result
      onRedoMissed(missedIds)
    }
  }, [
    engine.isComplete,
    engine.result,
    section,
    isReview,
    onRedoMissed,
    onQuizComplete,
    quizResultRef,
  ])

  useEffect(() => {
    if (onQuizComplete) return
    if (!engine.isComplete || !engine.result || section !== 'quiz' || !isReview)
      return

    const progress = getLessonProgress(lesson.id) ?? initial
    const mastery = progress?.masteryScore ?? 0
    const remaining = progress?.lastReview?.missedStepIds.length ?? 0

    if (meetsUnlockThreshold(mastery)) {
      onReviewMasteryReached()
      return
    }

    if (remaining > 0) {
      onRedoMissed(progress!.lastReview!.missedStepIds)
    }
  }, [
    engine.isComplete,
    engine.result,
    section,
    isReview,
    getLessonProgress,
    lesson.id,
    initial,
    onReviewMasteryReached,
    onRedoMissed,
    onQuizComplete,
  ])

  const tiles = useMemo(
    () =>
      engine.displayStep.assessment ? [] : genTiles(engine.displayStep),
    [engine.displayStep],
  )
  const pageClass = section === 'learn' ? 'lp lp-learn' : 'lp lp-quiz'

  const returningToCity =
    section === 'learn' &&
    !isReview &&
    (isPart
      ? lesson.steps.length === 0 || (engine.isComplete && !!engine.result)
      : engine.isComplete && !!engine.result)

  if (returningToCity) {
    return (
      <RoundShell embedded={embedded}>
        <main className={`container ${pageClass}`}>
          <Loader label="Returning to Code City" night />
        </main>
      </RoundShell>
    )
  }

  if (engine.isComplete && engine.result) {
    // Boss mode: the quiz is finished — hand straight off to the fight (done by
    // the onQuizComplete effect). Never show a review loop or completion screen.
    if (onQuizComplete && section === 'quiz') {
      return (
        <RoundShell embedded={embedded}>
          <main className={`container ${pageClass}`}>
            <Loader label="Entering the fight" night />
          </main>
        </RoundShell>
      )
    }

    if (section === 'quiz') {
      const progress = getLessonProgress(lesson.id) ?? initial
      const mastery = progress?.masteryScore ?? engine.result.masteryScore
      const remainingMissed = progress?.lastReview?.missedStepIds.length ?? 0

      if (
        !isReview &&
        mastery < MASTERY_UNLOCK_THRESHOLD &&
        engine.result.stepReviews.some((s) => s.missed)
      ) {
        return (
          <RoundShell embedded={embedded}>
            <main className={`container ${pageClass}`}>
              <Loader label="Starting review" night />
            </main>
          </RoundShell>
        )
      }

      if (
        isReview &&
        !meetsUnlockThreshold(mastery) &&
        remainingMissed > 0
      ) {
        return (
          <RoundShell embedded={embedded}>
            <main className={`container ${pageClass}`}>
              <Loader label="Continuing review" night />
            </main>
          </RoundShell>
        )
      }

      const saved = progress
      const baseResult =
        quizResultRef.current ??
        (saved ? savedQuizResult(saved) : null) ??
        engine.result
      const displayResult: LessonResult = {
        ...baseResult,
        masteryScore: mastery,
        unlockNext: meetsUnlockThreshold(mastery),
      }
      const reviewCleared =
        isReview &&
        meetsUnlockThreshold(mastery) &&
        (quizResultRef.current?.stepReviews.some((s) => s.missed) ??
          (saved?.lastReview?.missedStepIds.length ?? 0) > 0)

      return (
        <RoundShell embedded={embedded}>
          <main className={`container ${pageClass}`}>
            <CompletionView
              result={displayResult}
              streakCurrent={streakCurrent}
              lessonId={lesson.id}
              lessonTitle={fullLesson.title}
              nextLessonTitle={nextLessonTitle}
              isLastLesson={isLastLesson}
              isGuest={isGuest}
              reviewCleared={reviewCleared}
              badgeCounts={baseResult.badgeCounts}
              onNext={onNext}
              onReturn={onExit}
              onReplay={onReplay}
            />
          </main>
        </RoundShell>
      )
    }

    return null
  }

  return (
    <RoundShell embedded={embedded}>
      <main className={`container ${pageClass}`}>
        <div className="lp-top">
          <button
            type="button"
            className="lp-exit"
            aria-label="Exit to course"
            disabled={engine.isGrading}
            onClick={onExit}
          >
            <IconArrowLeft size={18} />
          </button>
          {section === 'learn' && !isReview && (
            <PreviousTestReview lessonId={lesson.id} lessonTitle={lesson.title} />
          )}
          {isReview && (
            <ReviewMasteryBar
              mastery={displayMastery}
              remaining={remainingMissed}
            />
          )}
          {!engine.isPassive && (
            <div className="lp-progress" aria-label="Section progress">
              <LevelTracker
                segments={engine.progressSegments}
                total={engine.progressTotal}
              />
            </div>
          )}
          {engine.isPassive && section === 'learn' && (
            <span className="learn-slide-count muted">
              Slide {engine.stepIndex + 1}/{engine.totalSteps}
            </span>
          )}
          {section === 'quiz' && !engine.isPassive && (
            <button
              type="button"
              className="btn ghost sm lp-restart-quiz"
              disabled={engine.isGrading}
              onClick={onReplay}
            >
              Restart quiz
            </button>
          )}
          {isShowcaseAccount && (section === 'quiz' || isReview) && (
            <button
              type="button"
              className="btn ghost sm lp-skip-quiz"
              disabled={engine.isGrading || skippingQuiz}
              onClick={() => void handleSkipQuiz()}
            >
              {skippingQuiz ? 'Skipping…' : 'Skip quiz'}
            </button>
          )}
        </div>

        <SectionHeader
          section={section}
          title={lesson.title}
          isReview={isReview}
        />

        {engine.isPassive ? (
          <PassiveView
            section={section}
            title={lesson.title}
            step={engine.step}
            slideIndex={engine.stepIndex}
            slideTotal={engine.totalSteps}
            canGoPrevious={section === 'learn' && engine.canGoPrev}
            onContinue={engine.next}
            onPrevious={engine.prev}
          />
        ) : (
          <StepView
            section={section}
            engine={engine}
            tiles={tiles}
            lessonStepCount={lesson.steps.length}
            isReview={isReview}
            examMode={examMode}
            pythonJudge={pythonJudge}
            pythonSubmitRun={pythonSubmitRun}
            onReviewLesson={onReviewLesson}
            onForceRetake={onForceRetake}
          />
        )}
      </main>

      {tutor && !examMode && (
        <TutorPanel
          getContext={buildTutorContext}
          initialMessages={tutorMessagesRef.current}
          onMessagesChange={handleTutorMessages}
        />
      )}
    </RoundShell>
  )
}

function ReviewMasteryBar({
  mastery,
  remaining,
}: {
  mastery: number
  remaining: number
}) {
  const pct = Math.min(100, Math.round((mastery / MASTERY_UNLOCK_THRESHOLD) * 100))
  return (
    <div className="review-mastery-bar" aria-label={`Mastery ${mastery} percent`}>
      <div className="review-mastery-head">
        <span className="review-mastery-label">Mastery</span>
        <span className="review-mastery-value">
          {mastery}%
          <span className="review-mastery-target">
            {' '}
            / {MASTERY_UNLOCK_THRESHOLD}%
          </span>
        </span>
      </div>
      <div className="review-mastery-track">
        <div
          className="review-mastery-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="review-mastery-hint muted">
        {remaining > 0
          ? `${remaining} missed left — each correct answer raises your score.`
          : `Reach ${MASTERY_UNLOCK_THRESHOLD}% to unlock the next lesson.`}
      </p>
    </div>
  )
}

function SectionHeader({
  section,
  title,
  isReview,
}: {
  section: CourseSection
  title: string
  isReview?: boolean
}) {
  const isLearn = section === 'learn'
  return (
    <header className={`section-header ${isLearn ? 'learn' : 'quiz'}`}>
      <span className="section-header-eyebrow">
        {isReview
          ? 'Review missed questions'
          : isLearn
            ? 'Interactive lesson'
            : 'Quiz section'}
      </span>
      <h1 className="section-header-title">{title}</h1>
      <p className="section-header-sub muted">
        {isReview
          ? 'Get missed questions right to raise your score — each one you clear counts. Progress saves as you go.'
          : isLearn
            ? 'Learn the pattern with visuals and walkthroughs — practice checks every few slides gate your progress. Prove it in the quiz.'
            : 'NeetCode-style practice — no new concepts, just prove you learned the pattern.'}
      </p>
    </header>
  )
}

function LessonSlideNav({
  canGoPrevious,
  onPrevious,
  primaryLabel,
  onPrimary,
  primaryClassName = 'btn lg',
  primaryDisabled,
}: {
  canGoPrevious: boolean
  onPrevious: () => void
  primaryLabel: string
  onPrimary: () => void
  primaryClassName?: string
  primaryDisabled?: boolean
}) {
  return (
    <div className="lesson-slide-nav">
      <button
        type="button"
        className="btn ghost lg lesson-slide-prev"
        disabled={!canGoPrevious}
        onClick={onPrevious}
      >
        <IconArrowLeft size={18} />
        Previous
      </button>
      <button
        type="button"
        className={primaryClassName}
        disabled={primaryDisabled}
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
    </div>
  )
}

function PassiveView({
  section,
  title,
  step,
  slideIndex,
  slideTotal,
  canGoPrevious,
  onContinue,
  onPrevious,
}: {
  section: CourseSection
  title: string
  step: LessonStep
  slideIndex: number
  slideTotal: number
  canGoPrevious: boolean
  onContinue: () => void
  onPrevious: () => void
}) {
  const isQuizGate = step.type === 'quizIntro'
  const isLearn = section === 'learn'
  const isDemo = step.type === 'demonstration'
  const isThink = step.type === 'thinkCheck'
  const [revealed, setRevealed] = useState(false)
  const isLastSlide = slideIndex >= slideTotal - 1

  const sequenceFrames =
    step.diagramSequence ?? (step.diagram ? [step.diagram] : undefined)
  const {
    diagram: liveDiagram,
    prevDiagram,
    frameIndex,
    frameCount,
    sequenceDurationMs,
    changedIndices,
  } = useDiagramSequence(sequenceFrames, step.id)

  useEffect(() => {
    setRevealed(false)
  }, [step.id])

  const autoplayAllowed = canAutoplayStep(section, step, revealed)
  const durationMs = useMemo(
    () => Math.max(slideAutoplayMs(step, isDemo), sequenceDurationMs),
    [step, isDemo, sequenceDurationMs],
  )
  const { playing, progress, toggle, pause } = useLessonAutoplay({
    enabled: autoplayAllowed,
    stepId: step.id,
    durationMs,
    onAdvance: onContinue,
  })

  const continueLabel = isQuizGate
    ? 'Start quiz'
    : isThink && !revealed
      ? 'Show answer'
      : isLastSlide && isLearn
        ? 'Finish lesson'
        : playing && autoplayAllowed
          ? 'Next slide…'
          : 'Continue'

  function handlePrevious() {
    pause()
    onPrevious()
  }

  function handlePrimary() {
    if (isThink && !revealed) {
      setRevealed(true)
      return
    }
    onContinue()
  }

  return (
    <div
      className={`stage intro-view ${isLearn ? 'learn-passive' : 'quiz-passive'} ${isDemo ? 'demo-slide' : ''} ${playing && autoplayAllowed ? 'is-autoplaying' : ''}`}
    >
      {autoplayAllowed && (
        <div className="lesson-autoplay-bar" aria-label="Lesson playback">
          <button
            type="button"
            className="lesson-autoplay-toggle btn ghost sm"
            onClick={toggle}
            aria-pressed={playing}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <div className="lesson-autoplay-track" aria-hidden="true">
            <div
              className="lesson-autoplay-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="lesson-autoplay-label muted">
            {playing ? 'Auto-advancing' : 'Paused'}
          </span>
        </div>
      )}

      <div className="stage-reveal stack-center" key={step.id}>
        {step.phaseLabel && (
          <span className={`phase-tag ${isLearn ? 'learn' : 'quiz'} lesson-slide-meta`}>
            {step.phaseLabel}
            {isLearn && slideTotal > 1 && (
              <span className="trace-frame-count">
                {' '}
                · {slideIndex + 1}/{slideTotal}
              </span>
            )}
          </span>
        )}
        {isLearn && !isQuizGate && !isDemo && !isThink && (
          <h2 className="intro-title">{title}</h2>
        )}
        {isDemo && step.hook && (
          <h2 className="intro-title demo-hook lesson-slide-meta">{step.hook}</h2>
        )}
        {isQuizGate && <h2 className="intro-title lesson-slide-meta">Ready for the quiz?</h2>}
        {!isDemo && step.hook && !isThink && (
          <p className="concept-hook">{step.hook}</p>
        )}
        {isThink && step.hook && <p className="concept-hook">{step.hook}</p>}
        {liveDiagram && (
          <div
            className={`${isLearn ? 'learn-diagram-hero' : 'quiz-diagram'} lesson-diagram-wrap`}
          >
            {frameCount > 1 && (
              <div className="diagram-sequence-progress muted" aria-live="polite">
                Step {frameIndex + 1} of {frameCount}
              </div>
            )}
            <VisualDiagram
              diagram={liveDiagram}
              prevDiagram={prevDiagram}
              animated
              motion
              changedIndices={changedIndices}
            />
          </div>
        )}
        {step.code.length > 0 && (
          <CodePanel
            code={step.code}
            currentLineIndex={step.currentLineIndex}
            showRunHint={isDemo && step.currentLineIndex != null}
            animated
            motion={false}
          />
        )}
        <p className={`intro-prompt lesson-slide-meta ${isDemo ? 'demo-prompt' : ''}`}>
          {step.prompt}
        </p>
        {step.bullets && step.bullets.length > 0 && (
          <ul className="demo-bullets">
            {step.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {step.callout && (!isThink || revealed) && (
          <div className="demo-callout lesson-callout-enter lesson-slide-meta" role="note">
            <span className="demo-callout-label">
              {isThink ? 'Answer' : 'Key value'}
            </span>
            <p className="demo-callout-text">{isThink ? step.reveal : step.callout}</p>
            {isThink && step.callout && revealed && (
              <p className="demo-callout-sub muted">{step.callout}</p>
            )}
          </div>
        )}
        {isThink && !revealed && (
          <p className="stage-hint muted think-hint">
            Think for a moment — then reveal the answer. This is not scored.
          </p>
        )}
        <LessonSlideNav
          canGoPrevious={canGoPrevious}
          onPrevious={handlePrevious}
          primaryLabel={continueLabel}
          onPrimary={handlePrimary}
          primaryClassName={`btn lg ${isQuizGate ? 'quiz-start' : isLearn ? 'learn-continue' : ''}`}
        />
      </div>
    </div>
  )
}

function stepUsesLineRun(step: LessonStep): boolean {
  return (
    step.type === 'traceVariables' ||
    step.type === 'visualExample' ||
    (step.traceFrames?.length ?? 0) > 0
  )
}

function isDirectAnswer(type: LessonStep['type']): boolean {
  return type === 'teachCheck' || type === 'reflection' || type === 'lessonPractice'
}

function isTileOnlyStep(step: LessonStep): boolean {
  return (
    step.targetVariables.length === 1 &&
    step.targetVariables[0] === 'answer' &&
    step.inputMode === 'text' &&
    (step.answerTiles?.length ?? 0) > 0
  )
}

function formatStepAnswer(step: LessonStep): string {
  return step.targetVariables
    .map((t) => String(step.expectedState[t]))
    .join(', ')
}

function AnswerRevealCard({ answer }: { answer: string }) {
  return (
    <div className="answer-reveal-card" role="status">
      <span className="answer-reveal-label">Correct answer</span>
      <p className="answer-reveal-value">{answer}</p>
    </div>
  )
}

function StepView({
  section,
  engine,
  tiles,
  lessonStepCount,
  isReview,
  examMode = false,
  pythonJudge,
  pythonSubmitRun,
  onReviewLesson,
  onForceRetake,
}: {
  section: CourseSection
  engine: ReturnType<typeof useLessonEngine>
  tiles: (number | string)[]
  lessonStepCount: number
  isReview?: boolean
  /** Deferred-feedback exam: no hints, no verdicts, auto-advance when solved. */
  examMode?: boolean
  pythonJudge?: PythonJudgeRunner
  pythonSubmitRun?: { assessmentId: string; result: PythonJudgeRunResult } | null
  /** Send the learner to the teaching content and back (per-miss review box). */
  onReviewLesson?: () => void
  /** Forced full lesson retake after 3 consecutive misses on this question. */
  onForceRetake?: () => void
}) {
  const { step, displayStep, phase, frameIndex, frameCount, isTrace, progressCurrent, progressTotal } = engine
  // Demo-only escape hatch: the showcase account may skip any question.
  const { isShowcaseAccount } = useAuth()
  // A pre-submit "Run code" shares the judge worker with grading — lock the
  // Check button while it runs so the two can never race.
  const [pythonRunning, setPythonRunning] = useState(false)
  const prevDiagramRef = useRef<{ stepId: string; diagram?: DiagramSpec }>({
    stepId: '',
  })
  const prevDiagram =
    prevDiagramRef.current.stepId === step.id
      ? prevDiagramRef.current.diagram
      : undefined

  useLayoutEffect(() => {
    prevDiagramRef.current = { stepId: step.id, diagram: displayStep.diagram }
  })

  const diagramChanged = useMemo(
    () => diagramChangedIndices(prevDiagram, displayStep.diagram),
    [prevDiagram, displayStep.diagram],
  )
  const isLearn = section === 'learn'
  // Quizzes are one-way: no going back to a previous slide once you're in.
  const allowPrev = isLearn && engine.canGoPrev && !engine.isGrading
  const isCheckpoint = step.type === 'lessonPractice'
  const isLineRun = stepUsesLineRun(step)
  const directAnswer = isDirectAnswer(displayStep.type)
  const hasAssessment = !!displayStep.assessment
  const isPythonAssessment = displayStep.assessment?.kind === 'pythonCode'
  // Post-submit breakdown: only once this attempt is actually graded, only for
  // this assessment, and never in exam mode (verdicts are deferred there).
  const gradedStatus = engine.assessmentResult?.status
  const pythonSubmitResult =
    !examMode &&
    isPythonAssessment &&
    (gradedStatus === 'correct' || gradedStatus === 'incorrect') &&
    pythonSubmitRun != null &&
    pythonSubmitRun.assessmentId === displayStep.assessment?.id
      ? pythonSubmitRun.result
      : null
  const tileOnly = !hasAssessment && isTileOnlyStep(displayStep)
  const hints = displayStep.hints ?? step.hints
  const hintUnlockAttempt = step.hintPolicy?.availableAfterAttempts ?? 0
  const hintsLocked = engine.stepAttempts < hintUnlockAttempt
  const isLastStep = engine.stepIndex === lessonStepCount - 1
  const isLastFrame = !isTrace || frameIndex >= frameCount - 1
  const isLast = isLastStep && isLastFrame
  const revealed = phase === 'solved' && engine.answerRevealed
  const globalStep = Math.min(progressCurrent + 1, progressTotal)
  // Per-miss "review the lesson" affordance and the 3-strikes forced retake are
  // normal-quiz-only. Exam mode and the missed-question review loop never show
  // them (the engine also hard-gates `forcedRetake`).
  const canReviewLesson =
    !examMode && !isReview && section === 'quiz' && !!onReviewLesson
  const showForcedRetake = engine.forcedRetake && !!onForceRetake
  const showReviewPrompt =
    canReviewLesson &&
    !showForcedRetake &&
    phase === 'answering' &&
    engine.feedback?.kind === 'incorrect'

  const frame = step.traceFrames?.[frameIndex]
  const runLabel = frame?.runLabel ?? (isLineRun ? 'Run line' : 'Try it')
  const selectedTileValues = displayStep.targetVariables
    .map((t) => engine.boxValues[t]?.trim())
    .filter((v): v is string => !!v)
  const tileOnlyAnswer = engine.boxValues.answer ?? ''
  const readyHint = examMode
    ? 'Exam rules: one attempt per question, no hints. Results come at the end.'
    : isCheckpoint
    ? `Practice check — ${2 - engine.stepAttempts} ${engine.stepAttempts === 0 ? 'tries' : 'try'} left, no hints.`
    : directAnswer
    ? 'Pick the best answer — use what you just learned.'
    : isLineRun
      ? isTrace
        ? 'Run the highlighted line, then answer — you will walk through every step.'
        : 'Run the highlighted line to see what changes.'
      : 'Work through the question, then fill in your answer.'

  return (
    <div className={`stage ${isLearn ? 'learn-stage' : 'quiz-stage'}${isCheckpoint ? ' checkpoint-stage' : ''}`}>
      {engine.rewindNotice && (
        <p className="checkpoint-rewind-notice" role="status">
          {engine.rewindNotice}
        </p>
      )}
      {step.phaseLabel && (
        <span className={`phase-tag ${isLearn ? 'learn' : 'quiz'}`}>
          {step.phaseLabel}
          {progressTotal > 1 && (
            <span className="trace-frame-count">
              {' '}
              · {globalStep}/{progressTotal}
            </span>
          )}
        </span>
      )}

      {isLearn && displayStep.diagram && phase !== 'solved' && (
        <div className="learn-diagram-hero lesson-diagram-wrap">
          <VisualDiagram
            diagram={displayStep.diagram}
            prevDiagram={prevDiagram}
            animated
            motion
            changedIndices={diagramChanged}
          />
        </div>
      )}

      {step.code.length > 0 && !isPythonAssessment && (
        <CodePanel
          code={step.code}
          currentLineIndex={displayStep.currentLineIndex}
          showRunHint={isLineRun && (phase === 'ready' || phase === 'answering')}
          animated
          motion={isLineRun || isLearn}
        />
      )}

      {!isLearn && displayStep.diagram && phase !== 'solved' && (
        <div className="lesson-diagram-wrap">
          <VisualDiagram
            diagram={displayStep.diagram}
            prevDiagram={prevDiagram}
            animated
            motion
            changedIndices={diagramChanged}
          />
        </div>
      )}

      {!examMode && hints && hints.length > 0 && phase === 'answering' && (
        <HintPanel
          key={`${engine.stepIndex}-${frameIndex}`}
          hints={hints}
          autoReveal={engine.stepAttempts >= 1 ? 1 : 0}
          disabled={hintsLocked}
          disabledMessage="Hints unlock after the first miss."
          onReveal={engine.markHintUsed}
        />
      )}

      {phase === 'ready' && !directAnswer && (
        <div
          className="stage-reveal stack-center"
          key={`ready-${engine.stepIndex}-${frameIndex}`}
        >
          <p className="stage-hint muted">{readyHint}</p>
          {displayStep.prompt && (
            <p className="stage-question">{displayStep.prompt}</p>
          )}
          <LessonSlideNav
            canGoPrevious={allowPrev}
            onPrevious={engine.prev}
            primaryLabel={runLabel}
            onPrimary={engine.runStep}
            primaryClassName={`btn lg ${isLearn ? 'learn-continue' : ''}`}
          />
        </div>
      )}

      {(phase === 'answering' || phase === 'grading' || phase === 'solved') && (
        <div
          className="stage-reveal answer-stage"
          key={`answer-${engine.stepIndex}-${frameIndex}-${phase}`}
        >
          <p className="stage-question">{displayStep.prompt}</p>

          {isCheckpoint && !examMode && phase === 'answering' && (
            <p className="stage-hint muted">
              {engine.stepAttempts === 0 ? '2 tries · no hints' : '1 try left · no hints'}
            </p>
          )}

          {hasAssessment && displayStep.assessment && engine.assessmentResponse ? (
            <AssessmentInput
              assessment={displayStep.assessment}
              response={engine.assessmentResponse}
              activeFrameIndex={frameIndex}
              disabled={phase === 'grading' || phase === 'solved'}
              onChange={engine.setAssessmentResponse}
              python={
                isPythonAssessment
                  ? {
                      runJudge: pythonJudge,
                      submitResult: pythonSubmitResult,
                      onRunningChange: setPythonRunning,
                    }
                  : undefined
              }
            />
          ) : revealed && tileOnly ? (
            <AnswerRevealCard answer={formatStepAnswer(displayStep)} />
          ) : tileOnly && phase === 'answering' ? (
            <AnswerChoiceSlot value={tileOnlyAnswer} />
          ) : !tileOnly ? (
            <VariableBoxes
              step={displayStep}
              boxValues={engine.boxValues}
              activeVar={engine.activeVar}
              errorVars={engine.errorVars}
              locked={phase === 'solved'}
              answerRevealed={engine.answerRevealed}
              onSetActive={engine.setActiveVar}
              onSetBox={engine.setBox}
            />
          ) : null}

          {phase === 'solved' && engine.lastStepBadge && !engine.answerRevealed && (
            <SpeedBadgeFlash tier={engine.lastStepBadge} />
          )}

          {engine.feedback && !showForcedRetake && (
            <FeedbackPanel feedback={engine.feedback} />
          )}

          {showReviewPrompt && onReviewLesson && (
            <ReviewLessonPrompt onReview={onReviewLesson} />
          )}

          {showForcedRetake && onForceRetake ? (
            <ForcedRetakePrompt onRetake={onForceRetake} />
          ) : phase === 'answering' || phase === 'grading' ? (
            <div className="stack-center answer-controls">
              {!hasAssessment && (
                <AnswerTiles
                  tiles={tiles}
                  disabled={phase === 'grading'}
                  selectedValue={tileOnly ? tileOnlyAnswer : null}
                  selectedValues={tileOnly ? undefined : selectedTileValues}
                  onPick={engine.fillActive}
                />
              )}
              <button
                type="button"
                className="btn lg full"
                disabled={
                  phase === 'grading' ||
                  pythonRunning ||
                  (hasAssessment
                    ? !engine.assessmentComplete
                    : !engine.allFilled)
                }
                onClick={
                  hasAssessment
                    ? () => void engine.checkAssessment()
                    : engine.check
                }
              >
                {phase === 'grading'
                  ? 'Checking…'
                  : isPythonAssessment
                    ? 'Submit'
                    : 'Check'}
              </button>
              {allowPrev && (
                <button
                  type="button"
                  className="btn ghost lesson-slide-prev-inline"
                  onClick={engine.prev}
                >
                  <IconArrowLeft size={16} />
                  Previous slide
                </button>
              )}
            </div>
          ) : examMode ? (
            <div className="exam-locked" role="status">
              <span className="exam-locked-dot" aria-hidden="true" />
              Answer locked in
              {isLast ? ' — scoring your exam…' : ' — next question…'}
            </div>
          ) : (
            <LessonSlideNav
              canGoPrevious={allowPrev}
              onPrevious={engine.prev}
              primaryLabel={
                engine.answerRevealed
                  ? 'Continue'
                  : isLast
                    ? section === 'learn'
                      ? 'Finish lesson'
                      : isReview
                        ? 'Next question'
                        : 'Finish quiz'
                    : isTrace && !isLastFrame
                      ? 'Next line'
                      : 'Continue'
              }
              onPrimary={engine.next}
              primaryClassName={`btn lg ${
                engine.answerRevealed ? 'ghost' : isLearn ? 'learn-continue lime' : 'lime'
              }`}
            />
          )}

          {isShowcaseAccount && phase !== 'solved' && (
            <button
              type="button"
              className="lp-skip-step"
              disabled={phase === 'grading' || pythonRunning}
              onClick={() => void engine.skipStep()}
            >
              Skip (demo)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SpeedBadgeFlash({ tier }: { tier: 'lightning' | 'quick' }) {
  const badge = getBadge(tier)
  if (!badge) return null
  const { Icon, label } = badge
  return (
    <div className={`speed-flash tone-${badge.tone}`} role="status">
      <Icon size={18} />
      <span>
        {label} <strong>badge!</strong>
      </span>
    </div>
  )
}
