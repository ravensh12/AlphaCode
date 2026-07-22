import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const diameterOfBinaryTreeMissionSeed = {
  slug: 'diameter-of-binary-tree',
  estimatedMinutes: 25,
  mission: {
    title: 'Stretch the Canopy Cable',
    context:
      'Rangers want to hang one safety cable between the two most distant platforms in a branching canopy. The cable may bend through any platform, not just the entrance.',
    prompt:
      'From a level-order JSON tree, return the greatest number of edges on a route between any two nodes.',
  },
  objective:
    'Compute subtree heights while tracking the largest left-height plus right-height seen at any node.',
  priorKnowledge: [
    'A subtree height is the longest downward route from its root.',
    'A route through one node can use one branch from each side.',
  ],
  recognitionCue:
    'The task asks for the longest route between two tree nodes, and that route may pass through a lower node.',
  misconception:
    'Using only the root’s two heights misses a longer route contained entirely inside one subtree.',
  algorithmSteps: [
    {
      id: 'empty-height',
      instruction: 'Return height 0 for a missing node.',
    },
    {
      id: 'collect-heights',
      instruction: 'Recursively find the left and right subtree heights.',
    },
    {
      id: 'update-span',
      instruction: 'Update the best diameter with left height plus right height.',
    },
    {
      id: 'return-height',
      instruction: 'Return 1 plus the larger height to the parent.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'One postorder visit handles each node once; recursion grows to the tree height h.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two', right: 'three' },
        { id: 'two', value: 2, left: 'four', right: 'five' },
        { id: 'three', value: 3 },
        { id: 'four', value: 4 },
        { id: 'five', value: 5 },
      ],
      highlightedNodeIds: ['four', 'two', 'one', 'three'],
      pointers: [{ nodeId: 'two', label: 'left + right' }],
    },
  },
  workedExample: {
    prompt:
      'In [1, 2, 3, 4, 5], node 2 joins two height-1 branches for span 2. Node 1 joins height 2 with height 1 for the winning span of 3 edges.',
    code: [
      'def tree_diameter(root):',
      '    best = 0',
      '    def height(node):',
      '        nonlocal best',
      '        if node is None: return 0',
      '        left, right = height(node.left), height(node.right)',
      '        best = max(best, left + right)',
      '        return 1 + max(left, right)',
      '    height(root)',
      '    return best',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'Leaves 4, 5, and 3 send height 1 upward.',
      'At node 2, the route from 4 to 5 uses 2 edges.',
      'At node 1, a route from 4 or 5 to 3 uses 3 edges, so best becomes 3.',
    ],
  },
  patternCheck: {
    prompt:
      'What information should each postorder call provide while the global cable length is updated?',
    options: [
      {
        id: 'height-up-span-sideways',
        label: 'Return one subtree height upward and test two heights sideways.',
      },
      {
        id: 'node-count-only',
        label: 'Return the total number of nodes below each platform.',
      },
      {
        id: 'root-span-only',
        label: 'Measure left height plus right height only at the root.',
      },
      {
        id: 'shorter-height',
        label: 'Return the shorter child height so both sides stay balanced.',
      },
    ],
    correctOptionId: 'height-up-span-sideways',
    feedback: {
      correct:
        'Yes. A parent can extend only one branch, while a local diameter can join two.',
      incorrect:
        'That loses either the deepest branch or a diameter whose turning point is below the root.',
      secondIncorrect:
        'Return max(left, right) + 1, but compare best with left + right at every node.',
    },
    hints: [
      'A path sent to a parent cannot fork.',
      'A finished path through the current node may use both children.',
    ],
  },
  retrievalCheck: {
    prompt:
      'Type the expression that measures the edge span passing through the current node.',
    acceptedAnswers: [
      'left height + right height',
      'left + right',
      'left height plus right height',
      'left height+right height',
      'left+right',
      'left plus right',
    ],
    placeholder: 'Local span expression',
    feedback: {
      correct:
        'Correct. Each height already counts the edges leaving the current node into that side.',
      incorrect:
        'Join the longest downward branch from each child.',
      secondIncorrect:
        'Use “left + right.”',
    },
    hints: ['The turning node connects two downward arms.', 'Do not add another edge at the turn.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the postorder height-and-diameter routine.',
    feedback: {
      correct:
        'The child heights arrive before both the sideways update and the upward return.',
      incorrect:
        'The best span cannot be tested until both child heights are known.',
      secondIncorrect:
        'Use empty → collect heights → update span → return height.',
    },
    hints: ['This is a postorder calculation.', 'The update and return use the same two heights differently.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] in level order and return the maximum route length in edges; return 0 for an empty or one-node tree.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    # TODO: build the sparse tree from level order.
    best = 0

    def height(node):
        nonlocal best
        # TODO: return height and update best at every real node.
        pass

    return best`,
    cases: {
      visibleExample: {
        input: { tree: [1, 2, 3, 4, 5] },
        expected: 3,
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, null, 3, null, 4] },
        expected: 3,
      },
    },
    feedback: {
      correct:
        'Cable length verified across forks, sparse branches, and the empty canopy.',
      incorrect:
        'A route was undercounted. Check whether you update the best span at every node and count edges.',
      secondIncorrect:
        'For each node, compute both child heights, set best=max(best,left+right), and return 1+max(left,right).',
    },
    hints: [
      'Build children by consuming the level-order list with a parent queue.',
      'A missing node has height 0.',
      'Call height(root) before returning best.',
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

export const problemLesson = createProblemMission(diameterOfBinaryTreeMissionSeed)

export default problemLesson
