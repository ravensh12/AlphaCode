import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  CloudAcademyProgressAdapter,
  CloudGauntletProgressAdapter,
  academyProgressFromCloudRows,
  academyMissionEvidenceFromRow,
  isAcademyMigrationMissingError,
  type AcademyProblemProgressRow,
  type AcademyRealmProgressRow,
} from './cloudProgress'
import {
  emptyAcademyProgressState,
  mergeAcademyProgressStates,
  recordMissionCompletion,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
} from './academyProgress'
import type { AcademyProgressState } from '../types/academy'
import {
  emptyGauntletState,
  markBossBeaten,
  recordExamCompletion,
} from './gauntletProgress'

type FakeResult = { data: unknown; error: unknown }

function query(
  result: FakeResult,
  table: string,
  writes: { table: string; payload: unknown }[],
) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    upsert: (payload: unknown) => {
      writes.push({ table, payload })
      return Promise.resolve(result)
    },
    then: (
      fulfilled?: ((value: FakeResult) => unknown) | null,
      rejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(fulfilled, rejected),
  }
  return builder
}

function fakeClient(
  results: Partial<
    Record<'problem_progress' | 'realm_progress' | 'gauntlet_progress', FakeResult>
  >,
  writes: { table: string; payload: unknown }[] = [],
  rpcResult: FakeResult = { data: null, error: null },
  rpcHandler?: (name: string, payload: unknown) => FakeResult,
): SupabaseClient {
  const from = vi.fn((table: string) =>
    query(
      results[table as keyof typeof results] ?? { data: [], error: null },
      table,
      writes,
    ),
  )
  const rpc = vi.fn((name: string, payload: unknown) => {
    writes.push({ table: name, payload })
    return Promise.resolve(rpcHandler?.(name, payload) ?? rpcResult)
  })
  return { from, rpc } as unknown as SupabaseClient
}

const problemRow: AcademyProblemProgressRow = {
  problem_id: 'problem:contains-duplicate',
  schema_version: 1,
  evidence_version: 1,
  curriculum_id: 'curriculum:neetcode150',
  curriculum_version: 'v1.0.0',
  content_version: 'v1.0.0',
  acquired_at: '2026-07-11T12:00:00.000Z',
  practiced_at: '2026-07-11T12:05:00.000Z',
  retained_at: '2026-07-12T12:00:00.000Z',
  completed_at: '2026-07-12T12:00:00.000Z',
  acquisition_passed: true,
  transfer_passed: true,
  code_tests_passed: true,
  delayed_retrieval_passed: true,
  acquisition_event_ids: ['event:a'],
  transfer_event_ids: ['event:python'],
  code_test_event_ids: ['event:python'],
  delayed_retrieval_event_ids: ['event:retention'],
}

const realmRow: AcademyRealmProgressRow = {
  realm_id: 'realm1',
  schema_version: 1,
  evidence_version: 1,
  curriculum_id: 'curriculum:neetcode150',
  curriculum_version: 'v1.0.0',
  content_version: 'v1.0.0',
  quiz_best_score: 85,
  quiz_attempt_count: 1,
  quiz_open_ended_transfer_passed: true,
  quiz_first_attempted_at: '2026-07-11T13:00:00.000Z',
  quiz_last_attempted_at: '2026-07-11T13:00:00.000Z',
  quiz_attempts: {
    'quiz:realm1:1': {
      evidenceVersion: 1,
      attemptId: 'quiz:realm1:1',
      attemptedAt: '2026-07-11T13:00:00.000Z',
      score: 85,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz'],
    },
  },
  boss_defeated: true,
  boss_defeated_at: '2026-07-11T14:00:00.000Z',
  boss_defeat_ids: ['battle:realm1:1'],
  boss_learning_event_ids: ['event:battle'],
}

describe('CloudAcademyProgressAdapter', () => {
  it('maps mission, quiz, and boss rows without replacing evidence timestamps', async () => {
    const adapter = new CloudAcademyProgressAdapter(
      fakeClient({
        problem_progress: { data: [problemRow], error: null },
        realm_progress: { data: [realmRow], error: null },
      }),
    )

    const result = await adapter.load('user-1')
    expect(result.status).toBe('ok')
    expect(
      result.state.missionCompletions['problem:contains-duplicate'],
    ).toMatchObject({
      completedAt: '2026-07-12T12:00:00.000Z',
      cloudVerifiedAt: '2026-07-12T12:00:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['event:a'],
      transferEventIds: ['event:python'],
      codeTestEventIds: ['event:python'],
    })
    expect(result.state.realmQuizzes.realm1).toMatchObject({
      bestScore: 85,
      attemptCount: 1,
      openEndedTransferPassed: true,
    })
    expect(result.state.bossDefeats.realm1).toMatchObject({
      defeatedAt: '2026-07-11T14:00:00.000Z',
      defeatIds: ['battle:realm1:1'],
    })
  })

  it('degrades only when the academy migration is missing', async () => {
    const adapter = new CloudAcademyProgressAdapter(
      fakeClient({
        problem_progress: {
          data: null,
          error: { code: '42P01', message: 'problem_progress does not exist' },
        },
      }),
    )
    await expect(adapter.load('user-1')).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'migration-missing',
    })
  })

  it('throws network, auth, and RLS failures instead of reporting success', async () => {
    const error = { code: '42501', message: 'row-level security violation' }
    const adapter = new CloudAcademyProgressAdapter(
      fakeClient({
        problem_progress: { data: null, error },
      }),
    )
    await expect(adapter.load('user-1')).rejects.toBe(error)

    const writeAdapter = new CloudAcademyProgressAdapter(
      fakeClient({}, [], { data: null, error }),
    )
    const state = recordMissionCompletion(emptyAcademyProgressState(), {
      problemId: 'problem:contains-duplicate',
      completedAt: '2026-07-11T12:00:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['event:write:a'],
      transferEventIds: ['event:write:python'],
      codeTestEventIds: ['event:write:python'],
    })
    await expect(
      writeAdapter.saveMission(
        'user-1',
        state,
        'problem:contains-duplicate',
      ),
    ).rejects.toBe(error)
  })

  it('writes all facts through the commutative batch RPC', async () => {
    const writes: { table: string; payload: unknown }[] = []
    const adapter = new CloudAcademyProgressAdapter(
      fakeClient({}, writes),
    )
    let state = recordMissionCompletion(emptyAcademyProgressState(), {
      problemId: 'problem:contains-duplicate',
      completedAt: '2026-07-11T12:00:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['event:a'],
      transferEventIds: ['event:python'],
      codeTestEventIds: ['event:python'],
    })
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:1',
      attemptedAt: '2026-07-11T13:00:00.000Z',
      score: 80,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz'],
    })
    state = recordRealmBossDefeat(state, {
      realmId: 'realm1',
      defeatId: 'battle:realm1:1',
      defeatedAt: '2026-07-11T14:00:00.000Z',
      learningEventIds: ['event:battle'],
    })

    await expect(adapter.save('user-1', state)).resolves.toEqual({
      status: 'ok',
    })
    expect(writes).toEqual([
      {
        table: 'merge_academy_progress',
        payload: {
          p_problem_records: [
            expect.objectContaining({
              schema_version: 1,
              evidence_version: 1,
              curriculum_id: 'curriculum:neetcode150',
              problem_id: 'problem:contains-duplicate',
            }),
          ],
          p_realm_records: [
            expect.objectContaining({
              schema_version: 1,
              realm_id: 'realm1',
              quiz_best_score: 80,
              boss_defeated: true,
            }),
          ],
        },
      },
    ])
  })

  it('converges stale realm snapshots regardless of upload order', async () => {
    const quizOnly = recordRealmQuizAttempt(emptyAcademyProgressState(), {
      realmId: 'realm1',
      attemptId: 'quiz:stale-device',
      attemptedAt: '2026-07-11T13:00:00.000Z',
      score: 80,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz'],
    })
    const bossOnly = recordRealmBossDefeat(emptyAcademyProgressState(), {
      realmId: 'realm1',
      defeatId: 'battle:newer-device',
      defeatedAt: '2026-07-11T14:00:00.000Z',
      learningEventIds: ['event:battle'],
    })

    async function upload(
      ordered: readonly AcademyProgressState[],
    ): Promise<AcademyProgressState> {
      let durable = emptyAcademyProgressState()
      const client = fakeClient(
        {},
        [],
        { data: null, error: null },
        (name, payload) => {
          expect(name).toBe('merge_academy_realm_progress')
          const record = (
            payload as { p_record: AcademyRealmProgressRow }
          ).p_record
          durable = mergeAcademyProgressStates(
            durable,
            academyProgressFromCloudRows([], [record]),
          )
          return { data: null, error: null }
        },
      )
      const adapter = new CloudAcademyProgressAdapter(client)
      for (const state of ordered) {
        await adapter.saveRealm('user-1', state, 'realm1')
      }
      return durable
    }

    const bossThenQuiz = await upload([bossOnly, quizOnly])
    const quizThenBoss = await upload([quizOnly, bossOnly])
    expect(bossThenQuiz).toEqual(quizThenBoss)
    expect(bossThenQuiz.realmQuizzes.realm1?.attempts).toHaveProperty(
      'quiz:stale-device',
    )
    expect(bossThenQuiz.bossDefeats.realm1?.defeatIds).toEqual([
      'battle:newer-device',
    ])
  })
})

describe('academy cloud row validation', () => {
  it('rejects unsupported versions and recognizes only schema absence', () => {
    expect(() =>
      academyMissionEvidenceFromRow({
        ...problemRow,
        schema_version: 2,
      }),
    ).toThrow(/Unsupported cloud academy version/)
    expect(
      isAcademyMigrationMissingError({
        code: 'PGRST204',
        message: 'problem_progress.content_version is missing',
      }),
    ).toBe(true)
    expect(
      isAcademyMigrationMissingError({
        code: '42501',
        message: 'permission denied',
      }),
    ).toBe(false)
  })
})

describe('CloudGauntletProgressAdapter', () => {
  it('loads and writes monotonic certification/final-boss state through RPC', async () => {
    const writes: { table: string; payload: unknown }[] = []
    const row = {
      version: 4,
      revision: 2,
      best_score: 86,
      attempts: 2,
      exam_passed: true,
      exam_passed_at: '2026-07-11T18:00:00.000Z',
      certification_requirements_passed: true,
      final_boss_beaten: true,
      final_boss_beaten_at: '2026-07-12T18:00:00.000Z',
      concepts: {},
      legacy_attempt_count: 2,
      legacy_best_score: 86,
      legacy_exam_passed: true,
      legacy_exam_passed_at: '2026-07-11T18:00:00.000Z',
      legacy_final_boss_beaten: true,
      legacy_final_boss_beaten_at: '2026-07-12T18:00:00.000Z',
      legacy_concepts: {},
      certification_attempts: {},
      concept_outcomes: {},
      final_boss_defeats: {},
    }
    const adapter = new CloudGauntletProgressAdapter(
      fakeClient(
        { gauntlet_progress: { data: row, error: null } },
        writes,
      ),
    )
    await expect(adapter.load('user-1')).resolves.toMatchObject({
      status: 'ok',
      state: {
        bestScore: 86,
        examPassed: true,
        finalBossBeaten: true,
      },
    })

    const state = markBossBeaten(
      recordExamCompletion(
        emptyGauntletState(),
        86,
        true,
        Date.parse('2026-07-11T18:00:00.000Z'),
        'cert:test',
      ),
      Date.parse('2026-07-12T18:00:00.000Z'),
      'boss:test',
    )
    await expect(adapter.save(state)).resolves.toEqual({ status: 'ok' })
    expect(writes.at(-1)).toMatchObject({
      table: 'merge_gauntlet_progress',
      payload: {
        p_record: {
          best_score: 86,
          exam_passed: true,
          final_boss_beaten: true,
          certification_attempts: {
            'cert:test': expect.objectContaining({ score: 86 }),
          },
          final_boss_defeats: {
            'boss:test': expect.objectContaining({
              defeatId: 'boss:test',
            }),
          },
        },
      },
    })
  })
})
