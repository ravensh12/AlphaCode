import { buildSortedPairTrace, arrayDiagram, stringDiagram } from './traces'
import { stringTwoPointerSteps } from '../../lib/diagramSequences'
import {
  buildPalindromeDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

const LEVEL = 'level'

export function generateTwoPointers() {
  return lessonShell(
    'two-pointers',
    'Two Pointers',
    'Start from both ends and move inward — perfect for palindromes and sorted arrays.',
    'Left + right moving inward',
    ['twoPointers', 'strings'],
    [
      exploreStep(
        'explore-walk',
        'Two pointers start at opposite ends — left at 0, right at the last index.',
        'Watch left and right compare each pair, then walk toward the center on "level".',
        ['twoPointers', 'strings'],
        stringDiagram(LEVEL, [
          { index: 0, label: 'left' },
          { index: 4, label: 'right' },
        ]),
        [
          'Compare s[left] and s[right] each step.',
          'If they match, move both pointers inward.',
        ],
        [
          stringDiagram(LEVEL, [
            { index: 0, label: 'left' },
            { index: 4, label: 'right' },
          ]),
          stringDiagram(LEVEL, [
            { index: 1, label: 'left' },
            { index: 3, label: 'right' },
          ], [0, 4]),
          stringDiagram(LEVEL, [{ index: 2, label: 'left' }], [0, 1, 3, 4]),
        ],
      ),
      exploreStep(
        'explore-sorted',
        'On sorted arrays, two pointers also work: compare the outermost pair, then adjust.',
        'Too small? move left up. Too big? move right down — watch the pointers react.',
        ['twoPointers', 'arrays'],
        arrayDiagram([1, 2, 3, 4, 6], undefined, [
          { index: 0, label: 'left' },
          { index: 4, label: 'right' },
        ]),
        undefined,
        [
          arrayDiagram([1, 2, 3, 4, 6], undefined, [
            { index: 0, label: 'left' },
            { index: 4, label: 'right' },
          ]),
          arrayDiagram([1, 2, 3, 4, 6], undefined, [
            { index: 1, label: 'left' },
            { index: 4, label: 'right' },
          ]),
          arrayDiagram([1, 2, 3, 4, 6], undefined, [
            { index: 2, label: 'left' },
            { index: 4, label: 'right' },
          ]),
        ],
      ),
      conceptStep(
        'concept',
        'Palindromes and sorted pair sums both use two indices walking toward each other.',
        'Watch a palindrome walkthrough — see left and right move each step.',
        ['twoPointers'],
        stringDiagram(LEVEL, [
          { index: 0, label: 'left' },
          { index: 4, label: 'right' },
        ]),
        stringTwoPointerSteps(LEVEL, [
          { left: 0, right: 4 },
          { left: 1, right: 3, visited: [0, 4] },
          { left: 2, right: 2, visited: [0, 1, 3, 4] },
        ]),
      ),
      ...buildPalindromeDemo(LEVEL),
      thinkPatternCheck(
        'check-when',
        'When is two pointers the right tool?',
        'Sorted or mirrored checks',
        'Palindromes and sorted pair sums — data with structure from both ends.',
        ['twoPointers'],
      ),

      quizIntroStep(
        'Trace a sorted pair sum — left and right move based on whether the total is too small or too big.',
        'Same pointer idea as palindromes, but on numbers.',
        ['twoPointers'],
      ),
      buildSortedPairTrace([1, 2, 3, 4, 6], 7, 'quiz-pair-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'Why does two pointers work on a sorted array?',
        'Each move rules out impossible pairs',
        ['It only works on strings', 'You never move the pointers', 'The array must be unsorted'],
        {
          correct: 'Right — if the sum is too small, increase left; too big, decrease right.',
          incorrect: 'Sorted order means you know which direction fixes the total.',
          secondIncorrect: 'Each pointer move eliminates candidates — that is why it works.',
        },
        ['twoPointers'],
      ),
    ],
    { previousLessonId: 'hash-maps', minimumMastery: 75 },
  )
}
