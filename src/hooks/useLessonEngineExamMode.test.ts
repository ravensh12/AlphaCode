// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSESSMENT_SCHEMA_VERSION } from '../types/assessment'
import type { AttemptEvent } from '../types/learning'
import type { Lesson, LessonStep } from '../types/lesson'
import { computeQuizMastery } from '../lib/mastery'
import { playCorrect, playWrong } from '../lib/soundFx'
import {
  EXAM_MODE_ADVANCE_MS,
  useLessonEngine,
  type AssessmentAttemptInfo,
  type LessonEngine,
} from './useLessonEngine'

vi.mock('../lib/soundFx', () => ({
  playCorrect: vi.fn(),
  playWrong: vi.fn(),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type EngineOptions = NonNullable<Parameters<typeof useLessonEngine>[1]>

function choiceStep(id: string): LessonStep {
  return {
    id,
    type: 'lessonPractice',
    section: 'quiz',
    prompt: `${id}?`,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: {
      correct: 'Nice!',
      incorrect: 'Nope.',
      secondIncorrect: 'Still nope.',
    },
    conceptTags: [],
    hints: ['A hint that exam mode must never surface.'],
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      evidenceKind: 'acquisition',
      id: `assessment:${id}`,
      kind: 'singleChoice',
      prompt: `${id}?`,
      options: [
        { id: 'option:right', label: 'Right' },
        { id: 'option:wrong', label: 'Wrong' },
      ],
      correctOptionId: 'option:right',
      shuffleOptions: false,
      failurePolicy: { kind: 'reveal', maxAttempts: 2 },
    },
  }
}

function quizLesson(): Lesson {
  return {
    id: 'exam-lesson',
    title: 'Exam lesson',
    description: '',
    pattern: '',
    estimatedMinutes: 5,
    conceptTags: [],
    unlockRequirements: {},
    steps: [choiceStep('q1'), choiceStep('q2')],
  }
}

/** Persists a fake durable learning event, like ProgressContext would. */
function persistingAttemptHandler() {
  let seq = 0
  return vi.fn(async (info: AssessmentAttemptInfo) => {
    seq += 1
    return {
      id: `event:${seq}`,
      interactionId: info.interactionId,
      occurredAt: new Date().toISOString(),
    } as AttemptEvent
  })
}

const activeRoots: Root[] = []

function renderEngine(lesson: Lesson, options?: EngineOptions) {
  let engine: LessonEngine | undefined
  function Probe() {
    engine = useLessonEngine(lesson, options)
    return null
  }
  const root = createRoot(document.createElement('div'))
  activeRoots.push(root)
  act(() => {
    root.render(createElement(Probe))
  })
  return () => {
    if (!engine) throw new Error('engine did not render')
    return engine
  }
}

async function submit(
  engine: () => LessonEngine,
  optionId: `option:${string}`,
) {
  act(() => {
    engine().setAssessmentResponse({ kind: 'singleChoice', optionId })
  })
  await act(async () => {
    await engine().checkAssessment()
  })
}

afterEach(() => {
  for (const root of activeRoots.splice(0)) {
    act(() => root.unmount())
  }
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useLessonEngine exam mode', () => {
  it('locks in a correct answer without any correctness signal', async () => {
    const onAssessmentAttempt = persistingAttemptHandler()
    const engine = renderEngine(quizLesson(), {
      section: 'quiz',
      examMode: true,
      onAssessmentAttempt,
    })

    await submit(engine, 'option:right')

    expect(engine().phase).toBe('solved')
    expect(engine().feedback).toBeNull()
    expect(engine().lastStepBadge).toBeNull()
    expect(engine().answerRevealed).toBe(false)
    expect(engine().progressSegments[0]).toBe('answered')
    expect(engine().progressSegments).not.toContain('correct')
    expect(engine().progressSegments).not.toContain('wrong')
    expect(playCorrect).not.toHaveBeenCalled()
    expect(playWrong).not.toHaveBeenCalled()

    // The evidence pipeline still records a truthful resolved first-try pass.
    expect(onAssessmentAttempt).toHaveBeenCalledTimes(1)
    expect(onAssessmentAttempt.mock.calls[0][0]).toMatchObject({
      resolved: true,
      firstTry: true,
      usedHint: false,
      result: { isCorrect: true },
      serializedAttempt: { attemptNumber: 1, revealed: false },
    })
  })

  it('resolves a wrong answer after a single silent attempt — no retry, no reveal', async () => {
    const onAssessmentAttempt = persistingAttemptHandler()
    const onConceptResult = vi.fn()
    const engine = renderEngine(quizLesson(), {
      section: 'quiz',
      examMode: true,
      onAssessmentAttempt,
      onConceptResult,
    })

    await submit(engine, 'option:wrong')

    // One attempt is terminal: the step is solved-for-navigation, not retried.
    expect(engine().phase).toBe('solved')
    expect(engine().feedback).toBeNull()
    expect(engine().answerRevealed).toBe(false)
    expect(engine().progressSegments[0]).toBe('answered')
    expect(playWrong).not.toHaveBeenCalled()

    expect(onAssessmentAttempt).toHaveBeenCalledTimes(1)
    expect(onAssessmentAttempt.mock.calls[0][0]).toMatchObject({
      resolved: true,
      firstTry: true,
      result: { isCorrect: false },
      serializedAttempt: { attemptNumber: 1, revealed: false },
    })
    expect(onConceptResult).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, firstTry: false }),
    )
  })

  it('auto-advances to the next question, then finishes the run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const engine = renderEngine(quizLesson(), {
      section: 'quiz',
      examMode: true,
    })

    await submit(engine, 'option:right')
    expect(engine().stepIndex).toBe(0)
    expect(engine().phase).toBe('solved')

    act(() => {
      vi.advanceTimersByTime(EXAM_MODE_ADVANCE_MS)
    })
    expect(engine().stepIndex).toBe(1)
    expect(engine().phase).toBe('answering')

    await submit(engine, 'option:wrong')
    act(() => {
      vi.advanceTimersByTime(EXAM_MODE_ADVANCE_MS)
    })
    expect(engine().isComplete).toBe(true)
    expect(engine().result).not.toBeNull()
  })

  it('scores exactly like a normal quiz run resolved through today\u2019s policies', async () => {
    // Exam run: q1 right on the single attempt, q2 wrong on the single attempt.
    const examAttempts = persistingAttemptHandler()
    const exam = renderEngine(quizLesson(), {
      section: 'quiz',
      examMode: true,
      onAssessmentAttempt: examAttempts,
    })
    await submit(exam, 'option:right')
    act(() => exam().next())
    await submit(exam, 'option:wrong')
    act(() => exam().next())

    const examResult = exam().result
    expect(examResult).not.toBeNull()
    expect(examResult).toMatchObject({
      totalAttempts: 2,
      correctFirstTry: 1,
      masteryScore: computeQuizMastery(1, 2),
      unlockNext: false,
    })
    expect(
      examResult!.stepReviews.map(({ id, missed }) => ({ id, missed })),
    ).toEqual([
      { id: 'q1', missed: false },
      { id: 'q2', missed: true },
    ])
    // Both attempts persisted durable evidence; the miss stays truthful.
    expect(examResult!.assessmentEvidence).toHaveLength(2)
    expect(examResult!.assessmentEvidence![0]).toMatchObject({
      stepId: 'q1',
      isCorrect: true,
      resolved: true,
      firstTry: true,
    })
    expect(examResult!.assessmentEvidence![1]).toMatchObject({
      stepId: 'q2',
      isCorrect: false,
      resolved: true,
      revealed: false,
    })

    // Normal run answering the same way (q2 missed until the reveal policy
    // resolves it) must land on the same mastery, unlock, and review verdicts.
    const normal = renderEngine(quizLesson(), { section: 'quiz' })
    await submit(normal, 'option:right')
    act(() => normal().next())
    await submit(normal, 'option:wrong')
    // Normal mode keeps its retry loop and visible verdicts.
    expect(normal().phase).toBe('answering')
    expect(normal().feedback?.kind).toBe('incorrect')
    await submit(normal, 'option:wrong')
    expect(normal().answerRevealed).toBe(true)
    act(() => normal().next())

    const normalResult = normal().result
    expect(normalResult).not.toBeNull()
    expect(examResult!.masteryScore).toBe(normalResult!.masteryScore)
    expect(examResult!.correctFirstTry).toBe(normalResult!.correctFirstTry)
    expect(examResult!.accuracy).not.toBe(0)
    expect(examResult!.unlockNext).toBe(normalResult!.unlockNext)
    expect(
      examResult!.stepReviews.map(({ id, missed }) => ({ id, missed })),
    ).toEqual(
      normalResult!.stepReviews.map(({ id, missed }) => ({ id, missed })),
    )
  })

  it('matches a perfect normal run on a perfect exam run', async () => {
    const exam = renderEngine(quizLesson(), {
      section: 'quiz',
      examMode: true,
    })
    const normal = renderEngine(quizLesson(), { section: 'quiz' })
    for (const engine of [exam, normal]) {
      await submit(engine, 'option:right')
      act(() => engine().next())
      await submit(engine, 'option:right')
      act(() => engine().next())
    }
    expect(exam().result).toMatchObject({
      masteryScore: 100,
      correctFirstTry: 2,
      unlockNext: true,
    })
    expect(exam().result!.masteryScore).toBe(normal().result!.masteryScore)
    expect(exam().result!.unlockNext).toBe(normal().result!.unlockNext)
  })
})
