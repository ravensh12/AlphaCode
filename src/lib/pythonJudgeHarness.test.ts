import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../types/assessment'
import {
  PYTHON_JUDGE_CAPS,
  comparePythonJson,
  createPythonJudgePlan,
  validatePythonJudgePlan,
  validatePythonJudgeSubmission,
} from './pythonJudgeHarness'

function assessment(
  overrides: Partial<PythonCodeAssessmentV1> = {},
): PythonCodeAssessmentV1 {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    id: 'assessment:python-judge',
    kind: 'pythonCode',
    prompt: 'Return whether the list has a duplicate.',
    evidenceKind: 'code-tests',
    starterCode: 'def contains_duplicate(nums):\n    return False',
    entrypoint: { kind: 'function', name: 'contains_duplicate' },
    codecs: {
      arguments: [{ kind: 'list', item: { kind: 'integer' } }],
      result: { kind: 'boolean' },
    },
    cases: [
      {
        id: 'case:example',
        arguments: [[1, 2, 1]],
        expected: true,
        visibility: 'example',
      },
      {
        id: 'case:hidden',
        arguments: [[1, 2, 3]],
        expected: false,
        visibility: 'hidden',
      },
    ],
    comparator: { kind: 'deepEqual' },
    limits: {
      timeoutMs: 1_000,
      memoryMb: 64,
      maxOutputBytes: 4_096,
      maxSourceBytes: 20_000,
    },
    ...overrides,
  }
}

describe('Python judge harness validation', () => {
  it('projects only execution content into the worker plan', () => {
    const sourceAssessment = Object.assign(assessment(), {
      authToken: 'must-not-cross-worker-boundary',
      progress: { mastery: 1 },
    })

    expect(createPythonJudgePlan(sourceAssessment)).toEqual({
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: 'assessment:python-judge',
      kind: 'pythonCode',
      entrypoint: { kind: 'function', name: 'contains_duplicate' },
      codecs: {
        arguments: [{ kind: 'list', item: { kind: 'integer' } }],
        result: { kind: 'boolean' },
      },
      cases: sourceAssessment.cases,
      comparator: { kind: 'deepEqual' },
      limits: sourceAssessment.limits,
    })
  })

  it('accepts a valid structured plan and submission', () => {
    const sourceAssessment = assessment()
    expect(validatePythonJudgePlan(createPythonJudgePlan(sourceAssessment))).toMatchObject(
      { valid: true },
    )
    expect(
      validatePythonJudgeSubmission(sourceAssessment, {
        kind: 'pythonCode',
        code: 'def contains_duplicate(nums):\n    return len(nums) != len(set(nums))',
      }),
    ).toMatchObject({ valid: true })
  })

  it('projects and validates post-call argument observations', () => {
    const matrixCodec = {
      kind: 'list' as const,
      item: {
        kind: 'list' as const,
        item: { kind: 'integer' as const },
      },
    }
    const sourceAssessment = assessment({
      codecs: {
        arguments: [{ kind: 'json' }],
        result: { kind: 'json' },
      },
      cases: [
        {
          id: 'case:matrix',
          arguments: [{ matrix: [[1, 2], [3, 4]] }],
          expected: [[3, 1], [4, 2]],
          visibility: 'example',
        },
      ],
      observation: {
        kind: 'argument',
        argumentIndex: 0,
        path: ['matrix'],
        codec: matrixCodec,
      },
    })
    const plan = createPythonJudgePlan(sourceAssessment)

    expect(plan.observation).toEqual(sourceAssessment.observation)
    expect(validatePythonJudgePlan(plan)).toMatchObject({ valid: true })
  })

  it('enforces case, source, and execution caps', () => {
    const tooManyCases = assessment({
      cases: Array.from(
        { length: PYTHON_JUDGE_CAPS.maxCases + 1 },
        (_, index) => ({
          id: `case:${index}` as const,
          arguments: [[index]],
          expected: false,
          visibility: 'hidden' as const,
        }),
      ),
    })
    expect(
      validatePythonJudgePlan(createPythonJudgePlan(tooManyCases)),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'cases.count' }),
      ]),
    })

    const excessiveLimits = createPythonJudgePlan(assessment())
    expect(
      validatePythonJudgePlan({
        ...excessiveLimits,
        limits: {
          ...excessiveLimits.limits,
          timeoutMs: PYTHON_JUDGE_CAPS.maxTimeoutMs + 1,
        },
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'limits.range' }),
      ]),
    })

    const tinySourceLimit = assessment({
      limits: {
        timeoutMs: 1_000,
        memoryMb: 64,
        maxOutputBytes: 1_024,
        maxSourceBytes: 4,
      },
    })
    expect(
      validatePythonJudgeSubmission(tinySourceLimit, {
        kind: 'pythonCode',
        code: 'def answer():\n    return 1',
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'response.sourceSize' }),
      ]),
    })
  })

  it('validates values against nested codecs and graph structure', () => {
    const plan = createPythonJudgePlan(
      assessment({
        codecs: {
          arguments: [
            { kind: 'tuple', items: [{ kind: 'integer' }, { kind: 'string' }] },
          ],
          result: {
            kind: 'graph',
            directed: false,
            item: { kind: 'integer' },
          },
        },
        cases: [
          {
            id: 'case:graph',
            arguments: [[1, 'root']],
            expected: {
              values: [1, 2],
              edges: [[0, 2]],
              root: 0,
            },
            visibility: 'example',
          },
        ],
      }),
    )

    expect(validatePythonJudgePlan(plan)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'value.graphEdge' }),
      ]),
    })
  })
})

describe('Python judge comparators', () => {
  it('deep-compares JSON objects without depending on key order', () => {
    expect(
      comparePythonJson(
        { nested: [1, { answer: true }], name: 'test' },
        { name: 'test', nested: [1, { answer: true }] },
        { kind: 'deepEqual' },
      ),
    ).toBe(true)
  })

  it('compares unordered nested arrays as duplicate-aware multisets', () => {
    expect(
      comparePythonJson(
        [[2, 1], [3], [2, 1]],
        [[1, 2], [1, 2], [3]],
        { kind: 'unordered' },
      ),
    ).toBe(true)
    expect(
      comparePythonJson([1, 1, 2], [1, 2, 2], { kind: 'unordered' }),
    ).toBe(false)
    expect(
      comparePythonJson(
        [[1, 2]],
        [[2, 1]],
        { kind: 'unordered', recursive: false },
      ),
    ).toBe(false)
  })

  it('accepts any valid topological and nearest-point answer', () => {
    const courseInput = {
      stationCount: 4,
      requirements: [[2, 0], [2, 1], [3, 1]],
    }
    expect(
      comparePythonJson(
        [1, 0, 3, 2],
        [0, 1, 2, 3],
        { kind: 'semantic', validator: 'courseScheduleOrder' },
        [courseInput],
      ),
    ).toBe(true)
    expect(
      comparePythonJson(
        [2, 0, 1, 3],
        [0, 1, 2, 3],
        { kind: 'semantic', validator: 'courseScheduleOrder' },
        [courseInput],
      ),
    ).toBe(false)

    expect(
      comparePythonJson(
        'zacb',
        'abzc',
        { kind: 'semantic', validator: 'alienDictionaryOrder' },
        [{ scrolls: ['za', 'zb', 'ca', 'cb'] }],
      ),
    ).toBe(true)

    expect(
      comparePythonJson(
        [[1, 0], [0, -1], [-1, 0]],
        [[-1, 0], [0, -1], [0, 1]],
        { kind: 'semantic', validator: 'kClosestPoints' },
        [{ points: [[0, 1], [1, 0], [0, -1], [-1, 0], [9, 9]], k: 3 }],
      ),
    ).toBe(true)
  })

  it('applies absolute and relative tolerance recursively', () => {
    expect(
      comparePythonJson(
        { values: [0.3000000001, 1_009] },
        { values: [0.3, 1_000] },
        {
          kind: 'numericTolerance',
          absoluteTolerance: 1e-9,
          relativeTolerance: 0.01,
        },
      ),
    ).toBe(true)
    expect(
      comparePythonJson(1.1, 1, {
        kind: 'numericTolerance',
        absoluteTolerance: 0.01,
      }),
    ).toBe(false)
  })
})
