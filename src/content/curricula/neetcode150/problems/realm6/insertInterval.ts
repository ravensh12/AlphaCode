import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const insertIntervalMissionSeed = {
  slug: 'insert-interval',
  estimatedMinutes: 22,
  mission: {
    title: 'The New Observatory Shift',
    context:
      'A hilltop observatory keeps its telescope shifts sorted by start time, and existing shifts never overlap. A visiting class has just earned one new viewing shift.',
    prompt:
      'Place the new shift into the schedule. If it touches or crosses existing shifts, combine them so the returned JSON list stays sorted and non-overlapping.',
  },
  objective:
    'Insert one interval with a left scan, one merge, and a right scan.',
  priorKnowledge: [
    'An interval has an inclusive start and end.',
    'Sorted intervals can be processed from left to right.',
    'Two intervals overlap unless one ends before the other begins.',
  ],
  recognitionCue:
    'The old intervals are already sorted and disjoint, but one new interval must be added.',
  misconception:
    'Appending the new interval and sorting is not enough; every interval it bridges must also be merged.',
  algorithmSteps: [
    {
      id: 'copy-left',
      instruction:
        'Copy every interval ending before the new interval starts.',
    },
    {
      id: 'merge-middle',
      instruction:
        'While intervals overlap the new interval, widen its start and end.',
    },
    {
      id: 'place-merged',
      instruction: 'Append the widened new interval exactly once.',
    },
    {
      id: 'copy-right',
      instruction: 'Copy every remaining interval in its original order.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Each of n scheduled shifts is visited once, and the returned list can contain n + 1 intervals.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'early', start: 1, end: 2, label: 'old' },
        { id: 'visitor', start: 3, end: 6, label: 'new' },
        { id: 'late', start: 5, end: 7, label: 'old' },
      ],
      highlightedIntervalIds: ['visitor', 'late'],
      cursor: 5,
    },
  },
  workedExample: {
    prompt:
      'Shifts [1, 2] and [5, 7] receive [3, 6]. The first shift stays left, while the new shift meets [5, 7] and grows to [3, 7].',
    code: [
      'result = [[1, 2]]',
      'incoming = [3, 6]',
      'incoming overlaps [5, 7]',
      'incoming = [min(3, 5), max(6, 7)]',
      'result.append([3, 7])',
    ],
    currentLineIndex: 3,
    walkthrough: [
      '[1, 2] ends before 3, so copy it unchanged.',
      '[5, 7] starts before the incoming end 6, so the two overlap.',
      'The merged endpoints are 3 and 7.',
      'Nothing remains on the right, giving [[1, 2], [3, 7]].',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'a', start: 1, end: 2, label: 'copied' },
        { id: 'merged', start: 3, end: 7, label: 'merged' },
      ],
      highlightedIntervalIds: ['merged'],
    },
  },
  patternCheck: {
    prompt:
      'A new shift can bridge several old shifts. Which plan keeps the one-pass guarantee?',
    options: [
      {
        id: 'three-zones',
        label: 'Process intervals as left of, overlapping, or right of the new shift.',
      },
      {
        id: 'nearest-only',
        label: 'Compare the new shift only with the nearest start time.',
      },
      {
        id: 'keep-all',
        label: 'Insert the shift and keep every overlap unchanged.',
      },
    ],
    correctOptionId: 'three-zones',
    feedback: {
      correct:
        'Yes. Sorted, disjoint input forms three zones, so each old interval is handled once.',
      incorrect:
        'That can leave a bridge overlap or fail to preserve a valid schedule.',
      secondIncorrect:
        'Use the order: copy intervals fully left, merge the middle, then copy the right.',
    },
    hints: [
      'An interval is safely left when its end is smaller than the new start.',
      'After the overlap zone ends, all later intervals are safely right.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'left', start: 0, end: 1, label: 'left' },
        { id: 'middle', start: 2, end: 6, label: 'merge zone' },
        { id: 'right', start: 8, end: 9, label: 'right' },
      ],
      highlightedIntervalIds: ['middle'],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the endpoint rule for widening two overlapping intervals.',
    acceptedAnswers: [
      'minimum start and maximum end',
      'min start and max end',
      'take the smaller start and larger end',
      'smaller start and larger end',
      'smallest start and largest end',
      'min start, max end',
      'min of starts and max of ends',
      'min(start) and max(end)',
      'minimum of the starts and maximum of the ends',
      'keep the smaller start and the larger end',
    ],
    placeholder: 'smaller start, ...',
    feedback: {
      correct:
        'Correct. The outside endpoints cover every point from both intervals.',
      incorrect: 'Name what happens to both the start and the end.',
      secondIncorrect: 'Use: minimum start and maximum end.',
    },
    hints: [
      'The merged interval must begin no later than either input.',
      'It must end no earlier than either input.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the observatory scan from the four shuffled actions.',
    feedback: {
      correct:
        'Schedule restored: left copy, middle merge, one placement, right copy.',
      incorrect: 'The merged shift must be placed after all of its overlaps are absorbed.',
      secondIncorrect:
        'Start by copying safe-left intervals and finish by copying safe-right intervals.',
    },
    hints: [
      'Only the overlap zone changes endpoints.',
      'Append the incoming interval once, not once per overlap.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies sorted non-overlapping interval objects in data["intervals"] and one data["newInterval"]. Return merged interval objects with integer start and end fields.',
    starterCode: `def solve(data):
    intervals = data["intervals"]
    incoming = dict(data["newInterval"])
    result = []

    for interval in intervals:
        # TODO: copy left, merge middle, or place incoming before right.
        pass

    # TODO: append incoming if it has not been placed.
    return result`,
    cases: {
      visibleExample: {
        input: {
          intervals: [
            { start: 1, end: 2 },
            { start: 5, end: 7 },
          ],
          newInterval: { start: 3, end: 6 },
        },
        expected: [
          { start: 1, end: 2 },
          { start: 3, end: 7 },
        ],
      },
      hiddenBoundary: {
        input: { intervals: [], newInterval: { start: 4, end: 4 } },
        expected: [{ start: 4, end: 4 }],
      },
      hiddenAdversarial: {
        input: {
          intervals: [
            { start: 1, end: 4 },
            { start: 8, end: 10 },
            { start: 12, end: 15 },
          ],
          newInterval: { start: 3, end: 13 },
        },
        expected: [{ start: 1, end: 15 }],
      },
    },
    feedback: {
      correct:
        'The visiting class is scheduled, and every bridged shift was combined.',
      incorrect:
        'A schedule failed. Check touching endpoints, an empty schedule, and a new shift spanning several old ones.',
      secondIncorrect:
        'Track whether incoming was placed; merge when interval.start <= incoming.end.',
    },
    hints: [
      'Copy left when interval["end"] < incoming["start"].',
      'Place incoming before a right interval when incoming["end"] < interval["start"].',
      'Otherwise update incoming with min(start) and max(end).',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'old-one', start: 1, end: 4 },
        { id: 'new-one', start: 3, end: 13 },
        { id: 'old-two', start: 12, end: 15 },
      ],
      highlightedIntervalIds: ['new-one'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(insertIntervalMissionSeed)

export default problemLesson
