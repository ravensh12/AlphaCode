import type { ProblemLessonLoader } from '../../problemRegistry'

export type Realm1ProblemId =
  | 'problem:contains-duplicate'
  | 'problem:valid-anagram'
  | 'problem:two-sum'
  | 'problem:group-anagrams'
  | 'problem:top-k-frequent-elements'
  | 'problem:encode-and-decode-strings'
  | 'problem:product-of-array-except-self'
  | 'problem:valid-sudoku'
  | 'problem:longest-consecutive-sequence'
  | 'problem:valid-palindrome'
  | 'problem:two-sum-ii-input-array-is-sorted'
  | 'problem:3sum'
  | 'problem:container-with-most-water'
  | 'problem:trapping-rain-water'
  | 'problem:best-time-to-buy-and-sell-stock'
  | 'problem:longest-substring-without-repeating-characters'
  | 'problem:longest-repeating-character-replacement'
  | 'problem:permutation-in-string'
  | 'problem:minimum-window-substring'
  | 'problem:sliding-window-maximum'

export const REALM_1_PROBLEM_LESSON_LOADERS = {
  'problem:contains-duplicate': () => import('./containsDuplicate'),
  'problem:valid-anagram': () => import('./validAnagram'),
  'problem:two-sum': () => import('./twoSum'),
  'problem:group-anagrams': () => import('./groupAnagrams'),
  'problem:top-k-frequent-elements': () => import('./topKFrequentElements'),
  'problem:encode-and-decode-strings': () => import('./encodeAndDecodeStrings'),
  'problem:product-of-array-except-self': () =>
    import('./productOfArrayExceptSelf'),
  'problem:valid-sudoku': () => import('./validSudoku'),
  'problem:longest-consecutive-sequence': () =>
    import('./longestConsecutiveSequence'),
  'problem:valid-palindrome': () => import('./validPalindrome'),
  'problem:two-sum-ii-input-array-is-sorted': () =>
    import('./twoSumIiInputArrayIsSorted'),
  'problem:3sum': () => import('./threeSum'),
  'problem:container-with-most-water': () => import('./containerWithMostWater'),
  'problem:trapping-rain-water': () => import('./trappingRainWater'),
  'problem:best-time-to-buy-and-sell-stock': () =>
    import('./bestTimeToBuyAndSellStock'),
  'problem:longest-substring-without-repeating-characters': () =>
    import('./longestSubstringWithoutRepeatingCharacters'),
  'problem:longest-repeating-character-replacement': () =>
    import('./longestRepeatingCharacterReplacement'),
  'problem:permutation-in-string': () => import('./permutationInString'),
  'problem:minimum-window-substring': () => import('./minimumWindowSubstring'),
  'problem:sliding-window-maximum': () => import('./slidingWindowMaximum'),
} satisfies Readonly<Record<Realm1ProblemId, ProblemLessonLoader>>
