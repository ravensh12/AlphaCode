import type {
  AttemptEvent,
  LocalLearningState,
  MasteryRecord,
} from '../types/learning'
import {
  localLearningStore,
  type LocalLearningStore,
} from './localLearning'
import {
  isLearningMasteryConflictError,
  rebaseCloudLearning,
  syncLearningCloud,
  type CloudLearningRebaseResult,
  type CloudLearningWriteResult,
} from './cloudLearning'

export type LearningCloudWriter = (
  userId: string,
  events: readonly AttemptEvent[],
  records: readonly MasteryRecord[],
) => Promise<CloudLearningWriteResult>

export type LearningCloudRebaser = (
  userId: string,
  localEvents: readonly AttemptEvent[],
) => Promise<CloudLearningRebaseResult>

export type LearningOutboxSyncResult = {
  readonly state: LocalLearningState
  readonly uploadedCount: number
  readonly status: CloudLearningWriteResult['status']
  readonly reason?: Exclude<
    CloudLearningWriteResult,
    { status: 'ok' }
  >['reason']
}

const MAX_DRAIN_BATCHES = 32

type ActiveLearningSync = {
  promise: Promise<LearningOutboxSyncResult>
  rerunRequested: boolean
}

const activeSyncs = new Map<string, ActiveLearningSync>()

export class LearningOutboxDrainError extends Error {
  override readonly name = 'LearningOutboxDrainError'
}

export function pendingLearningEvents(
  state: LocalLearningState,
): AttemptEvent[] {
  return [...state.outbox.items]
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((item) =>
      item.mutation.kind === 'learning-event' ? [item.mutation.event] : [],
    )
}

export function masteryRecordsForSync(
  state: LocalLearningState,
): MasteryRecord[] {
  const records = new Map<string, MasteryRecord>()
  for (const item of state.outbox.items) {
    if (item.mutation.kind !== 'mastery-snapshot') continue
    for (const record of item.mutation.records) {
      records.set(`${record.entityKind}:${record.entityId}`, record)
    }
  }
  // Canonical event projections always beat queued snapshot cache hints.
  for (const record of [
    ...Object.values(state.cache.problemMastery),
    ...Object.values(state.cache.skillMastery),
  ]) {
    if (record) records.set(`${record.entityKind}:${record.entityId}`, record)
  }
  return [...records.values()]
}

export function syncLearningOutbox(options: {
  readonly identityId: string
  readonly userId: string
  readonly store?: LocalLearningStore
  readonly cloudWriter?: LearningCloudWriter
  readonly cloudRebaser?: LearningCloudRebaser
}): Promise<LearningOutboxSyncResult> {
  const syncKey = `${options.identityId}:${options.userId}`
  const existing = activeSyncs.get(syncKey)
  if (existing) {
    existing.rerunRequested = true
    return existing.promise
  }

  const store = options.store ?? localLearningStore
  const cloudWriter = options.cloudWriter ?? syncLearningCloud
  const cloudRebaser = options.cloudRebaser ?? rebaseCloudLearning
  const active: ActiveLearningSync = {
    promise: Promise.resolve(null as never),
    rerunRequested: false,
  }
  const operation = (async (): Promise<LearningOutboxSyncResult> => {
    let uploadedCount = 0
    let latest = await store.load(options.identityId)

    for (let batch = 0; batch < MAX_DRAIN_BATCHES; batch += 1) {
      const attemptedEntries = [...latest.outbox.items].sort(
        (a, b) => a.sequence - b.sequence,
      )
      if (attemptedEntries.length === 0) {
        // Give a caller that joined this active sync one turn to mark it dirty,
        // then re-read durable storage before declaring the barrier drained.
        await Promise.resolve()
        const rechecked = await store.load(options.identityId)
        if (
          active.rerunRequested ||
          rechecked.outbox.items.length > 0
        ) {
          active.rerunRequested = false
          latest = rechecked
          continue
        }
        return {
          state: rechecked,
          uploadedCount,
          status: 'ok',
        }
      }

      active.rerunRequested = false
      let uploadState = latest
      let result: CloudLearningWriteResult
      try {
        result = await cloudWriter(
          options.userId,
          pendingLearningEvents(uploadState),
          masteryRecordsForSync(uploadState),
        )
      } catch (error) {
        if (!isLearningMasteryConflictError(error)) throw error

        // A revision is only an event count, not a causal version. Re-fetch the
        // immutable union once for this batch, rebuild, and retry once.
        const rebased = await cloudRebaser(
          options.userId,
          uploadState.cache.events,
        )
        if (rebased.status !== 'ok') {
          if (rebased.events.length > 0 || rebased.mastery.length > 0) {
            uploadState = await store.mergeCloudState(
              options.identityId,
              rebased.events,
              rebased.mastery,
            )
          }
          return {
            state: uploadState,
            uploadedCount,
            status: rebased.status,
            reason: rebased.reason,
          }
        }
        uploadState = await store.mergeCloudState(
          options.identityId,
          rebased.events,
          rebased.mastery,
        )
        result = await cloudWriter(
          options.userId,
          pendingLearningEvents(uploadState),
          masteryRecordsForSync(uploadState),
        )
      }
      if (result.status !== 'ok') {
        return {
          state: uploadState,
          uploadedCount,
          status: result.status,
          reason: result.reason,
        }
      }

      latest = await store.acknowledge(
        options.identityId,
        attemptedEntries.map((entry) => entry.id),
      )
      uploadedCount += attemptedEntries.length
    }

    latest = await store.load(options.identityId)
    if (latest.outbox.items.length > 0) {
      throw new LearningOutboxDrainError(
        `Learning outbox did not drain after ${MAX_DRAIN_BATCHES} batches`,
      )
    }
    return {
      state: latest,
      uploadedCount,
      status: 'ok',
    }
  })()

  active.promise = operation
  activeSyncs.set(syncKey, active)
  void operation.then(
    () => {
      if (activeSyncs.get(syncKey) === active) {
        activeSyncs.delete(syncKey)
      }
    },
    () => {
      if (activeSyncs.get(syncKey) === active) {
        activeSyncs.delete(syncKey)
      }
    },
  )
  return operation
}
