import type { ConceptId, LessonStep, VariableValue } from './lesson'
import type { BadgeCounts } from '../content/badges'

export type LessonStatus = 'notStarted' | 'inProgress' | 'completed'

/**
 * Snapshot of the most recent full playthrough, so the learner can review what
 * they got right/wrong and redo missed questions without replaying everything.
 * Stores full steps (questions are procedurally generated, so we keep them).
 */
export type LessonReview = {
  steps: LessonStep[]
  missedStepIds: string[]
  recordedAt: string
  /** Resume position within the current missed-question list. */
  reviewStepIndex?: number
  reviewFrameIndex?: number
}

export type LessonProgress = {
  lessonId: string
  status: LessonStatus
  currentStepIndex: number
  completedStepIds: string[]
  correctCount: number
  wrongCount: number
  totalAttempts: number
  /** correct answers given on the first try, used for mastery */
  correctFirstTry: number
  accuracy: number
  masteryScore: number
  unlockNextLesson: boolean
  completedAt?: string
  updatedAt?: string
  /** Most recent full-playthrough breakdown, for the Review screen. */
  lastReview?: LessonReview
  /** Interactive teach section finished — unlocks the quiz. */
  learnCompleted?: boolean
  /** Index within the current step's trace frames (for multi-line walkthroughs). */
  learnFrameIndex?: number
  learnStepIndex?: number
  quizFrameIndex?: number
  quizStepIndex?: number
  /** Badges earned on the most recent full quiz run (for completion UI). */
  lastQuizBadgeCounts?: BadgeCounts
  /** Queued once per quiz finish — merged into global totals on save. */
  pendingBadgeCounts?: BadgeCounts
}

export type ConceptMastery = {
  conceptId: ConceptId
  score: number
  correctFirstTry: number
  wrongAttempts: number
  lastPracticedAt?: string
  nextReviewAt?: string
}

export type StreakState = {
  current: number
  longest: number
  lastActivityDate?: string
}

export type AttemptRecord = {
  lessonId: string
  stepId: string
  submittedAnswer: Record<string, VariableValue>
  expectedAnswer: Record<string, VariableValue>
  isCorrect: boolean
  attemptNumber: number
  createdAt: string
}

export type ExperienceLevel = 'new' | 'some' | 'class'

/** The full per-user progress snapshot held in app state. */
export type ProgressState = {
  experienceLevel?: ExperienceLevel
  /**
   * Result of the opening placement diagnostic: every world whose catalog index
   * is <= this value is unlocked from the start, so returning/advanced players
   * can jump ahead. -1 / undefined = no placement (normal sequential unlock).
   */
  placementUnlockIndex?: number
  /** Lesson id the placement recommends starting from (for UI highlighting). */
  recommendedLessonId?: string
  streak: StreakState
  lessons: Record<string, LessonProgress>
  /** Total times each badge type has been earned. */
  badgeCounts: BadgeCounts
  /**
   * "The Threshold" zone cleared — the gate between beating the Level-6 boss and
   * unlocking the Final Gauntlet. Optional so older saved state stays valid.
   */
  interZoneComplete?: boolean
  /** ISO timestamp of when the Threshold was first completed. */
  interZoneCompletedAt?: string
}
