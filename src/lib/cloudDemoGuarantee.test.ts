import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { DemoGuaranteeEvaluationInput } from '../types/demoGuarantee'
import { createDemoGuaranteeSimulation } from './demoGuarantee'
import {
  CloudDemoGuaranteeAdapter,
  demoGuaranteeSimulationToRow,
  isDemoGuaranteeMigrationMissingError,
  type DemoGuaranteeCloudRow,
} from './cloudDemoGuarantee'

type FakeResult = { data: unknown; error: unknown }

function fakeClient({
  loadResult = { data: [], error: null },
  writeResult = { data: null, error: null },
  writes = [],
  reads = [],
}: {
  loadResult?: FakeResult
  writeResult?: FakeResult
  writes?: unknown[]
  reads?: string[]
} = {}): SupabaseClient {
  const from = vi.fn(() => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: (column: string, options: { ascending: boolean }) => {
        reads.push(`${column}:${options.ascending ? 'asc' : 'desc'}`)
        return builder
      },
      limit: (count: number) => {
        reads.push(`limit:${count}`)
        return builder
      },
      upsert: (payload: unknown) => {
        writes.push(payload)
        return Promise.resolve(writeResult)
      },
      then: (
        fulfilled?: ((value: FakeResult) => unknown) | null,
        rejected?: ((reason: unknown) => unknown) | null,
      ) => Promise.resolve(loadResult).then(fulfilled, rejected),
    }
    return builder
  })
  return { from } as unknown as SupabaseClient
}

const input: DemoGuaranteeEvaluationInput = {
  simulationRunId: 'run-1',
  scenario: 'eligible-path',
  completedMissions: 150,
  delayedReviewAdherenceMet: true,
  remediationComplete: true,
  certificationAchieved: false,
  windowStartsAt: '2026-07-01T12:00:00.000Z',
  evaluatedAt: '2026-07-11T12:00:00.000Z',
  recordedAt: '2026-07-11T12:00:00.000Z',
}

const simulation = createDemoGuaranteeSimulation(input)
const { user_id: _userId, ...cloudRow } = demoGuaranteeSimulationToRow(
  'user-1',
  simulation,
)

describe('CloudDemoGuaranteeAdapter', () => {
  it('loads only validated simulation rows', async () => {
    const reads: string[] = []
    const adapter = new CloudDemoGuaranteeAdapter(
      fakeClient({
        loadResult: { data: [cloudRow], error: null },
        reads,
      }),
    )
    await expect(adapter.load('user-1')).resolves.toEqual({
      status: 'ok',
      simulation,
    })
    expect(reads).toEqual([
      'created_at:desc',
      'simulation_run_id:desc',
      'limit:1',
    ])

    const unsafeRow: DemoGuaranteeCloudRow = {
      ...cloudRow,
      is_simulation: false,
    }
    const unsafeAdapter = new CloudDemoGuaranteeAdapter(
      fakeClient({
        loadResult: { data: [unsafeRow], error: null },
      }),
    )
    await expect(unsafeAdapter.load('user-1')).rejects.toThrow(/isSimulation/i)
  })

  it('degrades only when the demo migration is missing', async () => {
    const missing = {
      code: '42P01',
      message: 'demo_guarantee_simulations does not exist',
    }
    const adapter = new CloudDemoGuaranteeAdapter(
      fakeClient({ loadResult: { data: null, error: missing } }),
    )
    await expect(adapter.load('user-1')).resolves.toEqual({
      status: 'unavailable',
      reason: 'migration-missing',
      simulation: null,
    })
    expect(isDemoGuaranteeMigrationMissingError(missing)).toBe(true)
    expect(
      isDemoGuaranteeMigrationMissingError({
        code: '42501',
        message: 'row-level security violation',
      }),
    ).toBe(false)
  })

  it('throws cloud read and write errors instead of reporting success', async () => {
    const readError = {
      code: '42501',
      message: 'row-level security violation',
    }
    const readAdapter = new CloudDemoGuaranteeAdapter(
      fakeClient({ loadResult: { data: null, error: readError } }),
    )
    await expect(readAdapter.load('user-1')).rejects.toBe(readError)

    const writeError = { code: '503', message: 'network unavailable' }
    const writeAdapter = new CloudDemoGuaranteeAdapter(
      fakeClient({
        loadResult: { data: [], error: null },
        writeResult: { data: null, error: writeError },
      }),
    )
    await expect(writeAdapter.save('user-1', simulation)).rejects.toBe(
      writeError,
    )
  })

  it('writes the strict fictional evidence row', async () => {
    const writes: unknown[] = []
    const adapter = new CloudDemoGuaranteeAdapter(fakeClient({ writes }))
    await expect(adapter.save('user-1', simulation)).resolves.toMatchObject({
      status: 'ok',
      simulation,
    })
    expect(writes).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        simulation_run_id: 'run-1',
        schema_version: 1,
        is_simulation: true,
        status: 'pending',
      }),
    ])
  })
})
