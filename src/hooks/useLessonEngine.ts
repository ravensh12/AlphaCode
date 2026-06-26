import { useCallback, useMemo, useRef, useState } from 'react'
import type { Lesson, LessonStep, VariableValue } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import { computeQuizMastery, meetsUnlockThreshold } from '../lib/mastery'
import { playCorrect, playWrong } from '../lib/soundFx'
import { resolveStepFrame } from '../content/lessons/traces'
import {
  BADGE_ORDER,
  computeBadgeCounts,
  speedTier,
  type BadgeCounts,
  type BadgeId,
  type SpeedTier,
} from '../content/badges'

export type FeedbackKind = 'correct' | 'incorrect' | 'revealed'
export type Feedback = { kind: FeedbackKind; text: string } | null
export type StepPhase = 'ready' | 'answering' | 'solved' | 'failed'

/** Wrong answers in a row before the learner must retry the level. */
const MISTAKES_BEFORE_RESTART = 2

/** Per-step outcome shown in the end-of-lesson review. */
export type StepReview = {
  id: string
  prompt: string
  code: string[]
  currentLineIndex?: number
  targetVariables: string[]
  expected: Record<string, VariableValue>
  /** True if the learner got it wrong at least once on this step. */
  missed: boolean
}

export type LessonResult = {
  accuracy: number
  masteryScore: number
  totalAttempts: number
  correctFirstTry: number
  unlockNext: boolean
  /** Badges earned this run — counts per type. */
  badgeCounts: BadgeCounts
  /** Badge types earned this run (non-zero counts). */
  badges: BadgeId[]
  /** Per-step breakdown of correct vs. missed answers. */
  stepReviews: StepReview[]
}

type Aggregates = {
  correctCount: number
  wrongCount: number
  totalAttempts: number
  correctFirstTry: number
  completedStepIds: string[]
  /** Fast first-try correct answers, for speed badges. */
  lightningCount: number
  quickCount: number
}

function badgeIdsFromCounts(counts: BadgeCounts): BadgeId[] {
  return BADGE_ORDER.filter((id) => counts[id] > 0)
}

function isMatch(expected: VariableValue, got: string): boolean {
  const a = String(expected).trim()
  const b = got.trim()
  if (typeof expected === 'string' && Number.isNaN(Number(expected))) {
    return a.toLowerCase() === b.toLowerCase()
  }
  return a === b
}

function isPassiveStep(type: LessonStep['type']): boolean {
  return (
    type === 'intro' ||
    type === 'concept' ||
    type === 'explore' ||
    type === 'demonstration' ||
    type === 'thinkCheck' ||
    type === 'quizIntro'
  )
}

function isInteractiveStep(type: LessonStep['type']): boolean {
  return !isPassiveStep(type)
}

function isTraceStep(step: LessonStep): boolean {
  return (step.traceFrames?.length ?? 0) > 0
}

function interactiveUnits(step: LessonStep): number {
  if (!isInteractiveStep(step.type)) return 0
  return step.traceFrames?.length ?? 1
}

function isDirectAnswerStep(type: LessonStep['type']): boolean {
  return type === 'teachCheck' || type === 'reflection' || type === 'lessonPractice'
}

function isCheckpointStep(step: LessonStep): boolean {
  return step.type === 'lessonPractice'
}

function freshBoxes(step: LessonStep): Record<string, string> {
  const boxes: Record<string, string> = {}
  for (const v of step.targetVariables) boxes[v] = ''
  return boxes
}

function expectedBoxes(step: LessonStep): Record<string, string> {
  const boxes: Record<string, string> = {}
  for (const v of step.targetVariables) {
    boxes[v] = String(step.expectedState[v])
  }
  return boxes
}

function formatExpectedAnswer(step: LessonStep): string {
  return step.targetVariables
    .map((t) => {
      const val = step.expectedState[t]
      if (step.targetVariables.length === 1 && t === 'answer') return String(val)
      return `${t} = ${val}`
    })
    .join(', ')
}

function revealFeedback(step: LessonStep): Feedback {
  return {
    kind: 'revealed',
    text: `The answer is ${formatExpectedAnswer(step)}. Counted as a miss — you'll see this in your review.`,
  }
}

export type ProgressSegmentState = 'todo' | 'now' | 'correct' | 'wrong'

function globalUnitIndex(
  steps: LessonStep[],
  stepIndex: number,
  frameIndex: number,
): number {
  let idx = 0
  for (let i = 0; i < stepIndex; i++) {
    idx += interactiveUnits(steps[i])
  }
  return idx + frameIndex
}

function recordUnitOutcome(
  prev: (('correct' | 'wrong') | null)[],
  unitIdx: number,
  missed: boolean,
): (('correct' | 'wrong') | null)[] {
  const next = [...prev]
  while (next.length <= unitIdx) next.push(null)
  next[unitIdx] = missed ? 'wrong' : 'correct'
  return next
}

export type LessonEngine = {
  step: LessonStep
  stepIndex: number
  totalSteps: number
  /** 1-based count of completed interactive steps, for the progress bar. */
  progressCurrent: number
  progressTotal: number
  progressSegments: ProgressSegmentState[]
  isPassive: boolean
  isComplete: boolean
  phase: StepPhase
  boxValues: Record<string, string>
  activeVar: string | null
  errorVars: string[]
  feedback: Feedback
  stepAttempts: number
  /** True when the step was completed after the answer was revealed. */
  answerRevealed: boolean
  allFilled: boolean
  /** Speed badge earned on the step just solved (for an in-lesson flash). */
  lastStepBadge: SpeedTier
  /** Resolved step for the current trace frame (or the step itself). */
  displayStep: LessonStep
  frameIndex: number
  frameCount: number
  isTrace: boolean
  result: LessonResult | null
  completedStepIds: string[]
  /** Shown after a checkpoint rewind — review the slides above. */
  rewindNotice: string | null
  /** Live run stats for persisting mid-section progress. */
  progressSnapshot: {
    correctCount: number
    wrongCount: number
    totalAttempts: number
    correctFirstTry: number
    completedStepIds: string[]
    accuracy: number
    masteryScore: number
  }
  // actions
  runStep: () => void
  setActiveVar: (v: string) => void
  setBox: (v: string, value: string) => void
  fillActive: (value: string) => void
  check: () => void
  next: () => void
  prev: () => void
  canGoPrev: boolean
  restartStep: () => void
  restart: () => void
}

export function useLessonEngine(
  lesson: Lesson,
  options?: {
    /** Which section is running — used to persist frame position. */
    section?: 'learn' | 'quiz'
    initialProgress?: LessonProgress
    /** Frame to resume within the current step (for trace walkthroughs). */
    initialFrameIndex?: number
    /** When false, always start at step 0 instead of resuming saved progress. */
    resume?: boolean
    /** When false, finishing steps marks section done but not lesson completed. */
    completeAsLesson?: boolean
    /** When set, fires after each non-revealed correct answer during review. */
    reviewMode?: {
      onStepCleared: (stepId: string) => void
    }
    onSave?: (progress: LessonProgress) => void
    onAttempt?: (attempt: AttemptRecord) => void
    /** Fired on each correct answer — used to grant speed-based XP. */
    onCorrect?: (info: { firstTry: boolean; responseMs: number }) => void
  },
): LessonEngine {
  const interactiveTotal = useMemo(
    () => lesson.steps.reduce((sum, s) => sum + interactiveUnits(s), 0),
    [lesson],
  )

  const resume =
    options?.resume !== false && options?.initialProgress
      ? options.initialProgress
      : undefined

  const [stepIndex, setStepIndex] = useState(resume?.currentStepIndex ?? 0)
  const [frameIndex, setFrameIndex] = useState(options?.initialFrameIndex ?? 0)
  const startStep = lesson.steps[resume?.currentStepIndex ?? 0]
  const startDisplay = startStep ? resolveStepFrame(startStep, 0) : startStep
  const [phase, setPhase] = useState<StepPhase>(() =>
    startDisplay && isDirectAnswerStep(startDisplay.type) ? 'answering' : 'ready',
  )
  const [boxValues, setBoxValues] = useState<Record<string, string>>(() =>
    freshBoxes(startDisplay ?? lesson.steps[0]),
  )
  const [activeVar, setActiveVarState] = useState<string | null>(
    () => startDisplay?.targetVariables[0] ?? null,
  )
  const [errorVars, setErrorVars] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [stepAttempts, setStepAttempts] = useState(0)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  // true once the learner has had to retry this level — blocks first-try credit
  const [stepFailedOnce, setStepFailedOnce] = useState(false)
  const [lastStepBadge, setLastStepBadge] = useState<SpeedTier>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [result, setResult] = useState<LessonResult | null>(null)
  const [rewindNotice, setRewindNotice] = useState<string | null>(null)
  const [unitOutcomes, setUnitOutcomes] = useState<(('correct' | 'wrong') | null)[]>([])
  // When the current answer UI became available — used to time responses.
  const answerStartRef = useRef(
    startStep && isDirectAnswerStep(startStep.type) ? performance.now() : 0,
  )
  // How many times each step was answered wrong, for the review breakdown.
  const wrongByStepRef = useRef<Record<string, number>>({})
  const [agg, setAgg] = useState<Aggregates>({
    correctCount: resume?.correctCount ?? 0,
    wrongCount: resume?.wrongCount ?? 0,
    totalAttempts: resume?.totalAttempts ?? 0,
    correctFirstTry: resume?.correctFirstTry ?? 0,
    completedStepIds: resume?.completedStepIds ?? [],
    lightningCount: 0,
    quickCount: 0,
  })

  const step = lesson.steps[stepIndex]
  const frameCount = step?.traceFrames?.length ?? 1
  const displayStep = useMemo(
    () => (step ? resolveStepFrame(step, frameIndex) : step),
    [step, frameIndex],
  )
  const isTrace = isTraceStep(step ?? lesson.steps[0])
  const isPassive = isPassiveStep(step?.type ?? 'intro')

  const buildResult = useCallback(
    (a: Aggregates): LessonResult => {
      const accuracy =
        a.totalAttempts > 0
          ? Math.round((a.correctCount / a.totalAttempts) * 100)
          : 0
      const masteryScore = computeQuizMastery(a.correctFirstTry, interactiveTotal)
      const stepReviews: StepReview[] = lesson.steps
        .filter((s) => isInteractiveStep(s.type) && s.targetVariables.length > 0)
        .map((s) => ({
          id: s.id,
          prompt: s.prompt,
          code: s.code,
          currentLineIndex: s.currentLineIndex,
          targetVariables: s.targetVariables,
          expected: Object.fromEntries(
            s.targetVariables.map((t) => [t, s.expectedState[t]]),
          ),
          missed: (wrongByStepRef.current[s.id] ?? 0) > 0,
        }))
      const missedAny = stepReviews.some((s) => s.missed)

      const badgeCounts = computeBadgeCounts(a, interactiveTotal)

      return {
        accuracy,
        masteryScore,
        totalAttempts: a.totalAttempts,
        correctFirstTry: a.correctFirstTry,
        unlockNext: meetsUnlockThreshold(masteryScore) && !missedAny,
        badgeCounts,
        badges: badgeIdsFromCounts(badgeCounts),
        stepReviews,
      }
    },
    [interactiveTotal, lesson],
  )

  const persist = useCallback(
    (a: Aggregates, nextIndex: number, complete: boolean, nextFrameIndex?: number) => {
      if (!options?.onSave) return
      const r = buildResult(a)
      const now = new Date().toISOString()
      const frameIdx = nextFrameIndex ?? frameIndex
      const section = options?.section
      options.onSave({
        lessonId: lesson.id,
        status: complete ? 'completed' : 'inProgress',
        currentStepIndex: nextIndex,
        completedStepIds: a.completedStepIds,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        totalAttempts: a.totalAttempts,
        correctFirstTry: a.correctFirstTry,
        accuracy: r.accuracy,
        masteryScore: r.masteryScore,
        unlockNextLesson: complete && r.unlockNext,
        completedAt: complete ? now : undefined,
        updatedAt: now,
        ...(section === 'learn'
          ? { learnFrameIndex: frameIdx, learnStepIndex: nextIndex }
          : section === 'quiz'
            ? { quizFrameIndex: frameIdx, quizStepIndex: nextIndex }
            : {}),
      })
    },
    [buildResult, lesson.id, options, frameIndex],
  )

  const goToStep = useCallback(
    (index: number, opts?: { notice?: string; frameIndex?: number }) => {
      const target = lesson.steps[index]
      if (!target) return
      const maxFrame = Math.max(0, (target.traceFrames?.length ?? 1) - 1)
      const fi =
        opts?.frameIndex != null
          ? Math.min(Math.max(0, opts.frameIndex), maxFrame)
          : 0
      const resolved = resolveStepFrame(target, fi)
      const directAnswer = isDirectAnswerStep(resolved.type)
      setStepIndex(index)
      setFrameIndex(fi)
      setPhase(directAnswer ? 'answering' : 'ready')
      setBoxValues(freshBoxes(resolved))
      setActiveVarState(resolved.targetVariables[0] ?? null)
      setErrorVars([])
      setFeedback(null)
      setStepAttempts(0)
      setAnswerRevealed(false)
      setStepFailedOnce(false)
      setLastStepBadge(null)
      setRewindNotice(opts?.notice ?? null)
      if (directAnswer) answerStartRef.current = performance.now()
    },
    [lesson],
  )

  const goToFrame = useCallback(
    (index: number) => {
      const resolved = resolveStepFrame(step, index)
      const directAnswer = isDirectAnswerStep(resolved.type)
      setFrameIndex(index)
      setPhase(directAnswer ? 'answering' : 'ready')
      setBoxValues(freshBoxes(resolved))
      setActiveVarState(resolved.targetVariables[0] ?? null)
      setErrorVars([])
      setFeedback(null)
      setStepAttempts(0)
      setAnswerRevealed(false)
      setStepFailedOnce(false)
      setLastStepBadge(null)
      if (directAnswer) answerStartRef.current = performance.now()
    },
    [step],
  )

  const runStep = useCallback(() => {
    answerStartRef.current = performance.now()
    setPhase('answering')
  }, [])

  const restartStep = useCallback(() => {
    setPhase('ready')
    setBoxValues(freshBoxes(displayStep))
    setActiveVarState(displayStep.targetVariables[0] ?? null)
    setErrorVars([])
    setFeedback(null)
    setStepAttempts(0)
    setAnswerRevealed(false)
    setStepFailedOnce(true)
    setLastStepBadge(null)
  }, [displayStep])

  const setActiveVar = useCallback((v: string) => setActiveVarState(v), [])

  const setBox = useCallback((v: string, value: string) => {
    setBoxValues((prev) => ({ ...prev, [v]: value }))
    setErrorVars([])
    setFeedback(null)
  }, [])

  const fillActive = useCallback(
    (value: string) => {
      setBoxValues((prev) => {
        const targets = displayStep.targetVariables
        const target =
          activeVar && targets.includes(activeVar)
            ? activeVar
            : (targets.find((t) => !prev[t]) ?? targets[0])
        const updated = { ...prev, [target]: value }
        const nextEmpty = targets.find((t) => !updated[t])
        if (nextEmpty) setActiveVarState(nextEmpty)
        return updated
      })
      setErrorVars([])
      setFeedback(null)
    },
    [activeVar, displayStep],
  )

  const allFilled = useMemo(
    () => displayStep?.targetVariables.every((t) => boxValues[t]?.trim().length) ?? false,
    [displayStep, boxValues],
  )

  const check = useCallback(() => {
    const wrong = displayStep.targetVariables.filter(
      (t) => !isMatch(displayStep.expectedState[t], boxValues[t] ?? ''),
    )
    const allCorrect = wrong.length === 0
    if (!allCorrect) {
      wrongByStepRef.current[step.id] = (wrongByStepRef.current[step.id] ?? 0) + 1
    }

    const firstTry = stepAttempts === 0 && !stepFailedOnce
    const tier: SpeedTier =
      allCorrect && firstTry
        ? speedTier(performance.now() - answerStartRef.current)
        : null

    if (options?.onAttempt) {
      const submitted: Record<string, VariableValue> = {}
      const expected: Record<string, VariableValue> = {}
      for (const t of displayStep.targetVariables) {
        submitted[t] = boxValues[t] ?? ''
        expected[t] = displayStep.expectedState[t]
      }
      options.onAttempt({
        lessonId: lesson.id,
        stepId: step.id,
        submittedAnswer: submitted,
        expectedAnswer: expected,
        isCorrect: allCorrect,
        attemptNumber: stepAttempts + 1,
        createdAt: new Date().toISOString(),
      })
    }

    if (allCorrect && options?.onCorrect) {
      options.onCorrect({
        firstTry,
        responseMs: performance.now() - answerStartRef.current,
      })
    }

    const onLastFrame = !isTrace || frameIndex >= frameCount - 1

    setAgg((prev) => {
      const nextAgg: Aggregates = {
        ...prev,
        totalAttempts: prev.totalAttempts + 1,
      }
      if (allCorrect) {
        nextAgg.correctCount = prev.correctCount + 1
        if (firstTry) {
          nextAgg.correctFirstTry = prev.correctFirstTry + 1
        }
        if (tier === 'lightning') nextAgg.lightningCount = prev.lightningCount + 1
        else if (tier === 'quick') nextAgg.quickCount = prev.quickCount + 1
        if (onLastFrame && !prev.completedStepIds.includes(step.id)) {
          nextAgg.completedStepIds = [...prev.completedStepIds, step.id]
        }
      } else {
        nextAgg.wrongCount = prev.wrongCount + 1
        const attemptsNow = stepAttempts + 1
        if (
          attemptsNow >= MISTAKES_BEFORE_RESTART &&
          onLastFrame &&
          !prev.completedStepIds.includes(step.id) &&
          !isCheckpointStep(step)
        ) {
          nextAgg.completedStepIds = [...prev.completedStepIds, step.id]
        }
      }
      return nextAgg
    })

    if (allCorrect) {
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      const missed = stepAttempts > 0 || stepFailedOnce
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, missed))
      setAnswerRevealed(false)
      setPhase('solved')
      setErrorVars([])
      setLastStepBadge(tier)
      setFeedback({ kind: 'correct', text: displayStep.feedback.correct })
      playCorrect()
      return
    }

    const attemptsNow = stepAttempts + 1
    setStepAttempts(attemptsNow)
    playWrong()

    if (attemptsNow >= MISTAKES_BEFORE_RESTART) {
      if (isCheckpointStep(step) && step.checkpointStartStepId) {
        const startIdx = lesson.steps.findIndex(
          (s) => s.id === step.checkpointStartStepId,
        )
        setStepAttempts(attemptsNow)
        setFeedback({
          kind: 'incorrect',
          text:
            displayStep.feedback.secondIncorrect ??
            'Review the slides above, then try this question again.',
        })
        if (startIdx >= 0) {
          setAgg((currentAgg) => {
            persist(currentAgg, startIdx, false, 0)
            return currentAgg
          })
          goToStep(startIdx, {
            notice:
              displayStep.feedback.secondIncorrect ??
              'Review the slides above, then try the practice question again.',
          })
        }
        return
      }

      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, true))
      setBoxValues(expectedBoxes(displayStep))
      setErrorVars(displayStep.targetVariables)
      setAnswerRevealed(true)
      setPhase('solved')
      setFeedback(revealFeedback(displayStep))
      return
    }

    setFeedback({ kind: 'incorrect', text: displayStep.feedback.incorrect })
    setErrorVars(wrong)
  }, [
    displayStep,
    step,
    boxValues,
    stepAttempts,
    stepFailedOnce,
    lesson.id,
    options,
    isTrace,
    frameIndex,
    frameCount,
    goToStep,
    lesson.steps,
    persist,
  ])

  const next = useCallback(() => {
    if (isTrace && frameIndex < frameCount - 1) {
      const nextFi = frameIndex + 1
      goToFrame(nextFi)
      setAgg((currentAgg) => {
        persist(currentAgg, stepIndex, false, nextFi)
        return currentAgg
      })
      return
    }

    if (options?.reviewMode && !answerRevealed && step) {
      options.reviewMode.onStepCleared(step.id)
    }

    const nextIndex = stepIndex + 1
    const willComplete = nextIndex >= lesson.steps.length
    const markLessonComplete =
      options?.completeAsLesson !== false && willComplete

    if (willComplete) {
      setAgg((currentAgg) => {
        const r = buildResult(currentAgg)
        setResult(r)
        setIsComplete(true)
        persist(currentAgg, stepIndex, markLessonComplete, frameIndex)
        return currentAgg
      })
    } else {
      setAgg((currentAgg) => {
        persist(currentAgg, nextIndex, false, 0)
        return currentAgg
      })
      goToStep(nextIndex)
    }
  }, [
    isTrace,
    frameIndex,
    frameCount,
    goToFrame,
    stepIndex,
    lesson.steps.length,
    goToStep,
    persist,
    buildResult,
    options?.completeAsLesson,
    options?.reviewMode,
    answerRevealed,
    step,
  ])

  const canGoPrev = stepIndex > 0 || (isTrace && frameIndex > 0)

  const prev = useCallback(() => {
    if (isComplete || !canGoPrev) return

    if (isTrace && frameIndex > 0) {
      const prevFi = frameIndex - 1
      goToFrame(prevFi)
      setAgg((currentAgg) => {
        persist(currentAgg, stepIndex, false, prevFi)
        return currentAgg
      })
      return
    }

    const prevIndex = stepIndex - 1
    const prevStep = lesson.steps[prevIndex]
    const prevFrameCount = prevStep?.traceFrames?.length ?? 1
    const landFrame = Math.max(0, prevFrameCount - 1)

    setAgg((currentAgg) => {
      persist(currentAgg, prevIndex, false, landFrame)
      return currentAgg
    })
    goToStep(prevIndex, { frameIndex: landFrame })
  }, [
    isComplete,
    canGoPrev,
    isTrace,
    frameIndex,
    stepIndex,
    lesson.steps,
    goToFrame,
    goToStep,
    persist,
  ])

  const restart = useCallback(() => {
    wrongByStepRef.current = {}
    setUnitOutcomes([])
    setAgg({
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
      correctFirstTry: 0,
      completedStepIds: [],
      lightningCount: 0,
      quickCount: 0,
    })
    setIsComplete(false)
    setResult(null)
    goToStep(0)
  }, [goToStep])

  const progressTotal = interactiveTotal
  const progressNowIndex = useMemo(() => {
    let count = 0
    for (let i = 0; i < stepIndex; i++) {
      count += interactiveUnits(lesson.steps[i])
    }
    if (step && isInteractiveStep(step.type)) {
      count += frameIndex
    }
    return count
  }, [stepIndex, frameIndex, lesson.steps, step])

  const progressCurrent = useMemo(() => {
    if (step && isInteractiveStep(step.type)) {
      return progressNowIndex + (phase === 'solved' ? 1 : 0)
    }
    return progressNowIndex
  }, [progressNowIndex, phase, step])

  const progressSegments = useMemo((): ProgressSegmentState[] => {
    return Array.from({ length: progressTotal }, (_, i) => {
      const outcome = unitOutcomes[i]
      if (outcome === 'correct') return 'correct'
      if (outcome === 'wrong') return 'wrong'
      if (phase !== 'solved' && i === progressNowIndex) return 'now'
      return 'todo'
    })
  }, [progressTotal, unitOutcomes, phase, progressNowIndex])

  const progressSnapshot = useMemo(() => {
    const r = buildResult(agg)
    return {
      correctCount: agg.correctCount,
      wrongCount: agg.wrongCount,
      totalAttempts: agg.totalAttempts,
      correctFirstTry: agg.correctFirstTry,
      completedStepIds: agg.completedStepIds,
      accuracy: r.accuracy,
      masteryScore: r.masteryScore,
    }
  }, [agg, buildResult])

  return {
    step,
    displayStep,
    frameIndex,
    frameCount,
    isTrace,
    stepIndex,
    totalSteps: lesson.steps.length,
    progressCurrent,
    progressTotal,
    progressSegments,
    isPassive,
    isComplete,
    phase,
    boxValues,
    activeVar,
    errorVars,
    feedback,
    stepAttempts,
    answerRevealed,
    allFilled,
    lastStepBadge,
    result,
    completedStepIds: agg.completedStepIds,
    rewindNotice,
    progressSnapshot,
    runStep,
    setActiveVar,
    setBox,
    fillActive,
    check,
    next,
    prev,
    canGoPrev,
    restartStep,
    restart,
  }
}
