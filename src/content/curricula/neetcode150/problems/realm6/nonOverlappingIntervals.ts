import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const nonOverlappingIntervalsMissionSeed = {
  slug: 'non-overlapping-intervals',
  estimatedMinutes: 23,
  mission: {
    title: 'The One-Stage Showcase',
    context:
      'A school showcase has one stage and many requested performance windows. Two acts may touch at an endpoint, but their active minutes may not overlap.',
    prompt:
      'Return the smallest number of requests that must be removed so every remaining performance fits on the single stage.',
  },
  objective:
    'Keep the interval that finishes earliest and count every conflicting removal.',
  priorKnowledge: [
    'Intervals [a, b] and [b, c] can be scheduled back to back.',
    'A greedy choice makes the best local decision for future room.',
    'Sorting by an interval endpoint costs O(n log n).',
  ],
  recognitionCue:
    'The task asks for the fewest removals, which is the same as keeping the largest compatible set.',
  misconception:
    'Keeping the act that starts earliest can block many short acts that finish sooner.',
  algorithmSteps: [
    {
      id: 'sort-by-end',
      instruction: 'Sort performance requests by end time.',
    },
    {
      id: 'open-stage',
      instruction: 'Track the end of the last kept performance.',
    },
    {
      id: 'keep-compatible',
      instruction:
        'Keep a request whose start is at least the tracked end, then update the end.',
    },
    {
      id: 'count-conflict',
      instruction: 'Otherwise remove the request and add one to the count.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'End-time sorting dominates one linear pass; Python sorting may use linear auxiliary storage.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'long', start: 1, end: 7, label: 'blocks more' },
        { id: 'short-a', start: 2, end: 3, label: 'keep' },
        { id: 'short-b', start: 3, end: 5, label: 'keep' },
      ],
      highlightedIntervalIds: ['short-a', 'short-b'],
      cursor: 3,
    },
  },
  workedExample: {
    prompt:
      'Requests [1, 7], [2, 3], [3, 5], and [4, 6] sort by ending time as [2, 3], [3, 5], [4, 6], [1, 7]. Keep the first two, then remove both later conflicts.',
    code: [
      'ordered = [[2, 3], [3, 5], [4, 6], [1, 7]]',
      'keep [2, 3]; stage_end = 3',
      'keep [3, 5]; stage_end = 5',
      'remove [4, 6]',
      'remove [1, 7]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      '[2, 3] ends first, leaving the most room after time 3.',
      '[3, 5] starts exactly at 3, so it fits.',
      '[4, 6] begins before 5 and conflicts.',
      '[1, 7] also conflicts, so two removals are necessary.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'kept-one', start: 2, end: 3, label: 'kept' },
        { id: 'kept-two', start: 3, end: 5, label: 'kept' },
        { id: 'removed', start: 4, end: 6, label: 'remove' },
      ],
      highlightedIntervalIds: ['kept-one', 'kept-two'],
    },
  },
  patternCheck: {
    prompt:
      'When several performances conflict, which choice leaves the widest opening for later acts?',
    options: [
      {
        id: 'earliest-finish',
        label: 'Keep the compatible performance with the earliest end.',
      },
      {
        id: 'longest-act',
        label: 'Keep the performance lasting the most minutes.',
      },
      {
        id: 'latest-start',
        label: 'Keep whichever request was listed last.',
      },
    ],
    correctOptionId: 'earliest-finish',
    feedback: {
      correct:
        'Yes. An earlier finish can never leave less room for future performances.',
      incorrect: 'That choice can occupy stage time that several later acts need.',
      secondIncorrect:
        'Sort by end time and keep each next request that starts after the current end.',
    },
    hints: [
      'The past is fixed; maximize the free time still ahead.',
      'Compare right endpoints, not request lengths.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'choice-a', start: 0, end: 8, label: 'late finish' },
        { id: 'choice-b', start: 1, end: 3, label: 'early finish' },
      ],
      highlightedIntervalIds: ['choice-b'],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the sorting key used by the optimal stage strategy.',
    acceptedAnswers: [
      'end time',
      'ending time',
      'interval end',
      'earliest finish time',
      'finish time',
      'the end time',
      'end',
    ],
    placeholder: 'Sort by ...',
    feedback: {
      correct: 'Correct. Earliest finish is the greedy key.',
      incorrect: 'Name the endpoint that creates the most room after a kept act.',
      secondIncorrect: 'Answer: end time.',
    },
    hints: [
      'It is the right endpoint.',
      'The first kept interval should finish before every alternative.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the four steps used by the showcase scheduler.',
    feedback: {
      correct: 'The scheduler now keeps a maximum-size compatible set.',
      incorrect: 'Compatibility decisions happen only after sorting by finish time.',
      secondIncorrect:
        'Sort by end, track the kept end, then keep compatible requests or count a removal.',
    },
    hints: [
      'Choose an ordering before scanning.',
      'Only a kept request changes stage_end.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["requests"] as interval objects. Return the minimum integer number to remove; end-to-start touching is allowed.',
    starterCode: `def solve(data):
    requests = sorted(data["requests"], key=lambda item: item["end"])
    removals = 0
    stage_end = None

    for request in requests:
        # TODO: keep a compatible request or count its removal.
        pass

    return removals`,
    cases: {
      visibleExample: {
        input: {
          requests: [
            { start: 1, end: 7 },
            { start: 2, end: 3 },
            { start: 3, end: 5 },
            { start: 4, end: 6 },
          ],
        },
        expected: 2,
      },
      hiddenBoundary: {
        input: { requests: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          requests: [
            { start: -4, end: 1 },
            { start: -3, end: -2 },
            { start: -2, end: 0 },
            { start: 0, end: 2 },
            { start: 1, end: 3 },
          ],
        },
        expected: 2,
      },
    },
    feedback: {
      correct: 'The showcase keeps as many acts as one stage can hold.',
      incorrect:
        'The removal count is off. Check empty input, touching endpoints, and nested requests.',
      secondIncorrect:
        'If stage_end is None or start >= stage_end, keep and update it; otherwise increment removals.',
    },
    hints: [
      'Sort with key=lambda item: item["end"].',
      'Equality is compatible, so use >=.',
      'Do not update stage_end when removing a request.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'a', start: -3, end: -2 },
        { id: 'b', start: -2, end: 0 },
        { id: 'c', start: 0, end: 2 },
        { id: 'd', start: 1, end: 3 },
      ],
      highlightedIntervalIds: ['a', 'b', 'c'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  nonOverlappingIntervalsMissionSeed,
)

export default problemLesson
