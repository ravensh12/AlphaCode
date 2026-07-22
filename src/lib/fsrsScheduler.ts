import {
  FSRS_SCHEDULER_VERSION,
  type FsrsRating,
  type FsrsState,
} from '../types/learning'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_STABILITY_DAYS = 10 / (24 * 60)
const MAX_STABILITY_DAYS = 3650
const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 10
const INITIAL_DIFFICULTY = 5
const AGAIN_INTERVAL_DAYS = MIN_STABILITY_DAYS

export const EASY_RESPONSE_MS = 5000

export type SchedulerTimestamp = string | number
export type AttemptRatingInput = {
  readonly resolved?: boolean
  readonly isCorrect: boolean
  readonly revealed?: boolean
  readonly usedHint?: boolean
  readonly attemptNumber?: number
  readonly firstTryCorrect?: boolean
  readonly responseMs?: number
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

function timestampMs(value: SchedulerTimestamp): number {
  const result = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(result)) {
    throw new RangeError(`Invalid scheduler timestamp: ${String(value)}`)
  }
  return result
}

const toIso = (value: number): string => new Date(Math.round(value)).toISOString()

function checkedState(state: FsrsState): FsrsState {
  if (state.schedulerVersion !== FSRS_SCHEDULER_VERSION) {
    throw new Error(
      `Unsupported scheduler version ${String(state.schedulerVersion)}`,
    )
  }

  const stability = Number.isFinite(state.stabilityDays)
    ? state.stabilityDays
    : MIN_STABILITY_DAYS
  const difficulty = Number.isFinite(state.difficulty)
    ? state.difficulty
    : INITIAL_DIFFICULTY

  return {
    ...state,
    stabilityDays: clamp(
      stability,
      MIN_STABILITY_DAYS,
      MAX_STABILITY_DAYS,
    ),
    difficulty: clamp(difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY),
    reps: Math.max(0, Math.floor(Number.isFinite(state.reps) ? state.reps : 0)),
    lapses: Math.max(
      0,
      Math.floor(Number.isFinite(state.lapses) ? state.lapses : 0),
    ),
  }
}

export function createFsrsState(at: SchedulerTimestamp): FsrsState {
  const atMs = timestampMs(at)
  return {
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    phase: 'new',
    stabilityDays: MIN_STABILITY_DAYS,
    difficulty: INITIAL_DIFFICULTY,
    dueAt: toIso(atMs),
    reps: 0,
    lapses: 0,
  }
}

/**
 * Convert one resolved interaction into the shared four-grade scheduler scale.
 * Unresolved telemetry is deliberately not scheduled.
 */
export function ratingForAttempt(
  attempt: AttemptRatingInput,
): FsrsRating | null {
  const resolved = attempt.resolved ?? true
  const revealed = attempt.revealed ?? false
  const attemptNumber = attempt.attemptNumber ?? 1
  const firstTryCorrect =
    attempt.firstTryCorrect ??
    (attempt.isCorrect && attemptNumber === 1 && !revealed)

  if (!resolved && !revealed) return null
  if (attempt.revealed || !attempt.isCorrect) return 'again'
  if (
    attempt.usedHint ||
    attemptNumber > 1 ||
    !firstTryCorrect
  ) {
    return 'hard'
  }
  if (
    attempt.responseMs != null &&
    Number.isFinite(attempt.responseMs) &&
    attempt.responseMs <= EASY_RESPONSE_MS
  ) {
    return 'easy'
  }
  return 'good'
}

/**
 * Small FSRS-style scheduler used by every v1 mastery projection. It models
 * stability/difficulty and the same 90%-retrievability interval as FSRS while
 * keeping the implementation dependency-free and versioned.
 */
export function scheduleReview(
  previous: FsrsState | undefined,
  rating: FsrsRating,
  at: SchedulerTimestamp,
): FsrsState {
  const atMs = timestampMs(at)
  const prev = previous ? checkedState(previous) : createFsrsState(atMs)

  let difficultyDelta: number
  switch (rating) {
    case 'again':
      difficultyDelta = 1
      break
    case 'hard':
      difficultyDelta = 0.45
      break
    case 'good':
      difficultyDelta = -0.15
      break
    case 'easy':
      difficultyDelta = -0.65
      break
  }

  const difficulty = clamp(
    prev.difficulty + difficultyDelta,
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
  )

  let stabilityDays: number
  if (prev.reps === 0) {
    switch (rating) {
      case 'again':
        stabilityDays = AGAIN_INTERVAL_DAYS
        break
      case 'hard':
        stabilityDays = 0.5
        break
      case 'good':
        stabilityDays = 1
        break
      case 'easy':
        stabilityDays = 4
        break
    }
  } else if (rating === 'again') {
    // A lapse always lowers current stability; no historical max merge.
    stabilityDays = Math.min(
      prev.stabilityDays * 0.35,
      AGAIN_INTERVAL_DAYS,
    )
  } else {
    const recall = retrievability(prev, atMs)
    const forgettingBonus = 1 - recall
    const difficultyPenalty = (difficulty - INITIAL_DIFFICULTY) * 0.025
    const factor =
      rating === 'hard'
        ? 1.2 + forgettingBonus * 0.25 - difficultyPenalty
        : rating === 'good'
          ? 2.15 + forgettingBonus * 0.75 - difficultyPenalty
          : 3.4 + forgettingBonus - difficultyPenalty
    stabilityDays = prev.stabilityDays * Math.max(1.05, factor)
  }

  stabilityDays = clamp(
    stabilityDays,
    MIN_STABILITY_DAYS,
    MAX_STABILITY_DAYS,
  )

  const phase =
    rating === 'again'
      ? prev.reps === 0
        ? 'learning'
        : 'relearning'
      : rating === 'hard' && prev.reps === 0
        ? 'learning'
        : 'review'

  return {
    schedulerVersion: FSRS_SCHEDULER_VERSION,
    phase,
    stabilityDays,
    difficulty,
    dueAt: toIso(atMs + stabilityDays * DAY_MS),
    lastReviewAt: toIso(atMs),
    reps: prev.reps + 1,
    lapses: prev.lapses + (rating === 'again' ? 1 : 0),
  }
}

/**
 * Estimated recall probability at a supplied time. Stability is defined as
 * the interval at which this curve reaches 90%.
 */
export function retrievability(
  state: FsrsState,
  at: SchedulerTimestamp,
): number {
  const checked = checkedState(state)
  if (!checked.lastReviewAt || checked.reps === 0) return 0
  const elapsedDays = Math.max(
    0,
    (timestampMs(at) - timestampMs(checked.lastReviewAt)) / DAY_MS,
  )
  const value = 1 / (1 + elapsedDays / (9 * checked.stabilityDays))
  return clamp(value, 0, 1)
}
