import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const maximumDepthOfBinaryTreeMissionSeed = {
  slug: 'maximum-depth-of-binary-tree',
  estimatedMinutes: 20,
  mission: {
    title: 'Measure the Skyhouse',
    context:
      'Builders are checking a treehouse made of branching rooms. They need the number of rooms on the longest route from the entrance to a final room.',
    prompt:
      'Read the level-order JSON tree and report how many nodes appear on its deepest root-to-leaf route.',
  },
  objective:
    'Find tree height by combining the depths of the left and right subtrees.',
  priorKnowledge: [
    'An empty tree has no levels.',
    'A parent adds one level above either child subtree.',
  ],
  recognitionCue:
    'The question asks for the longest downward route from the root, measured in nodes or levels.',
  misconception:
    'Counting every node gives tree size, not the length of the deepest branch.',
  algorithmSteps: [
    {
      id: 'empty-depth',
      instruction: 'Return 0 when the current node is missing.',
    },
    {
      id: 'measure-left',
      instruction: 'Recursively measure the left subtree depth.',
    },
    {
      id: 'measure-right',
      instruction: 'Recursively measure the right subtree depth.',
    },
    {
      id: 'add-parent',
      instruction: 'Return 1 plus the larger child depth.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'Every node is measured once, and at most h recursive calls wait on the stack.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'deck',
      nodes: [
        { id: 'deck', value: 3, left: 'left', right: 'right' },
        { id: 'left', value: 9 },
        { id: 'right', value: 20, left: 'low-left', right: 'low-right' },
        { id: 'low-left', value: 15 },
        { id: 'low-right', value: 7 },
      ],
      pointers: [{ nodeId: 'low-left', label: 'depth 3' }],
      highlightedNodeIds: ['deck', 'right', 'low-left'],
    },
  },
  workedExample: {
    prompt:
      'For [3, 9, 20, null, null, 15, 7], node 9 has depth 1 and node 20 has depth 2, so the root has depth 3.',
    code: [
      'def depth(node):',
      '    if node is None: return 0',
      '    left = depth(node.left)',
      '    right = depth(node.right)',
      '    return 1 + max(left, right)',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Leaves 9, 15, and 7 each return 1.',
      'Room 20 adds a level above leaves 15 and 7, returning 2.',
      'The entrance adds one above the larger child result, returning 3.',
    ],
  },
  patternCheck: {
    prompt:
      'Which recurrence measures the longest entrance-to-leaf route?',
    options: [
      {
        id: 'one-plus-max',
        label: 'Return 1 + max(depth(left), depth(right)).',
      },
      {
        id: 'one-plus-sum',
        label: 'Return 1 + depth(left) + depth(right).',
      },
      {
        id: 'count-leaves',
        label: 'Return the total number of leaves below the node.',
      },
      {
        id: 'take-minimum',
        label: 'Return 1 + min(depth(left), depth(right)).',
      },
    ],
    correctOptionId: 'one-plus-max',
    feedback: {
      correct:
        'Exactly. A downward route chooses one child, so only the larger child depth continues it.',
      incorrect:
        'That measures a different tree feature or chooses the shorter branch.',
      secondIncorrect:
        'A single route cannot travel down both child branches; use one plus their maximum.',
    },
    hints: [
      'At a fork, the longest route follows one side.',
      'The current node contributes one level.',
    ],
  },
  retrievalCheck: {
    prompt:
      'Without looking back, type the value returned for a missing node.',
    acceptedAnswers: ['0', 'zero'],
    placeholder: 'Base-case depth',
    feedback: {
      correct:
        'Correct. A gap contributes zero levels, letting a leaf become 1.',
      incorrect:
        'Think about how many real nodes exist in an empty subtree.',
      secondIncorrect:
        'The base case returns 0.',
    },
    hints: ['A leaf should become 1 after the parent step.', 'No node means no level.'],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the depth routine from its four scrambled actions.',
    feedback: {
      correct:
        'Good. Both child answers are ready before the parent adds its level.',
      incorrect:
        'The empty check comes first, and the final answer needs both child depths.',
      secondIncorrect:
        'Use empty → left → right → one plus max.',
    },
    hints: ['Stop before reading children of a gap.', 'Combine only after both calls return.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). The data["tree"] list is level order with null gaps. Return the maximum number of real nodes on a root-to-leaf route.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return 0

    # A queue can count one complete level at a time.
    queue = deque([0])
    depth = 0
    while queue:
        # TODO: process the current level and enqueue real children.
        pass
    return depth`,
    cases: {
      visibleExample: {
        input: { tree: [3, 9, 20, null, null, 15, 7] },
        expected: 3,
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, null, 3, null, 4] },
        expected: 4,
      },
    },
    feedback: {
      correct:
        'Height confirmed—even a one-sided skyhouse is measured correctly.',
      incorrect:
        'A sparse tree produced the wrong level count. Consume children only for real queued parents.',
      secondIncorrect:
        'Process exactly len(queue) parents per level, append their real children, then increase depth once.',
    },
    hints: [
      'The input is trimmed level order, so consume child entries in parent-queue order.',
      'Increase the answer after finishing a nonempty level.',
      'An empty list returns 0 immediately.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'a',
      nodes: [
        { id: 'a', value: 1, left: 'b' },
        { id: 'b', value: 2, left: 'c' },
        { id: 'c', value: 3, left: 'd' },
        { id: 'd', value: 4 },
      ],
      highlightedNodeIds: ['a', 'b', 'c', 'd'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  maximumDepthOfBinaryTreeMissionSeed,
)

export default problemLesson
