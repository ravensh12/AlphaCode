import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentV1,
  type OrderAssessmentV1,
  type TraceAssessmentV1,
} from '../../types/assessment'
import {
  createAssessmentResponse,
  moveOrderItem,
} from '../../lib/assessmentResponses'
import { AssessmentInput } from './AssessmentInput'
import { HintPanel } from './HintPanel'
import { ReviewBreakdown } from './ReviewBreakdown'

const common = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
} as const

function renderAssessment(
  assessment: AssessmentV1,
  options: { disabled?: boolean; activeFrameIndex?: number } = {},
) {
  return renderToStaticMarkup(
    <AssessmentInput
      assessment={assessment}
      response={createAssessmentResponse(assessment)}
      disabled={options.disabled}
      activeFrameIndex={options.activeFrameIndex}
      onChange={() => undefined}
    />,
  )
}

describe('AssessmentInput', () => {
  it('can lock certification hints until an attempt is recorded', () => {
    const html = renderToStaticMarkup(
      <HintPanel
        hints={['Use the invariant.']}
        disabled
        disabledMessage="Hints unlock after the first miss."
      />,
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain('Hints unlock after the first miss.')
    expect(html).not.toContain('<li')
  })

  it('uses stable option ids with native labels and disabled controls', () => {
    const assessment: AssessmentV1 = {
      ...common,
      id: 'assessment:lookup',
      kind: 'singleChoice',
      prompt: 'Pick a lookup.',
      options: [
        { id: 'option:hash', label: 'Hash lookup' },
        { id: 'option:scan', label: 'Linear scan' },
      ],
      correctOptionId: 'option:hash',
    }

    const html = renderAssessment(assessment, { disabled: true })
    expect(html).toContain('type="radio"')
    expect(html).toContain('value="option:hash"')
    expect(html).toContain('Hash lookup')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Pick a lookup.')
  })

  it('renders short-answer and prediction controls with accessible labels', () => {
    const shortAnswer: AssessmentV1 = {
      ...common,
      id: 'assessment:short',
      kind: 'shortAnswer',
      prompt: 'Name the structure.',
      placeholder: 'Type a data structure',
      matcher: {
        mode: 'normalized',
        acceptedAnswers: ['hash map'],
      },
    }
    const predict: AssessmentV1 = {
      ...common,
      id: 'assessment:predict',
      kind: 'predict',
      prompt: 'What prints?',
      language: 'python',
      code: ['print(2 + 2)'],
      matcher: {
        mode: 'exactLines',
        acceptedAnswers: [['4']],
      },
    }

    expect(renderAssessment(shortAnswer)).toContain('Your answer')
    expect(renderAssessment(shortAnswer)).toContain(
      'placeholder="Type a data structure"',
    )
    expect(renderAssessment(predict)).toContain('Your prediction')
    expect(renderAssessment(predict)).toContain('<textarea')
  })

  it('keeps content-supplied order deterministic and moves stable item ids', () => {
    const assessment: OrderAssessmentV1 = {
      ...common,
      id: 'assessment:order',
      kind: 'order',
      prompt: 'Order the steps.',
      items: [
        { id: 'item:check', label: 'Check complement' },
        { id: 'item:store', label: 'Store value' },
        { id: 'item:advance', label: 'Advance' },
      ],
      correctOrderIds: ['item:check', 'item:store', 'item:advance'],
      shuffleItems: true,
    }

    const response = createAssessmentResponse(assessment)
    expect(response).toEqual({
      kind: 'order',
      itemIds: ['item:check', 'item:store', 'item:advance'],
    })
    expect(
      moveOrderItem(
        ['item:check', 'item:store', 'item:advance'],
        'item:store',
        -1,
      ),
    ).toEqual(['item:store', 'item:check', 'item:advance'])

    const html = renderAssessment(assessment)
    expect(html.indexOf('Check complement')).toBeLessThan(
      html.indexOf('Store value'),
    )
    expect(html).toContain('Move Check complement down')
  })

  it('renders only the active trace frame assessment', () => {
    const trace: TraceAssessmentV1 = {
      ...common,
      id: 'assessment:trace',
      kind: 'trace',
      prompt: 'Trace the code.',
      language: 'python',
      code: ['x = 1', 'x += 1'],
      frames: [
        {
          id: 'frame:first',
          currentLineIndex: 0,
          assessment: {
            ...common,
            id: 'assessment:first',
            kind: 'shortAnswer',
            prompt: 'First value?',
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
            id: 'assessment:second',
            kind: 'singleChoice',
            prompt: 'Second value?',
            options: [
              { id: 'option:one', label: 'One' },
              { id: 'option:two', label: 'Two' },
            ],
            correctOptionId: 'option:two',
          },
        },
      ],
    }

    const html = renderAssessment(trace, { activeFrameIndex: 1 })
    expect(html).toContain('data-frame-id="frame:second"')
    expect(html).toContain('data-assessment-id="assessment:second"')
    expect(html).toContain('Second value?')
    expect(html).not.toContain('First value?')
  })

  it('exposes starter code in a disabled Python editor surface', () => {
    const assessment: AssessmentV1 = {
      ...common,
      id: 'assessment:python',
      kind: 'pythonCode',
      prompt: 'Write the function.',
      starterCode: 'def solve(nums):\n    pass',
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'list', item: { kind: 'integer' } }],
        result: { kind: 'integer' },
      },
      cases: [],
      comparator: { kind: 'deepEqual' },
      verificationNotes: [
        'The browser checks the observed value but cannot prove object identity.',
      ],
      limits: {
        timeoutMs: 1_000,
        memoryMb: 64,
        maxOutputBytes: 4_096,
        maxSourceBytes: 20_000,
      },
    }

    const html = renderAssessment(assessment, { disabled: true })
    expect(html).toContain('Your Python solution')
    expect(html).toContain('def solve(nums):')
    expect(html).toContain('cannot prove object identity')
    expect(html).toContain('disabled=""')
  })

  it('shows generic assessment answers in the review breakdown', () => {
    const html = renderToStaticMarkup(
      <ReviewBreakdown
        reviews={[
          {
            id: 'assessment-step',
            prompt: 'Pick one.',
            code: [],
            targetVariables: [],
            expected: {},
            assessmentAnswerLabel: 'Hash lookup',
            missed: false,
          },
        ]}
      />,
    )
    expect(html).toContain('Hash lookup')
    expect(html).toContain('assessment-answer')
  })
})
