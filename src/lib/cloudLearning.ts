import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import {
  FSRS_SCHEDULER_VERSION,
  LEARNING_PROJECTION_VERSION,
  LEARNING_SCHEMA_VERSION,
  type AttemptEvent,
  type JsonValue,
  type LearningCache,
  type LearningProblemId,
  type LearningSkillId,
  type MasteryRecord,
  type ProblemMasteryRecord,
  type SkillMasteryRecord,
} from '../types/learning'
import {
  rebuildLearningCache,
  type MasterySeed,
} from './masteryProjection'

const EVENT_COLUMNS =
  'id, interaction_id, session_id, device_id, device_seq, schema_version, source, problem_id, skill_ids, lesson_id, step_id, frame_index, attempt_number, is_correct, resolved, first_try_correct, used_hint, revealed, response_ms, submitted_answer, expected_answer, metadata, occurred_at, received_at'

const MASTERY_COLUMNS =
  'entity_kind, entity_id, submission_count, review_count, correct_count, first_try_correct_count, ability, recent_results, scheduler_version, fsrs_phase, stability_days, difficulty, due_at, last_review_at, reps, lapses, last_event_id, last_attempt_at, revision, projection_version, legacy_seed'

type CloudUnavailableReason = 'not-configured' | 'migration-missing'

export type CloudLearningWatermark = {
  readonly receivedAt: string
  readonly id: string
}

export type CloudLearningLoadResult =
  | {
      readonly status: 'ok'
      readonly events: readonly AttemptEvent[]
      readonly mastery: readonly MasteryRecord[]
      readonly watermark: CloudLearningWatermark | null
    }
  | {
      readonly status: 'unavailable'
      readonly reason: CloudUnavailableReason
      readonly events: readonly AttemptEvent[]
      readonly mastery: readonly MasteryRecord[]
    }

export type CloudLearningRebaseResult = CloudLearningLoadResult

export type CloudLearningWriteResult =
  | { readonly status: 'ok' }
  | { readonly status: 'unavailable'; readonly reason: CloudUnavailableReason }

type EventRow = {
  id: string
  interaction_id: string
  session_id: string
  device_id: string
  device_seq: number | string
  schema_version: number
  source: AttemptEvent['source']
  problem_id: LearningProblemId
  skill_ids: LearningSkillId[]
  lesson_id: string | null
  step_id: string | null
  frame_index: number | null
  attempt_number: number
  is_correct: boolean
  resolved: boolean
  first_try_correct: boolean
  used_hint: boolean
  revealed: boolean
  response_ms: number | null
  submitted_answer: JsonValue | null
  expected_answer: JsonValue | null
  metadata: Readonly<Record<string, JsonValue>> | null
  occurred_at: string
  received_at: string
}

type MasteryRow = {
  entity_kind: 'problem' | 'skill'
  entity_id: LearningProblemId | LearningSkillId
  submission_count: number
  review_count: number
  correct_count: number
  first_try_correct_count: number
  ability: number
  recent_results: boolean[]
  scheduler_version: number
  fsrs_phase: MasteryRecord['schedule']['phase']
  stability_days: number
  difficulty: number
  due_at: string
  last_review_at: string | null
  reps: number
  lapses: number
  last_event_id: string | null
  last_attempt_at: string | null
  revision: number | string
  projection_version: number
  legacy_seed: JsonValue | null
}

const errorText = (error: unknown): string => {
  if (!error || typeof error !== 'object') return String(error)
  const candidate = error as {
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  return [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

/**
 * Only schema-absence errors degrade to local-only mode. Network, auth and RLS
 * failures are thrown so callers never acknowledge a sync that did not happen.
 */
export function isLearningMigrationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true
  if (['42703', 'PGRST204'].includes(code)) {
    const message = errorText(error)
    return (
      message.includes('learning_attempt_events') ||
      message.includes('learning_mastery') ||
      message.includes('upsert_learning_mastery')
    )
  }
  return false
}

export function isLearningMasteryConflictError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    String((error as { code?: unknown }).code ?? '') === '40001'
  )
}

/**
 * A Postgres unique violation (e.g. `learning_attempt_number_unique` or the
 * one-resolution index). For immutable attempt events this means the fact is
 * already recorded under its natural key, so re-inserting it is a no-op.
 */
export function isUniqueViolationError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    String((error as { code?: unknown }).code ?? '') === '23505'
  )
}

function finiteNumber(value: number | string, label: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) {
    throw new Error(`Invalid ${label} returned by Supabase`)
  }
  return result
}

function cloudTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} returned by Supabase`)
  }
  return new Date(parsed).toISOString()
}

function cloudCursorTimestamp(value: string, label: string): string {
  cloudTimestamp(value, label)
  return value
}

function eventFromRow(row: EventRow): AttemptEvent {
  if (row.schema_version !== LEARNING_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported cloud learning event version ${row.schema_version}`,
    )
  }
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: row.id,
    interactionId: row.interaction_id,
    sessionId: row.session_id,
    deviceId: row.device_id,
    deviceSeq: finiteNumber(row.device_seq, 'device sequence'),
    source: row.source,
    problemId: row.problem_id,
    skillIds: row.skill_ids ?? [],
    lessonId: row.lesson_id ?? undefined,
    stepId: row.step_id ?? undefined,
    frameIndex: row.frame_index ?? undefined,
    attemptNumber: row.attempt_number,
    isCorrect: row.is_correct,
    resolved: row.resolved,
    firstTryCorrect: row.first_try_correct,
    usedHint: row.used_hint,
    revealed: row.revealed,
    responseMs: row.response_ms ?? undefined,
    submittedAnswer: row.submitted_answer ?? undefined,
    expectedAnswer: row.expected_answer ?? undefined,
    metadata: row.metadata ?? undefined,
    occurredAt: cloudTimestamp(row.occurred_at, 'event timestamp'),
  }
}

function masteryFromRow(row: MasteryRow): MasteryRecord {
  if (
    row.scheduler_version !== FSRS_SCHEDULER_VERSION ||
    row.projection_version !== LEARNING_PROJECTION_VERSION
  ) {
    throw new Error(
      `Unsupported cloud mastery version ${row.scheduler_version}/${row.projection_version}`,
    )
  }
  const base = {
    submissionCount: row.submission_count,
    reviewCount: row.review_count,
    correctCount: row.correct_count,
    firstTryCorrectCount: row.first_try_correct_count,
    ability: row.ability,
    recentResults: row.recent_results ?? [],
    schedule: {
      schedulerVersion: FSRS_SCHEDULER_VERSION,
      phase: row.fsrs_phase,
      stabilityDays: row.stability_days,
      difficulty: row.difficulty,
      dueAt: cloudTimestamp(row.due_at, 'mastery due timestamp'),
      lastReviewAt:
        row.last_review_at == null
          ? undefined
          : cloudTimestamp(row.last_review_at, 'mastery review timestamp'),
      reps: row.reps,
      lapses: row.lapses,
    },
    lastEventId: row.last_event_id ?? undefined,
    lastAttemptAt:
      row.last_attempt_at == null
        ? undefined
        : cloudTimestamp(row.last_attempt_at, 'mastery attempt timestamp'),
    revision: finiteNumber(row.revision, 'mastery revision'),
    projectionVersion: LEARNING_PROJECTION_VERSION,
    legacySeed: row.legacy_seed ?? undefined,
  }
  return row.entity_kind === 'problem'
    ? ({
        ...base,
        entityKind: 'problem',
        entityId: row.entity_id as LearningProblemId,
      } satisfies ProblemMasteryRecord)
    : ({
        ...base,
        entityKind: 'skill',
        entityId: row.entity_id as LearningSkillId,
      } satisfies SkillMasteryRecord)
}

const eventToRow = (userId: string, event: AttemptEvent) => ({
  id: event.id,
  user_id: userId,
  interaction_id: event.interactionId,
  session_id: event.sessionId,
  device_id: event.deviceId,
  device_seq: event.deviceSeq,
  schema_version: event.schemaVersion,
  source: event.source,
  problem_id: event.problemId,
  skill_ids: event.skillIds,
  lesson_id: event.lessonId ?? null,
  step_id: event.stepId ?? null,
  frame_index: event.frameIndex ?? null,
  attempt_number: event.attemptNumber,
  is_correct: event.isCorrect,
  resolved: event.resolved,
  first_try_correct: event.firstTryCorrect,
  used_hint: event.usedHint,
  revealed: event.revealed,
  response_ms: event.responseMs ?? null,
  submitted_answer: event.submittedAnswer ?? null,
  expected_answer: event.expectedAnswer ?? null,
  metadata: event.metadata ?? null,
  occurred_at: event.occurredAt,
})

const masteryToRpcRow = (record: MasteryRecord) => ({
  entity_kind: record.entityKind,
  entity_id: record.entityId,
  submission_count: record.submissionCount,
  review_count: record.reviewCount,
  correct_count: record.correctCount,
  first_try_correct_count: record.firstTryCorrectCount,
  ability: record.ability,
  recent_results: record.recentResults,
  scheduler_version: record.schedule.schedulerVersion,
  fsrs_phase: record.schedule.phase,
  stability_days: record.schedule.stabilityDays,
  difficulty: record.schedule.difficulty,
  due_at: record.schedule.dueAt,
  last_review_at: record.schedule.lastReviewAt ?? null,
  reps: record.schedule.reps,
  lapses: record.schedule.lapses,
  last_event_id: record.lastEventId ?? null,
  last_attempt_at: record.lastAttemptAt ?? null,
  revision: record.revision,
  projection_version: record.projectionVersion,
  legacy_seed: record.legacySeed ?? null,
})

type EventWatermarkRow = {
  id: string
  received_at: string
}

const postgrestFilterValue = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

function legacyMasterySeed(records: readonly MasteryRecord[]): MasterySeed {
  const problemMastery = Object.fromEntries(
    records
      .filter(
        (record): record is ProblemMasteryRecord =>
          record.entityKind === 'problem' &&
          record.revision === 0 &&
          !record.lastEventId &&
          record.legacySeed !== undefined,
      )
      .map((record) => [record.entityId, record]),
  ) as MasterySeed['problemMastery']
  const skillMastery = Object.fromEntries(
    records
      .filter(
        (record): record is SkillMasteryRecord =>
          record.entityKind === 'skill' &&
          record.revision === 0 &&
          !record.lastEventId &&
          record.legacySeed !== undefined,
      )
      .map((record) => [record.entityId, record]),
  ) as MasterySeed['skillMastery']
  return { problemMastery, skillMastery }
}

function masteryRecords(cache: LearningCache): MasteryRecord[] {
  return [
    ...Object.values(cache.problemMastery),
    ...Object.values(cache.skillMastery),
  ].filter((record): record is MasteryRecord => !!record)
}

export class CloudLearningAdapter {
  private readonly pageSize: number

  constructor(
    private readonly client: SupabaseClient | null = supabase,
    pageSize = 500,
  ) {
    this.pageSize = Math.min(1_000, Math.max(1, Math.floor(pageSize)))
  }

  async load(userId: string): Promise<CloudLearningLoadResult> {
    if (!this.client) {
      return {
        status: 'unavailable',
        reason: 'not-configured',
        events: [],
        mastery: [],
      }
    }

    const watermarkResult = await this.client
      .from('learning_attempt_events')
      .select('received_at, id')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (watermarkResult.error) {
      if (isLearningMigrationMissingError(watermarkResult.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          events: [],
          mastery: [],
        }
      }
      throw watermarkResult.error
    }
    const watermarkRow =
      watermarkResult.data as unknown as EventWatermarkRow | null
    const watermark: CloudLearningWatermark | null = watermarkRow
      ? {
          id: watermarkRow.id,
          receivedAt: cloudCursorTimestamp(
            watermarkRow.received_at,
            'event receive watermark',
          ),
        }
      : null

    const eventRows: EventRow[] = []
    let cursor: CloudLearningWatermark | null = null
    let reachedWatermark = watermark === null
    while (watermark) {
      let query = this.client
        .from('learning_attempt_events')
        .select(EVENT_COLUMNS)
        .eq('user_id', userId)
        .lte('received_at', watermark.receivedAt)
        .order('received_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(this.pageSize)
      if (cursor) {
        const receivedAt = postgrestFilterValue(cursor.receivedAt)
        const id = postgrestFilterValue(cursor.id)
        query = query.or(
          `received_at.gt.${receivedAt},and(received_at.eq.${receivedAt},id.gt.${id})`,
        )
      }
      const pageResult = await query
      if (pageResult.error) {
        if (isLearningMigrationMissingError(pageResult.error)) {
          return {
            status: 'unavailable',
            reason: 'migration-missing',
            events: [],
            mastery: [],
          }
        }
        throw pageResult.error
      }

      const pageRows = (pageResult.data ?? []) as unknown as EventRow[]
      if (pageRows.length === 0) {
        throw new Error(
          'Cloud learning event history ended before its fixed watermark',
        )
      }
      for (const row of pageRows) {
        eventRows.push(row)
        if (
          row.received_at === watermark.receivedAt &&
          row.id === watermark.id
        ) {
          reachedWatermark = true
          break
        }
      }
      const last = eventRows.at(-1)
      if (reachedWatermark) break
      if (!last) {
        throw new Error(
          'Cloud learning event history skipped its fixed watermark',
        )
      }
      const nextCursor = {
        id: last.id,
        receivedAt: cloudCursorTimestamp(
          last.received_at,
          'event receive cursor',
        ),
      }
      if (
        cursor &&
        cursor.id === nextCursor.id &&
        cursor.receivedAt === nextCursor.receivedAt
      ) {
        throw new Error('Cloud learning event pagination did not advance')
      }
      cursor = nextCursor
    }
    if (!reachedWatermark) {
      throw new Error('Cloud learning event watermark was not reached')
    }
    const eventById = new Map<string, AttemptEvent>()
    for (const row of eventRows) {
      const event = eventFromRow(row)
      if (!eventById.has(event.id)) eventById.set(event.id, event)
    }
    const events = [...eventById.values()]

    const masteryResult = await this.client
      .from('learning_mastery')
      .select(MASTERY_COLUMNS)
      .eq('user_id', userId)
    if (masteryResult.error) {
      if (isLearningMigrationMissingError(masteryResult.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          events,
          mastery: [],
        }
      }
      throw masteryResult.error
    }

    return {
      status: 'ok',
      events,
      mastery: (
        (masteryResult.data ?? []) as unknown as MasteryRow[]
      ).map(masteryFromRow),
      watermark,
    }
  }

  async rebase(
    userId: string,
    localEvents: readonly AttemptEvent[],
  ): Promise<CloudLearningRebaseResult> {
    const cloud = await this.load(userId)
    if (cloud.status !== 'ok') return cloud

    const eventById = new Map(
      cloud.events.map((event) => [event.id, event] as const),
    )
    for (const event of localEvents) eventById.set(event.id, event)
    const cache = rebuildLearningCache(
      userId,
      [...eventById.values()],
      legacyMasterySeed(cloud.mastery),
    )
    return {
      status: 'ok',
      events: cache.events,
      mastery: masteryRecords(cache),
      watermark: cloud.watermark,
    }
  }

  async insertEvents(
    userId: string,
    events: readonly AttemptEvent[],
  ): Promise<CloudLearningWriteResult> {
    if (!this.client) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    if (events.length === 0) return { status: 'ok' }
    const client = this.client
    const result = await client.from('learning_attempt_events').upsert(
      events.map((event) => eventToRow(userId, event)),
      { onConflict: 'id', ignoreDuplicates: true },
    )
    if (result.error) {
      if (isLearningMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      // A duplicate-id upsert is ignored, but a batch that also collides on the
      // `learning_attempt_number_unique (user_id, interaction_id,
      // attempt_number)` natural key (or the one-resolution index) aborts the
      // whole statement. Left unhandled that wedges the outbox: every future
      // sync re-sends the same batch and fails again with 23505. Immutable
      // events mean such a collision is a genuine replay of a fact already
      // stored, so fall back to inserting row-by-row and treat any per-row
      // unique violation as already-persisted. Local state (the durable record)
      // is untouched, so nothing is lost or double-counted.
      if (isUniqueViolationError(result.error)) {
        for (const event of events) {
          const single = await client
            .from('learning_attempt_events')
            .upsert([eventToRow(userId, event)], {
              onConflict: 'id',
              ignoreDuplicates: true,
            })
          if (!single.error) continue
          if (isLearningMigrationMissingError(single.error)) {
            return { status: 'unavailable', reason: 'migration-missing' }
          }
          // Skip only the colliding fact; surface every other failure so a
          // caller never acknowledges a sync that did not happen.
          if (!isUniqueViolationError(single.error)) throw single.error
        }
        return { status: 'ok' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }

  async upsertMastery(
    records: readonly MasteryRecord[],
  ): Promise<CloudLearningWriteResult> {
    if (!this.client) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    if (records.length === 0) return { status: 'ok' }
    const result = await this.client.rpc('upsert_learning_mastery', {
      p_records: records.map(masteryToRpcRow),
    })
    if (result.error) {
      if (isLearningMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }

  async sync(
    userId: string,
    events: readonly AttemptEvent[],
    records: readonly MasteryRecord[],
  ): Promise<CloudLearningWriteResult> {
    const eventResult = await this.insertEvents(userId, events)
    if (eventResult.status !== 'ok') return eventResult
    return this.upsertMastery(records)
  }
}

const defaultAdapter = new CloudLearningAdapter()

export const loadCloudLearning = (userId: string) =>
  defaultAdapter.load(userId)

export const rebaseCloudLearning = (
  userId: string,
  localEvents: readonly AttemptEvent[],
) => defaultAdapter.rebase(userId, localEvents)

export const syncLearningCloud = (
  userId: string,
  events: readonly AttemptEvent[],
  records: readonly MasteryRecord[],
) => defaultAdapter.sync(userId, events, records)

