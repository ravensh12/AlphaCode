import { describe, expect, it } from 'vitest'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  validateProblemLesson,
} from '../../../problemLessonCompiler'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import type { ProblemLessonLoaderResult } from '../../problemRegistry'
import {
  REALM_1_PROBLEM_LESSON_LOADERS,
  type Realm1ProblemId,
} from './index'

const EXPECTED_REALM_1_IDS = [
  'problem:contains-duplicate',
  'problem:valid-anagram',
  'problem:two-sum',
  'problem:group-anagrams',
  'problem:top-k-frequent-elements',
  'problem:encode-and-decode-strings',
  'problem:product-of-array-except-self',
  'problem:valid-sudoku',
  'problem:longest-consecutive-sequence',
  'problem:valid-palindrome',
  'problem:two-sum-ii-input-array-is-sorted',
  'problem:3sum',
  'problem:container-with-most-water',
  'problem:trapping-rain-water',
  'problem:best-time-to-buy-and-sell-stock',
  'problem:longest-substring-without-repeating-characters',
  'problem:longest-repeating-character-replacement',
  'problem:permutation-in-string',
  'problem:minimum-window-substring',
  'problem:sliding-window-maximum',
] as const satisfies readonly Realm1ProblemId[]

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

describe('Realm 1 problem missions', () => {
  it('has one lazy loader for every manifest mission in the realm', () => {
    expect(Object.keys(REALM_1_PROBLEM_LESSON_LOADERS)).toEqual(
      EXPECTED_REALM_1_IDS,
    )

    const manifestIds = NEETCODE_150_MANIFEST.problems
      .filter(({ realmId }) => realmId === 'realm1')
      .map(({ id }) => id)
    expect(manifestIds).toEqual(EXPECTED_REALM_1_IDS)
  })

  it('loads and validates all twenty missions', async () => {
    for (const problemId of EXPECTED_REALM_1_IDS) {
      const lesson = unwrapLesson(
        await REALM_1_PROBLEM_LESSON_LOADERS[problemId](),
      )

      expect(lesson.problemId).toBe(problemId)
      expect(validateProblemLesson(lesson, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson)
    }
  })

  it('keeps the complete retrieval and transfer evidence arc', async () => {
    for (const problemId of EXPECTED_REALM_1_IDS) {
      const lesson = unwrapLesson(
        await REALM_1_PROBLEM_LESSON_LOADERS[problemId](),
      )
      const assessments = lesson.variants[0].assessments.map(
        ({ assessment }) => assessment,
      )

      expect(assessments.map(({ kind }) => kind)).toEqual([
        'singleChoice',
        'shortAnswer',
        'predict',
        'pythonCode',
      ])

      for (const assessment of assessments) {
        if (assessment.kind === 'singleChoice') {
          expect(assessment.options).toHaveLength(4)
        } else if (assessment.kind === 'shortAnswer') {
          expect(assessment.matcher.mode).toBe('normalized')
          if (assessment.matcher.mode !== 'normalized') {
            throw new Error(`${problemId} must use normalized retrieval answers`)
          }
          expect(assessment.matcher.acceptedAnswers.length).toBeGreaterThanOrEqual(
            3,
          )
        } else if (assessment.kind === 'predict') {
          expect(assessment.code.length).toBeGreaterThanOrEqual(5)
          expect(assessment.matcher.mode).toBe('normalized')
          if (assessment.matcher.mode !== 'normalized') {
            throw new Error(`${problemId} must use normalized rebuild answers`)
          }
          expect(assessment.matcher.acceptedAnswers.length).toBeGreaterThanOrEqual(
            5,
          )
        } else if (assessment.kind === 'pythonCode') {
          expect(assessment.starterCode.split('\n')).toContain(
            'def solve(data):',
          )
          expect(assessment.cases.length).toBeGreaterThanOrEqual(3)
          expect(assessment.cases[0].visibility).toBe('example')
          expect(
            assessment.cases.slice(1).every(({ visibility }) => visibility === 'hidden'),
          ).toBe(true)
          expect(
            assessment.cases.every(({ arguments: args }) => args.length === 1),
          ).toBe(true)
        }
      }
    }
  })

  it('keeps learner-facing copy original', async () => {
    const copiedSourceMarker =
      /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu

    for (const problemId of EXPECTED_REALM_1_IDS) {
      const lesson = unwrapLesson(
        await REALM_1_PROBLEM_LESSON_LOADERS[problemId](),
      )
      const variant = lesson.variants[0]
      const canonicalTitle =
        NEETCODE_150_MANIFEST.problems.find(({ id }) => id === problemId)
          ?.title ?? ''
      const prompts = [
        variant.explanation.prompt,
        variant.workedExample.prompt,
        variant.quizIntro.prompt,
        ...variant.assessments.map(({ prompt }) => prompt),
      ]

      expect(
        prompts.every(
          (prompt) =>
            prompt.trim().toLocaleLowerCase() !==
            canonicalTitle.toLocaleLowerCase(),
        ),
      ).toBe(true)
      expect(JSON.stringify(lesson)).not.toMatch(copiedSourceMarker)
    }
  })
})
