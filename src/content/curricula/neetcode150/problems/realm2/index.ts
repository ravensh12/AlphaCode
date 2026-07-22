import type { ProblemLessonLoader } from '../../problemRegistry'

export type Realm2ProblemId =
  | 'problem:valid-parentheses'
  | 'problem:min-stack'
  | 'problem:evaluate-reverse-polish-notation'
  | 'problem:generate-parentheses'
  | 'problem:daily-temperatures'
  | 'problem:car-fleet'
  | 'problem:largest-rectangle-in-histogram'
  | 'problem:binary-search'
  | 'problem:search-a-2d-matrix'
  | 'problem:koko-eating-bananas'
  | 'problem:find-minimum-in-rotated-sorted-array'
  | 'problem:search-in-rotated-sorted-array'
  | 'problem:time-based-key-value-store'
  | 'problem:median-of-two-sorted-arrays'
  | 'problem:reverse-linked-list'
  | 'problem:merge-two-sorted-lists'
  | 'problem:reorder-list'
  | 'problem:remove-nth-node-from-end-of-list'
  | 'problem:copy-list-with-random-pointer'
  | 'problem:add-two-numbers'
  | 'problem:linked-list-cycle'
  | 'problem:find-the-duplicate-number'
  | 'problem:lru-cache'
  | 'problem:merge-k-sorted-lists'
  | 'problem:reverse-nodes-in-k-group'

/** Lazy loaders for every mission owned by Ordered Structures (Realm 2). */
export const REALM_2_PROBLEM_LESSON_LOADERS = {
  'problem:valid-parentheses': () => import('./validParentheses'),
  'problem:min-stack': () => import('./minStack'),
  'problem:evaluate-reverse-polish-notation': () =>
    import('./evaluateReversePolishNotation'),
  'problem:generate-parentheses': () => import('./generateParentheses'),
  'problem:daily-temperatures': () => import('./dailyTemperatures'),
  'problem:car-fleet': () => import('./carFleet'),
  'problem:largest-rectangle-in-histogram': () =>
    import('./largestRectangleInHistogram'),
  'problem:binary-search': () => import('./binarySearch'),
  'problem:search-a-2d-matrix': () => import('./searchA2dMatrix'),
  'problem:koko-eating-bananas': () => import('./kokoEatingBananas'),
  'problem:find-minimum-in-rotated-sorted-array': () =>
    import('./findMinimumInRotatedSortedArray'),
  'problem:search-in-rotated-sorted-array': () =>
    import('./searchInRotatedSortedArray'),
  'problem:time-based-key-value-store': () =>
    import('./timeBasedKeyValueStore'),
  'problem:median-of-two-sorted-arrays': () =>
    import('./medianOfTwoSortedArrays'),
  'problem:reverse-linked-list': () => import('./reverseLinkedList'),
  'problem:merge-two-sorted-lists': () => import('./mergeTwoSortedLists'),
  'problem:reorder-list': () => import('./reorderList'),
  'problem:remove-nth-node-from-end-of-list': () =>
    import('./removeNthNodeFromEndOfList'),
  'problem:copy-list-with-random-pointer': () =>
    import('./copyListWithRandomPointer'),
  'problem:add-two-numbers': () => import('./addTwoNumbers'),
  'problem:linked-list-cycle': () => import('./linkedListCycle'),
  'problem:find-the-duplicate-number': () =>
    import('./findTheDuplicateNumber'),
  'problem:lru-cache': () => import('./lruCache'),
  'problem:merge-k-sorted-lists': () => import('./mergeKSortedLists'),
  'problem:reverse-nodes-in-k-group': () =>
    import('./reverseNodesInKGroup'),
} satisfies Readonly<Record<Realm2ProblemId, ProblemLessonLoader>>
