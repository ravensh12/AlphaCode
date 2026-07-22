import type {
  PythonCaseV1,
  PythonCodeAssessmentV1,
} from '../types/assessment'
import type { JsonValue } from '../types/learning'
import type { PythonJudgeRunResult } from '../workers/pythonJudgeProtocol'

/* ============================================================================
   Compact, prompt-friendly text renderings of the coding step for the tutor:
   what the problem asks (entrypoint + example) and what the latest run did
   (counts + the first failing visible case, expected vs actual). Pure
   functions over the same judge types PythonWorkbench renders.
   ========================================================================== */

const MAX_VALUE_CHARS = 200

function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return '—'
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return '—'
  return serialized.length > MAX_VALUE_CHARS
    ? `${serialized.slice(0, MAX_VALUE_CHARS)}…`
    : serialized
}

function callLabel(
  assessment: PythonCodeAssessmentV1,
  testCase: PythonCaseV1,
): string {
  const args = testCase.arguments.map((argument) => formatValue(argument))
  const joined = args.join(', ')
  return assessment.entrypoint.kind === 'function'
    ? `${assessment.entrypoint.name}(${joined})`
    : `${assessment.entrypoint.className}().${assessment.entrypoint.methodName}(${joined})`
}

/** What the coding step asks for — entrypoint plus one example case. */
export function describePythonAssessmentForTutor(
  assessment: PythonCodeAssessmentV1,
): string {
  const lines: string[] = []
  lines.push(
    assessment.entrypoint.kind === 'function'
      ? `Write the function ${assessment.entrypoint.name}(...).`
      : `Implement ${assessment.entrypoint.className}.${assessment.entrypoint.methodName}(...).`,
  )
  const example = assessment.cases.find(
    ({ visibility }) => visibility === 'example',
  )
  if (example) {
    lines.push(
      `Example: ${callLabel(assessment, example)} should return ${formatValue(example.expected)}.`,
    )
  }
  return lines.join('\n')
}

/**
 * The latest run/submission, summarized for the tutor: pass counts plus the
 * first failing visible case (call, expected, actual or error). Hidden-case
 * inputs stay hidden — only their pass count is mentioned.
 */
export function summarizePythonRunForTutor(
  assessment: PythonCodeAssessmentV1,
  result: PythonJudgeRunResult,
  mode: 'run' | 'submit',
): string {
  const caseById = new Map(
    assessment.cases.map((testCase) => [testCase.id, testCase]),
  )
  const lines: string[] = []
  lines.push(
    mode === 'run'
      ? `Practice run over the visible example cases: ${result.passedCases}/${result.totalCases} passed.`
      : `Submission over all tests: ${result.passedCases}/${result.totalCases} passed.`,
  )

  if (result.status === 'error' && result.cases.length === 0 && result.error) {
    lines.push(
      `The code did not finish running — ${result.error.category}: ${result.error.message}`,
    )
    if (result.stderr) lines.push(`stderr: ${result.stderr.slice(0, 400)}`)
    return lines.join('\n')
  }

  const firstVisibleFailure = result.cases.find(
    (caseResult) => !caseResult.passed && caseResult.visibility === 'example',
  )
  if (firstVisibleFailure) {
    const testCase = caseById.get(firstVisibleFailure.caseId)
    if (testCase) {
      lines.push(`First failing case: ${callLabel(assessment, testCase)}`)
    }
    lines.push(
      `Expected: ${formatValue(firstVisibleFailure.expected ?? testCase?.expected)}`,
    )
    lines.push(
      firstVisibleFailure.error
        ? `Got an error — ${firstVisibleFailure.error.category}: ${firstVisibleFailure.error.message}`
        : `Actual: ${formatValue(firstVisibleFailure.actual)}`,
    )
  } else {
    const hiddenFailures = result.cases.filter(
      (caseResult) => !caseResult.passed && caseResult.visibility === 'hidden',
    )
    if (hiddenFailures.length > 0) {
      lines.push(
        `${hiddenFailures.length} hidden ${hiddenFailures.length === 1 ? 'check' : 'checks'} failed (inputs are hidden by design — reason about edge cases).`,
      )
    }
  }
  return lines.join('\n')
}
