import type { PythonCodeResponseV1, PythonCaseId } from '../types/assessment'
import type { JsonValue } from '../types/learning'
import {
  PYTHON_JUDGE_CAPS,
  type PythonJudgePlanV1,
  utf8ByteLength,
  validatePythonJudgePlan,
} from '../lib/pythonJudgeHarness'

export const PYTHON_JUDGE_PROTOCOL_VERSION = 1 as const

const REQUEST_ID = /^[A-Za-z0-9:_-]{8,128}$/u
const NONCE = /^[A-Za-z0-9_-]{16,128}$/u
const MAX_ERROR_MESSAGE_BYTES = 4_096

export const PYTHON_JUDGE_ERROR_CATEGORIES = [
  'protocol',
  'initialization',
  'validation',
  'syntax',
  'import',
  'entrypoint',
  'runtime',
  'resultEncoding',
  'outputLimit',
  'timeout',
  'workerCrash',
  'internal',
] as const

export type PythonJudgeErrorCategory =
  (typeof PYTHON_JUDGE_ERROR_CATEGORIES)[number]

export type PythonJudgeError = {
  category: PythonJudgeErrorCategory
  message: string
  caseId?: PythonCaseId
}

export type PythonJudgeCaseResult = {
  caseId: PythonCaseId
  visibility: 'example' | 'hidden'
  passed: boolean
  actual?: JsonValue
  expected?: JsonValue
  error?: PythonJudgeError
}

export type PythonJudgeRunResult = {
  status: 'passed' | 'failed' | 'error'
  assessmentId: PythonJudgePlanV1['id']
  cases: readonly PythonJudgeCaseResult[]
  passedCases: number
  totalCases: number
  stdout: string
  stderr: string
  durationMs: number
  /**
   * Pyodide/Wasm cannot enforce the content-authored memoryMb value reliably.
   * Keep this explicit so callers never treat that value as a hard sandbox.
   */
  memoryLimitEnforced: false
  error?: PythonJudgeError
}

type PythonJudgeEnvelope = {
  protocolVersion: typeof PYTHON_JUDGE_PROTOCOL_VERSION
  requestId: string
  nonce: string
}

export type PythonJudgeInitializeRequest = PythonJudgeEnvelope & {
  type: 'initialize'
}

export type PythonJudgeRunRequest = PythonJudgeEnvelope & {
  type: 'run'
  plan: PythonJudgePlanV1
  response: PythonCodeResponseV1
}

export type PythonJudgeRequest =
  | PythonJudgeInitializeRequest
  | PythonJudgeRunRequest

export type PythonJudgeInitializedResponse = PythonJudgeEnvelope & {
  type: 'initialized'
}

export type PythonJudgeRunResponse = PythonJudgeEnvelope & {
  type: 'runResult'
  result: PythonJudgeRunResult
}

export type PythonJudgeErrorResponse = PythonJudgeEnvelope & {
  type: 'error'
  phase: 'protocol' | 'initialize' | 'run'
  error: PythonJudgeError
}

export type PythonJudgeResponse =
  | PythonJudgeInitializedResponse
  | PythonJudgeRunResponse
  | PythonJudgeErrorResponse

export type PythonJudgeProtocolValidation<T> =
  | { valid: true; value: T }
  | { valid: false; error: string }

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  )
}

function invalid<T>(error: string): PythonJudgeProtocolValidation<T> {
  return { valid: false, error }
}

function validEnvelope(value: UnknownRecord): boolean {
  return (
    value.protocolVersion === PYTHON_JUDGE_PROTOCOL_VERSION &&
    typeof value.requestId === 'string' &&
    REQUEST_ID.test(value.requestId) &&
    typeof value.nonce === 'string' &&
    NONCE.test(value.nonce)
  )
}

function validError(value: unknown): value is PythonJudgeError {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['category', 'message'], ['caseId']) ||
    typeof value.category !== 'string' ||
    !PYTHON_JUDGE_ERROR_CATEGORIES.includes(
      value.category as PythonJudgeErrorCategory,
    ) ||
    typeof value.message !== 'string' ||
    utf8ByteLength(value.message) > MAX_ERROR_MESSAGE_BYTES
  ) {
    return false
  }
  return (
    value.caseId === undefined ||
    (typeof value.caseId === 'string' && /^case:.+/u.test(value.caseId))
  )
}

function validJsonValue(
  value: unknown,
  state: {
    depth: number
    nodes: number
    ancestors: WeakSet<object>
  } = { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
): value is JsonValue {
  state.nodes += 1
  if (state.depth > 64 || state.nodes > 100_000) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || state.ancestors.has(value)) return false

  state.ancestors.add(value)
  const childState = { ...state, depth: state.depth + 1 }
  const valid = Array.isArray(value)
    ? value.every((item) => validJsonValue(item, childState))
    : Object.values(value).every((item) => validJsonValue(item, childState))
  state.nodes = childState.nodes
  state.ancestors.delete(value)
  return valid
}

function validCaseResult(value: unknown): value is PythonJudgeCaseResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['caseId', 'visibility', 'passed'],
      ['actual', 'expected', 'error'],
    ) ||
    typeof value.caseId !== 'string' ||
    !/^case:.+/u.test(value.caseId) ||
    (value.visibility !== 'example' && value.visibility !== 'hidden') ||
    typeof value.passed !== 'boolean' ||
    (value.actual !== undefined && !validJsonValue(value.actual)) ||
    (value.expected !== undefined && !validJsonValue(value.expected)) ||
    (value.error !== undefined && !validError(value.error))
  ) {
    return false
  }
  if (
    value.visibility === 'hidden' &&
    (value.actual !== undefined || value.expected !== undefined)
  ) {
    return false
  }
  return true
}

function validRunResult(value: unknown): value is PythonJudgeRunResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'status',
        'assessmentId',
        'cases',
        'passedCases',
        'totalCases',
        'stdout',
        'stderr',
        'durationMs',
        'memoryLimitEnforced',
      ],
      ['error'],
    ) ||
    (value.status !== 'passed' &&
      value.status !== 'failed' &&
      value.status !== 'error') ||
    typeof value.assessmentId !== 'string' ||
    !/^assessment:.+/u.test(value.assessmentId) ||
    !Array.isArray(value.cases) ||
    value.cases.length > PYTHON_JUDGE_CAPS.maxCases ||
    !value.cases.every(validCaseResult) ||
    typeof value.passedCases !== 'number' ||
    !Number.isSafeInteger(value.passedCases) ||
    typeof value.totalCases !== 'number' ||
    !Number.isSafeInteger(value.totalCases) ||
    value.totalCases < value.cases.length ||
    value.totalCases > PYTHON_JUDGE_CAPS.maxCases ||
    value.passedCases !==
      value.cases.filter(
        (caseResult) =>
          isRecord(caseResult) && caseResult.passed === true,
      ).length ||
    typeof value.stdout !== 'string' ||
    typeof value.stderr !== 'string' ||
    utf8ByteLength(value.stdout) + utf8ByteLength(value.stderr) >
      PYTHON_JUDGE_CAPS.maxOutputBytes ||
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    value.memoryLimitEnforced !== false ||
    (value.error !== undefined && !validError(value.error))
  ) {
    return false
  }

  const allPassed =
    value.cases.length > 0 &&
    value.cases.every(
      (caseResult) =>
        isRecord(caseResult) && caseResult.passed === true,
    )
  if (value.status === 'passed') {
    return (
      allPassed &&
      value.totalCases === value.cases.length &&
      value.error === undefined
    )
  }
  if (value.status === 'failed') {
    return (
      !allPassed &&
      value.totalCases === value.cases.length &&
      value.error === undefined &&
      value.cases.every(
        (caseResult) =>
          isRecord(caseResult) && caseResult.error === undefined,
      )
    )
  }
  return value.error !== undefined
}

export function validatePythonJudgeRequest(
  value: unknown,
): PythonJudgeProtocolValidation<PythonJudgeRequest> {
  if (!isRecord(value) || !validEnvelope(value)) {
    return invalid('invalid protocol envelope')
  }
  if (value.type === 'initialize') {
    if (
      !hasOnlyKeys(value, [
        'protocolVersion',
        'requestId',
        'nonce',
        'type',
      ])
    ) {
      return invalid('initialize request has an invalid shape')
    }
    return { valid: true, value: value as PythonJudgeInitializeRequest }
  }
  if (value.type !== 'run') return invalid('unknown request type')
  if (
    !hasOnlyKeys(value, [
      'protocolVersion',
      'requestId',
      'nonce',
      'type',
      'plan',
      'response',
    ])
  ) {
    return invalid('run request has an invalid shape')
  }
  const planValidation = validatePythonJudgePlan(value.plan)
  if (!planValidation.valid) {
    return invalid(
      `invalid judge plan: ${planValidation.issues[0]?.message ?? 'unknown error'}`,
    )
  }
  if (
    !isRecord(value.response) ||
    !hasOnlyKeys(value.response, ['kind', 'code']) ||
    value.response.kind !== 'pythonCode' ||
    typeof value.response.code !== 'string' ||
    utf8ByteLength(value.response.code) >
      planValidation.value.limits.maxSourceBytes ||
    utf8ByteLength(value.response.code) > PYTHON_JUDGE_CAPS.maxSourceBytes
  ) {
    return invalid('invalid Python response')
  }
  return { valid: true, value: value as PythonJudgeRunRequest }
}

export function validatePythonJudgeResponse(
  value: unknown,
): PythonJudgeProtocolValidation<PythonJudgeResponse> {
  if (!isRecord(value) || !validEnvelope(value)) {
    return invalid('invalid protocol envelope')
  }
  if (value.type === 'initialized') {
    if (
      !hasOnlyKeys(value, [
        'protocolVersion',
        'requestId',
        'nonce',
        'type',
      ])
    ) {
      return invalid('initialized response has an invalid shape')
    }
    return { valid: true, value: value as PythonJudgeInitializedResponse }
  }
  if (value.type === 'runResult') {
    if (
      !hasOnlyKeys(value, [
        'protocolVersion',
        'requestId',
        'nonce',
        'type',
        'result',
      ]) ||
      !validRunResult(value.result)
    ) {
      return invalid('run response has an invalid shape')
    }
    return { valid: true, value: value as PythonJudgeRunResponse }
  }
  if (value.type === 'error') {
    if (
      !hasOnlyKeys(value, [
        'protocolVersion',
        'requestId',
        'nonce',
        'type',
        'phase',
        'error',
      ]) ||
      (value.phase !== 'protocol' &&
        value.phase !== 'initialize' &&
        value.phase !== 'run') ||
      !validError(value.error)
    ) {
      return invalid('error response has an invalid shape')
    }
    return { valid: true, value: value as PythonJudgeErrorResponse }
  }
  return invalid('unknown response type')
}

export function createPythonJudgeErrorResponse(
  envelope: Pick<PythonJudgeEnvelope, 'requestId' | 'nonce'>,
  phase: PythonJudgeErrorResponse['phase'],
  error: PythonJudgeError,
): PythonJudgeErrorResponse {
  return {
    protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
    requestId: envelope.requestId,
    nonce: envelope.nonce,
    type: 'error',
    phase,
    error,
  }
}
