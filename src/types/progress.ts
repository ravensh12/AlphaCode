import type { ConceptId, VariableValue } from './lesson'

export type LessonStatus = 'notStarted' | 'inProgress' | 'completed'

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
  streak: StreakState
  lessons: Record<string, LessonProgress>
}
