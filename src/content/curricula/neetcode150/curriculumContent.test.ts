import { describe, expect, it } from 'vitest'
import {
  compileProblemLesson,
  validateProblemLesson,
} from '../problemLessonCompiler'
import type { PythonCodeAssessmentV1 } from '../../../types/assessment'
import { assessmentEvidenceKinds } from '../../../types/assessment'
import { NEETCODE_150_MANIFEST } from './manifest'
import {
  listRegisteredProblemLessons,
  loadProblemLesson,
} from './problemRegistry'

const canonicalIds = NEETCODE_150_MANIFEST.problems
  .map(({ id }) => id)
  .sort()

async function loadAll() {
  return Promise.all(
    NEETCODE_150_MANIFEST.problems.map(async (problem) => {
      const spec = await loadProblemLesson(problem.id)
      if (!spec) throw new Error(`Missing mission loader for ${problem.id}`)
      return { problem, spec }
    }),
  )
}

describe('complete NeetCode 150 mission curriculum', () => {
  it('registers exactly one lazy mission for every manifest problem', () => {
    expect(listRegisteredProblemLessons()).toEqual(canonicalIds)
  })

  it('loads, validates, and deterministically compiles all 150 missions', async () => {
    const missions = await loadAll()
    expect(missions).toHaveLength(150)

    for (const { problem, spec } of missions) {
      expect(spec.problemId).toBe(problem.id)
      expect(validateProblemLesson(spec, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      expect(
        compileProblemLesson(spec, NEETCODE_150_MANIFEST, {
          seed: 'curriculum-release-v1',
        }),
      ).toMatchObject({
        id: problem.id,
        contentRef: { problemId: problem.id },
      })
    }
  }, 30_000)

  it('provides every mastery evidence stage and three code case classes', async () => {
    const missions = await loadAll()
    const missionTitles = new Set<string>()

    for (const { problem, spec } of missions) {
      const variant = spec.variants[0]
      expect(variant).toBeDefined()
      missionTitles.add(variant.explanation.hook ?? '')
      expect(variant.explanation.prompt.trim()).not.toBe(problem.title)

      const assessments = variant.assessments.map(({ assessment }) => assessment)
      expect(new Set(assessments.map(({ evidenceKind }) => evidenceKind))).toEqual(
        new Set([
          'acquisition',
          'delayed-retrieval',
          'independent-transfer',
          'code-tests',
        ]),
      )

      const python = assessments.find(
        (assessment): assessment is PythonCodeAssessmentV1 =>
          assessment.kind === 'pythonCode',
      )
      expect(python).toBeDefined()
      expect(python!.cases.length).toBeGreaterThanOrEqual(3)
      expect(python!.cases.some(({ visibility }) => visibility === 'example')).toBe(
        true,
      )
      expect(python!.cases.filter(({ visibility }) => visibility === 'hidden').length)
        .toBeGreaterThanOrEqual(2)
      expect(python!.starterCode).toContain('def solve(data):')

      const reconstruction = assessments.find(
        ({ kind }) => kind === 'predict',
      )
      expect(assessmentEvidenceKinds(reconstruction!)).toEqual([
        'acquisition',
      ])
      expect(assessmentEvidenceKinds(python!)).toEqual([
        'independent-transfer',
        'code-tests',
      ])
    }

    expect(missionTitles.size).toBe(150)
    expect(missionTitles.has('')).toBe(false)
  }, 30_000)
})
