import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../../types/assessment'
import type { PythonJudgeRunResult } from '../../workers/pythonJudgeProtocol'
import { PythonWorkbench } from './PythonWorkbench'

const assessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
  id: 'assessment:python-workbench',
  kind: 'pythonCode',
  prompt: 'Write the function.',
  starterCode: 'def solve(nums):\n    pass',
  entrypoint: { kind: 'function', name: 'solve' },
  codecs: {
    arguments: [{ kind: 'list', item: { kind: 'integer' } }],
    result: { kind: 'integer' },
  },
  cases: [
    {
      id: 'case:example-1',
      arguments: [[1, 2, 3]],
      expected: 6,
      visibility: 'example',
    },
    {
      id: 'case:hidden-1',
      arguments: [[40, 2]],
      expected: 42,
      visibility: 'hidden',
    },
    {
      id: 'case:hidden-2',
      arguments: [[9, 9]],
      expected: 18,
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
}

function render(props: Partial<Parameters<typeof PythonWorkbench>[0]> = {}) {
  return renderToStaticMarkup(
    <PythonWorkbench
      assessment={assessment}
      code={assessment.starterCode}
      onChange={() => undefined}
      {...props}
    />,
  )
}

describe('PythonWorkbench', () => {
  it('renders the editor surface with starter code and entrypoint label', () => {
    const html = render()
    expect(html).toContain('solution.py')
    expect(html).toContain('solve()')
    expect(html).toContain('def solve(nums):')
    expect(html).toContain('Your Python solution')
  })

  it('offers Run against visible examples only when a judge is wired', () => {
    expect(render()).not.toContain('Run code')
    const html = render({
      runJudge: () => Promise.reject(new Error('unused')),
    })
    expect(html).toContain('Run code')
    expect(html).toContain('Runs the 1 visible example case')
    expect(html).toContain('2 hidden checks run on submit')
  })

  it('shows per-case detail for examples and only aggregates for hidden cases', () => {
    const submitResult: PythonJudgeRunResult = {
      status: 'failed',
      assessmentId: assessment.id,
      cases: [
        {
          caseId: 'case:example-1',
          visibility: 'example',
          passed: true,
          actual: 6,
          expected: 6,
        },
        { caseId: 'case:hidden-1', visibility: 'hidden', passed: true },
        { caseId: 'case:hidden-2', visibility: 'hidden', passed: false },
      ],
      passedCases: 2,
      totalCases: 3,
      stdout: '',
      stderr: '',
      durationMs: 12,
      memoryLimitEnforced: false,
    }

    const html = render({ submitResult })
    expect(html).toContain('2 of 3 tests passed')
    expect(html).toContain('Case 1 passed')
    expect(html).toContain('solve([1,2,3])')
    expect(html).toContain('1/2 hidden cases passed')
    // Hidden case inputs and expected outputs must never render.
    expect(html).not.toContain('[40,2]')
    expect(html).not.toContain('42')
    expect(html).not.toContain('[9,9]')
    expect(html).not.toContain('18')
  })

  it('surfaces the failure category of the first failing hidden case', () => {
    const submitResult: PythonJudgeRunResult = {
      status: 'error',
      assessmentId: assessment.id,
      cases: [
        {
          caseId: 'case:example-1',
          visibility: 'example',
          passed: true,
          actual: 6,
          expected: 6,
        },
        {
          caseId: 'case:hidden-1',
          visibility: 'hidden',
          passed: false,
          error: {
            category: 'timeout',
            message: 'A hidden test could not complete',
            caseId: 'case:hidden-1',
          },
        },
        { caseId: 'case:hidden-2', visibility: 'hidden', passed: true },
      ],
      passedCases: 2,
      totalCases: 3,
      stdout: '',
      stderr: '',
      durationMs: 30,
      memoryLimitEnforced: false,
      error: {
        category: 'timeout',
        message: 'Execution timed out',
        caseId: 'case:hidden-1',
      },
    }

    const html = render({ submitResult })
    expect(html).toContain('1/2 hidden cases passed')
    expect(html).toContain('Time limit exceeded')
    expect(html).toContain('Its input and expected output stay hidden')
  })

  it('shows the full traceback message when the code never ran', () => {
    const submitResult: PythonJudgeRunResult = {
      status: 'error',
      assessmentId: assessment.id,
      cases: [],
      passedCases: 0,
      totalCases: 3,
      stdout: '',
      stderr: '',
      durationMs: 4,
      memoryLimitEnforced: false,
      error: {
        category: 'syntax',
        message: "'(' was never closed (<submission>, line 1)",
      },
    }

    const html = render({ submitResult })
    expect(html).toContain('Your code did not finish running.')
    expect(html).toContain('Syntax error')
    expect(html).toContain('was never closed')
  })

  it('shows expected vs actual with the raised error on a failing example', () => {
    const submitResult: PythonJudgeRunResult = {
      status: 'error',
      assessmentId: assessment.id,
      cases: [
        {
          caseId: 'case:example-1',
          visibility: 'example',
          passed: false,
          error: {
            category: 'runtime',
            message: "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
            caseId: 'case:example-1',
          },
        },
        { caseId: 'case:hidden-1', visibility: 'hidden', passed: false },
        { caseId: 'case:hidden-2', visibility: 'hidden', passed: false },
      ],
      passedCases: 0,
      totalCases: 3,
      stdout: '',
      stderr: '',
      durationMs: 9,
      memoryLimitEnforced: false,
      error: {
        category: 'runtime',
        message: "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
        caseId: 'case:example-1',
      },
    }

    const html = render({ submitResult })
    expect(html).toContain('Case 1 failed')
    expect(html).toContain('Runtime error')
    expect(html).toContain('unsupported operand type')
    expect(html).toContain('nothing — the run stopped with an error')
  })
})
