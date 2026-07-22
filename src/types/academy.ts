import type {
  ContentVersion,
  CurriculumId,
  ProblemId,
  RealmId,
  TrackId,
} from './curriculum'
import type { ProblemMasteryRecord } from './learning'

export const ACADEMY_PROGRESS_SCHEMA_VERSION = 1 as const
export const ACADEMY_EVIDENCE_VERSION = 1 as const

export type AcademyLearningEvidenceIds = readonly string[]
export type NonEmptyAcademyLearningEvidenceIds = readonly [
  string,
  ...string[],
]

/**
 * Durable, immediate practice evidence. This unlocks later missions but does
 * not count as retained mastery or academy completion.
 */
export type MissionPracticeEvidence = {
  readonly evidenceVersion: typeof ACADEMY_EVIDENCE_VERSION
  readonly problemId: ProblemId
  /** Timestamp of the clean acquisition event that starts the retention clock. */
  readonly acquiredAt: string
  readonly practicedAt: string
  readonly acquisitionPassed: true
  readonly transferPassed: true
  readonly codeTestsPassed: true
  readonly acquisitionEventIds: NonEmptyAcademyLearningEvidenceIds
  readonly transferEventIds: NonEmptyAcademyLearningEvidenceIds
  readonly codeTestEventIds: NonEmptyAcademyLearningEvidenceIds
}

/** A retained mission is practice plus clean delayed retrieval after the policy wait. */
export type MissionCompletionEvidence = MissionPracticeEvidence & {
  readonly delayedRetrievalPassed: true
  readonly retainedAt: string
  /** Compatibility completion timestamp; always equal to retainedAt. */
  readonly completedAt: string
  readonly delayedRetrievalEventIds: NonEmptyAcademyLearningEvidenceIds
  /** Present only after the server accepts linked received_at timing. */
  readonly cloudVerifiedAt?: string
}

export type AcademyMissionPracticeInput = {
  readonly problemId: ProblemId
  readonly acquiredAt: string
  readonly practicedAt: string
  readonly acquisitionPassed: boolean
  readonly transferPassed: boolean
  readonly codeTestsPassed: boolean
  /** IDs from the immutable v1 learning event log. */
  readonly acquisitionEventIds?: AcademyLearningEvidenceIds
  /** IDs from the immutable v1 learning event log. */
  readonly transferEventIds?: AcademyLearningEvidenceIds
  /** IDs from the immutable v1 learning event log. */
  readonly codeTestEventIds?: AcademyLearningEvidenceIds
}

/** @deprecated Historical immediate-completion input; now records practice. */
export type AcademyMissionCompletionInput = Omit<
  AcademyMissionPracticeInput,
  'acquiredAt' | 'practicedAt'
> & {
  readonly completedAt: string
}

export type AcademyMissionRetentionInput = {
  readonly problemId: ProblemId
  readonly retainedAt: string
  readonly delayedRetrievalPassed: boolean
  readonly delayedRetrievalEventIds?: AcademyLearningEvidenceIds
}

export type RealmQuizAttemptEvidence = {
  readonly evidenceVersion: typeof ACADEMY_EVIDENCE_VERSION
  /** Stable identity makes retries and cross-device merges idempotent. */
  readonly attemptId: string
  readonly attemptedAt: string
  readonly score: number
  readonly openEndedTransferPassed: boolean
  /** IDs from the immutable v1 learning event log. */
  readonly learningEventIds: AcademyLearningEvidenceIds
}

export type RealmQuizEvidence = {
  readonly evidenceVersion: typeof ACADEMY_EVIDENCE_VERSION
  readonly realmId: RealmId
  /**
   * Explicit summaries support safe migration from snapshots that predate
   * stable attempt IDs. New attempts are also retained below for exact merges.
   */
  readonly bestScore: number
  readonly attemptCount: number
  readonly openEndedTransferPassed: boolean
  readonly firstAttemptedAt?: string
  readonly lastAttemptedAt?: string
  readonly attempts: Readonly<Record<string, RealmQuizAttemptEvidence>>
}

export type AcademyRealmQuizAttemptInput = {
  readonly realmId: RealmId
  readonly attemptId: string
  readonly attemptedAt: string
  readonly score: number
  readonly openEndedTransferPassed: boolean
  /** IDs from the immutable v1 learning event log. */
  readonly learningEventIds?: AcademyLearningEvidenceIds
}

export type BossDefeatEvidence = {
  readonly evidenceVersion: typeof ACADEMY_EVIDENCE_VERSION
  readonly realmId: RealmId
  readonly defeatedAt: string
  /** Stable battle IDs are unioned when devices reconcile. */
  readonly defeatIds: readonly string[]
  /** Optional v1 learning events produced during the battle. */
  readonly learningEventIds: AcademyLearningEvidenceIds
}

export type AcademyRealmBossDefeatInput = {
  readonly realmId: RealmId
  readonly defeatId: string
  readonly defeatedAt: string
  readonly learningEventIds?: AcademyLearningEvidenceIds
}

/**
 * Academy completion facts only. Quiz pass, realm clear, campaign completion,
 * and current mastery are derived selectors rather than writable latches.
 */
export type AcademyProgressState = {
  readonly schemaVersion: typeof ACADEMY_PROGRESS_SCHEMA_VERSION
  readonly curriculumId: CurriculumId
  /** Manifest schema/curriculum version. */
  readonly curriculumVersion: ContentVersion
  /** Version of the authored mission content. */
  readonly contentVersion: ContentVersion
  readonly missionPractices: Readonly<
    Partial<Record<ProblemId, MissionPracticeEvidence>>
  >
  readonly missionCompletions: Readonly<
    Partial<Record<ProblemId, MissionCompletionEvidence>>
  >
  readonly realmQuizzes: Readonly<Partial<Record<RealmId, RealmQuizEvidence>>>
  readonly bossDefeats: Readonly<Partial<Record<RealmId, BossDefeatEvidence>>>
}

/** Derived view: durable completion and mutable mastery remain distinct. */
export type AcademyProblemProgress = {
  readonly problemId: ProblemId
  readonly missionPracticed: boolean
  readonly missionCompleted: boolean
  readonly practiceEvidence?: MissionPracticeEvidence
  readonly completionEvidence?: MissionCompletionEvidence
  readonly currentMastery?: ProblemMasteryRecord
}

export type AcademyTrackProgress = {
  readonly trackId: TrackId
  readonly realmId: RealmId
  readonly practicedProblems: number
  readonly completedProblems: number
  readonly totalProblems: number
  readonly practiceComplete: boolean
  readonly complete: boolean
  readonly firstUnpracticedProblemId: ProblemId | null
  readonly firstIncompleteProblemId: ProblemId | null
}

export type AcademyRealmProgress = {
  readonly realmId: RealmId
  readonly practicedProblems: number
  readonly completedProblems: number
  readonly totalProblems: number
  readonly practicedTracks: number
  readonly completedTracks: number
  readonly totalTracks: 3
  readonly quizBestScore: number
  readonly quizAttemptCount: number
  readonly quizPassed: boolean
  readonly openEndedTransferPassed: boolean
  readonly knowledgePassed: boolean
  readonly bossDefeated: boolean
  readonly cleared: boolean
  readonly firstIncompleteTrackId: TrackId | null
  readonly firstIncompleteProblemId: ProblemId | null
}

export type AcademyProgressCounts = {
  readonly practicedProblems: number
  readonly completedProblems: number
  readonly totalProblems: number
  readonly practicedTracks: number
  readonly completedTracks: number
  readonly totalTracks: number
  readonly knowledgePassedRealms: number
  readonly clearedRealms: number
  readonly totalRealms: number
}
