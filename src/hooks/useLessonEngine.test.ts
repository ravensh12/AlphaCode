import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentV1,
  type PythonCodeAssessmentV1,
  type TraceAssessmentV1,
} from '../types/assessment'
import type { LessonStep } from '../types/lesson'
import {
  activeAssessmentUnit,
  activeResponseForAssessment,
  assessmentAttemptResolves,
  assessmentFailureDecision,
  gradeAssessmentResponse,
  isUnassistedFirstTry,
  type AssessmentGradeContext,
  useLessonEngine,
} from './useLessonEngine'
import { createAssessmentResponse } from '../lib/assessmentResponses'

const common = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
} as const

const context: AssessmentGradeContext = {
  lessonId: 'lesson',
  stepId: 'step',
  frameIndex: 0,
  assessmentId: 'assessment:short',
  masteryId: 'assessment:short',
}

function lessonStep(overrides: Partial<LessonStep> = {}): LessonStep {
  return {
    id: 'step',
    type: 'practice',
    section: 'quiz',
    prompt: 'Answer.',
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer: 'hash map' },
    feedback: {
      correct: 'Correct.',
      incorrect: 'Try again.',
    },
    conceptTags: [],
    ...overrides,
  }
}

describe('assessment lesson engine helpers', () => {
  it('does not treat a hinted first answer as clean first-try evidence', () => {
    expect(isUnassistedFirstTry(0, false, false)).toBe(true)
    expect(isUnassistedFirstTry(0, false, true)).toBe(false)
    expect(isUnassistedFirstTry(1, false, false)).toBe(false)
  })

  it('grades local assessments without invoking the async judge', async () => {
    const assessment: AssessmentV1 = {
      ...common,
      id: 'assessment:short',
      kind: 'shortAnswer',
      prompt: 'Name the structure.',
      matcher: {
        mode: 'normalized',
        acceptedAnswers: ['hash map'],
      },
    }
    const externalGrade = vi.fn()

    const resolution = await gradeAssessmentResponse(
      assessment,
      { kind: 'shortAnswer', answer: ' HASH   MAP ' },
      context,
      externalGrade,
    )

    expect(resolution.kind).toBe('graded')
    if (resolution.kind === 'graded') {
      expect(resolution.result.status).toBe('correct')
    }
    expect(externalGrade).not.toHaveBeenCalled()
  })

  it('does not turn unavailable Python infrastructure into a wrong answer', async () => {
    const assessment: PythonCodeAssessmentV1 = {
      ...common,
      id: 'assessment:python',
      kind: 'pythonCode',
      prompt: 'Implement solve.',
      starterCode: 'def solve(nums):\n    pass',
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'list', item: { kind: 'integer' } }],
        result: { kind: 'integer' },
      },
      cases: [],
      comparator: { kind: 'deepEqual' },
      limits: {
        timeoutMs: 1_000,
        memoryMb: 64,
        maxOutputBytes: 4_096,
        maxSourceBytes: 20_000,
      },
    }
    const pythonContext = {
      ...context,
      assessmentId: assessment.id,
      masteryId: assessment.id,
    }

    await expect(
      gradeAssessmentResponse(
        assessment,
        { kind: 'pythonCode', code: 'def solve(nums):\n    return 0' },
        pythonContext,
        async () => {
          throw new Error('worker failed to initialize')
        },
      ),
    ).resolves.toMatchObject({ kind: 'infrastructureError' })

    await expect(
      gradeAssessmentResponse(
        assessment,
        { kind: 'pythonCode', code: 'def solve(nums):\n    return 0' },
        pythonContext,
      ),
    ).resolves.toMatchObject({ kind: 'infrastructureError' })
  })

  it('applies retry, reveal, continue, and rewind failure policies', () => {
    expect(
      assessmentFailureDecision(
        { kind: 'reveal', maxAttempts: 2 },
        1,
      ),
    ).toEqual({ kind: 'retry', resetAttempts: false })
    expect(
      assessmentFailureDecision(
        { kind: 'retry', maxAttempts: 2 },
        2,
      ),
    ).toEqual({ kind: 'retry', resetAttempts: true })
    expect(
      assessmentFailureDecision(
        { kind: 'reveal', maxAttempts: 2 },
        2,
      ),
    ).toEqual({ kind: 'reveal' })
    expect(
      assessmentFailureDecision(
        { kind: 'continue', maxAttempts: 1 },
        1,
      ),
    ).toEqual({ kind: 'continue' })
    expect(
      assessmentFailureDecision(
        {
          kind: 'rewind',
          maxAttempts: 1,
          checkpointStepId: 'checkpoint',
        },
        1,
      ),
    ).toEqual({ kind: 'rewind', checkpointStepId: 'checkpoint' })
    expect(assessmentFailureDecision(undefined, 2, 'legacy-start')).toEqual({
      kind: 'rewind',
      checkpointStepId: 'legacy-start',
    })
  })

  it('keeps wrong retries unresolved until a terminal outcome', () => {
    expect(
      assessmentAttemptResolves(false, {
        kind: 'retry',
        resetAttempts: false,
      }),
    ).toBe(false)
    expect(
      assessmentAttemptResolves(false, {
        kind: 'rewind',
        checkpointStepId: 'checkpoint',
      }),
    ).toBe(false)
    expect(assessmentAttemptResolves(false, { kind: 'reveal' })).toBe(true)
    expect(assessmentAttemptResolves(false, { kind: 'continue' })).toBe(true)
    expect(assessmentAttemptResolves(true, null)).toBe(true)
  })

  it('emits frame-specific assessment and mastery ids', () => {
    const assessment: TraceAssessmentV1 = {
      ...common,
      id: 'assessment:trace',
      kind: 'trace',
      prompt: 'Trace.',
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
            prompt: 'First?',
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
            kind: 'shortAnswer',
            prompt: 'Second?',
            matcher: {
              mode: 'numericTolerance',
              expected: 2,
              absoluteTolerance: 0,
            },
          },
        },
      ],
    }
    const step = lessonStep({
      type: 'traceVariables',
      assessment,
      masteryId: assessment.id,
      traceFrames: assessment.frames.map((frame) => ({
        prompt: frame.assessment.prompt,
        currentLineIndex: frame.currentLineIndex,
        assessment: frame.assessment,
        assessmentId: frame.assessment.id,
        variables: ['x'],
        targetVariables: ['x'],
        expectedState: { x: frame.currentLineIndex + 1 },
        feedback: { correct: 'Correct.', incorrect: 'Try again.' },
      })),
    })

    expect(activeAssessmentUnit(step, 1)).toMatchObject({
      assessmentId: 'assessment:second',
      masteryId: 'assessment:second',
      frameId: 'frame:second',
    })
    const response = createAssessmentResponse(assessment)
    expect(activeResponseForAssessment(step, response, 1)).toEqual({
      kind: 'shortAnswer',
      answer: '',
    })
  })

  it('keeps legacy steps on the legacy path without synthetic assessment state', () => {
    const legacy = lessonStep()
    expect(activeAssessmentUnit(legacy)).toBeNull()
    expect(Object.hasOwn(legacy, 'assessment')).toBe(false)
    expect(Object.hasOwn(legacy, 'masteryId')).toBe(false)

    let engine: ReturnType<typeof useLessonEngine> | undefined
    function Probe() {
      engine = useLessonEngine({
        id: 'legacy-lesson',
        title: 'Legacy',
        description: '',
        pattern: '',
        estimatedMinutes: 1,
        conceptTags: [],
        unlockRequirements: {},
        steps: [legacy],
      })
      return null
    }
    renderToStaticMarkup(createElement(Probe))

    expect(engine?.assessmentResponse).toBeNull()
    expect(engine?.assessmentId).toBeNull()
    expect(engine?.boxValues).toEqual({ answer: '' })
    expect(engine?.activeVar).toBe('answer')
  })

  it('restores a stashed in-flight response only when the kind matches', () => {
    const assessment: PythonCodeAssessmentV1 = {
      ...common,
      id: 'assessment:python-restore',
      kind: 'pythonCode',
      prompt: 'Implement solve.',
      starterCode: 'def solve(nums):\n    pass',
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'list', item: { kind: 'integer' } }],
        result: { kind: 'integer' },
      },
      cases: [],
      comparator: { kind: 'deepEqual' },
      limits: {
        timeoutMs: 1_000,
        memoryMb: 64,
        maxOutputBytes: 4_096,
        maxSourceBytes: 20_000,
      },
    }
    const step = lessonStep({
      targetVariables: [],
      expectedState: {},
      assessment,
    })
    const lesson = {
      id: 'restore-lesson',
      title: 'Restore',
      description: '',
      pattern: '',
      estimatedMinutes: 1,
      conceptTags: [],
      unlockRequirements: {},
      steps: [step],
    }
    const draft = 'def solve(nums):\n    return len(set(nums)) != len(nums)\n'

    let engine: ReturnType<typeof useLessonEngine> | undefined
    function Restored() {
      engine = useLessonEngine(lesson, {
        initialAssessmentResponse: { kind: 'pythonCode', code: draft },
      })
      return null
    }
    renderToStaticMarkup(createElement(Restored))
    expect(engine?.assessmentResponse).toEqual({
      kind: 'pythonCode',
      code: draft,
    })

    // A mismatched kind (stale stash) falls back to the fresh response.
    function Mismatched() {
      engine = useLessonEngine(lesson, {
        initialAssessmentResponse: { kind: 'shortAnswer', answer: 'stale' },
      })
      return null
    }
    renderToStaticMarkup(createElement(Mismatched))
    expect(engine?.assessmentResponse).toEqual(
      createAssessmentResponse(assessment),
    )
  })
})
