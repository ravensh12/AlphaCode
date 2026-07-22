import type { ProblemId } from '../../../../types/curriculum'
import type { JsonValue } from '../../../../types/learning'
import type { PythonComparatorV1 } from '../../../../types/assessment'
import { comparePythonJson } from '../../../../lib/pythonJudgeHarness'
import type { ProblemMissionPythonCasesSeed } from '../problemMissionSeed'
import type {
  ProblemMissionMutant,
  ProblemMissionOracle,
  ProblemMissionOracleRegistry,
  PureJsonProblemSolver,
} from './oracleContract'
import type { DiscoveredProblemMissionSeed } from './seedDiscovery'

export type OracleCaseClass =
  | 'visible'
  | 'boundary'
  | 'adversarial'
  | 'additional'

export type OracleCase = {
  readonly id: string
  readonly caseClass: OracleCaseClass
  readonly input: JsonValue
  readonly expected: JsonValue
}

export type MutantEvaluation = {
  readonly id: string
  readonly description: string
  readonly killed: boolean
  readonly killedByCaseIds: readonly string[]
}

export type ProblemOracleEvaluation = {
  readonly problemId: ProblemId
  readonly oraclePresent: boolean
  readonly caseCount: number
  readonly oraclePassed: boolean
  readonly mutants: readonly MutantEvaluation[]
}

export type OracleEvaluationIssueKind =
  | 'missing-oracle'
  | 'orphan-oracle'
  | 'oracle-id-mismatch'
  | 'invalid-json'
  | 'impure-solver'
  | 'nondeterministic-solver'
  | 'oracle-mismatch'
  | 'missing-mutant'
  | 'insufficient-mutants'
  | 'duplicate-mutant-id'
  | 'mutant-survived'

export type OracleEvaluationIssue = {
  readonly kind: OracleEvaluationIssueKind
  readonly problemId: ProblemId
  readonly caseId?: string
  readonly mutantId?: string
  readonly message: string
}

export type CurriculumOracleEvaluationReport = {
  readonly releaseMode: boolean
  readonly passed: boolean
  readonly discoveredProblemCount: number
  readonly registeredOracleCount: number
  readonly evaluatedOracleCount: number
  readonly missingOracleIds: readonly ProblemId[]
  readonly killedMutants: number
  readonly survivingMutants: number
  readonly mutationScore: number
  readonly minimumMutantsPerProblem: number
  readonly problems: readonly ProblemOracleEvaluation[]
  readonly issues: readonly OracleEvaluationIssue[]
}

export type OracleEvaluationOptions = {
  /**
   * Missing oracles are informational during parallel authoring and blocking
   * only in explicit release evaluation.
   */
  readonly releaseMode?: boolean
  /**
   * Migration-safe mutation-strength gate. Set to 2 for realm authoring and
   * release readiness; the default remains 1 until all realm files migrate.
   */
  readonly minimumMutantsPerProblem?: number
}

function runtimeEnvironment(): Readonly<Record<string, string | undefined>> {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Readonly<Record<string, string | undefined>> }
    }
  ).process?.env ?? {}
}

export function oracleReleaseModeFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> =
    runtimeEnvironment(),
): boolean {
  return (
    environment.NEETCODE_ORACLE_RELEASE === '1' ||
    environment.NEETCODE_ORACLE_RELEASE === 'true'
  )
}

export function problemMissionCases(
  cases: ProblemMissionPythonCasesSeed,
): readonly OracleCase[] {
  return [
    {
      id: 'visible-example',
      caseClass: 'visible',
      ...cases.visibleExample,
    },
    {
      id: 'hidden-boundary',
      caseClass: 'boundary',
      ...cases.hiddenBoundary,
    },
    {
      id: 'hidden-adversarial',
      caseClass: 'adversarial',
      ...cases.hiddenAdversarial,
    },
    ...(cases.additional ?? []).map(({ id, input, expected }) => ({
      id: `additional:${id}`,
      caseClass: 'additional' as const,
      input,
      expected,
    })),
  ]
}

function canonicalJson(value: unknown, path = '$', seen = new Set<object>()): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} contains a non-finite number`)
      }
      return JSON.stringify(value)
    case 'object': {
      if (seen.has(value)) throw new TypeError(`${path} contains a cycle`)
      seen.add(value)
      let result: string
      if (Array.isArray(value)) {
        result = `[${value
          .map((item, index) => canonicalJson(item, `${path}[${index}]`, seen))
          .join(',')}]`
      } else {
        const record = value as Record<string, unknown>
        result = `{${Object.keys(record)
          .sort()
          .map(
            (key) =>
              `${JSON.stringify(key)}:${canonicalJson(record[key], `${path}.${key}`, seen)}`,
          )
          .join(',')}}`
      }
      seen.delete(value)
      return result
    }
    default:
      throw new TypeError(`${path} is not a JSON value`)
  }
}

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue
}

type SolverRun =
  | {
      readonly ok: true
      readonly output: JsonValue
      readonly outputKey: string
      readonly inputChanged: boolean
      readonly deterministic: boolean
    }
  | { readonly ok: false; readonly error: string }

function runSolver(solve: PureJsonProblemSolver, input: JsonValue): SolverRun {
  try {
    const firstInput = cloneJson(input)
    const inputBefore = canonicalJson(firstInput)
    const firstOutput = solve(firstInput)
    const outputKey = canonicalJson(firstOutput)
    const inputChanged = canonicalJson(firstInput) !== inputBefore

    const secondInput = cloneJson(input)
    const secondOutput = solve(secondInput)
    const deterministic = canonicalJson(secondOutput) === outputKey

    return {
      ok: true,
      output: firstOutput,
      outputKey,
      inputChanged,
      deterministic,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function evaluateOracleCase(
  problemId: ProblemId,
  oracle: ProblemMissionOracle,
  testCase: OracleCase,
  comparator: PythonComparatorV1,
  issues: OracleEvaluationIssue[],
): boolean {
  let expectedKey: string
  try {
    canonicalJson(testCase.input)
    expectedKey = canonicalJson(testCase.expected)
  } catch (error) {
    issues.push({
      kind: 'invalid-json',
      problemId,
      caseId: testCase.id,
      message: `${problemId} ${testCase.id}: ${error instanceof Error ? error.message : String(error)}`,
    })
    return false
  }

  const run = runSolver(oracle.solve, testCase.input)
  if (!run.ok) {
    issues.push({
      kind: 'invalid-json',
      problemId,
      caseId: testCase.id,
      message: `${problemId} oracle failed on ${testCase.id}: ${run.error}`,
    })
    return false
  }

  let passed = true
  if (run.inputChanged) {
    passed = false
    issues.push({
      kind: 'impure-solver',
      problemId,
      caseId: testCase.id,
      message: `${problemId} oracle mutated its JSON input on ${testCase.id}`,
    })
  }
  if (!run.deterministic) {
    passed = false
    issues.push({
      kind: 'nondeterministic-solver',
      problemId,
      caseId: testCase.id,
      message: `${problemId} oracle returned different results for ${testCase.id}`,
    })
  }
  if (
    !comparePythonJson(
      run.output,
      testCase.expected,
      comparator,
      [testCase.input],
    )
  ) {
    passed = false
    issues.push({
      kind: 'oracle-mismatch',
      problemId,
      caseId: testCase.id,
      message: `${problemId} oracle returned ${canonicalJson(run.output)} for ${testCase.id}; expected ${expectedKey}`,
    })
  }
  return passed
}

function evaluateMutant(
  mutant: ProblemMissionMutant,
  cases: readonly OracleCase[],
  comparator: PythonComparatorV1,
): MutantEvaluation {
  const killedByCaseIds: string[] = []
  for (const testCase of cases) {
    try {
      canonicalJson(testCase.expected)
    } catch {
      continue
    }
    const run = runSolver(mutant.solve, testCase.input)
    if (
      !run.ok ||
      run.inputChanged ||
      !run.deterministic ||
      !comparePythonJson(
        run.output,
        testCase.expected,
        comparator,
        [testCase.input],
      )
    ) {
      killedByCaseIds.push(testCase.id)
    }
  }
  return {
    id: mutant.id,
    description: mutant.description,
    killed: killedByCaseIds.length > 0,
    killedByCaseIds,
  }
}

export function evaluateProblemMissionOracles(
  seeds: readonly DiscoveredProblemMissionSeed[],
  registry: ProblemMissionOracleRegistry,
  options: OracleEvaluationOptions = {},
): CurriculumOracleEvaluationReport {
  const releaseMode =
    options.releaseMode ?? oracleReleaseModeFromEnvironment()
  const minimumMutantsPerProblem = Math.max(
    1,
    Math.floor(options.minimumMutantsPerProblem ?? 1),
  )
  const issues: OracleEvaluationIssue[] = []
  const problems: ProblemOracleEvaluation[] = []
  const discoveredIds = new Set(seeds.map(({ problemId }) => problemId))

  for (const [rawProblemId, oracle] of Object.entries(registry)) {
    if (!oracle) continue
    const problemId = rawProblemId as ProblemId
    if (!discoveredIds.has(problemId)) {
      issues.push({
        kind: 'orphan-oracle',
        problemId,
        message: `Oracle "${problemId}" has no discovered mission seed`,
      })
    }
    if (oracle.problemId !== problemId) {
      issues.push({
        kind: 'oracle-id-mismatch',
        problemId,
        message: `Registry key "${problemId}" contains oracle "${oracle.problemId}"`,
      })
    }
  }

  const missingOracleIds: ProblemId[] = []
  for (const { problemId, seed } of seeds) {
    const oracle = registry[problemId]
    const cases = problemMissionCases(seed.pythonChallenge.cases)
    const comparator = seed.pythonChallenge.comparator ?? {
      kind: 'deepEqual' as const,
    }
    if (!oracle) {
      missingOracleIds.push(problemId)
      if (releaseMode) {
        issues.push({
          kind: 'missing-oracle',
          problemId,
          message: `Release evaluation requires an oracle for "${problemId}"`,
        })
      }
      problems.push({
        problemId,
        oraclePresent: false,
        caseCount: cases.length,
        oraclePassed: false,
        mutants: [],
      })
      continue
    }

    if (oracle.mutants.length === 0) {
      issues.push({
        kind: 'missing-mutant',
        problemId,
        message: `Oracle "${problemId}" must define at least one semantic mutant`,
      })
    }
    if (oracle.mutants.length < minimumMutantsPerProblem) {
      issues.push({
        kind: 'insufficient-mutants',
        problemId,
        message:
          `Oracle "${problemId}" defines ${oracle.mutants.length} mutant(s); ` +
          `${minimumMutantsPerProblem} required by this evaluation.`,
      })
    }
    const mutantIds = new Set<string>()
    for (const mutant of oracle.mutants) {
      if (mutantIds.has(mutant.id)) {
        issues.push({
          kind: 'duplicate-mutant-id',
          problemId,
          mutantId: mutant.id,
          message: `Oracle "${problemId}" repeats mutant id "${mutant.id}"`,
        })
      }
      mutantIds.add(mutant.id)
    }

    const oraclePassed = cases
      .map((testCase) =>
        evaluateOracleCase(
          problemId,
          oracle,
          testCase,
          comparator,
          issues,
        ),
      )
      .every(Boolean)
    const mutants = oracle.mutants.map((mutant) =>
      evaluateMutant(mutant, cases, comparator),
    )
    for (const mutant of mutants) {
      if (!mutant.killed) {
        issues.push({
          kind: 'mutant-survived',
          problemId,
          mutantId: mutant.id,
          message: `${problemId} mutant "${mutant.id}" survived all ${cases.length} cases`,
        })
      }
    }
    problems.push({
      problemId,
      oraclePresent: true,
      caseCount: cases.length,
      oraclePassed,
      mutants,
    })
  }

  const allMutants = problems.flatMap(({ mutants }) => mutants)
  const killedMutants = allMutants.filter(({ killed }) => killed).length
  const survivingMutants = allMutants.length - killedMutants
  return {
    releaseMode,
    passed: issues.length === 0,
    discoveredProblemCount: seeds.length,
    registeredOracleCount: Object.values(registry).filter(Boolean).length,
    evaluatedOracleCount: problems.filter(({ oraclePresent }) => oraclePresent)
      .length,
    missingOracleIds,
    killedMutants,
    survivingMutants,
    mutationScore:
      allMutants.length === 0 ? 0 : killedMutants / allMutants.length,
    minimumMutantsPerProblem,
    problems,
    issues,
  }
}

export function formatOracleEvaluationReport(
  report: CurriculumOracleEvaluationReport,
): string {
  const mode = report.releaseMode ? 'release' : 'incremental'
  const summary =
    `Oracle evaluation (${mode}): ${report.evaluatedOracleCount}/${report.discoveredProblemCount} registered; ` +
    `${report.killedMutants} killed, ${report.survivingMutants} survived; ` +
    `${report.missingOracleIds.length} missing; minimum ${report.minimumMutantsPerProblem} mutants/problem.`
  if (report.issues.length === 0) return summary
  return [
    summary,
    ...report.issues.map(
      (issue) =>
        `- [${issue.kind}] ${issue.message}`,
    ),
  ].join('\n')
}
