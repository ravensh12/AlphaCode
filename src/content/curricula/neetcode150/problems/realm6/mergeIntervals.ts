import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const mergeIntervalsMissionSeed = {
  slug: 'merge-intervals',
  estimatedMinutes: 21,
  mission: {
    title: 'The Lantern Festival Map',
    context:
      'A riverside lantern festival received path-closure times from several crews. Their reports arrive out of order, and some closures cover the same minutes.',
    prompt:
      'Combine every touching or overlapping closure into one interval object and return the closures sorted by start time.',
  },
  objective:
    'Sort intervals by start, then merge each overlap into the latest result.',
  priorKnowledge: [
    'Sorting can place intervals in start-time order.',
    'The final interval in a result list is available with index -1.',
    'Overlapping intervals share at least one time point.',
  ],
  recognitionCue:
    'Many unsorted ranges describe covered time, and the answer must contain disjoint ranges.',
  misconception:
    'Comparing only original neighbors fails because a merged interval can grow far enough to overlap the next one.',
  algorithmSteps: [
    {
      id: 'sort-starts',
      instruction: 'Sort all intervals by start time.',
    },
    {
      id: 'seed-result',
      instruction: 'Put the first sorted interval into the result if one exists.',
    },
    {
      id: 'check-last',
      instruction: 'Compare each next interval with the last merged interval.',
    },
    {
      id: 'merge-or-append',
      instruction:
        'Extend the last end on overlap; otherwise append a new interval.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'Sorting dominates the linear scan, and the JSON result may store all n intervals.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'crew-a', start: 1, end: 4 },
        { id: 'crew-b', start: 3, end: 6 },
        { id: 'crew-c', start: 9, end: 11 },
      ],
      highlightedIntervalIds: ['crew-a', 'crew-b'],
      cursor: 3,
    },
  },
  workedExample: {
    prompt:
      'Reports [9, 11], [1, 4], and [3, 6] sort to [1, 4], [3, 6], [9, 11]. The first pair overlaps and becomes [1, 6]; the last report begins a new closure.',
    code: [
      'ordered = [[1, 4], [3, 6], [9, 11]]',
      'merged = [[1, 4]]',
      '3 <= 4, so merged[-1] becomes [1, 6]',
      '9 > 6, so append [9, 11]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Sorting exposes overlaps from left to right.',
      '[3, 6] starts before the current end 4, so extend that end to 6.',
      '[9, 11] starts after 6, so it cannot overlap any earlier closure.',
      'The answer is [[1, 6], [9, 11]].',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'merged', start: 1, end: 6, label: 'combined' },
        { id: 'separate', start: 9, end: 11, label: 'separate' },
      ],
      highlightedIntervalIds: ['merged'],
    },
  },
  patternCheck: {
    prompt:
      'Why does comparing only with the last merged closure work after sorting?',
    options: [
      {
        id: 'last-reaches-farthest',
        label:
          'The last merged closure is the only earlier range that can still reach the next start.',
      },
      {
        id: 'all-same-length',
        label: 'Sorting makes every closure the same length.',
      },
      {
        id: 'overlap-transitive',
        label: 'Any two earlier closures must overlap each other.',
      },
    ],
    correctOptionId: 'last-reaches-farthest',
    feedback: {
      correct:
        'Exactly. Earlier finished groups are permanently left of the scan.',
      incorrect: 'Sorting orders starts, but it does not equalize lengths or force all pairs to overlap.',
      secondIncorrect:
        'The result is already disjoint, so only its final interval can meet the next start.',
    },
    hints: [
      'Think about every result interval except the last one.',
      'Those earlier intervals already end before the last group begins.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'done', start: 0, end: 2, label: 'finished' },
        { id: 'last', start: 4, end: 8, label: 'compare here' },
        { id: 'next', start: 7, end: 10, label: 'next' },
      ],
      highlightedIntervalIds: ['last', 'next'],
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the overlap test after sorting: next.start is less than or equal to ______.',
    acceptedAnswers: [
      'the last merged end',
      'last merged end',
      'merged[-1].end',
      'merged[-1]["end"]',
      "merged[-1]['end']",
      'the end of the last merged interval',
      'end of the last merged interval',
      'the end of the last merged closure',
      'the previous end',
      'the current end',
      'the last end',
      "the last merged interval's end",
    ],
    placeholder: 'the current boundary',
    feedback: {
      correct: 'Right. Equality counts because the intervals touch.',
      incorrect: 'Compare the next start with the end of the active merged group.',
      secondIncorrect: 'Answer: the last merged end.',
    },
    hints: [
      'The next start is known to be no earlier than previous starts.',
      'Only one right endpoint decides whether the active group continues.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Put the festival cleanup actions back into their correct order.',
    feedback: {
      correct: 'The map now forms sorted, disjoint closure groups.',
      incorrect: 'A scan cannot rely on neighboring starts until the reports are sorted.',
      secondIncorrect:
        'Sort, seed, compare with the latest merge, then extend or append.',
    },
    hints: [
      'Ordering the input is the first action.',
      'The result needs an initial interval before using its last item.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["intervals"] as objects with integer start and end fields. Return sorted, disjoint interval objects; touching endpoints must merge.',
    starterCode: `def solve(data):
    ordered = sorted(data["intervals"], key=lambda item: item["start"])
    merged = []

    for interval in ordered:
        # TODO: append a separate interval or extend merged[-1].
        pass

    return merged`,
    cases: {
      visibleExample: {
        input: {
          intervals: [
            { start: 9, end: 11 },
            { start: 1, end: 4 },
            { start: 3, end: 6 },
          ],
        },
        expected: [
          { start: 1, end: 6 },
          { start: 9, end: 11 },
        ],
      },
      hiddenBoundary: {
        input: { intervals: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          intervals: [
            { start: 8, end: 10 },
            { start: 2, end: 3 },
            { start: 3, end: 8 },
            { start: 1, end: 2 },
          ],
        },
        expected: [{ start: 1, end: 10 }],
      },
    },
    feedback: {
      correct: 'The crew reports now form a clean set of closure windows.',
      incorrect:
        'A report was lost or split. Recheck empty input, touching endpoints, and chains of overlaps.',
      secondIncorrect:
        'If merged is empty or next.start > merged[-1].end, append a copy; otherwise update the last end.',
    },
    hints: [
      'Copy dictionaries before changing an end so the input stays untouched.',
      'Use max for the merged end because one interval may sit inside another.',
      'An empty list should return an empty list.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'one', start: 1, end: 2 },
        { id: 'two', start: 2, end: 3 },
        { id: 'three', start: 3, end: 8 },
        { id: 'four', start: 8, end: 10 },
      ],
      highlightedIntervalIds: ['one', 'two', 'three', 'four'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(mergeIntervalsMissionSeed)

export default problemLesson
