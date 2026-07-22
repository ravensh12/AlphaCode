import {
  LEARNING_PROJECTION_VERSION,
  LEARNING_SCHEMA_VERSION,
  type AttemptEvent,
  type LearningCache,
  type LearningProblemId,
  type LearningSkillId,
  type MasteryProjection,
  type MasteryRecord,
  type ProblemMasteryRecord,
  type SkillMasteryRecord,
} from '../types/learning'
import {
  createFsrsState,
  ratingForAttempt,
  scheduleReview,
} from './fsrsScheduler'

const INITIAL_ABILITY = 0.5
const ABILITY_ALPHA = 0.4
const RECENT_WINDOW = 8
const EPOCH = new Date(0).toISOString()

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, value))

export function emptyMasteryProjection(): MasteryProjection {
  return {
    projectionVersion: LEARNING_PROJECTION_VERSION,
    problemMastery: {},
    skillMastery: {},
    appliedEventIds: [],
    revision: 0,
  }
}

export function emptyLearningCache(identityId: string): LearningCache {
  return {
    ...emptyMasteryProjection(),
    schemaVersion: LEARNING_SCHEMA_VERSION,
    identityId,
    events: [],
    updatedAt: EPOCH,
  }
}

function initialRecord(
  entityKind: 'problem',
  entityId: LearningProblemId,
  at: string,
): ProblemMasteryRecord
function initialRecord(
  entityKind: 'skill',
  entityId: LearningSkillId,
  at: string,
): SkillMasteryRecord
function initialRecord(
  entityKind: 'problem' | 'skill',
  entityId: LearningProblemId | LearningSkillId,
  at: string,
): MasteryRecord {
  const base = {
    submissionCount: 0,
    reviewCount: 0,
    correctCount: 0,
    firstTryCorrectCount: 0,
    ability: INITIAL_ABILITY,
    recentResults: [],
    schedule: createFsrsState(at),
    revision: 0,
    projectionVersion: LEARNING_PROJECTION_VERSION,
  }
  return entityKind === 'problem'
    ? { ...base, entityKind, entityId: entityId as LearningProblemId }
    : { ...base, entityKind, entityId: entityId as LearningSkillId }
}

function applyToRecord(
  previous: MasteryRecord | undefined,
  entityKind: 'problem',
  entityId: LearningProblemId,
  event: AttemptEvent,
): ProblemMasteryRecord
function applyToRecord(
  previous: MasteryRecord | undefined,
  entityKind: 'skill',
  entityId: LearningSkillId,
  event: AttemptEvent,
): SkillMasteryRecord
function applyToRecord(
  previous: MasteryRecord | undefined,
  entityKind: 'problem' | 'skill',
  entityId: LearningProblemId | LearningSkillId,
  event: AttemptEvent,
): MasteryRecord {
  const current =
    previous ??
    (entityKind === 'problem'
      ? initialRecord('problem', entityId as LearningProblemId, event.occurredAt)
      : initialRecord('skill', entityId as LearningSkillId, event.occurredAt))
  const rating = ratingForAttempt(event)

  let ability = current.ability
  let schedule = current.schedule
  let recentResults = current.recentResults
  let reviewCount = current.reviewCount

  if (rating) {
    const evidence =
      rating === 'again'
        ? 0
        : rating === 'hard'
          ? 0.45
          : rating === 'good'
            ? 0.82
            : 1
    ability = clamp01(
      current.ability * (1 - ABILITY_ALPHA) + evidence * ABILITY_ALPHA,
    )
    schedule = scheduleReview(current.schedule, rating, event.occurredAt)
    recentResults = [...current.recentResults, event.isCorrect].slice(
      -RECENT_WINDOW,
    )
    reviewCount += 1
  }

  const base = {
    submissionCount: current.submissionCount + 1,
    reviewCount,
    correctCount: current.correctCount + (event.isCorrect ? 1 : 0),
    firstTryCorrectCount:
      current.firstTryCorrectCount + (event.firstTryCorrect ? 1 : 0),
    ability,
    recentResults,
    schedule,
    lastEventId: event.id,
    lastAttemptAt: event.occurredAt,
    revision: current.revision + 1,
    projectionVersion: LEARNING_PROJECTION_VERSION,
    legacySeed: current.legacySeed,
  }

  return entityKind === 'problem'
    ? {
        ...base,
        entityKind,
        entityId: entityId as LearningProblemId,
      }
    : {
        ...base,
        entityKind,
        entityId: entityId as LearningSkillId,
      }
}

/**
 * Incrementally applies an event that is already in deterministic event order.
 * Re-applying an event id is a strict no-op.
 */
export function applyAttemptEvent(
  projection: MasteryProjection,
  event: AttemptEvent,
): MasteryProjection {
  if (projection.appliedEventIds.includes(event.id)) return projection

  const problemMastery = { ...projection.problemMastery }
  problemMastery[event.problemId] = applyToRecord(
    problemMastery[event.problemId],
    'problem',
    event.problemId,
    event,
  )

  const skillMastery = { ...projection.skillMastery }
  for (const skillId of new Set(event.skillIds)) {
    skillMastery[skillId] = applyToRecord(
      skillMastery[skillId],
      'skill',
      skillId,
      event,
    )
  }

  return {
    projectionVersion: LEARNING_PROJECTION_VERSION,
    problemMastery,
    skillMastery,
    appliedEventIds: [...projection.appliedEventIds, event.id],
    revision: projection.revision + 1,
  }
}

function compareEvents(a: AttemptEvent, b: AttemptEvent): number {
  const time = Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  if (time !== 0) return time
  if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId)
  if (a.deviceSeq !== b.deviceSeq) return a.deviceSeq - b.deviceSeq
  return a.id.localeCompare(b.id)
}

/**
 * The immutable natural key the cloud enforces via
 * `learning_attempt_number_unique (user_id, interaction_id, attempt_number)`.
 */
function attemptNaturalKey(event: AttemptEvent): string {
  return `${event.interactionId}\u0000${event.attemptNumber}`
}

/**
 * When two events share the natural key (a legacy duplicate written before
 * `recordAttempt` enforced the cloud constraint, or a re-emitted attempt) only
 * one may survive. Deterministic "which event wins" rule, evaluated in order:
 *   1. a resolved event beats an unresolved one — a closed interaction is the
 *      strongest evidence and is what earns review/schedule credit;
 *   2. otherwise the later `occurredAt` wins — the most recent record of the
 *      attempt carries the freshest evidence;
 *   3. final tie-break: the lexicographically greater `id`, so the winner is
 *      stable regardless of the order events are supplied in.
 * The rule is a max over a total order, so folding it across duplicates is
 * commutative and associative — the result never depends on input ordering.
 */
export function preferredAttempt(a: AttemptEvent, b: AttemptEvent): AttemptEvent {
  if (a.resolved !== b.resolved) return a.resolved ? a : b
  const aTime = Date.parse(a.occurredAt)
  const bTime = Date.parse(b.occurredAt)
  if (aTime !== bTime) return aTime > bTime ? a : b
  return a.id > b.id ? a : b
}

/** Collapse natural-key duplicates to their single canonical winner. */
export function dedupeByNaturalKey(
  events: readonly AttemptEvent[],
): AttemptEvent[] {
  const byKey = new Map<string, AttemptEvent>()
  for (const event of events) {
    const key = attemptNaturalKey(event)
    const existing = byKey.get(key)
    byKey.set(key, existing ? preferredAttempt(existing, event) : event)
  }
  return [...byKey.values()]
}

export type MasterySeed = {
  readonly problemMastery?: MasteryProjection['problemMastery']
  readonly skillMastery?: MasteryProjection['skillMastery']
}

/** Rebuild from immutable facts so late/offline events have deterministic order. */
export function rebuildMastery(
  events: readonly AttemptEvent[],
  seed: MasterySeed = {},
): MasteryProjection {
  let projection: MasteryProjection = {
    projectionVersion: LEARNING_PROJECTION_VERSION,
    problemMastery: { ...seed.problemMastery },
    skillMastery: { ...seed.skillMastery },
    appliedEventIds: [],
    revision: 0,
  }
  for (const event of [...events].sort(compareEvents)) {
    projection = applyAttemptEvent(projection, event)
  }
  return projection
}

export function rebuildLearningCache(
  identityId: string,
  events: readonly AttemptEvent[],
  seed: MasterySeed = {},
): LearningCache {
  // Heal natural-key duplicates before projecting so a legacy cache that
  // accumulated two events for the same (interactionId, attemptNumber) collapses
  // to one canonical event instead of double-counting mastery. Every canonical
  // cache flows through here (decode, record, cloud merge, rebase), so the heal
  // is applied uniformly.
  const ordered = dedupeByNaturalKey(events).sort(compareEvents)
  const projection = rebuildMastery(ordered, seed)
  return {
    ...projection,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    identityId,
    events: ordered,
    updatedAt: ordered.at(-1)?.occurredAt ?? EPOCH,
  }
}

function dueRecords<T extends MasteryRecord>(
  records: readonly T[],
  at: string | number,
): T[] {
  const atMs = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(atMs)) throw new RangeError(`Invalid due timestamp: ${at}`)
  return records
    .filter(
      (record) =>
        record.reviewCount > 0 && Date.parse(record.schedule.dueAt) <= atMs,
    )
    .sort(
      (a, b) =>
        Date.parse(a.schedule.dueAt) - Date.parse(b.schedule.dueAt) ||
        a.ability - b.ability ||
        a.entityId.localeCompare(b.entityId),
    )
}

export function selectDueProblemIds(
  projection: Pick<MasteryProjection, 'problemMastery'>,
  at: string | number,
  limit = Number.POSITIVE_INFINITY,
): LearningProblemId[] {
  return dueRecords(
    Object.values(projection.problemMastery).filter(
      (record): record is ProblemMasteryRecord => !!record,
    ),
    at,
  )
    .slice(0, Math.max(0, limit))
    .map((record) => record.entityId)
}

function weakRecords<T extends MasteryRecord>(
  records: readonly T[],
  limit: number,
): T[] {
  return records
    .filter((record) => record.reviewCount > 0)
    .sort(
      (a, b) =>
        a.ability - b.ability ||
        b.schedule.lapses - a.schedule.lapses ||
        (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? '') ||
        a.entityId.localeCompare(b.entityId),
    )
    .slice(0, Math.max(0, limit))
}

export function selectWeakSkillIds(
  projection: Pick<MasteryProjection, 'skillMastery'>,
  limit = 5,
): LearningSkillId[] {
  return weakRecords(
    Object.values(projection.skillMastery).filter(
      (record): record is SkillMasteryRecord => !!record,
    ),
    limit,
  ).map((record) => record.entityId)
}

