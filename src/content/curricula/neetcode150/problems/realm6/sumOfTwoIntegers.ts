import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const sumOfTwoIntegersMissionSeed = {
  slug: 'sum-of-two-integers',
  estimatedMinutes: 25,
  mission: {
    title: 'The Twin Thermostat Register',
    context:
      'A weather lab combines two signed temperature adjustments inside a fixed-width two’s-complement register. Its backup controller can use bit operations but not arithmetic addition or subtraction to combine them.',
    prompt:
      'Return the wrapped signed sum for the declared bit width. JSON explicitly marks signed mode, so overflow wraps within that register.',
  },
  objective:
    'Repeat XOR for sum bits and shifted AND for carry bits until no carry remains.',
  priorKnowledge: [
    'XOR adds two bits without carrying.',
    'AND finds positions where two 1 bits create a carry.',
    'A width mask makes Python bit operations behave like a finite register.',
  ],
  recognitionCue:
    'Two signed integers must be combined without using ordinary + or - arithmetic.',
  misconception:
    'Running the carry loop on unmasked negative Python integers may never reach zero because Python keeps unlimited sign bits.',
  algorithmSteps: [
    {
      id: 'mask-operands',
      instruction: 'Mask both operands to the declared register width.',
    },
    {
      id: 'compute-partial',
      instruction: 'While carry exists, compute partial sum with XOR.',
    },
    {
      id: 'compute-carry',
      instruction: 'Compute carry with AND, shift it left, and mask it.',
    },
    {
      id: 'repeat-register',
      instruction: 'Replace the operands with partial sum and carry.',
    },
    {
      id: 'decode-signed',
      instruction:
        'Interpret the final width-bit pattern as signed two’s-complement.',
    },
  ],
  complexity: {
    time: 'O(width)',
    space: 'O(1)',
    explanation:
      'Carry moves left and disappears within at most bitWidth rounds; only fixed-width integers are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'five-addend', bits: '00000101', label: '5' },
        { id: 'three-addend', bits: '00000011', label: '3' },
        { id: 'xor-partial', bits: '00000110', label: 'XOR partial' },
        { id: 'and-carry', bits: '00000010', label: 'AND then shift = carry' },
        { id: 'eight-result', bits: '00001000', label: 'final 8' },
      ],
      operation: 'repeat partial XOR carry',
      highlightedBitIndices: [4],
    },
  },
  workedExample: {
    prompt:
      'In 8 bits, 5 and 3 first produce XOR 6 and shifted carry 2. Combining 6 and 2 produces 4 with carry 4, then 0 with carry 8, then final 8.',
    code: [
      '0101 XOR 0011 = 0110; carry = 0010',
      '0110 XOR 0010 = 0100; carry = 0100',
      '0100 XOR 0100 = 0000; carry = 1000',
      '0000 XOR 1000 = 1000; carry = 0000',
      'result = 8',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'XOR writes each no-carry sum bit.',
      'Shared 1 positions become a carry one place left.',
      'The same two operations combine partial sum and carry again.',
      'When carry reaches zero, the register pattern is complete.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'round-zero', bits: '00000110', label: 'round 1 partial' },
        { id: 'round-one', bits: '00000100', label: 'round 2 partial' },
        { id: 'round-two', bits: '00000000', label: 'round 3 partial' },
        { id: 'round-three', bits: '00001000', label: 'final' },
      ],
      operation: 'carry travels left',
      highlightedBitIndices: [4, 5, 6, 7],
    },
  },
  patternCheck: {
    prompt:
      'Which pair of expressions separates no-carry sum from carry?',
    options: [
      {
        id: 'xor-and-shift',
        label: 'a XOR b, and (a AND b) shifted left once.',
      },
      {
        id: 'or-right-shift',
        label: 'a OR b, and a shifted right once.',
      },
      {
        id: 'not-both',
        label: 'NOT a and NOT b without any shift.',
      },
    ],
    correctOptionId: 'xor-and-shift',
    feedback: {
      correct: 'Exactly. XOR handles bit sums and shifted AND carries to the next column.',
      incorrect: 'That pair does not model binary column addition.',
      secondIncorrect:
        'Use partial = a ^ b and carry = (a & b) << 1.',
    },
    hints: [
      'One operation is 1 only when input bits differ.',
      'The carry occurs where both bits are 1, then moves left.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'a-row', bits: '0110', label: 'a' },
        { id: 'b-row', bits: '0011', label: 'b' },
        { id: 'xor-row', bits: '0101', label: 'a XOR b' },
        { id: 'carry-row', bits: '0100', label: '(a AND b) << 1' },
      ],
      operation: 'partial and carry',
    },
  },
  retrievalCheck: {
    prompt:
      'Type the expression that creates the next carry before width masking.',
    acceptedAnswers: [
      '(a & b) << 1',
      '(a AND b) shifted left by 1',
      '(left & right) << 1',
      'shift (a & b) left one',
      '(a&b)<<1',
      '(a & b) shifted left by 1',
      '(left&right)<<1',
    ],
    placeholder: 'carry = ...',
    feedback: {
      correct: 'Correct. Shared 1 bits carry into the next higher position.',
      incorrect: 'Find shared 1 positions, then move them one place left.',
      secondIncorrect: 'Use (a & b) << 1.',
    },
    hints: [
      'AND identifies two 1 addends.',
      'A binary carry belongs in the next column.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the finite signed-register addition loop.',
    feedback: {
      correct: 'The backup controller now adds with bits and wraps at the declared width.',
      incorrect: 'Masking must happen before negative operands enter the carry loop.',
      secondIncorrect:
        'Mask, compute XOR partial, compute shifted-AND carry, repeat, then decode signed.',
    },
    hints: [
      'Partial and carry are calculated from the same old operand pair.',
      'Signed decoding happens after carry becomes zero.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["left"], data["right"], data["bitWidth"], and data["signed"] = true. Combine operands with bit operations, wrap to width, and return the signed result.',
    starterCode: `def solve(data):
    width = data["bitWidth"]
    signed = data["signed"]
    mask = (1 << width) - 1
    left = data["left"] & mask
    right = data["right"] & mask

    while right:
        # TODO: compute masked XOR partial and masked shifted-AND carry.
        break

    sign_bit = 1 << (width - 1)
    # TODO: decode left as signed without changing its bit pattern.
    return left`,
    cases: {
      visibleExample: {
        input: {
          left: -4,
          right: 7,
          bitWidth: 8,
          signed: true,
        },
        expected: 3,
      },
      hiddenBoundary: {
        input: {
          left: -128,
          right: 0,
          bitWidth: 8,
          signed: true,
        },
        expected: -128,
      },
      hiddenAdversarial: {
        input: {
          left: 120,
          right: 20,
          bitWidth: 8,
          signed: true,
        },
        expected: -116,
      },
    },
    feedback: {
      correct: 'The thermostat combines signed adjustments with finite bit carries.',
      incorrect:
        'A sum is wrong. Recheck masking each round, negative decoding, and 8-bit overflow.',
      secondIncorrect:
        'Loop with partial=(left^right)&mask and carry=((left&right)<<1)&mask; decode sign with ~(left^mask).',
    },
    hints: [
      'Calculate partial and carry before assigning either back.',
      'Mask both values each round so carries cannot escape the register.',
      'If left & sign_bit, the signed value is ~(left ^ mask).',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'one-twenty', bits: '01111000', label: '120' },
        { id: 'twenty', bits: '00010100', label: '20' },
        { id: 'wrapped-sum', bits: '10001100', label: '-116 signed 8-bit' },
      ],
      operation: '8-bit wrapped addition',
      highlightedBitIndices: [0],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(sumOfTwoIntegersMissionSeed)

export default problemLesson
