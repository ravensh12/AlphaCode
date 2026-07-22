import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const missingNumberMissionSeed = {
  slug: 'missing-number',
  estimatedMinutes: 18,
  mission: {
    title: 'The Lost Compass Chip',
    context:
      'A navigation kit should contain one unsigned chip for every number from 0 through n. The JSON list holds n distinct chips, so exactly one label is absent.',
    prompt:
      'Return the missing label using constant extra space. The JSON domain states its inclusive start and end, along with bit-width interpretation.',
  },
  objective:
    'XOR the complete 0..n domain against every supplied value so matching labels cancel.',
  priorKnowledge: [
    'The list length n implies the complete domain is 0 through n.',
    'XORing a value with itself produces 0.',
    'XOR order does not affect the result.',
  ],
  recognitionCue:
    'A complete consecutive domain is missing exactly one distinct value.',
  misconception:
    'Using only list indices 0 through n - 1 forgets the extra domain label n.',
  algorithmSteps: [
    {
      id: 'seed-endpoint',
      instruction: 'Start the XOR accumulator with the domain end n.',
    },
    {
      id: 'pair-index-value',
      instruction: 'For each list position i, XOR both i and values[i].',
    },
    {
      id: 'return-missing',
      instruction: 'Return the accumulator after all present labels cancel.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'One pass combines n values and n indices while one fixed-width accumulator is stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'domain-zero', bits: '00', label: 'domain 0' },
        { id: 'domain-one', bits: '01', label: 'domain 1' },
        { id: 'domain-two', bits: '10', label: 'domain 2' },
        { id: 'domain-three', bits: '11', label: 'domain 3' },
        { id: 'list-three', bits: '11', label: 'present 3' },
        { id: 'list-zero', bits: '00', label: 'present 0' },
        { id: 'list-one', bits: '01', label: 'present 1' },
      ],
      operation: 'XOR all rows; 2 remains',
      highlightedBitIndices: [0],
    },
  },
  workedExample: {
    prompt:
      'For values [3, 0, 1], the full labels are 0, 1, 2, 3. XORing both groups cancels 0, 1, and 3, leaving 2.',
    code: [
      'answer = n = 3',
      'i=0: answer ^= 0 ^ 3',
      'i=1: answer ^= 1 ^ 0',
      'i=2: answer ^= 2 ^ 1',
      'paired labels cancel; answer = 2',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Starting with n includes the domain label not represented by an index.',
      'The loop contributes every index from 0 through n - 1.',
      'It also contributes every present chip label.',
      'All duplicates cancel, so the absent label remains.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'cancel-zero', bits: '00', label: '0 XOR 0' },
        { id: 'cancel-one', bits: '00', label: '1 XOR 1' },
        { id: 'cancel-three', bits: '00', label: '3 XOR 3' },
        { id: 'missing-two', bits: '10', label: 'remaining 2' },
      ],
      operation: 'XOR',
      highlightedBitIndices: [0],
    },
  },
  patternCheck: {
    prompt:
      'Why is the accumulator initialized with n before enumerating the list?',
    options: [
      {
        id: 'include-extra-label',
        label: 'Indices provide 0 through n - 1, so n must be included separately.',
      },
      {
        id: 'count-values',
        label: 'n tells XOR how many 1 bits to create.',
      },
      {
        id: 'sort-list',
        label: 'Starting with n sorts the chip values.',
      },
    ],
    correctOptionId: 'include-extra-label',
    feedback: {
      correct: 'Exactly. That completes the full domain side of the cancellation.',
      incorrect: 'The initialization completes the label range; it does not sort or set a bit count.',
      secondIncorrect: 'The list has indices 0..n-1, but the valid labels run 0..n.',
    },
    hints: [
      'A list of length 3 has indices 0, 1, 2.',
      'Its valid labels also include 3.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'last-index', bits: '0010', label: 'last index n - 1 = 2' },
        { id: 'extra-domain', bits: '0011', label: 'extra domain label n = 3' },
      ],
      operation: 'seed with the extra label',
    },
  },
  retrievalCheck: {
    prompt:
      'Type the two values XORed on each loop iteration.',
    acceptedAnswers: [
      'the index and its value',
      'i and values[i]',
      'index ^ value',
      'index and value',
      'index xor value',
      'i ^ values[i]',
      'the index and the value',
    ],
    placeholder: 'two loop values',
    feedback: {
      correct: 'Correct. One comes from the complete domain and one from the supplied chips.',
      incorrect: 'Name the loop position and the chip stored there.',
      secondIncorrect: 'Use index and value.',
    },
    hints: [
      'enumerate(values) provides both.',
      'The expression can be answer ^= index ^ value.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the compact compass-chip scan.',
    feedback: {
      correct: 'Every present label cancels and the missing chip remains.',
      incorrect: 'The domain endpoint must enter before the index/value loop.',
      secondIncorrect: 'Seed with n, XOR every index and value, then return.',
    },
    hints: [
      'Only three actions are needed.',
      'Do not allocate a set.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies distinct data["values"], data["domain"] = {"start":0,"end":n}, data["bitWidth"], and data["signed"] = false. Return the one missing integer.',
    starterCode: `def solve(data):
    values = data["values"]
    domain = data["domain"]
    bit_width = data["bitWidth"]
    signed = data["signed"]
    answer = domain["end"]

    for index, value in enumerate(values):
        # TODO: cancel this domain index and present value.
        pass

    return answer`,
    cases: {
      visibleExample: {
        input: {
          values: [3, 0, 1],
          domain: { start: 0, end: 3 },
          bitWidth: 8,
          signed: false,
        },
        expected: 2,
      },
      hiddenBoundary: {
        input: {
          values: [],
          domain: { start: 0, end: 0 },
          bitWidth: 8,
          signed: false,
        },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          values: [9, 6, 4, 2, 3, 5, 7, 0, 1],
          domain: { start: 0, end: 9 },
          bitWidth: 8,
          signed: false,
        },
        expected: 8,
      },
    },
    feedback: {
      correct: 'The navigation kit identifies its absent chip with one XOR accumulator.',
      incorrect:
        'The label is wrong. Recheck the empty list, the endpoint n, and index/value cancellation.',
      secondIncorrect: 'Inside the loop use answer ^= index ^ value.',
    },
    hints: [
      'domain["end"] equals len(values).',
      'enumerate supplies every domain label except n.',
      'XOR does not require values to be sorted.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        { id: 'seven-value', bits: '00000111', label: 'present 7' },
        { id: 'eight-missing', bits: '00001000', label: 'missing 8' },
        { id: 'nine-value', bits: '00001001', label: 'present 9' },
      ],
      operation: 'full domain XOR present values',
      highlightedBitIndices: [4],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(missingNumberMissionSeed)

export default problemLesson
