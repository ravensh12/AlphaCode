import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const constructBinaryTreeFromPreorderAndInorderTraversalMissionSeed = {
  slug: 'construct-binary-tree-from-preorder-and-inorder-traversal',
  estimatedMinutes: 30,
  mission: {
    title: 'Rebuild the Expedition Tree',
    context:
      'Two explorers recorded the same branching route in different ways. One log lists each camp before its branches, while the other lists left branches before the camp and then right branches.',
    prompt:
      'Use the preorder and inorder logs of unique camp numbers to rebuild the tree and return its trimmed level-order JSON form.',
  },
  objective:
    'Reconstruct a unique binary tree by taking preorder roots and partitioning inorder ranges.',
  priorKnowledge: [
    'Preorder visits a root before either subtree.',
    'Inorder places the root between its left and right subtree values.',
  ],
  recognitionCue:
    'Two traversal orders describe the same tree, all values are unique, and the required output is the original structure.',
  misconception:
    'Splitting both arrays by repeated slicing works but can add avoidable O(n²) copying and searches.',
  algorithmSteps: [
    {
      id: 'index-inorder',
      instruction: 'Map each inorder value to its index for constant-time splits.',
    },
    {
      id: 'take-preorder-root',
      instruction: 'Take the next preorder value as the current subtree root.',
    },
    {
      id: 'split-inorder-range',
      instruction: 'Use that value’s inorder index to divide left and right ranges.',
    },
    {
      id: 'build-left',
      instruction: 'Recursively build the left range before the right range.',
    },
    {
      id: 'build-right',
      instruction: 'Recursively build the right range and return the root.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'The index map and one visit per value take linear work; nodes, map, and recursion use linear space.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'three',
      nodes: [
        { id: 'three', value: 3, left: 'nine', right: 'twenty' },
        { id: 'nine', value: 9 },
        { id: 'twenty', value: 20, left: 'fifteen', right: 'seven' },
        { id: 'fifteen', value: 15 },
        { id: 'seven', value: 7 },
      ],
      highlightedNodeIds: ['three'],
      pointers: [{ nodeId: 'three', label: 'first preorder value' }],
    },
  },
  workedExample: {
    prompt:
      'Preorder [3, 9, 20, 15, 7] starts with root 3. In inorder [9, 3, 15, 20, 7], value 3 splits left [9] from right [15, 20, 7].',
    code: [
      'def rebuild(preorder, inorder):',
      '    positions = {value: i for i, value in enumerate(inorder)}',
      '    pre_index = 0',
      '    def build(left, right):',
      '        nonlocal pre_index',
      '        if left > right: return None',
      '        value = preorder[pre_index]',
      '        pre_index += 1',
      '        root = Node(value)',
      '        split = positions[value]',
      '        root.left = build(left, split - 1)',
      '        root.right = build(split + 1, right)',
      '        return root',
      '    return build(0, len(inorder) - 1)',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The first preorder value creates root 3.',
      'Its inorder position shows that only 9 belongs to the left subtree.',
      'The next unused preorder values rebuild the right subtree rooted at 20.',
    ],
  },
  patternCheck: {
    prompt:
      'Why do the two logs reveal each subtree boundary?',
    options: [
      {
        id: 'root-plus-partition',
        label: 'Preorder names the root, and inorder shows values on each side.',
      },
      {
        id: 'both-sorted',
        label: 'Both traversal lists are always numerically sorted.',
      },
      {
        id: 'same-index-children',
        label: 'Children always appear at the same indexes in both lists.',
      },
      {
        id: 'level-counts',
        label: 'The lists directly state how many nodes are on each level.',
      },
    ],
    correctOptionId: 'root-plus-partition',
    feedback: {
      correct:
        'Exactly. One order supplies the next root; the other supplies its left/right border.',
      incorrect:
        'Traversal positions do not have that simple numeric or level relationship.',
      secondIncorrect:
        'Read the next root from preorder, then find it inside the current inorder range.',
    },
    hints: ['The first preorder item has a special role.', 'Inorder places a root between its subtrees.'],
  },
  retrievalCheck: {
    prompt:
      'Which traversal gives the next subtree root first?',
    acceptedAnswers: [
      'preorder',
      'pre-order',
      'pre order',
      'the preorder',
      'preorder traversal',
      'the preorder log',
    ],
    placeholder: 'Traversal name',
    feedback: {
      correct:
        'Right. Preorder visits each subtree root before its descendants.',
      incorrect:
        'Choose the order whose name means the root comes before both branches.',
      secondIncorrect:
        'The answer is preorder.',
    },
    hints: ['“Pre” means before.', 'Inorder is used for the split.'],
  },
  reconstructionCheck: {
    prompt:
      'Reassemble the range-based tree builder.',
    feedback: {
      correct:
        'The map supports each split, and preorder’s left-before-right order is preserved.',
      incorrect:
        'Take the root before recursing, and construct the left range before the right.',
      secondIncorrect:
        'Use index map → take root → split range → build left → build right.',
    },
    hints: ['An empty range is the recursive base case.', 'A shared preorder pointer advances once per node.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read unique integer lists preorder and inorder, rebuild their tree, and return a trimmed level-order list with null gaps.',
    starterCode: `from collections import deque

def solve(data):
    preorder = data["preorder"]
    inorder = data["inorder"]
    positions = {value: index for index, value in enumerate(inorder)}
    pre_index = 0

    def build(left, right):
        nonlocal pre_index
        # TODO: build and return the subtree for this inorder range.
        pass

    root = build(0, len(inorder) - 1)
    # TODO: serialize root in level order and trim trailing None values.
    return []`,
    cases: {
      visibleExample: {
        input: {
          preorder: [3, 9, 20, 15, 7],
          inorder: [9, 3, 15, 20, 7],
        },
        expected: [3, 9, 20, null, null, 15, 7],
      },
      hiddenBoundary: {
        input: { preorder: [], inorder: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { preorder: [1, 2, 3, 4], inorder: [4, 3, 2, 1] },
        expected: [1, 2, null, 3, null, 4],
      },
    },
    feedback: {
      correct:
        'The expedition tree was rebuilt, including a completely one-sided route.',
      incorrect:
        'A traversal boundary, preorder pointer, or level-order null gap is wrong.',
      secondIncorrect:
        'Take preorder[pre_index], advance it, split at positions[value], build left then right, and queue-serialize the result.',
    },
    hints: [
      'Return None when left > right.',
      'Use a small node object or dictionary with value, left, and right fields.',
      'Keep interior None entries but remove trailing ones from the output.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two' },
        { id: 'two', value: 2, left: 'three' },
        { id: 'three', value: 3, left: 'four' },
        { id: 'four', value: 4 },
      ],
      highlightedNodeIds: ['one', 'two', 'three', 'four'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  constructBinaryTreeFromPreorderAndInorderTraversalMissionSeed,
)

export default problemLesson
