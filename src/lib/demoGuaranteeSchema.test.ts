import { describe, expect, it } from 'vitest'
import migrationSource from '../../supabase/migrations/20260711190000_demo_guarantee_simulations.sql?raw'
import schemaSource from '../../supabase/schema.sql?raw'

describe('demo guarantee database schema', () => {
  it('mirrors the demo-only table and permanent simulation check', () => {
    for (const source of [migrationSource, schemaSource]) {
      expect(source).toContain(
        'create table if not exists public.demo_guarantee_simulations',
      )
      expect(source).toContain('check (is_simulation = true)')
      expect(source).toContain('must never be repurposed for real refunds')
      expect(source).toContain('demo_guarantee_select_own')
      expect(source).toContain('auth.uid() = user_id')
    }
  })

  it('constrains statuses and stable reason codes', () => {
    expect(migrationSource).toContain(
      "status text not null check (status in ('pending', 'approved', 'denied'))",
    )
    expect(migrationSource).toContain("'mission-requirement-not-met'")
    expect(migrationSource).toContain(
      "'delayed-review-requirement-not-met'",
    )
    expect(migrationSource).toContain(
      "'remediation-requirement-not-met'",
    )
    expect(migrationSource).toContain("'certification-already-achieved'")
    expect(migrationSource).toContain(
      "'outside-simulated-policy-window'",
    )
  })

  it('has no financial data columns in the simulation table', () => {
    const tableBody =
      migrationSource.match(
        /create table if not exists public\.demo_guarantee_simulations \(([\s\S]*?)\n\);/u,
      )?.[1] ?? ''
    expect(tableBody).not.toMatch(
      /^\s*(money|currency|order|charge|cards?|bank|payment_provider|customer_email|financial_notes)\s+/gimu,
    )
  })
})
