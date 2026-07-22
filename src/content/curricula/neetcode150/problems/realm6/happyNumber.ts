import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const happyNumberMissionSeed = {
  slug: 'happy-number',
  estimatedMinutes: 19,
  mission: {
    title: 'The Cheerful Crystal Test',
    context:
      'A puzzle crystal changes a positive number by replacing it with the sum of the squares of its decimal digits. The crystal glows if this process reaches 1.',
    prompt:
      'Return true when the supplied number eventually reaches 1. Return false when its transformations repeat in a cycle that never reaches 1.',
  },
  objective:
    'Generate digit-square sums while a set detects a repeated state.',
  priorKnowledge: [
    'Division and remainder can separate decimal digits.',
    'A set can detect whether a state appeared earlier.',
    'A deterministic repeated state means the same cycle will repeat forever.',
  ],
  recognitionCue:
    'A repeated transformation either reaches a target or loops through an earlier state.',
  misconception:
    'Stopping only when the value grows or shrinks is unreliable because the sequence can change direction before cycling.',
  algorithmSteps: [
    {
      id: 'open-seen',
      instruction: 'Create an empty set of transformed numbers.',
    },
    {
      id: 'check-goal-repeat',
      instruction:
        'While the number is not 1, stop false if it is already in the set.',
    },
    {
      id: 'remember-state',
      instruction: 'Add the current number to the set.',
    },
    {
      id: 'sum-digit-squares',
      instruction:
        'Replace the number with the sum of every decimal digit squared.',
    },
    {
      id: 'report-glow',
      instruction: 'Return true when the number reaches 1.',
    },
  ],
  complexity: {
    time: 'O(log n) before a bounded cycle',
    space: 'O(log n)',
    explanation:
      'Each transformation reads the decimal digits; after the first step, possible sums are bounded by the digit count.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['state', 'digit squares', 'next'],
        [19, '1² + 9²', 82],
        [82, '8² + 2²', 68],
        [68, '6² + 8²', 100],
        [100, '1² + 0² + 0²', 1],
      ],
      highlightedCells: [{ row: 4, column: 2, label: 'goal' }],
    },
  },
  workedExample: {
    prompt:
      'Starting at 19 gives 82, then 68, then 100, then 1. No state repeats before the goal, so the crystal glows.',
    code: [
      '19 -> 1² + 9² = 82',
      '82 -> 8² + 2² = 68',
      '68 -> 6² + 8² = 100',
      '100 -> 1² + 0² + 0² = 1',
      'return True',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Remember 19 before calculating its next state.',
      'Remember 82 and 68 as the sequence continues.',
      '100 transforms directly to 1.',
      'Reaching 1 is the success condition.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[19, 82, 68, 100, 1]],
      columnLabels: ['start', 'step 1', 'step 2', 'step 3', 'goal'],
      highlightedCells: [{ row: 0, column: 4, label: 'glow' }],
    },
  },
  patternCheck: {
    prompt:
      'Why does seeing the same transformed number twice prove the crystal will never reach 1?',
    options: [
      {
        id: 'same-future',
        label: 'The same state always produces the same future sequence.',
      },
      {
        id: 'digits-sorted',
        label: 'Repeated states mean the digits are now sorted.',
      },
      {
        id: 'number-negative',
        label: 'A repeated state makes the number negative.',
      },
    ],
    correctOptionId: 'same-future',
    feedback: {
      correct: 'Exactly. A deterministic transformation repeats the entire loop.',
      incorrect: 'Digit order and sign do not explain why the future is trapped.',
      secondIncorrect:
        'If state x appeared before, transforming x again follows the exact same path.',
    },
    hints: [
      'The rule has no randomness.',
      'One input state always has one next state.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[4, 16, 37, 58, 89, 145, 42, 20, 4]],
      highlightedCells: [
        { row: 0, column: 0, label: 'first 4' },
        { row: 0, column: 8, label: 'repeat' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the data structure used to recognize that a transformed number has appeared before.',
    acceptedAnswers: ['set', 'a set', 'seen set', 'hash set', 'hashset', 'a hash set', 'python set'],
    placeholder: 'data structure',
    feedback: {
      correct: 'Right. A set gives a direct membership check for earlier states.',
      incorrect: 'Choose a structure built for fast membership tests.',
      secondIncorrect: 'Answer: a set.',
    },
    hints: [
      'Order does not matter.',
      'You only ask whether a state is already present.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Put the crystal-testing actions into a cycle-safe order.',
    feedback: {
      correct: 'The process now reaches 1 or stops at the first repeated state.',
      incorrect: 'A state must be checked for repetition before it is added again.',
      secondIncorrect:
        'Open seen, check goal/repeat, remember current, compute next, then report success.',
    },
    hints: [
      'Do not add the current number before asking whether it was seen.',
      'The digit-square step creates the next loop state.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies a positive integer in data["number"]. Return a JSON boolean showing whether repeated digit-square sums reach 1.',
    starterCode: `def solve(data):
    number = data["number"]
    seen = set()

    while number != 1:
        # TODO: reject a repeat, remember number, and build its digit-square sum.
        break

    return number == 1`,
    cases: {
      visibleExample: {
        input: { number: 19 },
        expected: true,
      },
      hiddenBoundary: {
        input: { number: 1 },
        expected: true,
      },
      hiddenAdversarial: {
        input: { number: 2 },
        expected: false,
      },
    },
    feedback: {
      correct: 'The crystal test now distinguishes a path to 1 from a closed cycle.',
      incorrect:
        'A number was misclassified. Recheck the digit loop, immediate goal, and repeated-state stop.',
      secondIncorrect:
        'Return False if number is in seen; otherwise add it and sum digit * digit using divmod.',
    },
    hints: [
      'Use while value > 0 and value, digit = divmod(value, 10).',
      'Build next_number separately before assigning number.',
      'A starting value of 1 should return True immediately.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[2, 4, 16, 37, 58, 89, 145, 42, 20, 4]],
      highlightedCells: [
        { row: 0, column: 1, label: 'cycle begins' },
        { row: 0, column: 9, label: 'repeat' },
      ],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(happyNumberMissionSeed)

export default problemLesson
