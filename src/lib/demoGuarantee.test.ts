import { describe, expect, it } from 'vitest'
import type {
  DemoGuaranteeEvaluationInput,
  DemoGuaranteePolicy,
  DemoGuaranteeSimulation,
} from '../types/demoGuarantee'
import {
  approveDemoGuaranteeSimulation,
  containsForbiddenDemoGuaranteeKey,
  createDemoGuaranteeSimulation,
  decideDemoGuaranteeSimulation,
  denyDemoGuaranteeSimulation,
  evaluateDemoGuaranteeCriteria,
  isDemoGuaranteeSimulation,
  mergeDemoGuaranteeSimulations,
  reevaluateDemoGuaranteeSimulation,
  resetDemoGuaranteeSimulation,
} from './demoGuarantee'

const START = '2026-07-01T12:00:00.000Z'
const END = '2026-07-31T12:00:00.000Z'

const policy: DemoGuaranteePolicy = {
  policyVersion: 'demo-guarantee-v1',
  requiredMissions: 150,
  simulatedWindowDays: 30,
}

const input = (
  overrides: Partial<DemoGuaranteeEvaluationInput> = {},
): DemoGuaranteeEvaluationInput => ({
  simulationRunId: 'run-1',
  scenario: 'eligible-path',
  completedMissions: 150,
  delayedReviewAdherenceMet: true,
  remediationComplete: true,
  certificationAchieved: false,
  windowStartsAt: START,
  evaluatedAt: '2026-07-15T12:00:00.000Z',
  recordedAt: '2026-07-15T12:00:00.000Z',
  ...overrides,
})

describe('demo guarantee policy evaluation', () => {
  it('includes both boundaries of the configurable mock window', () => {
    expect(
      evaluateDemoGuaranteeCriteria(
        input({ evaluatedAt: START }),
        policy,
      ).criteria.policyWindow.met,
    ).toBe(true)
    expect(
      evaluateDemoGuaranteeCriteria(
        input({ evaluatedAt: END }),
        policy,
      ).criteria.policyWindow.met,
    ).toBe(true)
    expect(
      evaluateDemoGuaranteeCriteria(
        input({ evaluatedAt: '2026-07-31T12:00:00.001Z' }),
        policy,
      ).criteria.policyWindow.met,
    ).toBe(false)
  })

  it('requires all 150 missions', () => {
    const short = createDemoGuaranteeSimulation(
      input({ completedMissions: 149 }),
      policy,
    )
    const complete = createDemoGuaranteeSimulation(
      input({ completedMissions: 150 }),
      policy,
    )
    expect(short.criteria.missionCompletion.met).toBe(false)
    expect(short.eligible).toBe(false)
    expect(complete.criteria.missionCompletion.met).toBe(true)
    expect(complete.eligible).toBe(true)
  })

  it('rejects missing simulated review adherence or remediation', () => {
    const reviewGap = createDemoGuaranteeSimulation(
      input({ delayedReviewAdherenceMet: false }),
      policy,
    )
    const remediationGap = createDemoGuaranteeSimulation(
      input({ remediationComplete: false }),
      policy,
    )
    expect(reviewGap.eligible).toBe(false)
    expect(
      decideDemoGuaranteeSimulation(
        reviewGap,
        '2026-07-15T12:00:01.000Z',
      ).reasonCode,
    ).toBe('delayed-review-requirement-not-met')
    expect(remediationGap.eligible).toBe(false)
    expect(
      decideDemoGuaranteeSimulation(
        remediationGap,
        '2026-07-15T12:00:01.000Z',
      ).reasonCode,
    ).toBe('remediation-requirement-not-met')
  })

  it('is ineligible when certification is already achieved', () => {
    const simulation = createDemoGuaranteeSimulation(
      input({ certificationAchieved: true }),
      policy,
    )
    const decided = decideDemoGuaranteeSimulation(
      simulation,
      '2026-07-15T12:00:01.000Z',
    )
    expect(simulation.criteria.certificationNotAchieved.met).toBe(false)
    expect(decided).toMatchObject({
      status: 'denied',
      reasonCode: 'certification-already-achieved',
    })
  })

  it('never approves an ineligible simulation', () => {
    const simulation = createDemoGuaranteeSimulation(
      input({ completedMissions: 149 }),
      policy,
    )
    expect(() =>
      approveDemoGuaranteeSimulation(
        simulation,
        '2026-07-15T12:00:01.000Z',
      ),
    ).toThrow(/cannot be approved/i)
  })
})

describe('demo guarantee decisions and reset', () => {
  it('keeps terminal decisions immutable', () => {
    const pending = createDemoGuaranteeSimulation(input(), policy)
    const approved = approveDemoGuaranteeSimulation(
      pending,
      '2026-07-15T12:00:01.000Z',
    )
    const changedInput = input({
      completedMissions: 0,
      recordedAt: '2026-07-15T12:00:02.000Z',
    })

    expect(reevaluateDemoGuaranteeSimulation(approved, changedInput, policy)).toBe(
      approved,
    )
    expect(
      denyDemoGuaranteeSimulation(
        approved,
        '2026-07-15T12:00:02.000Z',
      ),
    ).toBe(approved)
    expect(
      approveDemoGuaranteeSimulation(
        approved,
        '2026-07-15T12:00:02.000Z',
      ),
    ).toBe(approved)
  })

  it('creates a new run on reset and lets the newer run win', () => {
    const first = approveDemoGuaranteeSimulation(
      createDemoGuaranteeSimulation(input(), policy),
      '2026-07-15T12:00:01.000Z',
    )
    const reset = resetDemoGuaranteeSimulation(
      first,
      input({
        simulationRunId: 'run-2',
        completedMissions: 149,
        recordedAt: '2026-07-16T12:00:00.000Z',
      }),
      policy,
    )

    expect(reset).toMatchObject({
      simulationRunId: 'run-2',
      status: 'pending',
      revision: 1,
    })
    expect(mergeDemoGuaranteeSimulations(first, reset)).toBe(reset)
    expect(mergeDemoGuaranteeSimulations(reset, first)).toBe(reset)
  })
})

describe('demo guarantee merge', () => {
  it('obeys idempotence, commutativity, and associativity', () => {
    const a = createDemoGuaranteeSimulation(input(), policy)
    const b = reevaluateDemoGuaranteeSimulation(
      a,
      input({ recordedAt: '2026-07-15T12:00:01.000Z' }),
      policy,
    )
    const c = approveDemoGuaranteeSimulation(
      b,
      '2026-07-15T12:00:02.000Z',
    )

    expect(mergeDemoGuaranteeSimulations(a, a)).toBe(a)
    expect(mergeDemoGuaranteeSimulations(a, b)).toBe(
      mergeDemoGuaranteeSimulations(b, a),
    )
    expect(
      mergeDemoGuaranteeSimulations(
        mergeDemoGuaranteeSimulations(a, b),
        c,
      ),
    ).toBe(
      mergeDemoGuaranteeSimulations(
        a,
        mergeDemoGuaranteeSimulations(b, c),
      ),
    )
  })

  it('prefers a terminal snapshot over a higher-revision pending snapshot', () => {
    const pending = createDemoGuaranteeSimulation(input(), policy)
    const terminal = approveDemoGuaranteeSimulation(
      pending,
      '2026-07-15T12:00:01.000Z',
    )
    const highRevisionPending: DemoGuaranteeSimulation = {
      ...pending,
      revision: 99,
      updatedAt: '2026-07-20T12:00:00.000Z',
    }
    expect(
      mergeDemoGuaranteeSimulations(highRevisionPending, terminal),
    ).toBe(terminal)
  })
})

describe('demo guarantee validation', () => {
  it('requires the permanent simulation marker', () => {
    const valid = createDemoGuaranteeSimulation(input(), policy)
    expect(isDemoGuaranteeSimulation(valid)).toBe(true)
    expect(
      isDemoGuaranteeSimulation({ ...valid, isSimulation: false }),
    ).toBe(false)
  })

  it('rejects forbidden or unknown serialized keys', () => {
    const valid = createDemoGuaranteeSimulation(input(), policy)
    const forbidden = { ...valid, paymentProvider: 'example' }
    expect(containsForbiddenDemoGuaranteeKey(forbidden)).toBe(true)
    expect(isDemoGuaranteeSimulation(forbidden)).toBe(false)
    expect(containsForbiddenDemoGuaranteeKey(JSON.parse(JSON.stringify(valid)))).toBe(
      false,
    )
  })
})
