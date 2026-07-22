import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
  type PythonCodeResponseV1,
  type PythonComparatorV1,
  type PythonEntrypointV1,
  type PythonObservationV1,
  type PythonValueCodecV1,
} from '../types/assessment'
import type { JsonValue } from '../types/learning'

export const PYTHON_JUDGE_CAPS = {
  maxCases: 64,
  maxArguments: 16,
  maxCodecDepth: 8,
  maxCaseBytes: 65_536,
  maxPlanBytes: 262_144,
  maxTimeoutMs: 5_000,
  maxMemoryMb: 256,
  maxOutputBytes: 65_536,
  maxSourceBytes: 100_000,
  maxResultBytes: 262_144,
} as const

const MAX_IDENTIFIER_LENGTH = 128
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 100_000
const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u
const encoder = new TextEncoder()

export type PythonJudgePlanV1 = Pick<
  PythonCodeAssessmentV1,
  | 'schemaVersion'
  | 'id'
  | 'kind'
  | 'entrypoint'
  | 'codecs'
  | 'cases'
  | 'comparator'
  | 'observation'
  | 'limits'
>

export type PythonJudgeValidationIssue = {
  path: string
  code: string
  message: string
}

export type PythonJudgeValidationResult<T> =
  | { valid: true; value: T; issues: readonly [] }
  | { valid: false; issues: readonly PythonJudgeValidationIssue[] }

type MutableIssueList = PythonJudgeValidationIssue[]
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

function addIssue(
  issues: MutableIssueList,
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message })
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength
}

function jsonByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? null : utf8ByteLength(serialized)
  } catch {
    return null
  }
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: MutableIssueList,
  state: {
    depth: number
    nodes: number
    ancestors: WeakSet<object>
  } = { depth: 0, nodes: 0, ancestors: new WeakSet<object>() },
): value is JsonValue {
  state.nodes += 1
  if (state.nodes > MAX_JSON_NODES) {
    addIssue(issues, path, 'json.size', 'JSON value has too many nodes')
    return false
  }
  if (state.depth > MAX_JSON_DEPTH) {
    addIssue(issues, path, 'json.depth', 'JSON value is nested too deeply')
    return false
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addIssue(issues, path, 'json.number', 'JSON numbers must be finite')
      return false
    }
    return true
  }
  if (typeof value !== 'object') {
    addIssue(issues, path, 'json.type', 'value must be JSON-safe')
    return false
  }
  if (state.ancestors.has(value)) {
    addIssue(issues, path, 'json.cycle', 'JSON values cannot contain cycles')
    return false
  }

  state.ancestors.add(value)
  const childState = { ...state, depth: state.depth + 1 }
  let valid = true
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (!validateJsonValue(item, `${path}[${index}]`, issues, childState)) {
        valid = false
      }
    })
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (
        !validateJsonValue(
          item,
          `${path}.${key}`,
          issues,
          childState,
        )
      ) {
        valid = false
      }
    }
  }
  state.nodes = childState.nodes
  state.ancestors.delete(value)
  return valid
}

function validPythonIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    PYTHON_IDENTIFIER.test(value)
  )
}

function validateEntrypoint(
  value: unknown,
  path: string,
  issues: MutableIssueList,
): value is PythonEntrypointV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    addIssue(issues, path, 'entrypoint.type', 'entrypoint must be an object')
    return false
  }
  if (value.kind === 'function') {
    if (!hasOnlyKeys(value, ['kind', 'name'])) {
      addIssue(
        issues,
        path,
        'entrypoint.shape',
        'function entrypoint has an invalid shape',
      )
      return false
    }
    if (!validPythonIdentifier(value.name)) {
      addIssue(
        issues,
        `${path}.name`,
        'entrypoint.identifier',
        'function name must be a Python identifier',
      )
      return false
    }
    return true
  }
  if (value.kind === 'classMethod') {
    if (
      !hasOnlyKeys(
        value,
        ['kind', 'className', 'methodName'],
        ['constructorArguments'],
      )
    ) {
      addIssue(
        issues,
        path,
        'entrypoint.shape',
        'class method entrypoint has an invalid shape',
      )
      return false
    }
    let valid = true
    if (!validPythonIdentifier(value.className)) {
      addIssue(
        issues,
        `${path}.className`,
        'entrypoint.identifier',
        'class name must be a Python identifier',
      )
      valid = false
    }
    if (!validPythonIdentifier(value.methodName)) {
      addIssue(
        issues,
        `${path}.methodName`,
        'entrypoint.identifier',
        'method name must be a Python identifier',
      )
      valid = false
    }
    if (value.constructorArguments !== undefined) {
      if (
        !Array.isArray(value.constructorArguments) ||
        value.constructorArguments.length > PYTHON_JUDGE_CAPS.maxArguments
      ) {
        addIssue(
          issues,
          `${path}.constructorArguments`,
          'entrypoint.arguments',
          'constructor arguments exceed the argument cap',
        )
        valid = false
      } else {
        value.constructorArguments.forEach((argument, index) => {
          if (
            !validateJsonValue(
              argument,
              `${path}.constructorArguments[${index}]`,
              issues,
            )
          ) {
            valid = false
          }
        })
      }
    }
    return valid
  }
  addIssue(issues, `${path}.kind`, 'entrypoint.kind', 'unknown entrypoint kind')
  return false
}

function validateCodec(
  value: unknown,
  path: string,
  depth: number,
  issues: MutableIssueList,
): value is PythonValueCodecV1 {
  if (depth > PYTHON_JUDGE_CAPS.maxCodecDepth) {
    addIssue(issues, path, 'codec.depth', 'codec nesting exceeds the depth cap')
    return false
  }
  if (!isRecord(value) || typeof value.kind !== 'string') {
    addIssue(issues, path, 'codec.type', 'codec must be an object')
    return false
  }

  switch (value.kind) {
    case 'json':
    case 'integer':
    case 'float':
    case 'string':
    case 'boolean':
      if (!hasOnlyKeys(value, ['kind'])) {
        addIssue(issues, path, 'codec.shape', 'scalar codec has extra fields')
        return false
      }
      return true
    case 'list':
    case 'linkedList':
    case 'binaryTree':
      if (!hasOnlyKeys(value, ['kind', 'item'])) {
        addIssue(issues, path, 'codec.shape', 'container codec has invalid fields')
        return false
      }
      return validateCodec(value.item, `${path}.item`, depth + 1, issues)
    case 'tuple': {
      if (!hasOnlyKeys(value, ['kind', 'items']) || !Array.isArray(value.items)) {
        addIssue(issues, path, 'codec.shape', 'tuple codec must contain items')
        return false
      }
      if (value.items.length > PYTHON_JUDGE_CAPS.maxArguments) {
        addIssue(issues, path, 'codec.size', 'tuple codec has too many items')
        return false
      }
      let valid = true
      value.items.forEach((item, index) => {
        if (!validateCodec(item, `${path}.items[${index}]`, depth + 1, issues)) {
          valid = false
        }
      })
      return valid
    }
    case 'graph': {
      if (
        !hasOnlyKeys(value, ['kind', 'directed', 'item']) ||
        typeof value.directed !== 'boolean'
      ) {
        addIssue(
          issues,
          path,
          'codec.shape',
          'graph codec requires directed and item fields',
        )
        return false
      }
      return validateCodec(value.item, `${path}.item`, depth + 1, issues)
    }
    default:
      addIssue(issues, `${path}.kind`, 'codec.kind', 'unknown codec kind')
      return false
  }
}

function validateGraphValue(
  codec: Extract<PythonValueCodecV1, { kind: 'graph' }>,
  value: unknown,
  path: string,
  issues: MutableIssueList,
): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['values', 'edges'], ['root']) ||
    !Array.isArray(value.values) ||
    !Array.isArray(value.edges)
  ) {
    addIssue(
      issues,
      path,
      'value.graph',
      'graph values use { values, edges, root? }',
    )
    return false
  }
  const values = value.values
  const edges = value.edges
  let valid = true
  values.forEach((item, index) => {
    if (
      !validateValueForCodec(
        codec.item,
        item,
        `${path}.values[${index}]`,
        issues,
      )
    ) {
      valid = false
    }
  })
  if (edges.length > PYTHON_JUDGE_CAPS.maxPlanBytes / 4) {
    addIssue(issues, `${path}.edges`, 'value.graphSize', 'graph has too many edges')
    valid = false
  }
  edges.forEach((edge, index) => {
    if (
      !Array.isArray(edge) ||
      edge.length !== 2 ||
      !edge.every(
        (nodeIndex) =>
          Number.isSafeInteger(nodeIndex) &&
          Number(nodeIndex) >= 0 &&
          Number(nodeIndex) < values.length,
      )
    ) {
      addIssue(
        issues,
        `${path}.edges[${index}]`,
        'value.graphEdge',
        'graph edges must contain two valid node indices',
      )
      valid = false
    }
  })
  const root = value.root
  if (
    root !== undefined &&
    root !== null &&
    (!Number.isSafeInteger(root) ||
      Number(root) < 0 ||
      Number(root) >= values.length)
  ) {
    addIssue(
      issues,
      `${path}.root`,
      'value.graphRoot',
      'graph root must be null or a valid node index',
    )
    valid = false
  }
  return valid
}

function validateValueForCodec(
  codec: PythonValueCodecV1,
  value: unknown,
  path: string,
  issues: MutableIssueList,
): value is JsonValue {
  switch (codec.kind) {
    case 'json':
      return validateJsonValue(value, path, issues)
    case 'integer':
      if (!Number.isSafeInteger(value)) {
        addIssue(issues, path, 'value.integer', 'value must be a safe integer')
        return false
      }
      return true
    case 'float':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        addIssue(issues, path, 'value.float', 'value must be a finite number')
        return false
      }
      return true
    case 'string':
      if (typeof value !== 'string') {
        addIssue(issues, path, 'value.string', 'value must be a string')
        return false
      }
      return true
    case 'boolean':
      if (typeof value !== 'boolean') {
        addIssue(issues, path, 'value.boolean', 'value must be a boolean')
        return false
      }
      return true
    case 'list':
    case 'linkedList': {
      if (!Array.isArray(value)) {
        addIssue(issues, path, `value.${codec.kind}`, 'value must be an array')
        return false
      }
      let valid = true
      value.forEach((item, index) => {
        if (!validateValueForCodec(codec.item, item, `${path}[${index}]`, issues)) {
          valid = false
        }
      })
      return valid
    }
    case 'tuple': {
      if (!Array.isArray(value) || value.length !== codec.items.length) {
        addIssue(
          issues,
          path,
          'value.tuple',
          'tuple value must match the codec length',
        )
        return false
      }
      let valid = true
      codec.items.forEach((itemCodec, index) => {
        if (
          !validateValueForCodec(
            itemCodec,
            value[index],
            `${path}[${index}]`,
            issues,
          )
        ) {
          valid = false
        }
      })
      return valid
    }
    case 'binaryTree': {
      if (!Array.isArray(value)) {
        addIssue(
          issues,
          path,
          'value.binaryTree',
          'binary tree value must be a level-order array',
        )
        return false
      }
      let valid = true
      value.forEach((item, index) => {
        if (
          item !== null &&
          !validateValueForCodec(codec.item, item, `${path}[${index}]`, issues)
        ) {
          valid = false
        }
      })
      return valid
    }
    case 'graph':
      return validateGraphValue(codec, value, path, issues)
  }
}

function validateComparator(
  value: unknown,
  path: string,
  issues: MutableIssueList,
): value is PythonComparatorV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    addIssue(issues, path, 'comparator.type', 'comparator must be an object')
    return false
  }
  if (value.kind === 'deepEqual') {
    if (!hasOnlyKeys(value, ['kind'])) {
      addIssue(issues, path, 'comparator.shape', 'comparator has extra fields')
      return false
    }
    return true
  }
  if (value.kind === 'unordered') {
    if (
      !hasOnlyKeys(value, ['kind'], ['recursive']) ||
      (value.recursive !== undefined && typeof value.recursive !== 'boolean')
    ) {
      addIssue(issues, path, 'comparator.shape', 'unordered comparator is invalid')
      return false
    }
    return true
  }
  if (value.kind === 'numericTolerance') {
    if (
      !hasOnlyKeys(
        value,
        ['kind', 'absoluteTolerance'],
        ['relativeTolerance'],
      ) ||
      typeof value.absoluteTolerance !== 'number' ||
      !Number.isFinite(value.absoluteTolerance) ||
      value.absoluteTolerance < 0 ||
      (value.relativeTolerance !== undefined &&
        (typeof value.relativeTolerance !== 'number' ||
          !Number.isFinite(value.relativeTolerance) ||
          value.relativeTolerance < 0))
    ) {
      addIssue(
        issues,
        path,
        'comparator.tolerance',
        'numeric tolerances must be finite and non-negative',
      )
      return false
    }
    return true
  }
  if (value.kind === 'semantic') {
    if (
      !hasOnlyKeys(value, ['kind', 'validator']) ||
      ![
        'courseScheduleOrder',
        'alienDictionaryOrder',
        'kClosestPoints',
      ].includes(String(value.validator))
    ) {
      addIssue(issues, path, 'comparator.semantic', 'unknown semantic validator')
      return false
    }
    return true
  }
  addIssue(issues, `${path}.kind`, 'comparator.kind', 'unknown comparator kind')
  return false
}

function validateObservation(
  value: unknown,
  argumentCodecs: readonly PythonValueCodecV1[] | undefined,
  path: string,
  issues: MutableIssueList,
): value is PythonObservationV1 {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    addIssue(issues, path, 'observation.type', 'observation must be an object')
    return false
  }
  if (value.kind === 'return') {
    if (!hasOnlyKeys(value, ['kind'])) {
      addIssue(issues, path, 'observation.shape', 'return observation has extra fields')
      return false
    }
    return true
  }
  if (
    value.kind !== 'argument' ||
    !hasOnlyKeys(value, ['kind', 'argumentIndex', 'codec'], ['path']) ||
    !Number.isSafeInteger(value.argumentIndex) ||
    Number(value.argumentIndex) < 0 ||
    (argumentCodecs !== undefined &&
      Number(value.argumentIndex) >= argumentCodecs.length)
  ) {
    addIssue(
      issues,
      path,
      'observation.shape',
      'argument observation requires a valid argumentIndex and codec',
    )
    return false
  }
  if (
    value.path !== undefined &&
    (!Array.isArray(value.path) ||
      value.path.some(
        (segment) =>
          typeof segment !== 'string' &&
          (!Number.isSafeInteger(segment) || Number(segment) < 0),
      ))
  ) {
    addIssue(
      issues,
      `${path}.path`,
      'observation.path',
      'observation path segments must be strings or non-negative integers',
    )
  }
  return validateCodec(value.codec, `${path}.codec`, 0, issues)
}

function safePositiveIntegerWithin(value: unknown, maximum: number): boolean {
  return (
    Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum
  )
}

export function validatePythonJudgePlan(
  value: unknown,
): PythonJudgeValidationResult<PythonJudgePlanV1> {
  const issues: MutableIssueList = []
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'schemaVersion',
        'id',
        'kind',
        'entrypoint',
        'codecs',
        'cases',
        'comparator',
        'limits',
      ],
      ['observation'],
    )
  ) {
    return {
      valid: false,
      issues: [
        {
          path: 'plan',
          code: 'plan.shape',
          message: 'judge plan has an invalid shape',
        },
      ],
    }
  }

  if (value.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) {
    addIssue(
      issues,
      'plan.schemaVersion',
      'plan.version',
      `schemaVersion must be ${ASSESSMENT_SCHEMA_VERSION}`,
    )
  }
  if (value.kind !== 'pythonCode') {
    addIssue(issues, 'plan.kind', 'plan.kind', 'plan kind must be pythonCode')
  }
  if (typeof value.id !== 'string' || !/^assessment:.+/u.test(value.id)) {
    addIssue(
      issues,
      'plan.id',
      'plan.id',
      'assessment id must use the assessment:* namespace',
    )
  }
  validateEntrypoint(value.entrypoint, 'plan.entrypoint', issues)

  let argumentCodecs: readonly PythonValueCodecV1[] | undefined
  let resultCodec: PythonValueCodecV1 | undefined
  if (
    !isRecord(value.codecs) ||
    !hasOnlyKeys(value.codecs, ['arguments', 'result']) ||
    !Array.isArray(value.codecs.arguments)
  ) {
    addIssue(
      issues,
      'plan.codecs',
      'codecs.shape',
      'codec plan requires arguments and result',
    )
  } else {
    if (value.codecs.arguments.length > PYTHON_JUDGE_CAPS.maxArguments) {
      addIssue(
        issues,
        'plan.codecs.arguments',
        'codecs.arguments',
        'codec plan exceeds the argument cap',
      )
    }
    let allArgumentsValid = true
    value.codecs.arguments.forEach((codec, index) => {
      if (
        !validateCodec(
          codec,
          `plan.codecs.arguments[${index}]`,
          0,
          issues,
        )
      ) {
        allArgumentsValid = false
      }
    })
    if (allArgumentsValid) {
      argumentCodecs = value.codecs
        .arguments as readonly PythonValueCodecV1[]
    }
    if (validateCodec(value.codecs.result, 'plan.codecs.result', 0, issues)) {
      resultCodec = value.codecs.result
    }
  }

  let observedCodec = resultCodec
  if (
    value.observation !== undefined &&
    validateObservation(
      value.observation,
      argumentCodecs,
      'plan.observation',
      issues,
    ) &&
    value.observation.kind === 'argument'
  ) {
    observedCodec = value.observation.codec
  }

  if (
    !Array.isArray(value.cases) ||
    value.cases.length === 0 ||
    value.cases.length > PYTHON_JUDGE_CAPS.maxCases
  ) {
    addIssue(
      issues,
      'plan.cases',
      'cases.count',
      'judge plans require one or more cases within the case cap',
    )
  } else {
    const caseIds = new Set<string>()
    value.cases.forEach((testCase, index) => {
      const casePath = `plan.cases[${index}]`
      if (
        !isRecord(testCase) ||
        !hasOnlyKeys(testCase, [
          'id',
          'arguments',
          'expected',
          'visibility',
        ])
      ) {
        addIssue(issues, casePath, 'case.shape', 'case has an invalid shape')
        return
      }
      if (
        typeof testCase.id !== 'string' ||
        !/^case:.+/u.test(testCase.id) ||
        caseIds.has(testCase.id)
      ) {
        addIssue(
          issues,
          `${casePath}.id`,
          'case.id',
          'case id must be unique and use the case:* namespace',
        )
      } else {
        caseIds.add(testCase.id)
      }
      if (
        testCase.visibility !== 'example' &&
        testCase.visibility !== 'hidden'
      ) {
        addIssue(
          issues,
          `${casePath}.visibility`,
          'case.visibility',
          'case visibility must be example or hidden',
        )
      }
      if (!Array.isArray(testCase.arguments)) {
        addIssue(
          issues,
          `${casePath}.arguments`,
          'case.arguments',
          'case arguments must be an array',
        )
      } else if (argumentCodecs) {
        const caseArguments = testCase.arguments
        if (caseArguments.length !== argumentCodecs.length) {
          addIssue(
            issues,
            `${casePath}.arguments`,
            'case.arguments',
            'case arguments must match the codec plan',
          )
        } else {
          argumentCodecs.forEach((codec, argumentIndex) => {
            validateValueForCodec(
              codec,
              caseArguments[argumentIndex],
              `${casePath}.arguments[${argumentIndex}]`,
              issues,
            )
          })
        }
      }
      if (observedCodec) {
        validateValueForCodec(
          observedCodec,
          testCase.expected,
          `${casePath}.expected`,
          issues,
        )
      } else {
        validateJsonValue(testCase.expected, `${casePath}.expected`, issues)
      }
      const caseBytes = jsonByteLength(testCase)
      if (
        caseBytes === null ||
        caseBytes > PYTHON_JUDGE_CAPS.maxCaseBytes
      ) {
        addIssue(
          issues,
          casePath,
          'case.size',
          'case exceeds the serialized byte cap',
        )
      }
    })
  }

  validateComparator(value.comparator, 'plan.comparator', issues)

  if (
    !isRecord(value.limits) ||
    !hasOnlyKeys(value.limits, [
      'timeoutMs',
      'memoryMb',
      'maxOutputBytes',
      'maxSourceBytes',
    ])
  ) {
    addIssue(
      issues,
      'plan.limits',
      'limits.shape',
      'execution limits have an invalid shape',
    )
  } else if (
    !safePositiveIntegerWithin(
      value.limits.timeoutMs,
      PYTHON_JUDGE_CAPS.maxTimeoutMs,
    ) ||
    !safePositiveIntegerWithin(
      value.limits.memoryMb,
      PYTHON_JUDGE_CAPS.maxMemoryMb,
    ) ||
    !safePositiveIntegerWithin(
      value.limits.maxOutputBytes,
      PYTHON_JUDGE_CAPS.maxOutputBytes,
    ) ||
    !safePositiveIntegerWithin(
      value.limits.maxSourceBytes,
      PYTHON_JUDGE_CAPS.maxSourceBytes,
    )
  ) {
    addIssue(
      issues,
      'plan.limits',
      'limits.range',
      'execution limits must be positive integers within platform caps',
    )
  }

  const planBytes = jsonByteLength(value)
  if (planBytes === null || planBytes > PYTHON_JUDGE_CAPS.maxPlanBytes) {
    addIssue(
      issues,
      'plan',
      'plan.size',
      'judge plan exceeds the serialized byte cap',
    )
  }

  if (issues.length > 0) return { valid: false, issues }
  return {
    valid: true,
    value: value as PythonJudgePlanV1,
    issues: [],
  }
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    )
  }
  return value
}

function cloneCodec(codec: PythonValueCodecV1): PythonValueCodecV1 {
  switch (codec.kind) {
    case 'list':
    case 'linkedList':
    case 'binaryTree':
      return { kind: codec.kind, item: cloneCodec(codec.item) }
    case 'tuple':
      return { kind: 'tuple', items: codec.items.map(cloneCodec) }
    case 'graph':
      return {
        kind: 'graph',
        directed: codec.directed,
        item: cloneCodec(codec.item),
      }
    case 'json':
    case 'integer':
    case 'float':
    case 'string':
    case 'boolean':
      return { kind: codec.kind }
  }
}

function cloneEntrypoint(entrypoint: PythonEntrypointV1): PythonEntrypointV1 {
  if (entrypoint.kind === 'function') {
    return { kind: 'function', name: entrypoint.name }
  }
  return {
    kind: 'classMethod',
    className: entrypoint.className,
    methodName: entrypoint.methodName,
    ...(entrypoint.constructorArguments
      ? {
          constructorArguments:
            entrypoint.constructorArguments.map(cloneJsonValue),
        }
      : {}),
  }
}

function cloneObservation(
  observation: PythonObservationV1 | undefined,
): PythonObservationV1 | undefined {
  if (!observation || observation.kind === 'return') {
    return observation ? { kind: 'return' } : undefined
  }
  return {
    kind: 'argument',
    argumentIndex: observation.argumentIndex,
    ...(observation.path ? { path: [...observation.path] } : {}),
    codec: cloneCodec(observation.codec),
  }
}

function cloneComparator(comparator: PythonComparatorV1): PythonComparatorV1 {
  switch (comparator.kind) {
    case 'deepEqual':
      return { kind: 'deepEqual' }
    case 'unordered':
      return {
        kind: 'unordered',
        ...(comparator.recursive === undefined
          ? {}
          : { recursive: comparator.recursive }),
      }
    case 'numericTolerance':
      return {
        kind: 'numericTolerance',
        absoluteTolerance: comparator.absoluteTolerance,
        ...(comparator.relativeTolerance === undefined
          ? {}
          : { relativeTolerance: comparator.relativeTolerance }),
      }
    case 'semantic':
      return { kind: 'semantic', validator: comparator.validator }
  }
}

/**
 * Projects content to the minimum worker payload. Prompt, hints, progress,
 * authentication, and other app state never cross the worker boundary.
 */
export function createPythonJudgePlan(
  assessment: PythonCodeAssessmentV1,
): PythonJudgePlanV1 {
  return {
    schemaVersion: assessment.schemaVersion,
    id: assessment.id,
    kind: 'pythonCode',
    entrypoint: cloneEntrypoint(assessment.entrypoint),
    codecs: {
      arguments: assessment.codecs.arguments.map(cloneCodec),
      result: cloneCodec(assessment.codecs.result),
    },
    cases: assessment.cases.map((testCase) => ({
      id: testCase.id,
      arguments: testCase.arguments.map(cloneJsonValue),
      expected: cloneJsonValue(testCase.expected),
      visibility: testCase.visibility,
    })),
    comparator: cloneComparator(assessment.comparator),
    ...(assessment.observation === undefined
      ? {}
      : { observation: cloneObservation(assessment.observation) }),
    limits: {
      timeoutMs: assessment.limits.timeoutMs,
      memoryMb: assessment.limits.memoryMb,
      maxOutputBytes: assessment.limits.maxOutputBytes,
      maxSourceBytes: assessment.limits.maxSourceBytes,
    },
  }
}

export function validatePythonJudgeSubmission(
  assessment: PythonCodeAssessmentV1,
  response: PythonCodeResponseV1,
): PythonJudgeValidationResult<{
  plan: PythonJudgePlanV1
  response: PythonCodeResponseV1
}> {
  const plan = createPythonJudgePlan(assessment)
  const planValidation = validatePythonJudgePlan(plan)
  if (!planValidation.valid) return planValidation

  const issues: MutableIssueList = []
  if (
    response.kind !== 'pythonCode' ||
    typeof response.code !== 'string'
  ) {
    addIssue(
      issues,
      'response',
      'response.shape',
      'response must contain Python source code',
    )
  } else if (
    utf8ByteLength(response.code) > plan.limits.maxSourceBytes ||
    utf8ByteLength(response.code) > PYTHON_JUDGE_CAPS.maxSourceBytes
  ) {
    addIssue(
      issues,
      'response.code',
      'response.sourceSize',
      'source exceeds the configured byte limit',
    )
  }
  if (issues.length > 0) return { valid: false, issues }
  return {
    valid: true,
    value: {
      plan,
      response: { kind: 'pythonCode', code: response.code },
    },
    issues: [],
  }
}

function deepEqual(actual: JsonValue, expected: JsonValue): boolean {
  if (actual === expected) return true
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false
    return (
      actual.length === expected.length &&
      actual.every((item, index) => deepEqual(item, expected[index]))
    )
  }
  if (
    actual === null ||
    expected === null ||
    typeof actual !== 'object' ||
    typeof expected !== 'object'
  ) {
    return false
  }
  const actualObject = actual as Readonly<Record<string, JsonValue>>
  const expectedObject = expected as Readonly<Record<string, JsonValue>>
  const actualKeys = Object.keys(actualObject).sort()
  const expectedKeys = Object.keys(expectedObject).sort()
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] &&
        deepEqual(actualObject[key], expectedObject[key]),
    )
  )
}

function unorderedEqual(
  actual: JsonValue,
  expected: JsonValue,
  recursive = true,
): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false
    if (actual.length !== expected.length) return false
    const matched = new Array<boolean>(expected.length).fill(false)
    return actual.every((actualItem) => {
      const matchIndex = expected.findIndex(
        (expectedItem, index) =>
          !matched[index] &&
          (recursive
            ? unorderedEqual(actualItem, expectedItem, true)
            : deepEqual(actualItem, expectedItem)),
      )
      if (matchIndex < 0) return false
      matched[matchIndex] = true
      return true
    })
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    const actualObject = actual as Readonly<Record<string, JsonValue>>
    const expectedObject = expected as Readonly<Record<string, JsonValue>>
    const actualKeys = Object.keys(actualObject).sort()
    const expectedKeys = Object.keys(expectedObject).sort()
    return (
      actualKeys.length === expectedKeys.length &&
      actualKeys.every(
        (key, index) =>
          key === expectedKeys[index] &&
          (recursive
            ? unorderedEqual(
                actualObject[key],
                expectedObject[key],
                true,
              )
            : deepEqual(actualObject[key], expectedObject[key])),
      )
    )
  }
  return actual === expected
}

function jsonRecord(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | null {
  return value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : null
}

function courseScheduleOrderValid(
  actual: JsonValue,
  argument: JsonValue | undefined,
): boolean {
  const data = jsonRecord(argument)
  if (!data || !Array.isArray(actual)) return false
  const count = data.stationCount
  const requirements = data.requirements
  if (
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Array.isArray(requirements)
  ) {
    return false
  }
  if (actual.length === 0) {
    if (count === 0) return true
    const indegree = Array<number>(count).fill(0)
    const graph = Array.from({ length: count }, () => [] as number[])
    for (const raw of requirements) {
      if (
        !Array.isArray(raw) ||
        raw.length !== 2 ||
        !raw.every((value) => Number.isSafeInteger(value))
      ) {
        return false
      }
      const [station, prerequisite] = raw as readonly number[]
      if (
        station < 0 ||
        station >= count ||
        prerequisite < 0 ||
        prerequisite >= count
      ) {
        return false
      }
      graph[prerequisite].push(station)
      indegree[station] += 1
    }
    const queue = indegree
      .map((degree, index) => (degree === 0 ? index : -1))
      .filter((index) => index >= 0)
    let visited = 0
    for (let front = 0; front < queue.length; front += 1) {
      visited += 1
      for (const next of graph[queue[front]]) {
        indegree[next] -= 1
        if (indegree[next] === 0) queue.push(next)
      }
    }
    return visited !== count
  }
  if (
    actual.length !== count ||
    actual.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value >= count,
    ) ||
    new Set(actual).size !== count
  ) {
    return false
  }
  const position = new Map(actual.map((value, index) => [value, index]))
  return requirements.every(
    (raw) =>
      Array.isArray(raw) &&
      raw.length === 2 &&
      typeof raw[0] === 'number' &&
      typeof raw[1] === 'number' &&
      (position.get(raw[1]) ?? Number.POSITIVE_INFINITY) <
        (position.get(raw[0]) ?? Number.NEGATIVE_INFINITY),
  )
}

function alienDictionaryOrderValid(
  actual: JsonValue,
  argument: JsonValue | undefined,
): boolean {
  const data = jsonRecord(argument)
  const words = data?.scrolls
  if (
    typeof actual !== 'string' ||
    !Array.isArray(words) ||
    words.some((word) => typeof word !== 'string')
  ) {
    return false
  }
  const typedWords = words as readonly string[]
  const characters = [...new Set(typedWords.flatMap((word) => [...word]))]
  const edges = new Map(characters.map((character) => [character, new Set<string>()]))
  const indegree = new Map(characters.map((character) => [character, 0]))
  let invalidPrefix = false
  for (let index = 0; index + 1 < typedWords.length; index += 1) {
    const first = typedWords[index]
    const second = typedWords[index + 1]
    const shared = Math.min(first.length, second.length)
    let difference = -1
    for (let offset = 0; offset < shared; offset += 1) {
      if (first[offset] !== second[offset]) {
        difference = offset
        break
      }
    }
    if (difference < 0) {
      if (first.length > second.length) invalidPrefix = true
      continue
    }
    const before = first[difference]
    const after = second[difference]
    if (!edges.get(before)!.has(after)) {
      edges.get(before)!.add(after)
      indegree.set(after, indegree.get(after)! + 1)
    }
  }
  const queue = characters.filter((character) => indegree.get(character) === 0)
  let visited = 0
  for (let front = 0; front < queue.length; front += 1) {
    visited += 1
    for (const next of edges.get(queue[front])!) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }
  if (invalidPrefix || visited !== characters.length) return actual === ''
  const order = [...actual]
  if (
    order.length !== characters.length ||
    new Set(order).size !== order.length ||
    order.some((character) => !edges.has(character))
  ) {
    return false
  }
  const position = new Map(order.map((character, index) => [character, index]))
  return [...edges].every(([before, afterSet]) =>
    [...afterSet].every(
      (after) => position.get(before)! < position.get(after)!,
    ),
  )
}

function kClosestPointsValid(
  actual: JsonValue,
  argument: JsonValue | undefined,
): boolean {
  const data = jsonRecord(argument)
  const points = data?.points
  const k = data?.k
  if (
    !Array.isArray(actual) ||
    !Array.isArray(points) ||
    typeof k !== 'number' ||
    !Number.isSafeInteger(k) ||
    k < 0 ||
    k > points.length ||
    actual.length !== k
  ) {
    return false
  }
  const pointKey = (value: JsonValue): string | null =>
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === 'number')
      ? `${value[0]},${value[1]}`
      : null
  const available = new Map<string, number>()
  const expectedDistances: number[] = []
  for (const point of points) {
    const key = pointKey(point)
    if (!key || !Array.isArray(point)) return false
    available.set(key, (available.get(key) ?? 0) + 1)
    expectedDistances.push(
      (point[0] as number) ** 2 + (point[1] as number) ** 2,
    )
  }
  const actualDistances: number[] = []
  for (const point of actual) {
    const key = pointKey(point)
    if (!key || !Array.isArray(point) || (available.get(key) ?? 0) === 0) {
      return false
    }
    available.set(key, available.get(key)! - 1)
    actualDistances.push(
      (point[0] as number) ** 2 + (point[1] as number) ** 2,
    )
  }
  return deepEqual(
    actualDistances.sort((left, right) => left - right),
    expectedDistances.sort((left, right) => left - right).slice(0, k),
  )
}

function numericToleranceEqual(
  actual: JsonValue,
  expected: JsonValue,
  absoluteTolerance: number,
  relativeTolerance: number,
): boolean {
  if (typeof actual === 'number' || typeof expected === 'number') {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false
    const difference = Math.abs(actual - expected)
    return (
      difference <= absoluteTolerance ||
      difference <=
        relativeTolerance * Math.max(Math.abs(actual), Math.abs(expected))
    )
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false
    return (
      actual.length === expected.length &&
      actual.every((item, index) =>
        numericToleranceEqual(
          item,
          expected[index],
          absoluteTolerance,
          relativeTolerance,
        ),
      )
    )
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    const actualObject = actual as Readonly<Record<string, JsonValue>>
    const expectedObject = expected as Readonly<Record<string, JsonValue>>
    const actualKeys = Object.keys(actualObject).sort()
    const expectedKeys = Object.keys(expectedObject).sort()
    return (
      actualKeys.length === expectedKeys.length &&
      actualKeys.every(
        (key, index) =>
          key === expectedKeys[index] &&
          numericToleranceEqual(
            actualObject[key],
            expectedObject[key],
            absoluteTolerance,
            relativeTolerance,
          ),
      )
    )
  }
  return actual === expected
}

export function comparePythonJson(
  actual: JsonValue,
  expected: JsonValue,
  comparator: PythonComparatorV1,
  arguments_: readonly JsonValue[] = [],
): boolean {
  switch (comparator.kind) {
    case 'deepEqual':
      return deepEqual(actual, expected)
    case 'unordered':
      return unorderedEqual(actual, expected, comparator.recursive !== false)
    case 'numericTolerance':
      return numericToleranceEqual(
        actual,
        expected,
        comparator.absoluteTolerance,
        comparator.relativeTolerance ?? 0,
      )
    case 'semantic':
      if (comparator.validator === 'courseScheduleOrder') {
        return courseScheduleOrderValid(actual, arguments_[0])
      }
      if (comparator.validator === 'alienDictionaryOrder') {
        return alienDictionaryOrderValid(actual, arguments_[0])
      }
      return kClosestPointsValid(actual, arguments_[0])
  }
}
