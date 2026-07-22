import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_REALM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  ACADEMY_EVIDENCE_VERSION,
  ACADEMY_PROGRESS_SCHEMA_VERSION,
  type AcademyMissionCompletionInput,
  type AcademyMissionPracticeInput,
  type AcademyMissionRetentionInput,
  type AcademyProblemProgress,
  type AcademyProgressCounts,
  type AcademyProgressState,
  type AcademyRealmBossDefeatInput,
  type AcademyRealmProgress,
  type AcademyRealmQuizAttemptInput,
  type AcademyTrackProgress,
  type BossDefeatEvidence,
  type MissionCompletionEvidence,
  type MissionPracticeEvidence,
  type NonEmptyAcademyLearningEvidenceIds,
  type RealmQuizAttemptEvidence,
  type RealmQuizEvidence,
} from '../types/academy'
import type { ProblemId, RealmId, TrackId } from '../types/curriculum'
import type { ProblemMasteryRecord } from '../types/learning'

export const ACADEMY_REALM_QUIZ_PASS_SCORE = 80

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  Number.isFinite(Date.parse(value))

const validStableId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 500

const eventIds = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(validStableId).map((id) => id.trim()),
        ),
      ].sort()
    : []

const nonEmptyEventIds = (
  value: unknown,
): NonEmptyAcademyLearningEvidenceIds | undefined => {
  const ids = eventIds(value)
  return ids.length > 0
    ? (ids as NonEmptyAcademyLearningEvidenceIds)
    : undefined
}

const unionIds = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): readonly string[] => [...new Set([...(a ?? []), ...(b ?? [])])].sort()

const timestampNumber = (value: string): number => Date.parse(value)

const RETENTION_MINIMUM_MS =
  NEETCODE_150_MANIFEST.masteryPolicy.delayedRetrievalMinimumHours *
  60 *
  60 *
  1000

function transferAndCodeShareEvent(
  transferIds: readonly string[],
  codeTestIds: readonly string[],
): boolean {
  const code = new Set(codeTestIds)
  return transferIds.some((id) => code.has(id))
}

const earliestTimestamp = (
  ...values: readonly (string | null | undefined)[]
): string | undefined =>
  values
    .filter(validTimestamp)
    .sort(
      (a, b) =>
        timestampNumber(a) - timestampNumber(b) || a.localeCompare(b),
    )[0]

const latestTimestamp = (
  ...values: readonly (string | null | undefined)[]
): string | undefined =>
  values
    .filter(validTimestamp)
    .sort(
      (a, b) =>
        timestampNumber(b) - timestampNumber(a) || b.localeCompare(a),
    )[0]

const score = (value: unknown): number => {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate)
    ? Math.max(0, Math.min(100, candidate))
    : 0
}

const count = (value: unknown): number => {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0
}

function normalizeMissionPracticeEvidence(
  problemId: ProblemId,
  value: unknown,
): MissionPracticeEvidence | undefined {
  const raw = asRecord(value)
  const legacyCompletedAt = validTimestamp(raw?.completedAt)
    ? raw.completedAt
    : undefined
  const acquiredAt = validTimestamp(raw?.acquiredAt)
    ? raw.acquiredAt
    : legacyCompletedAt
  const practicedAt = validTimestamp(raw?.practicedAt)
    ? raw.practicedAt
    : legacyCompletedAt
  const acquisitionEventIds = nonEmptyEventIds(raw?.acquisitionEventIds)
  const transferEventIds = nonEmptyEventIds(raw?.transferEventIds)
  const codeTestEventIds = nonEmptyEventIds(raw?.codeTestEventIds)
  if (
    !raw ||
    raw.problemId !== problemId ||
    raw.acquisitionPassed !== true ||
    raw.transferPassed !== true ||
    raw.codeTestsPassed !== true ||
    !acquiredAt ||
    !practicedAt ||
    timestampNumber(practicedAt) < timestampNumber(acquiredAt) ||
    !acquisitionEventIds ||
    !transferEventIds ||
    !codeTestEventIds ||
    !transferAndCodeShareEvent(transferEventIds, codeTestEventIds)
  ) {
    return undefined
  }

  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    problemId,
    acquiredAt,
    practicedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds,
    transferEventIds,
    codeTestEventIds,
  }
}

function normalizeMissionCompletionEvidence(
  problemId: ProblemId,
  value: unknown,
  practice: MissionPracticeEvidence | undefined,
): MissionCompletionEvidence | undefined {
  const raw = asRecord(value)
  const normalizedPractice =
    practice ?? normalizeMissionPracticeEvidence(problemId, value)
  const retainedAt = validTimestamp(raw?.retainedAt)
    ? raw.retainedAt
    : validTimestamp(raw?.completedAt) && raw?.delayedRetrievalPassed === true
      ? raw.completedAt
      : undefined
  const delayedRetrievalEventIds = nonEmptyEventIds(
    raw?.delayedRetrievalEventIds,
  )
  if (
    !raw ||
    !normalizedPractice ||
    raw.delayedRetrievalPassed !== true ||
    !retainedAt ||
    !delayedRetrievalEventIds ||
    timestampNumber(retainedAt) <
      timestampNumber(normalizedPractice.acquiredAt) + RETENTION_MINIMUM_MS
  ) {
    return undefined
  }
  return {
    ...normalizedPractice,
    delayedRetrievalPassed: true,
    retainedAt,
    completedAt: retainedAt,
    delayedRetrievalEventIds,
    ...(validTimestamp(raw.cloudVerifiedAt)
      ? { cloudVerifiedAt: raw.cloudVerifiedAt }
      : {}),
  }
}

function normalizeQuizAttempt(
  attemptKey: string,
  value: unknown,
): RealmQuizAttemptEvidence | undefined {
  const raw = asRecord(value)
  const attemptId =
    raw && validStableId(raw.attemptId) ? raw.attemptId.trim() : attemptKey
  if (
    !raw ||
    !validStableId(attemptKey) ||
    attemptId !== attemptKey ||
    !validTimestamp(raw.attemptedAt) ||
    !nonEmptyEventIds(raw.learningEventIds)
  ) {
    return undefined
  }
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    attemptId,
    attemptedAt: raw.attemptedAt,
    score: score(raw.score),
    openEndedTransferPassed: raw.openEndedTransferPassed === true,
    learningEventIds: nonEmptyEventIds(raw.learningEventIds)!,
  }
}

function mergeQuizAttempt(
  a: RealmQuizAttemptEvidence,
  b: RealmQuizAttemptEvidence,
): RealmQuizAttemptEvidence {
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    attemptId: a.attemptId,
    attemptedAt:
      earliestTimestamp(a.attemptedAt, b.attemptedAt) ?? a.attemptedAt,
    score: Math.max(a.score, b.score),
    openEndedTransferPassed:
      a.openEndedTransferPassed || b.openEndedTransferPassed,
    learningEventIds: unionIds(a.learningEventIds, b.learningEventIds),
  }
}

type QuizSummaryFloor = Pick<
  RealmQuizEvidence,
  | 'bestScore'
  | 'attemptCount'
  | 'openEndedTransferPassed'
  | 'firstAttemptedAt'
  | 'lastAttemptedAt'
>

function summarizeQuiz(
  realmId: RealmId,
  attempts: Readonly<Record<string, RealmQuizAttemptEvidence>>,
  floor: QuizSummaryFloor,
): RealmQuizEvidence {
  const values = Object.values(attempts)
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    realmId,
    bestScore: Math.max(floor.bestScore, ...values.map((item) => item.score), 0),
    attemptCount: Math.max(floor.attemptCount, values.length),
    openEndedTransferPassed:
      floor.openEndedTransferPassed ||
      values.some((item) => item.openEndedTransferPassed),
    firstAttemptedAt: earliestTimestamp(
      floor.firstAttemptedAt,
      ...values.map((item) => item.attemptedAt),
    ),
    lastAttemptedAt: latestTimestamp(
      floor.lastAttemptedAt,
      ...values.map((item) => item.attemptedAt),
    ),
    attempts,
  }
}

function normalizeQuizEvidence(
  realmId: RealmId,
  value: unknown,
): RealmQuizEvidence | undefined {
  const raw = asRecord(value)
  if (!raw || raw.realmId !== realmId) return undefined

  const rawAttempts = asRecord(raw.attempts) ?? {}
  const attempts: Record<string, RealmQuizAttemptEvidence> = {}
  for (const attemptId of Object.keys(rawAttempts).sort()) {
    const attempt = normalizeQuizAttempt(attemptId, rawAttempts[attemptId])
    if (attempt) attempts[attemptId] = attempt
  }

  return summarizeQuiz(realmId, attempts, {
    bestScore: score(raw.bestScore),
    attemptCount: count(raw.attemptCount),
    openEndedTransferPassed: raw.openEndedTransferPassed === true,
    firstAttemptedAt: validTimestamp(raw.firstAttemptedAt)
      ? raw.firstAttemptedAt
      : undefined,
    lastAttemptedAt: validTimestamp(raw.lastAttemptedAt)
      ? raw.lastAttemptedAt
      : undefined,
  })
}

function normalizeBossEvidence(
  realmId: RealmId,
  value: unknown,
): BossDefeatEvidence | undefined {
  const raw = asRecord(value)
  const defeatIds = nonEmptyEventIds(raw?.defeatIds)
  const learningEventIds = nonEmptyEventIds(raw?.learningEventIds)
  if (
    !raw ||
    raw.realmId !== realmId ||
    !validTimestamp(raw.defeatedAt) ||
    !defeatIds ||
    !learningEventIds
  ) {
    return undefined
  }
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    realmId,
    defeatedAt: raw.defeatedAt,
    defeatIds,
    learningEventIds,
  }
}

export function emptyAcademyProgressState(): AcademyProgressState {
  return {
    schemaVersion: ACADEMY_PROGRESS_SCHEMA_VERSION,
    curriculumId: NEETCODE_150_MANIFEST.id,
    curriculumVersion: NEETCODE_150_MANIFEST.version.schema,
    contentVersion: NEETCODE_150_MANIFEST.version.content,
    missionPractices: {},
    missionCompletions: {},
    realmQuizzes: {},
    bossDefeats: {},
  }
}

/**
 * Upgrades any academy snapshot to the current schema and filters it against
 * the exact manifest. Legacy six-lesson progress is deliberately not accepted.
 */
export function normalizeAcademyProgressState(
  value: unknown,
): AcademyProgressState {
  const raw = asRecord(value)
  if (!raw) return emptyAcademyProgressState()

  const rawPractices = asRecord(raw.missionPractices) ?? {}
  const rawMissions = asRecord(raw.missionCompletions) ?? {}
  const missionPractices: Partial<
    Record<ProblemId, MissionPracticeEvidence>
  > = {}
  const missionCompletions: Partial<
    Record<ProblemId, MissionCompletionEvidence>
  > = {}
  for (const problem of NEETCODE_150_MANIFEST.problems) {
    // A pre-retention completion with real linked practice IDs is downgraded to
    // practice. No delayed evidence or event ID is invented during migration.
    const practice =
      normalizeMissionPracticeEvidence(problem.id, rawPractices[problem.id]) ??
      normalizeMissionPracticeEvidence(problem.id, rawMissions[problem.id])
    if (practice) missionPractices[problem.id] = practice
    const completion = normalizeMissionCompletionEvidence(
      problem.id,
      rawMissions[problem.id],
      practice,
    )
    if (completion) missionCompletions[problem.id] = completion
  }

  const rawQuizzes = asRecord(raw.realmQuizzes) ?? {}
  const realmQuizzes: Partial<Record<RealmId, RealmQuizEvidence>> = {}
  const rawBosses = asRecord(raw.bossDefeats) ?? {}
  const bossDefeats: Partial<Record<RealmId, BossDefeatEvidence>> = {}
  for (const realm of NEETCODE_150_MANIFEST.realms) {
    const quiz = normalizeQuizEvidence(realm.id, rawQuizzes[realm.id])
    if (quiz) realmQuizzes[realm.id] = quiz
    const boss = normalizeBossEvidence(realm.id, rawBosses[realm.id])
    if (boss) bossDefeats[realm.id] = boss
  }

  return {
    schemaVersion: ACADEMY_PROGRESS_SCHEMA_VERSION,
    curriculumId: NEETCODE_150_MANIFEST.id,
    curriculumVersion: NEETCODE_150_MANIFEST.version.schema,
    contentVersion: NEETCODE_150_MANIFEST.version.content,
    missionPractices,
    missionCompletions,
    realmQuizzes,
    bossDefeats,
  }
}

function requireProblemId(problemId: ProblemId): void {
  if (!NEETCODE_150_PROBLEM_BY_ID.has(problemId)) {
    throw new Error(`Problem "${problemId}" is not in the NeetCode 150 manifest`)
  }
}

function requireRealmId(realmId: RealmId): void {
  if (!NEETCODE_150_REALM_BY_ID.has(realmId)) {
    throw new Error(`Realm "${realmId}" is not in the NeetCode 150 manifest`)
  }
}

function requireTrackId(trackId: TrackId): void {
  if (!NEETCODE_150_TRACK_BY_ID.has(trackId)) {
    throw new Error(`Track "${trackId}" is not in the NeetCode 150 manifest`)
  }
}

export function recordMissionPractice(
  state: AcademyProgressState,
  input: AcademyMissionPracticeInput,
): AcademyProgressState {
  requireProblemId(input.problemId)
  const current = normalizeAcademyProgressState(state)
  const acquisitionEventIds = nonEmptyEventIds(input.acquisitionEventIds)
  const transferEventIds = nonEmptyEventIds(input.transferEventIds)
  const codeTestEventIds = nonEmptyEventIds(input.codeTestEventIds)
  if (
    !input.acquisitionPassed ||
    !input.transferPassed ||
    !input.codeTestsPassed ||
    !validTimestamp(input.acquiredAt) ||
    !validTimestamp(input.practicedAt) ||
    timestampNumber(input.practicedAt) < timestampNumber(input.acquiredAt) ||
    !acquisitionEventIds ||
    !transferEventIds ||
    !codeTestEventIds ||
    !transferAndCodeShareEvent(transferEventIds, codeTestEventIds)
  ) {
    return current
  }

  const incoming: MissionPracticeEvidence = {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    problemId: input.problemId,
    acquiredAt: input.acquiredAt,
    practicedAt: input.practicedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds,
    transferEventIds,
    codeTestEventIds,
  }
  const existing = current.missionPractices[input.problemId]
  const evidence: MissionPracticeEvidence = existing
    ? {
        ...incoming,
        acquiredAt:
          earliestTimestamp(existing.acquiredAt, incoming.acquiredAt) ??
          incoming.acquiredAt,
        practicedAt:
          earliestTimestamp(existing.practicedAt, incoming.practicedAt) ??
          incoming.practicedAt,
        acquisitionEventIds: unionIds(
          existing.acquisitionEventIds,
          incoming.acquisitionEventIds,
        ) as NonEmptyAcademyLearningEvidenceIds,
        transferEventIds: unionIds(
          existing.transferEventIds,
          incoming.transferEventIds,
        ) as NonEmptyAcademyLearningEvidenceIds,
        codeTestEventIds: unionIds(
          existing.codeTestEventIds,
          incoming.codeTestEventIds,
        ) as NonEmptyAcademyLearningEvidenceIds,
      }
    : incoming

  return {
    ...current,
    missionPractices: {
      ...current.missionPractices,
      [input.problemId]: evidence,
    },
  }
}

/** Compatibility alias: historical "completion" now records practice only. */
export function recordMissionCompletion(
  state: AcademyProgressState,
  input: AcademyMissionCompletionInput,
): AcademyProgressState {
  return recordMissionPractice(state, {
    ...input,
    acquiredAt: input.completedAt,
    practicedAt: input.completedAt,
  })
}

export function missionRetentionAvailableAt(
  practice: Pick<MissionPracticeEvidence, 'acquiredAt'>,
): string {
  return new Date(
    timestampNumber(practice.acquiredAt) + RETENTION_MINIMUM_MS,
  ).toISOString()
}

export function recordMissionRetention(
  state: AcademyProgressState,
  input: AcademyMissionRetentionInput,
): AcademyProgressState {
  requireProblemId(input.problemId)
  const current = normalizeAcademyProgressState(state)
  const practice = current.missionPractices[input.problemId]
  const delayedRetrievalEventIds = nonEmptyEventIds(
    input.delayedRetrievalEventIds,
  )
  if (
    !practice ||
    !input.delayedRetrievalPassed ||
    !validTimestamp(input.retainedAt) ||
    !delayedRetrievalEventIds ||
    timestampNumber(input.retainedAt) <
      timestampNumber(practice.acquiredAt) + RETENTION_MINIMUM_MS
  ) {
    return current
  }

  const existing = current.missionCompletions[input.problemId]
  const retainedAt =
    earliestTimestamp(existing?.retainedAt, input.retainedAt) ??
    input.retainedAt
  const completion: MissionCompletionEvidence = {
    ...practice,
    delayedRetrievalPassed: true,
    retainedAt,
    completedAt: retainedAt,
    delayedRetrievalEventIds: unionIds(
      existing?.delayedRetrievalEventIds,
      delayedRetrievalEventIds,
    ) as NonEmptyAcademyLearningEvidenceIds,
  }
  return {
    ...current,
    missionCompletions: {
      ...current.missionCompletions,
      [input.problemId]: completion,
    },
  }
}

export function isMissionRetentionDue(
  state: AcademyProgressState,
  problemId: ProblemId,
  at: string | number = Date.now(),
): boolean {
  requireProblemId(problemId)
  const normalized = normalizeAcademyProgressState(state)
  if (normalized.missionCompletions[problemId]) return false
  const practice = normalized.missionPractices[problemId]
  if (!practice) return false
  const atMs = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(atMs)) throw new RangeError(`Invalid timestamp: ${at}`)
  return atMs >= Date.parse(missionRetentionAvailableAt(practice))
}

export function recordRealmQuizAttempt(
  state: AcademyProgressState,
  input: AcademyRealmQuizAttemptInput,
): AcademyProgressState {
  requireRealmId(input.realmId)
  const learningEventIds = nonEmptyEventIds(input.learningEventIds)
  if (
    !validStableId(input.attemptId) ||
    !validTimestamp(input.attemptedAt) ||
    !learningEventIds
  ) {
    return normalizeAcademyProgressState(state)
  }

  const current = normalizeAcademyProgressState(state)
  const existing = current.realmQuizzes[input.realmId]
  const attempts = { ...(existing?.attempts ?? {}) }
  const attemptId = input.attemptId.trim()
  const incoming: RealmQuizAttemptEvidence = {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    attemptId,
    attemptedAt: input.attemptedAt,
    score: score(input.score),
    openEndedTransferPassed: input.openEndedTransferPassed,
    learningEventIds,
  }
  const duplicate = attempts[attemptId]
  attempts[attemptId] = duplicate
    ? mergeQuizAttempt(duplicate, incoming)
    : incoming

  const knownBefore = Object.keys(existing?.attempts ?? {}).length
  const unidentifiedAttempts = Math.max(
    0,
    (existing?.attemptCount ?? 0) - knownBefore,
  )
  const evidence = summarizeQuiz(input.realmId, attempts, {
    bestScore: existing?.bestScore ?? 0,
    attemptCount: Object.keys(attempts).length + unidentifiedAttempts,
    openEndedTransferPassed:
      existing?.openEndedTransferPassed === true,
    firstAttemptedAt: existing?.firstAttemptedAt,
    lastAttemptedAt: existing?.lastAttemptedAt,
  })

  return {
    ...current,
    realmQuizzes: {
      ...current.realmQuizzes,
      [input.realmId]: evidence,
    },
  }
}

export function recordRealmBossDefeat(
  state: AcademyProgressState,
  input: AcademyRealmBossDefeatInput,
): AcademyProgressState {
  requireRealmId(input.realmId)
  const learningEventIds = nonEmptyEventIds(input.learningEventIds)
  if (
    !validStableId(input.defeatId) ||
    !validTimestamp(input.defeatedAt) ||
    !learningEventIds
  ) {
    return normalizeAcademyProgressState(state)
  }
  const current = normalizeAcademyProgressState(state)
  const existing = current.bossDefeats[input.realmId]
  const evidence: BossDefeatEvidence = {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    realmId: input.realmId,
    defeatedAt:
      earliestTimestamp(existing?.defeatedAt, input.defeatedAt) ??
      input.defeatedAt,
    defeatIds: unionIds(existing?.defeatIds, [input.defeatId.trim()]),
    learningEventIds: unionIds(
      existing?.learningEventIds,
      learningEventIds,
    ),
  }
  return {
    ...current,
    bossDefeats: {
      ...current.bossDefeats,
      [input.realmId]: evidence,
    },
  }
}

function mergeMissionPracticeEvidence(
  a: MissionPracticeEvidence,
  b: MissionPracticeEvidence,
): MissionPracticeEvidence {
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    problemId: a.problemId,
    acquiredAt: earliestTimestamp(a.acquiredAt, b.acquiredAt) ?? a.acquiredAt,
    practicedAt:
      earliestTimestamp(a.practicedAt, b.practicedAt) ?? a.practicedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: unionIds(
      a.acquisitionEventIds,
      b.acquisitionEventIds,
    ) as NonEmptyAcademyLearningEvidenceIds,
    transferEventIds: unionIds(
      a.transferEventIds,
      b.transferEventIds,
    ) as NonEmptyAcademyLearningEvidenceIds,
    codeTestEventIds: unionIds(
      a.codeTestEventIds,
      b.codeTestEventIds,
    ) as NonEmptyAcademyLearningEvidenceIds,
  }
}

export function markMissionRetentionCloudVerified(
  state: AcademyProgressState,
  problemId: ProblemId,
  verifiedAt = new Date().toISOString(),
): AcademyProgressState {
  requireProblemId(problemId)
  if (!validTimestamp(verifiedAt)) return normalizeAcademyProgressState(state)
  const current = normalizeAcademyProgressState(state)
  const completion = current.missionCompletions[problemId]
  if (!completion) return current
  return {
    ...current,
    missionCompletions: {
      ...current.missionCompletions,
      [problemId]: {
        ...completion,
        cloudVerifiedAt:
          earliestTimestamp(completion.cloudVerifiedAt, verifiedAt) ??
          verifiedAt,
      },
    },
  }
}

function mergeMissionEvidence(
  a: MissionCompletionEvidence,
  b: MissionCompletionEvidence,
): MissionCompletionEvidence {
  const practice = mergeMissionPracticeEvidence(a, b)
  const retainedAt =
    earliestTimestamp(a.retainedAt, b.retainedAt) ?? a.retainedAt
  return {
    ...practice,
    delayedRetrievalPassed: true,
    retainedAt,
    completedAt: retainedAt,
    delayedRetrievalEventIds: unionIds(
      a.delayedRetrievalEventIds,
      b.delayedRetrievalEventIds,
    ) as NonEmptyAcademyLearningEvidenceIds,
    ...(a.cloudVerifiedAt || b.cloudVerifiedAt
      ? {
          cloudVerifiedAt:
            earliestTimestamp(a.cloudVerifiedAt, b.cloudVerifiedAt) ??
            a.cloudVerifiedAt ??
            b.cloudVerifiedAt,
        }
      : {}),
  }
}

function mergeQuizEvidence(
  a: RealmQuizEvidence,
  b: RealmQuizEvidence,
): RealmQuizEvidence {
  const attempts: Record<string, RealmQuizAttemptEvidence> = { ...a.attempts }
  for (const attemptId of Object.keys(b.attempts).sort()) {
    const incoming = b.attempts[attemptId]
    if (!incoming) continue
    attempts[attemptId] = attempts[attemptId]
      ? mergeQuizAttempt(attempts[attemptId], incoming)
      : incoming
  }
  const unknownA = Math.max(0, a.attemptCount - Object.keys(a.attempts).length)
  const unknownB = Math.max(0, b.attemptCount - Object.keys(b.attempts).length)
  return summarizeQuiz(a.realmId, attempts, {
    bestScore: Math.max(a.bestScore, b.bestScore),
    attemptCount: Object.keys(attempts).length + Math.max(unknownA, unknownB),
    openEndedTransferPassed:
      a.openEndedTransferPassed || b.openEndedTransferPassed,
    firstAttemptedAt: earliestTimestamp(
      a.firstAttemptedAt,
      b.firstAttemptedAt,
    ),
    lastAttemptedAt: latestTimestamp(a.lastAttemptedAt, b.lastAttemptedAt),
  })
}

function mergeBossEvidence(
  a: BossDefeatEvidence,
  b: BossDefeatEvidence,
): BossDefeatEvidence {
  return {
    evidenceVersion: ACADEMY_EVIDENCE_VERSION,
    realmId: a.realmId,
    defeatedAt:
      earliestTimestamp(a.defeatedAt, b.defeatedAt) ?? a.defeatedAt,
    defeatIds: unionIds(a.defeatIds, b.defeatIds),
    learningEventIds: unionIds(a.learningEventIds, b.learningEventIds),
  }
}

/** Event-like, monotonic, commutative reconciliation for academy facts. */
export function mergeAcademyProgressStates(
  aValue: AcademyProgressState | undefined,
  bValue: AcademyProgressState | undefined,
): AcademyProgressState {
  const a = normalizeAcademyProgressState(aValue)
  const b = normalizeAcademyProgressState(bValue)
  const missionPractices: Partial<
    Record<ProblemId, MissionPracticeEvidence>
  > = {}
  const missionCompletions: Partial<
    Record<ProblemId, MissionCompletionEvidence>
  > = {}
  for (const problem of NEETCODE_150_MANIFEST.problems) {
    const leftPractice = a.missionPractices[problem.id]
    const rightPractice = b.missionPractices[problem.id]
    if (leftPractice && rightPractice) {
      missionPractices[problem.id] = mergeMissionPracticeEvidence(
        leftPractice,
        rightPractice,
      )
    } else if (leftPractice ?? rightPractice) {
      missionPractices[problem.id] = leftPractice ?? rightPractice
    }

    const left = a.missionCompletions[problem.id]
    const right = b.missionCompletions[problem.id]
    if (left && right) {
      missionCompletions[problem.id] = mergeMissionEvidence(left, right)
    } else if (left ?? right) {
      missionCompletions[problem.id] = left ?? right
    }
  }

  const realmQuizzes: Partial<Record<RealmId, RealmQuizEvidence>> = {}
  const bossDefeats: Partial<Record<RealmId, BossDefeatEvidence>> = {}
  for (const realm of NEETCODE_150_MANIFEST.realms) {
    const leftQuiz = a.realmQuizzes[realm.id]
    const rightQuiz = b.realmQuizzes[realm.id]
    if (leftQuiz && rightQuiz) {
      realmQuizzes[realm.id] = mergeQuizEvidence(leftQuiz, rightQuiz)
    } else if (leftQuiz ?? rightQuiz) {
      realmQuizzes[realm.id] = leftQuiz ?? rightQuiz
    }

    const leftBoss = a.bossDefeats[realm.id]
    const rightBoss = b.bossDefeats[realm.id]
    if (leftBoss && rightBoss) {
      bossDefeats[realm.id] = mergeBossEvidence(leftBoss, rightBoss)
    } else if (leftBoss ?? rightBoss) {
      bossDefeats[realm.id] = leftBoss ?? rightBoss
    }
  }

  return {
    ...emptyAcademyProgressState(),
    missionPractices,
    missionCompletions,
    realmQuizzes,
    bossDefeats,
  }
}

export function isMissionCompleted(
  state: AcademyProgressState,
  problemId: ProblemId,
): boolean {
  requireProblemId(problemId)
  return !!normalizeAcademyProgressState(state).missionCompletions[problemId]
}

export function selectAcademyProblemProgress(
  state: AcademyProgressState,
  problemId: ProblemId,
  currentMastery?: ProblemMasteryRecord,
): AcademyProblemProgress {
  requireProblemId(problemId)
  const normalized = normalizeAcademyProgressState(state)
  const practiceEvidence = normalized.missionPractices[problemId]
  const evidence = normalized.missionCompletions[problemId]
  return {
    problemId,
    missionPracticed: !!practiceEvidence,
    missionCompleted: !!evidence,
    practiceEvidence,
    completionEvidence: evidence,
    currentMastery,
  }
}

function trackProgressFromNormalized(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyTrackProgress {
  const track = NEETCODE_150_TRACK_BY_ID.get(trackId)
  if (!track) {
    throw new Error(`Track "${trackId}" is not in the NeetCode 150 manifest`)
  }
  const practicedProblems = track.problemIds.filter(
    (problemId) => !!state.missionPractices[problemId],
  ).length
  const completedProblems = track.problemIds.filter(
    (problemId) => !!state.missionCompletions[problemId],
  ).length
  const firstUnpracticedProblemId =
    track.problemIds.find(
      (problemId) => !state.missionPractices[problemId],
    ) ?? null
  const firstIncompleteProblemId =
    track.problemIds.find(
      (problemId) => !state.missionCompletions[problemId],
    ) ?? null
  return {
    trackId,
    realmId: track.realmId,
    practicedProblems,
    completedProblems,
    totalProblems: track.problemIds.length,
    practiceComplete: practicedProblems === track.problemIds.length,
    complete: completedProblems === track.problemIds.length,
    firstUnpracticedProblemId,
    firstIncompleteProblemId,
  }
}

export function selectTrackProgress(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyTrackProgress {
  requireTrackId(trackId)
  return trackProgressFromNormalized(
    normalizeAcademyProgressState(state),
    trackId,
  )
}

export function isTrackComplete(
  state: AcademyProgressState,
  trackId: TrackId,
): boolean {
  return selectTrackProgress(state, trackId).complete
}

function realmProgressFromNormalized(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyRealmProgress {
  const realm = NEETCODE_150_REALM_BY_ID.get(realmId)
  if (!realm) {
    throw new Error(`Realm "${realmId}" is not in the NeetCode 150 manifest`)
  }
  const tracks = realm.trackIds.map((trackId) =>
    trackProgressFromNormalized(state, trackId),
  )
  const quiz = state.realmQuizzes[realmId]
  const quizBestScore = quiz?.bestScore ?? 0
  const openEndedTransferPassed =
    quiz?.openEndedTransferPassed === true
  // A realm pass is atomic: one stable attempt must satisfy both the score and
  // transfer gates. Display summaries may retain the best score / any transfer
  // success across retries, but those independent facts cannot be combined to
  // manufacture a passing attempt.
  const quizPassed = Object.values(quiz?.attempts ?? {}).some(
    (attempt) =>
      attempt.score >= ACADEMY_REALM_QUIZ_PASS_SCORE &&
      attempt.openEndedTransferPassed,
  )
  const practicedTracks = tracks.filter(({ practiceComplete }) => practiceComplete)
    .length
  const completedTracks = tracks.filter(({ complete }) => complete).length
  const knowledgePassed = completedTracks === 3 && quizPassed
  const bossDefeated = !!state.bossDefeats[realmId]
  return {
    realmId,
    practicedProblems: tracks.reduce(
      (total, track) => total + track.practicedProblems,
      0,
    ),
    completedProblems: tracks.reduce(
      (total, track) => total + track.completedProblems,
      0,
    ),
    totalProblems: tracks.reduce(
      (total, track) => total + track.totalProblems,
      0,
    ),
    practicedTracks,
    completedTracks,
    totalTracks: 3,
    quizBestScore,
    quizAttemptCount: quiz?.attemptCount ?? 0,
    quizPassed,
    openEndedTransferPassed,
    knowledgePassed,
    bossDefeated,
    cleared: knowledgePassed && bossDefeated,
    firstIncompleteTrackId:
      tracks.find(({ complete }) => !complete)?.trackId ?? null,
    firstIncompleteProblemId:
      tracks
        .map(({ firstIncompleteProblemId }) => firstIncompleteProblemId)
        .find((problemId): problemId is ProblemId => problemId !== null) ?? null,
  }
}

export function selectRealmProgress(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyRealmProgress {
  requireRealmId(realmId)
  return realmProgressFromNormalized(
    normalizeAcademyProgressState(state),
    realmId,
  )
}

export function isRealmQuizPassed(
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  return selectRealmProgress(state, realmId).quizPassed
}

export function isRealmKnowledgePassed(
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  return selectRealmProgress(state, realmId).knowledgePassed
}

export function isRealmCleared(
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  return selectRealmProgress(state, realmId).cleared
}

export function isAcademyCampaignComplete(
  state: AcademyProgressState,
): boolean {
  const normalized = normalizeAcademyProgressState(state)
  return NEETCODE_150_MANIFEST.realms.every(
    ({ id }) => realmProgressFromNormalized(normalized, id).cleared,
  )
}

export function isAcademyFinalGauntletReady(
  state: AcademyProgressState,
  interZoneComplete: boolean,
): boolean {
  return isAcademyCampaignComplete(state) && interZoneComplete
}

export function selectFirstIncompleteRealm(
  state: AcademyProgressState,
): RealmId | null {
  const normalized = normalizeAcademyProgressState(state)
  return (
    NEETCODE_150_MANIFEST.realms.find(
      ({ id }) => !realmProgressFromNormalized(normalized, id).cleared,
    )?.id ?? null
  )
}

export function selectFirstIncompleteTrack(
  state: AcademyProgressState,
  realmId?: RealmId,
): TrackId | null {
  const normalized = normalizeAcademyProgressState(state)
  if (realmId) {
    requireRealmId(realmId)
    const realm = NEETCODE_150_REALM_BY_ID.get(realmId)
    return (
      realm?.trackIds.find(
        (trackId) => !trackProgressFromNormalized(normalized, trackId).complete,
      ) ?? null
    )
  }
  return (
    NEETCODE_150_MANIFEST.tracks.find(
      ({ id }) => !trackProgressFromNormalized(normalized, id).complete,
    )?.id ?? null
  )
}

export function selectFirstIncompleteProblem(
  state: AcademyProgressState,
  trackId?: TrackId,
): ProblemId | null {
  const normalized = normalizeAcademyProgressState(state)
  if (trackId) {
    requireTrackId(trackId)
    return trackProgressFromNormalized(normalized, trackId)
      .firstIncompleteProblemId
  }
  return (
    NEETCODE_150_MANIFEST.problems.find(
      ({ id }) => !normalized.missionCompletions[id],
    )?.id ?? null
  )
}

export function selectFirstUnpracticedProblem(
  state: AcademyProgressState,
  trackId?: TrackId,
): ProblemId | null {
  const normalized = normalizeAcademyProgressState(state)
  if (trackId) {
    requireTrackId(trackId)
    return trackProgressFromNormalized(normalized, trackId)
      .firstUnpracticedProblemId
  }
  return (
    NEETCODE_150_MANIFEST.problems.find(
      ({ id }) => !normalized.missionPractices[id],
    )?.id ?? null
  )
}

export function selectActiveAcademyProblemId(
  state: AcademyProgressState,
): ProblemId | null {
  return (
    selectFirstUnpracticedProblem(state) ??
    selectFirstIncompleteProblem(state)
  )
}

export function selectAcademyProgressCounts(
  state: AcademyProgressState,
): AcademyProgressCounts {
  const normalized = normalizeAcademyProgressState(state)
  const tracks = NEETCODE_150_MANIFEST.tracks.map(({ id }) =>
    trackProgressFromNormalized(normalized, id),
  )
  const realms = NEETCODE_150_MANIFEST.realms.map(({ id }) =>
    realmProgressFromNormalized(normalized, id),
  )
  return {
    practicedProblems: Object.keys(normalized.missionPractices).length,
    completedProblems: Object.keys(normalized.missionCompletions).length,
    totalProblems: NEETCODE_150_MANIFEST.problems.length,
    practicedTracks: tracks.filter(({ practiceComplete }) => practiceComplete)
      .length,
    completedTracks: tracks.filter(({ complete }) => complete).length,
    totalTracks: tracks.length,
    knowledgePassedRealms: realms.filter(({ knowledgePassed }) => knowledgePassed)
      .length,
    clearedRealms: realms.filter(({ cleared }) => cleared).length,
    totalRealms: realms.length,
  }
}

