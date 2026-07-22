import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const singleNumberMissionSeed = {
  slug: 'single-number',
  estimatedMinutes: 17,
  mission: {
    title: 'The Unpaired Signal Tag',
    context:
      'A camp scanner receives signed signal-tag values. Every tag was transmitted exactly twice except one tag sent once.',
    prompt:
      'Return the unpaired signed value using constant extra space. JSON states the bit width and whether values are signed.',
  },
  objective:
    'XOR every value so equal pairs cancel and the unique value remains.',
  priorKnowledge: [
    'A bit XOR itself becomes 0.',
    'A bit XOR 0 stays unchanged.',
    'XOR order can be rearranged without changing the result.',
  ],
  recognitionCue:
    'Every value occurs twice except one, and the task asks for constant-space detection.',
  misconception:
    'Adding values and dividing by two cannot isolate the unpaired value when signed values and arbitrary magnitudes are allowed.',
  algorithmSteps: [
    {
      id: 'start-zero',
      instruction: 'Set an XOR accumulator to 0.',
    },
    {
      id: 'xor-values',
      instruction: 'XOR each signed tag value into the accumulator.',
    },
    {
      id: 'return-remainder',
      instruction: 'Return the accumulator after every pair has canceled.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'One scan processes n values, while a single fixed-width accumulator stores the result.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'first-five', bits: '0101', label: '5' },
        { id: 'first-three', bits: '0011', label: '3' },
        { id: 'second-five', bits: '0101', label: '5' },
        { id: 'unique-six', bits: '0110', label: '6' },
        { id: 'second-three', bits: '0011', label: '3' },
      ],
      operation: 'XOR all rows; equal rows cancel',
    },
  },
  workedExample: {
    prompt:
      'For [5, 3, 5, 6, 3], regroup XOR as (5 XOR 5) XOR (3 XOR 3) XOR 6. Both pairs become zero, leaving 6.',
    code: [
      'answer = 0',
      'answer ^= 5 ^ 3 ^ 5 ^ 6 ^ 3',
      '= (5 ^ 5) ^ (3 ^ 3) ^ 6',
      '= 0 ^ 0 ^ 6',
      '= 6',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Start from the XOR identity 0.',
      'Commutative and associative XOR lets matching values sit together.',
      'Each duplicate pair cancels bit for bit.',
      'Only the tag that appeared once remains.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'pair-five', bits: '0000', label: '5 XOR 5' },
        { id: 'pair-three', bits: '0000', label: '3 XOR 3' },
        { id: 'remaining-six', bits: '0110', label: 'remaining 6' },
      ],
      operation: '0000 XOR 0000 XOR 0110 = 0110',
      highlightedBitIndices: [1, 2],
    },
  },
  patternCheck: {
    prompt:
      'Which property makes one pass with one accumulator possible?',
    options: [
      {
        id: 'xor-cancels-pairs',
        label: 'x XOR x is 0, while x XOR 0 is x.',
      },
      {
        id: 'xor-sorts',
        label: 'XOR sorts values by magnitude.',
      },
      {
        id: 'pairs-adjacent',
        label: 'Duplicate values must already be adjacent.',
      },
    ],
    correctOptionId: 'xor-cancels-pairs',
    feedback: {
      correct: 'Exactly. Pair cancellation works regardless of input order.',
      incorrect: 'XOR neither sorts nor requires neighboring duplicates.',
      secondIncorrect: 'Use x XOR x = 0 and x XOR 0 = x.',
    },
    hints: [
      'Try XORing the same four-bit row with itself.',
      'The duplicate values may be far apart.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'x-one', bits: '10110110', label: 'x' },
        { id: 'x-two', bits: '10110110', label: 'x' },
        { id: 'zero-result', bits: '00000000', label: 'result' },
      ],
      operation: 'XOR',
    },
  },
  retrievalCheck: {
    prompt:
      'Type the identity produced by XORing any fixed-width value x with itself.',
    acceptedAnswers: ['0', 'zero', 'x xor x = 0', 'x ^ x = 0', 'x^x=0', 'x xor x is 0'],
    placeholder: 'x XOR x = ...',
    feedback: {
      correct: 'Correct. Every equal bit pair produces 0.',
      incorrect: 'Write the cancellation result.',
      secondIncorrect: 'Answer: 0.',
    },
    hints: [
      '0 XOR 0 and 1 XOR 1 both equal the same bit.',
      'That bit is zero.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the three-step signal-tag scan.',
    feedback: {
      correct: 'Every duplicate transmission cancels, leaving the unpaired signed tag.',
      incorrect: 'The accumulator must begin at XOR’s identity.',
      secondIncorrect: 'Start at zero, XOR every value, then return the remainder.',
    },
    hints: [
      'No set or sorting step is needed.',
      'Return only after the complete scan.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["values"], data["bitWidth"], and data["signed"]. Values fit that signed or unsigned width; exactly one appears once and all others twice. Return the unpaired integer.',
    starterCode: `def solve(data):
    values = data["values"]
    bit_width = data["bitWidth"]
    signed = data["signed"]
    answer = 0

    for value in values:
        # TODO: combine value with answer using pair-canceling XOR.
        pass

    return answer`,
    cases: {
      visibleExample: {
        input: {
          values: [4, 1, 2, 1, 2],
          bitWidth: 32,
          signed: true,
        },
        expected: 4,
      },
      hiddenBoundary: {
        input: { values: [-7], bitWidth: 32, signed: true },
        expected: -7,
      },
      hiddenAdversarial: {
        input: {
          values: [-1, 12, -8, 12, -1],
          bitWidth: 32,
          signed: true,
        },
        expected: -8,
      },
    },
    feedback: {
      correct: 'The scanner isolates the one tag without extra collection storage.',
      incorrect:
        'The unpaired value is wrong. Recheck XOR accumulation and signed values.',
      secondIncorrect: 'Inside the loop, set answer = answer ^ value.',
    },
    hints: [
      'Python uses ^ for XOR.',
      'Do not convert signed values to strings.',
      'bitWidth and signed document the JSON representation; XOR cancellation handles the values directly.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'minus-one', bits: '11111111', label: '-1 (8-bit view)' },
        { id: 'twelve', bits: '00001100', label: '12' },
        { id: 'minus-eight', bits: '11111000', label: '-8' },
      ],
      operation: 'Paired rows cancel; signed unique row remains',
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(singleNumberMissionSeed)

export default problemLesson
