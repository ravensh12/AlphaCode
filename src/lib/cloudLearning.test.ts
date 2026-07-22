import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { AttemptEvent } from '../types/learning'
import {
  CloudLearningAdapter,
  isLearningMigrationMissingError,
} from './cloudLearning'

type FakeResult = { data: unknown; error: unknown }

type FakeOptions = {
  events?: FakeResult
  eventPages?: FakeResult[]
  watermark?: FakeResult
  mastery?: FakeResult
  rpc?: FakeResult
}

function query(
  table: string,
  options: FakeOptions,
  nextEventPage: () => FakeResult,
) {
  let selected = ''
  const builder = {
    select: (columns: string) => {
      selected = columns
      return builder
    },
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    lte: () => builder,
    or: () => builder,
    maybeSingle: () =>
      Promise.resolve(
        options.watermark ??
          options.events ?? { data: null, error: null },
      ),
    upsert: () =>
      Promise.resolve(options.events ?? { data: null, error: null }),
    then: (
      fulfilled?: ((value: FakeResult) => unknown) | null,
      rejected?: ((reason: unknown) => unknown) | null,
    ) => {
      const result =
        table === 'learning_attempt_events'
          ? selected === 'received_at, id'
            ? (options.watermark ??
              options.events ?? { data: null, error: null })
            : nextEventPage()
          : (options.mastery ?? { data: [], error: null })
      return Promise.resolve(result).then(fulfilled, rejected)
    },
  }
  return builder
}

function fakeClient(options: FakeOptions): SupabaseClient {
  let eventPage = 0
  const nextEventPage = () =>
    options.eventPages?.[eventPage++] ??
    options.events ?? { data: [], error: null }
  const from = vi.fn((table: string) =>
    query(table, options, nextEventPage),
  )
  const rpc = vi.fn(() =>
    Promise.resolve(options.rpc ?? { data: 1, error: null }),
  )
  return { from, rpc } as unknown as SupabaseClient
}

function eventRow(
  id: string,
  deviceSeq: number,
  occurredAt: string,
  receivedAt: string,
) {
  return {
    id,
    interaction_id: `interaction-${id}`,
    session_id: 'session-1',
    device_id: 'device-1',
    device_seq: deviceSeq,
    schema_version: 1,
    source: 'lesson-quiz',
    problem_id: 'problem:two-sum',
    skill_ids: ['skill:frequency-map'],
    lesson_id: null,
    step_id: null,
    frame_index: null,
    attempt_number: 1,
    is_correct: true,
    resolved: true,
    first_try_correct: true,
    used_hint: false,
    revealed: false,
    response_ms: 2000,
    submitted_answer: 2,
    expected_answer: 2,
    metadata: null,
    occurred_at: occurredAt,
    received_at: receivedAt,
  }
}

function event(id: string): AttemptEvent {
  return {
    schemaVersion: 1,
    id,
    interactionId: `interaction-${id}`,
    sessionId: 'session-1',
    deviceId: 'device-1',
    deviceSeq: 1,
    source: 'lesson-quiz',
    problemId: 'problem:two-sum',
    skillIds: [],
    attemptNumber: 1,
    isCorrect: true,
    resolved: true,
    firstTryCorrect: true,
    usedHint: false,
    revealed: false,
    occurredAt: '2026-07-11T12:00:00.000Z',
  }
}

describe('CloudLearningAdapter', () => {
  it('degrades explicitly when the migration is absent', async () => {
    const adapter = new CloudLearningAdapter(
      fakeClient({
        events: {
          data: null,
          error: { code: '42P01', message: 'relation does not exist' },
        },
      }),
    )
    await expect(adapter.load('user-1')).resolves.toEqual({
      status: 'unavailable',
      reason: 'migration-missing',
      events: [],
      mastery: [],
    })
  })

  it('throws resolved network/RLS errors instead of treating them as success', async () => {
    const error = { code: '42501', message: 'row-level security violation' }
    const adapter = new CloudLearningAdapter(
      fakeClient({ events: { data: null, error } }),
    )
    await expect(adapter.load('user-1')).rejects.toBe(error)
    await expect(
      adapter.insertEvents('user-1', [
        {
          schemaVersion: 1,
          id: 'event-1',
          interactionId: 'interaction-1',
          sessionId: 'session-1',
          deviceId: 'device-1',
          deviceSeq: 1,
          source: 'lesson-quiz',
          problemId: 'problem:two-sum',
          skillIds: [],
          attemptNumber: 1,
          isCorrect: true,
          resolved: true,
          firstTryCorrect: true,
          usedHint: false,
          revealed: false,
          occurredAt: '2026-07-11T12:00:00.000Z',
        },
      ]),
    ).rejects.toBe(error)
  })

  it('drains a natural-key collision row-by-row instead of wedging the outbox', async () => {
    // Regression for the observed 23505 loop: a batch that collides on
    // `learning_attempt_number_unique` aborts the whole statement. The adapter
    // must retry row-by-row and treat each per-row unique violation as an
    // already-recorded fact so the outbox drains and later writes succeed.
    const uniqueViolation = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "learning_attempt_number_unique"',
    }
    const upsertCalls: number[] = []
    let firstBatch = true
    const client = {
      from: () => ({
        upsert: (rows: unknown[]) => {
          upsertCalls.push(rows.length)
          if (firstBatch && rows.length > 1) {
            firstBatch = false
            return Promise.resolve({ data: null, error: uniqueViolation })
          }
          // Per-row retry: the second (colliding) row still violates the
          // natural key; every other row inserts cleanly.
          const row = rows[0] as { id: string }
          return Promise.resolve(
            row.id === 'event-collide'
              ? { data: null, error: uniqueViolation }
              : { data: null, error: null },
          )
        },
      }),
    } as unknown as SupabaseClient
    const adapter = new CloudLearningAdapter(client)

    await expect(
      adapter.insertEvents('user-1', [
        event('event-a'),
        event('event-collide'),
        event('event-b'),
      ]),
    ).resolves.toEqual({ status: 'ok' })
    // One failed batch (3 rows) then three single-row retries.
    expect(upsertCalls).toEqual([3, 1, 1, 1])
  })

  it('surfaces a non-duplicate error discovered during the row-by-row retry', async () => {
    const uniqueViolation = { code: '23505', message: 'duplicate key' }
    const rlsError = { code: '42501', message: 'row-level security violation' }
    let firstBatch = true
    const client = {
      from: () => ({
        upsert: (rows: unknown[]) => {
          if (firstBatch && rows.length > 1) {
            firstBatch = false
            return Promise.resolve({ data: null, error: uniqueViolation })
          }
          const row = rows[0] as { id: string }
          return Promise.resolve(
            row.id === 'event-rls'
              ? { data: null, error: rlsError }
              : { data: null, error: null },
          )
        },
      }),
    } as unknown as SupabaseClient
    const adapter = new CloudLearningAdapter(client)

    await expect(
      adapter.insertEvents('user-1', [event('event-a'), event('event-rls')]),
    ).rejects.toBe(rlsError)
  })

  it('checks and throws mastery RPC errors', async () => {
    const error = { code: '57014', message: 'statement timeout' }
    const adapter = new CloudLearningAdapter(
      fakeClient({ rpc: { data: null, error } }),
    )
    await expect(
      adapter.upsertMastery([
        {
          entityKind: 'problem',
          entityId: 'problem:two-sum',
          submissionCount: 1,
          reviewCount: 1,
          correctCount: 1,
          firstTryCorrectCount: 1,
          ability: 0.7,
          recentResults: [true],
          schedule: {
            schedulerVersion: 1,
            phase: 'review',
            stabilityDays: 1,
            difficulty: 5,
            dueAt: '2026-07-12T12:00:00.000Z',
            lastReviewAt: '2026-07-11T12:00:00.000Z',
            reps: 1,
            lapses: 0,
          },
          lastEventId: 'event-1',
          lastAttemptAt: '2026-07-11T12:00:00.000Z',
          revision: 1,
          projectionVersion: 1,
        },
      ]),
    ).rejects.toBe(error)
  })

  it('maps supported cloud event rows without replacing their timestamps', async () => {
    const adapter = new CloudLearningAdapter(
      fakeClient({
        watermark: {
          error: null,
          data: {
            id: 'event-1',
            received_at: '2026-07-01T01:02:04.000Z',
          },
        },
        events: {
          error: null,
          data: [
            {
              id: 'event-1',
              interaction_id: 'interaction-1',
              session_id: 'session-1',
              device_id: 'device-1',
              device_seq: 4,
              schema_version: 1,
              source: 'lesson-quiz',
              problem_id: 'problem:two-sum',
              skill_ids: ['skill:frequency-map'],
              lesson_id: null,
              step_id: null,
              frame_index: null,
              attempt_number: 1,
              is_correct: true,
              resolved: true,
              first_try_correct: true,
              used_hint: false,
              revealed: false,
              response_ms: 2000,
              submitted_answer: 2,
              expected_answer: 2,
              metadata: null,
              occurred_at: '2026-07-01T01:02:03.000Z',
              received_at: '2026-07-01T01:02:04.000Z',
            },
          ],
        },
      }),
    )
    const result = await adapter.load('user-1')
    expect(result.status).toBe('ok')
    expect(result.events[0].occurredAt).toBe('2026-07-01T01:02:03.000Z')
  })

  it('paginates immutable events through a fixed receive watermark', async () => {
    const rows = [
      eventRow(
        'event-1',
        1,
        '2026-07-01T01:00:00.000Z',
        '2026-07-11T12:00:00.000Z',
      ),
      eventRow(
        'event-2',
        2,
        '2026-07-01T01:01:00.000Z',
        '2026-07-11T12:01:00.000Z',
      ),
      eventRow(
        'event-3',
        3,
        '2026-07-01T01:02:00.000Z',
        '2026-07-11T12:02:00.000Z',
      ),
    ]
    const adapter = new CloudLearningAdapter(
      fakeClient({
        watermark: {
          data: {
            id: 'event-3',
            received_at: '2026-07-11T12:02:00.000Z',
          },
          error: null,
        },
        eventPages: [
          { data: rows.slice(0, 2), error: null },
          { data: rows.slice(2), error: null },
        ],
      }),
      2,
    )

    const result = await adapter.load('user-1')
    expect(result.status).toBe('ok')
    expect(result.events.map(({ id }) => id)).toEqual([
      'event-1',
      'event-2',
      'event-3',
    ])
    expect(result.status === 'ok' ? result.watermark : null).toEqual({
      id: 'event-3',
      receivedAt: '2026-07-11T12:02:00.000Z',
    })
  })
})

describe('isLearningMigrationMissingError', () => {
  it('does not hide unrelated authorization or network errors', () => {
    expect(isLearningMigrationMissingError({ code: '42P01' })).toBe(true)
    expect(
      isLearningMigrationMissingError({
        code: 'PGRST204',
        message: 'learning_mastery column missing',
      }),
    ).toBe(true)
    expect(
      isLearningMigrationMissingError({
        code: '42501',
        message: 'permission denied',
      }),
    ).toBe(false)
  })
})
