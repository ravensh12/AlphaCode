import {
  LEARNING_PROJECTION_VERSION,
  LEARNING_SCHEMA_VERSION,
  LEARNING_SOURCES,
  type AttemptEvent,
  type LearningAttemptInput,
  type LearningCache,
  type LearningOutboxEntry,
  type LearningOutboxMutation,
  type LearningProblemId,
  type LearningSkillId,
  type LocalLearningState,
  type MasteryRecord,
  type ProblemMasteryRecord,
  type SkillMasteryRecord,
} from '../types/learning'
import {
  emptyLearningCache,
  preferredAttempt,
  rebuildLearningCache,
  type MasterySeed,
} from './masteryProjection'

const DATABASE_NAME = 'alphacode-learning-v1'
const OBJECT_STORE = 'identity-state'
const SESSION_ID = createId()
const TAB_DEVICE_ID = createId()
const inProcessQueues = new Map<string, Promise<unknown>>()

export const learningStorageKey = (identityId: string): string =>
  `alphacode.learning.v1.${encodeURIComponent(identityId)}`

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export interface LearningLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

interface LearningPersistence {
  read(identityId: string): Promise<unknown | null>
  write(identityId: string, value: LocalLearningState): Promise<void>
  update<T>(
    identityId: string,
    updater: (current: unknown | null) => PersistenceUpdate<T>,
  ): Promise<T>
  remove?(identityId: string): Promise<void>
}

type PersistenceUpdate<T> = {
  readonly value: LocalLearningState
  readonly result: T
}

export class LearningStorageError extends Error {
  override readonly name = 'LearningStorageError'

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

class LocalStoragePersistence implements LearningPersistence {
  constructor(private readonly storage: StorageLike) {}

  async read(identityId: string): Promise<unknown | null> {
    let raw: string | null
    try {
      raw = this.storage.getItem(learningStorageKey(identityId))
    } catch (error) {
      throw new LearningStorageError('Unable to read local learning data', error)
    }
    if (raw == null) return null
    try {
      return JSON.parse(raw) as unknown
    } catch (error) {
      // Leave the original bytes untouched. A later write must not erase a
      // queued event that happens to live in a partially-corrupt envelope.
      throw new LearningStorageError(
        'Local learning data is not valid JSON; original data was preserved',
        error,
      )
    }
  }

  async write(identityId: string, value: LocalLearningState): Promise<void> {
    try {
      this.storage.setItem(learningStorageKey(identityId), JSON.stringify(value))
    } catch (error) {
      throw new LearningStorageError('Unable to persist local learning data', error)
    }
  }

  async update<T>(
    identityId: string,
    updater: (current: unknown | null) => PersistenceUpdate<T>,
  ): Promise<T> {
    const updated = updater(await this.read(identityId))
    await this.write(identityId, updated.value)
    return updated.result
  }

  async remove(identityId: string): Promise<void> {
    if (!this.storage.removeItem) return
    try {
      this.storage.removeItem(learningStorageKey(identityId))
    } catch (error) {
      throw new LearningStorageError(
        'Unable to finish local learning migration',
        error,
      )
    }
  }
}

class MemoryPersistence implements LearningPersistence {
  private readonly values = new Map<string, LocalLearningState>()

  async read(identityId: string): Promise<unknown | null> {
    return this.values.get(identityId) ?? null
  }

  async write(identityId: string, value: LocalLearningState): Promise<void> {
    this.values.set(identityId, value)
  }

  async update<T>(
    identityId: string,
    updater: (current: unknown | null) => PersistenceUpdate<T>,
  ): Promise<T> {
    const updated = updater(this.values.get(identityId) ?? null)
    this.values.set(identityId, updated.value)
    return updated.result
  }

  async remove(identityId: string): Promise<void> {
    this.values.delete(identityId)
  }
}

class IndexedDbPersistence implements LearningPersistence {
  private constructor(private readonly database: IDBDatabase) {}

  static open(factory: IDBFactory): Promise<IndexedDbPersistence> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(OBJECT_STORE)) {
          database.createObjectStore(OBJECT_STORE)
        }
      }
      request.onsuccess = () => resolve(new IndexedDbPersistence(request.result))
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB open failed'))
      request.onblocked = () => reject(new Error('IndexedDB open was blocked'))
    })
  }

  async read(identityId: string): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(OBJECT_STORE, 'readonly')
      const request = transaction.objectStore(OBJECT_STORE).get(identityId)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () =>
        reject(
          new LearningStorageError(
            'Unable to read IndexedDB learning data',
            request.error,
          ),
        )
    })
  }

  async write(identityId: string, value: LocalLearningState): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(OBJECT_STORE, 'readwrite')
      transaction.objectStore(OBJECT_STORE).put(value, identityId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(
          new LearningStorageError(
            'Unable to persist IndexedDB learning data',
            transaction.error,
          ),
        )
      transaction.onabort = () =>
        reject(
          new LearningStorageError(
            'IndexedDB learning transaction was aborted',
            transaction.error,
          ),
        )
    })
  }

  async update<T>(
    identityId: string,
    updater: (current: unknown | null) => PersistenceUpdate<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(OBJECT_STORE, 'readwrite')
      const store = transaction.objectStore(OBJECT_STORE)
      const request = store.get(identityId)
      let result: T
      let updaterError: unknown

      request.onsuccess = () => {
        try {
          const updated = updater(request.result ?? null)
          result = updated.result
          store.put(updated.value, identityId)
        } catch (error) {
          updaterError = error
          transaction.abort()
        }
      }
      request.onerror = () => {
        updaterError = new LearningStorageError(
          'Unable to read IndexedDB learning data for update',
          request.error,
        )
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => {
        // onabort reports the durable transaction failure once.
      }
      transaction.onabort = () =>
        reject(
          updaterError ??
            new LearningStorageError(
              'IndexedDB learning update was aborted',
              transaction.error,
            ),
        )
    })
  }
}

class PreferredPersistence implements LearningPersistence {
  private selected?: Promise<LearningPersistence>

  constructor(
    private readonly indexedDb: IDBFactory | null,
    private readonly fallback: LearningPersistence,
  ) {}

  private persistence(): Promise<LearningPersistence> {
    this.selected ??= this.indexedDb
      ? IndexedDbPersistence.open(this.indexedDb).catch(() => this.fallback)
      : Promise.resolve(this.fallback)
    return this.selected
  }

  async read(identityId: string): Promise<unknown | null> {
    const persistence = await this.persistence()
    if (persistence === this.fallback) return persistence.read(identityId)

    const [primaryValue, fallbackValue] = await Promise.all([
      persistence.read(identityId),
      this.fallback.read(identityId),
    ])
    if (primaryValue == null) return fallbackValue
    if (fallbackValue == null) return primaryValue
    return mergePersistedStates(primaryValue, fallbackValue, identityId)
  }

  async write(identityId: string, value: LocalLearningState): Promise<void> {
    const persistence = await this.persistence()
    await persistence.write(identityId, value)
    if (persistence !== this.fallback) {
      await this.fallback.remove?.(identityId)
    }
  }

  async update<T>(
    identityId: string,
    updater: (current: unknown | null) => PersistenceUpdate<T>,
  ): Promise<T> {
    const persistence = await this.persistence()
    if (persistence === this.fallback) {
      return persistence.update(identityId, updater)
    }

    const fallbackValue = await this.fallback.read(identityId)
    const result = await persistence.update(identityId, (primaryValue) => {
      const current =
        primaryValue == null
          ? fallbackValue
          : fallbackValue == null
            ? primaryValue
            : mergePersistedStates(primaryValue, fallbackValue, identityId)
      return updater(current)
    })
    await this.fallback.remove?.(identityId)
    return result
  }
}

function createId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function browserLockManager(): LearningLockManager | null {
  try {
    const locks = globalThis.navigator?.locks
    if (!locks) return null
    return {
      request: <T>(name: string, callback: () => Promise<T>) =>
        locks.request(name, () => callback()),
    }
  } catch {
    return null
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isSafeInteger(value)

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function isAttemptEvent(value: unknown): value is AttemptEvent {
  if (!isObject(value)) return false
  return (
    value.schemaVersion === LEARNING_SCHEMA_VERSION &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.interactionId === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.deviceId === 'string' &&
    isFiniteInteger(value.deviceSeq) &&
    value.deviceSeq > 0 &&
    typeof value.source === 'string' &&
    (LEARNING_SOURCES as readonly string[]).includes(value.source) &&
    typeof value.problemId === 'string' &&
    Array.isArray(value.skillIds) &&
    value.skillIds.every((skillId) => typeof skillId === 'string') &&
    isFiniteInteger(value.attemptNumber) &&
    value.attemptNumber > 0 &&
    typeof value.isCorrect === 'boolean' &&
    typeof value.resolved === 'boolean' &&
    typeof value.firstTryCorrect === 'boolean' &&
    typeof value.usedHint === 'boolean' &&
    typeof value.revealed === 'boolean' &&
    (value.responseMs == null ||
      (typeof value.responseMs === 'number' &&
        Number.isFinite(value.responseMs) &&
        value.responseMs >= 0)) &&
    isValidTimestamp(value.occurredAt)
  )
}

function isMasteryRecord(value: unknown): value is MasteryRecord {
  if (!isObject(value) || !isObject(value.schedule)) return false
  return (
    (value.entityKind === 'problem' || value.entityKind === 'skill') &&
    typeof value.entityId === 'string' &&
    value.projectionVersion === LEARNING_PROJECTION_VERSION &&
    isFiniteInteger(value.submissionCount) &&
    isFiniteInteger(value.reviewCount) &&
    isFiniteInteger(value.correctCount) &&
    isFiniteInteger(value.firstTryCorrectCount) &&
    typeof value.ability === 'number' &&
    Number.isFinite(value.ability) &&
    Array.isArray(value.recentResults) &&
    value.recentResults.every((result) => typeof result === 'boolean') &&
    value.schedule.schedulerVersion === 1 &&
    typeof value.schedule.phase === 'string' &&
    typeof value.schedule.stabilityDays === 'number' &&
    typeof value.schedule.difficulty === 'number' &&
    isValidTimestamp(value.schedule.dueAt) &&
    isFiniteInteger(value.schedule.reps) &&
    isFiniteInteger(value.schedule.lapses) &&
    isFiniteInteger(value.revision)
  )
}

function assertOutboxEntry(
  value: unknown,
  identityId: string,
): asserts value is LearningOutboxEntry {
  if (
    !isObject(value) ||
    value.schemaVersion !== LEARNING_SCHEMA_VERSION ||
    typeof value.id !== 'string' ||
    value.identityId !== identityId ||
    !isFiniteInteger(value.sequence) ||
    !isValidTimestamp(value.createdAt) ||
    !isObject(value.mutation)
  ) {
    throw new LearningStorageError('Invalid learning outbox entry')
  }
  if (value.mutation.kind === 'learning-event') {
    if (!isAttemptEvent(value.mutation.event)) {
      throw new LearningStorageError('Invalid event in learning outbox')
    }
    return
  }
  if (
    value.mutation.kind !== 'mastery-snapshot' ||
    typeof value.mutation.entityKey !== 'string' ||
    !Array.isArray(value.mutation.records) ||
    !value.mutation.records.every(isMasteryRecord)
  ) {
    throw new LearningStorageError('Invalid learning outbox mutation')
  }
}

function initialState(identityId: string): LocalLearningState {
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    identityId,
    deviceId: createId(),
    nextDeviceSequence: 1,
    cache: emptyLearningCache(identityId),
    outbox: {
      schemaVersion: LEARNING_SCHEMA_VERSION,
      identityId,
      nextSequence: 1,
      items: [],
    },
  }
}

function masterySeed(cache: LearningCache): MasterySeed {
  const problemMastery = Object.fromEntries(
    Object.entries(cache.problemMastery).filter(
      ([, record]) =>
        record?.legacySeed !== undefined &&
        record.revision === 0 &&
        !record.lastEventId,
    ),
  ) as MasterySeed['problemMastery']
  const skillMastery = Object.fromEntries(
    Object.entries(cache.skillMastery).filter(
      ([, record]) =>
        record?.legacySeed !== undefined &&
        record.revision === 0 &&
        !record.lastEventId,
    ),
  ) as MasterySeed['skillMastery']
  return { problemMastery, skillMastery }
}

function chooseSeed<T extends MasteryRecord>(a: T, b: T): T {
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function mergeMasterySeedValues(...seeds: readonly MasterySeed[]): MasterySeed {
  const problemMastery: Partial<
    Record<LearningProblemId, ProblemMasteryRecord>
  > = {}
  const skillMastery: Partial<Record<LearningSkillId, SkillMasteryRecord>> = {}

  for (const seed of seeds) {
    for (const record of Object.values(seed.problemMastery ?? {})) {
      if (!record) continue
      const existing = problemMastery[record.entityId]
      problemMastery[record.entityId] = existing
        ? chooseSeed(existing, record)
        : record
    }
    for (const record of Object.values(seed.skillMastery ?? {})) {
      if (!record) continue
      const existing = skillMastery[record.entityId]
      skillMastery[record.entityId] = existing
        ? chooseSeed(existing, record)
        : record
    }
  }

  return { problemMastery, skillMastery }
}

function mergeMasterySeeds(...caches: readonly LearningCache[]): MasterySeed {
  return mergeMasterySeedValues(...caches.map(masterySeed))
}

function masterySeedFromRecords(
  records: readonly MasteryRecord[],
): MasterySeed {
  const problemMastery: Partial<
    Record<LearningProblemId, ProblemMasteryRecord>
  > = {}
  const skillMastery: Partial<Record<LearningSkillId, SkillMasteryRecord>> = {}
  for (const record of records) {
    if (
      record.legacySeed === undefined ||
      record.revision !== 0 ||
      record.lastEventId
    ) {
      continue
    }
    if (record.entityKind === 'problem') {
      problemMastery[record.entityId] = record
    } else {
      skillMastery[record.entityId] = record
    }
  }
  return { problemMastery, skillMastery }
}

function decodeState(raw: unknown, identityId: string): LocalLearningState {
  if (raw == null) return initialState(identityId)
  if (
    !isObject(raw) ||
    raw.schemaVersion !== LEARNING_SCHEMA_VERSION ||
    raw.identityId !== identityId ||
    typeof raw.deviceId !== 'string' ||
    !isFiniteInteger(raw.nextDeviceSequence) ||
    !isObject(raw.cache) ||
    raw.cache.schemaVersion !== LEARNING_SCHEMA_VERSION ||
    raw.cache.identityId !== identityId ||
    !Array.isArray(raw.cache.events) ||
    !raw.cache.events.every(isAttemptEvent) ||
    !isObject(raw.cache.problemMastery) ||
    !Object.values(raw.cache.problemMastery).every(isMasteryRecord) ||
    !isObject(raw.cache.skillMastery) ||
    !Object.values(raw.cache.skillMastery).every(isMasteryRecord) ||
    !isObject(raw.outbox) ||
    raw.outbox.schemaVersion !== LEARNING_SCHEMA_VERSION ||
    raw.outbox.identityId !== identityId ||
    !isFiniteInteger(raw.outbox.nextSequence) ||
    !Array.isArray(raw.outbox.items)
  ) {
    throw new LearningStorageError(
      'Unsupported or invalid local learning data; original data was preserved',
    )
  }

  for (const item of raw.outbox.items) assertOutboxEntry(item, identityId)

  const eventById = new Map<string, AttemptEvent>()
  for (const event of raw.cache.events) eventById.set(event.id, event)
  // Recover an event if a previous process wrote the durable outbox but did
  // not finish refreshing its projection cache.
  for (const item of raw.outbox.items) {
    if (item.mutation.kind === 'learning-event') {
      eventById.set(item.mutation.event.id, item.mutation.event)
    }
  }

  const cache = rebuildLearningCache(
    identityId,
    [...eventById.values()],
    masterySeed(raw.cache as LearningCache),
  )
  const nextDeviceSequence = Math.max(
    raw.nextDeviceSequence,
    ...cache.events
      .filter((event) => event.deviceId === raw.deviceId)
      .map((event) => event.deviceSeq + 1),
  )
  const nextOutboxSequence = Math.max(
    raw.outbox.nextSequence,
    ...raw.outbox.items.map((item) => item.sequence + 1),
  )

  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    identityId,
    deviceId: raw.deviceId,
    nextDeviceSequence,
    cache,
    outbox: {
      schemaVersion: LEARNING_SCHEMA_VERSION,
      identityId,
      nextSequence: nextOutboxSequence,
      items: raw.outbox.items,
    },
  }
}

function mergePersistedStates(
  primaryRaw: unknown,
  fallbackRaw: unknown,
  identityId: string,
): LocalLearningState {
  const primary = decodeState(primaryRaw, identityId)
  const fallback = decodeState(fallbackRaw, identityId)
  const eventById = new Map(
    primary.cache.events.map((event) => [event.id, event] as const),
  )
  for (const event of fallback.cache.events) {
    if (!eventById.has(event.id)) eventById.set(event.id, event)
  }

  const cache = rebuildLearningCache(
    identityId,
    [...eventById.values()],
    mergeMasterySeeds(primary.cache, fallback.cache),
  )

  const newestFirst = [
    ...primary.outbox.items,
    ...fallback.outbox.items,
  ].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.sequence - a.sequence ||
      b.id.localeCompare(a.id),
  )
  const seen = new Set<string>()
  const retainedNewestFirst = newestFirst.filter((item) => {
    const key =
      item.mutation.kind === 'learning-event'
        ? `event:${item.mutation.event.id}`
        : `snapshot:${item.mutation.entityKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const items = retainedNewestFirst
    .reverse()
    .map((item, index) => ({ ...item, sequence: index + 1 }))

  const nextDeviceSequence = Math.max(
    primary.nextDeviceSequence,
    ...cache.events
      .filter((event) => event.deviceId === primary.deviceId)
      .map((event) => event.deviceSeq + 1),
  )

  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    identityId,
    deviceId: primary.deviceId,
    nextDeviceSequence,
    cache,
    outbox: {
      schemaVersion: LEARNING_SCHEMA_VERSION,
      identityId,
      nextSequence: items.length + 1,
      items,
    },
  }
}

export type AttemptEventMetadata = {
  readonly deviceId: string
  readonly deviceSeq: number
  readonly defaultSessionId?: string
  readonly defaultOccurredAt?: string
}

export function createAttemptEvent(
  input: LearningAttemptInput,
  metadata: AttemptEventMetadata,
): AttemptEvent {
  if (
    !input.problemId.trim() ||
    (input.id != null && !input.id.trim()) ||
    (input.interactionId != null && !input.interactionId.trim()) ||
    (input.sessionId != null && !input.sessionId.trim()) ||
    !metadata.deviceId.trim() ||
    !Number.isSafeInteger(metadata.deviceSeq) ||
    metadata.deviceSeq < 1
  ) {
    throw new Error('Learning attempt ids and sequence must be stable and non-empty')
  }
  if ((input.skillIds ?? []).some((skillId) => !skillId.trim())) {
    throw new Error('Learning skill ids must not be empty')
  }
  const occurredAt =
    input.occurredAt ??
    metadata.defaultOccurredAt ??
    new Date().toISOString()
  if (!isValidTimestamp(occurredAt)) {
    throw new RangeError(`Invalid attempt timestamp: ${occurredAt}`)
  }
  const attemptNumber = input.attemptNumber ?? 1
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('attemptNumber must be a positive integer')
  }
  if (
    input.responseMs != null &&
    (!Number.isFinite(input.responseMs) || input.responseMs < 0)
  ) {
    throw new RangeError('responseMs must be a non-negative finite number')
  }
  if (
    input.frameIndex != null &&
    (!Number.isSafeInteger(input.frameIndex) || input.frameIndex < 0)
  ) {
    throw new RangeError('frameIndex must be a non-negative integer')
  }

  const usedHint = input.usedHint ?? false
  const revealed = input.revealed ?? false
  const resolved = input.resolved ?? true
  if (revealed && !resolved) {
    throw new Error('A revealed interaction must be resolved')
  }
  const firstTryCorrect =
    input.firstTryCorrect ??
    (resolved &&
      input.isCorrect &&
      attemptNumber === 1 &&
      !revealed &&
      !usedHint)
  if (
    firstTryCorrect &&
    (!resolved ||
      !input.isCorrect ||
      attemptNumber !== 1 ||
      revealed ||
      usedHint)
  ) {
    throw new Error('firstTryCorrect is inconsistent with the attempt outcome')
  }
  const event: AttemptEvent = {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: input.id ?? createId(),
    interactionId: input.interactionId ?? createId(),
    sessionId: input.sessionId ?? metadata.defaultSessionId ?? SESSION_ID,
    deviceId: metadata.deviceId,
    deviceSeq: metadata.deviceSeq,
    source: input.source,
    problemId: input.problemId,
    skillIds: Object.freeze([...new Set(input.skillIds ?? [])]),
    lessonId: input.lessonId,
    stepId: input.stepId,
    frameIndex: input.frameIndex,
    attemptNumber,
    isCorrect: input.isCorrect,
    resolved,
    firstTryCorrect,
    usedHint,
    revealed,
    responseMs:
      input.responseMs == null
        ? undefined
        : Math.min(2_147_483_647, Math.round(input.responseMs)),
    submittedAnswer: input.submittedAnswer,
    expectedAnswer: input.expectedAnswer,
    metadata: input.metadata,
    occurredAt: new Date(Date.parse(occurredAt)).toISOString(),
  }
  return Object.freeze(event)
}

export type LocalLearningStoreOptions = {
  readonly storage?: StorageLike | null
  readonly indexedDB?: IDBFactory | null
  readonly preferIndexedDB?: boolean
  /** Alias kept friendly to the platform's IndexedDB spelling. */
  readonly preferIndexedDb?: boolean
  /** Stable for one browser tab; distinct tabs must use distinct device ids. */
  readonly deviceId?: string
  /** Web Locks serializes the localStorage fallback across browser tabs. */
  readonly lockManager?: LearningLockManager | null
}

function browserLocalStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function browserIndexedDb(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null
  } catch {
    return null
  }
}

export class LocalLearningStore {
  private readonly persistence: LearningPersistence
  private readonly deviceId: string
  private readonly lockManager: LearningLockManager | null

  constructor(options: LocalLearningStoreOptions = {}) {
    const localStorage = browserLocalStorage()
    const fallback = options.storage
      ? new LocalStoragePersistence(options.storage)
      : localStorage
        ? new LocalStoragePersistence(localStorage)
        : new MemoryPersistence()
    const preferIndexedDB =
      options.preferIndexedDB ?? options.preferIndexedDb ?? options.storage == null
    const indexedDb =
      options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB
    this.persistence =
      preferIndexedDB && indexedDb
        ? new PreferredPersistence(indexedDb, fallback)
        : fallback
    this.deviceId = options.deviceId ?? TAB_DEVICE_ID
    if (!this.deviceId.trim()) {
      throw new Error('deviceId must not be empty')
    }
    this.lockManager =
      options.lockManager === undefined
        ? browserLockManager()
        : options.lockManager
  }

  private exclusive<T>(identityId: string, operation: () => Promise<T>): Promise<T> {
    const queueKey = `learning:${identityId}`
    const previous = inProcessQueues.get(queueKey) ?? Promise.resolve()
    const run = () =>
      this.lockManager
        ? this.lockManager.request(`alphacode-learning:${identityId}`, operation)
        : operation()
    const current = previous.catch(() => undefined).then(run)
    inProcessQueues.set(queueKey, current)
    const cleanup = () => {
      if (inProcessQueues.get(queueKey) === current) {
        inProcessQueues.delete(queueKey)
      }
    }
    void current.then(cleanup, cleanup)
    return current
  }

  private async read(identityId: string): Promise<LocalLearningState> {
    if (!identityId) throw new Error('identityId must not be empty')
    return decodeState(await this.persistence.read(identityId), identityId)
  }

  async load(identityId: string): Promise<LocalLearningState> {
    return this.exclusive(identityId, () => this.read(identityId))
  }

  async recordAttempt(
    identityId: string,
    input: LearningAttemptInput,
  ): Promise<{ readonly event: AttemptEvent; readonly state: LocalLearningState }> {
    if (!identityId) throw new Error('identityId must not be empty')
    return this.exclusive(identityId, () =>
      this.persistence.update(identityId, (raw) => {
        const current = decodeState(raw, identityId)
        const deviceSeq = Math.max(
          current.deviceId === this.deviceId
            ? current.nextDeviceSequence
            : 1,
          ...current.cache.events
            .filter((event) => event.deviceId === this.deviceId)
            .map((event) => event.deviceSeq + 1),
        )
        const event = createAttemptEvent(input, {
          deviceId: this.deviceId,
          deviceSeq,
        })
        const existing = current.cache.events.find(
          (item) => item.id === event.id,
        )
        if (existing) {
          return {
            value: current,
            result: { event: existing, state: current },
          }
        }

        // Mirror the cloud `learning_attempt_number_unique (user_id,
        // interaction_id, attempt_number)` constraint locally. Callers that
        // re-emit an attempt for an interaction that already recorded that
        // attempt number (e.g. a double-submit race) would otherwise append a
        // second event with a fresh id but a colliding natural key. That
        // poisons the outbox: the cloud insert rejects the duplicate with a
        // 23505 unique violation on every retry, wedging all future syncs, and
        // the projection double-counts the attempt (each event id is applied
        // once). Resolve the collision with the same deterministic "resolved
        // wins" rule the cache rebuild uses: if the existing event dominates,
        // this is an idempotent no-op and we return it unchanged; if the new
        // event carries stronger evidence (e.g. it resolves a previously
        // unresolved attempt), fall through to append it so the cache rebuild
        // collapses the pair to the new canonical winner.
        const naturalDuplicate = current.cache.events.find(
          (item) =>
            item.interactionId === event.interactionId &&
            item.attemptNumber === event.attemptNumber,
        )
        if (
          naturalDuplicate &&
          preferredAttempt(naturalDuplicate, event).id === naturalDuplicate.id
        ) {
          return {
            value: current,
            result: { event: naturalDuplicate, state: current },
          }
        }

        const cache = rebuildLearningCache(
          identityId,
          [...current.cache.events, event],
          masterySeed(current.cache),
        )
        const outboxEntry: LearningOutboxEntry = {
          schemaVersion: LEARNING_SCHEMA_VERSION,
          id: createId(),
          identityId,
          sequence: current.outbox.nextSequence,
          createdAt: event.occurredAt,
          mutation: { kind: 'learning-event', event },
        }
        const state: LocalLearningState = {
          ...current,
          deviceId: this.deviceId,
          nextDeviceSequence: deviceSeq + 1,
          cache,
          outbox: {
            ...current.outbox,
            nextSequence: current.outbox.nextSequence + 1,
            items: [...current.outbox.items, outboxEntry],
          },
        }
        return { value: state, result: { event, state } }
      }),
    )
  }

  async enqueueMutation(
    identityId: string,
    mutation: LearningOutboxMutation,
    createdAt = new Date().toISOString(),
  ): Promise<LocalLearningState> {
    if (!identityId) throw new Error('identityId must not be empty')
    return this.exclusive(identityId, () =>
      this.persistence.update(identityId, (raw) => {
        const current = decodeState(raw, identityId)
        if (mutation.kind === 'learning-event') {
          const duplicate = current.outbox.items.some(
            (item) =>
              item.mutation.kind === 'learning-event' &&
              item.mutation.event.id === mutation.event.id,
          )
          if (duplicate) return { value: current, result: current }
        }

        const retained =
          mutation.kind === 'mastery-snapshot'
            ? current.outbox.items.filter(
                (item) =>
                  item.mutation.kind !== 'mastery-snapshot' ||
                  item.mutation.entityKey !== mutation.entityKey,
              )
            : current.outbox.items
        const entry: LearningOutboxEntry = {
          schemaVersion: LEARNING_SCHEMA_VERSION,
          id: createId(),
          identityId,
          sequence: current.outbox.nextSequence,
          createdAt,
          mutation,
        }

        let cache = current.cache
        if (
          mutation.kind === 'learning-event' &&
          !cache.events.some((event) => event.id === mutation.event.id)
        ) {
          cache = rebuildLearningCache(
            identityId,
            [...cache.events, mutation.event],
            masterySeed(cache),
          )
        }

        const state: LocalLearningState = {
          ...current,
          cache,
          outbox: {
            ...current.outbox,
            nextSequence: current.outbox.nextSequence + 1,
            items: [...retained, entry].sort(
              (a, b) => a.sequence - b.sequence,
            ),
          },
        }
        return { value: state, result: state }
      }),
    )
  }

  async acknowledge(
    identityId: string,
    entryIds: readonly string[],
  ): Promise<LocalLearningState> {
    if (!identityId) throw new Error('identityId must not be empty')
    return this.exclusive(identityId, () =>
      this.persistence.update(identityId, (raw) => {
        const current = decodeState(raw, identityId)
        const acknowledged = new Set(entryIds)
        const items = current.outbox.items.filter(
          (item) => !acknowledged.has(item.id),
        )
        if (items.length === current.outbox.items.length) {
          return { value: current, result: current }
        }
        const state: LocalLearningState = {
          ...current,
          outbox: { ...current.outbox, items },
        }
        return { value: state, result: state }
      }),
    )
  }

  async mergeCloudState(
    identityId: string,
    cloudEvents: readonly AttemptEvent[],
    cloudMastery: readonly MasteryRecord[] = [],
  ): Promise<LocalLearningState> {
    if (!identityId) throw new Error('identityId must not be empty')
    return this.exclusive(identityId, () =>
      this.persistence.update(identityId, (raw) => {
        const current = decodeState(raw, identityId)
        const eventById = new Map(
          current.cache.events.map((event) => [event.id, event] as const),
        )
        for (const event of cloudEvents) {
          if (!eventById.has(event.id)) eventById.set(event.id, event)
        }

        // Immutable events are canonical. Cloud projections may seed legacy
        // entities with no history, but may never replace an event rebuild.
        const cache = rebuildLearningCache(
          identityId,
          [...eventById.values()],
          mergeMasterySeedValues(
            masterySeed(current.cache),
            masterySeedFromRecords(cloudMastery),
          ),
        )
        const state: LocalLearningState = { ...current, cache }
        return { value: state, result: state }
      }),
    )
  }
}

export const localLearningStore = new LocalLearningStore()

