import { answerXp } from '../../lib/playerLevel'
import type { ConceptId } from '../../types/lesson'

/* ============================================================================
   Quiz-chain state machine — the pure core behind the ArcadeOverlay and
   NpcDialogOverlay (Living Code City PR4-6 prep).

   Both overlays are dumb views over this reducer: answering, timing out, and
   advancing are plain state transitions that also emit an EVENT describing
   what the host should do (grant XP, record a concept result). The overlays
   forward those events through injected callbacks and never touch progress
   APIs themselves.
   ========================================================================== */

export interface QuizChainQuestion {
  /** Legacy learner-model concept; absent = XP-only question. */
  concept?: ConceptId
  prompt: string
  choices: readonly string[]
  answerIndex: number
}

/** Matches ProgressContext.recordConceptResult's info argument. */
export interface QuizConceptResult {
  conceptIds: ConceptId[]
  firstTry: boolean
  correct: boolean
  responseMs?: number
}

export interface QuizChainState {
  index: number
  /** Choice picked for the current question (null until answered). */
  picked: number | null
  /** True when the current reveal came from the soft timer, not a pick. */
  timedOut: boolean
  /** Reveal flag for the current question. */
  revealed: boolean
  correctCount: number
  /** Consecutive-correct run, for streak bonus display. */
  streak: number
  bestStreak: number
  /** XP tallied so far across the chain. */
  xp: number
  done: boolean
}

export interface QuizChainRules {
  /** Bonus XP per consecutive correct answer beyond the first. */
  streakBonusXp: number
}

export interface QuizChainEvent {
  correct: boolean
  /** XP the host should grant for this answer (base + streak bonus). */
  xp: number
  /** Learner-model outcome; null for concept-free (XP-only) questions. */
  conceptResult: QuizConceptResult | null
}

export const DEFAULT_QUIZ_RULES: QuizChainRules = { streakBonusXp: 0 }

/** NPC chains pay this much extra per consecutive correct beyond the first. */
export const NPC_STREAK_BONUS_XP = 6

/** Soft per-question timer both overlays run (seconds). */
export { ARCADE_QUESTION_SECONDS } from '../../lib/cityLife'

export function startQuizChain(): QuizChainState {
  return {
    index: 0,
    picked: null,
    timedOut: false,
    revealed: false,
    correctCount: 0,
    streak: 0,
    bestStreak: 0,
    xp: 0,
    done: false,
  }
}

function conceptResultFor(
  question: QuizChainQuestion,
  correct: boolean,
  responseMs?: number,
): QuizConceptResult | null {
  if (!question.concept) return null
  return {
    conceptIds: [question.concept],
    // One shot per question in these chains — the first try IS the answer.
    firstTry: true,
    correct,
    ...(responseMs != null ? { responseMs } : {}),
  }
}

const NO_EVENT: QuizChainEvent = { correct: false, xp: 0, conceptResult: null }

/**
 * Resolve the current question with a picked choice. Ignored (state returned
 * unchanged) once revealed or done, so double-clicks cannot double-award.
 */
export function answerQuizChain(
  state: QuizChainState,
  questions: readonly QuizChainQuestion[],
  choiceIndex: number,
  responseMs: number,
  rules: QuizChainRules = DEFAULT_QUIZ_RULES,
): { state: QuizChainState; event: QuizChainEvent } {
  const question = questions[state.index]
  if (!question || state.revealed || state.done) {
    return { state, event: NO_EVENT }
  }
  const correct = choiceIndex === question.answerIndex
  const streak = correct ? state.streak + 1 : 0
  const bonus = correct ? Math.max(0, streak - 1) * rules.streakBonusXp : 0
  const xp = correct ? answerXp(true, true, responseMs) + bonus : 0
  return {
    state: {
      ...state,
      picked: choiceIndex,
      timedOut: false,
      revealed: true,
      correctCount: state.correctCount + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      xp: state.xp + xp,
    },
    event: {
      correct,
      xp,
      conceptResult: conceptResultFor(question, correct, responseMs),
    },
  }
}

/**
 * The soft timer expired: reveal the answer and count a gentle miss (wrong,
 * no XP, streak reset) so the concept resurfaces soon in the scheduler.
 */
export function timeoutQuizChain(
  state: QuizChainState,
  questions: readonly QuizChainQuestion[],
): { state: QuizChainState; event: QuizChainEvent } {
  const question = questions[state.index]
  if (!question || state.revealed || state.done) {
    return { state, event: NO_EVENT }
  }
  return {
    state: {
      ...state,
      picked: null,
      timedOut: true,
      revealed: true,
      streak: 0,
    },
    event: {
      correct: false,
      xp: 0,
      conceptResult: conceptResultFor(question, false),
    },
  }
}

/** Move to the next question, or mark the chain done after the last one. */
export function advanceQuizChain(
  state: QuizChainState,
  questionCount: number,
): QuizChainState {
  if (!state.revealed || state.done) return state
  if (state.index + 1 >= questionCount) {
    return { ...state, done: true }
  }
  return {
    ...state,
    index: state.index + 1,
    picked: null,
    timedOut: false,
    revealed: false,
  }
}
