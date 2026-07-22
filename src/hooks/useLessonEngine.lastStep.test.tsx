// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type GradedAssessmentResultV1,
} from '../types/assessment'
import type { Lesson, LessonStep } from '../types/lesson'
import {
  useLessonEngine,
  type GradeAssessment,
  type LessonEngine,
} from './useLessonEngine'

// `act` from 'react' requires this flag to flush effects/state without warnings.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const common = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
} as const

function assessmentStep(id: string, assessment: LessonStep['assessment']): LessonStep {
  return {
    id,
    type: 'practice',
    section: 'quiz',
    prompt: assessment!.prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer: 'x' },
    feedback: { correct: 'Correct.', incorrect: 'Try again.' },
    conceptTags: [],
    assessment,
    masteryId: assessment!.id,
  }
}

// A two-question quiz whose LAST step is the full-problem Python solve, exactly
// like a real mission quiz.
const lesson: Lesson = {
  id: 'lesson:last-step',
  title: 'Last Step',
  description: '',
  pattern: '',
  estimatedMinutes: 1,
  conceptTags: [],
  unlockRequirements: {},
  steps: [
    assessmentStep('step-choice', {
      ...common,
      id: 'assessment:choice',
      kind: 'singleChoice',
      prompt: 'Pick.',
      options: [
        { id: 'option:a', label: 'A' },
        { id: 'option:b', label: 'B' },
      ],
      correctOptionId: 'option:a',
    }),
    assessmentStep('step-python', {
      ...common,
      evidenceKind: 'code-tests',
      id: 'assessment:python',
      kind: 'pythonCode',
      prompt: 'Solve it.',
      starterCode: 'def solve(n):\n    pass',
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'integer' }],
        result: { kind: 'integer' },
      },
      cases: [
        { id: 'case:1', arguments: [1], expected: 2, visibility: 'example' },
      ],
      comparator: { kind: 'deepEqual' },
      limits: {
        timeoutMs: 1_000,
        memoryMb: 64,
        maxOutputBytes: 4_096,
        maxSourceBytes: 20_000,
      },
    }),
  ],
}

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('useLessonEngine — final Python question', () => {
  it('completes on the last step without resetting to question 1', async () => {
    let engine: LessonEngine | undefined
    function Probe() {
      engine = useLessonEngine(lesson, {
        section: 'quiz',
        completeAsLesson: true,
        onGradeAssessment: gradePythonCorrect,
      })
      return null
    }

    const gradePythonCorrect: GradeAssessment = async (assessment) => {
      const graded: GradedAssessmentResultV1 = {
        schemaVersion: ASSESSMENT_SCHEMA_VERSION,
        assessmentId: assessment.id,
        assessmentKind: assessment.kind,
        revealLabel: 'ok',
        status: 'correct',
        complete: true,
        isCorrect: true,
        expectedResponse: null,
      }
      return graded
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(Probe))
    })

    // Q1: answer the single-choice correctly and advance.
    await act(async () => {
      engine!.runStep()
    })
    await act(async () => {
      engine!.setAssessmentResponse({ kind: 'singleChoice', optionId: 'option:a' })
    })
    await act(async () => {
      await engine!.checkAssessment()
    })
    await act(async () => {
      engine!.next()
    })
    expect(engine!.stepIndex).toBe(1)

    // Q2 (LAST): submit the Python solution — grading resolves correct.
    await act(async () => {
      engine!.runStep()
    })
    await act(async () => {
      engine!.setAssessmentResponse({
        kind: 'pythonCode',
        code: 'def solve(n):\n    return n + 1',
      })
    })
    await act(async () => {
      await engine!.checkAssessment()
    })
    expect(engine!.phase).toBe('solved')
    // Still on the last question — the submit must never bounce back to Q1.
    expect(engine!.stepIndex).toBe(1)

    // Finish the quiz.
    await act(async () => {
      engine!.next()
    })

    expect(engine!.isComplete).toBe(true)
    expect(engine!.result).not.toBeNull()
    // The quiz completed from the last step; it did not restart at index 0.
    expect(engine!.stepIndex).toBe(1)

    await act(async () => {
      root.unmount()
    })
  })
})
