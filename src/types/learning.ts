import type { ProblemId, SkillId } from './curriculum'

export const LEARNING_SCHEMA_VERSION = 1 as const
export const LEARNING_PROJECTION_VERSION = 1 as const
export const FSRS_SCHEDULER_VERSION = 1 as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** Stable app-owned ids used until older lessons are mapped into a curriculum. */
export type InternalProblemId =
  | `lesson:${string}`
  | `micro:${string}`
  | `gauntlet:${string}`
  | `legacy:${string}`

export type InternalSkillId = `legacy-skill:${string}`
export type LearningProblemId = ProblemId | InternalProblemId
export type LearningSkillId = SkillId | InternalSkillId

export const LEARNING_SOURCES = [
  'lesson-learn',
  'lesson-quiz',
  'lesson-review',
  'warmup',
  'knowledge-surge',
  'realm-boss',
  'gauntlet-journey',
  'gauntlet-exam',
  'legacy-import',
] as const

export type LearningSource = (typeof LEARNING_SOURCES)[number]

export type LearningAttemptInput = {
  readonly id?: string
  readonly interactionId?: string
  readonly sessionId?: string
  readonly source: LearningSource
  readonly problemId: LearningProblemId
  readonly skillIds?: readonly LearningSkillId[]
  readonly lessonId?: string
  readonly stepId?: string
  readonly frameIndex?: number
  readonly attemptNumber?: number
  readonly isCorrect: boolean
  /** False for telemetry submissions that do not finish the interaction. */
  readonly resolved?: boolean
  readonly firstTryCorrect?: boolean
  readonly usedHint?: boolean
  readonly revealed?: boolean
  readonly responseMs?: number
  readonly submittedAnswer?: JsonValue
  readonly expectedAnswer?: JsonValue
  readonly metadata?: Readonly<Record<string, JsonValue>>
  readonly occurredAt?: string
}

/**
 * Append-only learning fact. Fields are readonly in TypeScript and cloud rows
 * intentionally have no UPDATE/DELETE policy.
 */
export type AttemptEvent = {
  readonly schemaVersion: typeof LEARNING_SCHEMA_VERSION
  readonly id: string
  readonly interactionId: string
  readonly sessionId: string
  readonly deviceId: string
  readonly deviceSeq: number
  readonly source: LearningSource
  readonly problemId: LearningProblemId
  readonly skillIds: readonly LearningSkillId[]
  readonly lessonId?: string
  readonly stepId?: string
  readonly frameIndex?: number
  readonly attemptNumber: number
  readonly isCorrect: boolean
  readonly resolved: boolean
  readonly firstTryCorrect: boolean
  readonly usedHint: boolean
  readonly revealed: boolean
  readonly responseMs?: number
  readonly submittedAnswer?: JsonValue
  readonly expectedAnswer?: JsonValue
  readonly metadata?: Readonly<Record<string, JsonValue>>
  readonly occurredAt: string
}

export const FSRS_RATINGS = ['again', 'hard', 'good', 'easy'] as const
export type FsrsRating = (typeof FSRS_RATINGS)[number]
export type FsrsPhase = 'new' | 'learning' | 'review' | 'relearning'

export type FsrsState = {
  readonly schedulerVersion: typeof FSRS_SCHEDULER_VERSION
  readonly phase: FsrsPhase
  /** Approximate interval at which retrievability reaches 90%. */
  readonly stabilityDays: number
  /** FSRS-style difficulty on a 1..10 scale. */
  readonly difficulty: number
  readonly dueAt: string
  readonly lastReviewAt?: string
  readonly reps: number
  readonly lapses: number
}

export type MasteryEntityKind = 'problem' | 'skill'

type MasteryRecordBase = {
  readonly submissionCount: number
  /** Number of resolved events that affected the scheduler. */
  readonly reviewCount: number
  readonly correctCount: number
  readonly firstTryCorrectCount: number
  /** Current estimate only; failures are allowed to lower it. */
  readonly ability: number
  readonly recentResults: readonly boolean[]
  readonly schedule: FsrsState
  readonly lastEventId?: string
  readonly lastAttemptAt?: string
  readonly revision: number
  readonly projectionVersion: typeof LEARNING_PROJECTION_VERSION
  /** Optional aggregate seed imported without inventing attempt history. */
  readonly legacySeed?: JsonValue
}

export type ProblemMasteryRecord = MasteryRecordBase & {
  readonly entityKind: 'problem'
  readonly entityId: LearningProblemId
}

export type SkillMasteryRecord = MasteryRecordBase & {
  readonly entityKind: 'skill'
  readonly entityId: LearningSkillId
}

export type MasteryRecord = ProblemMasteryRecord | SkillMasteryRecord

export type MasteryProjection = {
  readonly projectionVersion: typeof LEARNING_PROJECTION_VERSION
  readonly problemMastery: Readonly<
    Partial<Record<LearningProblemId, ProblemMasteryRecord>>
  >
  readonly skillMastery: Readonly<
    Partial<Record<LearningSkillId, SkillMasteryRecord>>
  >
  /** Global duplicate guard for incremental event application. */
  readonly appliedEventIds: readonly string[]
  readonly revision: number
}

export type LearningCache = MasteryProjection & {
  readonly schemaVersion: typeof LEARNING_SCHEMA_VERSION
  readonly identityId: string
  /** Canonical v1 history. Event entries are never snapshot-compacted. */
  readonly events: readonly AttemptEvent[]
  readonly updatedAt: string
}

export type LearningEventMutation = {
  readonly kind: 'learning-event'
  readonly event: AttemptEvent
}

export type MasterySnapshotMutation = {
  readonly kind: 'mastery-snapshot'
  readonly entityKey: string
  readonly records: readonly MasteryRecord[]
}

export type LearningOutboxMutation =
  | LearningEventMutation
  | MasterySnapshotMutation

export type LearningOutboxEntry = {
  readonly schemaVersion: typeof LEARNING_SCHEMA_VERSION
  readonly id: string
  readonly identityId: string
  /** Monotonic per-identity ordering key. */
  readonly sequence: number
  readonly createdAt: string
  readonly mutation: LearningOutboxMutation
}

export type LearningOutboxItem = LearningOutboxEntry

export type LearningOutbox = {
  readonly schemaVersion: typeof LEARNING_SCHEMA_VERSION
  readonly identityId: string
  readonly nextSequence: number
  readonly items: readonly LearningOutboxEntry[]
}

export type LocalLearningState = {
  readonly schemaVersion: typeof LEARNING_SCHEMA_VERSION
  readonly identityId: string
  readonly deviceId: string
  readonly nextDeviceSequence: number
  readonly cache: LearningCache
  readonly outbox: LearningOutbox
}
