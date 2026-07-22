import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const lastStoneWeightMissionSeed = {
  slug: 'last-stone-weight',
  estimatedMinutes: 21,
  mission: {
    title: 'Run the Boulder Breaker',
    context:
      'A recycling machine repeatedly grabs the two heaviest crystal boulders. Equal boulders both shatter; otherwise their weight difference returns to the pile.',
    prompt:
      'Given an array of boulder weights, simulate the machine and return the final weight, or 0 when nothing remains.',
  },
  objective:
    'Use a max-priority queue to repeatedly remove the two largest values and reinsert a positive difference.',
  priorKnowledge: [
    'A priority queue quickly removes the current extreme value.',
    'Python can imitate a max-heap by storing negative numbers.',
  ],
  recognitionCue:
    'The process repeatedly asks for the two largest remaining items while the collection changes.',
  misconception:
    'Sorting once is not enough because each collision may insert a new weight in a different position.',
  algorithmSteps: [
    {
      id: 'build-max-heap',
      instruction: 'Put all weights into a max-heap.',
    },
    {
      id: 'take-two',
      instruction: 'While at least two remain, remove the two greatest weights.',
    },
    {
      id: 'compare-pair',
      instruction: 'If the weights differ, compute the larger minus the smaller.',
    },
    {
      id: 'return-difference',
      instruction: 'Push that positive difference back into the heap.',
    },
    {
      id: 'finish-weight',
      instruction: 'Return the remaining weight, or 0 for an empty heap.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'Heap construction and at most n collisions perform logarithmic removals and insertions on n stored weights.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: [8, 7, 4, 1, 2, 1],
      highlight: 0,
      pointers: [
        { index: 0, label: 'first: 8' },
        { index: 1, label: 'next: 7' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For [2, 7, 4, 1, 8, 1], the first pair is 8 and 7, so weight 1 returns. Repeating the process eventually leaves 1.',
    code: [
      'heap = [-weight for weight in weights]',
      'heapify(heap)',
      'while len(heap) > 1:',
      '    heavy = -heappop(heap)',
      '    next_heavy = -heappop(heap)',
      '    if heavy != next_heavy:',
      '        heappush(heap, -(heavy - next_heavy))',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The max pair 8 and 7 becomes a new boulder of weight 1.',
      'Next, 4 and 2 become weight 2.',
      'Later equal weights cancel until one weight-1 boulder remains.',
    ],
  },
  patternCheck: {
    prompt:
      'Which structure matches a machine that repeatedly needs the two heaviest current boulders?',
    options: [
      {
        id: 'max-priority-queue',
        label: 'A max-priority queue updated after each collision.',
      },
      {
        id: 'fifo-queue',
        label: 'A first-in, first-out queue in original array order.',
      },
      {
        id: 'single-sort',
        label: 'One initial sort with all differences appended at the end.',
      },
      {
        id: 'min-heap-direct',
        label: 'A min-heap that always removes the two lightest boulders.',
      },
    ],
    correctOptionId: 'max-priority-queue',
    feedback: {
      correct:
        'Exactly. Every new difference joins the same changing priority order.',
      incorrect:
        'That can select the wrong pair after the pile changes.',
      secondIncorrect:
        'Use a heap whose removals represent the largest current weights.',
    },
    hints: ['The next pair depends on the inserted difference.', 'Selection is by weight, not arrival order.'],
  },
  retrievalCheck: {
    prompt:
      'If the two removed weights are equal, what gets pushed back?',
    acceptedAnswers: [
      'nothing',
      'no value',
      'nothing is pushed',
      'none',
      'nothing gets pushed back',
      'no boulder',
      'nothing returns',
    ],
    placeholder: 'Collision result',
    feedback: {
      correct:
        'Right. Equal boulders both disappear.',
      incorrect:
        'Their difference is zero, and zero-weight boulders are not stored.',
      secondIncorrect:
        'Push nothing.',
    },
    hints: ['The machine shatters both.', 'Only a positive difference returns.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the boulder-machine simulation.',
    feedback: {
      correct:
        'The heap always supplies the correct pair, and only a positive remainder returns.',
      incorrect:
        'Take two before comparing, and finish only when fewer than two remain.',
      secondIncorrect:
        'Use build heap → take two → compare → push difference → finish.',
    },
    hints: ['The loop condition needs two items.', 'Empty and one-item endings are different heap states but easy to combine.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["weights"], repeatedly combine the two greatest weights by the stated rule, and return the remaining weight or 0.',
    starterCode: `import heapq

def solve(data):
    heap = [-weight for weight in data["weights"]]
    heapq.heapify(heap)

    while len(heap) > 1:
        # TODO: remove two maximum weights and push a positive difference.
        pass

    return -heap[0] if heap else 0`,
    cases: {
      visibleExample: {
        input: { weights: [2, 7, 4, 1, 8, 1] },
        expected: 1,
      },
      hiddenBoundary: {
        input: { weights: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { weights: [10, 10, 3, 3] },
        expected: 0,
      },
    },
    feedback: {
      correct:
        'The breaker handles empty piles, equal pairs, and new differences correctly.',
      incorrect:
        'The wrong pair was selected or a zero difference was reinserted.',
      secondIncorrect:
        'Pop two negated values, convert them positive, and push -(first-second) only when they differ.',
    },
    hints: [
      'The most negative stored number represents the greatest weight.',
      'The first popped positive weight is at least the second.',
      'Do not index heap[0] when the heap is empty.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: [10, 10, 3, 3],
      pointers: [
        { index: 0, label: 'equal pair' },
        { index: 1, label: 'equal pair' },
      ],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(lastStoneWeightMissionSeed)

export default problemLesson
