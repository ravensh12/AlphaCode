import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const plusOneMissionSeed = {
  slug: 'plus-one',
  estimatedMinutes: 16,
  mission: {
    title: 'The Next Locker Code',
    context:
      'A maker club stores a very long locker counter as one decimal digit per JSON list cell, most significant digit first.',
    prompt:
      'Advance the counter by exactly one and return its digits without converting the whole list into one integer.',
  },
  objective:
    'Propagate a carry from the final decimal digit toward the front.',
  priorKnowledge: [
    'Adding one begins at the ones place.',
    'Nine plus one writes zero and carries one.',
    'A new leading digit is needed only when every processed digit carries.',
  ],
  recognitionCue:
    'A decimal number is represented as separate digits and needs a small arithmetic update.',
  misconception:
    'Always inserting a leading 1 is wrong; most inputs finish as soon as a digit below 9 is increased.',
  algorithmSteps: [
    {
      id: 'start-right',
      instruction: 'Begin at the final digit and scan toward the front.',
    },
    {
      id: 'finish-below-nine',
      instruction:
        'If the digit is below 9, add one and return the digits immediately.',
    },
    {
      id: 'carry-through-nine',
      instruction: 'Otherwise write 0 and continue carrying left.',
    },
    {
      id: 'prepend-one',
      instruction: 'If every digit became 0, place 1 at the front.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1) beyond output',
    explanation:
      'In the all-nines case the scan touches all n digits; other cases may stop earlier.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['hundreds', 'tens', 'ones'],
        [2, 4, 9],
        ['', 'carry 1', 'write 0'],
        [2, 5, 0],
      ],
      highlightedCells: [
        { row: 1, column: 2, label: 'start' },
        { row: 3, column: 1, label: 'carry stops' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Counter digits [2, 4, 9] start at the final 9. It becomes 0 and carries; 4 becomes 5, so the result is [2, 5, 0].',
    code: [
      'digits = [2, 4, 9]',
      '9 + 1 -> write 0, carry 1',
      '4 + 1 -> write 5, carry 0',
      'return [2, 5, 0]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The ones digit cannot hold 10, so it resets to 0.',
      'The carry moves one place left.',
      'Digit 4 accepts the carry without creating another.',
      'The unchanged leading 2 remains in place.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 4, 9],
        [2, 5, 0],
      ],
      rowLabels: ['before', 'after'],
      highlightedCells: [
        { row: 1, column: 1, label: '+1 lands here' },
        { row: 1, column: 2, label: 'carried through' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'When can the right-to-left scan return immediately?',
    options: [
      {
        id: 'digit-below-nine',
        label: 'After increasing the first encountered digit below 9.',
      },
      {
        id: 'after-every-digit',
        label: 'Only after rewriting every digit.',
      },
      {
        id: 'when-digit-zero',
        label: 'Only when the original ones digit is 0.',
      },
    ],
    correctOptionId: 'digit-below-nine',
    feedback: {
      correct: 'Yes. That digit absorbs the carry, so all digits to its left stay unchanged.',
      incorrect: 'Carry propagation ends at any digit from 0 through 8.',
      secondIncorrect:
        'Scan across trailing 9s; increment the first smaller digit and return.',
    },
    hints: [
      'Which digits create another carry when one is added?',
      'Only 9 must continue the carry.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[6, 3, 9, 9]],
      highlightedCells: [
        { row: 0, column: 1, label: 'carry stops' },
        { row: 0, column: 3, label: 'start' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type what an encountered 9 becomes while a carry continues left.',
    acceptedAnswers: ['0', 'zero', 'it becomes 0', 'write 0', 'becomes 0', 'it becomes zero'],
    placeholder: 'new digit',
    feedback: {
      correct: 'Correct. Ten leaves digit 0 and carries one.',
      incorrect: 'Think of the ones digit in 9 + 1 = 10.',
      secondIncorrect: 'Answer: 0.',
    },
    hints: [
      'The decimal place can store only one digit.',
      'The extra ten moves to the next place.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the counter update from the four shuffled actions.',
    feedback: {
      correct: 'The counter now handles short carries and an all-nines expansion.',
      incorrect: 'Decimal addition begins at the rightmost digit.',
      secondIncorrect:
        'Start right; stop below 9; otherwise write 0 and carry; prepend 1 only if needed.',
    },
    hints: [
      'The leading 1 is the final fallback.',
      'An early return happens when the carry stops.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["digits"] as a non-empty decimal digit list with no leading zero unless the number is zero. Return the list after adding one.',
    starterCode: `def solve(data):
    digits = list(data["digits"])

    for index in range(len(digits) - 1, -1, -1):
        # TODO: stop on a digit below 9 or carry through a 9.
        pass

    # TODO: handle the all-nines case.
    return digits`,
    cases: {
      visibleExample: {
        input: { digits: [2, 4, 9] },
        expected: [2, 5, 0],
      },
      hiddenBoundary: {
        input: { digits: [0] },
        expected: [1],
      },
      hiddenAdversarial: {
        input: { digits: [9, 9, 9] },
        expected: [1, 0, 0, 0],
      },
    },
    feedback: {
      correct: 'The locker counter advances correctly without integer conversion.',
      incorrect:
        'A carry failed. Check zero, trailing nines, and the all-nines expansion.',
      secondIncorrect:
        'If digits[index] < 9, increment and return; else write 0. After the loop return [1] + digits.',
    },
    hints: [
      'Loop indices from len(digits) - 1 down to 0.',
      'Return as soon as a digit below 9 is incremented.',
      'Reaching the loop end means every original digit was 9.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['', 9, 9, 9],
        [1, 0, 0, 0],
      ],
      rowLabels: ['before', 'after'],
      highlightedCells: [{ row: 1, column: 0, label: 'new leading place' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(plusOneMissionSeed)

export default problemLesson
