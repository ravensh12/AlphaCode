import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEMO_GUARANTEE_POLICY_VERSION,
  DEMO_GUARANTEE_REQUIRED_MISSIONS,
  DEMO_GUARANTEE_SCHEMA_VERSION,
  type DemoGuaranteeScenario,
  type DemoGuaranteeSimulation,
} from '../types/demoGuarantee'
import {
  mergeDemoGuaranteeSimulations,
  parseDemoGuaranteeSimulation,
} from './demoGuarantee'
import { supabase } from './supabaseClient'

const TABLE = 'demo_guarantee_simulations'
const COLUMNS =
  'simulation_run_id, schema_version, is_simulation, policy_version, scenario, window_starts_at, window_ends_at, window_evaluated_at, window_duration_days, completed_missions, required_missions, missions_complete, delayed_review_adherence_met, remediation_complete, certification_achieved, certification_not_achieved, within_policy_window, eligible, status, reason_code, revision, created_at, updated_at, decided_at'

export type DemoGuaranteeCloudRow = {
  simulation_run_id: string
  schema_version: number | string
  is_simulation: boolean
  policy_version: string
  scenario: string
  window_starts_at: string
  window_ends_at: string
  window_evaluated_at: string
  window_duration_days: number | string
  completed_missions: number | string
  required_missions: number | string
  missions_complete: boolean
  delayed_review_adherence_met: boolean
  remediation_complete: boolean
  certification_achieved: boolean
  certification_not_achieved: boolean
  within_policy_window: boolean
  eligible: boolean
  status: string
  reason_code: string
  revision: number | string
  created_at: string
  updated_at: string
  decided_at: string | null
}

type CloudUnavailableReason = 'not-configured' | 'migration-missing'

export type DemoGuaranteeCloudLoadResult =
  | {
      readonly status: 'ok'
      readonly simulation: DemoGuaranteeSimulation | null
    }
  | {
      readonly status: 'unavailable'
      readonly reason: CloudUnavailableReason
      readonly simulation: null
    }

export type DemoGuaranteeCloudWriteResult =
  | {
      readonly status: 'ok'
      readonly simulation: DemoGuaranteeSimulation
    }
  | {
      readonly status: 'unavailable'
      readonly reason: CloudUnavailableReason
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

export function isDemoGuaranteeMigrationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  if (code !== '42703' && code !== 'PGRST204') return false
  const message = cloudErrorText(error)
  return message.includes(TABLE)
}

const integer = (value: number | string, label: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid demo simulation ${label} returned by Supabase`)
  }
  return parsed
}

export function demoGuaranteeSimulationFromRow(
  row: DemoGuaranteeCloudRow,
): DemoGuaranteeSimulation {
  return parseDemoGuaranteeSimulation({
    schemaVersion: integer(row.schema_version, 'schema version'),
    isSimulation: row.is_simulation,
    simulationRunId: row.simulation_run_id,
    policyVersion: row.policy_version,
    scenario: row.scenario as DemoGuaranteeScenario,
    simulatedPolicyWindow: {
      startsAt: row.window_starts_at,
      endsAt: row.window_ends_at,
      evaluatedAt: row.window_evaluated_at,
      durationDays: integer(row.window_duration_days, 'window duration'),
    },
    criteria: {
      missionCompletion: {
        completedMissions: integer(
          row.completed_missions,
          'completed mission count',
        ),
        requiredMissions: integer(
          row.required_missions,
          'required mission count',
        ),
        met: row.missions_complete,
      },
      delayedReviewAdherence: {
        isSimulated: true,
        met: row.delayed_review_adherence_met,
      },
      remediationCompletion: {
        isSimulated: true,
        met: row.remediation_complete,
      },
      certificationNotAchieved: {
        certificationAchieved: row.certification_achieved,
        met: row.certification_not_achieved,
      },
      policyWindow: {
        met: row.within_policy_window,
      },
    },
    eligible: row.eligible,
    status: row.status,
    reasonCode: row.reason_code,
    revision: integer(row.revision, 'revision'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
  })
}

export const demoGuaranteeSimulationToRow = (
  userId: string,
  value: DemoGuaranteeSimulation,
) => {
  const simulation = parseDemoGuaranteeSimulation(value)
  return {
    user_id: userId,
    simulation_run_id: simulation.simulationRunId,
    schema_version: DEMO_GUARANTEE_SCHEMA_VERSION,
    is_simulation: true,
    policy_version: DEMO_GUARANTEE_POLICY_VERSION,
    scenario: simulation.scenario,
    window_starts_at: simulation.simulatedPolicyWindow.startsAt,
    window_ends_at: simulation.simulatedPolicyWindow.endsAt,
    window_evaluated_at: simulation.simulatedPolicyWindow.evaluatedAt,
    window_duration_days: simulation.simulatedPolicyWindow.durationDays,
    completed_missions:
      simulation.criteria.missionCompletion.completedMissions,
    required_missions: DEMO_GUARANTEE_REQUIRED_MISSIONS,
    missions_complete: simulation.criteria.missionCompletion.met,
    delayed_review_adherence_met:
      simulation.criteria.delayedReviewAdherence.met,
    remediation_complete: simulation.criteria.remediationCompletion.met,
    certification_achieved:
      simulation.criteria.certificationNotAchieved.certificationAchieved,
    certification_not_achieved:
      simulation.criteria.certificationNotAchieved.met,
    within_policy_window: simulation.criteria.policyWindow.met,
    eligible: simulation.eligible,
    status: simulation.status,
    reason_code: simulation.reasonCode,
    revision: simulation.revision,
    created_at: simulation.createdAt,
    updated_at: simulation.updatedAt,
    decided_at: simulation.decidedAt ?? null,
  }
}

export class CloudDemoGuaranteeAdapter {
  constructor(private readonly cloudClient: SupabaseClient | null = supabase) {}

  async load(userId: string): Promise<DemoGuaranteeCloudLoadResult> {
    if (!this.cloudClient) {
      return {
        status: 'unavailable',
        reason: 'not-configured',
        simulation: null,
      }
    }
    const result = await this.cloudClient
      .from(TABLE)
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('simulation_run_id', { ascending: false })
      .limit(1)
    if (result.error) {
      if (isDemoGuaranteeMigrationMissingError(result.error)) {
        return {
          status: 'unavailable',
          reason: 'migration-missing',
          simulation: null,
        }
      }
      throw result.error
    }

    const rows = (result.data ?? []) as unknown as DemoGuaranteeCloudRow[]
    return {
      status: 'ok',
      simulation: rows[0] ? demoGuaranteeSimulationFromRow(rows[0]) : null,
    }
  }

  async save(
    userId: string,
    value: DemoGuaranteeSimulation,
  ): Promise<DemoGuaranteeCloudWriteResult> {
    if (!this.cloudClient) {
      return { status: 'unavailable', reason: 'not-configured' }
    }
    const incoming = parseDemoGuaranteeSimulation(value)
    const loaded = await this.load(userId)
    if (loaded.status === 'unavailable') return loaded
    const simulation = loaded.simulation
      ? mergeDemoGuaranteeSimulations(loaded.simulation, incoming)
      : incoming
    const result = await this.cloudClient
      .from(TABLE)
      .upsert(demoGuaranteeSimulationToRow(userId, simulation), {
        onConflict: 'user_id,simulation_run_id',
      })
    if (result.error) {
      if (isDemoGuaranteeMigrationMissingError(result.error)) {
        return { status: 'unavailable', reason: 'migration-missing' }
      }
      throw result.error
    }
    return { status: 'ok', simulation }
  }
}

