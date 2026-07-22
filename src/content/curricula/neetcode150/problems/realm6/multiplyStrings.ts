import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const multiplyStringsMissionSeed = {
  slug: 'multiply-strings',
  estimatedMinutes: 27,
  mission: {
    title: 'The Giant Ticket Counter',
    context:
      'A festival printer receives two nonnegative ticket counts as decimal strings because either count may be too long for its tiny number register.',
    prompt:
      'Return their product as a decimal string using digit-by-digit multiplication, without converting either complete input into an integer.',
  },
  objective:
    'Accumulate every digit product in an m + n place-value array, then normalize carries.',
  priorKnowledge: [
    'A character digit can become a small integer with ord or int.',
    'Multiplying an m-digit number by an n-digit number needs at most m + n digits.',
    'Grade-school multiplication aligns partial products by place value.',
  ],
  recognitionCue:
    'Very large nonnegative integers arrive as strings and arithmetic must happen per digit.',
  misconception:
    'Appending each pairwise digit product creates the wrong place values; products must accumulate in shared positions.',
  algorithmSteps: [
    {
      id: 'handle-zero',
      instruction: 'Return "0" immediately if either input string is "0".',
    },
    {
      id: 'open-places',
      instruction: 'Create an integer array of length left.length + right.length.',
    },
    {
      id: 'multiply-pairs',
      instruction:
        'Multiply every right-to-left digit pair and add it at their aligned low position.',
    },
    {
      id: 'carry-left',
      instruction:
        'Move quotient-by-10 left and keep remainder-by-10 in each position.',
    },
    {
      id: 'format-product',
      instruction: 'Skip leading zero storage and join the digits as a string.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(m + n)',
    explanation:
      'Every pair of m and n digits is multiplied once, and the place-value array has m + n cells.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['', '', 1, 2, 3],
        ['×', '', '', 4, 5],
        ['partial', '', 6, 1, 5],
        ['partial', 4, 9, 2, 0],
        ['sum', 5, 5, 3, 5],
      ],
      highlightedCells: [{ row: 4, column: 2, label: 'product' }],
    },
  },
  workedExample: {
    prompt:
      'For "123" times "45", multiplying by 5 gives 615 and multiplying by 4 tens gives 4920. Their aligned sum is "5535".',
    code: [
      '123 × 5  = 615',
      '123 × 40 = 4920',
      '615 + 4920 = 5535',
      'return "5535"',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Each digit pair contributes to a position based on its distance from the right edge.',
      'Contributions sharing a position are added before final formatting.',
      'Carry normalization keeps every output position from 0 through 9.',
      'Leading storage zeroes are omitted, but a true zero product is returned as "0".',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['thousands', 'hundreds', 'tens', 'ones'],
        [5, 5, 3, 5],
      ],
      highlightedCells: [
        { row: 1, column: 0, label: '5 thousands' },
        { row: 1, column: 3, label: '5 ones' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'How large must the digit storage be before multiplying an m-digit string by an n-digit string?',
    options: [
      {
        id: 'm-plus-n',
        label: 'm + n positions.',
      },
      {
        id: 'larger-only',
        label: 'Only max(m, n) positions.',
      },
      {
        id: 'm-times-n',
        label: 'm × n output positions.',
      },
    ],
    correctOptionId: 'm-plus-n',
    feedback: {
      correct: 'Yes. The product has at most the sum of the input digit counts.',
      incorrect: 'That size confuses work count with the maximum number of product digits.',
      secondIncorrect:
        'Allocate [0] * (len(left) + len(right)).',
    },
    hints: [
      'A two-digit number times a three-digit number has at most five digits.',
      'The nested loop count is not the output length.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['left digits', 'm = 3'],
        ['right digits', 'n = 2'],
        ['storage', 'm + n = 5'],
      ],
      highlightedCells: [{ row: 2, column: 1, label: 'five cells' }],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the two operations that split a place total into a carry and one output digit.',
    acceptedAnswers: [
      'division by 10 and remainder by 10',
      '// 10 and % 10',
      'quotient by 10 and modulo 10',
      'divmod(total, 10)',
      'divmod(total,10)',
      'integer division by 10 and modulo 10',
      'floor division by 10 and remainder by 10',
      '//10 and %10',
    ],
    placeholder: 'carry operation and digit operation',
    feedback: {
      correct: 'Correct. The quotient carries left and the remainder stays.',
      incorrect: 'Name how decimal arithmetic separates tens from ones.',
      secondIncorrect: 'Use total // 10 for carry and total % 10 for the digit.',
    },
    hints: [
      'For total 37, carry is 3 and the stored digit is 7.',
      'Python can compute both with divmod.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the printer’s digit-multiplication pipeline.',
    feedback: {
      correct: 'The printer now aligns partial products and returns a clean decimal string.',
      incorrect: 'Storage must exist before pair products can accumulate.',
      secondIncorrect:
        'Handle zero, allocate places, multiply pairs, carry left, then format.',
    },
    hints: [
      'The zero shortcut avoids trimming every storage cell.',
      'Formatting happens only after carries are normalized.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies decimal strings data["left"] and data["right"]. Return their product string without converting either whole operand to int.',
    starterCode: `def solve(data):
    left, right = data["left"], data["right"]
    if left == "0" or right == "0":
        return "0"

    places = [0] * (len(left) + len(right))

    for left_index in range(len(left) - 1, -1, -1):
        for right_index in range(len(right) - 1, -1, -1):
            # TODO: add this digit product and move its carry left.
            pass

    # TODO: skip leading zero storage and join digit characters.
    return ""`,
    cases: {
      visibleExample: {
        input: { left: '123', right: '45' },
        expected: '5535',
      },
      hiddenBoundary: {
        input: { left: '0', right: '98765' },
        expected: '0',
      },
      hiddenAdversarial: {
        input: { left: '999', right: '999' },
        expected: '998001',
      },
    },
    feedback: {
      correct: 'The tiny printer multiplies giant counters one digit pair at a time.',
      incorrect:
        'A product is wrong. Recheck place alignment, repeated carries, zero, and leading storage.',
      secondIncorrect:
        'Use low=i+j+1 and high=i+j; add product at low, carry places[low] // 10 to high, then places[low] %= 10.',
    },
    hints: [
      'Convert only one character digit at a time.',
      'For indices i and j, the low position is i + j + 1.',
      'After all loops, drop leading zeroes but keep "0" for a zero product.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['raw place totals', 0, 81, 162, 243, 162, 81],
        ['normalized', 9, 9, 8, 0, 0, 1],
      ],
      highlightedCells: [{ row: 1, column: 0, label: 'first digit' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(multiplyStringsMissionSeed)

export default problemLesson
