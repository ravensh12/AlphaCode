import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const addTwoNumbersMissionSeed = createRealm2MissionSeed({
  slug: 'add-two-numbers',
  estimatedMinutes: 22,
  mission: {
    title: 'The Backward Abacus Chains',
    context:
      'Two mechanical abacuses store one digit per linked bead, starting with the ones place, then tens, then hundreds. A third chain must record their sum in the same backward order.',
    prompt:
      'Add the two nonnegative numbers and return the result digits from least significant to most significant. Each JSON array represents one linked digit chain.',
  },
  objective:
    'Add aligned linked digits with a carry and build one result node per output place.',
  priorKnowledge: [
    'For total t, output digit is t % 10 and next carry is t // 10.',
    'A missing digit after one list ends contributes zero.',
    'A final carry may create an extra most-significant node.',
  ],
  recognitionCue:
    'Digits arrive least-significant first, matching the natural direction of carry-based addition.',
  misconception:
    'Stopping as soon as both input nodes end can drop a remaining carry such as the leading 1 in 999 + 1.',
  keyRule:
    'Continue while either list or carry remains; add available digits plus carry, append total % 10, and update carry = total // 10.',
  algorithmSteps: [
    {
      id: 'create-sum-dummy',
      instruction: 'Create a dummy result node, tail pointer, and carry 0.',
    },
    {
      id: 'continue-with-carry',
      instruction: 'Loop while either input node exists or carry is nonzero.',
    },
    {
      id: 'read-digit-values',
      instruction: 'Use each current node value, or 0 when that list ended.',
    },
    {
      id: 'compute-digit-carry',
      instruction:
        'Add both digits and carry; split the total into output digit and next carry.',
    },
    {
      id: 'append-sum-node',
      instruction: 'Append the output digit and advance available input nodes.',
    },
    {
      id: 'return-sum-head',
      instruction: 'Return dummy.next.',
    },
  ],
  complexity: {
    time: 'O(max(m, n))',
    space: 'O(1) auxiliary',
    explanation:
      'Each digit position is processed once; aside from the required result nodes, only pointers, totals, and carry are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 7, next: 'b' },
        { id: 'b', value: 1, next: 'c' },
        { id: 'c', value: 6, next: null },
      ],
      pointers: [{ nodeId: 'a', label: 'ones first' }],
    },
  },
  workedExample: {
    prompt:
      'Chains [7,1,6] and [5,9,2] represent 617 and 295. Place totals produce digit 2 with carry 1, then digit 1 with carry 1, then digit 9.',
    code: [
      'ones: 7 + 5 + 0 = 12 -> write 2, carry 1',
      'tens: 1 + 9 + 1 = 11 -> write 1, carry 1',
      'hundreds: 6 + 2 + 1 = 9 -> write 9, carry 0',
      'result chain: 2 -> 1 -> 9',
    ],
    currentLineIndex: 1,
    walkthrough: [
      'Least-significant-first storage lets addition move only forward.',
      'The carry from 12 joins the next pair of digits.',
      'The carry from 11 joins the hundreds place.',
      'No carry remains after 9, so the output is [2,1,9], representing 912.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'r1',
      nodes: [
        { id: 'r1', value: 2, next: 'r2' },
        { id: 'r2', value: 1, next: 'r3' },
        { id: 'r3', value: 9, next: null },
      ],
      highlightedNodeIds: ['r1', 'r2', 'r3'],
    },
  },
  patternCheck: {
    prompt:
      'Both input lists have ended, but carry equals 1. What should the loop do?',
    options: [
      {
        id: 'append-carry-digit',
        label: 'Run once more and append a final digit 1.',
      },
      {
        id: 'discard-carry',
        label: 'Stop because no input nodes remain.',
      },
      {
        id: 'edit-first-digit',
        label: 'Add the carry back into the first result node.',
      },
      {
        id: 'reverse-inputs',
        label: 'Reverse both original lists and restart.',
      },
    ],
    correctOptionId: 'append-carry-digit',
    diagram: {
      kind: 'linkedList',
      head: 'r',
      nodes: [{ id: 'r', value: 0, next: null }],
      pointers: [{ nodeId: 'r', label: 'tail' }],
    },
  },
  retrievalCheck: {
    prompt:
      'For a place total t, give the output digit and next carry formulas.',
    acceptedAnswers: [
      'digit = t % 10, carry = t // 10',
      't modulo 10 and t integer-divided by 10',
      'write t % 10 and carry t // 10',
      't % 10 and t // 10',
      't%10 and t//10',
      'digit = t%10, carry = t//10',
      'digit is t mod 10 and carry is t floor divided by 10',
    ],
    placeholder: 'Type both formulas',
    diagram: {
      kind: 'linkedList',
      head: 'r',
      nodes: [{ id: 'r', value: 2, next: null }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore linked addition from dummy and carry setup through digit reads, total splitting, appending, advancement, and return.',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 9, next: 'b' },
        { id: 'b', value: 9, next: null },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["leftDigits"] and data["rightDigits"] are least-significant-first linked digit chains. Return the summed digits in the same order.',
    starterCode: `class Node:
    def __init__(self, value, next_node=None):
        self.value = value
        self.next = next_node

def build(digits):
    head = None
    for digit in reversed(digits):
        head = Node(digit, head)
    return head

def to_values(head):
    values = []
    while head:
        values.append(head.value)
        head = head.next
    return values

def solve(data):
    left = build(data["leftDigits"])
    right = build(data["rightDigits"])
    dummy = Node(0)
    tail = dummy
    carry = 0

    # Add one digit place at a time, including a possible final carry.
    pass

    return to_values(dummy.next)`,
    cases: {
      visibleExample: {
        input: { leftDigits: [7, 1, 6], rightDigits: [5, 9, 2] },
        expected: [2, 1, 9],
      },
      hiddenBoundary: {
        input: { leftDigits: [0], rightDigits: [0] },
        expected: [0],
      },
      hiddenAdversarial: {
        input: { leftDigits: [9, 9, 9], rightDigits: [1] },
        expected: [0, 0, 0, 1],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'r1',
      nodes: [
        { id: 'r1', value: 2, next: 'r2' },
        { id: 'r2', value: 1, next: 'r3' },
        { id: 'r3', value: 9, next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(addTwoNumbersMissionSeed)

export default problemLesson
