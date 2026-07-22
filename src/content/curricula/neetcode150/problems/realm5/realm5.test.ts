import { describe, expect, it } from 'vitest'
import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  createPythonJudgePlan,
  validatePythonJudgePlan,
} from '../../../../../lib/pythonJudgeHarness'
import {
  compileProblemLesson,
  validateProblemLesson,
} from '../../../problemLessonCompiler'
import {
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  resolveProblemMissionManifestContext,
} from '../../problemMissionFactory'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
} from '../../problemRegistry'
import { REALM_5_PROBLEM_LESSON_LOADERS } from './index'

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

function learnerCopy(spec: ProblemLessonSpecV1): readonly string[] {
  const variant = spec.variants[0]
  const passive = [
    variant.explanation.prompt,
    variant.explanation.hook ?? '',
    variant.explanation.callout ?? '',
    ...(variant.explanation.bullets ?? []),
    variant.workedExample.prompt,
    ...(variant.workedExample.bullets ?? []),
    ...variant.workedExample.code,
  ]
  const assessed = variant.assessments.flatMap((step) => {
    const assessment = step.assessment
    const choices =
      assessment.kind === 'singleChoice'
        ? assessment.options.map(({ label }) => label)
        : assessment.kind === 'order'
          ? assessment.items.map(({ label }) => label)
          : []
    return [
      step.prompt,
      step.feedback.correct,
      step.feedback.incorrect,
      step.feedback.secondIncorrect ?? '',
      ...(step.hints ?? []),
      ...choices,
    ]
  })
  return [...passive, ...assessed].filter(Boolean)
}

describe('NeetCode 150 Realm 5 missions', () => {
  it('loads, validates, and compiles all 31 manifest missions', async () => {
    const manifestProblems = NEETCODE_150_MANIFEST.problems.filter(
      ({ realmId }) => realmId === 'realm5',
    )
    const manifestIds = manifestProblems.map(({ id }) => id)
    const loaderIds = Object.keys(REALM_5_PROBLEM_LESSON_LOADERS)

    expect(manifestProblems).toHaveLength(31)
    expect(loaderIds).toEqual(manifestIds)

    const entries = Object.entries(REALM_5_PROBLEM_LESSON_LOADERS) as [
      ProblemId,
      ProblemLessonLoader,
    ][]
    const loaded = await Promise.all(
      entries.map(async ([problemId, loader]) => ({
        problemId,
        spec: unwrapLesson(await loader()),
      })),
    )

    expect(loaded).toHaveLength(31)
    expect(new Set(loaded.map(({ spec }) => spec.problemId)).size).toBe(31)

    for (const { problemId, spec } of loaded) {
      expect(spec.problemId).toBe(problemId)
      expect(validateProblemLesson(spec, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      expect(() =>
        compileProblemLesson(spec, NEETCODE_150_MANIFEST, {
          seed: `realm5-test:${problemId}`,
        }),
      ).not.toThrow()
      expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)

      const slug = problemId.replace(/^problem:/u, '')
      const context = resolveProblemMissionManifestContext(slug)
      expect(context.problem.realmId).toBe('realm5')
      expect(context.problem.provenance).toMatchObject({
        promptsAndStatements: 'original',
        copiedSourceMaterial: false,
      })
      expect(context.provenanceSources.map(({ id }) => id)).toEqual([
        context.problem.provenance.primaryReferenceSourceId,
        context.problem.provenance.curriculumVerificationSourceId,
        ...context.problem.provenance.pedagogySourceIds,
      ])

      const variant = spec.variants[0]
      const stageIds = [
        variant.explanation.id,
        variant.workedExample.id,
        variant.quizIntro.id,
        ...variant.assessments.map(({ id }) => id),
      ].map((id) => id.replace(`step:${slug}:`, ''))
      expect(stageIds).toEqual(PROBLEM_MISSION_STAGE_ORDER)
      expect(variant.assessments.map(({ assessment }) => assessment.kind)).toEqual(
        ['singleChoice', 'shortAnswer', 'predict', 'pythonCode'],
      )

      expect(['array', 'grid']).toContain(variant.explanation.diagram?.kind)
      expect(variant.explanation.bullets?.some((line) =>
        line.startsWith('Recognition cue:'),
      )).toBe(true)
      expect(variant.explanation.callout).toMatch(/^Common trap:/u)
      expect(variant.workedExample.code.length).toBeGreaterThanOrEqual(4)
      expect(variant.workedExample.bullets?.length).toBeGreaterThanOrEqual(3)
      expect(variant.workedExample.diagram).toBeDefined()

      const [choiceStep, retrievalStep, rebuildStep, pythonStep] =
        variant.assessments
      const choice = choiceStep.assessment
      const retrieval = retrievalStep.assessment
      const rebuild = rebuildStep.assessment
      const python = pythonStep.assessment
      if (
        choice.kind !== 'singleChoice' ||
        retrieval.kind !== 'shortAnswer' ||
        rebuild.kind !== 'predict' ||
        python.kind !== 'pythonCode'
      ) {
        throw new Error(`Unexpected mission topology for ${problemId}`)
      }

      expect(choice.options).toHaveLength(4)
      expect(new Set(choice.options.map(({ label }) => label)).size).toBe(4)
      expect(
        choice.options.some(({ id }) => id === choice.correctOptionId),
      ).toBe(true)
      expect(retrieval.matcher.mode).toBe('normalized')
      if (retrieval.matcher.mode === 'normalized') {
        expect(retrieval.matcher.acceptedAnswers.length).toBeGreaterThanOrEqual(
          2,
        )
      }
      expect(rebuild.code.length).toBeGreaterThanOrEqual(5)
      expect(rebuild.matcher.mode).toBe('normalized')
      if (rebuild.matcher.mode === 'normalized') {
        expect(rebuild.matcher.acceptedAnswers.length).toBeGreaterThanOrEqual(5)
      }

      expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
      expect(python.starterCode.split('\n')).toContain('def solve(data):')
      expect(python.starterCode).toMatch(/\bpass\b/u)
      expect(python.cases).toHaveLength(3)
      expect(python.cases.map(({ id }) => id)).toEqual(
        PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
          (caseClass) => `case:${slug}:${caseClass}`,
        ),
      )
      expect(python.cases.map(({ visibility }) => visibility)).toEqual([
        'example',
        'hidden',
        'hidden',
      ])
      expect(
        python.cases.every(
          ({ arguments: args }) =>
            args.length === 1 &&
            typeof args[0] === 'object' &&
            args[0] !== null &&
            !Array.isArray(args[0]),
        ),
      ).toBe(true)
      expect(validatePythonJudgePlan(createPythonJudgePlan(python))).toMatchObject(
        { valid: true },
      )

      const canonicalTitle = context.problem.title.trim().toLocaleLowerCase()
      expect(variant.explanation.hook?.trim().toLocaleLowerCase()).not.toBe(
        canonicalTitle,
      )
      const copiedSourceMarker =
        /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu
      expect(learnerCopy(spec).join('\n')).not.toMatch(copiedSourceMarker)
    }
  })
})
