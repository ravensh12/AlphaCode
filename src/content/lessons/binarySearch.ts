import { buildBinarySearchTrace } from './traces'
import { binarySearchNarrowingSequence } from '../../lib/diagramSequences'
import {
  buildBinarySearchDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

const SORTED = [1, 3, 5, 7, 9, 11, 13, 15]
const QUIZ_TARGET = 11
/** Target that needs several halving steps so in-slide animation has multiple beats. */
const BS_ANIM_TARGET = 13
const BS_TEACH_SEQUENCE = binarySearchNarrowingSequence(SORTED, BS_ANIM_TARGET, 4)

export function generateBinarySearch() {
  return lessonShell(
    'binary-search',
    'Binary Search',
    'Cut the search space in half each step — only works on sorted data.',
    'Eliminate half each guess',
    ['binarySearch', 'arrays'],
    [
      exploreStep(
        'explore-guess',
        'Guessing 1–100? Start at 50 — each guess eliminates half the possibilities.',
        'Binary search does the same on sorted data: pick the middle, then discard half.',
        ['binarySearch'],
        {
          kind: 'binarySearch',
          values: SORTED,
          low: 0,
          high: SORTED.length - 1,
          mid: 3,
        },
        undefined,
        BS_TEACH_SEQUENCE,
      ),
      exploreStep(
        'explore-sorted',
        'Binary search only works when data is sorted — order tells you which half to discard.',
        'If the middle value is too small, everything to the left is too small too.',
        ['binarySearch'],
        {
          kind: 'binarySearch',
          values: SORTED,
          low: 0,
          high: SORTED.length - 1,
          mid: 3,
        },
        undefined,
        BS_TEACH_SEQUENCE,
      ),
      exploreStep(
        'explore-bounds',
        'low and high mark the search window. mid = (low + high) // 2 picks the middle index.',
        'Each step narrows low/high until you find the target or the window is empty.',
        ['binarySearch'],
        {
          kind: 'binarySearch',
          values: SORTED,
          low: 0,
          high: SORTED.length - 1,
          mid: 3,
        },
        undefined,
        BS_TEACH_SEQUENCE,
      ),
      conceptStep(
        'concept',
        'Each step cuts the remaining search space in half — fast on big sorted lists.',
        'Compare nums[mid] to the target, then move low or high inward.',
        ['binarySearch'],
        {
          kind: 'binarySearch',
          values: SORTED,
          low: 0,
          high: SORTED.length - 1,
          mid: 3,
        },
        BS_TEACH_SEQUENCE,
      ),
      ...buildBinarySearchDemo(SORTED, BS_ANIM_TARGET),
      thinkPatternCheck(
        'check-sorted',
        'Why must data be sorted for binary search?',
        'To safely eliminate half',
        'Without order, you cannot know which half might still contain the answer.',
        ['binarySearch'],
      ),

      quizIntroStep(
        'Trace binary search for a new target — watch low, high, and mid update each step.',
        'Halve the search range every iteration.',
        ['binarySearch'],
      ),
      buildBinarySearchTrace(SORTED, QUIZ_TARGET, 'quiz-bs-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'What is the main advantage of binary search over scanning every element?',
        'It eliminates half the search space each step',
        ['It works on unsorted data', 'It never uses comparisons', 'It uses a hash map'],
        {
          correct: 'Right — O(log n) vs O(n) because you discard half each time.',
          incorrect: 'Each mid comparison cuts the remaining indices in half.',
          secondIncorrect: 'Halving the range is what makes it fast.',
        },
        ['binarySearch'],
      ),
    ],
    { previousLessonId: 'stacks', minimumMastery: 75 },
  )
}
