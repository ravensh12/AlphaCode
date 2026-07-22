import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { LearningAttemptInput } from '../types/learning'
import {
  learningStorageKey,
  LocalLearningStore,
  type StorageLike,
} from './localLearning'

class TestStorage implements StorageLike {
  readonly values = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded')
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const input = (
  id: string,
  overrides: Partial<LearningAttemptInput> = {},
): LearningAttemptInput => ({
  id,
  interactionId: `interaction-${id}`,
  sessionId: 'session-1',
  source: 'lesson-quiz',
  problemId: 'problem:two-sum',
  skillIds: ['skill:frequency-map'],
  isCorrect: true,
  resolved: true,
  firstTryCorrect: true,
  responseMs: 3000,
  occurredAt: '2026-07-11T12:00:00.000Z',
  ...overrides,
})

describe('LocalLearningStore', () => {
  it('never records a hinted answer as first-try evidence', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    const { event } = await store.recordAttempt(
      'hinted-learner',
      input('hinted', {
        firstTryCorrect: undefined,
        usedHint: true,
      }),
    )

    expect(event).toMatchObject({
      isCorrect: true,
      usedHint: true,
      firstTryCorrect: false,
    })
  })

  it('keeps retry interactions stable and rounds response time durably', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt(
      'retry-learner',
      input('retry-wrong', {
        interactionId: 'interaction:stable',
        attemptNumber: 1,
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
        responseMs: 1499.6,
      }),
    )
    await store.recordAttempt(
      'retry-learner',
      input('retry-correct', {
        interactionId: 'interaction:stable',
        attemptNumber: 2,
        firstTryCorrect: false,
        responseMs: 2000.4,
        occurredAt: '2026-07-11T12:01:00.000Z',
      }),
    )

    const state = await store.load('retry-learner')
    expect(
      state.cache.events.map(
        ({ interactionId, attemptNumber, resolved, responseMs }) => ({
          interactionId,
          attemptNumber,
          resolved,
          responseMs,
        }),
      ),
    ).toEqual([
      {
        interactionId: 'interaction:stable',
        attemptNumber: 1,
        resolved: false,
        responseMs: 1500,
      },
      {
        interactionId: 'interaction:stable',
        attemptNumber: 2,
        resolved: true,
        responseMs: 2000,
      },
    ])
    expect(
      state.cache.problemMastery['problem:two-sum']?.reviewCount,
    ).toBe(1)
  })

  it('isolates identities and atomically queues local-first events', async () => {
    const storage = new TestStorage()
    const store = new LocalLearningStore({ storage })

    await store.recordAttempt('alice', input('event-a'))
    await store.recordAttempt('bob', input('event-b'))

    const alice = await store.load('alice')
    const bob = await store.load('bob')
    expect(alice.cache.events.map((event) => event.id)).toEqual(['event-a'])
    expect(bob.cache.events.map((event) => event.id)).toEqual(['event-b'])
    expect(alice.outbox.items).toHaveLength(1)
    expect(bob.outbox.items).toHaveLength(1)
    expect(storage.values.has(learningStorageKey('alice'))).toBe(true)
    expect(storage.values.has(learningStorageKey('bob'))).toBe(true)
  })

  it('serializes concurrent stores and allocates a device sequence per tab', async () => {
    const storage = new TestStorage()
    const firstTab = new LocalLearningStore({
      storage,
      deviceId: 'tab-a',
      lockManager: null,
    })
    const secondTab = new LocalLearningStore({
      storage,
      deviceId: 'tab-b',
      lockManager: null,
    })

    await Promise.all([
      firstTab.recordAttempt('shared-user', input('event-a')),
      secondTab.recordAttempt(
        'shared-user',
        input('event-b', {
          occurredAt: '2026-07-11T12:01:00.000Z',
        }),
      ),
    ])

    const state = await firstTab.load('shared-user')
    expect(state.cache.events.map(({ id }) => id).sort()).toEqual([
      'event-a',
      'event-b',
    ])
    expect(
      state.cache.events
        .map(({ deviceId, deviceSeq }) => [deviceId, deviceSeq])
        .sort(),
    ).toEqual([
      ['tab-a', 1],
      ['tab-b', 1],
    ])
    expect(state.outbox.items).toHaveLength(2)
  })

  it('keeps concurrent IndexedDB updates in one atomic transaction', async () => {
    const indexedDB = new IDBFactory()
    const fallback = new TestStorage()
    const firstTab = new LocalLearningStore({
      storage: fallback,
      indexedDB,
      preferIndexedDB: true,
      deviceId: 'idb-tab-a',
      lockManager: null,
    })
    const secondTab = new LocalLearningStore({
      storage: fallback,
      indexedDB,
      preferIndexedDB: true,
      deviceId: 'idb-tab-b',
      lockManager: null,
    })

    await Promise.all([
      firstTab.recordAttempt('idb-user', input('idb-event-a')),
      secondTab.recordAttempt(
        'idb-user',
        input('idb-event-b', {
          occurredAt: '2026-07-11T12:01:00.000Z',
        }),
      ),
    ])

    const state = await secondTab.load('idb-user')
    expect(state.cache.events.map(({ id }) => id).sort()).toEqual([
      'idb-event-a',
      'idb-event-b',
    ])
    expect(state.outbox.items).toHaveLength(2)
  })

  it('does not duplicate an already-recorded immutable event', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('alice', input('event-a'))
    await store.recordAttempt('alice', input('event-a'))
    const state = await store.load('alice')
    expect(state.cache.events).toHaveLength(1)
    expect(state.outbox.items).toHaveLength(1)
  })

  it('lets a resolved re-emission supersede an unresolved natural-key duplicate', async () => {
    // Regression: the cloud enforces `learning_attempt_number_unique (user_id,
    // interaction_id, attempt_number)`, so two local events with the same
    // natural key would collide (23505) and double-count the attempt. When the
    // second event RESOLVES an interaction the first left unresolved, the
    // "resolved wins" rule keeps the resolved event so the interaction actually
    // gets closed rather than being silently dropped.
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt(
      'alice',
      input('miss-1', {
        interactionId: 'interaction:collide',
        attemptNumber: 1,
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
      }),
    )
    // Different event id, same (interactionId, attemptNumber) natural key, but
    // this one resolves the interaction.
    const replay = await store.recordAttempt(
      'alice',
      input('skip-1', {
        interactionId: 'interaction:collide',
        attemptNumber: 1,
        isCorrect: true,
        resolved: true,
        firstTryCorrect: true,
      }),
    )

    expect(replay.event.id).toBe('skip-1')
    const state = await store.load('alice')
    // The pair collapses to the single resolved winner — counted exactly once.
    expect(state.cache.events).toHaveLength(1)
    expect(state.cache.events[0].id).toBe('skip-1')
    expect(state.cache.events[0].resolved).toBe(true)
    const naturalKeys = state.cache.events.map(
      (event) => `${event.interactionId}#${event.attemptNumber}`,
    )
    expect(new Set(naturalKeys).size).toBe(naturalKeys.length)
  })

  it('treats a weaker natural-key re-emission as an idempotent no-op', async () => {
    // The inverse of the above: once an interaction is resolved, a later
    // duplicate that carries no stronger evidence must not disturb the cache or
    // enqueue a colliding outbox entry.
    const store = new LocalLearningStore({ storage: new TestStorage() })
    const first = await store.recordAttempt(
      'alice',
      input('resolved-1', {
        interactionId: 'interaction:settled',
        attemptNumber: 1,
        isCorrect: true,
        resolved: true,
        firstTryCorrect: true,
      }),
    )
    const replay = await store.recordAttempt(
      'alice',
      input('late-dup', {
        interactionId: 'interaction:settled',
        attemptNumber: 1,
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
      }),
    )

    expect(replay.event.id).toBe(first.event.id)
    const state = await store.load('alice')
    expect(state.cache.events).toHaveLength(1)
    expect(state.cache.events[0].id).toBe('resolved-1')
    expect(state.outbox.items).toHaveLength(1)
  })

  it('heals a legacy cache that already stored a natural-key duplicate', async () => {
    // Real users (including the owner) accumulated two events for the same
    // (interactionId, attemptNumber) before natural-key dedupe existed. On
    // decode/rebuild the pair must collapse to ONE event (resolved preferred),
    // and mastery must count the attempt once rather than double-counting.
    const storage = new TestStorage()
    const store = new LocalLearningStore({ storage })
    await store.recordAttempt(
      'alice',
      input('legacy-miss', {
        interactionId: 'interaction:legacy',
        attemptNumber: 1,
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
      }),
    )
    const healthy = await store.load('alice')
    const submissionsBefore =
      healthy.cache.problemMastery['problem:two-sum']?.submissionCount ?? 0

    // Simulate a poisoned durable cache: inject a second resolved event that
    // shares the natural key straight into stored `cache.events`, bypassing the
    // record path's guard exactly as a pre-fix client would have persisted it.
    const key = learningStorageKey('alice')
    const raw = JSON.parse(storage.values.get(key)!)
    const duplicate = {
      ...raw.cache.events[0],
      id: 'legacy-skip',
      isCorrect: true,
      resolved: true,
      firstTryCorrect: true,
    }
    raw.cache.events = [raw.cache.events[0], duplicate]
    storage.values.set(key, JSON.stringify(raw))

    const healed = await store.load('alice')
    expect(healed.cache.events).toHaveLength(1)
    expect(healed.cache.events[0].id).toBe('legacy-skip')
    expect(healed.cache.events[0].resolved).toBe(true)
    // Mastery counts the attempt exactly once — no double-count from the dup.
    expect(
      healed.cache.problemMastery['problem:two-sum']?.submissionCount,
    ).toBe(submissionsBefore)
  })

  it('records genuine retries under distinct attempt numbers', async () => {
    // Guard against the dedupe being too aggressive: a real retry on the same
    // interaction bumps the attempt number, so both events must survive.
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt(
      'alice',
      input('attempt-1', {
        interactionId: 'interaction:retry',
        attemptNumber: 1,
        isCorrect: false,
        resolved: false,
        firstTryCorrect: false,
      }),
    )
    await store.recordAttempt(
      'alice',
      input('attempt-2', {
        interactionId: 'interaction:retry',
        attemptNumber: 2,
        isCorrect: true,
        resolved: true,
        firstTryCorrect: false,
        occurredAt: '2026-07-11T12:01:00.000Z',
      }),
    )
    const state = await store.load('alice')
    expect(state.cache.events).toHaveLength(2)
    expect(state.outbox.items).toHaveLength(2)
  })

  it('never overlays a higher-revision snapshot over canonical events', async () => {
    const store = new LocalLearningStore({
      storage: new TestStorage(),
      deviceId: 'canonical-tab',
    })
    const recorded = await store.recordAttempt('alice', input('event-a'))
    const canonical =
      recorded.state.cache.problemMastery['problem:two-sum']!
    const merged = await store.mergeCloudState('alice', [], [
      {
        ...canonical,
        ability: 1,
        revision: canonical.revision + 100,
        lastEventId: 'snapshot-only-event',
      },
    ])

    expect(merged.cache.problemMastery['problem:two-sum']).toEqual(canonical)
  })

  it('acks exact entries serially and idempotently', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('alice', input('event-a'))
    await store.recordAttempt(
      'alice',
      input('event-b', {
        interactionId: 'interaction-b',
        occurredAt: '2026-07-11T12:01:00.000Z',
      }),
    )
    const before = await store.load('alice')
    const firstId = before.outbox.items[0].id

    await store.acknowledge('alice', [firstId])
    await store.acknowledge('alice', [firstId])
    const after = await store.load('alice')

    expect(after.outbox.items).toHaveLength(1)
    expect(after.outbox.items[0].mutation.kind).toBe('learning-event')
    expect(after.cache.events).toHaveLength(2)
  })

  it('compacts snapshots but never compacts distinct event mutations', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    const first = await store.recordAttempt('alice', input('event-a'))
    await store.recordAttempt(
      'alice',
      input('event-b', {
        occurredAt: '2026-07-11T12:01:00.000Z',
      }),
    )
    const record = first.state.cache.problemMastery['problem:two-sum']!

    await store.enqueueMutation('alice', {
      kind: 'mastery-snapshot',
      entityKey: 'problem:two-sum',
      records: [record],
    })
    await store.enqueueMutation('alice', {
      kind: 'mastery-snapshot',
      entityKey: 'problem:two-sum',
      records: [{ ...record, revision: record.revision + 1 }],
    })

    const state = await store.load('alice')
    expect(
      state.outbox.items.filter(
        (item) => item.mutation.kind === 'learning-event',
      ),
    ).toHaveLength(2)
    const snapshots = state.outbox.items.filter(
      (item) => item.mutation.kind === 'mastery-snapshot',
    )
    expect(snapshots).toHaveLength(1)
    expect(
      snapshots[0].mutation.kind === 'mastery-snapshot'
        ? snapshots[0].mutation.records[0].revision
        : -1,
    ).toBe(record.revision + 1)
  })

  it('preserves corrupt or unsupported raw data instead of overwriting it', async () => {
    const storage = new TestStorage()
    const key = learningStorageKey('alice')
    storage.values.set(key, '{"schemaVersion":1,"outbox":')
    const corrupt = storage.values.get(key)
    const store = new LocalLearningStore({ storage })

    await expect(store.load('alice')).rejects.toThrow(/preserved/i)
    expect(storage.values.get(key)).toBe(corrupt)

    const unsupported = JSON.stringify({
      schemaVersion: 99,
      identityId: 'alice',
    })
    storage.values.set(key, unsupported)
    await expect(store.recordAttempt('alice', input('event-a'))).rejects.toThrow(
      /preserved/i,
    )
    expect(storage.values.get(key)).toBe(unsupported)
  })

  it('does not acknowledge or replace old state when persistence fails', async () => {
    const storage = new TestStorage()
    const store = new LocalLearningStore({ storage })
    await store.recordAttempt('alice', input('event-a'))
    const before = storage.values.get(learningStorageKey('alice'))
    storage.failWrites = true

    await expect(
      store.recordAttempt(
        'alice',
        input('event-b', {
          occurredAt: '2026-07-11T12:01:00.000Z',
        }),
      ),
    ).rejects.toThrow(/persist/i)
    expect(storage.values.get(learningStorageKey('alice'))).toBe(before)
  })
})
