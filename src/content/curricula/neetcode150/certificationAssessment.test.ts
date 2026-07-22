import { describe, expect, it } from 'vitest'
import type { LessonResult } from '../../../hooks/useLessonEngine'
import { emptyBadgeCounts } from '../../badges'
import {
  CERTIFICATION_ITEM_BANK,
  buildCertificationAssessment,
  certificationAssessmentOutcome,
  evaluateCertificationGate,
} from './certificationAssessment'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from './index'

function resultFor(
  score: number,
  options?: {
    omitStepIds?: readonly string[]
    missedStepIds?: readonly string[]
  },
): LessonResult {
  const assessment = buildCertificationAssessment()
  const omitted = new Set(options?.omitStepIds ?? [])
  const missed = new Set(options?.missedStepIds ?? [])
  const steps = assessment.lesson.steps.filter(({ id }) => !omitted.has(id))
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
    stepReviews: steps.map((step) => ({
      id: step.id,
      prompt: step.prompt,
      code: step.code,
      targetVariables: step.targetVariables,
      expected: step.expectedState,
      assessmentAnswerLabel: step.assessment?.id,
      missed: missed.has(step.id),
    })),
  }
}

describe('NeetCode 150 certification bank', () => {
  it('covers 18 tracks with typed items plus a closing Python coding gauntlet', () => {
    const assessment = buildCertificationAssessment()

    expect(assessment.trackIds).toHaveLength(18)
    expect(new Set(assessment.trackIds).size).toBe(18)
    expect(assessment.lesson.steps).toHaveLength(42)
    expect(assessment.requiredOpenEndedStepIds).toHaveLength(18)

    const codeItems = assessment.stepMetadata.filter(
      ({ itemKind }) => itemKind === 'code-transfer',
    )
    expect(codeItems).toHaveLength(6)
    // The coding gauntlet closes the trial as its final section.
    expect(
      assessment.stepMetadata
        .slice(-codeItems.length)
        .every(({ itemKind }) => itemKind === 'code-transfer'),
    ).toBe(true)

    for (const trackId of assessment.trackIds) {
      const items = assessment.stepMetadata.filter(
        (metadata) => metadata.trackId === trackId,
      )
      const withoutCode = items.filter(
        ({ itemKind }) => itemKind !== 'code-transfer',
      )
      expect(withoutCode).toHaveLength(2)
      expect(withoutCode.map(({ itemKind }) => itemKind).sort()).toEqual([
        'open-transfer',
        'pattern-recognition',
      ])
      expect(
        items.filter(({ itemKind }) => itemKind === 'code-transfer').length,
      ).toBeLessThanOrEqual(1)
      expect(items.filter(({ requiredOpenEnded }) => requiredOpenEnded)).toHaveLength(
        1,
      )
    }
  })

  it('is mostly typed: every step takes typed text or real Python code', () => {
    const assessment = buildCertificationAssessment()
    const kinds = assessment.lesson.steps.map((step) => step.assessment?.kind)

    expect(kinds.filter((kind) => kind === 'shortAnswer')).toHaveLength(36)
    expect(kinds.filter((kind) => kind === 'pythonCode')).toHaveLength(6)
    expect(kinds.filter((kind) => kind === 'singleChoice')).toHaveLength(0)
  })

  it('uses stable unique IDs and only skills owned by each track', () => {
    const first = buildCertificationAssessment()
    const second = buildCertificationAssessment()
    const stepIds = first.lesson.steps.map(({ id }) => id)
    const assessmentIds = first.lesson.steps.map(
      (step) => step.assessment?.id,
    )

    expect(new Set(stepIds).size).toBe(stepIds.length)
    expect(new Set(assessmentIds).size).toBe(assessmentIds.length)
    expect(
      first.stepMetadata.map(
        ({ stepId, assessmentId, trackId, itemKind }) => ({
          stepId,
          assessmentId,
          trackId,
          itemKind,
        }),
      ),
    ).toEqual(
      second.stepMetadata.map(
        ({ stepId, assessmentId, trackId, itemKind }) => ({
          stepId,
          assessmentId,
          trackId,
          itemKind,
        }),
      ),
    )

    for (const metadata of first.stepMetadata) {
      const track = NEETCODE_150_TRACK_BY_ID.get(metadata.trackId)
      expect(track).toBeDefined()
      expect(metadata.skillIds.length).toBeGreaterThan(0)
      expect(
        metadata.skillIds.every((skillId) =>
          track?.skillIds.includes(skillId),
        ),
      ).toBe(true)
      expect(first.trackIdByStepId[metadata.stepId]).toBe(metadata.trackId)
    }
  })

  it('keeps original learner-facing prompts and deterministic interleaving', () => {
    const assessment = buildCertificationAssessment()
    const prompts = CERTIFICATION_ITEM_BANK.map(({ prompt }) => prompt)
    const canonicalTitles = new Set(
      NEETCODE_150_MANIFEST.problems.map(({ title }) => title),
    )

    expect(new Set(prompts).size).toBe(42)
    for (const item of CERTIFICATION_ITEM_BANK) {
      expect(item.prompt.length).toBeGreaterThan(40)
      expect(item.hint.length).toBeGreaterThan(20)
      expect(item.explanation.length).toBeGreaterThan(30)
      expect(canonicalTitles.has(item.prompt.trim())).toBe(false)
      expect(item.prompt).not.toMatch(/LeetCode|NeetCode problem/iu)
    }

    // The 36 typed items stay interleaved: recognition then distant transfer.
    for (let index = 0; index < 36; index += 2) {
      expect(assessment.stepMetadata[index]?.itemKind).toBe(
        'pattern-recognition',
      )
      expect(assessment.stepMetadata[index + 1]?.itemKind).toBe(
        'open-transfer',
      )
      expect(assessment.stepMetadata[index]?.trackId).not.toBe(
        assessment.stepMetadata[index + 1]?.trackId,
      )
    }
  })

  it('uses generous normalized matchers for typed items and locks hints', () => {
    const first = buildCertificationAssessment()
    const second = buildCertificationAssessment()

    for (let index = 0; index < first.lesson.steps.length; index += 1) {
      const step = first.lesson.steps[index]
      expect(step.hintPolicy).toEqual({ availableAfterAttempts: 1 })
      const assessment = step.assessment
      expect(assessment).toBeDefined()
      expect(second.lesson.steps[index]?.assessment).toEqual(assessment)
      if (assessment?.kind !== 'shortAnswer') continue
      expect(assessment.matcher.mode).toBe('normalized')
      if (assessment.matcher.mode !== 'normalized') continue
      const metadata = first.stepMetadataById[step.id]
      const minimumVariants =
        metadata?.itemKind === 'pattern-recognition' ? 5 : 2
      expect(
        assessment.matcher.acceptedAnswers.length,
        step.id,
      ).toBeGreaterThanOrEqual(minimumVariants)
    }
  })

  it('grades every coding-gauntlet solve with the shared Python judge boundary', () => {
    const assessment = buildCertificationAssessment()
    const pythonSteps = assessment.lesson.steps.filter(
      (step) => step.assessment?.kind === 'pythonCode',
    )

    expect(pythonSteps).toHaveLength(6)
    for (const step of pythonSteps) {
      const python = step.assessment
      if (python?.kind !== 'pythonCode') throw new Error('missing python step')
      expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
      expect(python.starterCode.split('\n')).toContain('def solve(data):')
      expect(python.cases.length).toBeGreaterThanOrEqual(3)
      expect(python.cases[0].visibility).toBe('example')
      expect(
        python.cases.slice(1).every(({ visibility }) => visibility === 'hidden'),
      ).toBe(true)
      expect(
        python.cases.every(({ arguments: args }) => args.length === 1),
      ).toBe(true)
      expect(python.failurePolicy).toMatchObject({ kind: 'retry' })
    }
  })
})

describe('NeetCode 150 certification outcome', () => {
  const allTracks = NEETCODE_150_MANIFEST.tracks.map(({ id }) => id)

  it('fails at 79 and passes the score boundary at 80', () => {
    expect(evaluateCertificationGate(79, allTracks, true)).toMatchObject({
      scorePassed: false,
      requirementsPassed: true,
      passed: false,
    })
    expect(evaluateCertificationGate(80, allTracks, true)).toMatchObject({
      scorePassed: true,
      requirementsPassed: true,
      passed: true,
    })
  })

  it('fails a high score when one track is missing', () => {
    const assessment = buildCertificationAssessment()
    const missingTrack = assessment.trackIds[7]
    const outcome = certificationAssessmentOutcome(
      resultFor(100, {
        omitStepIds: assessment.stepIdsByTrack[missingTrack],
      }),
      assessment,
    )

    expect(outcome).toMatchObject({
      scorePassed: true,
      trackCoveragePassed: false,
      requirementsPassed: false,
      passed: false,
    })
    expect(outcome.missingTrackIds).toContain(missingTrack)
  })

  it('fails when a required open transfer is missing or missed', () => {
    const assessment = buildCertificationAssessment()
    const requiredStepId = assessment.requiredOpenEndedStepIds[4]

    const missing = certificationAssessmentOutcome(
      resultFor(100, { omitStepIds: [requiredStepId] }),
      assessment,
    )
    expect(missing).toMatchObject({
      trackCoveragePassed: true,
      openEndedTransferPassed: false,
      passed: false,
    })

    const missed = certificationAssessmentOutcome(
      resultFor(100, { missedStepIds: [requiredStepId] }),
      assessment,
    )
    expect(missed).toMatchObject({
      scorePassed: true,
      openEndedTransferPassed: false,
      requirementsPassed: false,
      passed: false,
    })
  })

  it('passes only when score, track coverage, and clean transfers all pass', () => {
    const assessment = buildCertificationAssessment()
    expect(
      certificationAssessmentOutcome(resultFor(80), assessment),
    ).toMatchObject({
      score: 80,
      scorePassed: true,
      trackCoveragePassed: true,
      openEndedTransferPassed: true,
      requirementsPassed: true,
      passed: true,
    })
  })
})
