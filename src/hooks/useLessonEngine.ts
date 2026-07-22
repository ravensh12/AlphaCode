import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConceptId, Lesson, LessonStep, VariableValue } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import type {
  AssessmentEvidenceKinds,
  AssessmentFailurePolicyV1,
  AssessmentId,
  AssessmentResponseV1,
  AssessmentResultV1,
  AssessmentV1,
  GradedAssessmentResultV1,
  SerializedAssessmentAttemptV1,
} from '../types/assessment'
import {
  ASSESSMENT_SCHEMA_VERSION,
  assessmentEvidenceKinds,
} from '../types/assessment'
import type { AttemptEvent } from '../types/learning'
import { computeQuizMastery, meetsUnlockThreshold } from '../lib/mastery'
import { playCorrect, playWrong } from '../lib/soundFx'
import { resolveStepFrame } from '../content/lessons/traces'
import {
  gradeAssessment,
  responseCompleteness,
  serializeAssessmentAttempt,
} from '../lib/assessmentGrading'
import {
  createAssessmentResponse,
  traceFrameResponse,
} from '../lib/assessmentResponses'
import {
  BADGE_ORDER,
  computeBadgeCounts,
  speedTier,
  type BadgeCounts,
  type BadgeId,
  type SpeedTier,
} from '../content/badges'

export type FeedbackKind = 'correct' | 'incorrect' | 'revealed' | 'error'
export type Feedback = { kind: FeedbackKind; text: string } | null
export type StepPhase = 'ready' | 'answering' | 'grading' | 'solved' | 'failed'

/** Wrong answers in a row before the learner must retry the level. */
const MISTAKES_BEFORE_RESTART = 2

/** How long exam mode shows "answer locked in" before auto-advancing. */
export const EXAM_MODE_ADVANCE_MS = 900

/**
 * Consecutive wrong answers on a single quiz question that force the learner
 * back through the lesson's teaching content before they can continue. The
 * counter is per-question and resets the instant that question is answered
 * correctly, so a later correct answer never triggers a retake.
 */
export const FORCE_RETAKE_MISS_LIMIT = 3

/** Learner-facing copy shown when the strike limit forces a lesson retake. */
export const FORCE_RETAKE_MESSAGE =
  "That's 3 misses on this question — let's review the lesson and try again."

function createInteractionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `interaction:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2)}`
}

export function isUnassistedFirstTry(
  stepAttempts: number,
  stepFailedOnce: boolean,
  usedHint: boolean,
): boolean {
  return stepAttempts === 0 && !stepFailedOnce && !usedHint
}

/** Per-step outcome shown in the end-of-lesson review. */
export type StepReview = {
  id: string
  prompt: string
  code: string[]
  currentLineIndex?: number
  targetVariables: string[]
  expected: Record<string, VariableValue>
  /** Generic answer copy for assessments that do not use legacy variables. */
  assessmentAnswerLabel?: string
  /** True if the learner got it wrong at least once on this step. */
  missed: boolean
  /** True when a hint assisted the submitted answer. */
  usedHint?: boolean
}

export type AssessmentGradeContext = {
  lessonId: string
  stepId: string
  frameIndex: number
  assessmentId: AssessmentId
  masteryId: string
  frameId?: string
}

export type GradeAssessment = (
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
  context: AssessmentGradeContext,
) => Promise<AssessmentResultV1 | null | undefined>

export type AssessmentAttemptInfo = AssessmentGradeContext & {
  assessment: AssessmentV1
  response: AssessmentResponseV1
  result: GradedAssessmentResultV1
  serializedAttempt: SerializedAssessmentAttemptV1
  /** Stable for this assessment unit until it resolves or the run is reset. */
  interactionId: string
  /** Retry telemetry is unresolved; correct/reveal/continue ends the interaction. */
  resolved: boolean
  evidenceKinds: AssessmentEvidenceKinds
  firstTry: boolean
  usedHint: boolean
  responseMs: number
}

export type PersistedAssessmentEvidence = {
  eventId: string
  interactionId: string
  occurredAt: string
  assessmentId: AssessmentId
  assessmentKind: AssessmentV1['kind']
  stepId: string
  evidenceKinds: AssessmentEvidenceKinds
  isCorrect: boolean
  resolved: boolean
  firstTry: boolean
  usedHint: boolean
  revealed: boolean
}

export type ActiveAssessmentUnit = {
  assessment: AssessmentV1
  assessmentId: AssessmentId
  masteryId: string
  frameId?: string
  failurePolicy?: AssessmentFailurePolicyV1
}

export function activeAssessmentUnit(
  step: LessonStep,
  frameIndex = 0,
): ActiveAssessmentUnit | null {
  const assessment = step.assessment
  if (!assessment) return null
  if (assessment.kind !== 'trace') {
    return {
      assessment,
      assessmentId: assessment.id,
      masteryId: step.masteryId ?? assessment.id,
      failurePolicy: assessment.failurePolicy,
    }
  }

  const frame = assessment.frames[frameIndex] ?? assessment.frames[0]
  if (!frame) return null
  const compatibilityFrame = step.traceFrames?.[frameIndex]
  return {
    assessment: frame.assessment,
    assessmentId: frame.assessment.id,
    masteryId:
      compatibilityFrame?.assessmentId ??
      frame.assessment.id,
    frameId: frame.id,
    failurePolicy:
      frame.assessment.failurePolicy ?? assessment.failurePolicy,
  }
}

export function activeResponseForAssessment(
  step: LessonStep,
  response: AssessmentResponseV1,
  frameIndex = 0,
): AssessmentResponseV1 | null {
  const assessment = step.assessment
  if (!assessment) return null
  if (assessment.kind !== 'trace') {
    return response.kind === assessment.kind
      ? response
      : createAssessmentResponse(assessment)
  }
  return traceFrameResponse(assessment, response, frameIndex)
}

export type AssessmentGradeResolution =
  | { kind: 'graded'; result: GradedAssessmentResultV1 }
  | { kind: 'incomplete'; result: AssessmentResultV1 }
  | { kind: 'infrastructureError'; message: string }

export async function gradeAssessmentResponse(
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
  context: AssessmentGradeContext,
  onGradeAssessment?: GradeAssessment,
): Promise<AssessmentGradeResolution> {
  const localResult = gradeAssessment(assessment, response)
  if (localResult.status === 'correct' || localResult.status === 'incorrect') {
    return { kind: 'graded', result: localResult }
  }
  if (localResult.status === 'incomplete') {
    return { kind: 'incomplete', result: localResult }
  }
  if (!onGradeAssessment) {
    return {
      kind: 'infrastructureError',
      message: 'The Python runner is not available yet. Your answer was not counted.',
    }
  }

  try {
    const externalResult = await onGradeAssessment(
      assessment,
      response,
      context,
    )
    if (
      !externalResult ||
      externalResult.assessmentId !== assessment.id ||
      externalResult.assessmentKind !== assessment.kind ||
      (externalResult.status !== 'correct' &&
        externalResult.status !== 'incorrect')
    ) {
      return {
        kind: 'infrastructureError',
        message:
          externalResult?.status === 'incomplete' ||
          externalResult?.status === 'notLocallyGradable'
            ? externalResult.reason
            : 'The Python runner could not grade this answer. It was not counted.',
      }
    }
    return { kind: 'graded', result: externalResult }
  } catch {
    return {
      kind: 'infrastructureError',
      message:
        'The Python runner could not start or finish. Your answer was not counted.',
    }
  }
}

export type AssessmentFailureDecision =
  | { kind: 'retry'; resetAttempts: boolean }
  | { kind: 'reveal' }
  | { kind: 'continue' }
  | { kind: 'rewind'; checkpointStepId: string }

export function assessmentAttemptResolves(
  isCorrect: boolean,
  decision: AssessmentFailureDecision | null,
): boolean {
  return (
    isCorrect ||
    decision?.kind === 'reveal' ||
    decision?.kind === 'continue'
  )
}

export function assessmentFailureDecision(
  policy: AssessmentFailurePolicyV1 | undefined,
  attemptsNow: number,
  legacyCheckpointStepId?: string,
): AssessmentFailureDecision {
  const maxAttempts = Math.max(
    1,
    policy?.maxAttempts ?? MISTAKES_BEFORE_RESTART,
  )
  if (attemptsNow < maxAttempts) {
    return { kind: 'retry', resetAttempts: false }
  }
  if (!policy) {
    return legacyCheckpointStepId
      ? { kind: 'rewind', checkpointStepId: legacyCheckpointStepId }
      : { kind: 'reveal' }
  }
  switch (policy.kind) {
    case 'retry':
      return { kind: 'retry', resetAttempts: true }
    case 'reveal':
      return { kind: 'reveal' }
    case 'continue':
      return { kind: 'continue' }
    case 'rewind':
      return {
        kind: 'rewind',
        checkpointStepId: policy.checkpointStepId,
      }
  }
}

function matcherAnswerLabel(
  assessment: Extract<AssessmentV1, { kind: 'shortAnswer' | 'predict' }>,
): string {
  switch (assessment.matcher.mode) {
    case 'normalized':
      return assessment.matcher.acceptedAnswers[0]
    case 'exactLines':
      return assessment.matcher.acceptedAnswers[0].join(' / ')
    case 'numericTolerance':
      return String(assessment.matcher.expected)
    case 'boolean':
      return String(assessment.matcher.expected)
  }
}

export function assessmentAnswerLabel(assessment: AssessmentV1): string {
  switch (assessment.kind) {
    case 'singleChoice':
      return (
        assessment.options.find(({ id }) => id === assessment.correctOptionId)
          ?.label ?? 'Choice answer'
      )
    case 'shortAnswer':
    case 'predict':
      return matcherAnswerLabel(assessment)
    case 'order': {
      const labels = new Map(
        assessment.items.map(({ id, label }) => [id, label]),
      )
      return assessment.correctOrderIds
        .map((id) => labels.get(id) ?? id)
        .join(' → ')
    }
    case 'trace':
      return 'Trace assessment'
    case 'pythonCode':
      return 'Python solution'
  }
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
  /** Only events that finished durable local persistence are included. */
  assessmentEvidence?: PersistedAssessmentEvidence[]
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

export type ProgressSegmentState =
  | 'todo'
  | 'now'
  | 'correct'
  | 'wrong'
  | 'answered'

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
  /** Response for the current assessment; null on every legacy step. */
  assessmentResponse: AssessmentResponseV1 | null
  assessmentResult: AssessmentResultV1 | null
  assessmentId: AssessmentId | null
  masteryId: string | null
  assessmentComplete: boolean
  isGrading: boolean
  activeVar: string | null
  errorVars: string[]
  feedback: Feedback
  stepAttempts: number
  /** True after the learner manually reveals a hint for this unit. */
  usedHint: boolean
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
  /**
   * True once the learner has missed the current quiz question 3 times in a
   * row (normal quizzes only). The host should walk them back through the
   * lesson before letting the quiz continue.
   */
  forcedRetake: boolean
  /** Consecutive misses on the current question; 0 after a correct answer. */
  stepMissStreak: number
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
  setAssessmentResponse: (response: AssessmentResponseV1) => void
  checkAssessment: () => Promise<void>
  check: () => void
  next: () => void
  prev: () => void
  canGoPrev: boolean
  restartStep: () => void
  markHintUsed: () => void
  restart: () => void
  /**
   * DEV BYPASS — instantly finishes the quiz as a perfect first-try run,
   * persisting a real resolved-correct learning event for every assessment
   * unit so evidence-gated flows (academy missions, retention) accept it.
   * Callers MUST gate this behind the showcase account.
   */
  skipQuiz: () => Promise<void>
  /**
   * DEV BYPASS — skips only the current question, recording it as a resolved
   * first-try pass through the same evidence pipeline as `skipQuiz`. It never
   * touches the per-question miss streak, so it can neither trigger the
   * 3-strikes forced retake nor land the question in the missed review.
   * Callers MUST gate this behind the showcase account.
   */
  skipStep: () => Promise<void>
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
    /**
     * Restored in-flight answer for the starting step (the mission stash's
     * draft — e.g. Python editor code after a tab close). Used only when its
     * kind matches the step's assessment; grading is untouched.
     */
    initialAssessmentResponse?: AssessmentResponseV1 | null
    /** When false, finishing steps marks section done but not lesson completed. */
    completeAsLesson?: boolean
    /**
     * Deferred-feedback exam (boss quizzes, certification): every answer is
     * graded and recorded exactly as usual, but the learner sees no verdict —
     * no feedback text, no sounds, no red/green segments, no badge flash.
     * Each question allows a single attempt and auto-advances once locked in.
     */
    examMode?: boolean
    /**
     * Normal lesson/mission quizzes opt in to the 3-strikes rule: three
     * consecutive misses on one question surface `forcedRetake` so the host can
     * send the learner back through the teaching content. Never enabled for
     * deferred-feedback exams (one attempt, no retry loop) or the missed-question
     * review loop — the engine also hard-gates on `examMode`/`reviewMode`.
     */
    enableStrikeRetake?: boolean
    /** When set, fires after each non-revealed correct answer during review. */
    reviewMode?: {
      onStepCleared: (stepId: string) => void
    }
    onSave?: (progress: LessonProgress) => void
    onAttempt?: (attempt: AttemptRecord) => void
    /** Optional isolated grader used only when local grading is unavailable. */
    onGradeAssessment?: GradeAssessment
    /** Emits resolved assessment attempts with stable assessment/mastery ids. */
    onAssessmentAttempt?: (
      attempt: AssessmentAttemptInfo,
    ) => void | AttemptEvent | Promise<void | AttemptEvent>
    /** Fired on each correct answer — used to grant speed-based XP. */
    onCorrect?: (info: { firstTry: boolean; responseMs: number }) => void
    /**
     * Fired once per resolved interactive question — feeds the per-concept
     * learner model that powers personalization. `firstTry` is true only when
     * the very first attempt was correct.
     */
    onConceptResult?: (info: {
      conceptIds: ConceptId[]
      firstTry: boolean
      correct: boolean
      responseMs?: number
    }) => void
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
  const [assessmentResponse, setAssessmentResponseState] =
    useState<AssessmentResponseV1 | null>(() => {
      if (!startDisplay?.assessment) return null
      const created = createAssessmentResponse(startDisplay.assessment)
      const restored = options?.initialAssessmentResponse
      return restored && restored.kind === created.kind ? restored : created
    })
  const [assessmentResult, setAssessmentResult] =
    useState<AssessmentResultV1 | null>(null)
  const [activeVar, setActiveVarState] = useState<string | null>(
    () => startDisplay?.targetVariables[0] ?? null,
  )
  const [errorVars, setErrorVars] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [stepAttempts, setStepAttempts] = useState(0)
  const [usedHint, setUsedHint] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  // true once the learner has had to retry this level — blocks first-try credit
  const [stepFailedOnce, setStepFailedOnce] = useState(false)
  const [lastStepBadge, setLastStepBadge] = useState<SpeedTier>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [result, setResult] = useState<LessonResult | null>(null)
  const [rewindNotice, setRewindNotice] = useState<string | null>(null)
  const [unitOutcomes, setUnitOutcomes] = useState<(('correct' | 'wrong') | null)[]>([])
  const gradeRequestRef = useRef(0)
  const interactionIdRef = useRef(createInteractionId())
  const persistedAssessmentEvidenceRef = useRef<PersistedAssessmentEvidence[]>(
    [],
  )
  // When the current answer UI became available — used to time responses.
  const answerStartRef = useRef(
    startStep && isDirectAnswerStep(startStep.type) ? performance.now() : 0,
  )
  // How many times each step was answered wrong, for the review breakdown.
  const wrongByStepRef = useRef<Record<string, number>>({})
  const assistedByStepRef = useRef<Record<string, boolean>>({})
  // Consecutive misses per question (resets on a correct answer). Three in a
  // row forces the learner back through the lesson before they can continue.
  const missStreakRef = useRef<Record<string, number>>({})
  // Guards the demo skip against double-clicks while its persistence awaits.
  const skipStepInFlightRef = useRef(false)
  const [forcedRetake, setForcedRetake] = useState(false)
  const [agg, setAggState] = useState<Aggregates>({
    correctCount: resume?.correctCount ?? 0,
    wrongCount: resume?.wrongCount ?? 0,
    totalAttempts: resume?.totalAttempts ?? 0,
    correctFirstTry: resume?.correctFirstTry ?? 0,
    completedStepIds: resume?.completedStepIds ?? [],
    lightningCount: 0,
    quickCount: 0,
  })
  // Ref-backed aggregate updates. Handlers need the freshest aggregates to
  // persist progress, but calling persist() (→ ProgressProvider setState) from
  // inside a setState UPDATER is illegal — React may run updaters during the
  // render phase, which throws "Cannot update a component (ProgressProvider)
  // while rendering a different component (LessonRound)". The ref applies the
  // update synchronously so handlers can read it and persist OUTSIDE updaters.
  const aggRef = useRef(agg)
  const setAgg = useCallback((updater: (prev: Aggregates) => Aggregates) => {
    const next = updater(aggRef.current)
    aggRef.current = next
    setAggState(next)
    return next
  }, [])

  const examMode = options?.examMode === true
  // The 3-strikes forced retake is a normal-quiz-only affordance: never during
  // a deferred-feedback exam (single attempt, no retry loop) or the
  // missed-question review loop.
  const strikeRetakeEnabled =
    options?.enableStrikeRetake === true &&
    !examMode &&
    !options?.reviewMode &&
    options?.section === 'quiz'

  const step = lesson.steps[stepIndex]
  const frameCount = step?.traceFrames?.length ?? 1
  const displayStep = useMemo(
    () => (step ? resolveStepFrame(step, frameIndex) : step),
    [step, frameIndex],
  )
  const assessmentUnit = useMemo(
    () => (step ? activeAssessmentUnit(step, frameIndex) : null),
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
        .filter(
          (s) =>
            isInteractiveStep(s.type) &&
            (s.targetVariables.length > 0 || !!s.assessment),
        )
        .map((s) => ({
          id: s.id,
          prompt: s.prompt,
          code: s.code,
          currentLineIndex: s.currentLineIndex,
          targetVariables: s.targetVariables,
          expected: Object.fromEntries(
            s.targetVariables.map((t) => [t, s.expectedState[t]]),
          ),
          assessmentAnswerLabel: s.assessment
            ? assessmentAnswerLabel(s.assessment)
            : undefined,
          missed:
            (wrongByStepRef.current[s.id] ?? 0) > 0 ||
            assistedByStepRef.current[s.id] === true,
          usedHint: assistedByStepRef.current[s.id] === true,
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
        assessmentEvidence: [...persistedAssessmentEvidenceRef.current],
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
      gradeRequestRef.current += 1
      interactionIdRef.current = createInteractionId()
      setStepIndex(index)
      setFrameIndex(fi)
      setPhase(directAnswer ? 'answering' : 'ready')
      setBoxValues(freshBoxes(resolved))
      setAssessmentResponseState(
        resolved.assessment
          ? createAssessmentResponse(resolved.assessment)
          : null,
      )
      setAssessmentResult(null)
      setActiveVarState(resolved.targetVariables[0] ?? null)
      setErrorVars([])
      setFeedback(null)
      setStepAttempts(0)
      setUsedHint(false)
      setAnswerRevealed(false)
      setStepFailedOnce(false)
      setLastStepBadge(null)
      setRewindNotice(opts?.notice ?? null)
      setForcedRetake(false)
      if (directAnswer) answerStartRef.current = performance.now()
    },
    [lesson],
  )

  const goToFrame = useCallback(
    (index: number) => {
      const resolved = resolveStepFrame(step, index)
      const directAnswer = isDirectAnswerStep(resolved.type)
      gradeRequestRef.current += 1
      interactionIdRef.current = createInteractionId()
      setFrameIndex(index)
      setPhase(directAnswer ? 'answering' : 'ready')
      setBoxValues(freshBoxes(resolved))
      setAssessmentResponseState(
        resolved.assessment
          ? createAssessmentResponse(resolved.assessment)
          : null,
      )
      setAssessmentResult(null)
      setActiveVarState(resolved.targetVariables[0] ?? null)
      setErrorVars([])
      setFeedback(null)
      setStepAttempts(0)
      setUsedHint(false)
      setAnswerRevealed(false)
      setStepFailedOnce(false)
      setLastStepBadge(null)
      setForcedRetake(false)
      if (directAnswer) answerStartRef.current = performance.now()
    },
    [step],
  )

  const runStep = useCallback(() => {
    answerStartRef.current = performance.now()
    setPhase('answering')
  }, [])

  const restartStep = useCallback(() => {
    gradeRequestRef.current += 1
    interactionIdRef.current = createInteractionId()
    setPhase('ready')
    setBoxValues(freshBoxes(displayStep))
    setAssessmentResponseState(
      displayStep.assessment
        ? createAssessmentResponse(displayStep.assessment)
        : null,
    )
    setAssessmentResult(null)
    setActiveVarState(displayStep.targetVariables[0] ?? null)
    setErrorVars([])
    setFeedback(null)
    setStepAttempts(0)
    setUsedHint(false)
    setAnswerRevealed(false)
    setStepFailedOnce(true)
    setLastStepBadge(null)
    setForcedRetake(false)
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

  const setAssessmentResponse = useCallback(
    (response: AssessmentResponseV1) => {
      if (!displayStep.assessment) return
      setAssessmentResponseState(response)
      setAssessmentResult(null)
      setFeedback(null)
    },
    [displayStep.assessment],
  )

  const markHintUsed = useCallback(() => {
    assistedByStepRef.current[step.id] = true
    setUsedHint(true)
  }, [step.id])

  const allFilled = useMemo(
    () => displayStep?.targetVariables.every((t) => boxValues[t]?.trim().length) ?? false,
    [displayStep, boxValues],
  )

  const assessmentComplete = useMemo(() => {
    if (!assessmentUnit || !assessmentResponse) return false
    const activeResponse = activeResponseForAssessment(
      step,
      assessmentResponse,
      frameIndex,
    )
    return activeResponse
      ? responseCompleteness(assessmentUnit.assessment, activeResponse).complete
      : false
  }, [assessmentUnit, assessmentResponse, step, frameIndex])

  const checkAssessment = useCallback(async () => {
    if (!assessmentUnit || !assessmentResponse || phase !== 'answering') return
    const activeResponse = activeResponseForAssessment(
      step,
      assessmentResponse,
      frameIndex,
    )
    if (!activeResponse) return

    const context: AssessmentGradeContext = {
      lessonId: lesson.id,
      stepId: step.id,
      frameIndex,
      assessmentId: assessmentUnit.assessmentId,
      masteryId: assessmentUnit.masteryId,
      frameId: assessmentUnit.frameId,
    }
    const requestId = gradeRequestRef.current + 1
    gradeRequestRef.current = requestId
    setPhase('grading')
    setFeedback(null)

    const resolution = await gradeAssessmentResponse(
      assessmentUnit.assessment,
      activeResponse,
      context,
      options?.onGradeAssessment,
    )
    if (gradeRequestRef.current !== requestId) return

    if (resolution.kind === 'incomplete') {
      setAssessmentResult(resolution.result)
      setPhase('answering')
      setFeedback({
        kind: 'error',
        text:
          resolution.result.status === 'incomplete'
            ? resolution.result.reason
            : 'Finish your answer before checking it.',
      })
      return
    }
    if (resolution.kind === 'infrastructureError') {
      setAssessmentResult(null)
      setPhase('answering')
      setFeedback({ kind: 'error', text: resolution.message })
      return
    }

    const gradedResult = resolution.result
    const allCorrect = gradedResult.isCorrect
    // Per-question consecutive-miss counter: a correct answer clears it, so a
    // later success on the same question never triggers a retake.
    const nextMissStreak = allCorrect
      ? 0
      : (missStreakRef.current[step.id] ?? 0) + 1
    missStreakRef.current[step.id] = nextMissStreak
    const strikeRetake =
      !allCorrect &&
      strikeRetakeEnabled &&
      nextMissStreak >= FORCE_RETAKE_MISS_LIMIT
    const attemptsNow = stepAttempts + 1
    const firstTry = isUnassistedFirstTry(
      stepAttempts,
      stepFailedOnce,
      usedHint,
    )
    const responseMs = performance.now() - answerStartRef.current
    // Exam mode grants exactly one attempt: a miss resolves immediately as
    // "continue" so the evidence pipeline records a terminal, truthful miss.
    const failureDecision: AssessmentFailureDecision | null = allCorrect
      ? null
      : examMode
        ? { kind: 'continue' }
        : assessmentFailureDecision(
            assessmentUnit.failurePolicy,
            attemptsNow,
            isCheckpointStep(step) ? step.checkpointStartStepId : undefined,
          )
    const revealedByPolicy = failureDecision?.kind === 'reveal'
    const resolved = assessmentAttemptResolves(allCorrect, failureDecision)
    const evidenceKinds = assessmentEvidenceKinds(assessmentUnit.assessment)
    const serializedAttempt = serializeAssessmentAttempt(
      assessmentUnit.assessment,
      activeResponse,
      gradedResult,
      {
        attemptNumber: attemptsNow,
        revealed: revealedByPolicy,
        usedHint,
      },
    )

    if (options?.onAssessmentAttempt) {
      let persistedEvent: void | AttemptEvent
      try {
        persistedEvent = await options.onAssessmentAttempt({
          ...context,
          assessment: assessmentUnit.assessment,
          response: activeResponse,
          result: gradedResult,
          serializedAttempt,
          interactionId: interactionIdRef.current,
          resolved,
          evidenceKinds,
          firstTry,
          usedHint,
          responseMs,
        })
      } catch {
        if (gradeRequestRef.current !== requestId) return
        setAssessmentResult(gradedResult)
        setPhase('answering')
        setFeedback({
          kind: 'error',
          text:
            'Your answer was checked, but progress could not be saved. Try saving this answer again before continuing.',
        })
        return
      }
      if (gradeRequestRef.current !== requestId) return
      if (persistedEvent) {
        const evidence: PersistedAssessmentEvidence = {
          eventId: persistedEvent.id,
          interactionId: persistedEvent.interactionId,
          occurredAt: persistedEvent.occurredAt,
          assessmentId: assessmentUnit.assessmentId,
          assessmentKind: assessmentUnit.assessment.kind,
          stepId: step.id,
          evidenceKinds,
          isCorrect: gradedResult.isCorrect,
          resolved,
          firstTry,
          usedHint,
          revealed: revealedByPolicy,
        }
        if (
          !persistedAssessmentEvidenceRef.current.some(
            ({ eventId }) => eventId === evidence.eventId,
          )
        ) {
          persistedAssessmentEvidenceRef.current.push(evidence)
        }
      }
    }

    setAssessmentResult(gradedResult)
    if (!allCorrect) {
      wrongByStepRef.current[step.id] =
        (wrongByStepRef.current[step.id] ?? 0) + 1
    }

    options?.onAttempt?.({
      lessonId: lesson.id,
      stepId: step.id,
      submittedAnswer: { answer: JSON.stringify(activeResponse) },
      expectedAnswer: {
        answer: assessmentAnswerLabel(assessmentUnit.assessment),
      },
      isCorrect: allCorrect,
      attemptNumber: attemptsNow,
      createdAt: new Date().toISOString(),
    })
    const tier: SpeedTier =
      allCorrect && firstTry ? speedTier(responseMs) : null
    if (allCorrect) {
      options?.onCorrect?.({ firstTry, responseMs })
      options?.onConceptResult?.({
        conceptIds: step.conceptTags ?? [],
        firstTry,
        correct: true,
        responseMs,
      })
    } else if (
      failureDecision?.kind === 'reveal' ||
      failureDecision?.kind === 'continue' ||
      failureDecision?.kind === 'rewind'
    ) {
      options?.onConceptResult?.({
        conceptIds: step.conceptTags ?? [],
        firstTry: false,
        correct: false,
      })
    }

    const onLastFrame = !isTrace || frameIndex >= frameCount - 1
    const resolvedMiss =
      failureDecision?.kind === 'reveal' ||
      failureDecision?.kind === 'continue'
    const nextAgg = setAgg((prev) => {
      const updated: Aggregates = {
        ...prev,
        totalAttempts: prev.totalAttempts + 1,
      }
      if (allCorrect) {
        updated.correctCount = prev.correctCount + 1
        if (firstTry) updated.correctFirstTry = prev.correctFirstTry + 1
        if (tier === 'lightning') {
          updated.lightningCount = prev.lightningCount + 1
        } else if (tier === 'quick') {
          updated.quickCount = prev.quickCount + 1
        }
        if (onLastFrame && !prev.completedStepIds.includes(step.id)) {
          updated.completedStepIds = [...prev.completedStepIds, step.id]
        }
      } else {
        updated.wrongCount = prev.wrongCount + 1
        if (
          resolvedMiss &&
          onLastFrame &&
          !prev.completedStepIds.includes(step.id)
        ) {
          updated.completedStepIds = [...prev.completedStepIds, step.id]
        }
      }
      return updated
    })

    if (examMode) {
      // The attempt is fully recorded above; the learner just sees a neutral
      // "locked in" state — no verdict, no sound, no badge, no reveal.
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, !allCorrect))
      setStepAttempts(attemptsNow)
      setAnswerRevealed(false)
      setLastStepBadge(null)
      setErrorVars([])
      setPhase('solved')
      setFeedback(null)
      return
    }

    if (allCorrect) {
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      const missed = !firstTry
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, missed))
      setAnswerRevealed(false)
      setPhase('solved')
      setErrorVars([])
      setLastStepBadge(tier)
      setFeedback({
        kind: 'correct',
        text: displayStep.feedback.correct || 'Correct!',
      })
      playCorrect()
      return
    }

    setStepAttempts(attemptsNow)
    playWrong()

    if (strikeRetake) {
      // Three consecutive misses on this question: stop the per-question retry
      // loop and surface the forced retake so the host can send the learner
      // back through the lesson. The attempt above was recorded as an
      // unresolved miss (isCorrect false), so nothing here fabricates a pass.
      setPhase('answering')
      setForcedRetake(true)
      setFeedback({ kind: 'incorrect', text: FORCE_RETAKE_MESSAGE })
      return
    }

    // Python runs carry a concrete failure explanation (failed-case counts,
    // visible-example diff, or the raised error) — show it with the authored
    // flavor text so the learner knows WHAT to fix, not just that they missed.
    const expectedResponse = gradedResult.expectedResponse
    const responseRecord =
      expectedResponse !== null &&
      typeof expectedResponse === 'object' &&
      !Array.isArray(expectedResponse)
        ? (expectedResponse as Readonly<Record<string, unknown>>)
        : null
    const gradedDetail =
      typeof responseRecord?.detail === 'string' ? responseRecord.detail : null
    // A run that never produced answers (syntax/runtime error, timeout) is a
    // different situation from wrong answers — the authored "wrong answer"
    // flavor text would be misleading, so the error detail stands alone.
    const codeDidNotRun = typeof responseRecord?.errorCategory === 'string'
    // Submitting the untouched starter template is the single most common
    // "why does it keep failing" trap — name it instead of grading chatter.
    const starterUntouched =
      assessmentUnit.assessment.kind === 'pythonCode' &&
      activeResponse.kind === 'pythonCode' &&
      activeResponse.code.trim() ===
        assessmentUnit.assessment.starterCode.trim()
    const withDetail = (text: string) =>
      starterUntouched
        ? 'This is still the unedited starter template, so it fails the checks by design. Replace the placeholder with your own solution in the editor above, then press Check again.'
        : gradedDetail
          ? codeDidNotRun
            ? `Your code didn't finish running, so no answer was checked. ${gradedDetail}`
            : `${text} ${gradedDetail}`
          : text

    if (!failureDecision) {
      setPhase('answering')
      return
    }
    if (failureDecision.kind === 'retry') {
      setPhase('answering')
      if (failureDecision.resetAttempts) {
        interactionIdRef.current = createInteractionId()
        setStepAttempts(0)
        setStepFailedOnce(true)
        setAssessmentResponseState(
          createAssessmentResponse(displayStep.assessment!),
        )
        setAssessmentResult(null)
        answerStartRef.current = performance.now()
        setFeedback({
          kind: 'incorrect',
          text: withDetail(
            displayStep.feedback.secondIncorrect ??
              'Try this assessment again with a fresh answer.',
          ),
        })
      } else {
        setFeedback({
          kind: 'incorrect',
          text: withDetail(
            displayStep.feedback.incorrect || 'Not quite. Try again.',
          ),
        })
      }
      return
    }

    if (failureDecision.kind === 'rewind') {
      const startIdx = lesson.steps.findIndex(
        ({ id }) => id === failureDecision.checkpointStepId,
      )
      const notice =
        displayStep.feedback.secondIncorrect ??
        'Review the slides above, then try this question again.'
      if (startIdx >= 0) {
        persist(nextAgg, startIdx, false, 0)
        goToStep(startIdx, { notice })
      } else {
        setPhase('answering')
        setFeedback({ kind: 'error', text: notice })
      }
      return
    }

    const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
    setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, true))
    setAnswerRevealed(true)
    setLastStepBadge(null)
    setPhase('solved')
    if (failureDecision.kind === 'reveal') {
      setFeedback({
        kind: 'revealed',
        text: `The answer is ${assessmentAnswerLabel(
          assessmentUnit.assessment,
        )}. Counted as a miss — you'll see this in your review.`,
      })
    } else {
      setFeedback({
        kind: 'incorrect',
        text:
          displayStep.feedback.secondIncorrect ??
          'Not quite. This was counted as a miss; keep going.',
      })
    }
  }, [
    assessmentUnit,
    assessmentResponse,
    phase,
    step,
    frameIndex,
    lesson.id,
    lesson.steps,
    options,
    examMode,
    strikeRetakeEnabled,
    stepAttempts,
    stepFailedOnce,
    usedHint,
    isTrace,
    frameCount,
    setAgg,
    stepIndex,
    displayStep,
    persist,
    goToStep,
  ])

  const check = useCallback(() => {
    // Assessment steps have their own typed response path. In particular,
    // empty legacy targetVariables must never make Python code auto-pass.
    if (displayStep.assessment) return
    const wrong = displayStep.targetVariables.filter(
      (t) => !isMatch(displayStep.expectedState[t], boxValues[t] ?? ''),
    )
    const allCorrect = wrong.length === 0
    if (!allCorrect) {
      wrongByStepRef.current[step.id] = (wrongByStepRef.current[step.id] ?? 0) + 1
    }
    const nextMissStreak = allCorrect
      ? 0
      : (missStreakRef.current[step.id] ?? 0) + 1
    missStreakRef.current[step.id] = nextMissStreak
    const strikeRetake =
      !allCorrect &&
      strikeRetakeEnabled &&
      nextMissStreak >= FORCE_RETAKE_MISS_LIMIT

    const firstTry = isUnassistedFirstTry(
      stepAttempts,
      stepFailedOnce,
      usedHint,
    )
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

    // Feed the learner model once per resolved question (correct branch).
    if (allCorrect) {
      options?.onConceptResult?.({
        conceptIds: step.conceptTags ?? [],
        firstTry,
        correct: true,
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
          (examMode || attemptsNow >= MISTAKES_BEFORE_RESTART) &&
          onLastFrame &&
          !prev.completedStepIds.includes(step.id) &&
          (examMode || !isCheckpointStep(step))
        ) {
          nextAgg.completedStepIds = [...prev.completedStepIds, step.id]
        }
      }
      return nextAgg
    })

    if (examMode) {
      // Single silent attempt: record the resolved outcome, show no verdict.
      if (!allCorrect) {
        options?.onConceptResult?.({
          conceptIds: step.conceptTags ?? [],
          firstTry: false,
          correct: false,
        })
        setStepAttempts(stepAttempts + 1)
      }
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, !allCorrect))
      setAnswerRevealed(false)
      setLastStepBadge(null)
      setErrorVars([])
      setPhase('solved')
      setFeedback(null)
      return
    }

    if (allCorrect) {
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      const missed = !firstTry
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

    if (strikeRetake) {
      setForcedRetake(true)
      setFeedback({ kind: 'incorrect', text: FORCE_RETAKE_MESSAGE })
      return
    }

    if (attemptsNow >= MISTAKES_BEFORE_RESTART) {
      // Resolved as a miss — feed the learner model once.
      options?.onConceptResult?.({
        conceptIds: step.conceptTags ?? [],
        firstTry: false,
        correct: false,
      })
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
    usedHint,
    lesson.id,
    options,
    examMode,
    strikeRetakeEnabled,
    isTrace,
    frameIndex,
    frameCount,
    goToStep,
    lesson.steps,
    persist,
    setAgg,
    stepIndex,
  ])

  const next = useCallback(() => {
    if (phase === 'grading') return
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
    phase,
    setAgg,
  ])

  // Exam mode: there is no verdict to read after locking in an answer, so a
  // brief acknowledgement is shown and the run advances on its own.
  useEffect(() => {
    if (!examMode || phase !== 'solved' || isComplete) return
    const timer = setTimeout(next, EXAM_MODE_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [examMode, phase, isComplete, next])

  const canGoPrev = stepIndex > 0 || (isTrace && frameIndex > 0)

  const prev = useCallback(() => {
    if (isComplete || phase === 'grading' || !canGoPrev) return

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
    phase,
    setAgg,
  ])

  const restart = useCallback(() => {
    wrongByStepRef.current = {}
    assistedByStepRef.current = {}
    missStreakRef.current = {}
    persistedAssessmentEvidenceRef.current = []
    interactionIdRef.current = createInteractionId()
    setForcedRetake(false)
    setUnitOutcomes([])
    setAgg(() => ({
      correctCount: 0,
      wrongCount: 0,
      totalAttempts: 0,
      correctFirstTry: 0,
      completedStepIds: [],
      lightningCount: 0,
      quickCount: 0,
    }))
    setIsComplete(false)
    setResult(null)
    goToStep(0)
  }, [goToStep, setAgg])

  const skipStep = useCallback(async () => {
    // DEV BYPASS (showcase account only — enforced by the UI): resolve just
    // the current question as a first-try pass and advance. The skip never
    // touches missStreakRef (so the 3-strikes retake can't fire), and it
    // clears any earlier wrong-answer tally for this step so the question is
    // not flagged as missed in the end-of-run review.
    if (isComplete || !step || isPassiveStep(step.type)) return
    if (phase === 'grading') return
    if (phase === 'solved') {
      // Already answered — the skip is just an advance.
      next()
      return
    }
    // Reentrancy guard: the phase stays 'answering' while the attempt below
    // persists, so a double-click would otherwise run the whole skip twice
    // (duplicate evidence event + double-counted aggregates).
    if (skipStepInFlightRef.current) return
    skipStepInFlightRef.current = true
    try {
      // Invalidate any in-flight grade so a late result can't double-apply.
      gradeRequestRef.current += 1

      const unit = activeAssessmentUnit(step, frameIndex)
      if (unit) {
        const response = createAssessmentResponse(unit.assessment)
        const graded: GradedAssessmentResultV1 = {
          schemaVersion: ASSESSMENT_SCHEMA_VERSION,
          assessmentId: unit.assessment.id,
          assessmentKind: unit.assessment.kind,
          revealLabel: assessmentAnswerLabel(unit.assessment),
          status: 'correct',
          complete: true,
          isCorrect: true,
          expectedResponse: { devSkip: true },
        }
        // Number the skip like a genuine attempt on this interaction. If the
        // learner already missed the question, its unresolved event owns
        // attempt (interactionId, 1); reusing 1 here would collide on the
        // cloud's learning_attempt_number_unique constraint and — now that the
        // cache dedupes by natural key — the resolved skip would be dropped,
        // leaving the interaction unresolved forever. Bumping to
        // `stepAttempts + 1` mirrors the real retry path so the skip is a
        // distinct terminal attempt that actually closes the interaction.
        const skipAttemptNumber = stepAttempts + 1
        const skipFirstTry = stepAttempts === 0
        const serializedAttempt = serializeAssessmentAttempt(
          unit.assessment,
          response,
          graded,
          {
            attemptNumber: skipAttemptNumber,
            revealed: false,
            usedHint: false,
          },
        )
        const evidenceKinds = assessmentEvidenceKinds(unit.assessment)
        if (options?.onAssessmentAttempt) {
          let persistedEvent: void | AttemptEvent = undefined
          try {
            persistedEvent = await options.onAssessmentAttempt({
              lessonId: lesson.id,
              stepId: step.id,
              frameIndex,
              assessmentId: unit.assessmentId,
              masteryId: unit.masteryId,
              frameId: unit.frameId,
              assessment: unit.assessment,
              response,
              result: graded,
              serializedAttempt,
              // Resolve the CURRENT interaction: if the learner already missed
              // this question, the skip closes that interaction in the event
              // log (as a bumped terminal attempt) instead of leaving it
              // dangling unresolved.
              interactionId: interactionIdRef.current,
              resolved: true,
              evidenceKinds,
              // firstTryCorrect is only valid on attempt 1; a skip after a miss
              // is a later attempt and must not claim first-try credit.
              firstTry: skipFirstTry,
              usedHint: false,
              responseMs: 1200,
            })
          } catch {
            // A demo skip must never dead-end on persistence — advance anyway.
          }
          if (persistedEvent) {
            persistedAssessmentEvidenceRef.current = [
              ...persistedAssessmentEvidenceRef.current,
              {
                eventId: persistedEvent.id,
                interactionId: persistedEvent.interactionId,
                occurredAt: persistedEvent.occurredAt,
                assessmentId: unit.assessmentId,
                assessmentKind: unit.assessment.kind,
                stepId: step.id,
                evidenceKinds,
                isCorrect: true,
                resolved: true,
                firstTry: true,
                usedHint: false,
                revealed: false,
              },
            ]
          }
        }
      }

      // Passed-for-flow bookkeeping: clean miss streak, no "missed" flag.
      missStreakRef.current[step.id] = 0
      delete wrongByStepRef.current[step.id]
      delete assistedByStepRef.current[step.id]
      setForcedRetake(false)

      const onLastFrame = !isTrace || frameIndex >= frameCount - 1
      setAgg((prev) => {
        const updated: Aggregates = {
          ...prev,
          totalAttempts: prev.totalAttempts + 1,
          correctCount: prev.correctCount + 1,
          correctFirstTry: prev.correctFirstTry + 1,
        }
        if (onLastFrame && !prev.completedStepIds.includes(step.id)) {
          updated.completedStepIds = [...prev.completedStepIds, step.id]
        }
        return updated
      })
      const unitIdx = globalUnitIndex(lesson.steps, stepIndex, frameIndex)
      setUnitOutcomes((prev) => recordUnitOutcome(prev, unitIdx, false))
      setAnswerRevealed(false)
      setFeedback(null)
      next()
    } finally {
      skipStepInFlightRef.current = false
    }
  }, [
    isComplete,
    step,
    phase,
    frameIndex,
    frameCount,
    isTrace,
    lesson.id,
    lesson.steps,
    options,
    setAgg,
    stepIndex,
    stepAttempts,
    next,
  ])

  const skipQuiz = useCallback(async () => {
    // DEV BYPASS (showcase account only — enforced by the UI): complete the
    // quiz as a perfect first-try run. Each assessment unit gets a REAL
    // persisted learning event via the normal onAssessmentAttempt pipeline,
    // so evidence-linked flows (mission practice/retention, realm quizzes)
    // validate exactly as if the learner had answered everything correctly.
    const interactive = lesson.steps.filter((s) => isInteractiveStep(s.type))
    for (const lessonStep of interactive) {
      const unitCount = lessonStep.traceFrames?.length ?? 1
      for (let unitFrame = 0; unitFrame < unitCount; unitFrame++) {
        const unit = activeAssessmentUnit(lessonStep, unitFrame)
        if (!unit) continue
        const response = createAssessmentResponse(unit.assessment)
        const graded: GradedAssessmentResultV1 = {
          schemaVersion: ASSESSMENT_SCHEMA_VERSION,
          assessmentId: unit.assessment.id,
          assessmentKind: unit.assessment.kind,
          revealLabel: assessmentAnswerLabel(unit.assessment),
          status: 'correct',
          complete: true,
          isCorrect: true,
          expectedResponse: { devSkip: true },
        }
        const serializedAttempt = serializeAssessmentAttempt(
          unit.assessment,
          response,
          graded,
          { attemptNumber: 1, revealed: false, usedHint: false },
        )
        const evidenceKinds = assessmentEvidenceKinds(unit.assessment)
        let persistedEvent: void | AttemptEvent = undefined
        if (options?.onAssessmentAttempt) {
          persistedEvent = await options.onAssessmentAttempt({
            lessonId: lesson.id,
            stepId: lessonStep.id,
            frameIndex: unitFrame,
            assessmentId: unit.assessmentId,
            masteryId: unit.masteryId,
            frameId: unit.frameId,
            assessment: unit.assessment,
            response,
            result: graded,
            serializedAttempt,
            interactionId: createInteractionId(),
            resolved: true,
            evidenceKinds,
            firstTry: true,
            usedHint: false,
            responseMs: 1200,
          })
        }
        if (persistedEvent) {
          persistedAssessmentEvidenceRef.current = [
            ...persistedAssessmentEvidenceRef.current,
            {
              eventId: persistedEvent.id,
              interactionId: persistedEvent.interactionId,
              occurredAt: persistedEvent.occurredAt,
              assessmentId: unit.assessmentId,
              assessmentKind: unit.assessment.kind,
              stepId: lessonStep.id,
              evidenceKinds,
              isCorrect: true,
              resolved: true,
              firstTry: true,
              usedHint: false,
              revealed: false,
            },
          ]
        }
      }
      // Review runs clear their missed steps one by one — mirror that here so
      // a skipped review actually restores mastery.
      options?.reviewMode?.onStepCleared(lessonStep.id)
    }

    wrongByStepRef.current = {}
    assistedByStepRef.current = {}
    const finalAgg = setAgg(() => ({
      correctCount: interactiveTotal,
      wrongCount: 0,
      totalAttempts: interactiveTotal,
      correctFirstTry: interactiveTotal,
      completedStepIds: interactive.map(({ id }) => id),
      lightningCount: 0,
      quickCount: 0,
    }))
    const finished = buildResult(finalAgg)
    setResult(finished)
    setIsComplete(true)
    persist(
      finalAgg,
      Math.max(0, lesson.steps.length - 1),
      options?.completeAsLesson !== false,
      frameIndex,
    )
  }, [
    buildResult,
    frameIndex,
    interactiveTotal,
    lesson.id,
    lesson.steps,
    options,
    persist,
    setAgg,
  ])

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
      // Exam mode never colors segments by correctness — only "answered".
      if (outcome === 'correct') return examMode ? 'answered' : 'correct'
      if (outcome === 'wrong') return examMode ? 'answered' : 'wrong'
      if (phase !== 'solved' && i === progressNowIndex) return 'now'
      return 'todo'
    })
  }, [progressTotal, unitOutcomes, phase, progressNowIndex, examMode])

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
    assessmentResponse,
    assessmentResult,
    assessmentId: assessmentUnit?.assessmentId ?? null,
    masteryId: assessmentUnit?.masteryId ?? null,
    assessmentComplete,
    isGrading: phase === 'grading',
    activeVar,
    errorVars,
    feedback,
    stepAttempts,
    usedHint,
    answerRevealed,
    allFilled,
    lastStepBadge,
    result,
    completedStepIds: agg.completedStepIds,
    rewindNotice,
    forcedRetake,
    stepMissStreak: step ? (missStreakRef.current[step.id] ?? 0) : 0,
    progressSnapshot,
    runStep,
    setActiveVar,
    setBox,
    fillActive,
    setAssessmentResponse,
    checkAssessment,
    check,
    next,
    prev,
    canGoPrev,
    restartStep,
    markHintUsed,
    restart,
    skipQuiz,
    skipStep,
  }
}
