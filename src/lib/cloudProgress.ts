import type { SupabaseClient, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type {
  AttemptRecord,
  ExperienceLevel,
  LessonProgress,
  LessonReview,
  LessonStatus,
  ProgressState,
  StreakState,
} from '../types/progress'
import { emptyState } from './localProgress'
import { generateLesson } from '../content/lessons'
import { isLearnComplete, normalizeLessonProgress, withLearnCompletedFlag } from './lessonSections'
import type { ConceptSkill } from './learnerModel'
import type { ConceptId } from '../types/lesson'
import {
  badgeCountsFromEarnedList,
  normalizeBadgeCounts,
  type BadgeCounts,
} from '../content/badges'
import {
  ACADEMY_EVIDENCE_VERSION,
  ACADEMY_PROGRESS_SCHEMA_VERSION,
  type AcademyProgressState,
  type BossDefeatEvidence,
  type MissionCompletionEvidence,
  type MissionPracticeEvidence,
  type NonEmptyAcademyLearningEvidenceIds,
  type RealmQuizAttemptEvidence,
  type RealmQuizEvidence,
} from '../types/academy'
import type { ProblemId, RealmId } from '../types/curriculum'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_REALM_BY_ID,
} from '../content/curricula/neetcode150'
import {
  emptyAcademyProgressState,
  normalizeAcademyProgressState,
} from './academyProgress'
import {
  emptyGauntletState,
  normalizeGauntletState,
  type GauntletState,
} from './gauntletProgress'

type LessonProgressRow = {
  lesson_id: string
  status: string
  current_step_index: number
  completed_step_ids: string[]
  correct_count: number
  wrong_count: number
  total_attempts: number
  correct_first_try: number
  accuracy: number
  mastery_score: number
  unlock_next_lesson: boolean
  completed_at: string | null
  updated_at: string | null
  last_review?: LessonReview | null
  learn_completed?: boolean | null
  learn_step_index?: number | null
  quiz_step_index?: number | null
  learn_frame_index?: number | null
  quiz_frame_index?: number | null
}

type ConceptMasteryRow = {
  concept_id: string
  ability: number
  confidence: number
  seen: number
  correct_first_try: number
  box: number
  due_at: string | null
  last_seen_at: string | null
  recent_results: boolean[]
}

export type AcademyProblemProgressRow = {
  problem_id: string
  schema_version: number | string
  evidence_version: number | string
  curriculum_id: string
  curriculum_version: string
  content_version: string
  acquired_at: string
  practiced_at: string
  retained_at: string | null
  completed_at: string | null
  acquisition_passed: boolean
  transfer_passed: boolean
  code_tests_passed: boolean
  delayed_retrieval_passed: boolean
  acquisition_event_ids: string[] | null
  transfer_event_ids: string[] | null
  code_test_event_ids: string[] | null
  delayed_retrieval_event_ids: string[] | null
}

export type AcademyRealmProgressRow = {
  realm_id: string
  schema_version: number | string
  evidence_version: number | string
  curriculum_id: string
  curriculum_version: string
  content_version: string
  quiz_best_score: number | string
  quiz_attempt_count: number | string
  quiz_open_ended_transfer_passed: boolean
  quiz_first_attempted_at: string | null
  quiz_last_attempted_at: string | null
  quiz_attempts: Record<string, RealmQuizAttemptEvidence> | null
  boss_defeated: boolean
  boss_defeated_at: string | null
  boss_defeat_ids: string[] | null
  boss_learning_event_ids: string[] | null
}

const ACADEMY_PROBLEM_COLUMNS =
  'problem_id, schema_version, evidence_version, curriculum_id, curriculum_version, content_version, acquired_at, practiced_at, retained_at, completed_at, acquisition_passed, transfer_passed, code_tests_passed, delayed_retrieval_passed, acquisition_event_ids, transfer_event_ids, code_test_event_ids, delayed_retrieval_event_ids'

const ACADEMY_REALM_COLUMNS =
  'realm_id, schema_version, evidence_version, curriculum_id, curriculum_version, content_version, quiz_best_score, quiz_attempt_count, quiz_open_ended_transfer_passed, quiz_first_attempted_at, quiz_last_attempted_at, quiz_attempts, boss_defeated, boss_defeated_at, boss_defeat_ids, boss_learning_event_ids'

type AcademyCloudUnavailableReason = 'not-configured' | 'migration-missing'

export type AcademyCloudLoadResult =
  | {
      readonly status: 'ok'
      readonly state: AcademyProgressState
    }
  | {
      readonly status: 'unavailable'
      readonly reason: AcademyCloudUnavailableReason
      readonly state: AcademyProgressState
    }

export type AcademyCloudWriteResult =
  | { readonly status: 'ok' }
  | {
      readonly status: 'unavailable'
      readonly reason: AcademyCloudUnavailableReason
    }

type GauntletProgressRow = {
  version: number | string
  revision: number | string
  best_score: number | string
  attempts: number | string
  exam_passed: boolean
  exam_passed_at: string | null
  certification_requirements_passed: boolean
  final_boss_beaten: boolean
  final_boss_beaten_at: string | null
  concepts: GauntletState['concepts'] | null
  legacy_attempt_count: number | string
  legacy_best_score: number | string
  legacy_exam_passed: boolean
  legacy_exam_passed_at: string | null
  legacy_final_boss_beaten: boolean
  legacy_final_boss_beaten_at: string | null
  legacy_concepts: GauntletState['legacyConcepts'] | null
  certification_attempts: GauntletState['certificationAttempts'] | null
  concept_outcomes: GauntletState['conceptOutcomes'] | null
  final_boss_defeats: GauntletState['finalBossDefeats'] | null
}

export type GauntletCloudLoadResult =
  | { readonly status: 'ok'; readonly state: GauntletState }
  | {
      readonly status: 'unavailable'
      readonly reason: AcademyCloudUnavailableReason
      readonly state: GauntletState
    }

/** Columns guaranteed to exist in the original schema. */
const CORE_LESSON_COLUMNS =
  'lesson_id, status, current_step_index, completed_step_ids, correct_count, wrong_count, total_attempts, correct_first_try, accuracy, mastery_score, unlock_next_lesson, completed_at, updated_at'

const SECTION_LESSON_COLUMNS =
  `${CORE_LESSON_COLUMNS}, learn_completed, learn_step_index, quiz_step_index, learn_frame_index, quiz_frame_index`

const SECTION_BASE_COLUMNS =
  `${CORE_LESSON_COLUMNS}, learn_completed, learn_step_index, quiz_step_index`

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function isMissingSchemaField(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  return code === '42703' || code === 'PGRST204'
}

function isMissingSchemaResource(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  return (
    isMissingSchemaField(error) ||
    code === '42P01' ||
    code === 'PGRST205'
  )
}

const cloudErrorText = (error: unknown): string => {
  if (!error || typeof error !== 'object') return String(error).toLowerCase()
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

/** Only absence of the academy migration is allowed to degrade to local-only. */
export function isAcademyMigrationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205'
  ) {
    return true
  }
  if (code === '42703' || code === 'PGRST204') return true
  const message = cloudErrorText(error)
  if (
    message.includes('problem_progress') ||
    message.includes('realm_progress') ||
    message.includes('merge_academy_mission_progress') ||
    message.includes('merge_academy_realm_progress') ||
    message.includes('merge_academy_progress')
  ) {
    return message.includes('does not exist') || message.includes('not found')
  }
  return false
}

export function isGauntletMigrationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (['42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
    return true
  }
  const message = cloudErrorText(error)
  return (
    (message.includes('gauntlet_progress') ||
      message.includes('merge_gauntlet_progress')) &&
    (message.includes('does not exist') || message.includes('not found'))
  )
}

function academyNumber(value: number | string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid academy ${label} returned by Supabase`)
  }
  return parsed
}

function academyTimestamp(
  value: string | null,
  label: string,
): string | undefined {
  if (value === null) return undefined
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid academy ${label} returned by Supabase`)
  }
  return value
}

function academyIds(value: string[] | null, label: string): readonly string[] {
  if (value === null) return []
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'string' || id.trim().length === 0)
  ) {
    throw new Error(`Invalid academy ${label} returned by Supabase`)
  }
  return [...new Set(value.map((id) => id.trim()))].sort()
}

function academyNonEmptyIds(
  value: string[] | null,
  label: string,
): NonEmptyAcademyLearningEvidenceIds {
  const ids = academyIds(value, label)
  if (ids.length === 0) {
    throw new Error(`Missing academy ${label}`)
  }
  return ids as NonEmptyAcademyLearningEvidenceIds
}

function assertAcademyRowMetadata(row: {
  schema_version: number | string
  evidence_version: number | string
  curriculum_id: string
  curriculum_version: string
  content_version: string
}): void {
  if (
    academyNumber(row.schema_version, 'schema version') !==
      ACADEMY_PROGRESS_SCHEMA_VERSION ||
    academyNumber(row.evidence_version, 'evidence version') !==
      ACADEMY_EVIDENCE_VERSION
  ) {
    throw new Error(
      `Unsupported cloud academy version ${row.schema_version}/${row.evidence_version}`,
    )
  }
  if (
    row.curriculum_id !== NEETCODE_150_MANIFEST.id ||
    row.curriculum_version !== NEETCODE_150_MANIFEST.version.schema
  ) {
    throw new Error(
      `Unexpected cloud academy curriculum ${row.curriculum_id}@${row.curriculum_version}`,
    )
  }
  if (!/^v\d+\.\d+\.\d+$/u.test(row.content_version)) {
    throw new Error('Invalid academy content version returned by Supabase')
  }
}

export function academyMissionEvidenceFromRow(
  row: AcademyProblemProgressRow,
): {
  readonly practice: MissionPracticeEvidence
  readonly completion?: MissionCompletionEvidence
} {
  assertAcademyRowMetadata(row)
  const problemId = row.problem_id as ProblemId
  if (!NEETCODE_150_PROBLEM_BY_ID.has(problemId)) {
    throw new Error(`Unknown academy problem row "${row.problem_id}"`)
  }
  if (
    row.acquisition_passed !== true ||
    row.transfer_passed !== true ||
    row.code_tests_passed !== true
  ) {
    throw new Error(`Incomplete academy mission row "${row.problem_id}"`)
  }
  const acquiredAt = academyTimestamp(row.acquired_at, 'acquisition timestamp')
  const practicedAt = academyTimestamp(row.practiced_at, 'practice timestamp')
  if (!acquiredAt || !practicedAt || Date.parse(practicedAt) < Date.parse(acquiredAt)) {
    throw new Error(`Missing academy practice timestamp for "${row.problem_id}"`)
  }
  const acquisitionEventIds = academyNonEmptyIds(
    row.acquisition_event_ids,
    'acquisition event IDs',
  )
  const transferEventIds = academyNonEmptyIds(
    row.transfer_event_ids,
    'transfer event IDs',
  )
  const codeTestEventIds = academyNonEmptyIds(
    row.code_test_event_ids,
    'code-test event IDs',
  )
  if (!transferEventIds.some((id) => codeTestEventIds.includes(id))) {
    throw new Error(`Academy transfer/code evidence is not atomic for "${problemId}"`)
  }
  const practice: MissionPracticeEvidence = {
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
  const retainedAt = academyTimestamp(row.retained_at, 'retention timestamp')
  const completedAt = academyTimestamp(row.completed_at, 'completion timestamp')
  const delayedIds = academyIds(
    row.delayed_retrieval_event_ids,
    'delayed-retrieval event IDs',
  )
  if (!row.delayed_retrieval_passed) {
    if (retainedAt || completedAt || delayedIds.length > 0) {
      throw new Error(`Invalid unretained academy row "${problemId}"`)
    }
    return { practice }
  }
  if (
    !retainedAt ||
    completedAt !== retainedAt ||
    delayedIds.length === 0 ||
    Date.parse(retainedAt) <
      Date.parse(acquiredAt) +
        NEETCODE_150_MANIFEST.masteryPolicy.delayedRetrievalMinimumHours *
          60 *
          60 *
          1000
  ) {
    throw new Error(`Invalid delayed-retrieval evidence for "${problemId}"`)
  }
  return {
    practice,
    completion: {
      ...practice,
      delayedRetrievalPassed: true,
      retainedAt,
      completedAt: retainedAt,
      cloudVerifiedAt: retainedAt,
      delayedRetrievalEventIds:
        delayedIds as NonEmptyAcademyLearningEvidenceIds,
    },
  }
}

export function academyRealmEvidenceFromRow(
  row: AcademyRealmProgressRow,
): {
  readonly quiz?: RealmQuizEvidence
  readonly boss?: BossDefeatEvidence
} {
  assertAcademyRowMetadata(row)
  const realmId = row.realm_id as RealmId
  if (!NEETCODE_150_REALM_BY_ID.has(realmId)) {
    throw new Error(`Unknown academy realm row "${row.realm_id}"`)
  }
  const bestScore = academyNumber(row.quiz_best_score, 'quiz score')
  const attemptCount = academyNumber(
    row.quiz_attempt_count,
    'quiz attempt count',
  )
  if (
    bestScore < 0 ||
    bestScore > 100 ||
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 0
  ) {
    throw new Error(`Invalid academy quiz summary for "${row.realm_id}"`)
  }
  if (
    row.quiz_attempts === null ||
    typeof row.quiz_attempts !== 'object' ||
    Array.isArray(row.quiz_attempts)
  ) {
    throw new Error(`Invalid academy quiz attempts for "${row.realm_id}"`)
  }
  const firstAttemptedAt = academyTimestamp(
    row.quiz_first_attempted_at,
    'first quiz timestamp',
  )
  const lastAttemptedAt = academyTimestamp(
    row.quiz_last_attempted_at,
    'last quiz timestamp',
  )
  const hasQuizEvidence =
    attemptCount > 0 ||
    Object.keys(row.quiz_attempts).length > 0 ||
    bestScore > 0 ||
    row.quiz_open_ended_transfer_passed ||
    firstAttemptedAt !== undefined ||
    lastAttemptedAt !== undefined

  let quiz: RealmQuizEvidence | undefined
  if (hasQuizEvidence) {
    const attemptEntries = Object.entries(row.quiz_attempts)
    if (attemptCount < attemptEntries.length) {
      throw new Error(`Invalid academy quiz attempt count for "${row.realm_id}"`)
    }
    for (const [attemptId, value] of attemptEntries) {
      const attempt =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? (value as unknown as Record<string, unknown>)
          : undefined
      const attemptScore = attempt
        ? academyNumber(
            attempt.score as number | string,
            'quiz attempt score',
          )
        : Number.NaN
      if (
        !attempt ||
        attempt.attemptId !== attemptId ||
        academyNumber(
          attempt.evidenceVersion as number | string,
          'quiz evidence version',
        ) !== ACADEMY_EVIDENCE_VERSION ||
        !Number.isFinite(Date.parse(String(attempt.attemptedAt ?? ''))) ||
        attemptScore < 0 ||
        attemptScore > 100 ||
        typeof attempt.openEndedTransferPassed !== 'boolean'
      ) {
        throw new Error(`Malformed academy quiz attempt "${attemptId}"`)
      }
      academyNonEmptyIds(
        attempt.learningEventIds as string[] | null,
        'quiz learning event IDs',
      )
    }
    const normalized = normalizeAcademyProgressState({
      ...emptyAcademyProgressState(),
      realmQuizzes: {
        [realmId]: {
          evidenceVersion: ACADEMY_EVIDENCE_VERSION,
          realmId,
          bestScore,
          attemptCount,
          openEndedTransferPassed:
            row.quiz_open_ended_transfer_passed === true,
          firstAttemptedAt,
          lastAttemptedAt,
          attempts: row.quiz_attempts,
        },
      },
    }).realmQuizzes[realmId]
    if (
      !normalized ||
      Object.keys(normalized.attempts).length !==
        Object.keys(row.quiz_attempts).length
    ) {
      throw new Error(`Malformed academy quiz attempt for "${row.realm_id}"`)
    }
    quiz = normalized
  }

  const defeatedAt = academyTimestamp(
    row.boss_defeated_at,
    'boss defeat timestamp',
  )
  if (row.boss_defeated !== (defeatedAt !== undefined)) {
    throw new Error(`Invalid academy boss evidence for "${row.realm_id}"`)
  }
  const boss = row.boss_defeated
    ? ({
        evidenceVersion: ACADEMY_EVIDENCE_VERSION,
        realmId,
        defeatedAt: defeatedAt as string,
        defeatIds: academyNonEmptyIds(row.boss_defeat_ids, 'boss defeat IDs'),
        learningEventIds: academyNonEmptyIds(
          row.boss_learning_event_ids,
          'boss learning event IDs',
        ),
      } satisfies BossDefeatEvidence)
    : undefined

  return { quiz, boss }
}

export function academyProgressFromCloudRows(
  problemRows: readonly AcademyProblemProgressRow[],
  realmRows: readonly AcademyRealmProgressRow[],
): AcademyProgressState {
  const state = emptyAcademyProgressState()
  const missionPractices: Partial<
    Record<ProblemId, MissionPracticeEvidence>
  > = {}
  const missionCompletions: Partial<
    Record<ProblemId, MissionCompletionEvidence>
  > = {}
  for (const row of problemRows) {
    const evidence = academyMissionEvidenceFromRow(row)
    if (missionPractices[evidence.practice.problemId]) {
      throw new Error(
        `Duplicate academy problem row "${evidence.practice.problemId}"`,
      )
    }
    missionPractices[evidence.practice.problemId] = evidence.practice
    if (evidence.completion) {
      missionCompletions[evidence.completion.problemId] = evidence.completion
    }
  }
  const realmQuizzes: Partial<Record<RealmId, RealmQuizEvidence>> = {}
  const bossDefeats: Partial<Record<RealmId, BossDefeatEvidence>> = {}
  const seenRealmIds = new Set<RealmId>()
  for (const row of realmRows) {
    const realmId = row.realm_id as RealmId
    if (seenRealmIds.has(realmId)) {
      throw new Error(`Duplicate academy realm row "${row.realm_id}"`)
    }
    seenRealmIds.add(realmId)
    const evidence = academyRealmEvidenceFromRow(row)
    if (evidence.quiz) realmQuizzes[realmId] = evidence.quiz
    if (evidence.boss) bossDefeats[realmId] = evidence.boss
  }
  return {
    ...state,
    missionPractices,
    missionCompletions,
    realmQuizzes,
    bossDefeats,
  }
}

export const academyMissionEvidenceToRow = (
  userId: string,
  state: AcademyProgressState,
  evidence: MissionPracticeEvidence,
  completion?: MissionCompletionEvidence,
) => ({
  user_id: userId,
  problem_id: evidence.problemId,
  schema_version: state.schemaVersion,
  evidence_version: evidence.evidenceVersion,
  curriculum_id: state.curriculumId,
  curriculum_version: state.curriculumVersion,
  content_version: state.contentVersion,
  acquired_at: evidence.acquiredAt,
  practiced_at: evidence.practicedAt,
  retained_at: completion?.retainedAt ?? null,
  completed_at: completion?.completedAt ?? null,
  acquisition_passed: evidence.acquisitionPassed,
  transfer_passed: evidence.transferPassed,
  code_tests_passed: evidence.codeTestsPassed,
  delayed_retrieval_passed: completion?.delayedRetrievalPassed ?? false,
  acquisition_event_ids: evidence.acquisitionEventIds,
  transfer_event_ids: evidence.transferEventIds,
  code_test_event_ids: evidence.codeTestEventIds,
  delayed_retrieval_event_ids: completion?.delayedRetrievalEventIds ?? [],
  updated_at: new Date().toISOString(),
})

export const academyRealmEvidenceToRow = (
  userId: string,
  state: AcademyProgressState,
  realmId: RealmId,
) => {
  const quiz = state.realmQuizzes[realmId]
  const boss = state.bossDefeats[realmId]
  return {
    user_id: userId,
    realm_id: realmId,
    schema_version: state.schemaVersion,
    evidence_version: ACADEMY_EVIDENCE_VERSION,
    curriculum_id: state.curriculumId,
    curriculum_version: state.curriculumVersion,
    content_version: state.contentVersion,
    quiz_best_score: quiz?.bestScore ?? 0,
    quiz_attempt_count: quiz?.attemptCount ?? 0,
    quiz_open_ended_transfer_passed:
      quiz?.openEndedTransferPassed ?? false,
    quiz_first_attempted_at: quiz?.firstAttemptedAt ?? null,
    quiz_last_attempted_at: quiz?.lastAttemptedAt ?? null,
    quiz_attempts: quiz?.attempts ?? {},
    boss_defeated: !!boss,
    boss_defeated_at: boss?.defeatedAt ?? null,
    boss_defeat_ids: boss?.defeatIds ?? [],
    boss_learning_event_ids: boss?.learningEventIds ?? [],
    updated_at: new Date().toISOString(),
  }
}

export class CloudAcademyProgressAdapter {
  constructor(private readonly cloudClient: SupabaseClient | null = supabase) {}

  async load(userId: string): Promise<AcademyCloudLoadResult> {
    if (!this.cloudClient) {
      return {
        status: 'unavailable',
        reason: 'not-configured',
        state: emptyAcademyProgressState(),
      }
    }
    const problemResult = await this.cloudClient
      .from('problem_progress')
      .select(ACADEMY_PROBLEM_COLUMNS)
      .eq('user_id', userId)
    if (problemResult.error) {
      if (isAcademyMigrationMissingError(problemResult.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          state: emptyAcademyProgressState(),
        }
      }
      throw problemResult.error
    }

    const realmResult = await this.cloudClient
      .from('realm_progress')
      .select(ACADEMY_REALM_COLUMNS)
      .eq('user_id', userId)
    if (realmResult.error) {
      if (isAcademyMigrationMissingError(realmResult.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          state: emptyAcademyProgressState(),
        }
      }
      throw realmResult.error
    }

    return {
      status: 'ok',
      state: academyProgressFromCloudRows(
        (problemResult.data ?? []) as unknown as AcademyProblemProgressRow[],
        (realmResult.data ?? []) as unknown as AcademyRealmProgressRow[],
      ),
    }
  }

  async saveMission(
    userId: string,
    stateValue: AcademyProgressState,
    problemId: ProblemId,
  ): Promise<AcademyCloudWriteResult> {
    if (!this.cloudClient) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    const state = normalizeAcademyProgressState(stateValue)
    const evidence = state.missionPractices[problemId]
    if (!evidence) return { status: 'ok' }
    const result = await this.cloudClient.rpc(
      'merge_academy_mission_progress',
      {
        p_record: academyMissionEvidenceToRow(
          userId,
          state,
          evidence,
          state.missionCompletions[problemId],
        ),
      },
    )
    if (result.error) {
      if (isAcademyMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }

  async saveRealm(
    userId: string,
    stateValue: AcademyProgressState,
    realmId: RealmId,
  ): Promise<AcademyCloudWriteResult> {
    if (!this.cloudClient) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    const state = normalizeAcademyProgressState(stateValue)
    if (!state.realmQuizzes[realmId] && !state.bossDefeats[realmId]) {
      return { status: 'ok' }
    }
    const result = await this.cloudClient.rpc('merge_academy_realm_progress', {
      p_record: academyRealmEvidenceToRow(userId, state, realmId),
    })
    if (result.error) {
      if (isAcademyMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }

  async save(
    userId: string,
    stateValue: AcademyProgressState,
  ): Promise<AcademyCloudWriteResult> {
    if (!this.cloudClient) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    const state = normalizeAcademyProgressState(stateValue)
    const missionRows = NEETCODE_150_MANIFEST.problems.flatMap(({ id }) => {
      const evidence = state.missionPractices[id]
      return evidence
        ? [
            academyMissionEvidenceToRow(
              userId,
              state,
              evidence,
              state.missionCompletions[id],
            ),
          ]
        : []
    })
    const realmIdsWithEvidence = NEETCODE_150_MANIFEST.realms
      .map(({ id }) => id)
      .filter(
        (realmId) =>
          !!state.realmQuizzes[realmId] || !!state.bossDefeats[realmId],
      )
    const realmRows = realmIdsWithEvidence.map((realmId) =>
      academyRealmEvidenceToRow(userId, state, realmId),
    )
    if (missionRows.length === 0 && realmRows.length === 0) {
      return { status: 'ok' }
    }
    const result = await this.cloudClient.rpc('merge_academy_progress', {
      p_problem_records: missionRows,
      p_realm_records: realmRows,
    })
    if (result.error) {
      if (isAcademyMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }
}

const GAUNTLET_COLUMNS =
  'version, revision, best_score, attempts, exam_passed, exam_passed_at, certification_requirements_passed, final_boss_beaten, final_boss_beaten_at, concepts, legacy_attempt_count, legacy_best_score, legacy_exam_passed, legacy_exam_passed_at, legacy_final_boss_beaten, legacy_final_boss_beaten_at, legacy_concepts, certification_attempts, concept_outcomes, final_boss_defeats'

function gauntletStateFromRow(row: GauntletProgressRow): GauntletState {
  const version = academyNumber(row.version, 'gauntlet version')
  const revision = academyNumber(row.revision, 'gauntlet revision')
  const bestScore = academyNumber(row.best_score, 'gauntlet best score')
  const attempts = academyNumber(row.attempts, 'gauntlet attempts')
  if (
    version !== emptyGauntletState().version ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    bestScore < 0 ||
    bestScore > 100 ||
    row.exam_passed !==
      (row.certification_requirements_passed && row.exam_passed_at !== null) ||
    row.final_boss_beaten !== (row.final_boss_beaten_at !== null) ||
    !row.concepts ||
    typeof row.concepts !== 'object' ||
    Array.isArray(row.concepts)
  ) {
    throw new Error('Invalid gauntlet progress returned by Supabase')
  }
  return normalizeGauntletState({
    version,
    revision,
    bestScore,
    attempts,
    examPassed: row.exam_passed,
    examPassedAt: row.exam_passed_at ?? undefined,
    certificationRequirementsPassed:
      row.certification_requirements_passed,
    finalBossBeaten: row.final_boss_beaten,
    finalBossBeatenAt: row.final_boss_beaten_at ?? undefined,
    concepts: row.concepts,
    legacyAttemptCount: academyNumber(
      row.legacy_attempt_count,
      'legacy gauntlet attempt count',
    ),
    legacyBestScore: academyNumber(
      row.legacy_best_score,
      'legacy gauntlet best score',
    ),
    legacyExamPassed: row.legacy_exam_passed,
    legacyExamPassedAt: row.legacy_exam_passed_at ?? undefined,
    legacyFinalBossBeaten: row.legacy_final_boss_beaten,
    legacyFinalBossBeatenAt:
      row.legacy_final_boss_beaten_at ?? undefined,
    legacyConcepts: row.legacy_concepts ?? {},
    certificationAttempts: row.certification_attempts ?? {},
    conceptOutcomes: row.concept_outcomes ?? {},
    finalBossDefeats: row.final_boss_defeats ?? {},
    pendingCloudSync: false,
  })
}

const gauntletStateToRow = (stateValue: GauntletState) => {
  const state = normalizeGauntletState(stateValue)
  return {
    version: state.version,
    revision: state.revision,
    best_score: state.bestScore,
    attempts: state.attempts,
    exam_passed: state.examPassed,
    exam_passed_at: state.examPassedAt ?? null,
    certification_requirements_passed:
      state.certificationRequirementsPassed,
    final_boss_beaten: state.finalBossBeaten,
    final_boss_beaten_at: state.finalBossBeatenAt ?? null,
    concepts: state.concepts,
    legacy_attempt_count: state.legacyAttemptCount,
    legacy_best_score: state.legacyBestScore,
    legacy_exam_passed: state.legacyExamPassed,
    legacy_exam_passed_at: state.legacyExamPassedAt ?? null,
    legacy_final_boss_beaten: state.legacyFinalBossBeaten,
    legacy_final_boss_beaten_at:
      state.legacyFinalBossBeatenAt ?? null,
    legacy_concepts: state.legacyConcepts,
    certification_attempts: state.certificationAttempts,
    concept_outcomes: state.conceptOutcomes,
    final_boss_defeats: state.finalBossDefeats,
  }
}

export class CloudGauntletProgressAdapter {
  constructor(private readonly cloudClient: SupabaseClient | null = supabase) {}

  async load(userId: string): Promise<GauntletCloudLoadResult> {
    if (!this.cloudClient) {
      return {
        status: 'unavailable',
        reason: 'not-configured',
        state: emptyGauntletState(),
      }
    }
    const result = await this.cloudClient
      .from('gauntlet_progress')
      .select(GAUNTLET_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()
    if (result.error) {
      if (isGauntletMigrationMissingError(result.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          state: emptyGauntletState(),
        }
      }
      throw result.error
    }
    return {
      status: 'ok',
      state: result.data
        ? gauntletStateFromRow(
            result.data as unknown as GauntletProgressRow,
          )
        : emptyGauntletState(),
    }
  }

  async save(state: GauntletState): Promise<AcademyCloudWriteResult> {
    if (!this.cloudClient) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    const result = await this.cloudClient.rpc('merge_gauntlet_progress', {
      p_record: gauntletStateToRow(state),
    })
    if (result.error) {
      if (isGauntletMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok' }
  }
}

function rowToLessonProgress(row: LessonProgressRow): LessonProgress {
  return {
    lessonId: row.lesson_id,
    status: row.status as LessonStatus,
    currentStepIndex: row.current_step_index,
    completedStepIds: Array.isArray(row.completed_step_ids)
      ? row.completed_step_ids
      : [],
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    totalAttempts: row.total_attempts,
    correctFirstTry: row.correct_first_try,
    accuracy: row.accuracy,
    masteryScore: row.mastery_score,
    unlockNextLesson: row.unlock_next_lesson,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    lastReview: row.last_review ?? undefined,
    learnCompleted: row.learn_completed ?? undefined,
    learnStepIndex: row.learn_step_index ?? undefined,
    quizStepIndex: row.quiz_step_index ?? undefined,
    learnFrameIndex: row.learn_frame_index ?? undefined,
    quizFrameIndex: row.quiz_frame_index ?? undefined,
  }
}

/** Make sure a profile row exists for this user (RLS lets users insert their own). */
export async function ensureProfile(user: User): Promise<void> {
  const sb = client()
  const meta = user.user_metadata as { displayName?: string } | undefined
  const { error } = await sb.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name: meta?.displayName ?? null,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )
  if (error) throw error
}

export async function loadCloud(userId: string): Promise<ProgressState> {
  const sb = client()

  // Core load — must succeed. Errors here trigger a local fallback upstream.
  const profileRes = await sb
    .from('profiles')
    .select('experience_level, streak_current, streak_longest, last_activity_date')
    .eq('id', userId)
    .maybeSingle()
  if (profileRes.error) throw profileRes.error

  const state: ProgressState = emptyState()

  const profile = profileRes.data
  if (profile) {
    state.experienceLevel =
      (profile.experience_level as ExperienceLevel | null) ?? undefined
    state.streak = {
      current: profile.streak_current ?? 0,
      longest: profile.streak_longest ?? 0,
      lastActivityDate: profile.last_activity_date ?? undefined,
    }
  }

  // "The Threshold" columns may not exist on older databases. Ignore that
  // specific schema gap, but surface network/auth/RLS failures.
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('inter_zone_complete, inter_zone_completed_at')
      .eq('id', userId)
      .maybeSingle()
    if (error && !isMissingSchemaField(error)) throw error
    if (data) {
      const row = data as {
        inter_zone_complete?: boolean | null
        inter_zone_completed_at?: string | null
      }
      if (row.inter_zone_complete) {
        state.interZoneComplete = true
        state.interZoneCompletedAt = row.inter_zone_completed_at ?? undefined
      }
    }
  } catch (error) {
    if (!isMissingSchemaField(error)) throw error
  }

  const rowsRes = await sb
    .from('lesson_progress')
    .select(SECTION_LESSON_COLUMNS)
    .eq('user_id', userId)
  if (rowsRes.error) {
    if (!isMissingSchemaField(rowsRes.error)) throw rowsRes.error
    const sectionRes = await sb
      .from('lesson_progress')
      .select(SECTION_BASE_COLUMNS)
      .eq('user_id', userId)
    if (sectionRes.error) {
      if (!isMissingSchemaField(sectionRes.error)) throw sectionRes.error
      const fallback = await sb
        .from('lesson_progress')
        .select(CORE_LESSON_COLUMNS)
        .eq('user_id', userId)
      if (fallback.error) throw fallback.error
      for (const row of (fallback.data ?? []) as LessonProgressRow[]) {
        state.lessons[row.lesson_id] = rowToLessonProgress(row)
      }
    } else {
      for (const row of (sectionRes.data ?? []) as LessonProgressRow[]) {
        state.lessons[row.lesson_id] = rowToLessonProgress(row)
      }
    }
  } else {
    for (const row of (rowsRes.data ?? []) as LessonProgressRow[]) {
      state.lessons[row.lesson_id] = rowToLessonProgress(row)
    }
  }

  // Optional legacy extras: tolerate missing columns only.
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('badges, badge_counts')
      .eq('id', userId)
      .maybeSingle()
    if (error && !isMissingSchemaField(error)) throw error
    if (data) {
      const row = data as { badges?: string[] | null; badge_counts?: BadgeCounts | null }
      if (row.badge_counts && typeof row.badge_counts === 'object') {
        state.badgeCounts = normalizeBadgeCounts(row.badge_counts)
      } else if (Array.isArray(row.badges)) {
        state.badgeCounts = badgeCountsFromEarnedList(row.badges)
      }
    }
  } catch (error) {
    if (!isMissingSchemaField(error)) throw error
  }

  try {
    const { data, error } = await sb
      .from('lesson_progress')
      .select('lesson_id, last_review')
      .eq('user_id', userId)
    if (error && !isMissingSchemaField(error)) throw error
    if (data) {
      for (const r of data as { lesson_id: string; last_review: LessonReview | null }[]) {
        const lp = state.lessons[r.lesson_id]
        if (lp && r.last_review) lp.lastReview = r.last_review
      }
    }
  } catch (error) {
    if (!isMissingSchemaField(error)) throw error
  }

  // The legacy concept table may be absent; other failures remain actionable.
  try {
    const { data, error } = await sb
      .from('concept_mastery')
      .select(
        'concept_id, ability, confidence, seen, correct_first_try, box, due_at, last_seen_at, recent_results',
      )
      .eq('user_id', userId)
    if (error && !isMissingSchemaResource(error)) throw error
    if (Array.isArray(data) && data.length > 0) {
      const concepts: Partial<Record<ConceptId, ConceptSkill>> = {}
      let latest = 0
      for (const r of data as ConceptMasteryRow[]) {
        const dueAt = r.due_at ? Date.parse(r.due_at) : 0
        const lastSeenAt = r.last_seen_at ? Date.parse(r.last_seen_at) : 0
        latest = Math.max(latest, lastSeenAt)
        concepts[r.concept_id as ConceptId] = {
          conceptId: r.concept_id as ConceptId,
          ability: r.ability ?? 0.5,
          confidence: r.confidence ?? 0,
          seen: r.seen ?? 0,
          correctFirstTry: r.correct_first_try ?? 0,
          box: r.box ?? 1,
          dueAt,
          lastSeenAt,
          recentResults: Array.isArray(r.recent_results) ? r.recent_results : [],
        }
      }
      state.learnerModel = {
        concepts,
        updatedAt: new Date(latest || Date.now()).toISOString(),
      }
    }
  } catch (error) {
    if (!isMissingSchemaResource(error)) throw error
  }

  // Academy tables are optional during rollout. Missing migrations preserve
  // local academy state; network/auth/RLS and malformed-row failures surface.
  const academyResult = await new CloudAcademyProgressAdapter(sb).load(userId)
  if (academyResult.status === 'ok') {
    state.academyProgress = academyResult.state
  }

  // Backfill learnCompleted for rows saved before section flags existed.
  for (const lessonId of Object.keys(state.lessons)) {
    const lesson = generateLesson(lessonId)
    if (!lesson) continue
    const progress = normalizeLessonProgress(state.lessons[lessonId])
    if (!progress.learnCompleted && isLearnComplete(progress, lesson)) {
      state.lessons[lessonId] = { ...progress, learnCompleted: true }
    } else {
      state.lessons[lessonId] = progress
    }
  }

  return state
}

export async function saveExperienceCloud(
  userId: string,
  level: ExperienceLevel,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({ experience_level: level, last_active_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function saveStreakCloud(
  userId: string,
  streak: StreakState,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({
      streak_current: streak.current,
      streak_longest: streak.longest,
      last_activity_date: streak.lastActivityDate ?? null,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (error) throw error
}

/** Persist "The Threshold" completion; callers retain the local fallback. */
export async function saveInterZoneCloud(
  userId: string,
  completedAt: string,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({
      inter_zone_complete: true,
      inter_zone_completed_at: completedAt,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (error) throw error
}

export async function saveBadgesCloud(
  userId: string,
  counts: BadgeCounts,
): Promise<void> {
  const normalized = normalizeBadgeCounts(counts)
  const { error } = await client()
    .from('profiles')
    .update({
      badge_counts: normalized,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    if (!isMissingSchemaField(error)) throw error
    // Fallback for databases without badge_counts column yet.
    const legacyIds = (Object.entries(normalized) as [keyof BadgeCounts, number][])
      .flatMap(([id, n]) => {
        // Guard the array length: a negative / NaN / non-integer count would
        // make Array.from throw `RangeError: Invalid array length` and blow up
        // the whole cloud write. Clamp to a safe non-negative integer.
        const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
        return Array.from({ length: count }, () => id)
      })
    const { error: fallbackError } = await client()
      .from('profiles')
      .update({ badges: legacyIds, last_active_at: new Date().toISOString() })
      .eq('id', userId)
    if (fallbackError) throw fallbackError
  }
}

export async function upsertLessonCloud(
  userId: string,
  p: LessonProgress,
): Promise<void> {
  const lesson = generateLesson(p.lessonId)
  const normalized = lesson ? withLearnCompletedFlag(p, lesson) : p

  const payload = {
    user_id: userId,
    lesson_id: normalized.lessonId,
    status: normalized.status,
    current_step_index: normalized.currentStepIndex,
    completed_step_ids: normalized.completedStepIds,
    correct_count: normalized.correctCount,
    wrong_count: normalized.wrongCount,
    total_attempts: normalized.totalAttempts,
    correct_first_try: normalized.correctFirstTry,
    accuracy: normalized.accuracy,
    mastery_score: normalized.masteryScore,
    unlock_next_lesson: normalized.unlockNextLesson,
    completed_at: normalized.completedAt ?? null,
    updated_at: new Date().toISOString(),
    learn_completed: normalized.learnCompleted === true,
    learn_step_index: normalized.learnStepIndex ?? null,
    quiz_step_index: normalized.quizStepIndex ?? null,
    learn_frame_index: normalized.learnFrameIndex ?? null,
    quiz_frame_index: normalized.quizFrameIndex ?? null,
  }

  // Core write — must succeed for progress to persist.
  let { error } = await client()
    .from('lesson_progress')
    .upsert(payload, { onConflict: 'user_id,lesson_id' })

  if (error && isMissingSchemaField(error)) {
    const { learn_frame_index, quiz_frame_index, ...withoutFrames } = payload
    void learn_frame_index
    void quiz_frame_index
    ;({ error } = await client()
      .from('lesson_progress')
      .upsert(withoutFrames, { onConflict: 'user_id,lesson_id' }))
  }

  if (error && isMissingSchemaField(error)) {
    // Older databases may not have section columns yet — still save core progress.
    const {
      learn_completed,
      learn_step_index,
      quiz_step_index,
      learn_frame_index,
      quiz_frame_index,
      ...core
    } = payload
    void learn_completed
    void learn_step_index
    void quiz_step_index
    void learn_frame_index
    void quiz_frame_index
    ;({ error } = await client()
      .from('lesson_progress')
      .upsert(core, { onConflict: 'user_id,lesson_id' }))
  }

  if (error) throw error

  // Store the review snapshot when supported; ignore only the missing column.
  if (p.lastReview) {
    const { error: reviewError } = await client()
      .from('lesson_progress')
      .update({ last_review: p.lastReview })
      .eq('user_id', userId)
      .eq('lesson_id', p.lessonId)
    if (reviewError && !isMissingSchemaField(reviewError)) throw reviewError
  }
}

export async function deleteLessonCloud(
  userId: string,
  lessonId: string,
): Promise<void> {
  const { error } = await client()
    .from('lesson_progress')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
  if (error) throw error
}

/** Persist the touched legacy concept skills; local state remains authoritative on failure. */
export async function saveConceptMasteryCloud(
  userId: string,
  skills: ConceptSkill[],
): Promise<void> {
  if (skills.length === 0) return
  const rows = skills.map((s) => ({
    user_id: userId,
    concept_id: s.conceptId,
    ability: s.ability,
    confidence: s.confidence,
    seen: s.seen,
    correct_first_try: s.correctFirstTry,
    box: s.box,
    due_at: new Date(s.dueAt).toISOString(),
    last_seen_at: new Date(s.lastSeenAt).toISOString(),
    recent_results: s.recentResults,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await client()
    .from('concept_mastery')
    .upsert(rows, { onConflict: 'user_id,concept_id' })
  if (error) throw error
}

export async function insertAttemptCloud(
  userId: string,
  a: AttemptRecord,
): Promise<void> {
  const { error } = await client().from('attempts').insert({
    user_id: userId,
    lesson_id: a.lessonId,
    step_id: a.stepId,
    submitted_answer: a.submittedAnswer,
    expected_answer: a.expectedAnswer,
    is_correct: a.isCorrect,
    attempt_number: a.attemptNumber,
    created_at: a.createdAt,
  })
  if (error) throw error
}

const defaultAcademyAdapter = new CloudAcademyProgressAdapter()

export const saveAcademyProgressCloud = (
  userId: string,
  state: AcademyProgressState,
) => defaultAcademyAdapter.save(userId, state)

export const upsertAcademyMissionCloud = (
  userId: string,
  state: AcademyProgressState,
  problemId: ProblemId,
) => defaultAcademyAdapter.saveMission(userId, state, problemId)

export const upsertAcademyRealmCloud = (
  userId: string,
  state: AcademyProgressState,
  realmId: RealmId,
) => defaultAcademyAdapter.saveRealm(userId, state, realmId)

const defaultGauntletAdapter = new CloudGauntletProgressAdapter()

export const loadGauntletProgressCloud = (userId: string) =>
  defaultGauntletAdapter.load(userId)

export const saveGauntletProgressCloud = (state: GauntletState) =>
  defaultGauntletAdapter.save(state)
