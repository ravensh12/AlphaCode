import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentId,
  type AssessmentV1,
  type PythonCodeAssessmentV1,
} from '../../types/assessment'
import type { SkillId } from '../../types/curriculum'
import type {
  ProblemLessonAssessmentStepV1,
  ProblemLessonSpecV1,
  ProblemLessonVariantId,
  ProblemLessonVariantV1,
} from '../../types/problemLesson'
import {
  NEETCODE_150_CONTENT_VERSION,
  NEETCODE_150_MANIFEST,
} from './neetcode150'
import {
  ProblemLessonValidationError,
  compileProblemLesson,
  validateProblemLesson,
} from './problemLessonCompiler'

const SKILL_ID: SkillId = 'skill:hash-membership'

const assessmentBase = (id: AssessmentId, prompt: string) =>
  ({
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    id,
    prompt,
    evidenceKind: 'acquisition',
    skillIds: [SKILL_ID],
  }) as const

function makeAssessments(suffix: string): readonly AssessmentV1[] {
  return [
    {
      ...assessmentBase(
        'assessment:choice',
        `Which structure tracks seen values?${suffix}`,
      ),
      kind: 'singleChoice',
      options: [
        { id: 'option:set', label: `A hash set${suffix}` },
        { id: 'option:list', label: `A second list${suffix}` },
        { id: 'option:stack', label: `A stack${suffix}` },
      ],
      correctOptionId: 'option:set',
    },
    {
      ...assessmentBase(
        'assessment:short',
        `What operation detects a duplicate?${suffix}`,
      ),
      kind: 'shortAnswer',
      matcher: {
        mode: 'normalized',
        acceptedAnswers: ['membership lookup', 'set lookup'],
      },
    },
    {
      ...assessmentBase(
        'assessment:predict',
        `What does this code print?${suffix}`,
      ),
      kind: 'predict',
      language: 'python',
      code: ['seen = {1}', 'print(1 in seen)'],
      currentLineIndex: 1,
      matcher: {
        mode: 'normalized',
        acceptedAnswers: ['True'],
      },
    },
    {
      ...assessmentBase(
        'assessment:order',
        `Put the duplicate-check steps in order.${suffix}`,
      ),
      kind: 'order',
      items: [
        { id: 'item:check', label: `Check membership${suffix}` },
        { id: 'item:return', label: `Return true if found${suffix}` },
        { id: 'item:add', label: `Add unseen value${suffix}` },
      ],
      correctOrderIds: ['item:check', 'item:return', 'item:add'],
    },
    {
      ...assessmentBase(
        'assessment:trace',
        `Trace the set as the scan runs.${suffix}`,
      ),
      kind: 'trace',
      language: 'python',
      code: [
        'seen = set()',
        'for value in [1, 2, 1]:',
        '    if value in seen:',
        '        return True',
        '    seen.add(value)',
      ],
      frames: [
        {
          id: 'frame:init',
          currentLineIndex: 0,
          assessment: {
            ...assessmentBase(
              'assessment:trace-init',
              `How many values are in seen?${suffix}`,
            ),
            kind: 'shortAnswer',
            matcher: {
              mode: 'numericTolerance',
              expected: 0,
              absoluteTolerance: 0,
            },
          },
          diagram: { kind: 'hashmap', entries: [] },
        },
        {
          id: 'frame:duplicate',
          currentLineIndex: 2,
          assessment: {
            ...assessmentBase(
              'assessment:trace-duplicate',
              `Is the final 1 already in seen?${suffix}`,
            ),
            kind: 'singleChoice',
            options: [
              { id: 'option:true', label: 'True' },
              { id: 'option:false', label: 'False' },
            ],
            correctOptionId: 'option:true',
          },
          diagram: {
            kind: 'hashmap',
            entries: [
              { key: '1', value: 'seen' },
              { key: '2', value: 'seen' },
            ],
            lookup: '1',
          },
        },
      ],
    },
    {
      ...assessmentBase(
        'assessment:python',
        `Implement contains_duplicate.${suffix}`,
      ),
      kind: 'pythonCode',
      evidenceKind: 'code-tests',
      starterCode: 'def contains_duplicate(nums):\n    pass',
      entrypoint: { kind: 'function', name: 'contains_duplicate' },
      codecs: {
        arguments: [{ kind: 'list', item: { kind: 'integer' } }],
        result: { kind: 'boolean' },
      },
      cases: [
        {
          id: 'case:duplicate',
          arguments: [[1, 2, 1]],
          expected: true,
          visibility: 'example',
        },
        {
          id: 'case:unique',
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
    },
  ]
}

function toAssessmentStep(
  assessment: AssessmentV1,
): ProblemLessonAssessmentStepV1 {
  return {
    id: `step-${assessment.id.slice('assessment:'.length)}`,
    kind: 'assessment',
    prompt: assessment.prompt,
    assessment,
    feedback: {
      correct: 'Correct — the invariant still holds.',
      incorrect: 'Re-check the current state.',
      secondIncorrect: 'Follow the values one operation at a time.',
    },
    hints: ['Track what has already been seen.'],
  }
}

function makeVariant(
  id: ProblemLessonVariantId,
  suffix: string,
  includeExtra: boolean,
): ProblemLessonVariantV1 {
  const assessments = makeAssessments(suffix).map(toAssessmentStep)
  if (includeExtra) {
    const extra: AssessmentV1 = {
      ...assessmentBase(
        'assessment:unrelated',
        `What is the scan complexity?${suffix}`,
      ),
      kind: 'singleChoice',
      options: [
        { id: 'option:linear', label: 'O(n)' },
        { id: 'option:quadratic', label: 'O(n²)' },
      ],
      correctOptionId: 'option:linear',
    }
    assessments.push(toAssessmentStep(extra))
  }

  return {
    id,
    explanation: {
      id: 'step-explanation',
      kind: 'explanation',
      hook: `Remember what you have seen${suffix}`,
      prompt: `A set answers whether a value appeared earlier.${suffix}`,
      diagram: { kind: 'array', values: [1, 2, 1], highlight: 0 },
      skillIds: [SKILL_ID],
    },
    workedExample: {
      id: 'step-worked',
      kind: 'workedExample',
      prompt: `Scan once and add unseen values.${suffix}`,
      code: [
        'seen = set()',
        'for value in nums:',
        '    if value in seen: return True',
        '    seen.add(value)',
      ],
      currentLineIndex: 1,
      bullets: ['Check before adding.'],
    },
    quizIntro: {
      id: 'step-quiz-intro',
      kind: 'quizIntro',
      prompt: `Now prove the pattern.${suffix}`,
    },
    assessments: assessments as [
      ProblemLessonAssessmentStepV1,
      ...ProblemLessonAssessmentStepV1[],
    ],
  }
}

function makeSpec(includeExtra = false): ProblemLessonSpecV1 {
  return {
    schemaVersion: 1,
    curriculumId: 'curriculum:neetcode150',
    manifestContentVersion: NEETCODE_150_CONTENT_VERSION,
    problemId: 'problem:contains-duplicate',
    problemContentVersion: NEETCODE_150_CONTENT_VERSION,
    description: 'Use a set to detect whether a value appears twice.',
    pattern: 'Hash membership lookup',
    estimatedMinutes: 18,
    skillIds: [SKILL_ID],
    variants: [
      makeVariant('variant:alpha', '', includeExtra),
      makeVariant('variant:beta', ' (alternate)', includeExtra),
    ],
  }
}

type DeepMutable<T> =
  T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T

const mutableSpec = (): DeepMutable<ProblemLessonSpecV1> =>
  structuredClone(makeSpec()) as unknown as DeepMutable<ProblemLessonSpecV1>

const validateMutable = (spec: DeepMutable<ProblemLessonSpecV1>) =>
  validateProblemLesson(
    spec as unknown as ProblemLessonSpecV1,
    NEETCODE_150_MANIFEST,
  )

describe('problem lesson compiler', () => {
  it('validates and compiles every assessment kind into legacy compatibility fields', () => {
    const spec = makeSpec()
    expect(validateProblemLesson(spec, NEETCODE_150_MANIFEST)).toEqual({
      valid: true,
      issues: [],
    })

    const lesson = compileProblemLesson(spec, NEETCODE_150_MANIFEST, {
      seed: 'learner-42',
      variantId: 'variant:alpha',
    })

    expect(lesson).toMatchObject({
      id: 'problem:contains-duplicate',
      title: 'Contains Duplicate',
      conceptTags: [],
      skillIds: [SKILL_ID],
      contentRef: {
        curriculumId: 'curriculum:neetcode150',
        problemId: 'problem:contains-duplicate',
        variantId: 'variant:alpha',
      },
    })
    expect(lesson.steps).toHaveLength(9)
    expect(lesson.steps.every((step) => step.conceptTags.length === 0)).toBe(true)
    expect(
      lesson.steps.every((step) => step.skillIds?.includes(SKILL_ID)),
    ).toBe(true)
    expect(lesson.steps.map((step) => step.assessment?.kind).filter(Boolean)).toEqual([
      'singleChoice',
      'shortAnswer',
      'predict',
      'order',
      'trace',
      'pythonCode',
    ])

    const choice = lesson.steps.find(
      (step) => step.assessment?.kind === 'singleChoice',
    )
    expect(choice).toMatchObject({
      targetVariables: ['answer'],
      expectedState: { answer: 'A hash set' },
      masteryId: 'assessment:choice',
    })
    expect(choice?.answerTiles).toEqual(
      choice?.assessment?.kind === 'singleChoice'
        ? choice.assessment.options.map(({ label }) => label)
        : [],
    )

    const trace = lesson.steps.find(
      (step) => step.assessment?.kind === 'trace',
    )
    expect(trace?.type).toBe('traceVariables')
    expect(trace?.traceFrames?.map(({ assessmentId }) => assessmentId)).toEqual([
      'assessment:trace-init',
      'assessment:trace-duplicate',
    ])
    expect(trace?.traceFrames?.every((frame) => frame.assessment)).toBe(true)

    const python = lesson.steps.find(
      (step) => step.assessment?.kind === 'pythonCode',
    )
    expect(python).toMatchObject({
      code: ['def contains_duplicate(nums):', '    pass'],
      targetVariables: [],
      expectedState: {},
    })
    expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson)
  })

  it('selects variants, option order, and item order deterministically', () => {
    const first = compileProblemLesson(makeSpec(), NEETCODE_150_MANIFEST, {
      seed: 'same-seed',
    })
    const second = compileProblemLesson(makeSpec(), NEETCODE_150_MANIFEST, {
      seed: 'same-seed',
    })
    expect(second).toEqual(first)

    const explicit = compileProblemLesson(makeSpec(), NEETCODE_150_MANIFEST, {
      seed: 'same-seed',
      variantId: 'variant:beta',
    })
    expect(explicit.contentRef?.variantId).toBe('variant:beta')
    expect(explicit.steps[0].prompt).toContain('(alternate)')
  })

  it('uses assessment ids as semantic sub-seeds', () => {
    const before = compileProblemLesson(makeSpec(), NEETCODE_150_MANIFEST, {
      seed: 'stable-seed',
      variantId: 'variant:alpha',
    })
    const after = compileProblemLesson(makeSpec(true), NEETCODE_150_MANIFEST, {
      seed: 'stable-seed',
      variantId: 'variant:alpha',
    })

    const assessmentOrder = (lesson: typeof before, id: string) => {
      const assessment = lesson.steps.find(
        (step) => step.assessment?.id === id,
      )?.assessment
      if (assessment?.kind === 'singleChoice') {
        return assessment.options.map(({ id: optionId }) => optionId)
      }
      if (assessment?.kind === 'order') {
        return assessment.items.map(({ id: itemId }) => itemId)
      }
      return []
    }

    expect(assessmentOrder(after, 'assessment:choice')).toEqual(
      assessmentOrder(before, 'assessment:choice'),
    )
    expect(assessmentOrder(after, 'assessment:order')).toEqual(
      assessmentOrder(before, 'assessment:order'),
    )
  })

  it('rejects manifest, problem, and content-version mismatches', () => {
    const curriculum = mutableSpec()
    curriculum.curriculumId = 'curriculum:other'
    expect(validateMutable(curriculum).issues.map(({ code }) => code)).toContain(
      'manifest.curriculum',
    )

    const version = mutableSpec()
    version.problemContentVersion = 'v9.0.0'
    expect(validateMutable(version).issues.map(({ code }) => code)).toContain(
      'manifest.problemVersion',
    )

    const problem = mutableSpec()
    problem.problemId = 'problem:not-in-manifest'
    expect(validateMutable(problem).issues.map(({ code }) => code)).toContain(
      'manifest.problem',
    )
  })

  it('rejects duplicate step and assessment ids', () => {
    const duplicateStep = mutableSpec()
    duplicateStep.variants[0].workedExample.id =
      duplicateStep.variants[0].explanation.id
    expect(
      validateMutable(duplicateStep).issues.map(({ code }) => code),
    ).toContain('id.duplicate')

    const duplicateAssessment = mutableSpec()
    const traceAssessment =
      duplicateAssessment.variants[0].assessments[4].assessment
    if (traceAssessment.kind !== 'trace') throw new Error('fixture drift')
    traceAssessment.frames[0].assessment.id = traceAssessment.id
    expect(
      validateMutable(duplicateAssessment).issues.map(({ code }) => code),
    ).toContain('id.duplicate')
  })

  it('rejects invalid correct choices, orders, and accepted answers', () => {
    const choice = mutableSpec()
    const choiceAssessment = choice.variants[0].assessments[0].assessment
    if (choiceAssessment.kind !== 'singleChoice') throw new Error('fixture drift')
    choiceAssessment.correctOptionId = 'option:missing'
    expect(validateMutable(choice).issues.map(({ code }) => code)).toContain(
      'assessment.correctOption',
    )

    const orderSpec = mutableSpec()
    const orderAssessment = orderSpec.variants[0].assessments[3].assessment
    if (orderAssessment.kind !== 'order') throw new Error('fixture drift')
    orderAssessment.correctOrderIds = ['item:check', 'item:check']
    expect(validateMutable(orderSpec).issues.map(({ code }) => code)).toContain(
      'assessment.correctOrder',
    )

    const answer = mutableSpec()
    const answerAssessment = answer.variants[0].assessments[1].assessment
    if (
      answerAssessment.kind !== 'shortAnswer' ||
      answerAssessment.matcher.mode !== 'normalized'
    ) {
      throw new Error('fixture drift')
    }
    answerAssessment.matcher.acceptedAnswers = ['   ']
    expect(validateMutable(answer).issues.map(({ code }) => code)).toContain(
      'assessment.answers',
    )

    const duplicateAnswer = mutableSpec()
    const duplicateMatcher =
      duplicateAnswer.variants[0].assessments[1].assessment
    if (
      duplicateMatcher.kind !== 'shortAnswer' ||
      duplicateMatcher.matcher.mode !== 'normalized'
    ) {
      throw new Error('fixture drift')
    }
    duplicateMatcher.matcher.acceptedAnswers = ['True', ' true ']
    expect(
      validateMutable(duplicateAnswer).issues.map(({ code }) => code),
    ).toContain('assessment.answers')
  })

  it('rejects trace line bounds and Python plan/test limits', () => {
    const traceSpec = mutableSpec()
    const traceAssessment = traceSpec.variants[0].assessments[4].assessment
    if (traceAssessment.kind !== 'trace') throw new Error('fixture drift')
    traceAssessment.frames[0].currentLineIndex = traceAssessment.code.length
    expect(validateMutable(traceSpec).issues.map(({ code }) => code)).toContain(
      'assessment.line',
    )

    const pythonSpec = mutableSpec()
    const pythonAssessment = pythonSpec.variants[0].assessments[5]
      .assessment as DeepMutable<PythonCodeAssessmentV1>
    pythonAssessment.limits.timeoutMs = 99_999
    pythonAssessment.cases[0].arguments = []
    const codes = validateMutable(pythonSpec).issues.map(({ code }) => code)
    expect(codes).toContain('python.limits')
    expect(codes).toContain('python.arguments')
  })

  it('rejects unknown skills and mismatched variant topology', () => {
    const skill = mutableSpec()
    skill.skillIds = ['skill:not-real']
    expect(validateMutable(skill).issues.map(({ code }) => code)).toContain(
      'skill.unknown',
    )

    const topology = mutableSpec()
    topology.variants[1].assessments[0].id = 'different-step-id'
    expect(validateMutable(topology).issues.map(({ code }) => code)).toContain(
      'variant.topology',
    )
  })

  it('throws a structured validation error instead of compiling invalid content', () => {
    const invalid = mutableSpec()
    invalid.variants[0].assessments[0].prompt = ''
    expect(() =>
      compileProblemLesson(
        invalid as unknown as ProblemLessonSpecV1,
        NEETCODE_150_MANIFEST,
      ),
    ).toThrow(ProblemLessonValidationError)

    expect(() =>
      compileProblemLesson(makeSpec(), NEETCODE_150_MANIFEST, {
        variantId: 'variant:missing',
      }),
    ).toThrow(ProblemLessonValidationError)
  })
})
