import {
  arrayHighlightSteps,
  arrayScanSequence,
} from '../../lib/diagramSequences'
import {
  arrayDiagram,
  buildCountEvensTrace,
  buildFindMinTrace,
} from './traces'
import {
  buildFindMaxDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

/** Fixed arrays — every trace step is hand-verified. */
const TEACH_NUMS = [4, 9, 2, 7]
const QUIZ_EVENS = [5, 9, 2, 9]
const QUIZ_MIN = [8, 3, 1, 6]

export function generateArraysAndLoops() {
  return lessonShell(
    'arrays-and-loops',
    'Arrays & Loops',
    'Scan a list one item at a time — the first pattern NeetCode 150 builds on.',
    'Loop through every element',
    ['arrays', 'loops'],
    [
      exploreStep(
        'explore-what',
        'An array is an ordered row of values — like numbered lockers in a hallway.',
        'Each slot has a fixed position called an index. Python starts counting at 0, not 1 — so the first item is nums[0], not nums[1].',
        ['arrays'],
        arrayDiagram(TEACH_NUMS),
        [
          'Arrays store many values in one variable.',
          'Order matters — swapping items changes the array.',
          'Most NeetCode array problems start with a loop over indices or values.',
        ],
        arrayScanSequence(TEACH_NUMS, 'i'),
      ),
      exploreStep(
        'explore-swap',
        'Swapping exchanges two slots — the values trade places in the array.',
        'Watch indices 0 and 3 switch — the letters cross on the same slide.',
        ['arrays'],
        arrayDiagram(['a', 'b', 'c', 'd']),
        [
          'Swap = pick two indices and exchange their values.',
          'Order in the array changes — that is why swap is O(1).',
        ],
        [arrayDiagram(['a', 'b', 'c', 'd']), arrayDiagram(['d', 'b', 'c', 'a'])],
      ),
      exploreStep(
        'explore-index',
        `Index 0 is always the first slot. Here, nums[0] holds ${TEACH_NUMS[0]}.`,
        'Think of the index as the address — nums[0] means “go to slot 0 and read the value.” Negative indices work from the end, but interviews usually stick to 0 … len-1.',
        ['arrays'],
        arrayDiagram(TEACH_NUMS, 0),
        [
          `nums[1] = ${TEACH_NUMS[1]}, nums[2] = ${TEACH_NUMS[2]}, nums[3] = ${TEACH_NUMS[3]}.`,
          'Out-of-range indices crash — valid indices are 0 through len(nums)-1.',
        ],
        arrayHighlightSteps(TEACH_NUMS, [0, 1, 2, 3], 'idx'),
      ),
      exploreStep(
        'explore-length',
        `This array has ${TEACH_NUMS.length} items. The last index is ${TEACH_NUMS.length - 1}.`,
        'len(nums) counts elements. Loops often use range(len(nums)) or for num in nums to visit every slot exactly once.',
        ['arrays'],
        arrayDiagram(TEACH_NUMS, TEACH_NUMS.length - 1),
        [
          'There is no slot at index len(nums) — that is one past the end.',
          'Many bugs come from off-by-one errors at the last index.',
        ],
        arrayHighlightSteps(TEACH_NUMS, [0, TEACH_NUMS.length - 1], 'last'),
      ),
      exploreStep(
        'explore-loop',
        'A for loop visits every index in order — index 0, then 1, then 2, and so on.',
        'Each pass gives you the next value. The loop body runs once per element — that is linear O(n) time for n items.',
        ['arrays', 'loops'],
        arrayDiagram(TEACH_NUMS, 0, [{ index: 0, label: 'num' }]),
        [
          'for num in nums: reads values left to right.',
          'for i in range(len(nums)): uses explicit indices when you need them.',
        ],
        arrayScanSequence(TEACH_NUMS, 'num'),
      ),
      exploreStep(
        'explore-max',
        'To find the largest value, start with nums[0], then compare each new item.',
        'If the next number is bigger, update your running “largest so far.” You never need to sort — one pass is enough.',
        ['arrays', 'loops'],
        arrayDiagram(TEACH_NUMS, TEACH_NUMS.indexOf(Math.max(...TEACH_NUMS))),
        [
          'Running variable + loop = the scan template.',
          'Same skeleton works for min, count, sum, and “find first X.”',
        ],
        arrayHighlightSteps(TEACH_NUMS, [0, 1, 1, 1], 'max'),
      ),
      exploreStep(
        'explore-template',
        'The scan template: initialize an answer, loop through the array, update the answer when a condition is met.',
        'Find max, count evens, check if any value equals k — all variants of the same loop structure you are about to watch.',
        ['arrays', 'loops'],
        arrayDiagram(TEACH_NUMS),
        [
          '1) Pick a starting answer.',
          '2) Loop each element.',
          '3) Update answer when the test passes.',
        ],
        arrayScanSequence(TEACH_NUMS, 'i'),
      ),
      conceptStep(
        'concept',
        'Almost every array problem on NeetCode starts here: loop through the list, update an answer as you go.',
        'Next is a line-by-line walkthrough of find-max — watch the diagram and variables update. Nothing is graded until the quiz.',
        ['arrays', 'loops'],
        arrayDiagram(TEACH_NUMS, 0),
        arrayScanSequence(TEACH_NUMS, 'i', 3),
      ),
      ...buildFindMaxDemo(TEACH_NUMS),
      thinkPatternCheck(
        'check-pattern',
        'After watching the walkthrough, what pattern did the code use on every index?',
        'Scan the whole list',
        'You visited each index once and updated a running answer — that is the basic scan pattern you will practice in the quiz.',
        ['arrays', 'loops'],
      ),

      quizIntroStep(
        'You traced find-max line by line. The quiz asks you to trace two new problems the same way.',
        'Walk through every index — no shortcuts. Each question runs the code step by step.',
        ['arrays', 'loops'],
      ),
      buildCountEvensTrace(
        QUIZ_EVENS,
        'quiz-evens-trace',
        'quiz',
        [
          'Test each number with num % 2 == 0.',
          'Only increment count when the test is True.',
        ],
      ),
      buildFindMinTrace(QUIZ_MIN, 'quiz-min-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'What pattern did every solution in this lesson use?',
        'Scan the whole list',
        ['Sort the list first', 'Guess randomly', 'Use a hash map'],
        {
          correct: 'Right — loop + compare/count is the basic scan pattern.',
          incorrect: 'Every answer walked through each element once.',
          secondIncorrect: 'You checked each item one by one — that is scanning.',
        },
        ['arrays', 'loops'],
      ),
    ],
  )
}
