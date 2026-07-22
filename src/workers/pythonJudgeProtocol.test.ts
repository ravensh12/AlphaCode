import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../types/assessment'
import { createPythonJudgePlan } from '../lib/pythonJudgeHarness'
import {
  PYTHON_JUDGE_PROTOCOL_VERSION,
  type PythonJudgeRunResult,
  validatePythonJudgeRequest,
  validatePythonJudgeResponse,
} from './pythonJudgeProtocol'

const requestId = 'python:1:1'
const nonce = '0123456789abcdef'

const assessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  id: 'assessment:protocol',
  kind: 'pythonCode',
  prompt: 'Return the input.',
  evidenceKind: 'code-tests',
  starterCode: 'def identity(value):\n    return value',
  entrypoint: { kind: 'function', name: 'identity' },
  codecs: {
    arguments: [{ kind: 'integer' }],
    result: { kind: 'integer' },
  },
  cases: [
    {
      id: 'case:example',
      arguments: [1],
      expected: 1,
      visibility: 'example',
    },
    {
      id: 'case:hidden',
      arguments: [2],
      expected: 2,
      visibility: 'hidden',
    },
  ],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 500,
    memoryMb: 64,
    maxOutputBytes: 1_024,
    maxSourceBytes: 10_000,
  },
}

const plan = createPythonJudgePlan(assessment)

const result: PythonJudgeRunResult = {
  status: 'passed',
  assessmentId: assessment.id,
  cases: [
    {
      caseId: 'case:example',
      visibility: 'example',
      passed: true,
      actual: 1,
      expected: 1,
    },
    {
      caseId: 'case:hidden',
      visibility: 'hidden',
      passed: true,
    },
  ],
  passedCases: 2,
  totalCases: 2,
  stdout: '',
  stderr: '',
  durationMs: 12,
  memoryLimitEnforced: false,
}

describe('Python judge protocol validation', () => {
  it('accepts correlated initialize and run messages', () => {
    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'initialize',
      }),
    ).toMatchObject({ valid: true })

    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'run',
        plan,
        response: {
          kind: 'pythonCode',
          code: 'def identity(value):\n    return value',
        },
      }),
    ).toMatchObject({ valid: true })
  })

  it('requires valid ids and nonces and rejects unrelated payload fields', () => {
    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId: 'short',
        nonce,
        type: 'initialize',
      }),
    ).toMatchObject({ valid: false })
    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce: 'predictable',
        type: 'initialize',
      }),
    ).toMatchObject({ valid: false })
    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'run',
        plan,
        response: {
          kind: 'pythonCode',
          code: 'def identity(value):\n    return value',
        },
        authToken: 'must-not-cross-worker-boundary',
      }),
    ).toMatchObject({ valid: false })
  })

  it('rejects source that exceeds the content-owned limit', () => {
    expect(
      validatePythonJudgeRequest({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'run',
        plan: {
          ...plan,
          limits: { ...plan.limits, maxSourceBytes: 4 },
        },
        response: { kind: 'pythonCode', code: 'def identity(): pass' },
      }),
    ).toMatchObject({ valid: false })
  })

  it('accepts valid results and does not allow hidden-case details', () => {
    expect(
      validatePythonJudgeResponse({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'runResult',
        result,
      }),
    ).toMatchObject({ valid: true })

    expect(
      validatePythonJudgeResponse({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'runResult',
        result: {
          ...result,
          cases: result.cases.map((caseResult) =>
            caseResult.visibility === 'hidden'
              ? { ...caseResult, actual: 2, expected: 2 }
              : caseResult,
          ),
        },
      }),
    ).toMatchObject({ valid: false })
  })

  it('rejects inconsistent result counts and malformed errors', () => {
    expect(
      validatePythonJudgeResponse({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'runResult',
        result: { ...result, passedCases: 1 },
      }),
    ).toMatchObject({ valid: false })

    expect(
      validatePythonJudgeResponse({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'error',
        phase: 'run',
        error: { category: 'made-up', message: 'not honest' },
      }),
    ).toMatchObject({ valid: false })
  })

  it('allows an honest early execution error before cases run', () => {
    expect(
      validatePythonJudgeResponse({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId,
        nonce,
        type: 'runResult',
        result: {
          status: 'error',
          assessmentId: assessment.id,
          cases: [],
          passedCases: 0,
          totalCases: assessment.cases.length,
          stdout: '',
          stderr: '',
          durationMs: 2,
          memoryLimitEnforced: false,
          error: {
            category: 'syntax',
            message: 'invalid syntax',
          },
        },
      }),
    ).toMatchObject({ valid: true })
  })
})
