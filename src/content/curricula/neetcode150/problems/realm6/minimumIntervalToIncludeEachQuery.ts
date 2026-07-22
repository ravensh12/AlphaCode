import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const minimumIntervalToIncludeEachQueryMissionSeed = {
  slug: 'minimum-interval-to-include-each-query',
  estimatedMinutes: 30,
  mission: {
    title: 'The Shortest Radio Window',
    context:
      'A field team has inclusive radio windows, each recorded with a start and end minute. Cadets ask whether specific minutes are covered.',
    prompt:
      'For every query minute, return the length of the shortest radio window containing it. Return -1 when no window covers that minute, and preserve query order.',
  },
  objective:
    'Sweep sorted queries while a min-heap ranks active intervals by inclusive length.',
  priorKnowledge: [
    'An inclusive interval length is end - start + 1.',
    'A heap can order pairs by their first value.',
    'Sorting queries with original indices allows answers to be restored.',
  ],
  recognitionCue:
    'Many point queries ask for the best interval containing each point.',
  misconception:
    'Choosing the interval with the earliest end is not enough; a later-ending interval can still be shorter.',
  algorithmSteps: [
    {
      id: 'sort-inputs',
      instruction:
        'Sort intervals by start and query/index pairs by query value.',
    },
    {
      id: 'activate-windows',
      instruction:
        'For each query, push every interval whose start is at most that query.',
    },
    {
      id: 'discard-expired',
      instruction:
        'Pop heap entries whose end is earlier than the query.',
    },
    {
      id: 'record-shortest',
      instruction:
        'Use the smallest active length, or -1 if the heap is empty.',
    },
    {
      id: 'restore-order',
      instruction: 'Store each result at its query’s original index.',
    },
  ],
  complexity: {
    time: 'O((n + q) log(n + q))',
    space: 'O(n + q)',
    explanation:
      'Sorting n intervals and q queries plus heap pushes and pops dominates; the heap and answer store linear data.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'wide', start: 1, end: 4, label: 'length 4' },
        { id: 'short', start: 2, end: 4, label: 'length 3' },
        { id: 'later', start: 3, end: 6, label: 'length 4' },
      ],
      highlightedIntervalIds: ['wide', 'short'],
      cursor: 2,
    },
  },
  workedExample: {
    prompt:
      'At query 3, windows [1, 4], [2, 4], and [3, 6] are active. Their lengths are 4, 3, and 4, so the heap reports 3.',
    code: [
      'query = 3',
      'push (4, 4) for [1, 4]',
      'push (3, 4) for [2, 4]',
      'push (4, 6) for [3, 6]',
      'heap minimum length = 3',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'All three starts are no greater than 3, so all enter the heap.',
      'Every end is at least 3, so none has expired.',
      'The heap orders first by inclusive length.',
      'Window [2, 4] is shortest, so this query receives 3.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'w1', start: 1, end: 4, label: '4' },
        { id: 'w2', start: 2, end: 4, label: '3' },
        { id: 'w3', start: 3, end: 6, label: '4' },
      ],
      highlightedIntervalIds: ['w2'],
      cursor: 3,
    },
  },
  patternCheck: {
    prompt:
      'What should each heap entry store so its top answers the current query?',
    options: [
      {
        id: 'length-and-end',
        label: 'Inclusive interval length first, then its end.',
      },
      {
        id: 'start-only',
        label: 'Only the interval start.',
      },
      {
        id: 'query-index',
        label: 'Only the query’s original index.',
      },
    ],
    correctOptionId: 'length-and-end',
    feedback: {
      correct:
        'Yes. Length chooses the best window, and end tells when that choice expires.',
      incorrect: 'The heap needs one value for ranking and another for expiration.',
      secondIncorrect:
        'Store (end - start + 1, end), with length first.',
    },
    hints: [
      'What determines “shortest”?',
      'What tells whether a window still covers the query?',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'candidate-a', start: 0, end: 8, label: '(9, 8)' },
        { id: 'candidate-b', start: 4, end: 6, label: '(3, 6)' },
      ],
      highlightedIntervalIds: ['candidate-b'],
      cursor: 5,
    },
  },
  retrievalCheck: {
    prompt:
      'Type the formula for the length of an inclusive interval [start, end].',
    acceptedAnswers: [
      'end - start + 1',
      'end-start+1',
      '1 + end - start',
      'end minus start plus 1',
      'end minus start plus one',
    ],
    placeholder: 'length = ...',
    feedback: {
      correct: 'Correct. Both endpoints count.',
      incorrect: 'A one-point interval must have length 1.',
      secondIncorrect: 'Use end - start + 1.',
    },
    hints: [
      'For [4, 4], the answer is 1.',
      'Subtract endpoints, then include the starting point.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Put the query-sweep actions in the order that keeps the heap valid.',
    feedback: {
      correct: 'The sweep activates, expires, and answers each query in order.',
      incorrect: 'A query can be answered only after eligible starts enter and expired ends leave.',
      secondIncorrect:
        'Sort, activate starts, discard old ends, record the heap minimum, then restore original order.',
    },
    hints: [
      'Activation happens before reading the best active window.',
      'Use original indices when writing answers.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["intervals"] as inclusive start/end objects and data["queries"] as integers. Return shortest lengths in the original query order, using -1 for uncovered queries.',
    starterCode: `import heapq

def solve(data):
    intervals = sorted(data["intervals"], key=lambda item: item["start"])
    ordered_queries = sorted(enumerate(data["queries"]), key=lambda pair: pair[1])
    answers = [-1] * len(ordered_queries)
    active = []
    interval_index = 0

    for original_index, query in ordered_queries:
        # TODO: push eligible intervals, remove expired ones, then answer.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          intervals: [
            { start: 1, end: 4 },
            { start: 2, end: 4 },
            { start: 3, end: 6 },
            { start: 8, end: 9 },
          ],
          queries: [2, 3, 5, 8],
        },
        expected: [3, 3, 4, 2],
      },
      hiddenBoundary: {
        input: { intervals: [], queries: [7] },
        expected: [-1],
      },
      hiddenAdversarial: {
        input: {
          intervals: [
            { start: -5, end: 5 },
            { start: -2, end: -2 },
            { start: 0, end: 0 },
            { start: 2, end: 10 },
          ],
          queries: [-2, 0, 6, 11],
        },
        expected: [1, 1, 9, -1],
      },
    },
    feedback: {
      correct: 'Each cadet receives the shortest active radio window in the requested order.',
      incorrect:
        'A query result failed. Recheck inclusive lengths, expired windows, and restoration of original order.',
      secondIncorrect:
        'Push (length, end) while start <= query; pop while end < query; use active[0][0].',
    },
    hints: [
      'Advance interval_index only when an interval is pushed.',
      'An interval expires when its end is strictly less than the query.',
      'Write to answers[original_index].',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'point-a', start: -2, end: -2, label: 'length 1' },
        { id: 'wide', start: -5, end: 5, label: 'length 11' },
        { id: 'point-b', start: 0, end: 0, label: 'length 1' },
      ],
      highlightedIntervalIds: ['point-a', 'point-b'],
      cursor: 0,
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  minimumIntervalToIncludeEachQueryMissionSeed,
)

export default problemLesson
