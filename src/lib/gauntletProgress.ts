/**
 * Final Gauntlet progress — persisted per identity in localStorage (same shape
 * of storage as `playerLevel`). This is the durable home for the learning-science
 * signals the historical primer trial produced:
 *
 *  - Legacy spaced repetition: each concept lives in a Leitner BOX (1..5). A correct
 *    first-try answer promotes it (longer interval); a miss demotes it to box 1
 *    (resurfaces soon). `dueAt` is when the concept should next be reviewed.
 *  - Legacy mastery: a concept is "mastered" once it reaches MASTERY_BOX with a
 *    healthy first-try ratio. These fields remain readable for old warmups.
 *  - We also keep best score + attempts for a clear, visible mastery signal.
 */

import type { ConceptId } from '../types/lesson'
import type { QuestionOutcome } from '../types/finalGauntlet'

const STORAGE_VERSION = 4

/** Leitner intervals (ms) per box. Box 1 resurfaces within the same session. */
const DAY = 24 * 60 * 60 * 1000
const BOX_INTERVAL_MS = [0, 20 * 1000, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY]
const MAX_BOX = 5
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

export type CertificationAttemptEvidence = {
  readonly attemptId: string
  readonly completedAt: string
  readonly score: number
  readonly requirementsPassed: boolean
}

export type GauntletConceptOutcomeEvidence = {
  readonly outcomeId: string
  readonly occurredAt: string
  readonly outcome: QuestionOutcome
}

export type FinalBossDefeatEvidence = {
  readonly defeatId: string
  readonly defeatedAt: string
}

export type GauntletState = {
  version: number
  /** Monotonic snapshot revision used by cloud reconciliation. */
  revision: number
  /** Highest first-try percentage achieved on a completed trial (0..100). */
  bestScore: number
  /** Number of trial attempts started. */
  attempts: number
  /** True once the learner has completed (cleared) the trial at least once. */
  examPassed: boolean
  examPassedAt?: string
  /**
   * Migration marker for the active 18-track certification. Legacy v1 exam
   * passes did not prove track coverage or clean open-ended transfer.
   */
  certificationRequirementsPassed: boolean
  /** True once the final boss has been defeated. */
  finalBossBeaten: boolean
  finalBossBeatenAt?: string
  concepts: Record<string, ConceptStat>
  /** Legacy aggregate seeds are preserved without inventing event identities. */
  legacyAttemptCount: number
  legacyBestScore: number
  legacyExamPassed: boolean
  legacyExamPassedAt?: string
  legacyFinalBossBeaten: boolean
  legacyFinalBossBeatenAt?: string
  legacyConcepts: Record<string, ConceptStat>
  /** Canonical, union-mergeable v4 evidence. */
  certificationAttempts: Record<string, CertificationAttemptEvidence>
  conceptOutcomes: Record<string, GauntletConceptOutcomeEvidence>
  finalBossDefeats: Record<string, FinalBossDefeatEvidence>
  /** Local-only durable retry marker; never trusted as cloud evidence. */
  pendingCloudSync: boolean
}

export function emptyGauntletState(): GauntletState {
  return {
    version: STORAGE_VERSION,
    revision: 0,
    bestScore: 0,
    attempts: 0,
    examPassed: false,
    certificationRequirementsPassed: false,
    finalBossBeaten: false,
    concepts: {},
    legacyAttemptCount: 0,
    legacyBestScore: 0,
    legacyExamPassed: false,
    legacyFinalBossBeaten: false,
    legacyConcepts: {},
    certificationAttempts: {},
    conceptOutcomes: {},
    finalBossDefeats: {},
    pendingCloudSync: false,
  }
}

export function createGauntletEventId(prefix = 'gauntlet'): string {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${id}`
}

const keyFor = (id: string) => `alphacode.gauntlet.${id}`

export function loadGauntlet(id: string): GauntletState {
  try {
    const raw = localStorage.getItem(keyFor(id))
    if (!raw) return emptyGauntletState()
    return normalizeGauntletState(JSON.parse(raw))
  } catch {
    return emptyGauntletState()
  }
}

export function normalizeGauntletState(value: unknown): GauntletState {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<GauntletState>)
      : {}
  const isV4 = parsed.version === STORAGE_VERSION
  const legacyRequirements =
    parsed.certificationRequirementsPassed === true
  const parsedConcepts = objectValue<ConceptStat>(parsed.concepts)
  const base: GauntletState = {
    ...emptyGauntletState(),
    revision: nonNegativeInteger(parsed.revision),
    legacyAttemptCount: isV4
      ? nonNegativeInteger(parsed.legacyAttemptCount)
      : nonNegativeInteger(parsed.attempts),
    legacyBestScore: isV4
      ? boundedScore(parsed.legacyBestScore)
      : boundedScore(parsed.bestScore),
    legacyExamPassed: isV4
      ? parsed.legacyExamPassed === true
      : parsed.examPassed === true && legacyRequirements,
    legacyExamPassedAt: isV4
      ? validIso(parsed.legacyExamPassedAt)
      : parsed.examPassed === true && legacyRequirements
        ? validIso(parsed.examPassedAt)
        : undefined,
    legacyFinalBossBeaten: isV4
      ? parsed.legacyFinalBossBeaten === true
      : parsed.finalBossBeaten === true,
    legacyFinalBossBeatenAt: isV4
      ? validIso(parsed.legacyFinalBossBeatenAt)
      : parsed.finalBossBeaten === true
        ? validIso(parsed.finalBossBeatenAt)
        : undefined,
    legacyConcepts: isV4
      ? objectValue<ConceptStat>(parsed.legacyConcepts)
      : parsedConcepts,
    certificationAttempts: normalizeCertificationAttempts(
      parsed.certificationAttempts,
    ),
    conceptOutcomes: normalizeConceptOutcomes(parsed.conceptOutcomes),
    finalBossDefeats: normalizeFinalBossDefeats(parsed.finalBossDefeats),
    pendingCloudSync: parsed.pendingCloudSync === true,
  }
  return projectGauntletState(base)
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function objectValue<T>(value: unknown): Record<string, T> {
  return isObject(value) ? (value as Record<string, T>) : {}
}

function nonNegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
}

function boundedScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0
}

function validIso(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(Date.parse(value)).toISOString()
    : undefined
}

function normalizeCertificationAttempts(
  value: unknown,
): Record<string, CertificationAttemptEvidence> {
  const attempts: Record<string, CertificationAttemptEvidence> = {}
  for (const [attemptId, candidate] of Object.entries(objectValue<unknown>(value))) {
    if (!attemptId.trim() || !isObject(candidate)) continue
    const completedAt = validIso(candidate.completedAt)
    if (
      candidate.attemptId !== attemptId ||
      !completedAt ||
      typeof candidate.requirementsPassed !== 'boolean'
    ) {
      continue
    }
    attempts[attemptId] = {
      attemptId,
      completedAt,
      score: boundedScore(candidate.score),
      requirementsPassed: candidate.requirementsPassed,
    }
  }
  return attempts
}

function normalizeConceptOutcomes(
  value: unknown,
): Record<string, GauntletConceptOutcomeEvidence> {
  const outcomes: Record<string, GauntletConceptOutcomeEvidence> = {}
  for (const [outcomeId, candidate] of Object.entries(objectValue<unknown>(value))) {
    if (!outcomeId.trim() || !isObject(candidate) || !isObject(candidate.outcome)) {
      continue
    }
    const occurredAt = validIso(candidate.occurredAt)
    const outcome = candidate.outcome as Partial<QuestionOutcome>
    if (
      candidate.outcomeId !== outcomeId ||
      !occurredAt ||
      typeof outcome.questionId !== 'string' ||
      typeof outcome.concept !== 'string' ||
      typeof outcome.firstTryCorrect !== 'boolean' ||
      !Number.isSafeInteger(outcome.attempts) ||
      Number(outcome.attempts) < 1 ||
      typeof outcome.usedHint !== 'boolean'
    ) {
      continue
    }
    outcomes[outcomeId] = {
      outcomeId,
      occurredAt,
      outcome: outcome as QuestionOutcome,
    }
  }
  return outcomes
}

function normalizeFinalBossDefeats(
  value: unknown,
): Record<string, FinalBossDefeatEvidence> {
  const defeats: Record<string, FinalBossDefeatEvidence> = {}
  for (const [defeatId, candidate] of Object.entries(objectValue<unknown>(value))) {
    if (!defeatId.trim() || !isObject(candidate)) continue
    const defeatedAt = validIso(candidate.defeatedAt)
    if (candidate.defeatId !== defeatId || !defeatedAt) continue
    defeats[defeatId] = { defeatId, defeatedAt }
  }
  return defeats
}

const earliestIso = (
  ...values: readonly (string | undefined)[]
): string | undefined =>
  values
    .filter(
      (value): value is string =>
        !!value && Number.isFinite(Date.parse(value)),
    )
    .sort()[0]

export function mergeGauntletStates(
  leftValue: GauntletState,
  rightValue: GauntletState,
): GauntletState {
  const left = normalizeGauntletState(leftValue)
  const right = normalizeGauntletState(rightValue)
  return projectGauntletState({
    ...emptyGauntletState(),
    revision: Math.max(left.revision, right.revision),
    legacyAttemptCount: Math.max(
      left.legacyAttemptCount,
      right.legacyAttemptCount,
    ),
    legacyBestScore: Math.max(left.legacyBestScore, right.legacyBestScore),
    legacyExamPassed: left.legacyExamPassed || right.legacyExamPassed,
    legacyExamPassedAt: earliestIso(
      left.legacyExamPassedAt,
      right.legacyExamPassedAt,
    ),
    legacyFinalBossBeaten:
      left.legacyFinalBossBeaten || right.legacyFinalBossBeaten,
    legacyFinalBossBeatenAt: earliestIso(
      left.legacyFinalBossBeatenAt,
      right.legacyFinalBossBeatenAt,
    ),
    legacyConcepts: mergeLegacyConceptSeeds(
      left.legacyConcepts,
      right.legacyConcepts,
    ),
    certificationAttempts: mergeEvidenceMaps(
      left.certificationAttempts,
      right.certificationAttempts,
    ),
    conceptOutcomes: mergeEvidenceMaps(
      left.conceptOutcomes,
      right.conceptOutcomes,
    ),
    finalBossDefeats: mergeEvidenceMaps(
      left.finalBossDefeats,
      right.finalBossDefeats,
    ),
    pendingCloudSync: left.pendingCloudSync || right.pendingCloudSync,
  })
}

function mergeEvidenceMaps<T>(
  left: Record<string, T>,
  right: Record<string, T>,
): Record<string, T> {
  const merged = { ...left }
  for (const [id, incoming] of Object.entries(right)) {
    const existing = merged[id]
    if (!existing || JSON.stringify(incoming) > JSON.stringify(existing)) {
      merged[id] = incoming
    }
  }
  return merged
}

function mergeLegacyConceptSeeds(
  left: Record<string, ConceptStat>,
  right: Record<string, ConceptStat>,
): Record<string, ConceptStat> {
  const merged = { ...left }
  for (const [conceptId, incoming] of Object.entries(right)) {
    const existing = merged[conceptId]
    if (
      !existing ||
      incoming.lastSeenAt > existing.lastSeenAt ||
      (incoming.lastSeenAt === existing.lastSeenAt &&
        JSON.stringify(incoming) > JSON.stringify(existing))
    ) {
      merged[conceptId] = incoming
    }
  }
  return merged
}

function projectGauntletState(base: GauntletState): GauntletState {
  const certificationAttempts = Object.values(base.certificationAttempts)
  const passingAttempts = certificationAttempts.filter(
    ({ score, requirementsPassed }) =>
      score >= EXAM_PASS_PERCENT && requirementsPassed,
  )
  let concepts = Object.fromEntries(
    Object.entries(base.legacyConcepts).map(([id, stat]) => [
      id,
      { ...stat },
    ]),
  )
  for (const evidence of Object.values(base.conceptOutcomes).sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      a.outcomeId.localeCompare(b.outcomeId),
  )) {
    concepts = applyConceptOutcomeProjection(
      concepts,
      evidence.outcome,
      Date.parse(evidence.occurredAt),
    )
  }
  const defeatValues = Object.values(base.finalBossDefeats)
  const examPassed = base.legacyExamPassed || passingAttempts.length > 0
  const finalBossBeaten =
    base.legacyFinalBossBeaten || defeatValues.length > 0
  return {
    ...base,
    version: STORAGE_VERSION,
    attempts: base.legacyAttemptCount + certificationAttempts.length,
    bestScore: Math.max(
      base.legacyBestScore,
      ...certificationAttempts.map(({ score }) => score),
      0,
    ),
    examPassed,
    examPassedAt: examPassed
      ? earliestIso(
          base.legacyExamPassedAt,
          ...passingAttempts.map(({ completedAt }) => completedAt),
        )
      : undefined,
    certificationRequirementsPassed: examPassed,
    finalBossBeaten,
    finalBossBeatenAt: finalBossBeaten
      ? earliestIso(
          base.legacyFinalBossBeatenAt,
          ...defeatValues.map(({ defeatedAt }) => defeatedAt),
        )
      : undefined,
    concepts,
    revision: Math.max(
      base.revision,
      certificationAttempts.length +
        Object.keys(base.conceptOutcomes).length +
        defeatValues.length,
    ),
  }
}

export function saveGauntlet(id: string, state: GauntletState): boolean {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function markGauntletCloudSynced(
  state: GauntletState,
): GauntletState {
  return { ...normalizeGauntletState(state), pendingCloudSync: false }
}

function intervalForBox(box: number): number {
  const i = Math.max(0, Math.min(MAX_BOX, box))
  return BOX_INTERVAL_MS[i] ?? BOX_INTERVAL_MS[MAX_BOX]
}

function applyConceptOutcomeProjection(
  concepts: Record<string, ConceptStat>,
  outcome: QuestionOutcome,
  now: number,
): Record<string, ConceptStat> {
  const next = Object.fromEntries(
    Object.entries(concepts).map(([id, stat]) => [id, { ...stat }]),
  )
  const existing = next[outcome.concept]
  const stat: ConceptStat = existing
    ? { ...existing }
    : {
        concept: outcome.concept,
        seen: 0,
        correctFirstTry: 0,
        box: 1,
        streak: 0,
        dueAt: now,
        lastSeenAt: now,
      }
  stat.seen += 1
  stat.lastSeenAt = now
  if (outcome.firstTryCorrect) {
    stat.correctFirstTry += 1
    stat.streak += 1
    stat.box = Math.min(MAX_BOX, stat.box + (outcome.usedHint ? 0 : 1))
  } else {
    stat.streak = 0
    stat.box = 1
  }
  stat.dueAt = now + intervalForBox(stat.box)
  next[outcome.concept] = stat
  return next
}

/**
 * Fold one answered question into the spaced-repetition schedule. Returns the
 * NEXT state (does not persist — caller decides when to save).
 */
export function applyOutcome(
  state: GauntletState,
  outcome: QuestionOutcome,
  now = Date.now(),
  outcomeId = createGauntletEventId('concept'),
): GauntletState {
  const current = normalizeGauntletState(state)
  if (current.conceptOutcomes[outcomeId]) return current
  return projectGauntletState({
    ...current,
    revision: current.revision + 1,
    conceptOutcomes: {
      ...current.conceptOutcomes,
      [outcomeId]: {
        outcomeId,
        occurredAt: new Date(now).toISOString(),
        outcome,
      },
    },
    pendingCloudSync: true,
  })
}

/**
 * Record a completed trial run. `scorePercent` is the headline mastery signal
 * (accuracy over the whole trial). The boss only unlocks when the learner
 * reaches the mastery threshold (EXAM_PASS_PERCENT) in the same attempt that
 * proves every certification requirement. Below that they review and retry. A
 * compliant pass, once earned, is sticky.
 */
export function recordExamCompletion(
  state: GauntletState,
  scorePercent: number,
  requirementsPassed: boolean,
  now = Date.now(),
  attemptId = createGauntletEventId('certification'),
): GauntletState {
  const current = normalizeGauntletState(state)
  if (current.certificationAttempts[attemptId]) return current
  return projectGauntletState({
    ...current,
    revision: current.revision + 1,
    certificationAttempts: {
      ...current.certificationAttempts,
      [attemptId]: {
        attemptId,
        completedAt: new Date(now).toISOString(),
        score: boundedScore(scorePercent),
        requirementsPassed,
      },
    },
    pendingCloudSync: true,
  })
}

export function markBossBeaten(
  state: GauntletState,
  now = Date.now(),
  defeatId = createGauntletEventId('final-boss'),
): GauntletState {
  const current = normalizeGauntletState(state)
  if (current.finalBossDefeats[defeatId]) return current
  return projectGauntletState({
    ...current,
    revision: current.revision + 1,
    finalBossDefeats: {
      ...current.finalBossDefeats,
      [defeatId]: {
        defeatId,
        defeatedAt: new Date(now).toISOString(),
      },
    },
    pendingCloudSync: true,
  })
}

/** A Bronze/Silver/Gold style grade for a first-try percentage. */
export function gradeFor(percent: number): { tier: 'gold' | 'silver' | 'bronze'; label: string } {
  if (percent >= 95) return { tier: 'gold', label: 'Flawless Mastery' }
  if (percent >= EXAM_PASS_PERCENT) return { tier: 'gold', label: 'Gold Mastery' }
  if (percent >= 65) return { tier: 'silver', label: 'Silver Mastery' }
  return { tier: 'bronze', label: 'Bronze — keep training' }
}
