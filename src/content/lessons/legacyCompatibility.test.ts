import { describe, expect, it } from 'vitest'
import { generateLesson } from './index'

const LEGACY_STEP_IDS = {
  'arrays-and-loops': [
    'explore-what',
    'explore-swap',
    'explore-index',
    'explore-length',
    'arrays-and-loops-checkpoint-0',
    'explore-loop',
    'explore-max',
    'explore-template',
    'concept',
    'demo-max-intro',
    'arrays-and-loops-checkpoint-1',
    'demo-max-step-0',
    'demo-max-step-1',
    'demo-max-step-2',
    'demo-max-step-3',
    'arrays-and-loops-checkpoint-2',
    'demo-max-step-4',
    'demo-max-step-5',
    'demo-max-step-6',
    'demo-max-step-7',
    'demo-max-step-8',
    'arrays-and-loops-checkpoint-3',
    'demo-max-step-9',
    'demo-max-outro',
    'check-pattern',
    'quiz-intro',
    'quiz-evens-trace',
    'quiz-min-trace',
    'quiz-pattern',
  ],
  strings: [
    'explore-chars',
    'explore-index',
    'explore-loop',
    'explore-vowel',
    'strings-checkpoint-0',
    'concept',
    'demo-vowels-intro',
    'demo-vowels-step-0',
    'demo-vowels-step-1',
    'demo-vowels-step-2',
    'strings-checkpoint-1',
    'demo-vowels-step-3',
    'demo-vowels-step-4',
    'demo-vowels-step-5',
    'demo-vowels-step-6',
    'strings-checkpoint-2',
    'demo-vowels-step-7',
    'demo-vowels-step-8',
    'demo-vowels-step-9',
    'demo-vowels-step-10',
    'demo-vowels-step-11',
    'strings-checkpoint-3',
    'demo-vowels-outro',
    'check-strings',
    'quiz-intro',
    'quiz-vowels-trace',
    'quiz-palindrome-trace',
    'quiz-pattern',
  ],
  'hash-maps': [
    'explore-locker',
    'explore-store',
    'explore-complement',
    'concept',
    'hash-maps-checkpoint-0',
    'demo-twosum-intro',
    'demo-twosum-step-0',
    'demo-twosum-step-1',
    'demo-twosum-step-2',
    'demo-twosum-step-3',
    'hash-maps-checkpoint-1',
    'demo-twosum-step-4',
    'demo-twosum-step-5',
    'demo-twosum-step-6',
    'demo-twosum-outro',
    'hash-maps-checkpoint-2',
    'check-signal',
    'quiz-intro',
    'quiz-twosum-trace',
    'quiz-pattern',
  ],
  'two-pointers': [
    'explore-walk',
    'explore-sorted',
    'concept',
    'demo-palindrome-intro',
    'two-pointers-checkpoint-0',
    'demo-palindrome-step-0',
    'demo-palindrome-step-1',
    'demo-palindrome-step-2',
    'demo-palindrome-step-3',
    'demo-palindrome-outro',
    'two-pointers-checkpoint-1',
    'check-when',
    'quiz-intro',
    'quiz-pair-trace',
    'quiz-pattern',
  ],
  stacks: [
    'explore-lifo',
    'explore-push',
    'explore-match',
    'concept',
    'stacks-checkpoint-0',
    'demo-brackets-intro',
    'demo-brackets-step-0',
    'demo-brackets-step-1',
    'demo-brackets-step-2',
    'demo-brackets-step-3',
    'stacks-checkpoint-1',
    'demo-brackets-outro',
    'check-lifo',
    'quiz-intro',
    'quiz-brackets-trace',
    'quiz-pattern',
  ],
  'binary-search': [
    'explore-guess',
    'explore-sorted',
    'explore-bounds',
    'concept',
    'binary-search-checkpoint-0',
    'demo-bs-intro',
    'demo-bs-step-0',
    'demo-bs-step-1',
    'demo-bs-step-2',
    'demo-bs-step-3',
    'binary-search-checkpoint-1',
    'demo-bs-step-4',
    'demo-bs-step-5',
    'demo-bs-step-6',
    'demo-bs-step-7',
    'binary-search-checkpoint-2',
    'demo-bs-step-8',
    'demo-bs-outro',
    'check-sorted',
    'quiz-intro',
    'quiz-bs-trace',
    'quiz-pattern',
  ],
} as const

describe('legacy lesson compatibility', () => {
  it.each(Object.entries(LEGACY_STEP_IDS))(
    'keeps %s step ids, counts, and legacy-only payloads',
    (lessonId, expectedStepIds) => {
      const lesson = generateLesson(lessonId)
      expect(lesson).toBeDefined()
      expect(lesson?.steps.map(({ id }) => id)).toEqual(expectedStepIds)
      expect(lesson?.steps).toHaveLength(expectedStepIds.length)
      expect(Object.hasOwn(lesson ?? {}, 'skillIds')).toBe(false)
      expect(Object.hasOwn(lesson ?? {}, 'contentRef')).toBe(false)

      for (const step of lesson?.steps ?? []) {
        expect(Object.hasOwn(step, 'skillIds')).toBe(false)
        expect(Object.hasOwn(step, 'contentRef')).toBe(false)
        expect(Object.hasOwn(step, 'assessment')).toBe(false)
        expect(Object.hasOwn(step, 'masteryId')).toBe(false)
        for (const frame of step.traceFrames ?? []) {
          expect(Object.hasOwn(frame, 'assessment')).toBe(false)
          expect(Object.hasOwn(frame, 'assessmentId')).toBe(false)
        }
      }
    },
  )
})
