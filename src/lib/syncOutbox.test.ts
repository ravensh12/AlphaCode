import { describe, expect, it, vi } from 'vitest'
import type {
  LearningAttemptInput,
  MasteryRecord,
} from '../types/learning'
import {
  LocalLearningStore,
  type StorageLike,
} from './localLearning'
import { syncLearningOutbox } from './syncOutbox'

class TestStorage implements StorageLike {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const attempt = (id: string): LearningAttemptInput => ({
  id,
  interactionId: `interaction-${id}`,
  sessionId: 'session-1',
  source: 'lesson-quiz',
  problemId: 'problem:two-sum',
  skillIds: ['skill:frequency-map'],
  isCorrect: true,
  occurredAt: '2026-07-11T12:00:00.000Z',
})

describe('syncLearningOutbox', () => {
  it('acks only after event and projection upload report success', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('success-user', attempt('event-a'))
    const writer = vi.fn().mockResolvedValue({ status: 'ok' as const })

    const result = await syncLearningOutbox({
      identityId: 'success-user',
      userId: 'cloud-user',
      store,
      cloudWriter: writer,
    })

    expect(result.status).toBe('ok')
    expect(result.uploadedCount).toBe(1)
    expect(result.state.outbox.items).toHaveLength(0)
    expect(writer).toHaveBeenCalledOnce()
    expect(writer.mock.calls[0][1]).toHaveLength(1)
    expect(writer.mock.calls[0][2]).toHaveLength(2)
  })

  it('retains every item when migration tables are unavailable', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('missing-user', attempt('event-a'))

    const result = await syncLearningOutbox({
      identityId: 'missing-user',
      userId: 'cloud-user',
      store,
      cloudWriter: async () => ({
        status: 'unavailable',
        reason: 'migration-missing',
      }),
    })

    expect(result.status).toBe('unavailable')
    expect(result.state.outbox.items).toHaveLength(1)
  })

  it('retains queued events when a transient cloud call throws', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('failure-user', attempt('event-a'))

    await expect(
      syncLearningOutbox({
        identityId: 'failure-user',
        userId: 'cloud-user',
        store,
        cloudWriter: async () => {
          throw new Error('network unavailable')
        },
      }),
    ).rejects.toThrow('network unavailable')
    expect((await store.load('failure-user')).outbox.items).toHaveLength(1)
  })

  it('rebases canonical events once after a stale mastery conflict', async () => {
    const store = new LocalLearningStore({
      storage: new TestStorage(),
      deviceId: 'local-device',
    })
    const local = await store.recordAttempt(
      'rebase-user',
      attempt('event-local'),
    )
    const remote = {
      ...local.event,
      id: 'event-remote',
      interactionId: 'interaction-remote',
      deviceId: 'remote-device',
      deviceSeq: 1,
      occurredAt: '2026-07-11T12:01:00.000Z',
    }
    const conflict = { code: '40001', message: 'stale projection' }
    const writer = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ status: 'ok' as const })

    const result = await syncLearningOutbox({
      identityId: 'rebase-user',
      userId: 'cloud-user',
      store,
      cloudWriter: writer,
      cloudRebaser: async () => ({
        status: 'ok',
        events: [local.event, remote],
        mastery: [],
        watermark: null,
      }),
    })

    expect(result.status).toBe('ok')
    expect(writer).toHaveBeenCalledTimes(2)
    expect(result.state.cache.events.map(({ id }) => id).sort()).toEqual([
      'event-local',
      'event-remote',
    ])
    expect(
      writer.mock.calls[1][2].find(
        (record: MasteryRecord) =>
          record.entityKind === 'problem' &&
          record.entityId === 'problem:two-sum',
      )?.revision,
    ).toBe(2)
    expect(result.state.outbox.items).toHaveLength(0)
  })

  it('surfaces a second conflict without retrying forever or acking', async () => {
    const store = new LocalLearningStore({
      storage: new TestStorage(),
      deviceId: 'conflict-device',
    })
    const local = await store.recordAttempt(
      'double-conflict-user',
      attempt('event-local'),
    )
    const conflict = { code: '40001', message: 'stale projection' }
    const writer = vi.fn().mockRejectedValue(conflict)

    await expect(
      syncLearningOutbox({
        identityId: 'double-conflict-user',
        userId: 'cloud-user',
        store,
        cloudWriter: writer,
        cloudRebaser: async () => ({
          status: 'ok',
          events: [local.event],
          mastery: [],
          watermark: null,
        }),
      }),
    ).rejects.toBe(conflict)
    expect(writer).toHaveBeenCalledTimes(2)
    expect(
      (await store.load('double-conflict-user')).outbox.items,
    ).toHaveLength(1)
  })

  it('drains an event queued while a serial upload is in flight', async () => {
    const store = new LocalLearningStore({ storage: new TestStorage() })
    await store.recordAttempt('racing-user', attempt('event-a'))
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const writer = vi.fn(async (
      _userId: string,
      _events: readonly unknown[],
    ) => {
      if (writer.mock.calls.length === 1) await gate
      return { status: 'ok' as const }
    })
    const syncing = syncLearningOutbox({
      identityId: 'racing-user',
      userId: 'cloud-user',
      store,
      cloudWriter: writer,
    })
    await Promise.resolve()
    await store.recordAttempt('racing-user', {
      ...attempt('event-b'),
      occurredAt: '2026-07-11T12:01:00.000Z',
    })
    release()
    const result = await syncing

    const remaining = await store.load('racing-user')
    expect(result.uploadedCount).toBe(2)
    expect(remaining.outbox.items).toHaveLength(0)
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[1][1]).toEqual([
      expect.objectContaining({ id: 'event-b' }),
    ])
  })
})
