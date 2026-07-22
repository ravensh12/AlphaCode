import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const removeNthNodeFromEndOfListMissionSeed =
  createRealm2MissionSeed({
    slug: 'remove-nth-node-from-end-of-list',
    estimatedMinutes: 22,
    mission: {
      title: 'The Countdown Flag Repair',
      context:
        'Signal flags form a one-way chain along a canyon rope. A repair order names a flag by counting backward from the tail, but the crew can safely walk the rope only forward.',
      prompt:
        'Remove the nth flag from the end in one forward pass and return the remaining values. The JSON array describes the chain, and n is always valid.',
    },
    objective:
      'Use a fixed gap between two pointers and a dummy head to unlink the target in one pass.',
    priorKnowledge: [
      'A dummy node can stand before the real head.',
      'Two pointers moving together keep a fixed distance.',
      'Deleting a node means linking its predecessor to its successor.',
    ],
    recognitionCue:
      'A node is identified by distance from the tail, but list links permit only forward movement.',
    misconception:
      'Starting without a dummy makes removal of the head a special case and invites off-by-one errors.',
    keyRule:
      'From a dummy, move fast n + 1 links ahead; then move both pointers until fast is null, leaving slow directly before the node to unlink.',
    algorithmSteps: [
      {
        id: 'create-removal-dummy',
        instruction: 'Create a dummy node pointing to head.',
      },
      {
        id: 'place-two-pointers',
        instruction: 'Set slow and fast to the dummy.',
      },
      {
        id: 'open-fixed-gap',
        instruction: 'Move fast forward n + 1 links.',
      },
      {
        id: 'walk-gap-to-end',
        instruction: 'Move slow and fast together until fast becomes null.',
      },
      {
        id: 'unlink-target',
        instruction: 'Set slow.next to slow.next.next.',
      },
      {
        id: 'return-dummy-next',
        instruction: 'Return dummy.next as the possibly changed head.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(1)',
      explanation:
        'Fast and slow each move only forward across the list, and the method stores a constant number of pointers.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 4, next: 'b' },
          { id: 'b', value: 7, next: 'c' },
          { id: 'c', value: 9, next: 'd' },
          { id: 'd', value: 2, next: null },
        ],
        pointers: [
          { nodeId: 'b', label: 'slow' },
          { nodeId: null, label: 'fast' },
        ],
        highlightedNodeIds: ['c'],
      },
    },
    workedExample: {
      prompt:
        'Remove the second flag from the end of 4 → 7 → 9 → 2. The fixed gap leaves slow at 7 when fast reaches null, so 7 skips over 9 to point at 2.',
      code: [
        'dummy -> 4 -> 7 -> 9 -> 2',
        'fast moves n + 1 = 3 links ahead',
        'move slow and fast together to the end',
        'slow points at 7; slow.next points at 9',
        'slow.next = slow.next.next  # link 7 to 2',
      ],
      currentLineIndex: 3,
      walkthrough: [
        'The extra link in the gap positions slow before, not on, the target.',
        'Moving both pointers preserves that gap.',
        'Fast reaching null identifies the correct distance from the tail.',
        'One link change removes 9 while keeping the rest connected.',
      ],
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 4, next: 'b' },
          { id: 'b', value: 7, next: 'd' },
          { id: 'c', value: 9, next: 'd' },
          { id: 'd', value: 2, next: null },
        ],
        pointers: [{ nodeId: 'b', label: 'slow' }],
        highlightedNodeIds: ['c'],
      },
    },
    patternCheck: {
      prompt:
        'When fast reaches null, where should slow be positioned for a one-link deletion?',
      options: [
        {
          id: 'before-target',
          label: 'At the node immediately before the target.',
        },
        {
          id: 'on-target',
          label: 'On the target with no way to reach its predecessor.',
        },
        {
          id: 'at-tail',
          label: 'Always at the final node.',
        },
        {
          id: 'at-head',
          label: 'Always at the original head.',
        },
      ],
      correctOptionId: 'before-target',
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 4, next: 'b' },
          { id: 'b', value: 7, next: 'c' },
          { id: 'c', value: 9, next: null },
        ],
        pointers: [{ nodeId: 'b', label: 'slow' }],
      },
    },
    retrievalCheck: {
      prompt:
        'Starting both pointers at a dummy, how many links ahead should fast move before the lockstep walk?',
      acceptedAnswers: [
        'n + 1',
        'n plus one',
        'n+1 links',
        'n+1',
        'n + 1 links',
        'n plus 1',
      ],
      placeholder: 'Type the gap size',
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
        'Restore the one-pass removal from dummy setup through gap creation, lockstep walking, unlinking, and head return.',
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 1, next: 'b' },
          { id: 'b', value: 2, next: 'c' },
          { id: 'c', value: 3, next: null },
        ],
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). data["values"] describes the linked chain and data["n"] counts from its tail starting at 1. Unlink that node and return the remaining values.',
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
    n = data["n"]
    dummy = Node(0, head)
    slow = fast = dummy

    # Open an n+1 gap, walk both pointers, and unlink one node.
    pass

    return to_values(dummy.next)`,
      cases: {
        visibleExample: {
          input: { values: [4, 7, 9, 2], n: 2 },
          expected: [4, 7, 2],
        },
        hiddenBoundary: {
          input: { values: [5], n: 1 },
          expected: [],
        },
        hiddenAdversarial: {
          input: { values: [1, 2, 3, 4, 5], n: 5 },
          expected: [2, 3, 4, 5],
        },
      },
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 4, next: 'b' },
          { id: 'b', value: 7, next: 'd' },
          { id: 'd', value: 2, next: null },
        ],
      },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  removeNthNodeFromEndOfListMissionSeed,
)

export default problemLesson
