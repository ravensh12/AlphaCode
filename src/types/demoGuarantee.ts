export const DEMO_GUARANTEE_SCHEMA_VERSION = 1 as const
export const DEMO_GUARANTEE_POLICY_VERSION = 'demo-guarantee-v1' as const
export const DEMO_GUARANTEE_REQUIRED_MISSIONS = 150 as const

export const DEMO_GUARANTEE_SCENARIOS = [
  'eligible-path',
  'delayed-review-not-met',
  'remediation-not-complete',
  'outside-window',
] as const

export type DemoGuaranteeScenario =
  (typeof DEMO_GUARANTEE_SCENARIOS)[number]

export const DEMO_GUARANTEE_STATUSES = [
  'pending',
  'approved',
  'denied',
] as const

export type DemoGuaranteeStatus =
  (typeof DEMO_GUARANTEE_STATUSES)[number]

export const DEMO_GUARANTEE_REASON_CODES = [
  'awaiting-simulated-decision',
  'eligible-under-demo-policy',
  'mission-requirement-not-met',
  'delayed-review-requirement-not-met',
  'remediation-requirement-not-met',
  'certification-already-achieved',
  'outside-simulated-policy-window',
] as const

export type DemoGuaranteeReasonCode =
  (typeof DEMO_GUARANTEE_REASON_CODES)[number]

export type DemoGuaranteePolicy = {
  readonly policyVersion: typeof DEMO_GUARANTEE_POLICY_VERSION
  readonly requiredMissions: typeof DEMO_GUARANTEE_REQUIRED_MISSIONS
  readonly simulatedWindowDays: number
}

export type DemoGuaranteePolicyWindow = {
  readonly startsAt: string
  readonly endsAt: string
  readonly evaluatedAt: string
  readonly durationDays: number
}

export type DemoGuaranteeCriteriaSnapshot = {
  readonly missionCompletion: {
    readonly completedMissions: number
    readonly requiredMissions: typeof DEMO_GUARANTEE_REQUIRED_MISSIONS
    readonly met: boolean
  }
  readonly delayedReviewAdherence: {
    readonly isSimulated: true
    readonly met: boolean
  }
  readonly remediationCompletion: {
    readonly isSimulated: true
    readonly met: boolean
  }
  readonly certificationNotAchieved: {
    readonly certificationAchieved: boolean
    readonly met: boolean
  }
  readonly policyWindow: {
    readonly met: boolean
  }
}

/**
 * Strict evidence shape for the fictional workflow. It intentionally contains
 * only policy-evaluation facts; validators reject unknown keys recursively.
 */
export type DemoGuaranteeSimulation = {
  readonly schemaVersion: typeof DEMO_GUARANTEE_SCHEMA_VERSION
  readonly isSimulation: true
  readonly simulationRunId: string
  readonly policyVersion: typeof DEMO_GUARANTEE_POLICY_VERSION
  readonly scenario: DemoGuaranteeScenario
  readonly simulatedPolicyWindow: DemoGuaranteePolicyWindow
  readonly criteria: DemoGuaranteeCriteriaSnapshot
  readonly eligible: boolean
  readonly status: DemoGuaranteeStatus
  readonly reasonCode: DemoGuaranteeReasonCode
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly decidedAt?: string
}

export type DemoGuaranteeEvaluationInput = {
  readonly simulationRunId: string
  readonly scenario: DemoGuaranteeScenario
  readonly completedMissions: number
  readonly delayedReviewAdherenceMet: boolean
  readonly remediationComplete: boolean
  readonly certificationAchieved: boolean
  readonly windowStartsAt: string
  readonly evaluatedAt: string
  readonly recordedAt: string
}
