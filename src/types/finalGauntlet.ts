import type { ConceptId } from './lesson'

/**
 * The Final Gauntlet — a post-game "mastery trial" that interleaves every
 * concept from all six lessons, then a final boss. The question schema is
 * deliberately richer than the lesson `LessonStep` so we can favour RETRIEVAL
 * (recall / predict / reorder) over mere recognition.
 */

export type ExamQuestionType = 'mcq' | 'recall' | 'predict' | 'order'

export type ExamQuestionBase = {
  id: string
  /** Which lesson concept this pulls from — drives interleaving + mastery tracking. */
  concept: ConceptId
  /** Human label for the concept, shown in the question chrome (e.g. "Hash Maps"). */
  conceptLabel: string
  /**
   * 1 = supported (hint offered up front), 2 = medium, 3 = unsupported/hard.
   * Drives the desirable-difficulty ramp and how aggressively scaffolding fades.
   */
  difficulty: 1 | 2 | 3
  /** Retrieval-framed question stem. */
  prompt: string
  /** Optional monospace code snippet shown above the answer area. */
  code?: string[]
  /** Explanatory feedback shown after answering — teaches WHY, not just right/wrong. */
  explanation: string
  /** A Socratic nudge that guides without giving the answer away (scaffold). */
  hint: string
}

export type McqQuestion = ExamQuestionBase & {
  type: 'mcq'
  choices: string[]
  /** Index into `choices`. Choices are shuffled per-attempt by the engine. */
  answerIndex: number
}

/** Free recall of a term/value — the learner types it from memory. */
export type RecallQuestion = ExamQuestionBase & {
  type: 'recall'
  inputMode: 'text' | 'numeric'
  /** Accepted answers, compared case-insensitively after whitespace normalisation. */
  accept: string[]
  placeholder?: string
}

/** Predict-the-output: read code, type what it produces. */
export type PredictQuestion = ExamQuestionBase & {
  type: 'predict'
  inputMode: 'text' | 'numeric'
  accept: string[]
  placeholder?: string
}

/** Reconstruct an algorithm by ordering its steps (presented shuffled). */
export type OrderQuestion = ExamQuestionBase & {
  type: 'order'
  /** Steps in the CORRECT order. The engine shuffles them for display. */
  steps: string[]
}

export type ExamQuestion =
  | McqQuestion
  | RecallQuestion
  | PredictQuestion
  | OrderQuestion

/** Result of one answered question, fed to the spaced-repetition scheduler. */
export type QuestionOutcome = {
  questionId: string
  concept: ConceptId
  firstTryCorrect: boolean
  attempts: number
  usedHint: boolean
}
