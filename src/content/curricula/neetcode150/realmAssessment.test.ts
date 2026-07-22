import { describe, expect, it } from 'vitest'
import type { LessonResult } from '../../../hooks/useLessonEngine'
import { emptyBadgeCounts } from '../../badges'
import {
  buildRealmBossAssessment,
  evaluateRealmAssessmentGate,
  realmAssessmentOutcome,
  realmQuizEvidenceEventIds,
  type RealmBossAssessment,
} from './realmAssessment'
import { NEETCODE_150_REALM_BY_ID } from './index'

function resultFor(
  assessment: RealmBossAssessment,
  score: number,
  missedStepId?: string,
): LessonResult {
  return {
    accuracy: score,
    masteryScore: score,
    totalAttempts: assessment.lesson.steps.length,
    correctFirstTry: Math.round(
      (assessment.lesson.steps.length * score) / 100,
    ),
    unlockNext: score >= 80,
    badgeCounts: emptyBadgeCounts(),
    badges: [],
    stepReviews: assessment.lesson.steps.map((step) => ({
      id: step.id,
      prompt: step.prompt,
      code: step.code,
      targetVariables: step.targetVariables,
      expected: step.expectedState,
      assessmentAnswerLabel: step.assessment?.id,
      missed: step.id === missedStepId,
    })),
  }
}

describe('realm boss assessment composition', () => {
  it('loads stable authored assessment kinds for all six realms', async () => {
    for (const realm of NEETCODE_150_REALM_BY_ID.values()) {
      const first = await buildRealmBossAssessment(realm.id)
      const second = await buildRealmBossAssessment(realm.id)

      expect(first.lesson.steps, realm.id).toHaveLength(8)
      expect(first.selections.map(({ trackId }) => trackId)).toEqual(
        realm.trackIds,
      )
      expect(first.requiredOpenEndedStepIds).toHaveLength(3)
      expect(
        first.lesson.steps.reduce<Record<string, number>>((counts, step) => {
          const kind = step.assessment?.kind ?? 'missing'
          counts[kind] = (counts[kind] ?? 0) + 1
          return counts
        }, {}),
      ).toMatchObject({
        singleChoice: 1,
        shortAnswer: 3,
        predict: 3,
        pythonCode: 1,
      })
      // The full-problem Python solve always closes the trial.
      expect(first.lesson.steps.at(-1)?.assessment?.kind).toBe('pythonCode')
      expect(
        first.lesson.steps.map((step) => ({
          stepId: step.id,
          assessmentId: step.assessment?.id,
          prompt: step.prompt,
        })),
      ).toEqual(
        second.lesson.steps.map((step) => ({
          stepId: step.id,
          assessmentId: step.assessment?.id,
          prompt: step.prompt,
        })),
      )
    }
  }, 30_000)

  it('rotates representative problems without losing track coverage', async () => {
    const first = await buildRealmBossAssessment('realm1', { formIndex: 0 })
    const rotated = await buildRealmBossAssessment('realm1', { formIndex: 1 })

    expect(rotated.selections.map(({ trackId }) => trackId)).toEqual(
      first.selections.map(({ trackId }) => trackId),
    )
    expect(rotated.selections.map(({ problemId }) => problemId)).not.toEqual(
      first.selections.map(({ problemId }) => problemId),
    )
  })
})

describe('realm boss assessment gate', () => {
  it('fails at 79 and passes at 80 only with open-ended evidence', () => {
    expect(evaluateRealmAssessmentGate(79, true)).toMatchObject({
      passed: false,
      combatCounts: false,
    })
    expect(evaluateRealmAssessmentGate(80, false)).toMatchObject({
      scorePassed: true,
      passed: false,
      combatCounts: false,
    })
    expect(evaluateRealmAssessmentGate(80, true)).toMatchObject({
      passed: true,
      combatCounts: true,
    })
  })

  it('blocks combat when any required typed retrieval was missed', async () => {
    const assessment = await buildRealmBossAssessment('realm2')
    const clean = realmAssessmentOutcome(
      resultFor(assessment, 100),
      assessment,
    )
    expect(clean).toMatchObject({
      openEndedTransferPassed: true,
      combatCounts: true,
    })

    const missedOpen = realmAssessmentOutcome(
      resultFor(assessment, 100, assessment.requiredOpenEndedStepIds[1]),
      assessment,
    )
    expect(missedOpen).toMatchObject({
      scorePassed: true,
      openEndedTransferPassed: false,
      passed: false,
      combatCounts: false,
    })
  })

  it('excludes wrong retry telemetry before linking a successful answer', async () => {
    const assessment = await buildRealmBossAssessment('realm1')
    const step = assessment.lesson.steps.find(
      ({ id }) => !assessment.requiredOpenEndedStepIds.includes(id),
    )!
    const evidenceKinds = [step.assessment!.evidenceKind] as const
    const result = {
      ...resultFor(assessment, 100),
      assessmentEvidence: [
        {
          eventId: 'event:wrong-retry',
          interactionId: 'interaction:one',
          occurredAt: '2026-07-11T12:00:00.000Z',
          assessmentId: step.assessment!.id,
          assessmentKind: step.assessment!.kind,
          stepId: step.id,
          evidenceKinds,
          isCorrect: false,
          resolved: false,
          firstTry: true,
          usedHint: false,
          revealed: false,
        },
        {
          eventId: 'event:successful-answer',
          interactionId: 'interaction:one',
          occurredAt: '2026-07-11T12:01:00.000Z',
          assessmentId: step.assessment!.id,
          assessmentKind: step.assessment!.kind,
          stepId: step.id,
          evidenceKinds,
          isCorrect: true,
          resolved: true,
          firstTry: false,
          usedHint: false,
          revealed: false,
        },
      ],
    } satisfies LessonResult

    expect(realmQuizEvidenceEventIds(result, assessment)).toEqual([
      'event:successful-answer',
    ])
  })
})
