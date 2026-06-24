import type { LessonSummary } from '../types/lesson'

/**
 * Six core pattern lessons — the beginner path before NeetCode 150.
 * Each topic: interactive lesson → quiz → NeetCode-style readiness.
 */
export const LESSON_CATALOG: LessonSummary[] = [
  {
    id: 'arrays-and-loops',
    title: 'Arrays & Loops',
    subtitle: 'Scan through lists one item at a time.',
    pattern: 'Loop through every element',
    practiceGoal: 'Find max, count evens',
    conceptTags: ['arrays', 'loops'],
    playable: true,
    unlockRequirements: {},
  },
  {
    id: 'strings',
    title: 'Strings',
    subtitle: 'Index, loop, and compare characters.',
    pattern: 'Loop through characters',
    practiceGoal: 'Palindrome basics',
    conceptTags: ['strings', 'loops'],
    playable: true,
    unlockRequirements: {
      previousLessonId: 'arrays-and-loops',
      minimumMastery: 75,
    },
  },
  {
    id: 'hash-maps',
    title: 'Hash Maps',
    subtitle: 'Remember what you have seen — the Two Sum idea.',
    pattern: 'Store → lookup in O(1)',
    practiceGoal: 'Two Sum intro',
    conceptTags: ['hashMaps'],
    playable: true,
    unlockRequirements: { previousLessonId: 'strings', minimumMastery: 75 },
  },
  {
    id: 'two-pointers',
    title: 'Two Pointers',
    subtitle: 'Move through data efficiently from both ends.',
    pattern: 'Left + right moving inward',
    practiceGoal: 'Sorted pair sum, palindrome check',
    conceptTags: ['twoPointers', 'strings'],
    playable: true,
    unlockRequirements: { previousLessonId: 'hash-maps', minimumMastery: 75 },
  },
  {
    id: 'stacks',
    title: 'Stacks',
    subtitle: 'Last in, first out — brackets and matching.',
    pattern: 'Push / pop from the top',
    practiceGoal: 'Valid parentheses',
    conceptTags: ['stacks'],
    playable: true,
    unlockRequirements: { previousLessonId: 'two-pointers', minimumMastery: 75 },
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    subtitle: 'Cut the search space in half each step.',
    pattern: 'Eliminate half each guess',
    practiceGoal: 'Search in a sorted array',
    conceptTags: ['binarySearch', 'arrays'],
    playable: true,
    unlockRequirements: { previousLessonId: 'stacks', minimumMastery: 75 },
  },
]

export const FIRST_LESSON_ID = LESSON_CATALOG[0].id
export const MASTERY_UNLOCK_THRESHOLD = 75
