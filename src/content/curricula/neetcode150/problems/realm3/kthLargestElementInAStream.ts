import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const kthLargestElementInAStreamMissionSeed = {
  slug: 'kth-largest-element-in-a-stream',
  estimatedMinutes: 25,
  mission: {
    title: 'Track the Medal Cutoff',
    context:
      'Scores arrive one at a time during a robot tournament. The display must show the score currently in kth place after every new result, including tied scores.',
    prompt:
      'Use the initial scores and addition events to return the kth-largest score after each event.',
  },
  objective:
    'Maintain a min-heap containing only the k largest values seen so its root is the kth-largest cutoff.',
  priorKnowledge: [
    'A min-heap exposes its smallest stored value at the root.',
    'Values outside the top k do not affect the kth-largest result.',
  ],
  recognitionCue:
    'Values arrive over time, and the same fixed rank must be reported after every addition.',
  misconception:
    'A max-heap of every score exposes first place, not the kth-place cutoff.',
  algorithmSteps: [
    {
      id: 'open-min-heap',
      instruction: 'Create a min-heap for the current top k scores.',
    },
    {
      id: 'add-score',
      instruction: 'Push each initial or arriving score into the heap.',
    },
    {
      id: 'trim-extra',
      instruction: 'When heap size exceeds k, remove its smallest value.',
    },
    {
      id: 'report-root',
      instruction: 'After each event, report the heap root as the kth-largest score.',
    },
  ],
  complexity: {
    time: 'O((n + e) log k)',
    space: 'O(k)',
    explanation:
      'Each of n initial and e event scores performs heap work bounded by log k, and only k scores remain.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [4, 5, 8],
      highlight: 0,
      pointers: [{ index: 0, label: '3rd largest' }],
    },
  },
  workedExample: {
    prompt:
      'With k = 3 and initial [4, 5, 8, 2], trimming leaves min-heap [4, 5, 8]. Adding 3 is trimmed, so the cutoff stays 4.',
    code: [
      'heap = []',
      'for score in initial:',
      '    heappush(heap, score)',
      '    if len(heap) > k: heappop(heap)',
      'for score in events:',
      '    heappush(heap, score)',
      '    if len(heap) > k: heappop(heap)',
      '    answers.append(heap[0])',
    ],
    currentLineIndex: 7,
    walkthrough: [
      'The initial heap keeps only scores 4, 5, and 8.',
      'Score 3 enters, becomes the smallest, and is removed.',
      'The root remains 4, which is third-largest among all results so far.',
    ],
  },
  patternCheck: {
    prompt:
      'Why is a size-k min-heap a good tournament display?',
    options: [
      {
        id: 'root-is-cutoff',
        label: 'It keeps the k leaders, with the kth-place score at the root.',
      },
      {
        id: 'root-is-winner',
        label: 'Its root always stores the largest score in the tournament.',
      },
      {
        id: 'stores-losers',
        label: 'It keeps only scores below kth place.',
      },
      {
        id: 'constant-sort',
        label: 'It fully sorts every score in constant time.',
      },
    ],
    correctOptionId: 'root-is-cutoff',
    feedback: {
      correct:
        'Exactly. The smallest among the k leaders is the kth-largest overall.',
      incorrect:
        'That describes a different heap direction or an impossible cost.',
      secondIncorrect:
        'Keep the top k values, then read the smallest of that group.',
    },
    hints: ['Everything below the cutoff can be discarded.', 'The root should be the easiest leader to replace.'],
  },
  retrievalCheck: {
    prompt:
      'When the heap grows to k + 1 values, which value is removed?',
    acceptedAnswers: [
      'the smallest',
      'smallest',
      'the minimum',
      'minimum',
      'min',
      'the min',
      'the smallest value',
      'the root',
      'the heap root',
    ],
    placeholder: 'Value to remove',
    feedback: {
      correct:
        'Right. Removing the smallest restores exactly the k leaders.',
      incorrect:
        'The heap should retain the largest k values.',
      secondIncorrect:
        'Remove the minimum.',
    },
    hints: ['This is a min-heap.', 'The new value may be the one removed.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the streaming cutoff routine.',
    feedback: {
      correct:
        'Every score enters, extras leave from the minimum, and the root reports the rank.',
      incorrect:
        'Trim only after pushing, and report only after the event heap is valid.',
      secondIncorrect:
        'Use open heap → add → trim → report root.',
    },
    hints: ['Initial scores use the same push-and-trim rule.', 'Ties remain as separate scores.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read k, initial score array, and event score array. Return the kth-largest score after each event; inputs guarantee at least k total scores by the first report.',
    starterCode: `import heapq

def solve(data):
    k = data["k"]
    heap = []

    for score in data["initial"]:
        # TODO: push and keep only k values.
        pass

    answers = []
    for score in data["events"]:
        # TODO: update the cutoff heap and append its root.
        pass
    return answers`,
    cases: {
      visibleExample: {
        input: { k: 3, initial: [4, 5, 8, 2], events: [3, 5, 10, 9, 4] },
        expected: [4, 5, 5, 8, 8],
      },
      hiddenBoundary: {
        input: { k: 1, initial: [], events: [-2] },
        expected: [-2],
      },
      hiddenAdversarial: {
        input: { k: 3, initial: [5, 5], events: [5, 4, 6] },
        expected: [5, 5, 5],
      },
    },
    feedback: {
      correct:
        'The medal cutoff updates correctly for negatives, ties, and changing leaders.',
      incorrect:
        'The heap kept the wrong side of the ranking or reported before trimming.',
      secondIncorrect:
        'heappush every score; if len(heap)>k, heappop; append heap[0] after each event.',
    },
    hints: [
      'Python heapq is a min-heap.',
      'Do not remove duplicate values.',
      'Initial scores prepare the heap but produce no output.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [5, 5, 5],
      highlight: 0,
      pointers: [{ index: 0, label: 'cutoff with ties' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  kthLargestElementInAStreamMissionSeed,
)

export default problemLesson
