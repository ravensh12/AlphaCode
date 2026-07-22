import {
  ASSESSMENT_SCHEMA_VERSION,
  type GradedAssessmentResultV1,
  type PythonCodeAssessmentV1,
} from '../types/assessment'
import type {
  PythonJudgeErrorCategory,
  PythonJudgeRunResult,
} from '../workers/pythonJudgeProtocol'
import { assessmentRevealLabel } from './assessmentGrading'

const INFRASTRUCTURE_ERRORS = new Set<PythonJudgeErrorCategory>([
  'protocol',
  'initialization',
  'validation',
  'workerCrash',
  'internal',
])

export function isPythonJudgeInfrastructureError(
  result: PythonJudgeRunResult,
): boolean {
  return (
    result.status === 'error' &&
    !!result.error &&
    INFRASTRUCTURE_ERRORS.has(result.error.category)
  )
}

const MAX_DETAIL_ERROR_CHARS = 240

function truncated(message: string): string {
  const singleLine = message.trim().split('\n').at(-1) ?? message.trim()
  return singleLine.length > MAX_DETAIL_ERROR_CHARS
    ? `${singleLine.slice(0, MAX_DETAIL_ERROR_CHARS)}…`
    : singleLine
}

/**
 * Human-readable explanation of a non-passing judge run so the learner sees
 * WHAT failed, not just the authored "wrong answer" flavor text. Only data
 * from example-visibility cases is shown; the worker protocol already strips
 * actual/expected from hidden cases.
 */
export function pythonJudgeFailureDetail(
  result: PythonJudgeRunResult,
): string | null {
  if (result.status === 'passed') return null
  if (result.status === 'error' && result.error) {
    const message = truncated(result.error.message)
    switch (result.error.category) {
      case 'syntax':
        return `Python couldn't parse your code: ${message}`
      case 'timeout':
        return 'Your code ran too long and was stopped — check for an infinite loop.'
      case 'entrypoint':
        return message
      default:
        return `Your code raised an error: ${message}`
    }
  }
  const parts = [
    `Passed ${result.passedCases} of ${result.totalCases} checks.`,
  ]
  const exampleMiss = result.cases.find(
    (caseResult) =>
      !caseResult.passed &&
      caseResult.visibility === 'example' &&
      caseResult.actual !== undefined,
  )
  if (exampleMiss) {
    parts.push(
      `Example check: expected ${JSON.stringify(exampleMiss.expected)}, your code returned ${JSON.stringify(exampleMiss.actual)}.`,
    )
  }
  return parts.join(' ')
}

export function pythonJudgeResultToAssessment(
  assessment: PythonCodeAssessmentV1,
  result: PythonJudgeRunResult,
): GradedAssessmentResultV1 {
  const isCorrect = result.status === 'passed'
  const detail = pythonJudgeFailureDetail(result)
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    assessmentId: assessment.id,
    assessmentKind: 'pythonCode',
    revealLabel: assessmentRevealLabel(assessment),
    status: isCorrect ? 'correct' : 'incorrect',
    complete: true,
    isCorrect,
    expectedResponse: {
      status: result.status,
      passedCases: result.passedCases,
      totalCases: result.totalCases,
      ...(result.error ? { errorCategory: result.error.category } : {}),
      ...(detail ? { detail } : {}),
    },
  }
}
