import { describe, expect, it } from 'vitest'
import type { AssessmentV1 } from '../../../../../types/assessment'
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
  PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT,
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  resolveProblemMissionManifestContext,
} from '../../problemMissionFactory'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
} from '../../problemRegistry'
import { REALM_4_PROBLEM_LESSON_LOADERS } from './index'

const REALM_4_PROBLEMS = NEETCODE_150_MANIFEST.problems.filter(
  ({ realmId }) => realmId === 'realm4',
)
const EXPECTED_PROBLEM_IDS = REALM_4_PROBLEMS.map(({ id }) => id).sort()
const LOADER_ENTRIES = Object.entries(
  REALM_4_PROBLEM_LESSON_LOADERS,
) as [ProblemId, ProblemLessonLoader][]

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

function assessmentLearnerText(assessment: AssessmentV1): readonly string[] {
  switch (assessment.kind) {
    case 'singleChoice':
      return [assessment.prompt, ...assessment.options.map(({ label }) => label)]
    case 'shortAnswer':
      return [
        assessment.prompt,
        assessment.placeholder ?? '',
        ...(assessment.matcher.mode === 'normalized'
          ? assessment.matcher.acceptedAnswers
          : []),
      ]
    case 'order':
      return [assessment.prompt, ...assessment.items.map(({ label }) => label)]
    case 'pythonCode':
      return [assessment.prompt, assessment.starterCode]
    case 'predict':
    case 'trace':
      return [assessment.prompt, ...assessment.code]
  }
}

function learnerText(spec: ProblemLessonSpecV1): readonly string[] {
  const variant = spec.variants[0]
  return [
    spec.description,
    spec.pattern,
    variant.explanation.hook ?? '',
    variant.explanation.prompt,
    variant.explanation.callout ?? '',
    ...(variant.explanation.bullets ?? []),
    variant.workedExample.prompt,
    ...variant.workedExample.code,
    ...(variant.workedExample.bullets ?? []),
    ...variant.assessments.flatMap((step) => [
      step.prompt,
      step.feedback.correct,
      step.feedback.incorrect,
      step.feedback.secondIncorrect ?? '',
      ...(step.hints ?? []),
      ...assessmentLearnerText(step.assessment),
    ]),
  ].filter((value) => value.length > 0)
}

describe('Realm 4 problem missions', () => {
  it('exports one typed lazy loader for all 28 manifest missions', () => {
    expect(REALM_4_PROBLEMS).toHaveLength(28)
    expect(LOADER_ENTRIES).toHaveLength(28)
    expect(LOADER_ENTRIES.map(([problemId]) => problemId).sort()).toEqual(
      EXPECTED_PROBLEM_IDS,
    )
    expect(
      REALM_4_PROBLEMS.map(({ trackId }) => trackId).every((trackId) =>
        ['backtracking', 'graphs', 'advanced-graphs'].includes(trackId),
      ),
    ).toBe(true)
  })

  it(
    'loads, validates, compiles, and preserves pinned metadata for every mission',
    async () => {
      for (const [problemId, loader] of LOADER_ENTRIES) {
        const lesson = unwrapLesson(await loader())
        const manifestProblem = REALM_4_PROBLEMS.find(
          ({ id }) => id === problemId,
        )
        expect(manifestProblem, problemId).toBeDefined()
        expect(
          validateProblemLesson(lesson, NEETCODE_150_MANIFEST),
          problemId,
        ).toEqual({ valid: true, issues: [] })
        expect(lesson, problemId).toMatchObject({
          curriculumId: NEETCODE_150_MANIFEST.id,
          manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
          problemId,
          problemContentVersion: manifestProblem?.contentVersion,
          skillIds: manifestProblem?.skillIds,
        })

        const compiled = compileProblemLesson(
          lesson,
          NEETCODE_150_MANIFEST,
          { seed: `realm4-${manifestProblem?.leetcodeSlug}` },
        )
        expect(compiled, problemId).toMatchObject({
          id: problemId,
          skillIds: manifestProblem?.skillIds,
          conceptTags: [],
          contentRef: {
            manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
            problemContentVersion: manifestProblem?.contentVersion,
          },
        })
        expect(
          compiled.steps.every((step) => step.conceptTags.length === 0),
          problemId,
        ).toBe(true)

        const context = resolveProblemMissionManifestContext(
          manifestProblem?.leetcodeSlug ?? '',
        )
        expect(context.problem.id, problemId).toBe(problemId)
        expect(
          context.provenanceSources.map(({ id }) => id),
          problemId,
        ).toEqual([
          context.problem.provenance.primaryReferenceSourceId,
          context.problem.provenance.curriculumVerificationSourceId,
          ...context.problem.provenance.pedagogySourceIds,
        ])
        expect(context.problem.provenance, problemId).toMatchObject({
          promptsAndStatements: 'original',
          copiedSourceMaterial: false,
        })
        expect(JSON.parse(JSON.stringify(lesson)), problemId).toEqual(lesson)
      }
    },
    20_000,
  )

  it(
    'provides the complete evidence arc, visuals, and judge cases for all missions',
    async () => {
      for (const [problemId, loader] of LOADER_ENTRIES) {
        const lesson = unwrapLesson(await loader())
        const slug = problemId.replace('problem:', '')
        const variant = lesson.variants[0]
        const stageIds = [
          variant.explanation.id,
          variant.workedExample.id,
          variant.quizIntro.id,
          ...variant.assessments.map(({ id }) => id),
        ].map((id) => id.replace(`step:${slug}:`, ''))

        expect(stageIds, problemId).toEqual(PROBLEM_MISSION_STAGE_ORDER)
        expect(
          variant.assessments.map(({ assessment }) => assessment.kind),
          problemId,
        ).toEqual(['singleChoice', 'shortAnswer', 'predict', 'pythonCode'])
        expect(
          variant.assessments.map(({ assessment }) => assessment.evidenceKind),
          problemId,
        ).toEqual([
          PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['pattern-check'],
          PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['typed-retrieval'],
          PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['algorithm-reconstruction'],
          PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['python-transfer'],
        ])

        expect(variant.explanation.diagram, problemId).toBeDefined()
        expect(variant.workedExample.diagram, problemId).toBeDefined()
        expect(variant.workedExample.code.length, problemId).toBeGreaterThanOrEqual(
          4,
        )
        expect(
          variant.workedExample.bullets?.length ?? 0,
          problemId,
        ).toBeGreaterThanOrEqual(4)
        expect(
          variant.assessments.every(({ diagram }) => diagram !== undefined),
          problemId,
        ).toBe(true)

        const [choiceStep, retrievalStep, orderStep, pythonStep] =
          variant.assessments
        if (choiceStep.assessment.kind !== 'singleChoice') {
          throw new Error(`${problemId} is missing its single-choice stage`)
        }
        if (retrievalStep.assessment.kind !== 'shortAnswer') {
          throw new Error(`${problemId} is missing its retrieval stage`)
        }
        if (retrievalStep.assessment.matcher.mode !== 'normalized') {
          throw new Error(`${problemId} must use normalized retrieval answers`)
        }
        if (orderStep.assessment.kind !== 'predict') {
          throw new Error(`${problemId} is missing its typed rebuild stage`)
        }
        if (pythonStep.assessment.kind !== 'pythonCode') {
          throw new Error(`${problemId} is missing its Python stage`)
        }

        expect(choiceStep.assessment.options.length, problemId).toBeGreaterThanOrEqual(
          4,
        )
        expect(
          retrievalStep.assessment.matcher.acceptedAnswers.length,
          problemId,
        ).toBeGreaterThanOrEqual(3)
        expect(orderStep.assessment.code.length, problemId).toBeGreaterThanOrEqual(
          6,
        )
        expect(pythonStep.assessment.entrypoint, problemId).toEqual({
          kind: 'function',
          name: 'solve',
        })
        expect(pythonStep.assessment.codecs, problemId).toEqual({
          arguments: [{ kind: 'json' }],
          result: { kind: 'json' },
        })
        expect(
          pythonStep.assessment.starterCode.split('\n'),
          problemId,
        ).toContain('def solve(data):')
        expect(pythonStep.assessment.starterCode, problemId).toContain('#')
        expect(
          pythonStep.assessment.cases.length,
          problemId,
        ).toBeGreaterThanOrEqual(3)
        expect(
          pythonStep.assessment.cases.map(({ id }) => id),
          problemId,
        ).toEqual(
          expect.arrayContaining(
          PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
            (caseClass) => `case:${slug}:${caseClass}`,
          ),
          ),
        )
        expect(pythonStep.assessment.cases[0].visibility, problemId).toBe(
          'example',
        )
        expect(
          pythonStep.assessment.cases
            .slice(1)
            .every(({ visibility }) => visibility === 'hidden'),
          problemId,
        ).toBe(true)
        expect(
          pythonStep.assessment.cases.every(
            ({ arguments: args }) =>
              args.length === 1 &&
              JSON.parse(JSON.stringify(args[0])) !== undefined,
          ),
          problemId,
        ).toBe(true)
        expect(
          validatePythonJudgePlan(createPythonJudgePlan(pythonStep.assessment)),
          problemId,
        ).toMatchObject({ valid: true, issues: [] })
      }
    },
    20_000,
  )

  it(
    'keeps all learner-facing mission copy original',
    async () => {
      const copiedSourceMarker =
        /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu

      for (const [problemId, loader] of LOADER_ENTRIES) {
        const lesson = unwrapLesson(await loader())
        const manifestProblem = REALM_4_PROBLEMS.find(
          ({ id }) => id === problemId,
        )
        const variant = lesson.variants[0]
        const prompts = [
          variant.explanation.hook ?? '',
          variant.explanation.prompt,
          variant.workedExample.prompt,
          ...variant.assessments.map(({ prompt }) => prompt),
        ]
        expect(
          prompts.every(
            (prompt) =>
              prompt.trim().toLocaleLowerCase() !==
              manifestProblem?.title.toLocaleLowerCase(),
          ),
          problemId,
        ).toBe(true)
        expect(learnerText(lesson).join('\n'), problemId).not.toMatch(
          copiedSourceMarker,
        )
      }
    },
    20_000,
  )
})
