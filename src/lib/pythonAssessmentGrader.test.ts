import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../types/assessment'
import type { PythonJudgeRunResult } from '../workers/pythonJudgeProtocol'
import {
  isPythonJudgeInfrastructureError,
  pythonJudgeResultToAssessment,
} from './pythonAssessmentGrader'

const assessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  id: 'assessment:python-adapter',
  kind: 'pythonCode',
  prompt: 'Return the input.',
  evidenceKind: 'code-tests',
  starterCode: 'def identity(value):\n    return value',
  entrypoint: { kind: 'function', name: 'identity' },
  codecs: { arguments: [{ kind: 'integer' }], result: { kind: 'integer' } },
  cases: [
    {
      id: 'case:one',
      arguments: [1],
      expected: 1,
      visibility: 'example',
    },
  ],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 2_000,
    memoryMb: 64,
    maxOutputBytes: 2_048,
    maxSourceBytes: 16_384,
  },
}

const result = (
  overrides: Partial<PythonJudgeRunResult>,
): PythonJudgeRunResult => ({
  status: 'failed',
  assessmentId: assessment.id,
  cases: [],
  passedCases: 0,
  totalCases: 1,
  stdout: '',
  stderr: '',
  durationMs: 10,
  memoryLimitEnforced: false,
  ...overrides,
})

describe('Python assessment grading adapter', () => {
  it('maps a passing judge run to correct mastery evidence', () => {
    expect(
      pythonJudgeResultToAssessment(
        assessment,
        result({ status: 'passed', passedCases: 1 }),
      ),
    ).toMatchObject({
      status: 'correct',
      isCorrect: true,
      expectedResponse: { passedCases: 1, totalCases: 1 },
    })
  })

  it('counts learner code failures without exposing hidden cases', () => {
    expect(
      pythonJudgeResultToAssessment(
        assessment,
        result({
          status: 'error',
          error: { category: 'syntax', message: 'invalid syntax' },
        }),
      ),
    ).toMatchObject({
      status: 'incorrect',
      isCorrect: false,
      expectedResponse: { errorCategory: 'syntax' },
    })
  })

  it('separates worker infrastructure failures from learner outcomes', () => {
    expect(
      isPythonJudgeInfrastructureError(
        result({
          status: 'error',
          error: { category: 'initialization', message: 'asset unavailable' },
        }),
      ),
    ).toBe(true)
    expect(
      isPythonJudgeInfrastructureError(
        result({
          status: 'error',
          error: { category: 'timeout', message: 'execution timed out' },
        }),
      ),
    ).toBe(false)
  })
})
