import {
  DEMO_GUARANTEE_POLICY_VERSION,
  DEMO_GUARANTEE_REASON_CODES,
  DEMO_GUARANTEE_REQUIRED_MISSIONS,
  DEMO_GUARANTEE_SCENARIOS,
  DEMO_GUARANTEE_SCHEMA_VERSION,
  DEMO_GUARANTEE_STATUSES,
  type DemoGuaranteeCriteriaSnapshot,
  type DemoGuaranteeEvaluationInput,
  type DemoGuaranteePolicy,
  type DemoGuaranteePolicyWindow,
  type DemoGuaranteeReasonCode,
  type DemoGuaranteeSimulation,
} from '../types/demoGuarantee'

const DAY_MS = 24 * 60 * 60 * 1000

export const DEFAULT_DEMO_GUARANTEE_POLICY: DemoGuaranteePolicy = Object.freeze({
  policyVersion: DEMO_GUARANTEE_POLICY_VERSION,
  requiredMissions: DEMO_GUARANTEE_REQUIRED_MISSIONS,
  simulatedWindowDays: 30,
})

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  'money',
  'currency',
  'order',
  'charge',
  'card',
  'cards',
  'bank',
  'paymentprovider',
  'customeremail',
  'financialnote',
  'financialnotes',
])

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const normalizedKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z]/gu, '')

export function containsForbiddenDemoGuaranteeKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenDemoGuaranteeKey)
  }
  if (!isObject(value)) return false
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_NORMALIZED_KEYS.has(normalizedKey(key)) ||
      containsForbiddenDemoGuaranteeKey(nested),
  )
}

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  )
}

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  Number.isFinite(Date.parse(value))

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0

const isPositiveInteger = (value: unknown): value is number =>
  isNonNegativeInteger(value) && value > 0

const canonicalTimestamp = (value: string, label: string): string => {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} must be a valid timestamp`)
  }
  return new Date(parsed).toISOString()
}

const stableId = (value: string, label: string): string => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 200) {
    throw new Error(`${label} must be a stable non-empty id`)
  }
  return trimmed
}

function validatePolicy(policy: DemoGuaranteePolicy): void {
  if (
    policy.policyVersion !== DEMO_GUARANTEE_POLICY_VERSION ||
    policy.requiredMissions !== DEMO_GUARANTEE_REQUIRED_MISSIONS ||
    !Number.isSafeInteger(policy.simulatedWindowDays) ||
    policy.simulatedWindowDays < 1 ||
    policy.simulatedWindowDays > 3650
  ) {
    throw new Error('Unsupported or invalid demo guarantee policy')
  }
}

function denialReason(
  criteria: DemoGuaranteeCriteriaSnapshot,
): Exclude<
  DemoGuaranteeReasonCode,
  'awaiting-simulated-decision' | 'eligible-under-demo-policy'
> {
  if (!criteria.missionCompletion.met) {
    return 'mission-requirement-not-met'
  }
  if (!criteria.delayedReviewAdherence.met) {
    return 'delayed-review-requirement-not-met'
  }
  if (!criteria.remediationCompletion.met) {
    return 'remediation-requirement-not-met'
  }
  if (!criteria.certificationNotAchieved.met) {
    return 'certification-already-achieved'
  }
  return 'outside-simulated-policy-window'
}

export type DemoGuaranteeEvaluation = {
  readonly simulatedPolicyWindow: DemoGuaranteePolicyWindow
  readonly criteria: DemoGuaranteeCriteriaSnapshot
  readonly eligible: boolean
  readonly ineligibleReason?: ReturnType<typeof denialReason>
}

export function evaluateDemoGuaranteeCriteria(
  input: DemoGuaranteeEvaluationInput,
  policy: DemoGuaranteePolicy = DEFAULT_DEMO_GUARANTEE_POLICY,
): DemoGuaranteeEvaluation {
  validatePolicy(policy)
  if (
    !Number.isSafeInteger(input.completedMissions) ||
    input.completedMissions < 0 ||
    typeof input.delayedReviewAdherenceMet !== 'boolean' ||
    typeof input.remediationComplete !== 'boolean' ||
    typeof input.certificationAchieved !== 'boolean' ||
    !(DEMO_GUARANTEE_SCENARIOS as readonly string[]).includes(input.scenario)
  ) {
    throw new RangeError('Invalid demo guarantee evaluation input')
  }

  const startsAt = canonicalTimestamp(input.windowStartsAt, 'windowStartsAt')
  const evaluatedAt = canonicalTimestamp(input.evaluatedAt, 'evaluatedAt')
  const startMs = Date.parse(startsAt)
  const endsAt = new Date(
    startMs + policy.simulatedWindowDays * DAY_MS,
  ).toISOString()
  const evaluatedMs = Date.parse(evaluatedAt)

  const criteria: DemoGuaranteeCriteriaSnapshot = {
    missionCompletion: {
      completedMissions: input.completedMissions,
      requiredMissions: policy.requiredMissions,
      met: input.completedMissions >= policy.requiredMissions,
    },
    delayedReviewAdherence: {
      isSimulated: true,
      met: input.delayedReviewAdherenceMet,
    },
    remediationCompletion: {
      isSimulated: true,
      met: input.remediationComplete,
    },
    certificationNotAchieved: {
      certificationAchieved: input.certificationAchieved,
      met: !input.certificationAchieved,
    },
    policyWindow: {
      met: evaluatedMs >= startMs && evaluatedMs <= Date.parse(endsAt),
    },
  }
  const eligible = Object.values(criteria).every((criterion) => criterion.met)
  const simulatedPolicyWindow: DemoGuaranteePolicyWindow = {
    startsAt,
    endsAt,
    evaluatedAt,
    durationDays: policy.simulatedWindowDays,
  }

  return {
    simulatedPolicyWindow,
    criteria,
    eligible,
    ...(eligible ? {} : { ineligibleReason: denialReason(criteria) }),
  }
}

export function createDemoGuaranteeSimulation(
  input: DemoGuaranteeEvaluationInput,
  policy: DemoGuaranteePolicy = DEFAULT_DEMO_GUARANTEE_POLICY,
): DemoGuaranteeSimulation {
  const simulationRunId = stableId(input.simulationRunId, 'simulationRunId')
  const recordedAt = canonicalTimestamp(input.recordedAt, 'recordedAt')
  const evaluation = evaluateDemoGuaranteeCriteria(input, policy)
  return {
    schemaVersion: DEMO_GUARANTEE_SCHEMA_VERSION,
    isSimulation: true,
    simulationRunId,
    policyVersion: policy.policyVersion,
    scenario: input.scenario,
    simulatedPolicyWindow: evaluation.simulatedPolicyWindow,
    criteria: evaluation.criteria,
    eligible: evaluation.eligible,
    status: 'pending',
    reasonCode: 'awaiting-simulated-decision',
    revision: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  }
}

export function reevaluateDemoGuaranteeSimulation(
  current: DemoGuaranteeSimulation,
  input: DemoGuaranteeEvaluationInput,
  policy: DemoGuaranteePolicy = DEFAULT_DEMO_GUARANTEE_POLICY,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(current)
  if (current.status !== 'pending') return current
  if (stableId(input.simulationRunId, 'simulationRunId') !== current.simulationRunId) {
    throw new Error('Re-evaluation must keep the same simulation run id')
  }
  const evaluation = evaluateDemoGuaranteeCriteria(input, policy)
  const updatedAt = canonicalTimestamp(input.recordedAt, 'recordedAt')
  if (Date.parse(updatedAt) < Date.parse(current.createdAt)) {
    throw new Error('Re-evaluation cannot predate the simulation run')
  }
  return {
    ...current,
    policyVersion: policy.policyVersion,
    scenario: input.scenario,
    simulatedPolicyWindow: evaluation.simulatedPolicyWindow,
    criteria: evaluation.criteria,
    eligible: evaluation.eligible,
    reasonCode: 'awaiting-simulated-decision',
    revision: current.revision + 1,
    updatedAt,
  }
}

export function resetDemoGuaranteeSimulation(
  current: DemoGuaranteeSimulation,
  input: DemoGuaranteeEvaluationInput,
  policy: DemoGuaranteePolicy = DEFAULT_DEMO_GUARANTEE_POLICY,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(current)
  if (stableId(input.simulationRunId, 'simulationRunId') === current.simulationRunId) {
    throw new Error('Reset must create a new simulation run id')
  }
  const reset = createDemoGuaranteeSimulation(input, policy)
  if (Date.parse(reset.createdAt) <= Date.parse(current.createdAt)) {
    throw new Error('Reset must create a newer simulation run')
  }
  return reset
}

const terminalTimestamp = (
  simulation: DemoGuaranteeSimulation,
  decidedAt: string,
): string => {
  const timestamp = canonicalTimestamp(decidedAt, 'decidedAt')
  if (Date.parse(timestamp) < Date.parse(simulation.updatedAt)) {
    throw new Error('A simulated decision cannot predate the current revision')
  }
  return timestamp
}

export function approveDemoGuaranteeSimulation(
  simulation: DemoGuaranteeSimulation,
  decidedAt: string,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(simulation)
  if (simulation.status !== 'pending') return simulation
  if (!simulation.eligible) {
    throw new Error('An ineligible demo guarantee simulation cannot be approved')
  }
  const timestamp = terminalTimestamp(simulation, decidedAt)
  return {
    ...simulation,
    status: 'approved',
    reasonCode: 'eligible-under-demo-policy',
    revision: simulation.revision + 1,
    updatedAt: timestamp,
    decidedAt: timestamp,
  }
}

export function denyDemoGuaranteeSimulation(
  simulation: DemoGuaranteeSimulation,
  decidedAt: string,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(simulation)
  if (simulation.status !== 'pending') return simulation
  if (simulation.eligible) {
    throw new Error('An eligible demo guarantee simulation cannot be denied')
  }
  const timestamp = terminalTimestamp(simulation, decidedAt)
  return {
    ...simulation,
    status: 'denied',
    reasonCode: denialReason(simulation.criteria),
    revision: simulation.revision + 1,
    updatedAt: timestamp,
    decidedAt: timestamp,
  }
}

export function decideDemoGuaranteeSimulation(
  simulation: DemoGuaranteeSimulation,
  decidedAt: string,
): DemoGuaranteeSimulation {
  return simulation.eligible
    ? approveDemoGuaranteeSimulation(simulation, decidedAt)
    : denyDemoGuaranteeSimulation(simulation, decidedAt)
}

function compareSameRun(
  a: DemoGuaranteeSimulation,
  b: DemoGuaranteeSimulation,
): number {
  const terminalRank = (value: DemoGuaranteeSimulation): number =>
    value.status === 'pending' ? 0 : 1
  return (
    terminalRank(a) - terminalRank(b) ||
    a.revision - b.revision ||
    Date.parse(a.updatedAt) - Date.parse(b.updatedAt) ||
    a.updatedAt.localeCompare(b.updatedAt) ||
    (a.decidedAt ?? '').localeCompare(b.decidedAt ?? '') ||
    a.status.localeCompare(b.status) ||
    a.reasonCode.localeCompare(b.reasonCode) ||
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  )
}

/**
 * This merge is separate from ProgressState reconciliation. It chooses one
 * immutable simulation snapshot using a total ordering, making the operation
 * commutative, associative, and idempotent.
 */
export function mergeDemoGuaranteeSimulations(
  a: DemoGuaranteeSimulation,
  b: DemoGuaranteeSimulation,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(a)
  assertDemoGuaranteeSimulation(b)
  // One global total order is required for associativity. Valid snapshots of
  // the same run share createdAt, so revision/status still selects the terminal
  // copy; malformed cross-run combinations cannot make the comparator switch
  // ordering rules mid-merge.
  const comparison =
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.simulationRunId.localeCompare(b.simulationRunId) ||
    compareSameRun(a, b)
  return comparison >= 0 ? a : b
}

function validWindow(value: unknown): value is DemoGuaranteePolicyWindow {
  if (
    !isObject(value) ||
    !exactKeys(value, ['startsAt', 'endsAt', 'evaluatedAt', 'durationDays']) ||
    !isTimestamp(value.startsAt) ||
    !isTimestamp(value.endsAt) ||
    !isTimestamp(value.evaluatedAt) ||
    !isPositiveInteger(value.durationDays) ||
    value.durationDays > 3650
  ) {
    return false
  }
  return (
    Date.parse(value.endsAt) ===
    Date.parse(value.startsAt) + value.durationDays * DAY_MS
  )
}

function validCriteria(
  value: unknown,
): value is DemoGuaranteeCriteriaSnapshot {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      'missionCompletion',
      'delayedReviewAdherence',
      'remediationCompletion',
      'certificationNotAchieved',
      'policyWindow',
    ])
  ) {
    return false
  }
  const mission = value.missionCompletion
  const review = value.delayedReviewAdherence
  const remediation = value.remediationCompletion
  const certification = value.certificationNotAchieved
  const window = value.policyWindow
  if (
    !isObject(mission) ||
    !exactKeys(mission, [
      'completedMissions',
      'requiredMissions',
      'met',
    ]) ||
    !isNonNegativeInteger(mission.completedMissions) ||
    mission.requiredMissions !== DEMO_GUARANTEE_REQUIRED_MISSIONS ||
    mission.met !==
      (mission.completedMissions >= DEMO_GUARANTEE_REQUIRED_MISSIONS) ||
    !isObject(review) ||
    !exactKeys(review, ['isSimulated', 'met']) ||
    review.isSimulated !== true ||
    typeof review.met !== 'boolean' ||
    !isObject(remediation) ||
    !exactKeys(remediation, ['isSimulated', 'met']) ||
    remediation.isSimulated !== true ||
    typeof remediation.met !== 'boolean' ||
    !isObject(certification) ||
    !exactKeys(certification, ['certificationAchieved', 'met']) ||
    typeof certification.certificationAchieved !== 'boolean' ||
    certification.met !== !certification.certificationAchieved ||
    !isObject(window) ||
    !exactKeys(window, ['met']) ||
    typeof window.met !== 'boolean'
  ) {
    return false
  }
  return true
}

export function isDemoGuaranteeSimulation(
  value: unknown,
): value is DemoGuaranteeSimulation {
  if (
    containsForbiddenDemoGuaranteeKey(value) ||
    !isObject(value) ||
    !exactKeys(
      value,
      [
        'schemaVersion',
        'isSimulation',
        'simulationRunId',
        'policyVersion',
        'scenario',
        'simulatedPolicyWindow',
        'criteria',
        'eligible',
        'status',
        'reasonCode',
        'revision',
        'createdAt',
        'updatedAt',
      ],
      ['decidedAt'],
    ) ||
    value.schemaVersion !== DEMO_GUARANTEE_SCHEMA_VERSION ||
    value.isSimulation !== true ||
    typeof value.simulationRunId !== 'string' ||
    !value.simulationRunId.trim() ||
    value.simulationRunId.length > 200 ||
    value.policyVersion !== DEMO_GUARANTEE_POLICY_VERSION ||
    typeof value.scenario !== 'string' ||
    !(DEMO_GUARANTEE_SCENARIOS as readonly string[]).includes(value.scenario) ||
    !validWindow(value.simulatedPolicyWindow) ||
    !validCriteria(value.criteria) ||
    typeof value.eligible !== 'boolean' ||
    typeof value.status !== 'string' ||
    !(DEMO_GUARANTEE_STATUSES as readonly string[]).includes(value.status) ||
    typeof value.reasonCode !== 'string' ||
    !(DEMO_GUARANTEE_REASON_CODES as readonly string[]).includes(
      value.reasonCode,
    ) ||
    !isPositiveInteger(value.revision) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    Date.parse(value.createdAt) > Date.parse(value.updatedAt)
  ) {
    return false
  }

  const criteria = value.criteria as DemoGuaranteeCriteriaSnapshot
  const window = value.simulatedPolicyWindow as DemoGuaranteePolicyWindow
  const eligible = Object.values(criteria).every((criterion) => criterion.met)
  if (
    value.eligible !== eligible ||
    criteria.policyWindow.met !==
      (Date.parse(window.evaluatedAt) >= Date.parse(window.startsAt) &&
        Date.parse(window.evaluatedAt) <= Date.parse(window.endsAt))
  ) {
    return false
  }

  const status = value.status
  if (status === 'pending') {
    return (
      value.reasonCode === 'awaiting-simulated-decision' &&
      value.decidedAt === undefined
    )
  }
  if (
    !isTimestamp(value.decidedAt) ||
    Date.parse(value.decidedAt) < Date.parse(value.createdAt) ||
    Date.parse(value.decidedAt) > Date.parse(value.updatedAt)
  ) {
    return false
  }
  if (status === 'approved') {
    return value.eligible && value.reasonCode === 'eligible-under-demo-policy'
  }
  return !value.eligible && value.reasonCode === denialReason(criteria)
}

export function assertDemoGuaranteeSimulation(
  value: unknown,
): asserts value is DemoGuaranteeSimulation {
  if (!isDemoGuaranteeSimulation(value)) {
    throw new Error(
      'Invalid demo guarantee simulation; isSimulation must be true and the evidence shape must be exact',
    )
  }
}

export function parseDemoGuaranteeSimulation(
  value: unknown,
): DemoGuaranteeSimulation {
  assertDemoGuaranteeSimulation(value)
  return value
}
