import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const mergeKSortedListsMissionSeed = createRealm2MissionSeed({
  slug: 'merge-k-sorted-lists',
  estimatedMinutes: 27,
  mission: {
    title: 'The Many-Lane Medal Parade',
    context:
      'Several parade lanes each hold medal numbers in sorted linked order. The announcer needs one sorted chain, but merging every later lane into one ever-growing chain would repeat too much work.',
    prompt:
      'Merge all sorted linked lists and return the combined values. JSON represents each chain as one inner array.',
  },
  objective:
    'Merge k sorted lists in balanced pairwise rounds so every node participates in O(log k) merges.',
  priorKnowledge: [
    'Two sorted linked lists can be merged by pointer splicing.',
    'Pairing similarly sized results keeps repeated work balanced.',
    'An empty list is a valid merge partner.',
  ],
  recognitionCue:
    'Many sorted linked streams must become one, and total work should scale logarithmically with the number of streams.',
  misconception:
    'Merging list 1 with 2, then that whole result with 3, and so on can rescan early nodes k times.',
  keyRule:
    'Merge pairs at widths 1, 2, 4, and so on, doubling the group width after each round until one head remains.',
  algorithmSteps: [
    {
      id: 'build-list-heads',
      instruction: 'Collect the k linked-list heads and handle k = 0.',
    },
    {
      id: 'start-merge-width',
      instruction: 'Set the pairwise merge width to 1.',
    },
    {
      id: 'merge-round-pairs',
      instruction:
        'For each round, merge heads at group starts i and i + width when both exist.',
    },
    {
      id: 'store-merged-head',
      instruction: 'Store each merged head back at its group start.',
    },
    {
      id: 'double-merge-width',
      instruction: 'Double width after finishing the round.',
    },
    {
      id: 'return-only-head',
      instruction: 'Return the first head after all groups combine.',
    },
  ],
  complexity: {
    time: 'O(N log k)',
    space: 'O(1) auxiliary',
    explanation:
      'Across each of log k rounds, all N nodes are merged once. Existing nodes are spliced, aside from the input array of heads.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a1', value: 1, next: 'a2' },
        { id: 'a2', value: 5, next: null },
        { id: 'b1', value: 2, next: 'b2' },
        { id: 'b2', value: 6, next: null },
        { id: 'c1', value: 0, next: 'c2' },
        { id: 'c2', value: 7, next: null },
      ],
      pointers: [
        { nodeId: 'a1', label: 'list 0' },
        { nodeId: 'b1', label: 'list 1' },
        { nodeId: 'c1', label: 'list 2' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For lanes [1,5], [2,6], and [0,7], round one merges the first two into [1,2,5,6]. Round two merges that result with [0,7].',
    code: [
      'width 1: merge list 0 with list 1',
      'heads become [[1,2,5,6], [2,6], [0,7]]',
      'double width to 2',
      'width 2: merge group head 0 with group head 2',
      'result [0,1,2,5,6,7]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first round combines neighboring one-list groups.',
      'The unpaired third list safely waits for the next round.',
      'Doubling width makes each merge combine groups of similar maximum size.',
      'After logarithmically many rounds, the first slot holds every node.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'c1',
      nodes: [
        { id: 'c1', value: 0, next: 'a1' },
        { id: 'a1', value: 1, next: 'b1' },
        { id: 'b1', value: 2, next: 'a2' },
        { id: 'a2', value: 5, next: 'b2' },
        { id: 'b2', value: 6, next: 'c2' },
        { id: 'c2', value: 7, next: null },
      ],
      highlightedNodeIds: ['c1', 'a1', 'b1'],
    },
  },
  patternCheck: {
    prompt:
      'Which merge schedule avoids repeatedly scanning one huge early result?',
    options: [
      {
        id: 'balanced-rounds',
        label: 'Merge pairs in rounds and double the group width each round.',
      },
      {
        id: 'left-fold',
        label: 'Merge every next list into one growing result from left to right.',
      },
      {
        id: 'sort-values',
        label: 'Copy all values, discard every node, and run a comparison sort.',
      },
      {
        id: 'concatenate-only',
        label: 'Link list tails to later heads without comparing values.',
      },
    ],
    correctOptionId: 'balanced-rounds',
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a', value: 'group size 1', next: null },
        { id: 'b', value: 'group size 1', next: null },
      ],
      pointers: [
        { nodeId: 'a', label: 'left group' },
        { nodeId: 'b', label: 'right group' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'What sequence of merge widths keeps the rounds balanced?',
    acceptedAnswers: [
      '1, 2, 4, 8',
      'powers of two',
      'start at 1 and double each round',
      '1 2 4 8',
      'powers of 2',
      'doubling widths',
      'start at 1 and double every round',
      '1, 2, 4, 8, and so on',
    ],
    placeholder: 'Type the width pattern',
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a', value: 'width 1', next: 'b' },
        { id: 'b', value: 'width 2', next: 'c' },
        { id: 'c', value: 'width 4', next: null },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore balanced multi-list merging from head collection through pair rounds, stored heads, width doubling, and final return.',
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a', value: 1, next: null },
        { id: 'b', value: 2, next: null },
        { id: 'c', value: 3, next: null },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["lists"] is an array of sorted arrays representing linked chains. Merge their nodes in balanced rounds and return one values array.',
    starterCode: `class Node:
    def __init__(self, value, next_node=None):
        self.value = value
        self.next = next_node

def build(values):
    head = None
    for value in reversed(values):
        head = Node(value, head)
    return head

def to_values(head):
    values = []
    while head:
        values.append(head.value)
        head = head.next
    return values

def merge(left, right):
    # Splice two sorted chains and return their merged head.
    pass

def solve(data):
    heads = [build(values) for values in data["lists"]]
    if not heads:
        return []

    width = 1
    # Merge neighboring groups and double width after each round.
    pass

    return to_values(heads[0])`,
    cases: {
      visibleExample: {
        input: { lists: [[1, 5], [2, 6], [0, 7], []] },
        expected: [0, 1, 2, 5, 6, 7],
      },
      hiddenBoundary: {
        input: { lists: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { lists: [[-3, -1], [], [-2, -2], [4]] },
        expected: [-3, -2, -2, -1, 4],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 0, next: 'b' },
        { id: 'b', value: 1, next: 'c' },
        { id: 'c', value: 2, next: 'd' },
        { id: 'd', value: 5, next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(mergeKSortedListsMissionSeed)

export default problemLesson
