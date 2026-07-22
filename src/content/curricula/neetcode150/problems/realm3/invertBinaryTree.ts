import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const invertBinaryTreeMissionSeed = {
  slug: 'invert-binary-tree',
  estimatedMinutes: 22,
  mission: {
    title: 'Mirror the Lantern Orchard',
    context:
      'A festival orchard hangs lanterns in branching rows. The stage crew needs the whole display reflected left-for-right before the evening show.',
    prompt:
      'Given the orchard as a level-order JSON tree, swap every branch pair and return the reflected tree in level order.',
  },
  objective:
    'Transform a binary tree by visiting every node and swapping its left and right children.',
  priorKnowledge: [
    'A recursive call can solve the same task on a smaller subtree.',
    'A level-order array uses null where a child is missing.',
  ],
  recognitionCue:
    'The requested result keeps every value but reverses left and right at every parent.',
  misconception:
    'Swapping only the root children mirrors one level, not the subtrees below them.',
  algorithmSteps: [
    { id: 'stop-at-gap', instruction: 'If the current node is missing, return.' },
    {
      id: 'swap-children',
      instruction: 'Swap the current node’s left and right child links.',
    },
    {
      id: 'mirror-left',
      instruction: 'Recursively mirror the subtree now on the left.',
    },
    {
      id: 'mirror-right',
      instruction: 'Recursively mirror the subtree now on the right.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'Each of n nodes is swapped once. The recursion stack holds at most the tree height h.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'four',
      nodes: [
        { id: 'four', value: 4, left: 'two', right: 'seven' },
        { id: 'two', value: 2, left: 'one', right: 'three' },
        { id: 'seven', value: 7, left: 'six', right: 'nine' },
        { id: 'one', value: 1 },
        { id: 'three', value: 3 },
        { id: 'six', value: 6 },
        { id: 'nine', value: 9 },
      ],
      pointers: [{ nodeId: 'four', label: 'swap first' }],
      highlightedNodeIds: ['two', 'seven'],
    },
  },
  workedExample: {
    prompt:
      'At node 4, exchange branches rooted at 2 and 7. Repeating the same move at those roots produces [4, 7, 2, 9, 6, 3, 1].',
    code: [
      'def mirror(node):',
      '    if node is None: return',
      '    node.left, node.right = node.right, node.left',
      '    mirror(node.left)',
      '    mirror(node.right)',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The root keeps value 4 while its two child links trade places.',
      'Node 7 moves left, then its children become 9 and 6.',
      'Node 2 moves right, then its children become 3 and 1.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan reflects a branching display of any height?',
    options: [
      {
        id: 'swap-every-node',
        label: 'Visit every node and exchange its two child links.',
      },
      {
        id: 'reverse-values',
        label: 'Reverse the level-order value array without reading nulls.',
      },
      {
        id: 'swap-root-only',
        label: 'Exchange only the two children of the root.',
      },
      {
        id: 'sort-each-level',
        label: 'Sort the values within each level from largest to smallest.',
      },
    ],
    correctOptionId: 'swap-every-node',
    feedback: {
      correct:
        'Yes. A local child swap at every node creates the full mirror.',
      incorrect:
        'That can move values without correctly reversing every parent-child direction.',
      secondIncorrect:
        'Use one repeated rule: each real node swaps its own left and right links.',
    },
    hints: [
      'A tree can be mirrored one subtree at a time.',
      'The shape, including missing children, must also be reflected.',
    ],
  },
  retrievalCheck: {
    prompt:
      'Complete the recursive rule: at each real node, first ______.',
    acceptedAnswers: [
      'swap its left and right children',
      'exchange the left and right child links',
      'swap the left and right children',
      'swap left and right children',
      'swap its children',
      'swap the children',
      'swap left and right',
    ],
    placeholder: 'Type the local tree action',
    feedback: {
      correct:
        'Right. Once the local links swap, recursion applies the same rule below.',
      incorrect:
        'Name the change made to the two child links.',
      secondIncorrect:
        'Answer with: “swap its left and right children.”',
    },
    hints: [
      'No values need to change.',
      'Think about what a mirror does at one parent.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Put the mirror routine back in a safe recursive order.',
    feedback: {
      correct:
        'The base case stops at gaps, and every real node swaps before both recursive visits.',
      incorrect:
        'Make sure missing nodes stop immediately and both resulting subtrees are visited.',
      secondIncorrect:
        'Use stop → swap → recurse left → recurse right.',
    },
    hints: [
      'The stopping rule belongs first.',
      'Both child sides need the same treatment.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"], a level-order list with null gaps, and return the fully mirrored tree in trimmed level-order form.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return []

    # Build nodes from the level-order values, mirror every node,
    # then serialize the result without trailing None values.
    def mirror(node):
        # TODO: swap this node's children and recurse.
        pass

    # Replace this placeholder with tree construction and serialization.
    return values`,
    cases: {
      visibleExample: {
        input: { tree: [4, 2, 7, 1, 3, 6, 9] },
        expected: [4, 7, 2, 9, 6, 3, 1],
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, 3, null, 4] },
        expected: [1, 3, 2, null, null, 4],
      },
    },
    feedback: {
      correct:
        'The orchard now mirrors at every branch, including around missing children.',
      incorrect:
        'A tree shape did not reflect correctly. Check sparse nodes and remove only trailing nulls.',
      secondIncorrect:
        'Build with a queue, swap both links at every node, then serialize by levels and trim trailing None values.',
    },
    hints: [
      'Consume child values with a queue of real parent nodes.',
      'Do not treat level-order positions as fixed 2*i indexes when null gaps are trimmed.',
      'After mirroring, breadth-first serialization preserves the required JSON shape.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'three', right: 'two' },
        { id: 'three', value: 3 },
        { id: 'two', value: 2, left: 'four' },
        { id: 'four', value: 4 },
      ],
      highlightedNodeIds: ['three', 'two'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(invertBinaryTreeMissionSeed)

export default problemLesson
