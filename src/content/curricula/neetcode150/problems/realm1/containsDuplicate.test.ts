import { describe, expect, it } from 'vitest'
import type { AssessmentV1 } from '../../../../../types/assessment'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  createPythonJudgePlan,
  validatePythonJudgePlan,
  validatePythonJudgeSubmission,
} from '../../../../../lib/pythonJudgeHarness'
import {
  compileProblemLesson,
  validateProblemLesson,
} from '../../../problemLessonCompiler'
import {
  PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT,
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  createProblemMission,
  resolveProblemMissionManifestContext,
} from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'
import {
  listRegisteredProblemLessons,
  loadProblemLesson,
} from '../../problemRegistry'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import problemLesson, {
  containsDuplicateMissionSeed,
} from './containsDuplicate'

const SLUG = 'contains-duplicate'
const PROBLEM_ID = `problem:${SLUG}` as const

function assessmentLearnerText(assessment: AssessmentV1): readonly string[] {
  switch (assessment.kind) {
    case 'singleChoice':
      return [assessment.prompt, ...assessment.options.map(({ label }) => label)]
    case 'order':
      return [assessment.prompt, ...assessment.items.map(({ label }) => label)]
    case 'predict':
    case 'trace':
      return [assessment.prompt, ...assessment.code]
    case 'pythonCode':
      return [assessment.prompt, assessment.starterCode]
    case 'shortAnswer':
      return [assessment.prompt, assessment.placeholder ?? '']
  }
}

function learnerText(spec: ProblemLessonSpecV1): readonly string[] {
  const variant = spec.variants[0]
  const passiveSteps = [
    variant.explanation,
    variant.workedExample,
    variant.quizIntro,
  ]
  return [
    spec.description,
    spec.pattern,
    ...passiveSteps.flatMap((step) => [
      step.prompt,
      step.hook ?? '',
      step.callout ?? '',
      ...(step.bullets ?? []),
      ...(step.kind === 'workedExample' ? step.code : []),
    ]),
    ...variant.assessments.flatMap((step) => [
      step.prompt,
      step.hook ?? '',
      step.callout ?? '',
      step.feedback.correct,
      step.feedback.incorrect,
      step.feedback.secondIncorrect ?? '',
      ...(step.hints ?? []),
      ...(step.bullets ?? []),
      ...assessmentLearnerText(step.assessment),
    ]),
  ].filter((value) => value.length > 0)
}

describe('contains duplicate problem mission', () => {
  it('validates, compiles, and preserves manifest-owned metadata', () => {
    expect(validateProblemLesson(problemLesson, NEETCODE_150_MANIFEST)).toEqual({
      valid: true,
      issues: [],
    })

    const manifestProblem = NEETCODE_150_MANIFEST.problems.find(
      ({ id }) => id === PROBLEM_ID,
    )
    expect(manifestProblem).toBeDefined()
    expect(problemLesson).toMatchObject({
      curriculumId: NEETCODE_150_MANIFEST.id,
      manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
      problemId: manifestProblem?.id,
      problemContentVersion: manifestProblem?.contentVersion,
      skillIds: manifestProblem?.skillIds,
    })

    const context = resolveProblemMissionManifestContext(SLUG)
    const provenanceIds = [
      context.problem.provenance.primaryReferenceSourceId,
      context.problem.provenance.curriculumVerificationSourceId,
      ...context.problem.provenance.pedagogySourceIds,
    ]
    expect(context.provenanceSources.map(({ id }) => id)).toEqual(provenanceIds)
    expect(context.problem.provenance).toMatchObject({
      promptsAndStatements: 'original',
      copiedSourceMaterial: false,
    })

    const compiled = compileProblemLesson(
      problemLesson,
      NEETCODE_150_MANIFEST,
      { seed: 'nova-cadet', variantId: `variant:${SLUG}:core` },
    )
    expect(compiled).toMatchObject({
      id: PROBLEM_ID,
      skillIds: manifestProblem?.skillIds,
      conceptTags: [],
      contentRef: {
        manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
        problemContentVersion: manifestProblem?.contentVersion,
      },
    })
    expect(compiled.steps.every((step) => step.conceptTags.length === 0)).toBe(
      true,
    )
    expect(JSON.parse(JSON.stringify(problemLesson))).toEqual(problemLesson)
  })

  it('generates the complete stage order, evidence, and slug-based IDs', () => {
    const variant = problemLesson.variants[0]
    const stageIds = [
      variant.explanation.id,
      variant.workedExample.id,
      variant.quizIntro.id,
      ...variant.assessments.map(({ id }) => id),
    ].map((id) => id.replace(`step:${SLUG}:`, ''))

    expect(stageIds).toEqual(PROBLEM_MISSION_STAGE_ORDER)
    expect(variant.assessments.map(({ assessment }) => assessment.kind)).toEqual(
      ['singleChoice', 'shortAnswer', 'predict', 'pythonCode'],
    )
    expect(
      variant.assessments.map(({ assessment }) => assessment.evidenceKind),
    ).toEqual([
      PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['pattern-check'],
      PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['typed-retrieval'],
      PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['algorithm-reconstruction'],
      PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['python-transfer'],
    ])

    expect(variant.id).toBe(`variant:${SLUG}:core`)
    for (const step of variant.assessments) {
      expect(step.id).toMatch(new RegExp(`^step:${SLUG}:`))
      expect(step.assessment.id).toMatch(
        new RegExp(`^assessment:${SLUG}:`),
      )
      if (step.assessment.kind === 'singleChoice') {
        expect(
          step.assessment.options.every(({ id }) =>
            id.startsWith(`option:${SLUG}:`),
          ),
        ).toBe(true)
      }
      if (step.assessment.kind === 'order') {
        expect(
          step.assessment.items.every(({ id }) =>
            id.startsWith(`item:${SLUG}:`),
          ),
        ).toBe(true)
      }
      if (step.assessment.kind === 'pythonCode') {
        expect(
          step.assessment.cases.every(({ id }) =>
            id.startsWith(`case:${SLUG}:`),
          ),
        ).toBe(true)
      }
    }
  })

  it('compiles deterministically for the same learner seed', () => {
    const first = compileProblemLesson(
      problemLesson,
      NEETCODE_150_MANIFEST,
      { seed: 'cadet-1701' },
    )
    const second = compileProblemLesson(
      problemLesson,
      NEETCODE_150_MANIFEST,
      { seed: 'cadet-1701' },
    )

    expect(second).toEqual(first)
  })

  it('uses the shared JSON solve boundary and all required case classes', () => {
    const python = problemLesson.variants[0].assessments.find(
      ({ assessment }) => assessment.kind === 'pythonCode',
    )?.assessment
    if (python?.kind !== 'pythonCode') throw new Error('Python stage missing')

    expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
    expect(python.codecs).toEqual({
      arguments: [{ kind: 'json' }],
      result: { kind: 'json' },
    })
    expect(python.starterCode.split('\n')).toContain('def solve(data):')
    expect(python.cases.length).toBeGreaterThanOrEqual(3)
    expect(python.cases.every(({ arguments: args }) => args.length === 1)).toBe(
      true,
    )

    const mandatoryIds = PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
      (caseClass) => `case:${SLUG}:${caseClass}`,
    )
    expect(python.cases.map(({ id }) => id)).toEqual(
      expect.arrayContaining(mandatoryIds),
    )
    expect(
      python.cases.find(({ id }) => id.endsWith('visible-example'))?.visibility,
    ).toBe('example')
    expect(
      python.cases
        .filter(({ id }) => /hidden-(?:boundary|adversarial)$/u.test(id))
        .every(({ visibility }) => visibility === 'hidden'),
    ).toBe(true)
    for (const testCase of python.cases) {
      expect(testCase.arguments[0]).toMatchObject({
        badgeCodes: expect.any(Array),
      })
      expect(typeof testCase.expected).toBe('boolean')
    }

    expect(validatePythonJudgePlan(createPythonJudgePlan(python))).toMatchObject(
      { valid: true },
    )
    expect(
      validatePythonJudgeSubmission(python, {
        kind: 'pythonCode',
        code: `def solve(data):
    seen = set()
    for code in data["badgeCodes"]:
        if code in seen:
            return True
        seen.add(code)
    return False`,
      }),
    ).toMatchObject({ valid: true })
  })

  it('keeps prompts original and free of copied-source markers', () => {
    const canonicalTitle =
      NEETCODE_150_MANIFEST.problems.find(({ id }) => id === PROBLEM_ID)
        ?.title ?? ''
    const prompts = [
      problemLesson.variants[0].explanation.prompt,
      problemLesson.variants[0].workedExample.prompt,
      problemLesson.variants[0].quizIntro.prompt,
      ...problemLesson.variants[0].assessments.map(({ prompt }) => prompt),
    ]
    expect(
      prompts.every(
        (prompt) =>
          prompt.trim().toLocaleLowerCase() !==
          canonicalTitle.toLocaleLowerCase(),
      ),
    ).toBe(true)
    expect(problemLesson.variants[0].explanation.hook).toBe(
      'The Echoing Badge Alarm',
    )
    expect(problemLesson.variants[0].explanation.prompt).toContain(
      'Nova Station',
    )

    const copiedSourceMarker =
      /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu
    expect(learnerText(problemLesson).join('\n')).not.toMatch(
      copiedSourceMarker,
    )
  })

  it('is available through the lazy generated loader map', async () => {
    expect(listRegisteredProblemLessons()).toContain(PROBLEM_ID)
    await expect(loadProblemLesson(PROBLEM_ID)).resolves.toEqual(problemLesson)
  })

  it('rejects a nonstandard Python entrypoint and canonical mission title', () => {
    const wrongEntrypoint = structuredClone(
      containsDuplicateMissionSeed,
    ) as ProblemMissionSeed
    wrongEntrypoint.pythonChallenge.starterCode =
      'def inspect(data):\n    return False'
    expect(() => createProblemMission(wrongEntrypoint)).toThrow(
      /def solve\(data\)/u,
    )

    const canonicalTitle = structuredClone(
      containsDuplicateMissionSeed,
    ) as ProblemMissionSeed
    canonicalTitle.mission.title = 'Contains Duplicate'
    expect(() => createProblemMission(canonicalTitle)).toThrow(
      /mission\.title must be original/u,
    )
  })
})
