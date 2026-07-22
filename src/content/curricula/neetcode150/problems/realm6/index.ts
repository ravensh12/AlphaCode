import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonLoader } from '../../problemRegistry'

/**
 * Realm-local lazy imports. The curriculum registry can consume this table
 * when Realm 6 is wired without eagerly evaluating any mission module.
 */
export const REALM_6_PROBLEM_LESSON_LOADERS = {
  'problem:insert-interval': () => import('./insertInterval'),
  'problem:merge-intervals': () => import('./mergeIntervals'),
  'problem:non-overlapping-intervals': () =>
    import('./nonOverlappingIntervals'),
  'problem:meeting-rooms': () => import('./meetingRooms'),
  'problem:meeting-rooms-ii': () => import('./meetingRoomsII'),
  'problem:minimum-interval-to-include-each-query': () =>
    import('./minimumIntervalToIncludeEachQuery'),
  'problem:rotate-image': () => import('./rotateImage'),
  'problem:spiral-matrix': () => import('./spiralMatrix'),
  'problem:set-matrix-zeroes': () => import('./setMatrixZeroes'),
  'problem:happy-number': () => import('./happyNumber'),
  'problem:plus-one': () => import('./plusOne'),
  'problem:powx-n': () => import('./powxN'),
  'problem:multiply-strings': () => import('./multiplyStrings'),
  'problem:detect-squares': () => import('./detectSquares'),
  'problem:single-number': () => import('./singleNumber'),
  'problem:number-of-1-bits': () => import('./numberOf1Bits'),
  'problem:counting-bits': () => import('./countingBits'),
  'problem:reverse-bits': () => import('./reverseBits'),
  'problem:missing-number': () => import('./missingNumber'),
  'problem:sum-of-two-integers': () => import('./sumOfTwoIntegers'),
  'problem:reverse-integer': () => import('./reverseInteger'),
} satisfies Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>
