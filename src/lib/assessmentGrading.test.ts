import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentV1,
  type OrderAssessmentV1,
  type PredictAssessmentV1,
  type PythonCodeAssessmentV1,
  type ShortAnswerAssessmentV1,
  type SingleChoiceAssessmentV1,
  type TraceAssessmentV1,
} from '../types/assessment'
import {
  answerMatches,
  assessmentRevealLabel,
  gradeAssessment,
  isAssessmentResponseComplete,
  normalizeCasefoldWhitespace,
  normalizeTypedAnswer,
  responseCompleteness,
  serializeAssessmentAttempt,
} from './assessmentGrading'

const common = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
} as const

const singleChoice: SingleChoiceAssessmentV1 = {
  ...common,
  id: 'assessment:choice',
  kind: 'singleChoice',
  prompt: 'Which lookup is constant time?',
  options: [
    { id: 'option:hash', label: 'Hash lookup' },
    { id: 'option:scan', label: 'Linear scan' },
  ],
  correctOptionId: 'option:hash',
}

const shortAnswer: ShortAnswerAssessmentV1 = {
  ...common,
  id: 'assessment:short',
  kind: 'shortAnswer',
  prompt: 'Name the structure.',
  matcher: {
    mode: 'normalized',
    acceptedAnswers: ['hash map', 'dictionary'],
  },
}

const predict: PredictAssessmentV1 = {
  ...common,
  id: 'assessment:predict',
  kind: 'predict',
  prompt: 'What is printed?',
  language: 'python',
  code: ['value = 0.1 + 0.2', 'print(value)'],
  currentLineIndex: 1,
  matcher: {
    mode: 'numericTolerance',
    expected: 0.3,
    absoluteTolerance: 1e-9,
  },
}

const order: OrderAssessmentV1 = {
  ...common,
  id: 'assessment:order',
  kind: 'order',
  prompt: 'Order the operations.',
  items: [
    { id: 'item:check', label: 'Check complement' },
    { id: 'item:store', label: 'Store current value' },
  ],
  correctOrderIds: ['item:check', 'item:store'],
}

const trace: TraceAssessmentV1 = {
  ...common,
  id: 'assessment:trace',
  kind: 'trace',
  prompt: 'Trace both lines.',
  language: 'python',
  code: ['x = 1', 'x += 1'],
  frames: [
    {
      id: 'frame:first',
      currentLineIndex: 0,
      assessment: {
        ...common,
        id: 'assessment:trace-first',
        kind: 'shortAnswer',
        prompt: 'What is x?',
        matcher: {
          mode: 'numericTolerance',
          expected: 1,
          absoluteTolerance: 0,
        },
      },
    },
    {
      id: 'frame:second',
      currentLineIndex: 1,
      assessment: {
        ...common,
        id: 'assessment:trace-second',
        kind: 'singleChoice',
        prompt: 'What is x now?',
        options: [
          { id: 'option:one', label: '1' },
          { id: 'option:two', label: '2' },
        ],
        correctOptionId: 'option:two',
      },
    },
  ],
}

const pythonCode: PythonCodeAssessmentV1 = {
  ...common,
  id: 'assessment:python',
  kind: 'pythonCode',
  prompt: 'Implement contains_duplicate.',
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
  ],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 1_000,
    memoryMb: 64,
    maxOutputBytes: 4_096,
    maxSourceBytes: 20_000,
  },
}

describe('assessment grading', () => {
  it('normalizes Unicode width, case, and repeated whitespace', () => {
    expect(normalizeCasefoldWhitespace('  ＨＡＳＨ\t MAP  ')).toBe('hash map')
    expect(normalizeCasefoldWhitespace('Straße')).toBe('strasse')
    expect(normalizeCasefoldWhitespace('ΟΣ')).toBe(
      normalizeCasefoldWhitespace('ος'),
    )
    expect(
      answerMatches(
        { mode: 'normalized', acceptedAnswers: ['Hash Map'] },
        ' hash\nmap ',
      ),
    ).toBe(true)
  })

  it('treats commas, semicolons, and && as whitespace in typed answers', () => {
    expect(normalizeTypedAnswer('left, node, right')).toBe('left node right')
    expect(normalizeTypedAnswer('a; b; c')).toBe('a b c')

    const accepts = (accepted: [string, ...string[]], answer: string) =>
      answerMatches({ mode: 'normalized', acceptedAnswers: accepted }, answer)

    // Flagged by the adversarial checker: comma instead of ";"/"and".
    expect(
      accepts(['start = i + 1; tank = 0'], 'start = i + 1, tank = 0'),
    ).toBe(true)
    expect(
      accepts(
        ['top <= bottom && left <= right'],
        'top <= bottom, left <= right',
      ),
    ).toBe(true)
    expect(accepts(['left node right'], 'left, node, right')).toBe(true)

    // Lexically close wrong answers must still fail.
    expect(
      accepts(['start = i + 1; tank = 0'], 'start = i; tank = 0'),
    ).toBe(false)
    expect(
      accepts(['top <= bottom && left <= right'], 'top < bottom, left < right'),
    ).toBe(false)
    expect(accepts(['left node right'], 'right, node, left')).toBe(false)

    // Separator-only submissions never match real answers.
    expect(accepts(['left node right'], ',,')).toBe(false)
    expect(accepts(['left node right'], '&&')).toBe(false)
  })

  it('keeps digit-grouping commas from colliding with plain digits', () => {
    // "1,000" folds to "1 000", which is deliberately distinct from "1000".
    expect(
      answerMatches({ mode: 'normalized', acceptedAnswers: ['1000'] }, '1,000'),
    ).toBe(false)
    expect(
      answerMatches({ mode: 'normalized', acceptedAnswers: ['1,000'] }, '1000'),
    ).toBe(false)
    expect(
      answerMatches(
        { mode: 'normalized', acceptedAnswers: ['1,000'] },
        '1, 000',
      ),
    ).toBe(true)
    // Numeric parsing is unchanged: grouped digits still need the plain form.
    expect(
      answerMatches(
        { mode: 'numericTolerance', expected: 1_000, absoluteTolerance: 0 },
        '1,000',
      ),
    ).toBe(false)
    // Multi-value sequences remain order-sensitive.
    expect(
      answerMatches({ mode: 'normalized', acceptedAnswers: ['9, 18'] }, '9 18'),
    ).toBe(true)
    expect(
      answerMatches({ mode: 'normalized', acceptedAnswers: ['9, 18'] }, '18 9'),
    ).toBe(false)
  })

  it('strips one leading "because"/"since" from both sides of the match', () => {
    const matcher = {
      mode: 'normalized',
      acceptedAnswers: ['mid might be the minimum'],
    } as const

    // Flagged by the adversarial checker on a "why" question.
    expect(answerMatches(matcher, 'because mid might be the minimum')).toBe(
      true,
    )
    expect(answerMatches(matcher, 'Since mid might be the minimum')).toBe(true)

    // Accepted answers that already start with "because" also fold.
    expect(
      answerMatches(
        {
          mode: 'normalized',
          acceptedAnswers: ['because after union the roots always match'],
        },
        'after union the roots always match',
      ),
    ).toBe(true)

    // Close-but-wrong content still fails.
    expect(answerMatches(matcher, 'because mid might be the maximum')).toBe(
      false,
    )
    expect(answerMatches(matcher, 'because')).toBe(false)
    // "because"/"since" only fold at the start, not inside the answer.
    expect(
      answerMatches(
        { mode: 'normalized', acceptedAnswers: ['time since epoch'] },
        'time epoch',
      ),
    ).toBe(false)
  })

  it('grades single choice by stable option id rather than label', () => {
    expect(
      gradeAssessment(singleChoice, {
        kind: 'singleChoice',
        optionId: 'option:hash',
      }).status,
    ).toBe('correct')
    expect(
      gradeAssessment(singleChoice, {
        kind: 'singleChoice',
        optionId: 'option:scan',
      }),
    ).toMatchObject({
      status: 'incorrect',
      expectedResponse: 'option:hash',
    })
  })

  it('grades normalized short answers and requires non-blank input', () => {
    expect(
      gradeAssessment(shortAnswer, {
        kind: 'shortAnswer',
        answer: '  HASH   MAP ',
      }).status,
    ).toBe('correct')
    expect(
      responseCompleteness(shortAnswer, {
        kind: 'shortAnswer',
        answer: ' \n ',
      }),
    ).toMatchObject({ complete: false })
  })

  it('compares exact lines while normalizing only line endings', () => {
    const exact: ShortAnswerAssessmentV1 = {
      ...shortAnswer,
      id: 'assessment:exact',
      matcher: {
        mode: 'exactLines',
        acceptedAnswers: [['first', '  second']],
      },
    }
    expect(
      gradeAssessment(exact, {
        kind: 'shortAnswer',
        answer: 'first\r\n  second',
      }).status,
    ).toBe('correct')
    expect(
      gradeAssessment(exact, {
        kind: 'shortAnswer',
        answer: 'first\nsecond',
      }).status,
    ).toBe('incorrect')
  })

  it('uses absolute and relative numeric tolerance for predictions', () => {
    expect(
      gradeAssessment(predict, {
        kind: 'predict',
        answer: '0.3000000001',
      }).status,
    ).toBe('correct')
    expect(
      gradeAssessment(predict, {
        kind: 'predict',
        answer: '0.31',
      }).status,
    ).toBe('incorrect')

    expect(
      answerMatches(
        {
          mode: 'numericTolerance',
          expected: 1_000,
          absoluteTolerance: 0,
          relativeTolerance: 0.01,
        },
        '1009',
      ),
    ).toBe(true)
  })

  it('grades semantic boolean answers without duplicate string variants', () => {
    const booleanAnswer: ShortAnswerAssessmentV1 = {
      ...shortAnswer,
      id: 'assessment:boolean',
      matcher: { mode: 'boolean', expected: true },
    }
    for (const answer of ['true', 'TRUE', 'yes', '1']) {
      expect(
        gradeAssessment(booleanAnswer, {
          kind: 'shortAnswer',
          answer,
        }).status,
      ).toBe('correct')
    }
    expect(
      gradeAssessment(booleanAnswer, {
        kind: 'shortAnswer',
        answer: 'false',
      }).status,
    ).toBe('incorrect')
  })

  it('grades order responses by stable item ids and exact position', () => {
    expect(
      gradeAssessment(order, {
        kind: 'order',
        itemIds: ['item:check', 'item:store'],
      }).status,
    ).toBe('correct')
    expect(
      gradeAssessment(order, {
        kind: 'order',
        itemIds: ['item:store', 'item:check'],
      }).status,
    ).toBe('incorrect')
    expect(
      isAssessmentResponseComplete(order, {
        kind: 'order',
        itemIds: ['item:check', 'item:check'],
      }),
    ).toBe(false)
  })

  it('grades every frame-local assessment in a trace', () => {
    const result = gradeAssessment(trace, {
      kind: 'trace',
      frames: [
        {
          frameId: 'frame:second',
          response: { kind: 'singleChoice', optionId: 'option:two' },
        },
        {
          frameId: 'frame:first',
          response: { kind: 'shortAnswer', answer: '1' },
        },
      ],
    })

    expect(result.status).toBe('correct')
    if (result.status !== 'correct' && result.status !== 'incorrect') {
      throw new Error('expected a graded trace result')
    }
    expect(result.frameResults).toHaveLength(2)
    expect(
      isAssessmentResponseComplete(trace, {
        kind: 'trace',
        frames: [
          {
            frameId: 'frame:first',
            response: { kind: 'shortAnswer', answer: '1' },
          },
        ],
      }),
    ).toBe(false)
  })

  it('marks Python submissions complete but not locally gradable', () => {
    expect(
      gradeAssessment(pythonCode, {
        kind: 'pythonCode',
        code: 'def contains_duplicate(nums):\n    return len(nums) != len(set(nums))',
      }),
    ).toMatchObject({
      status: 'notLocallyGradable',
      complete: true,
      isCorrect: null,
    })
  })

  it('rejects response kinds that do not match the assessment', () => {
    const result = gradeAssessment(singleChoice, {
      kind: 'shortAnswer',
      answer: 'Hash lookup',
    })
    expect(result).toMatchObject({ status: 'incomplete', complete: false })
  })

  it('provides stable reveal labels with optional content overrides', () => {
    expect(assessmentRevealLabel(singleChoice)).toBe('Show correct choice')
    expect(
      assessmentRevealLabel({
        ...singleChoice,
        revealLabel: 'Reveal the lookup',
      }),
    ).toBe('Reveal the lookup')
  })

  it('serializes a JSON-safe, versioned attempt record', () => {
    const response = {
      kind: 'singleChoice',
      optionId: 'option:hash',
    } as const
    const result = gradeAssessment(singleChoice, response)
    const attempt = serializeAssessmentAttempt(
      singleChoice,
      response,
      result,
      { attemptNumber: 2, revealed: true, usedHint: true },
    )

    expect(attempt).toMatchObject({
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      assessmentId: 'assessment:choice',
      assessmentKind: 'singleChoice',
      attemptNumber: 2,
      revealed: true,
      usedHint: true,
    })
    expect(JSON.parse(JSON.stringify(attempt))).toEqual(attempt)
    expect(() =>
      serializeAssessmentAttempt(singleChoice, response, result, {
        attemptNumber: 0,
      }),
    ).toThrow(RangeError)
  })

  it('covers all six assessment discriminants', () => {
    const assessments: AssessmentV1[] = [
      singleChoice,
      shortAnswer,
      predict,
      order,
      trace,
      pythonCode,
    ]
    expect(assessments.map(({ kind }) => kind)).toEqual([
      'singleChoice',
      'shortAnswer',
      'predict',
      'order',
      'trace',
      'pythonCode',
    ])
  })
})
