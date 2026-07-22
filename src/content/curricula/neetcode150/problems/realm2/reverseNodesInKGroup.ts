import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const reverseNodesInKGroupMissionSeed = createRealm2MissionSeed({
  slug: 'reverse-nodes-in-k-group',
  estimatedMinutes: 30,
  mission: {
    title: 'The Cargo-Car Turntables',
    context:
      'A linked cargo train passes through turntables that can reverse exactly k connected cars at a time. A final short group cannot fit and must keep its original order.',
    prompt:
      'Reverse every complete group of k nodes and return the resulting values. JSON uses an array for the original train.',
  },
  objective:
    'Reverse fixed-size linked groups in place while preserving incomplete suffixes and reconnecting group boundaries.',
  priorKnowledge: [
    'A dummy node can anchor changes to the first real group.',
    'A list segment can be reversed until an exclusive boundary node.',
    'The original group head becomes its tail after reversal.',
  ],
  recognitionCue:
    'The list needs local reversals of an exact size, with a leftover suffix explicitly preserved.',
  misconception:
    'Starting reversal before confirming k nodes remain can incorrectly reverse the final incomplete group.',
  keyRule:
    'First locate the kth node; if absent stop, otherwise save groupNext, reverse only until that boundary, and reconnect both ends.',
  algorithmSteps: [
    {
      id: 'create-group-dummy',
      instruction: 'Create a dummy before head and set groupPrev to it.',
    },
    {
      id: 'locate-kth-node',
      instruction: 'Walk k links from groupPrev to locate the kth node.',
    },
    {
      id: 'stop-short-group',
      instruction: 'If the kth node is absent, return dummy.next unchanged.',
    },
    {
      id: 'save-group-boundary',
      instruction: 'Save groupNext as kth.next.',
    },
    {
      id: 'reverse-complete-group',
      instruction:
        'Reverse pointers from the group head up to, but not including, groupNext.',
    },
    {
      id: 'reconnect-and-advance',
      instruction:
        'Connect groupPrev to kth, connect the old head to groupNext, and make the old head the next groupPrev.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each node is counted and reversed a constant number of times, while only boundary and reversal pointers are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: 'c' },
        { id: 'c', value: 3, next: 'd' },
        { id: 'd', value: 4, next: null },
      ],
      pointers: [
        { nodeId: 'a', label: 'group head' },
        { nodeId: 'c', label: 'kth' },
        { nodeId: 'd', label: 'groupNext' },
      ],
      highlightedNodeIds: ['a', 'b', 'c'],
    },
  },
  workedExample: {
    prompt:
      'For 1 → 2 → 3 → 4 → 5 → 6 → 7 with k=3, reverse the first two complete triples. Node 7 remains alone and unchanged.',
    code: [
      'group [1,2,3], groupNext = node 4',
      'reverse -> 3 -> 2 -> 1 -> 4',
      'groupPrev becomes old head node 1',
      'group [4,5,6], groupNext = node 7',
      'reverse -> 6 -> 5 -> 4 -> 7',
      'fewer than 3 nodes remain -> stop',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Finding kth before changing links proves the group is complete.',
      'The saved boundary keeps the rest of the train reachable.',
      'After reversal, the old head is the correct predecessor for the next group.',
      'The last one-node suffix fails the kth check and keeps its order.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'c',
      nodes: [
        { id: 'c', value: 3, next: 'b' },
        { id: 'b', value: 2, next: 'a' },
        { id: 'a', value: 1, next: 'f' },
        { id: 'f', value: 6, next: 'e' },
        { id: 'e', value: 5, next: 'd' },
        { id: 'd', value: 4, next: 'g' },
        { id: 'g', value: 7, next: null },
      ],
      highlightedNodeIds: ['c', 'b', 'a', 'f', 'e', 'd'],
    },
  },
  patternCheck: {
    prompt:
      'What must happen before any pointers in the next group are reversed?',
    options: [
      {
        id: 'confirm-kth',
        label: 'Locate the kth node and stop if it does not exist.',
      },
      {
        id: 'reverse-until-null',
        label: 'Start reversing and continue until null regardless of group size.',
      },
      {
        id: 'copy-values',
        label: 'Copy and sort all node values in the group.',
      },
      {
        id: 'drop-boundary',
        label: 'Erase the link after the group without saving it.',
      },
    ],
    correctOptionId: 'confirm-kth',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: null },
      ],
      pointers: [{ nodeId: 'b', label: 'only 2 of k=3' }],
    },
  },
  retrievalCheck: {
    prompt:
      'After reversing a full group, which original node becomes groupPrev for the next round?',
    acceptedAnswers: [
      'the old group head',
      'the original first node',
      'the node that became the group tail',
      'the old head',
      'the original group head',
      'the original head of the group',
      'the new group tail',
    ],
    placeholder: 'Type the next group predecessor',
    diagram: {
      kind: 'linkedList',
      head: 'c',
      nodes: [
        { id: 'a', value: 1, next: 'd' },
        { id: 'b', value: 2, next: 'a' },
        { id: 'c', value: 3, next: 'b' },
        { id: 'd', value: 4, next: null },
      ],
      pointers: [{ nodeId: 'a', label: 'groupPrev' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore grouped reversal from dummy setup through kth confirmation, boundary save, bounded reversal, reconnection, and advancement.',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: 'c' },
        { id: 'c', value: 3, next: 'd' },
        { id: 'd', value: 4, next: null },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["values"] represents a singly linked train and data["k"] is positive. Reverse every complete k-node group and return the values.',
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

def solve(data):
    head = build(data["values"])
    k = data["k"]
    dummy = Node(0, head)
    group_prev = dummy

    # Confirm a full group, reverse to its saved boundary, and reconnect.
    pass

    return to_values(dummy.next)`,
    cases: {
      visibleExample: {
        input: { values: [1, 2, 3, 4, 5, 6, 7], k: 3 },
        expected: [3, 2, 1, 6, 5, 4, 7],
      },
      hiddenBoundary: {
        input: { values: [], k: 2 },
        expected: [],
      },
      hiddenAdversarial: {
        input: { values: [1, 2, 3, 4, 5], k: 4 },
        expected: [4, 3, 2, 1, 5],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'c',
      nodes: [
        { id: 'c', value: 3, next: 'b' },
        { id: 'b', value: 2, next: 'a' },
        { id: 'a', value: 1, next: 'f' },
        { id: 'f', value: 6, next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  reverseNodesInKGroupMissionSeed,
)

export default problemLesson
