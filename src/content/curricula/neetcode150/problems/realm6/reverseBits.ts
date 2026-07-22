import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const reverseBitsMissionSeed = {
  slug: 'reverse-bits',
  estimatedMinutes: 19,
  mission: {
    title: 'The Mirror-Melody Register',
    context:
      'A sound exhibit encodes a melody in a fixed-width row of bits. A mirror mode swaps the first bit with the last, the second with the second-last, and so on.',
    prompt:
      'Return the unsigned integer represented by the reversed bit row. JSON gives the width and whether the input integer should first be read as signed.',
  },
  objective:
    'Shift one low input bit at a time into the growing reversed result.',
  priorKnowledge: [
    'A width mask extracts a finite fixed-width pattern.',
    'value & 1 reads the lowest bit.',
    'Shifting result left opens one position for the next bit.',
  ],
  recognitionCue:
    'The positions of all bits in a fixed-width register must be mirrored.',
  misconception:
    'Stopping when the value reaches zero drops leading zero bits that must become trailing positions in the reversed width.',
  algorithmSteps: [
    {
      id: 'mask-width',
      instruction: 'Mask the input to exactly bitWidth bits.',
    },
    {
      id: 'start-empty',
      instruction: 'Set the reversed result to 0.',
    },
    {
      id: 'open-result-bit',
      instruction: 'Repeat bitWidth times: shift the result left one place.',
    },
    {
      id: 'copy-low-bit',
      instruction: 'OR in the input’s lowest bit, then shift the input right.',
    },
    {
      id: 'return-unsigned',
      instruction: 'Return the reversed pattern as an unsigned integer.',
    },
  ],
  complexity: {
    time: 'O(width)',
    space: 'O(1)',
    explanation:
      'Exactly bitWidth iterations move one bit each, using only the masked input and result.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'source-thirteen', bits: '00001101', label: '13' },
        { id: 'reversed-thirteen', bits: '10110000', label: 'reversed = 176' },
      ],
      operation: 'mirror 8 positions',
      highlightedBitIndices: [0, 2, 3, 7],
    },
  },
  workedExample: {
    prompt:
      'Eight-bit 13 is 00001101. Reading its low bits in order gives 1,0,1,1,0,0,0,0, which builds 10110000, or 176.',
    code: [
      'source = 00001101',
      'take low bit 1 -> result 1',
      'take 0,1,1 -> result 1011',
      'take four zeroes -> result 10110000',
      'return 176',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Masking fixes the source to eight positions.',
      'Each loop opens a low result position after shifting the old result left.',
      'The next source low bit fills that position.',
      'Running all eight iterations preserves zero positions too.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'before-mirror', bits: '00001101', label: 'before' },
        { id: 'after-mirror', bits: '10110000', label: 'after' },
      ],
      operation: 'bit i moves to width - 1 - i',
    },
  },
  patternCheck: {
    prompt:
      'Why must the loop run exactly bitWidth times instead of while value is nonzero?',
    options: [
      {
        id: 'preserve-zero-positions',
        label: 'Zero positions are part of the fixed-width mirror.',
      },
      {
        id: 'make-value-positive',
        label: 'Extra loops always make the result positive.',
      },
      {
        id: 'sort-bits',
        label: 'The final loops sort all 1 bits together.',
      },
    ],
    correctOptionId: 'preserve-zero-positions',
    feedback: {
      correct: 'Exactly. Leading source zeroes must become trailing reversed positions.',
      incorrect: 'The fixed iteration count preserves width; it does not sort or choose a sign.',
      secondIncorrect:
        'A bit row includes zeroes, so mirror every declared position.',
    },
    hints: [
      'Compare 00000001 reversed at widths 1 and 8.',
      'At width 8, the answer is 10000000.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'one-source', bits: '00000001', label: 'source 1' },
        { id: 'one-reversed', bits: '10000000', label: 'reversed 128' },
      ],
      operation: '8 positions, including zeroes',
    },
  },
  retrievalCheck: {
    prompt:
      'Type the expression that reads the current lowest input bit.',
    acceptedAnswers: ['value & 1', 'value and 1', 'value % 2', 'value&1', 'value%2'],
    placeholder: 'lowest_bit = ...',
    feedback: {
      correct: 'Correct. AND with 1 keeps only bit position zero.',
      incorrect: 'Use a mask containing only the lowest bit.',
      secondIncorrect: 'Use value & 1.',
    },
    hints: [
      'The mask is binary 00000001.',
      'Python’s bitwise AND operator is &.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the register-mirroring loop.',
    feedback: {
      correct: 'The controller now mirrors every declared bit position.',
      incorrect: 'Masking comes before reading bits from a signed Python integer.',
      secondIncorrect:
        'Mask width, start zero, shift result, copy low bit and shift input, then return.',
    },
    hints: [
      'Result shifts before the new bit is ORed in.',
      'The input shifts right after its low bit is consumed.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies integer data["value"], positive data["bitWidth"], and boolean data["signed"]. Reverse exactly that many bits and return the resulting unsigned integer.',
    starterCode: `def solve(data):
    width = data["bitWidth"]
    signed = data["signed"]
    value = data["value"] & ((1 << width) - 1)
    reversed_value = 0

    for _ in range(width):
        # TODO: shift result, copy value's low bit, then shift value.
        pass

    return reversed_value`,
    cases: {
      visibleExample: {
        input: { value: 13, bitWidth: 8, signed: false },
        expected: 176,
      },
      hiddenBoundary: {
        input: { value: 0, bitWidth: 1, signed: false },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { value: -2, bitWidth: 8, signed: true },
        expected: 127,
      },
    },
    feedback: {
      correct: 'The melody register mirrors every bit, including signed source patterns.',
      incorrect:
        'A mirrored value is wrong. Recheck width masking, exact loop count, and low-bit order.',
      secondIncorrect:
        'Use reversed_value = (reversed_value << 1) | (value & 1), then value >>= 1.',
    },
    hints: [
      'Mask before shifting a negative input.',
      'Run range(width), even after value becomes zero.',
      'The returned integer is the unsigned reading of the reversed pattern.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'minus-two-source', bits: '11111110', label: '-2 signed 8-bit' },
        { id: 'minus-two-reversed', bits: '01111111', label: 'reversed = 127' },
      ],
      operation: 'reverse all 8 bits',
      highlightedBitIndices: [0, 7],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(reverseBitsMissionSeed)

export default problemLesson
