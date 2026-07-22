import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const reverseLinkedListMissionSeed = createRealm2MissionSeed({
  slug: 'reverse-linked-list',
  estimatedMinutes: 20,
  mission: {
    title: 'The Reversing Lantern Train',
    context:
      'A chain of lantern carts points from the engine toward the caboose. To send the train back through a one-way tunnel, every cart must point toward the cart that used to come before it.',
    prompt:
      'Reverse the entire linked chain and return its values from the new head to the new tail. The JSON input uses an array to describe the original chain.',
  },
  objective:
    'Reverse next pointers in one pass while preserving the unprocessed suffix.',
  priorKnowledge: [
    'Each node stores a value and a pointer to the next node.',
    'Changing next can disconnect the rest of a list.',
    'A null pointer marks the tail.',
  ],
  recognitionCue:
    'The required list order is exactly backward, and node links must change in place.',
  misconception:
    'Pointing current.next backward before saving its old next loses the remainder of the chain.',
  keyRule:
    'Before reversing current.next, save next_node; then advance previous = current and current = next_node.',
  algorithmSteps: [
    {
      id: 'set-reversal-pointers',
      instruction: 'Set previous to null and current to the original head.',
    },
    {
      id: 'save-forward-link',
      instruction: 'Save current.next before changing any link.',
    },
    {
      id: 'reverse-current-link',
      instruction: 'Point current.next to previous.',
    },
    {
      id: 'advance-previous',
      instruction: 'Move previous to current.',
    },
    {
      id: 'advance-current',
      instruction: 'Move current to the saved next node and repeat.',
    },
    {
      id: 'return-new-head',
      instruction: 'Return previous as the new head.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each node is visited once, and reversal uses a fixed number of node pointers beyond the output representation.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: 'c' },
        { id: 'c', value: 1, next: null },
      ],
      pointers: [
        { nodeId: 'a', label: 'current' },
        { nodeId: null, label: 'previous' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For 3 → 8 → 1, save 8 before redirecting 3 to null. Continue until 1 points to 8; then 1 is the new head.',
    code: [
      'previous = None, current = node(3)',
      'next_node = current.next',
      'current.next = previous',
      'previous, current = current, next_node',
      'repeat until current is None',
      'return previous',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Saving node 8 keeps the untouched suffix reachable.',
      'Node 3 becomes the temporary reversed tail.',
      'After two more rounds, links are 1 → 8 → 3.',
      'Current reaches null and previous points at the new head 1.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'c',
      nodes: [
        { id: 'a', value: 3, next: null },
        { id: 'b', value: 8, next: 'a' },
        { id: 'c', value: 1, next: 'b' },
      ],
      pointers: [
        { nodeId: 'c', label: 'previous' },
        { nodeId: null, label: 'current' },
      ],
      highlightedNodeIds: ['a', 'b', 'c'],
    },
  },
  patternCheck: {
    prompt:
      'Current points at a node whose next link is about to be reversed. What must happen first?',
    options: [
      {
        id: 'save-next-node',
        label: 'Save the original next node in a temporary pointer.',
      },
      {
        id: 'reverse-first',
        label: 'Reverse the link and then try to discover the old next node.',
      },
      {
        id: 'move-head',
        label: 'Move the head to the tail without changing any links.',
      },
      {
        id: 'sort-values',
        label: 'Sort node values and rebuild the list in descending order.',
      },
    ],
    correctOptionId: 'save-next-node',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: null },
      ],
      pointers: [{ nodeId: 'a', label: 'current' }],
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the pointer rule: save current.next, then set current.next to ______.',
    acceptedAnswers: ['previous', 'prev', 'the previous node', 'previous node'],
    placeholder: 'Type the backward pointer',
    diagram: {
      kind: 'linkedList',
      head: 'b',
      nodes: [
        { id: 'a', value: 3, next: null },
        { id: 'b', value: 8, next: 'a' },
      ],
      pointers: [{ nodeId: 'b', label: 'current' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Put the pointer moves in a safe order so the forward suffix stays reachable while each link reverses.',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 3, next: 'b' },
        { id: 'b', value: 8, next: 'c' },
        { id: 'c', value: 1, next: null },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["values"] describes a singly linked chain from head to tail. Reverse its node links and return the resulting values as an array.',
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
    current = build(data["values"])
    previous = None

    while current:
        # Reverse one link without losing the remaining chain.
        pass

    return to_values(previous)`,
    cases: {
      visibleExample: {
        input: { values: [3, 8, 1, 6] },
        expected: [6, 1, 8, 3],
      },
      hiddenBoundary: {
        input: { values: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { values: [4, 4, -1] },
        expected: [-1, 4, 4],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'd',
      nodes: [
        { id: 'a', value: 3, next: null },
        { id: 'b', value: 8, next: 'a' },
        { id: 'c', value: 1, next: 'b' },
        { id: 'd', value: 6, next: 'c' },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(reverseLinkedListMissionSeed)

export default problemLesson
