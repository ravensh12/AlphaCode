import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const numberOf1BitsMissionSeed = {
  slug: 'number-of-1-bits',
  estimatedMinutes: 18,
  mission: {
    title: 'The Lit Star Register',
    context:
      'A planetarium stores one control value in a fixed-width register. A 1 bit means that lamp is lit, and signed values use two’s-complement within the stated width.',
    prompt:
      'Return the number of lit bits in the JSON value after limiting it to exactly bitWidth bits.',
  },
  objective:
    'Mask to the declared width, then repeatedly clear the lowest set bit.',
  priorKnowledge: [
    'A width-bit mask is (1 << width) - 1.',
    'Two’s-complement signed values become finite after applying a width mask.',
    'For positive x, x & (x - 1) clears its lowest 1 bit.',
  ],
  recognitionCue:
    'The task asks for how many 1 bits appear, not their positions.',
  misconception:
    'Right-shifting a negative Python integer until zero never finishes because its sign bits keep filling with 1.',
  algorithmSteps: [
    {
      id: 'build-mask',
      instruction: 'Build a mask containing bitWidth low 1 bits.',
    },
    {
      id: 'limit-value',
      instruction: 'AND the input value with the mask.',
    },
    {
      id: 'clear-lowest',
      instruction:
        'While the masked value is nonzero, replace it with value & (value - 1).',
    },
    {
      id: 'count-clears',
      instruction: 'Add one for each cleared bit and return the count.',
    },
  ],
  complexity: {
    time: 'O(k)',
    space: 'O(1)',
    explanation:
      'The loop runs once per set bit k, at most bitWidth times, and stores only integers.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'eleven', bits: '00001011', label: '11' },
        { id: 'first-clear', bits: '00001010', label: 'clear lowest 1' },
        { id: 'second-clear', bits: '00001000', label: 'clear next 1' },
        { id: 'third-clear', bits: '00000000', label: 'clear final 1' },
      ],
      operation: 'value &= value - 1',
      highlightedBitIndices: [4, 6, 7],
    },
  },
  workedExample: {
    prompt:
      'Eight-bit value 11 is 00001011. Three clear-lowest operations produce 00001010, 00001000, then 00000000, so three lamps are lit.',
    code: [
      '00001011 -> 00001010, count 1',
      '00001010 -> 00001000, count 2',
      '00001000 -> 00000000, count 3',
      'return 3',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The width mask keeps exactly eight register positions.',
      'Subtracting one flips bits through the lowest set bit.',
      'AND removes that set bit while preserving all higher bits.',
      'Three removals reach zero.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'start', bits: '00001011', label: 'start' },
        { id: 'finish', bits: '00000000', label: 'after 3 clears' },
      ],
      operation: 'three iterations',
      highlightedBitIndices: [4, 6, 7],
    },
  },
  patternCheck: {
    prompt:
      'Why does value & (value - 1) make the loop count set bits?',
    options: [
      {
        id: 'clears-one',
        label: 'It clears exactly the lowest remaining 1 bit.',
      },
      {
        id: 'shifts-all',
        label: 'It shifts every bit one place right.',
      },
      {
        id: 'sets-zeroes',
        label: 'It changes every 0 bit into 1.',
      },
    ],
    correctOptionId: 'clears-one',
    feedback: {
      correct: 'Exactly. One iteration corresponds to one set bit.',
      incorrect: 'The expression does not shift the register or fill all zeroes.',
      secondIncorrect:
        'Subtract one, then AND: the lowest 1 disappears and higher bits stay.',
    },
    hints: [
      'Compare 10110000 with one less: 10101111.',
      'Their AND is 10100000.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'value-row', bits: '10110000', label: 'value' },
        { id: 'minus-row', bits: '10101111', label: 'value - 1' },
        { id: 'and-row', bits: '10100000', label: 'AND result' },
      ],
      operation: 'AND',
      highlightedBitIndices: [3],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the expression for a mask whose lowest width bits are all 1.',
    acceptedAnswers: [
      '(1 << width) - 1',
      '(1<<width)-1',
      '2**width - 1',
      '2 ** width - 1',
      '2**width-1',
      '(2**width) - 1',
    ],
    placeholder: 'mask = ...',
    feedback: {
      correct: 'Correct. Shifting creates 100...0, then subtracting one fills the low positions.',
      incorrect: 'Build one bit above the register, then subtract one.',
      secondIncorrect: 'Use (1 << width) - 1.',
    },
    hints: [
      '1 << width equals 2 to the width.',
      'One less has width low 1 bits.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the fixed-width lamp-count routine.',
    feedback: {
      correct: 'The routine now terminates for both signed and unsigned register values.',
      incorrect: 'Signed values must be masked before the clearing loop.',
      secondIncorrect:
        'Build mask, limit value, repeatedly clear lowest 1, count and return.',
    },
    hints: [
      'Width normalization happens once at the start.',
      'Each loop iteration increases count exactly once.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies integer data["value"], positive data["bitWidth"], and boolean data["signed"]. Count 1 bits in that exact-width representation and return the integer count.',
    starterCode: `def solve(data):
    value = data["value"]
    width = data["bitWidth"]
    signed = data["signed"]
    mask = (1 << width) - 1
    value &= mask
    count = 0

    while value:
        # TODO: clear one set bit and increase count.
        break

    return count`,
    cases: {
      visibleExample: {
        input: { value: 11, bitWidth: 8, signed: false },
        expected: 3,
      },
      hiddenBoundary: {
        input: { value: 0, bitWidth: 8, signed: false },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { value: -3, bitWidth: 8, signed: true },
        expected: 7,
      },
    },
    feedback: {
      correct: 'The register reports every lit bit, including finite signed representations.',
      incorrect:
        'The count is wrong. Recheck width masking, zero, and a negative two’s-complement value.',
      secondIncorrect:
        'Inside the loop use value &= value - 1 and count += 1.',
    },
    hints: [
      'Always apply the width mask, even for a positive value.',
      'Do not repeatedly right-shift an unmasked negative Python integer.',
      'The signed field documents interpretation; the mask supplies finite bits.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'negative-three', bits: '11111101', label: '-3 in signed 8-bit' },
        { id: 'mask-eight', bits: '11111111', label: '8-bit mask' },
        { id: 'masked-three', bits: '11111101', label: '7 ones' },
      ],
      operation: 'value AND mask',
      highlightedBitIndices: [0, 1, 2, 3, 4, 5, 7],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(numberOf1BitsMissionSeed)

export default problemLesson
