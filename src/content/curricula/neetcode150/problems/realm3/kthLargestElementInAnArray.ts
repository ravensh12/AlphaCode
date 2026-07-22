import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const kthLargestElementInAnArrayMissionSeed = {
  slug: 'kth-largest-element-in-an-array',
  estimatedMinutes: 22,
  mission: {
    title: 'Select the Arena Rank',
    context:
      'An arena has one finished batch of scores. The announcer needs the value at rank k from greatest to least, and tied scores occupy separate rank spots.',
    prompt:
      'Given a score array and valid 1-based k, return the kth-largest value without removing duplicate scores.',
  },
  objective:
    'Keep a size-k min-heap of the largest values so its root becomes the requested rank.',
  priorKnowledge: [
    'A size-k min-heap can represent the current k largest values.',
    'Equal values remain separate entries in a ranking.',
  ],
  recognitionCue:
    'The question asks for one order statistic—kth largest—rather than a fully sorted output.',
  misconception:
    'Converting scores to a set changes the ranking whenever duplicates exist.',
  algorithmSteps: [
    {
      id: 'open-heap',
      instruction: 'Create an empty min-heap.',
    },
    {
      id: 'push-value',
      instruction: 'Push each array value, including duplicates.',
    },
    {
      id: 'trim-to-k',
      instruction: 'If the heap grows beyond k, remove its minimum.',
    },
    {
      id: 'read-answer',
      instruction: 'After the scan, return the heap root.',
    },
  ],
  complexity: {
    time: 'O(n log k)',
    space: 'O(k)',
    explanation:
      'Each of n values performs heap work on at most k entries, and the heap stores only those k values.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [5, 6],
      highlight: 0,
      pointers: [{ index: 0, label: '2nd largest' }],
    },
  },
  workedExample: {
    prompt:
      'Scanning [3, 2, 1, 5, 6, 4] with k = 2 leaves the two leaders {5, 6}. Their min-heap root 5 is second-largest.',
    code: [
      'heap = []',
      'for score in scores:',
      '    heappush(heap, score)',
      '    if len(heap) > k:',
      '        heappop(heap)',
      'return heap[0]',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Small early scores can enter but are removed when the heap exceeds two.',
      'Scores 5 and 6 eventually replace all lower values.',
      'The smaller leader, 5, sits at the root and has rank two.',
    ],
  },
  patternCheck: {
    prompt:
      'Why must duplicate scores stay in the heap scan?',
    options: [
      {
        id: 'duplicates-have-ranks',
        label: 'Each array position occupies a rank, even when values tie.',
      },
      {
        id: 'heap-needs-unique',
        label: 'A heap rejects repeated values unless they are copied first.',
      },
      {
        id: 'duplicates-are-zero',
        label: 'Repeated scores should be replaced by zero.',
      },
      {
        id: 'rank-means-distinct',
        label: 'The kth rank always means kth distinct value.',
      },
    ],
    correctOptionId: 'duplicates-have-ranks',
    feedback: {
      correct:
        'Exactly. Two equal scores can occupy two separate ranking positions.',
      incorrect:
        'That changes the problem’s order statistic or misunderstands heap storage.',
      secondIncorrect:
        'Process every array entry; do not build a set.',
    },
    hints: ['Imagine scores [5, 5, 4] and k = 2.', 'The answer there is still 5.'],
  },
  retrievalCheck: {
    prompt:
      'After scanning all values, where is the kth-largest value in the size-k min-heap?',
    acceptedAnswers: [
      'at the root',
      'root',
      'heap root',
      'heap[0]',
      'the root',
      'at the top',
      'the top',
      'top of the heap',
    ],
    placeholder: 'Heap location',
    feedback: {
      correct:
        'Right. It is the smallest member of the retained top-k group.',
      incorrect:
        'Look for the minimum among the k largest values.',
      secondIncorrect:
        'It is at heap[0], the root.',
    },
    hints: ['This heap is a min-heap.', 'The retained group contains no values below rank k.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the fixed-batch rank selector.',
    feedback: {
      correct:
        'The scan keeps exactly the top-k multiset, then reads its cutoff.',
      incorrect:
        'Push before trimming, and return only after the full array is scanned.',
      secondIncorrect:
        'Use open heap → push → trim → read root.',
    },
    hints: ['The heap may contain fewer than k values early in the scan.', 'Every duplicate is pushed normally.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["scores"] and valid 1-based data["k"]; return the kth-largest integer while treating duplicate entries as separate ranks.',
    starterCode: `import heapq

def solve(data):
    scores = data["scores"]
    k = data["k"]
    heap = []

    for score in scores:
        # TODO: keep only the k largest score entries.
        pass

    return heap[0]`,
    cases: {
      visibleExample: {
        input: { scores: [3, 2, 1, 5, 6, 4], k: 2 },
        expected: 5,
      },
      hiddenBoundary: {
        input: { scores: [7], k: 1 },
        expected: 7,
      },
      hiddenAdversarial: {
        input: { scores: [4, 4, 4, 3, 3, 9], k: 4 },
        expected: 4,
      },
    },
    feedback: {
      correct:
        'Arena rank selected correctly, including duplicate-heavy standings.',
      incorrect:
        'The heap kept the wrong k values or duplicate ranks were removed.',
      secondIncorrect:
        'Push each score; when len(heap)>k, pop the minimum; finally return heap[0].',
    },
    hints: [
      'Use heapq.heappush and heapq.heappop.',
      'Never convert scores to a set.',
      'The input guarantees heap[0] exists after the scan.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [4, 4, 9, 4],
      highlight: 0,
      pointers: [{ index: 0, label: 'rank 4' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  kthLargestElementInAnArrayMissionSeed,
)

export default problemLesson
