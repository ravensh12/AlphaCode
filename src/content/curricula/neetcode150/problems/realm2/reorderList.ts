import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const reorderListMissionSeed = createRealm2MissionSeed({
  slug: 'reorder-list',
  estimatedMinutes: 26,
  mission: {
    title: 'The Zippered Field-Trip Line',
    context:
      'Students stand in one linked line. A guide wants the first student, then the last, then the second, then the second-last, continuing inward like a zipper.',
    prompt:
      'Rewire the list into that alternating outside-in order and return its values. The JSON array represents the original chain.',
  },
  objective:
    'Reorder a list in place by splitting at the middle, reversing the second half, and weaving both halves.',
  priorKnowledge: [
    'Slow and fast pointers can locate a list midpoint.',
    'A linked-list suffix can be reversed with three pointers.',
    'Two chains can be interleaved by saving both next links.',
  ],
  recognitionCue:
    'Output alternates from the front and back of the same linked sequence.',
  misconception:
    'Trying to take the tail repeatedly requires rescanning a singly linked list and can grow to quadratic time.',
  keyRule:
    'Split the chain, reverse the second half so back nodes become forward-accessible, then alternate one node from each half while saving next links.',
  algorithmSteps: [
    {
      id: 'find-first-half-tail',
      instruction:
        'Use slow and fast pointers to stop slow at the end of the first half.',
    },
    {
      id: 'split-list',
      instruction: 'Detach the second half after slow.',
    },
    {
      id: 'reverse-second-half',
      instruction: 'Reverse the detached second half.',
    },
    {
      id: 'save-half-nexts',
      instruction:
        'Before each weave, save the next nodes from both halves.',
    },
    {
      id: 'weave-one-pair',
      instruction:
        'Link a first-half node to a second-half node, then back to the saved first next.',
    },
    {
      id: 'return-reordered-head',
      instruction: 'Continue until the second half ends and return the head.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Midpoint search, reversal, and weaving each traverse at most the list length and use a fixed set of pointers.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: 'c' },
        { id: 'c', value: 3, next: 'd' },
        { id: 'd', value: 4, next: 'e' },
        { id: 'e', value: 5, next: null },
      ],
      pointers: [
        { nodeId: 'c', label: 'middle' },
        { nodeId: 'e', label: 'tail' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For 1 → 2 → 3 → 4 → 5, split after 3. Reverse 4 → 5 into 5 → 4, then weave to form 1 → 5 → 2 → 4 → 3.',
    code: [
      'first = 1 -> 2 -> 3',
      'second = 4 -> 5',
      'reverse second -> 5 -> 4',
      'weave 1, 5, then 2, 4',
      'leave middle node 3 at the end',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Fast and slow pointers place the odd middle node in the first half.',
      'Reversal changes the back half into tail-first order.',
      'Saving each next pointer prevents either half from being lost while links change.',
      'The first half may own one extra node, which naturally remains last.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'e' },
        { id: 'e', value: 5, next: 'b' },
        { id: 'b', value: 2, next: 'd' },
        { id: 'd', value: 4, next: 'c' },
        { id: 'c', value: 3, next: null },
      ],
      highlightedNodeIds: ['e', 'd'],
    },
  },
  patternCheck: {
    prompt:
      'Why reverse the second half before weaving?',
    options: [
      {
        id: 'tail-first-access',
        label:
          'It makes original tail-side nodes available in the needed forward order.',
      },
      {
        id: 'sort-values',
        label: 'It sorts all values before the two halves are joined.',
      },
      {
        id: 'remove-middle',
        label: 'It deletes the middle node from odd-length lists.',
      },
      {
        id: 'avoid-splitting',
        label: 'It makes finding and detaching the midpoint unnecessary.',
      },
    ],
    correctOptionId: 'tail-first-access',
    diagram: {
      kind: 'linkedList',
      head: 'e',
      nodes: [
        { id: 'd', value: 4, next: null },
        { id: 'e', value: 5, next: 'd' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Name the three phases of the linear-time reorder method in order.',
    acceptedAnswers: [
      'split, reverse, weave',
      'find the middle and split, reverse the second half, merge alternately',
      'split reverse interleave',
      'split reverse weave',
      'split, reverse, interleave',
      'split, reverse, merge',
      'split reverse merge',
    ],
    placeholder: 'Type the three phases',
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
      'Restore the zipper routine from midpoint discovery through splitting, reversing, safe pointer saves, and weaving.',
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
      'Write solve(data). data["values"] represents a singly linked list. Rewire its nodes outside-in and return the new values array.',
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
    if head is None:
        return []

    # Find and split the halves, reverse the second, then weave them.
    pass

    return to_values(head)`,
    cases: {
      visibleExample: {
        input: { values: [1, 2, 3, 4, 5] },
        expected: [1, 5, 2, 4, 3],
      },
      hiddenBoundary: {
        input: { values: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { values: [1, 2, 3, 4, 5, 6] },
        expected: [1, 6, 2, 5, 3, 4],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'e' },
        { id: 'e', value: 5, next: 'b' },
        { id: 'b', value: 2, next: 'd' },
        { id: 'd', value: 4, next: 'c' },
        { id: 'c', value: 3, next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(reorderListMissionSeed)

export default problemLesson
