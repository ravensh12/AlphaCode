import { beforeAll, describe, expect, it } from 'vitest'
import { emptyBadgeCounts } from '../content/badges'
import {
  loadProblemLesson,
  NEETCODE_150_MANIFEST,
} from '../content/curricula/neetcode150'
import { compileProblemLesson } from '../content/curricula/problemLessonCompiler'
import type { LessonResult, StepReview } from '../hooks/useLessonEngine'
import type { Lesson } from '../types/lesson'
import type { LessonProgress } from '../types/progress'
import { assessmentEvidenceKinds } from '../types/assessment'
import {
  canRecoverMissionCompletion,
  missionAssessmentsPassed,
} from './AcademyMissionPage'
import missionPageSource from './AcademyMissionPage.tsx?raw'

let lesson: Lesson

beforeAll(async () => {
  const spec = await loadProblemLesson('problem:contains-duplicate')
  if (!spec) throw new Error('Contains Duplicate mission was not registered')
  lesson = compileProblemLesson(spec, NEETCODE_150_MANIFEST)
})

function assessmentReviews(missedIds: readonly string[] = []): StepReview[] {
  return lesson.steps
    .filter((step) => !!step.assessment)
    .map((step) => ({
      id: step.id,
      prompt: step.prompt,
      code: step.code,
      targetVariables: step.targetVariables,
      expected: step.expectedState,
      assessmentAnswerLabel: step.assessment?.kind,
      missed: missedIds.includes(step.id),
    }))
}

function result(missedIds: readonly string[] = []): LessonResult {
  return {
    accuracy: 100,
    masteryScore: 100,
    totalAttempts: 4,
    correctFirstTry: 4,
    unlockNext: true,
    badgeCounts: emptyBadgeCounts(),
    badges: [],
    assessmentEvidence: lesson.steps
      .filter((step) => !!step.assessment)
      .map((step, index) => ({
        eventId: `event:${index}`,
        interactionId: `interaction:${index}`,
        occurredAt: `2026-07-11T18:0${index}:00.000Z`,
        assessmentId: step.assessment!.id,
        assessmentKind: step.assessment!.kind,
        stepId: step.id,
        evidenceKinds: assessmentEvidenceKinds(step.assessment!),
        isCorrect: true,
        resolved: true,
        firstTry: !missedIds.includes(step.id),
        usedHint: false,
        revealed: false,
      })),
    stepReviews: assessmentReviews(missedIds),
  }
}

function progress(missedIds: readonly string[] = []): LessonProgress {
  const requiredIds = lesson.steps
    .filter((step) =>
      ['acquisition', 'independent-transfer', 'code-tests'].includes(
        step.assessment?.evidenceKind ?? '',
      ),
    )
    .map(({ id }) => id)
  return {
    lessonId: lesson.id,
    status: 'completed',
    currentStepIndex: lesson.steps.length - 1,
    completedStepIds: requiredIds,
    correctCount: requiredIds.length,
    wrongCount: missedIds.length,
    totalAttempts: requiredIds.length + missedIds.length,
    correctFirstTry: requiredIds.length - missedIds.length,
    accuracy: 100,
    masteryScore: 100,
    unlockNextLesson: false,
    lastReview: {
      steps: lesson.steps,
      missedStepIds: [...missedIds],
      recordedAt: '2026-07-11T18:00:00.000Z',
    },
  }
}

describe('academy mission completion evidence', () => {
  it('labels local retention as pending server received-time verification', () => {
    expect(missionPageSource).toContain(
      'Retention pending cloud verification',
    )
    expect(missionPageSource).toContain(
      'server received-time boundary',
    )
  })

  it('requires passing evidence: retries count, reveals and partial runs never do', () => {
    expect(missionAssessmentsPassed(lesson, result())).toBe(true)

    const codeStep = lesson.steps.find(
      (step) => step.assessment?.evidenceKind === 'code-tests',
    )
    expect(codeStep).toBeDefined()
    // Failing the python checks and then passing on a retry still counts —
    // the authored failure policy grants 10 attempts on the code challenge.
    expect(missionAssessmentsPassed(lesson, result([codeStep!.id]))).toBe(true)

    // A revealed answer resolves the step without proving anything.
    const revealed = result()
    revealed.assessmentEvidence = revealed.assessmentEvidence?.map((item) =>
      item.stepId === codeStep!.id
        ? { ...item, isCorrect: false, revealed: true }
        : item,
    )
    expect(missionAssessmentsPassed(lesson, revealed)).toBe(false)

    // A review-only rerun (required steps absent from the run) never counts.
    const partial = result()
    partial.stepReviews = partial.stepReviews.filter(
      ({ id }) => id !== codeStep!.id,
    )
    expect(missionAssessmentsPassed(lesson, partial)).toBe(false)
  })

  it('does not recover completion from a revealed or missed saved assessment', () => {
    const transferStep = lesson.steps.find(
      (step) => step.assessment?.evidenceKind === 'independent-transfer',
    )
    expect(transferStep).toBeDefined()
    expect(canRecoverMissionCompletion(lesson, progress())).toBe(false)
    expect(
      canRecoverMissionCompletion(lesson, progress([transferStep!.id])),
    ).toBe(false)
  })
})
