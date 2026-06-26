/**
 * Final Gauntlet progress — persisted per identity in localStorage (same shape
 * of storage as `playerLevel`). This is the durable home for the learning-science
 * signals the Mastery Trial produces:
 *
 *  - Spaced repetition: each concept lives in a Leitner BOX (1..5). A correct
 *    first-try answer promotes it (longer interval); a miss demotes it to box 1
 *    (resurfaces soon). `dueAt` is when the concept should next be reviewed.
 *  - Mastery learning: a concept is "mastered" once it reaches MASTERY_BOX with a
 *    healthy first-try ratio. The boss only unlocks when the trial is passed.
 *  - We also keep best score + attempts for a clear, visible mastery signal.
 */

import type { ConceptId } from '../types/lesson'
import type { QuestionOutcome } from '../types/finalGauntlet'

const STORAGE_VERSION = 1

/** Leitner intervals (ms) per box. Box 1 resurfaces within the same session. */
const DAY = 24 * 60 * 60 * 1000
const BOX_INTERVAL_MS = [0, 20 * 1000, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY]
const MAX_BOX = 5
/** A concept counts as mastered at box >= this with first-try ratio >= MASTERY_RATIO. */
export const MASTERY_BOX = 3
export const MASTERY_RATIO = 0.6
/** First-try accuracy needed for the trial's headline "pass" grade. */
export const EXAM_PASS_PERCENT = 80

export type ConceptStat = {
  concept: ConceptId
  /** Total questions of this concept the learner has seen across attempts. */
  seen: number
  /** First-try-correct count, across attempts. */
  correctFirstTry: number
  /** Current Leitner box (1..5). */
  box: number
  /** Consecutive first-try correct answers (resets on a miss). */
  streak: number
  /** Epoch ms when this concept is next due for review. */
  dueAt: number
  lastSeenAt: number
}

export type GauntletState = {
  version: number
  /** Highest first-try percentage achieved on a completed trial (0..100). */
  bestScore: number
  /** Number of trial attempts started. */
  attempts: number
  /** True once the learner has completed (cleared) the trial at least once. */
  examPassed: boolean
  examPassedAt?: string
  /** True once the final boss has been defeated. */
  finalBossBeaten: boolean
  finalBossBeatenAt?: string
  concepts: Record<string, ConceptStat>
}

export function emptyGauntletState(): GauntletState {
  return {
    version: STORAGE_VERSION,
    bestScore: 0,
    attempts: 0,
    examPassed: false,
    finalBossBeaten: false,
    concepts: {},
  }
}

const keyFor = (id: string) => `alphacode.gauntlet.${id}`

export function loadGauntlet(id: string): GauntletState {
  try {
    const raw = localStorage.getItem(keyFor(id))
    if (!raw) return emptyGauntletState()
    const parsed = JSON.parse(raw) as Partial<GauntletState>
    return { ...emptyGauntletState(), ...parsed, concepts: parsed.concepts ?? {} }
  } catch {
    return emptyGauntletState()
  }
}

export function saveGauntlet(id: string, state: GauntletState): void {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(state))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function ensureConcept(state: GauntletState, concept: ConceptId, now: number): ConceptStat {
  const existing = state.concepts[concept]
  if (existing) return existing
  const fresh: ConceptStat = {
    concept,
    seen: 0,
    correctFirstTry: 0,
    box: 1,
    streak: 0,
    dueAt: now,
    lastSeenAt: now,
  }
  state.concepts[concept] = fresh
  return fresh
}

function intervalForBox(box: number): number {
  const i = Math.max(0, Math.min(MAX_BOX, box))
  return BOX_INTERVAL_MS[i] ?? BOX_INTERVAL_MS[MAX_BOX]
}

/**
 * Fold one answered question into the spaced-repetition schedule. Returns the
 * NEXT state (does not persist — caller decides when to save).
 */
export function applyOutcome(
  state: GauntletState,
  outcome: QuestionOutcome,
  now = Date.now(),
): GauntletState {
  const next: GauntletState = { ...state, concepts: { ...state.concepts } }
  const prev = ensureConcept(next, outcome.concept, now)
  const stat: ConceptStat = { ...prev }

  stat.seen += 1
  stat.lastSeenAt = now
  if (outcome.firstTryCorrect) {
    stat.correctFirstTry += 1
    stat.streak += 1
    // Promote a box — but a hint-assisted answer only nudges, so support fades gradually.
    stat.box = Math.min(MAX_BOX, stat.box + (outcome.usedHint ? 0 : 1))
  } else {
    stat.streak = 0
    stat.box = 1 // demote — resurface this concept very soon
  }
  stat.dueAt = now + intervalForBox(stat.box)
  next.concepts[outcome.concept] = stat
  return next
}

export function isConceptMastered(stat: ConceptStat | undefined): boolean {
  if (!stat) return false
  const ratio = stat.seen > 0 ? stat.correctFirstTry / stat.seen : 0
  return stat.box >= MASTERY_BOX && ratio >= MASTERY_RATIO
}

/** Concepts whose review is due (dueAt <= now), soonest first. */
export function dueConcepts(state: GauntletState, now = Date.now()): ConceptStat[] {
  return Object.values(state.concepts)
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
}

/**
 * Record a completed trial run. `scorePercent` is the headline mastery signal
 * (accuracy over the whole trial). The boss only unlocks when the learner
 * reaches the mastery threshold (EXAM_PASS_PERCENT) — below that they review and
 * retry. A pass, once earned, is sticky.
 */
export function recordExamCompletion(
  state: GauntletState,
  scorePercent: number,
  now = Date.now(),
): GauntletState {
  const passedNow = scorePercent >= EXAM_PASS_PERCENT
  const next: GauntletState = {
    ...state,
    attempts: state.attempts + 1,
    bestScore: Math.max(state.bestScore, Math.round(scorePercent)),
    examPassed: state.examPassed || passedNow,
  }
  if (passedNow && !state.examPassed) {
    next.examPassedAt = new Date(now).toISOString()
  }
  return next
}

export function markBossBeaten(state: GauntletState, now = Date.now()): GauntletState {
  return {
    ...state,
    finalBossBeaten: true,
    finalBossBeatenAt: new Date(now).toISOString(),
  }
}

/** A Bronze/Silver/Gold style grade for a first-try percentage. */
export function gradeFor(percent: number): { tier: 'gold' | 'silver' | 'bronze'; label: string } {
  if (percent >= 95) return { tier: 'gold', label: 'Flawless Mastery' }
  if (percent >= EXAM_PASS_PERCENT) return { tier: 'gold', label: 'Gold Mastery' }
  if (percent >= 65) return { tier: 'silver', label: 'Silver Mastery' }
  return { tier: 'bronze', label: 'Bronze — keep training' }
}
