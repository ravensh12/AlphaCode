import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const linkedListCycleMissionSeed = createRealm2MissionSeed({
  slug: 'linked-list-cycle',
  estimatedMinutes: 20,
  mission: {
    title: 'The Endless Beacon Route',
    context:
      'Maintenance beacons point to the next stop on a one-way route. A damaged final beacon may point back to an earlier stop, trapping a robot in an endless loop.',
    prompt:
      'Report whether the linked route contains a cycle. JSON provides node values and a tail-link index; -1 means the tail points to null.',
  },
  objective:
    'Detect a linked-list cycle with slow and fast pointers using constant extra space.',
  priorKnowledge: [
    'Pointers compare node identity, not just stored value.',
    'A fast pointer can move two links for every one slow link.',
    'An acyclic list eventually reaches null.',
  ],
  recognitionCue:
    'Following next pointers may revisit a node, but storing all visited nodes is avoidable.',
  misconception:
    'Equal node values do not prove a cycle because separate nodes may carry the same value.',
  keyRule:
    'Move slow one link and fast two; equal node identities prove a cycle, while fast reaching null proves no cycle.',
  algorithmSteps: [
    {
      id: 'place-cycle-pointers',
      instruction: 'Set slow and fast to the head.',
    },
    {
      id: 'guard-fast-links',
      instruction: 'Continue only while fast and fast.next both exist.',
    },
    {
      id: 'move-cycle-pointers',
      instruction: 'Move slow one link and fast two links.',
    },
    {
      id: 'check-pointer-meeting',
      instruction: 'If slow and fast are the same node, return true.',
    },
    {
      id: 'report-no-cycle',
      instruction: 'If fast reaches the end, return false.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'In a cycle, the fast pointer gains one step per round until it meets slow; without a cycle it reaches null, using two pointers.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: 'c' },
        { id: 'c', value: 1, next: 'd' },
        { id: 'd', value: 6, next: 'b' },
      ],
      pointers: [
        { nodeId: 'b', label: 'slow' },
        { nodeId: 'd', label: 'fast' },
      ],
    },
  },
  workedExample: {
    prompt:
      'In 3 → 8 → 1 → 6 with 6 pointing back to 8, slow moves one edge and fast moves two. Once both are inside the loop, fast closes the gap and they meet.',
    code: [
      'start: slow=3, fast=3',
      'round 1: slow=8, fast=1',
      'round 2: slow=1, fast=8',
      'round 3: slow=6, fast=6',
      'same node -> return True',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Neither pointer can leave the cycle after entering it.',
      'Fast moves one net step closer to slow around the loop each round.',
      'Their values are not the evidence; their object identity is.',
      'Meeting at node 6 proves some next pointer repeats the route.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: 'c' },
        { id: 'c', value: 1, next: 'd' },
        { id: 'd', value: 6, next: 'b' },
      ],
      pointers: [
        { nodeId: 'd', label: 'slow' },
        { nodeId: 'd', label: 'fast' },
      ],
      highlightedNodeIds: ['d'],
    },
  },
  patternCheck: {
    prompt:
      'Which event is valid proof that the route loops?',
    options: [
      {
        id: 'same-node-meeting',
        label: 'Slow and fast point to the exact same node.',
      },
      {
        id: 'equal-values',
        label: 'Two different nodes happen to store equal values.',
      },
      {
        id: 'fast-ahead',
        label: 'Fast is visually farther along the list than slow.',
      },
      {
        id: 'long-route',
        label: 'The robot has taken more than ten steps.',
      },
    ],
    correctOptionId: 'same-node-meeting',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 2, next: 'b' },
        { id: 'b', value: 2, next: 'a' },
      ],
      pointers: [
        { nodeId: 'a', label: 'slow' },
        { nodeId: 'a', label: 'fast' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'How many next links do slow and fast move per round?',
    acceptedAnswers: [
      'slow moves 1 and fast moves 2',
      'one for slow, two for fast',
      'slow one link fast two links',
      'slow moves one and fast moves two',
      'slow 1, fast 2',
      'slow 1 fast 2',
      'slow one fast two',
    ],
    placeholder: 'Type both speeds',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: null },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the cycle detector from pointer placement through safe movement, identity comparison, and the null-ending result.',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: 'a' },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["values"] creates the next chain; data["pos"] is the index the tail points back to, or -1. Return whether the built list cycles.',
    starterCode: `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None

def build(values, pos):
    nodes = [Node(value) for value in values]
    for index in range(len(nodes) - 1):
        nodes[index].next = nodes[index + 1]
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0] if nodes else None

def solve(data):
    head = build(data["values"], data["pos"])
    slow = fast = head

    # Move at two speeds and compare node identities safely.
    pass

    return False`,
    cases: {
      visibleExample: {
        input: { values: [3, 8, 1, 6], pos: 1 },
        expected: true,
      },
      hiddenBoundary: {
        input: { values: [], pos: -1 },
        expected: false,
      },
      hiddenAdversarial: {
        input: { values: [4], pos: 0 },
        expected: true,
      },
    },
    verificationNotes: [
      'The browser verifies cycle behavior on lists built from the supplied tail-link index.',
      'Because that JSON index is visible to solve, tests cannot prove Floyd pointer use or O(1) space; the submitted implementation must still inspect the built nodes.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: 'c' },
        { id: 'c', value: 1, next: 'd' },
        { id: 'd', value: 6, next: 'b' },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(linkedListCycleMissionSeed)

export default problemLesson
