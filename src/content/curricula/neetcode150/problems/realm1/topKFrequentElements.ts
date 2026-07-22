import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const topKFrequentElementsMissionSeed = {
  slug: 'top-k-frequent-elements',
  estimatedMinutes: 24,
  mission: {
    title: 'The Meteor Radio Leaderboard',
    context:
      'An observatory records an integer code for every meteor ping. The display must show the k codes heard most often, and mission logs avoid ties at the cutoff.',
    prompt:
      'Return the most frequent codes from highest count downward without sorting every ping.',
  },
  objective:
    'Rank values in linear time by placing them into frequency-indexed buckets.',
  priorKnowledge: [
    'A frequency map counts each distinct value.',
    'No value can occur more than n times in a list of length n.',
    'Buckets can group values that share a count.',
  ],
  recognitionCue:
    'You need the k most common values, and every possible frequency lies between 1 and n.',
  misconception:
    'Sorting the raw values groups equal codes but does not directly rank groups by frequency.',
  algorithmSteps: [
    { id: 'count-pings', instruction: 'Build a frequency map for every meteor code.' },
    { id: 'open-buckets', instruction: 'Create n + 1 empty buckets indexed by frequency.' },
    { id: 'place-codes', instruction: 'Place each distinct code into the bucket matching its count.' },
    { id: 'scan-down', instruction: 'Scan bucket indices from n down to 1.' },
    { id: 'collect-codes', instruction: 'Append codes from each bucket to the answer.' },
    { id: 'stop-at-k', instruction: 'Return as soon as the answer contains k codes.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Counting, filling at most n bucket slots, and scanning n frequencies are all linear.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: ['0: —', '1: 8', '2: 3', '3: 7'],
      highlight: 3,
      pointers: [{ index: 3, label: 'scan down' }],
    },
  },
  workedExample: {
    prompt:
      'Pings [7, 7, 3, 7, 3, 8] give counts 7→3, 3→2, 8→1. Scanning buckets backward returns [7, 3] for k = 2.',
    code: [
      'def leaders(pings, k):',
      '    counts = {}',
      '    for code in pings: counts[code] = counts.get(code, 0) + 1',
      '    buckets = [[] for _ in range(len(pings) + 1)]',
      '    for code, count in counts.items(): buckets[count].append(code)',
      '    answer = []',
      '    for count in range(len(pings), 0, -1):',
      '        for code in buckets[count]:',
      '            answer.append(code)',
      '            if len(answer) == k: return answer',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The count map has three distinct codes.',
      'Code 7 enters bucket 3, code 3 enters bucket 2, and code 8 enters bucket 1.',
      'The backward scan reaches 7 then 3 and stops at two results.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: '7', value: 3 },
        { key: '3', value: 2 },
        { key: '8', value: 1 },
      ],
      lookup: '7',
    },
  },
  patternCheck: {
    prompt:
      'Why can frequency be used as an array index for this mission?',
    options: [
      { id: 'bounded-frequency', label: 'A code’s count is an integer from 1 through the number of pings.' },
      { id: 'codes-are-small', label: 'Every meteor code is a small positive integer.' },
      { id: 'k-is-frequency', label: 'The value k always equals the largest frequency.' },
      { id: 'buckets-sort-values', label: 'A bucket automatically sorts the numeric code values.' },
    ],
    correctOptionId: 'bounded-frequency',
    feedback: {
      correct: 'Yes. The input length gives a tight, linear-size range for all counts.',
      incorrect: 'The bucket index represents a count, not a code value or k.',
      secondIncorrect: 'No item can appear fewer than once or more than n times.',
    },
    hints: ['Ask for the maximum possible count.', 'Code values themselves may be negative or huge.'],
    diagram: { kind: 'array', values: ['0', '1 ping', '2 pings', '3 pings'], highlight: 2 },
  },
  retrievalCheck: {
    prompt:
      'Complete the bucket rule: place each code at buckets[______].',
    acceptedAnswers: [
      'frequency',
      'count',
      'counts[code]',
      'its frequency',
      'its count',
      'the frequency',
      'the count',
      'the code frequency',
      'how many times it appeared',
    ],
    placeholder: 'Type the bucket index',
    feedback: {
      correct: 'Right. The index itself records how often that code appeared.',
      incorrect: 'The index is not the code value; it is the code’s measured popularity.',
      secondIncorrect: 'Use its frequency, such as counts[code].',
    },
    hints: ['Bucket 4 means “appeared four times.”', 'Read the value from the frequency map.'],
  },
  reconstructionCheck: {
    prompt:
      'Reassemble the leaderboard so it returns high-frequency codes first.',
    feedback: {
      correct: 'Leaderboard rebuilt. Counting and reverse bucket scan keep the work linear.',
      incorrect: 'Buckets must be filled before they are scanned from high to low.',
      secondIncorrect: 'Count, open buckets, place codes, scan down, collect, and stop at k.',
    },
    hints: ['The frequency map comes before the buckets are filled.', 'The final scan moves downward.'],
    diagram: { kind: 'array', values: ['1: 8', '2: 3', '3: 7'], highlight: 2, pointers: [{ index: 2, label: 'start' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read integer data["pings"] and positive data["k"]. Return the k most frequent codes in any order; no case ties at the cutoff.',
    starterCode: `def solve(data):
    pings = data["pings"]
    k = data["k"]
    counts = {}
    for code in pings:
        counts[code] = counts.get(code, 0) + 1

    buckets = [[] for _ in range(len(pings) + 1)]
    # Fill buckets, then scan frequencies backward until k codes.
    return []`,
    cases: {
      visibleExample: { input: { pings: [4, 4, 4, 2, 2, 9], k: 2 }, expected: [4, 2] },
      hiddenBoundary: { input: { pings: [7], k: 1 }, expected: [7] },
      hiddenAdversarial: {
        input: { pings: [-1, 5, -1, 5, -1, 8, 8, 8, 8, 2, 2], k: 2 },
        expected: [8, -1],
      },
    },
    comparator: { kind: 'unordered' },
    feedback: {
      correct: 'Leaderboard online! Your reverse bucket scan handles negative codes and uneven counts.',
      incorrect: 'The ranking or result length is wrong. Check which quantity indexes each bucket.',
      secondIncorrect: 'Append each code to buckets[count], scan from len(pings) down, and return at k.',
    },
    hints: [
      'Iterate counts.items() to fill buckets.',
      'Use range(len(pings), 0, -1).',
      'Check len(answer) after every appended code.',
    ],
    diagram: { kind: 'array', values: ['1: 9', '2: 2', '3: 4'], highlight: 2, pointers: [{ index: 2, label: 'first' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(topKFrequentElementsMissionSeed)
export default problemLesson
