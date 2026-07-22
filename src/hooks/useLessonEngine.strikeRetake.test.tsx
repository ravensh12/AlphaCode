// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type ShortAnswerAssessmentV1,
} from '../types/assessment'
import type { Lesson, LessonStep } from '../types/lesson'
import {
  FORCE_RETAKE_MESSAGE,
  useLessonEngine,
  type LessonEngine,
} from './useLessonEngine'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const shortAnswer: ShortAnswerAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'acquisition',
  id: 'assessment:sa',
  kind: 'shortAnswer',
  prompt: 'Name it.',
  matcher: { mode: 'normalized', acceptedAnswers: ['right'] },
  // Generous retry budget so the 3-strikes rule (not a reveal policy) governs.
  failurePolicy: { kind: 'retry', maxAttempts: 10 },
}

function quizStep(id: string): LessonStep {
  return {
    id,
    type: 'practice',
    section: 'quiz',
    prompt: shortAnswer.prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer: 'right' },
    feedback: { correct: 'Correct.', incorrect: 'Try again.' },
    conceptTags: [],
    assessment: { ...shortAnswer, id: `assessment:${id}` },
    masteryId: `assessment:${id}`,
  }
}

function makeLesson(steps: LessonStep[]): Lesson {
  return {
    id: 'lesson:strike',
    title: 'Strike',
    description: '',
    pattern: '',
    estimatedMinutes: 1,
    conceptTags: [],
    unlockRequirements: {},
    steps,
  }
}

type Options = Parameters<typeof useLessonEngine>[1]

function mountEngine(lesson: Lesson, options: Options) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const ref: { current: LessonEngine | undefined } = { current: undefined }
  function Probe() {
    ref.current = useLessonEngine(lesson, options)
    return null
  }
  return {
    ref,
    container,
    async render() {
      await act(async () => {
        root.render(createElement(Probe))
      })
    },
    async run(fn: () => void | Promise<void>) {
      await act(async () => {
        await fn()
      })
    },
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function submitAnswer(
  harness: ReturnType<typeof mountEngine>,
  answer: string,
) {
  const engine = () => harness.ref.current!
  if (engine().phase === 'ready') {
    await harness.run(() => engine().runStep())
  }
  await harness.run(() =>
    engine().setAssessmentResponse({ kind: 'shortAnswer', answer }),
  )
  await harness.run(() => engine().checkAssessment())
}

let harness: ReturnType<typeof mountEngine> | null = null

beforeEach(() => {
  harness = null
})

afterEach(() => {
  harness?.cleanup()
})

const practiceOptions: Options = {
  section: 'quiz',
  enableStrikeRetake: true,
  completeAsLesson: true,
}

describe('useLessonEngine — per-question miss streak + forced retake', () => {
  it('increments the miss streak on wrong answers and clears it on a correct one', async () => {
    harness = mountEngine(makeLesson([quizStep('q1')]), practiceOptions)
    await harness.render()
    const engine = () => harness!.ref.current!

    await submitAnswer(harness, 'nope')
    expect(engine().stepMissStreak).toBe(1)
    expect(engine().forcedRetake).toBe(false)
    expect(engine().feedback?.kind).toBe('incorrect')

    await submitAnswer(harness, 'still nope')
    expect(engine().stepMissStreak).toBe(2)
    expect(engine().forcedRetake).toBe(false)

    // A correct answer clears the streak — no retake even after earlier misses.
    await submitAnswer(harness, 'right')
    expect(engine().stepMissStreak).toBe(0)
    expect(engine().forcedRetake).toBe(false)
    expect(engine().phase).toBe('solved')
  })

  it('forces a lesson retake after 3 consecutive misses in practice mode', async () => {
    harness = mountEngine(makeLesson([quizStep('q1')]), practiceOptions)
    await harness.render()
    const engine = () => harness!.ref.current!

    await submitAnswer(harness, 'a')
    await submitAnswer(harness, 'b')
    expect(engine().forcedRetake).toBe(false)

    await submitAnswer(harness, 'c')
    expect(engine().stepMissStreak).toBe(3)
    expect(engine().forcedRetake).toBe(true)
    expect(engine().feedback?.text).toBe(FORCE_RETAKE_MESSAGE)
    // The run was never completed, so no pass/completion is recorded.
    expect(engine().isComplete).toBe(false)
    expect(engine().result).toBeNull()
  })

  it('does NOT force a retake in exam mode (single attempt, no retry loop)', async () => {
    harness = mountEngine(makeLesson([quizStep('q1'), quizStep('q2')]), {
      ...practiceOptions,
      examMode: true,
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    // Exam mode grants exactly one attempt, then locks in — a miss can never
    // reach three on the same question.
    await submitAnswer(harness, 'wrong')
    expect(engine().forcedRetake).toBe(false)
    expect(engine().phase).toBe('solved')
  })

  it('does NOT force a retake during the missed-question review loop', async () => {
    harness = mountEngine(makeLesson([quizStep('q1')]), {
      ...practiceOptions,
      reviewMode: { onStepCleared: vi.fn() },
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    await submitAnswer(harness, 'a')
    await submitAnswer(harness, 'b')
    await submitAnswer(harness, 'c')
    expect(engine().stepMissStreak).toBe(3)
    expect(engine().forcedRetake).toBe(false)
  })

  it('does NOT force a retake when the feature is disabled (default hosts)', async () => {
    harness = mountEngine(makeLesson([quizStep('q1')]), {
      section: 'quiz',
      completeAsLesson: true,
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    await submitAnswer(harness, 'a')
    await submitAnswer(harness, 'b')
    await submitAnswer(harness, 'c')
    expect(engine().forcedRetake).toBe(false)
  })

  it('demo skip advances past the question without a miss and never triggers the retake', async () => {
    harness = mountEngine(
      makeLesson([quizStep('q1'), quizStep('q2')]),
      practiceOptions,
    )
    await harness.render()
    const engine = () => harness!.ref.current!

    // Two real misses first — the skip must not push the streak to three.
    await submitAnswer(harness, 'a')
    await submitAnswer(harness, 'b')
    expect(engine().stepMissStreak).toBe(2)

    await harness.run(() => engine().skipStep())
    expect(engine().stepIndex).toBe(1)
    expect(engine().forcedRetake).toBe(false)
    expect(engine().feedback).toBeNull()
    expect(engine().stepMissStreak).toBe(0)

    // Skipping the last question completes the run with nothing marked missed.
    await harness.run(() => engine().skipStep())
    expect(engine().isComplete).toBe(true)
    const reviews = engine().result!.stepReviews
    expect(reviews.find((s) => s.id === 'q1')?.missed).toBe(false)
    expect(reviews.find((s) => s.id === 'q2')?.missed).toBe(false)
  })

  it('demo skip resolves the current question as a passed assessment attempt', async () => {
    const attempts: Array<{ stepId: string; isCorrect: boolean; resolved: boolean }> = []
    harness = mountEngine(makeLesson([quizStep('q1')]), {
      ...practiceOptions,
      onAssessmentAttempt: ({ stepId, result, resolved }) => {
        attempts.push({ stepId, isCorrect: result.isCorrect, resolved })
      },
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    await harness.run(() => engine().skipStep())
    expect(engine().isComplete).toBe(true)
    expect(attempts).toEqual([{ stepId: 'q1', isCorrect: true, resolved: true }])
  })

  it('demo skip after a real miss resolves the same interaction as a bumped terminal attempt', async () => {
    // Regression for should-fix 2: the skip used to reuse attempt number 1 on
    // the current interaction. After a real miss (which already owns attempt
    // (interactionId, 1) as an unresolved event) that collided on the cloud's
    // natural key and — with natural-key dedupe — the resolved skip was dropped,
    // leaving the interaction unresolved. The skip must instead resolve it as a
    // distinct terminal attempt (stepAttempts + 1) under the SAME interactionId.
    const attempts: Array<{
      attemptNumber: number
      resolved: boolean
      firstTry: boolean
      interactionId: string
    }> = []
    harness = mountEngine(makeLesson([quizStep('q1')]), {
      ...practiceOptions,
      onAssessmentAttempt: ({
        serializedAttempt,
        resolved,
        firstTry,
        interactionId,
      }) => {
        attempts.push({
          attemptNumber: serializedAttempt.attemptNumber,
          resolved,
          firstTry,
          interactionId,
        })
      },
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    await submitAnswer(harness, 'wrong')
    await harness.run(() => engine().skipStep())

    expect(attempts).toHaveLength(2)
    const [miss, skip] = attempts
    // The miss owns attempt 1 (unresolved); the skip closes the interaction as
    // a distinct resolved attempt 2 without claiming first-try credit.
    expect(miss).toMatchObject({ attemptNumber: 1, resolved: false })
    expect(skip).toMatchObject({
      attemptNumber: 2,
      resolved: true,
      firstTry: false,
    })
    // Same interaction: the skip genuinely resolves what the miss opened.
    expect(skip.interactionId).toBe(miss.interactionId)
    expect(engine().isComplete).toBe(true)
  })

  it('demo skip ignores reentrant calls while its persistence is in flight', async () => {
    const attempts: string[] = []
    harness = mountEngine(makeLesson([quizStep('q1')]), {
      ...practiceOptions,
      onAssessmentAttempt: async ({ stepId }) => {
        attempts.push(stepId)
        // Keep the first skip suspended so the second call arrives mid-flight.
        await new Promise((resolve) => setTimeout(resolve, 20))
      },
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    await harness.run(async () => {
      // Simulates a double-click: both calls share the same closure.
      await Promise.all([engine().skipStep(), engine().skipStep()])
    })

    expect(attempts).toEqual(['q1'])
    expect(engine().isComplete).toBe(true)
    expect(engine().result!.totalAttempts).toBe(1)
    expect(engine().result!.correctFirstTry).toBe(1)
    expect(engine().result!.assessmentEvidence ?? []).toHaveLength(0)
    expect(engine().progressSnapshot.correctCount).toBe(1)
  })

  it('resumes a quiz at the saved question with earlier answers intact', async () => {
    // Simulates returning from a review: the engine re-mounts from saved quiz
    // progress and picks up where it left off without dropping prior answers.
    harness = mountEngine(makeLesson([quizStep('q1'), quizStep('q2')]), {
      ...practiceOptions,
      resume: true,
      initialProgress: {
        lessonId: 'lesson:strike',
        status: 'inProgress',
        currentStepIndex: 1,
        completedStepIds: ['q1'],
        correctCount: 1,
        wrongCount: 0,
        totalAttempts: 1,
        correctFirstTry: 1,
        accuracy: 100,
        masteryScore: 50,
        unlockNextLesson: false,
        learnCompleted: true,
        quizStepIndex: 1,
        quizFrameIndex: 0,
        updatedAt: new Date().toISOString(),
      },
    })
    await harness.render()
    const engine = () => harness!.ref.current!

    expect(engine().stepIndex).toBe(1)
    expect(engine().progressSnapshot.correctCount).toBe(1)
    expect(engine().completedStepIds).toContain('q1')
  })
})
