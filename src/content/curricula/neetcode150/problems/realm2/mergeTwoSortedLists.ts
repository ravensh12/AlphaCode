import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const mergeTwoSortedListsMissionSeed = createRealm2MissionSeed({
  slug: 'merge-two-sorted-lists',
  estimatedMinutes: 21,
  mission: {
    title: 'The Twin Lantern Parades',
    context:
      'Two lantern parades wait on side streets. Each parade is already ordered by lantern number, and the marshal must link them into one ordered route.',
    prompt:
      'Merge the two sorted linked chains and return the merged values. The JSON arrays describe the two original head-to-tail chains.',
  },
  objective:
    'Splice two sorted lists by repeatedly attaching the smaller current node to one result tail.',
  priorKnowledge: [
    'Each input head is the smallest unmerged node in its list.',
    'A dummy node can simplify building a result head.',
    'A remaining sorted suffix can be attached all at once.',
  ],
  recognitionCue:
    'Two already-sorted streams must become one sorted stream without re-sorting.',
  misconception:
    'Advancing both input pointers after choosing one node skips the unchosen candidate.',
  keyRule:
    'Attach the smaller current node, advance only that list, and move the result tail; when one list ends, attach the other suffix.',
  algorithmSteps: [
    {
      id: 'create-dummy-tail',
      instruction: 'Create a dummy result node and point tail to it.',
    },
    {
      id: 'compare-current-nodes',
      instruction: 'While both lists remain, compare their current values.',
    },
    {
      id: 'attach-smaller-node',
      instruction: 'Link tail.next to the node with the smaller value.',
    },
    {
      id: 'advance-chosen-list',
      instruction: 'Advance only the input pointer whose node was chosen.',
    },
    {
      id: 'advance-result-tail',
      instruction: 'Move tail to the node just attached.',
    },
    {
      id: 'attach-remainder',
      instruction: 'Attach the nonempty suffix and return dummy.next.',
    },
  ],
  complexity: {
    time: 'O(m + n)',
    space: 'O(1)',
    explanation:
      'Each existing node is attached once, and pointer splicing uses constant extra node references beyond JSON conversion.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a1', value: -2, next: 'a2' },
        { id: 'a2', value: 3, next: null },
        { id: 'b1', value: 1, next: 'b2' },
        { id: 'b2', value: 4, next: null },
      ],
      pointers: [
        { nodeId: 'a1', label: 'left' },
        { nodeId: 'b1', label: 'right' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Merge -2 → 3 and 1 → 4. Choose -2, then 1, then 3. The first list ends, so attach the remaining node 4.',
    code: [
      'tail -> dummy, left=-2, right=1',
      'attach -2; advance left',
      'attach 1; advance right',
      'attach 3; advance left to null',
      'attach remaining right suffix 4',
      'return dummy.next',
    ],
    currentLineIndex: 2,
    walkthrough: [
      '-2 is the smallest available node and becomes the result head.',
      'Only the left pointer advances, leaving 1 available for the next comparison.',
      'After choosing 1 and 3, the left chain is exhausted.',
      'The untouched suffix beginning at 4 is already sorted and can be linked directly.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'a1',
      nodes: [
        { id: 'a1', value: -2, next: 'b1' },
        { id: 'b1', value: 1, next: 'a2' },
        { id: 'a2', value: 3, next: 'b2' },
        { id: 'b2', value: 4, next: null },
      ],
      pointers: [{ nodeId: 'b2', label: 'tail' }],
    },
  },
  patternCheck: {
    prompt:
      'After attaching the smaller left node, which pointers should move?',
    options: [
      {
        id: 'left-and-tail',
        label: 'Advance the left input pointer and the result tail.',
      },
      {
        id: 'both-inputs',
        label: 'Advance both input pointers but leave the tail.',
      },
      {
        id: 'right-only',
        label: 'Advance only the unchosen right input pointer.',
      },
      {
        id: 'restart-heads',
        label: 'Reset both inputs to their original heads.',
      },
    ],
    correctOptionId: 'left-and-tail',
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a', value: 2, next: null },
        { id: 'b', value: 5, next: null },
      ],
      pointers: [
        { nodeId: 'a', label: 'left' },
        { nodeId: 'b', label: 'right' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'When one input list becomes null, what should be linked after the result tail?',
    acceptedAnswers: [
      'the remaining nonempty list',
      'the other list suffix',
      'whichever list remains',
      'the remaining list',
      'the other list',
      'the rest of the other list',
      'the remaining suffix',
    ],
    placeholder: 'Type the final splice',
    diagram: {
      kind: 'linkedList',
      head: 'r',
      nodes: [
        { id: 'r', value: 4, next: 's' },
        { id: 's', value: 8, next: null },
      ],
      pointers: [{ nodeId: 'r', label: 'remaining' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the merge from dummy setup through comparison, one-sided advancement, tail movement, and suffix attachment.',
    diagram: {
      kind: 'linkedList',
      nodes: [
        { id: 'a', value: 1, next: null },
        { id: 'b', value: 2, next: null },
      ],
      pointers: [
        { nodeId: 'a', label: 'left' },
        { nodeId: 'b', label: 'right' },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["left"] and data["right"] are sorted arrays representing linked chains. Splice their nodes and return the merged values array.',
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
    left = build(data["left"])
    right = build(data["right"])
    dummy = Node(0)
    tail = dummy

    # Attach nodes in sorted order, then attach one remaining suffix.
    pass

    return to_values(dummy.next)`,
    cases: {
      visibleExample: {
        input: { left: [-2, 3, 7], right: [1, 3, 8] },
        expected: [-2, 1, 3, 3, 7, 8],
      },
      hiddenBoundary: {
        input: { left: [], right: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { left: [0, 0], right: [] },
        expected: [0, 0],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: -2, next: 'b' },
        { id: 'b', value: 1, next: 'c' },
        { id: 'c', value: 3, next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(mergeTwoSortedListsMissionSeed)

export default problemLesson
