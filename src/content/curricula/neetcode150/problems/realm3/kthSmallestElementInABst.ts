import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const kthSmallestElementInABstMissionSeed = {
  slug: 'kth-smallest-element-in-a-bst',
  estimatedMinutes: 22,
  mission: {
    title: 'Choose the Ranked Acorn',
    context:
      'A number grove stores lighter acorns on left branches and heavier acorns on right branches. A ranger needs the acorn at rank k without sorting a separate list.',
    prompt:
      'Read the level-order search tree and return its kth value in increasing order, counting ranks from 1.',
  },
  objective:
    'Use inorder traversal of a binary search tree to visit values in sorted order and stop at rank k.',
  priorKnowledge: [
    'An inorder traversal visits left subtree, node, then right subtree.',
    'Search-tree ordering places all left values before the node value.',
  ],
  recognitionCue:
    'The input is a binary search tree and the question asks for a sorted rank rather than a target lookup.',
  misconception:
    'A preorder or breadth-first traversal does not visit search-tree values in increasing order.',
  algorithmSteps: [
    {
      id: 'push-left-chain',
      instruction: 'Push the current node and all of its left descendants onto a stack.',
    },
    {
      id: 'visit-next',
      instruction: 'Pop the stack to visit the next-smallest value.',
    },
    {
      id: 'advance-rank',
      instruction: 'Increase the visited rank and return the value when it reaches k.',
    },
    {
      id: 'move-right',
      instruction: 'Continue from the popped node’s right child.',
    },
  ],
  complexity: {
    time: 'O(h + k)',
    space: 'O(h)',
    explanation:
      'The stack first descends h levels and then visits at most k nodes, while holding one root path.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'three',
      nodes: [
        { id: 'three', value: 3, left: 'one', right: 'four' },
        { id: 'one', value: 1, right: 'two' },
        { id: 'four', value: 4 },
        { id: 'two', value: 2 },
      ],
      highlightedNodeIds: ['one'],
      pointers: [{ nodeId: 'one', label: 'rank 1' }],
    },
  },
  workedExample: {
    prompt:
      'In [3, 1, 4, null, 2], inorder produces 1, 2, 3, 4. For k = 1, the first popped node gives answer 1.',
    code: [
      'while stack or node:',
      '    while node:',
      '        stack.append(node)',
      '        node = node.left',
      '    node = stack.pop()',
      '    k -= 1',
      '    if k == 0: return node.value',
      '    node = node.right',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The first left chain pushes 3 then 1.',
      'Popping 1 visits the smallest value in the tree.',
      'The remaining rank becomes zero, so 1 is returned immediately.',
    ],
  },
  patternCheck: {
    prompt:
      'Which traversal exposes search-tree values in increasing order?',
    options: [
      {
        id: 'inorder',
        label: 'Left subtree, current node, then right subtree.',
      },
      {
        id: 'preorder',
        label: 'Current node, then left subtree, then right subtree.',
      },
      {
        id: 'reverse-inorder',
        label: 'Right subtree, current node, then left subtree.',
      },
      {
        id: 'level-order',
        label: 'All nodes by depth from top to bottom.',
      },
    ],
    correctOptionId: 'inorder',
    feedback: {
      correct:
        'Exactly. Search-tree ordering turns inorder position into sorted rank.',
      incorrect:
        'That order is useful elsewhere but does not produce increasing values.',
      secondIncorrect:
        'Use left → node → right and count each visited node.',
    },
    hints: ['Smaller values must come first.', 'The current node belongs between its two subtrees.'],
  },
  retrievalCheck: {
    prompt:
      'Type the visit order that sorts a search tree.',
    acceptedAnswers: [
      'left node right',
      'left root right',
      'inorder',
      'in-order',
      'in order',
      'left, node, right',
      'left, root, right',
      'inorder traversal',
    ],
    placeholder: 'Three-part order',
    feedback: {
      correct:
        'Right. That order turns structural placement into numeric order.',
      incorrect:
        'Place the current node between its smaller and larger subtrees.',
      secondIncorrect:
        'Answer “left, node, right.”',
    },
    hints: ['The left side is smaller.', 'The right side is larger.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the iterative rank-selection loop.',
    feedback: {
      correct:
        'The stack reveals one next-smallest node at a time and explores its right branch afterward.',
      incorrect:
        'Finish the left descent before popping and counting a node.',
      secondIncorrect:
        'Use push left chain → pop → count/return → move right.',
    },
    hints: ['The smallest remaining node has no unvisited left child.', 'The right child may begin the next left chain.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["tree"] is a nonempty level-order binary search tree and data["k"] is a valid 1-based rank. Return the kth smallest integer.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    k = data["k"]
    # TODO: build the sparse search tree.
    node = None
    stack = []

    while stack or node is not None:
        # TODO: perform iterative inorder and count visits.
        pass
    return None`,
    cases: {
      visibleExample: {
        input: { tree: [3, 1, 4, null, 2], k: 1 },
        expected: 1,
      },
      hiddenBoundary: {
        input: { tree: [7], k: 1 },
        expected: 7,
      },
      hiddenAdversarial: {
        input: { tree: [5, 3, 6, 2, 4, null, null, 1], k: 5 },
        expected: 5,
      },
    },
    feedback: {
      correct:
        'The ranked acorn was selected without sorting a separate collection.',
      incorrect:
        'The traversal order or 1-based rank count is off.',
      secondIncorrect:
        'Push all left nodes, pop one, decrement k, return at zero, then move to its right child.',
    },
    hints: [
      'Build the tree from level order before traversing.',
      'Do not decrement k while merely pushing nodes.',
      'The first popped node has rank 1.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'five',
      nodes: [
        { id: 'five', value: 5, left: 'three', right: 'six' },
        { id: 'three', value: 3, left: 'two', right: 'four' },
        { id: 'six', value: 6 },
        { id: 'two', value: 2, left: 'one' },
        { id: 'four', value: 4 },
        { id: 'one', value: 1 },
      ],
      highlightedNodeIds: ['five'],
      pointers: [{ nodeId: 'five', label: 'rank 5' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  kthSmallestElementInABstMissionSeed,
)

export default problemLesson
