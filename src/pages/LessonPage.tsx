import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { generateLesson, hasLesson } from '../content/lessons'
import { getWorld } from '../content/adventure'
import { LESSON_CATALOG, MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import { emptyBadgeCounts, getBadge } from '../content/badges'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { answerXp } from '../lib/playerLevel'
import { canGuestAccessLesson, canGuestAccessSection } from '../lib/guestAccess'
import { canAccessLessonPart } from '../lib/gameAccess'
import { getWorldState } from '../lib/questState'
import { useLessonEngine, type LessonResult } from '../hooks/useLessonEngine'
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
import { stepToReview } from '../components/lesson/ReviewBreakdown'
import { Loader } from '../components/Loader'
import { IconArrowLeft } from '../components/icons'
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
    stepReviews: progress.lastReview.steps
      .filter((s) => s.targetVariables.length > 0)
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
  const { isGuest } = useAuth()
  // The overworld entry token is one-time use — cache the access decision per
  // (level, part) so re-renders don't re-consume it and lock the player out.
  const lessonAccessRef = useRef<{ key: string; ok: boolean } | null>(null)

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

  if (section === 'quiz' && !levelMastered) {
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
        ok: canAccessLessonPart(world.index, learnPart, levelMastered),
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
  embedded,
}: {
  lessonId: string
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
  onQuizComplete?: () => void
  embedded?: boolean
}) {
  const { isGuest } = useAuth()
  const { getLessonProgress, restartQuizProgress } = useProgress()
  const liveProgress = getLessonProgress(lessonId) ?? initial
  const [round, setRound] = useState(0)
  const [reviewRound, setReviewRound] = useState(0)
  const [reviewFinished, setReviewFinished] = useState(false)
  const [reviewActive, setReviewActive] = useState(
    () => section === 'quiz' && !!initial && hasPendingMissedReview(initial),
  )
  const [forceFullQuiz, setForceFullQuiz] = useState(false)
  const quizResultRef = useRef<LessonResult | null>(null)

  const missedStepIds = liveProgress?.lastReview?.missedStepIds ?? []
  const isReview =
    section === 'quiz' &&
    reviewActive &&
    !forceFullQuiz &&
    missedStepIds.length > 0

  const baseLesson = useMemo(() => {
    void round
    return generateLesson(lessonId)!
  }, [lessonId, round])

  const sectionSteps = useMemo(
    () => stepsForSection(baseLesson.steps, section),
    [baseLesson, section],
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
      stepReviews: liveProgress.lastReview
        ? liveProgress.lastReview.steps
            .filter((s) => s.targetVariables.length > 0)
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

  return (
    <LessonRound
      key={`${round}:${reviewRound}:${isReview ? missedStepIds.join('|') : 'all'}:p${learnPart ?? 'x'}`}
      lesson={lesson}
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
      onReplay={replay}
      onRedoMissed={redoMissed}
      onReviewMasteryReached={onReviewMasteryReached}
      embedded={embedded}
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
  onReplay,
  onRedoMissed,
  onReviewMasteryReached,
  embedded,
}: {
  lesson: Lesson
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
  onQuizComplete?: () => void
  onReplay: () => void
  onRedoMissed: (ids: string[]) => void
  onReviewMasteryReached: () => void
  embedded?: boolean
}) {
  const isPart = learnPart != null && section === 'learn' && !isReview
  const { isGuest } = useAuth()
  const { addXp } = usePlayerLevel()
  const { getLessonProgress } = useProgress()
  const fullLesson = useMemo(() => generateLesson(lesson.id)!, [lesson.id])
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

  const engine = useLessonEngine(lesson, {
    section,
    initialProgress: sectionInitial,
    initialFrameIndex:
      !isGuest && (isReview || resumeIndex != null) ? resumeFrameIndex : 0,
    resume: !isGuest && (isReview || resumeIndex != null),
    completeAsLesson: section === 'quiz' && !isReview,
    reviewMode: isReview
      ? { onStepCleared: handleReviewStepCleared }
      : undefined,
    onSave: handleSave,
    onAttempt,
    onCorrect: ({ firstTry, responseMs }) => addXp(answerXp(true, firstTry, responseMs)),
  })

  engineRef.current = engine

  // Boss mode: the moment the quiz section is finished, jump straight to the
  // fight — no review loop, no "next lesson" completion screen. Beating the boss
  // is what clears the level now.
  const quizDoneFired = useRef(false)
  useEffect(() => {
    if (!onQuizComplete || section !== 'quiz') return
    if (engine.isComplete && engine.result && !quizDoneFired.current) {
      quizDoneFired.current = true
      onQuizComplete()
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

  const tiles = useMemo(() => genTiles(engine.displayStep), [engine.displayStep])
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
            onClick={onExit}
          >
            <IconArrowLeft size={18} />
          </button>
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
              onClick={onReplay}
            >
              Restart quiz
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
          />
        )}
      </main>
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
}: {
  section: CourseSection
  engine: ReturnType<typeof useLessonEngine>
  tiles: (number | string)[]
  lessonStepCount: number
  isReview?: boolean
}) {
  const { step, displayStep, phase, frameIndex, frameCount, isTrace, progressCurrent, progressTotal } = engine
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
  const allowPrev = isLearn && engine.canGoPrev
  const isCheckpoint = step.type === 'lessonPractice'
  const isLineRun = stepUsesLineRun(step)
  const directAnswer = isDirectAnswer(displayStep.type)
  const tileOnly = isTileOnlyStep(displayStep)
  const isLastStep = engine.stepIndex === lessonStepCount - 1
  const isLastFrame = !isTrace || frameIndex >= frameCount - 1
  const isLast = isLastStep && isLastFrame
  const revealed = phase === 'solved' && engine.answerRevealed
  const globalStep = Math.min(progressCurrent + 1, progressTotal)

  const frame = step.traceFrames?.[frameIndex]
  const runLabel = frame?.runLabel ?? (isLineRun ? 'Run line' : 'Try it')
  const selectedTileValues = displayStep.targetVariables
    .map((t) => engine.boxValues[t]?.trim())
    .filter((v): v is string => !!v)
  const tileOnlyAnswer = engine.boxValues.answer ?? ''
  const readyHint = isCheckpoint
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

      {step.code.length > 0 && (
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

      {step.hints && step.hints.length > 0 && phase === 'answering' && (
        <HintPanel
          key={`${engine.stepIndex}-${frameIndex}`}
          hints={step.hints}
          autoReveal={engine.stepAttempts >= 1 ? 1 : 0}
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

      {(phase === 'answering' || phase === 'solved') && (
        <div
          className="stage-reveal answer-stage"
          key={`answer-${engine.stepIndex}-${frameIndex}-${phase}`}
        >
          <p className="stage-question">{displayStep.prompt}</p>

          {isCheckpoint && phase === 'answering' && (
            <p className="stage-hint muted">
              {engine.stepAttempts === 0 ? '2 tries · no hints' : '1 try left · no hints'}
            </p>
          )}

          {revealed && tileOnly ? (
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

          {engine.feedback && <FeedbackPanel feedback={engine.feedback} />}

          {phase === 'answering' ? (
            <div className="stack-center answer-controls">
              <AnswerTiles
                tiles={tiles}
                disabled={false}
                selectedValue={tileOnly ? tileOnlyAnswer : null}
                selectedValues={tileOnly ? undefined : selectedTileValues}
                onPick={engine.fillActive}
              />
              <button
                className="btn lg full"
                disabled={!engine.allFilled}
                onClick={engine.check}
              >
                Check
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
