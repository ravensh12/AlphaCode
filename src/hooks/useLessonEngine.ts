import { useCallback, useMemo, useState } from 'react'
import type { Lesson, LessonStep, VariableValue } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import { computeMastery, meetsUnlockThreshold } from '../lib/mastery'

export type FeedbackKind = 'correct' | 'incorrect'
export type Feedback = { kind: FeedbackKind; text: string } | null
export type StepPhase = 'ready' | 'answering' | 'solved' | 'failed'

/** Wrong answers in a row before the learner must retry the level. */
const MISTAKES_BEFORE_RESTART = 2

export type LessonResult = {
  accuracy: number
  masteryScore: number
  totalAttempts: number
  correctFirstTry: number
  unlockNext: boolean
}

type Aggregates = {
  correctCount: number
  wrongCount: number
  totalAttempts: number
  correctFirstTry: number
  completedStepIds: string[]
}

function isMatch(expected: VariableValue, got: string): boolean {
  return String(expected) === got.trim()
}

function freshBoxes(step: LessonStep): Record<string, string> {
  const boxes: Record<string, string> = {}
  for (const v of step.targetVariables) boxes[v] = ''
  return boxes
}

export type LessonEngine = {
  step: LessonStep
  stepIndex: number
  totalSteps: number
  /** 1-based count of completed interactive steps, for the progress bar. */
  progressCurrent: number
  progressTotal: number
  isIntro: boolean
  isComplete: boolean
  phase: StepPhase
  boxValues: Record<string, string>
  activeVar: string | null
  errorVars: string[]
  feedback: Feedback
  stepAttempts: number
  allFilled: boolean
  result: LessonResult | null
  // actions
  runStep: () => void
  setActiveVar: (v: string) => void
  setBox: (v: string, value: string) => void
  fillActive: (value: string) => void
  check: () => void
  next: () => void
  restartStep: () => void
  restart: () => void
}

export function useLessonEngine(
  lesson: Lesson,
  options?: {
    initialProgress?: LessonProgress
    /** When false, always start at step 0 instead of resuming saved progress. */
    resume?: boolean
    onSave?: (progress: LessonProgress) => void
    onAttempt?: (attempt: AttemptRecord) => void
  },
): LessonEngine {
  const interactiveTotal = useMemo(
    () => lesson.steps.filter((s) => s.type !== 'intro').length,
    [lesson],
  )

  const resume =
    options?.resume !== false &&
    options?.initialProgress &&
    options.initialProgress.status === 'inProgress'
      ? options.initialProgress
      : undefined

  const [stepIndex, setStepIndex] = useState(resume?.currentStepIndex ?? 0)
  const [phase, setPhase] = useState<StepPhase>('ready')
  const [boxValues, setBoxValues] = useState<Record<string, string>>(() =>
    freshBoxes(lesson.steps[resume?.currentStepIndex ?? 0]),
  )
  const [activeVar, setActiveVarState] = useState<string | null>(
    () => lesson.steps[resume?.currentStepIndex ?? 0]?.targetVariables[0] ?? null,
  )
  const [errorVars, setErrorVars] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [stepAttempts, setStepAttempts] = useState(0)
  // true once the learner has had to retry this level — blocks first-try credit
  const [stepFailedOnce, setStepFailedOnce] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [result, setResult] = useState<LessonResult | null>(null)
  const [agg, setAgg] = useState<Aggregates>({
    correctCount: resume?.correctCount ?? 0,
    wrongCount: resume?.wrongCount ?? 0,
    totalAttempts: resume?.totalAttempts ?? 0,
    correctFirstTry: resume?.correctFirstTry ?? 0,
    completedStepIds: resume?.completedStepIds ?? [],
  })

  const step = lesson.steps[stepIndex]
  const isIntro = step?.type === 'intro'

  const buildResult = useCallback(
    (a: Aggregates): LessonResult => {
      const accuracy =
        a.totalAttempts > 0
          ? Math.round((a.correctCount / a.totalAttempts) * 100)
          : 0
      const masteryScore = computeMastery({
        correctFirstTry: a.correctFirstTry,
        completedSteps: a.completedStepIds.length,
        wrongAttempts: a.wrongCount,
      })
      return {
        accuracy,
        masteryScore,
        totalAttempts: a.totalAttempts,
        correctFirstTry: a.correctFirstTry,
        unlockNext: meetsUnlockThreshold(masteryScore),
      }
    },
    [],
  )

  const persist = useCallback(
    (a: Aggregates, nextIndex: number, complete: boolean) => {
      if (!options?.onSave) return
      const r = buildResult(a)
      const now = new Date().toISOString()
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
      })
    },
    [buildResult, lesson.id, options],
  )

  const goToStep = useCallback(
    (index: number) => {
      const target = lesson.steps[index]
      setStepIndex(index)
      setPhase('ready')
      setBoxValues(target ? freshBoxes(target) : {})
      setActiveVarState(target?.targetVariables[0] ?? null)
      setErrorVars([])
      setFeedback(null)
      setStepAttempts(0)
      setStepFailedOnce(false)
    },
    [lesson],
  )

  const runStep = useCallback(() => setPhase('answering'), [])

  const restartStep = useCallback(() => {
    setPhase('ready')
    setBoxValues(freshBoxes(step))
    setActiveVarState(step.targetVariables[0] ?? null)
    setErrorVars([])
    setFeedback(null)
    setStepAttempts(0)
    setStepFailedOnce(true)
  }, [step])

  const setActiveVar = useCallback((v: string) => setActiveVarState(v), [])

  const setBox = useCallback((v: string, value: string) => {
    setBoxValues((prev) => ({ ...prev, [v]: value }))
    setErrorVars([])
    setFeedback(null)
  }, [])

  const fillActive = useCallback(
    (value: string) => {
      setBoxValues((prev) => {
        const targets = step.targetVariables
        const target =
          activeVar && targets.includes(activeVar)
            ? activeVar
            : (targets.find((t) => !prev[t]) ?? targets[0])
        const updated = { ...prev, [target]: value }
        // advance focus to next empty target for a smooth flow
        const nextEmpty = targets.find((t) => !updated[t])
        if (nextEmpty) setActiveVarState(nextEmpty)
        return updated
      })
      setErrorVars([])
      setFeedback(null)
    },
    [activeVar, step],
  )

  const allFilled = useMemo(
    () => step?.targetVariables.every((t) => boxValues[t]?.trim().length) ?? false,
    [step, boxValues],
  )

  const check = useCallback(() => {
    const wrong = step.targetVariables.filter(
      (t) => !isMatch(step.expectedState[t], boxValues[t] ?? ''),
    )
    const allCorrect = wrong.length === 0

    if (options?.onAttempt) {
      const submitted: Record<string, VariableValue> = {}
      const expected: Record<string, VariableValue> = {}
      for (const t of step.targetVariables) {
        submitted[t] = boxValues[t] ?? ''
        expected[t] = step.expectedState[t]
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

    setAgg((prev) => {
      const nextAgg: Aggregates = {
        ...prev,
        totalAttempts: prev.totalAttempts + 1,
      }
      if (allCorrect) {
        nextAgg.correctCount = prev.correctCount + 1
        if (stepAttempts === 0 && !stepFailedOnce) {
          nextAgg.correctFirstTry = prev.correctFirstTry + 1
        }
        if (!prev.completedStepIds.includes(step.id)) {
          nextAgg.completedStepIds = [...prev.completedStepIds, step.id]
        }
      } else {
        nextAgg.wrongCount = prev.wrongCount + 1
      }
      return nextAgg
    })

    if (allCorrect) {
      setPhase('solved')
      setErrorVars([])
      setFeedback({ kind: 'correct', text: step.feedback.correct })
      return
    }

    const attemptsNow = stepAttempts + 1
    const text =
      attemptsNow >= MISTAKES_BEFORE_RESTART && step.feedback.secondIncorrect
        ? step.feedback.secondIncorrect
        : step.feedback.incorrect
    setFeedback({ kind: 'incorrect', text })
    setErrorVars(wrong)
    setStepAttempts(attemptsNow)
    if (attemptsNow >= MISTAKES_BEFORE_RESTART) setPhase('failed')
  }, [step, boxValues, stepAttempts, stepFailedOnce, lesson.id, options])

  const next = useCallback(() => {
    const nextIndex = stepIndex + 1
    const willComplete = nextIndex >= lesson.steps.length

    if (willComplete) {
      const r = buildResult(agg)
      setResult(r)
      setIsComplete(true)
      persist(agg, stepIndex, true)
    } else {
      persist(agg, nextIndex, false)
      goToStep(nextIndex)
    }
  }, [stepIndex, lesson.steps.length, agg, goToStep, persist, buildResult])

  const restart = useCallback(() => {
    setAgg({
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
      correctFirstTry: 0,
      completedStepIds: [],
    })
    setIsComplete(false)
    setResult(null)
    goToStep(0)
  }, [goToStep])

  const progressTotal = interactiveTotal
  const progressCurrent = agg.completedStepIds.length

  return {
    step,
    stepIndex,
    totalSteps: lesson.steps.length,
    progressCurrent,
    progressTotal,
    isIntro,
    isComplete,
    phase,
    boxValues,
    activeVar,
    errorVars,
    feedback,
    stepAttempts,
    allFilled,
    result,
    runStep,
    setActiveVar,
    setBox,
    fillActive,
    check,
    next,
    restartStep,
    restart,
  }
}
