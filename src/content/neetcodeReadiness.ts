/** What NeetCode-style problems a learner is prepared for after each lesson. */
export type NeetCodeReadiness = {
  /** One-line summary of the pattern they just learned. */
  patternLearned: string
  /** Problem names they should feel ready to attempt (not copied from NeetCode). */
  readyFor: string[]
}

export const NEETCODE_READINESS: Record<string, NeetCodeReadiness> = {
  'arrays-and-loops': {
    patternLearned: 'Scanning a list with a loop',
    readyFor: [
      'Find Maximum Value',
      'Count Even Numbers',
      'Running Sum',
    ],
  },
  strings: {
    patternLearned: 'Indexing and comparing characters',
    readyFor: [
      'Valid Palindrome',
      'Reverse String',
      'First Unique Character',
    ],
  },
  'hash-maps': {
    patternLearned: 'Remembering values for fast lookup',
    readyFor: [
      'Two Sum',
      'Contains Duplicate',
      'Valid Anagram',
    ],
  },
  'two-pointers': {
    patternLearned: 'Moving two indices through data',
    readyFor: [
      'Valid Palindrome',
      'Two Sum II',
      'Remove Duplicates from Sorted Array',
    ],
  },
  stacks: {
    patternLearned: 'Last-in, first-out matching',
    readyFor: ['Valid Parentheses', 'Min Stack basics'],
  },
  'binary-search': {
    patternLearned: 'Halving a sorted search space',
    readyFor: [
      'Binary Search',
      'Search Insert Position',
      'First Bad Version',
    ],
  },
}

export const COURSE_TAGLINE = 'LeetCode prep course'
export const COURSE_POSITIONING = 'LeetCode prep course'

export function getNeetCodeReadiness(lessonId: string): NeetCodeReadiness | undefined {
  return NEETCODE_READINESS[lessonId]
}
