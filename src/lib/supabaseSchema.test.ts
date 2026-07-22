import { describe, expect, it } from 'vitest'
import schemaSource from '../../supabase/schema.sql?raw'
import learningEventsMigration from '../../supabase/migrations/20260711160000_learning_attempt_events.sql?raw'
import learningMasteryMigration from '../../supabase/migrations/20260711160001_learning_mastery.sql?raw'
import academyMigration from '../../supabase/migrations/20260711170000_academy_progress.sql?raw'
import demoGuaranteeMigration from '../../supabase/migrations/20260711190000_demo_guarantee_simulations.sql?raw'
import finalAuditMigration from '../../supabase/migrations/20260711200000_final_audit_integration.sql?raw'

const migrations = [
  {
    name: '20260711160000_learning_attempt_events.sql',
    source: learningEventsMigration,
  },
  {
    name: '20260711160001_learning_mastery.sql',
    source: learningMasteryMigration,
  },
  {
    name: '20260711170000_academy_progress.sql',
    source: academyMigration,
  },
  {
    name: '20260711190000_demo_guarantee_simulations.sql',
    source: demoGuaranteeMigration,
  },
  {
    name: '20260711200000_final_audit_integration.sql',
    source: finalAuditMigration,
  },
] as const

function expectIdempotentDdl(source: string): void {
  expect(source).not.toMatch(/\bcreate\s+table\s+(?!if\s+not\s+exists)/iu)
  expect(source).not.toMatch(
    /\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/iu,
  )

  for (const match of source.matchAll(/create\s+policy\s+"([^"]+)"/giu)) {
    const policyName = match[1]
    const createIndex = match.index ?? -1
    expect(
      source.lastIndexOf(`drop policy if exists "${policyName}"`, createIndex),
    ).toBeGreaterThanOrEqual(0)
  }
  for (const match of source.matchAll(/create\s+trigger\s+([a-z0-9_]+)/giu)) {
    const triggerName = match[1]
    const createIndex = match.index ?? -1
    expect(
      source.lastIndexOf(`drop trigger if exists ${triggerName}`, createIndex),
    ).toBeGreaterThanOrEqual(0)
  }
  expect(source.match(/\$\$/gu)?.length ?? 0).toBeGreaterThanOrEqual(0)
  expect((source.match(/\$\$/gu)?.length ?? 0) % 2).toBe(0)
}

describe('Supabase schema and migration smoke checks', () => {
  it('keeps migration dependencies in timestamp order', () => {
    expect(migrations.map(({ name }) => name)).toEqual(
      [...migrations.map(({ name }) => name)].sort(),
    )
    expect(schemaSource.indexOf('create table if not exists public.learning_attempt_events'))
      .toBeLessThan(schemaSource.indexOf('create table if not exists public.learning_mastery'))
    expect(schemaSource.indexOf('create table if not exists public.problem_progress'))
      .toBeLessThan(schemaSource.indexOf('create table if not exists public.realm_progress'))
    expect(schemaSource.indexOf('create table if not exists public.realm_progress'))
      .toBeLessThan(
        schemaSource.indexOf(
          'create table if not exists public.demo_guarantee_simulations',
        ),
      )
  })

  it('uses supported JSON object counting before realm constraints', () => {
    for (const source of [academyMigration, schemaSource]) {
      expect(source).not.toContain('jsonb_object_length(')
      const definition = source.indexOf(
        'function public.jsonb_object_key_count',
      )
      const use = source.indexOf(
        'quiz_attempt_count >= public.jsonb_object_key_count(quiz_attempts)',
      )
      expect(definition).toBeGreaterThanOrEqual(0)
      expect(use).toBeGreaterThan(definition)
    }
  })

  it('keeps rerunnable DDL guards in every bootstrap source', () => {
    expectIdempotentDdl(schemaSource)
    for (const { source } of migrations) expectIdempotentDdl(source)
  })

  it('routes mutable projections and academy facts through RPCs', () => {
    for (const source of [learningMasteryMigration, schemaSource]) {
      expect(source).toContain(
        'revoke insert, update, delete on public.learning_mastery',
      )
      expect(source).toContain('security definer')
      expect(source).toContain("set search_path = ''")
      expect(source).not.toContain(
        'create policy "learning_mastery_update_own"',
      )
    }
    for (const source of [academyMigration, schemaSource]) {
      expect(source).toContain(
        'function public.merge_academy_mission_progress',
      )
      expect(source).toContain(
        'function public.merge_academy_realm_progress',
      )
      expect(source).toContain('function public.merge_academy_progress')
      expect(source).not.toContain(
        'create policy "problem_progress_delete_own"',
      )
      expect(source).not.toContain(
        'create policy "realm_progress_delete_own"',
      )
    }
    for (const source of [finalAuditMigration, schemaSource]) {
      expect(source).toContain(
        'create table if not exists public.gauntlet_progress',
      )
      expect(source).toContain('function public.merge_gauntlet_progress')
      expect(source).toContain('delayed_retrieval_event_ids')
      expect(source).toContain(
        'mission practice requires nonempty atomic event evidence',
      )
      expect(source).toContain("retained_at >= acquired_at + interval '24 hours'")
      expect(source).toContain('cardinality(acquisition_event_ids) > 0')
      expect(source).toContain('transfer_event_ids && code_test_event_ids')
      expect(source).toContain('from public.learning_attempt_events event')
      expect(source).toContain(
        "event.metadata->>'academyMode' = 'retention'",
      )
      const missionRpc = source.slice(
        source.indexOf(
          'function public.merge_academy_mission_progress',
        ),
        source.indexOf(
          'function public.merge_academy_realm_progress',
        ),
      )
      expect(missionRpc).toContain('min(event.received_at)')
      expect(missionRpc).toContain('max(event.received_at)')
      expect(missionRpc).not.toContain('max(event.occurred_at)')
      expect(missionRpc).toContain(
        'delayed retrieval is not yet server-authorized',
      )
      expect(source).toContain('certification_attempts jsonb')
      expect(source).toContain('concept_outcomes jsonb')
      expect(source).not.toContain(
        'attempts = greatest(gauntlet_progress.attempts',
      )
    }
  })
})
