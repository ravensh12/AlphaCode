import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const countingBitsMissionSeed = {
  slug: 'counting-bits',
  estimatedMinutes: 19,
  mission: {
    title: 'The Badge-Light Catalog',
    context:
      'A workshop numbers electronic badges from 0 through a chosen limit. Each badge lights the bit positions that are 1 in its unsigned register value.',
    prompt:
      'Return a JSON list where index i stores the number of lit bits in i, reusing earlier answers instead of recounting every register from scratch.',
  },
  objective:
    'Build bit counts with the recurrence count[i] = count[i >> 1] + (i & 1).',
  priorKnowledge: [
    'Right shift by one removes the lowest bit.',
    'i & 1 is the lowest bit of i.',
    'Dynamic programming stores answers to smaller subproblems.',
  ],
  recognitionCue:
    'The task needs bit counts for every number in a whole range.',
  misconception:
    'Running a full bit-count loop independently for every value repeats work that its half-value already solved.',
  algorithmSteps: [
    {
      id: 'open-counts',
      instruction: 'Create a list of limit + 1 zeroes, keeping count[0] = 0.',
    },
    {
      id: 'visit-values',
      instruction: 'Visit each integer i from 1 through limit.',
    },
    {
      id: 'reuse-half',
      instruction: 'Read the stored count for i shifted right by one.',
    },
    {
      id: 'add-low-bit',
      instruction: 'Add i AND 1 and store the result at count[i].',
    },
    {
      id: 'return-catalog',
      instruction: 'Return the completed list.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Each value from 0 through n is filled once, and the required answer list stores n + 1 counts.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'five', bits: '0101', label: 'i = 5' },
        { id: 'half-five', bits: '0010', label: 'i >> 1 = 2' },
        { id: 'low-five', bits: '0001', label: 'i & 1 = 1' },
      ],
      operation: 'count[5] = count[2] + 1',
      highlightedBitIndices: [3],
    },
  },
  workedExample: {
    prompt:
      'Counts through 5 are built from earlier halves: count[4] = count[2] + 0 = 1, and count[5] = count[2] + 1 = 2.',
    code: [
      'count[0] = 0',
      'count[1] = count[0] + 1 = 1',
      'count[2] = count[1] + 0 = 1',
      'count[3] = count[1] + 1 = 2',
      'count[4] = 1; count[5] = 2',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Every shifted parent is smaller than its child, so its answer already exists.',
      'Even values add a low bit of 0.',
      'Odd values add a low bit of 1.',
      'The final list is [0, 1, 1, 2, 1, 2].',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'zero-row', bits: '000', label: '0 → 0' },
        { id: 'one-row', bits: '001', label: '1 → 1' },
        { id: 'two-row', bits: '010', label: '2 → 1' },
        { id: 'three-row', bits: '011', label: '3 → 2' },
        { id: 'four-row', bits: '100', label: '4 → 1' },
        { id: 'five-row', bits: '101', label: '5 → 2' },
      ],
      operation: 'number of 1 bits',
    },
  },
  patternCheck: {
    prompt:
      'Which smaller number supplies most of count[i]?',
    options: [
      {
        id: 'shifted-half',
        label: 'i >> 1, the value with its lowest bit removed.',
      },
      {
        id: 'double-value',
        label: 'i << 1, a larger value not filled yet.',
      },
      {
        id: 'same-value',
        label: 'i itself before count[i] is known.',
      },
    ],
    correctOptionId: 'shifted-half',
    feedback: {
      correct: 'Yes. Its count is known, and only the removed low bit remains to add.',
      incorrect: 'A DP dependency must already be solved before count[i].',
      secondIncorrect: 'Use count[i >> 1] plus i & 1.',
    },
    hints: [
      'Remove one binary digit from i.',
      'The resulting value is always smaller for i > 0.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'child-eleven', bits: '1011', label: '11' },
        { id: 'parent-five', bits: '0101', label: '11 >> 1 = 5' },
      ],
      operation: 'reuse parent count + low bit',
      highlightedBitIndices: [3],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the full recurrence for counts[i].',
    acceptedAnswers: [
      'counts[i] = counts[i >> 1] + (i & 1)',
      'count[i] = count[i >> 1] + (i & 1)',
      'counts[i>>1] + (i&1)',
      'counts[i >> 1] + (i & 1)',
      'count[i >> 1] + (i & 1)',
      'counts[i] = counts[i >> 1] + (i % 2)',
      'counts[i // 2] + (i % 2)',
    ],
    placeholder: 'counts[i] = ...',
    feedback: {
      correct: 'Correct. The parent contributes higher bits and i & 1 contributes the last bit.',
      incorrect: 'Include both the shifted parent count and the low bit.',
      secondIncorrect: 'Use counts[i >> 1] + (i & 1).',
    },
    hints: [
      'Right shift chooses the solved parent.',
      'AND with 1 reads the removed digit.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the badge catalog’s dynamic-programming order.',
    feedback: {
      correct: 'Every badge now reuses a smaller count and adds one bit decision.',
      incorrect: 'The list and count[0] must exist before later entries are filled.',
      secondIncorrect:
        'Open counts, visit 1..limit, read shifted half, add low bit, then return.',
    },
    hints: [
      'Fill indices in increasing order.',
      'The parent i >> 1 is always earlier.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies nonnegative data["limit"], data["bitWidth"], and data["signed"] = false. Return bit counts for every unsigned value from 0 through limit.',
    starterCode: `def solve(data):
    limit = data["limit"]
    bit_width = data["bitWidth"]
    signed = data["signed"]
    counts = [0] * (limit + 1)

    for value in range(1, limit + 1):
        # TODO: combine the shifted parent count and the low bit.
        pass

    return counts`,
    cases: {
      visibleExample: {
        input: { limit: 5, bitWidth: 8, signed: false },
        expected: [0, 1, 1, 2, 1, 2],
      },
      hiddenBoundary: {
        input: { limit: 0, bitWidth: 8, signed: false },
        expected: [0],
      },
      hiddenAdversarial: {
        input: { limit: 16, bitWidth: 8, signed: false },
        expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1],
      },
    },
    feedback: {
      correct: 'The workshop catalog fills every badge count in one linear pass.',
      incorrect:
        'A catalog entry is wrong. Recheck index zero, powers of two, and the shifted-parent recurrence.',
      secondIncorrect:
        'Set counts[value] = counts[value >> 1] + (value & 1).',
    },
    hints: [
      'counts[0] stays 0.',
      'value >> 1 is always less than value.',
      'value & 1 is either 0 or 1.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'fifteen', bits: '00001111', label: '15 → 4' },
        { id: 'sixteen', bits: '00010000', label: '16 → 1' },
      ],
      operation: 'power-of-two boundary',
      highlightedBitIndices: [3, 4, 5, 6, 7],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(countingBitsMissionSeed)

export default problemLesson
