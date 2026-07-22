import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const findMedianFromDataStreamMissionSeed = {
  slug: 'find-median-from-data-stream',
  estimatedMinutes: 30,
  mission: {
    title: 'Balance the Live Scoreboard',
    context:
      'A science fair scoreboard receives measurements over time. Whenever a median event appears, it must report the middle value without sorting the full history again.',
    prompt:
      'Process add and median events, returning each current median as an integer or .5 number.',
  },
  objective:
    'Maintain a max-heap for the lower half and a min-heap for the upper half, keeping their sizes balanced.',
  priorKnowledge: [
    'A median depends only on the greatest lower-half value and smallest upper-half value.',
    'Python can represent a max-heap with negated values.',
  ],
  recognitionCue:
    'Numbers arrive over time and median queries repeat between insertions.',
  misconception:
    'Keeping one heap exposes only one extreme and cannot locate the middle from both sides.',
  algorithmSteps: [
    {
      id: 'choose-half',
      instruction: 'Add the new value to the lower max-heap or upper min-heap by comparing with the lower root.',
    },
    {
      id: 'order-halves',
      instruction: 'Ensure every lower-half value is no greater than every upper-half value.',
    },
    {
      id: 'balance-sizes',
      instruction: 'Move a root when either heap is more than one item larger.',
    },
    {
      id: 'report-middle',
      instruction: 'Use the larger heap root, or average both roots when sizes match.',
    },
  ],
  complexity: {
    time: 'O(log n) add; O(1) median',
    space: 'O(n)',
    explanation:
      'Each insertion performs a constant number of heap operations, while a query reads one or two roots; all n values remain stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: ['lower:1'],
      highlight: 0,
      pointers: [{ index: 0, label: 'left middle' }],
    },
    diagramSequence: [
      {
        kind: 'tree',
        variant: 'heap',
        heapKind: 'max',
        values: ['lower:1'],
      },
      {
        kind: 'tree',
        variant: 'heap',
        heapKind: 'min',
        values: ['upper:2'],
      },
    ],
  },
  workedExample: {
    prompt:
      'After adding 1, median is 1. Adding 2 balances halves [1] and [2], so median is 1.5. Adding 3 gives the upper half one extra item, so median is 2.',
    code: [
      'if not lower or value <= -lower[0]: heappush(lower, -value)',
      'else: heappush(upper, value)',
      'if len(lower) > len(upper) + 1: heappush(upper, -heappop(lower))',
      'if len(upper) > len(lower) + 1: heappush(lower, -heappop(upper))',
      'median = (-lower[0] + upper[0]) / 2 if sizes_equal else larger_root',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Value 1 begins in the lower half.',
      'Value 2 enters the upper half, putting one middle value on each side.',
      'Value 3 also starts above; the upper root 2 becomes the single middle value.',
    ],
  },
  patternCheck: {
    prompt:
      'What invariant makes a median query constant time?',
    options: [
      {
        id: 'ordered-balanced-halves',
        label: 'The halves are ordered, and their sizes differ by at most one.',
      },
      {
        id: 'one-max-heap',
        label: 'All values sit in one max-heap with the largest at its root.',
      },
      {
        id: 'equal-sums',
        label: 'The two heaps always have the same numeric sum.',
      },
      {
        id: 'alternating-input',
        label: 'Incoming values must alternate smaller and larger.',
      },
    ],
    correctOptionId: 'ordered-balanced-halves',
    feedback: {
      correct:
        'Exactly. The middle can only be at one root or between the two roots.',
      incorrect:
        'That does not guarantee the middle values are exposed.',
      secondIncorrect:
        'Keep a lower max-heap and upper min-heap with sizes within one.',
    },
    hints: ['The median separates lower and upper halves.', 'Only their boundary values are needed.'],
  },
  retrievalCheck: {
    prompt:
      'When the heaps have equal size, how is the median computed?',
    acceptedAnswers: [
      'average the two roots',
      'the average of the two roots',
      'add the two roots and divide by 2',
      'average of the two roots',
      'average the roots',
      'average of both roots',
      'mean of the two roots',
      'average both roots',
    ],
    placeholder: 'Median rule',
    feedback: {
      correct:
        'Right. The two roots are the pair of middle values.',
      incorrect:
        'An even number of values has two middle positions.',
      secondIncorrect:
        'Average the lower maximum and upper minimum.',
    },
    hints: ['One root borders the middle from below.', 'The other borders it from above.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the live median update.',
    feedback: {
      correct:
        'Placement preserves ordering, rebalancing protects sizes, and roots answer the query.',
      incorrect:
        'Choose a half before rebalancing, and report only after both invariants hold.',
      secondIncorrect:
        'Use choose half → order halves → balance sizes → report.',
    },
    hints: ['A root move transfers the nearest boundary value.', 'Median events do not change either heap.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Events are {"op":"add","value":n} or {"op":"median"}. Return medians only; every median event follows at least one add.',
    starterCode: `import heapq

def solve(data):
    lower = []  # negatives: max-heap
    upper = []  # positives: min-heap
    answers = []

    for event in data["events"]:
        if event["op"] == "add":
            value = event["value"]
            # TODO: place value and rebalance the two heaps.
            pass
        else:
            # TODO: append the one-root or two-root median.
            pass
    return answers`,
    cases: {
      visibleExample: {
        input: {
          events: [
            { op: 'add', value: 1 },
            { op: 'median' },
            { op: 'add', value: 2 },
            { op: 'median' },
            { op: 'add', value: 3 },
            { op: 'median' },
          ],
        },
        expected: [1, 1.5, 2],
      },
      hiddenBoundary: {
        input: { events: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          events: [
            { op: 'add', value: -5 },
            { op: 'add', value: -1 },
            { op: 'median' },
            { op: 'add', value: -3 },
            { op: 'median' },
            { op: 'add', value: 100 },
            { op: 'median' },
          ],
        },
        expected: [-3, -3, -2],
      },
    },
    feedback: {
      correct:
        'The live scoreboard reports exact medians across odd, even, empty-log, and negative cases.',
      incorrect:
        'A heap sign, ordering boundary, size balance, or even-count average is wrong.',
      secondIncorrect:
        'Push lower as negatives; move a root if sizes differ by more than one; read the larger root or average -lower[0] and upper[0].',
    },
    hints: [
      'Compare a new value with -lower[0] when lower is nonempty.',
      'Python treats 1 and 1.0 as equal JSON numbers, but use / for a two-value average.',
      'Median events never push or pop.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: ['upper:-1', 'upper:100'],
      highlight: 0,
      pointers: [{ index: 0, label: 'upper middle' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(findMedianFromDataStreamMissionSeed)

export default problemLesson
