import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const balancedBinaryTreeMissionSeed = {
  slug: 'balanced-binary-tree',
  estimatedMinutes: 24,
  mission: {
    title: 'Inspect the Branching Bridge',
    context:
      'A woodland bridge splits into smaller walkways. At every junction, the two sides must differ in height by no more than one level or the bridge needs repairs.',
    prompt:
      'Inspect the level-order JSON tree and report whether every node passes the one-level balance rule.',
  },
  objective:
    'Check balance in one postorder pass by returning heights and stopping when any subtree is unbalanced.',
  priorKnowledge: [
    'Tree height comes from one plus the larger child height.',
    'Postorder visits children before using their results at a parent.',
  ],
  recognitionCue:
    'The condition must hold at every node and depends on the heights of both child subtrees.',
  misconception:
    'Checking only the root height difference can miss an uneven junction farther down.',
  algorithmSteps: [
    {
      id: 'empty-is-zero',
      instruction: 'Return height 0 for a missing node.',
    },
    {
      id: 'check-left',
      instruction: 'Get the left height, stopping if that subtree is unbalanced.',
    },
    {
      id: 'check-right',
      instruction: 'Get the right height, stopping if that subtree is unbalanced.',
    },
    {
      id: 'compare-heights',
      instruction: 'Reject the node when the two heights differ by more than 1.',
    },
    {
      id: 'send-height',
      instruction: 'Otherwise return 1 plus the larger height.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'Each node reports once, and the recursion stack follows at most h levels.',
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
      highlightedNodeIds: ['nine', 'twenty'],
      pointers: [{ nodeId: 'three', label: '1 vs 2' }],
    },
  },
  workedExample: {
    prompt:
      'In [3, 9, 20, null, null, 15, 7], node 20 has two equal sides. At root 3, child heights are 1 and 2, so the whole bridge is balanced.',
    code: [
      'def checked_height(node):',
      '    if node is None: return 0',
      '    left = checked_height(node.left)',
      '    right = checked_height(node.right)',
      '    if left < 0 or right < 0 or abs(left-right) > 1: return -1',
      '    return 1 + max(left, right)',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Each leaf returns height 1.',
      'Node 20 compares 1 and 1, then returns 2.',
      'Root 3 compares 1 and 2, a safe difference of 1.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan checks every junction without measuring the same subtree again and again?',
    options: [
      {
        id: 'height-or-signal',
        label: 'Return a height when safe and a failure signal when uneven.',
      },
      {
        id: 'root-only',
        label: 'Compare only the heights of the root’s two children.',
      },
      {
        id: 'count-nodes',
        label: 'Require the left and right subtrees to have equal node counts.',
      },
      {
        id: 'compare-values',
        label: 'Reject a parent when its child values are far apart.',
      },
    ],
    correctOptionId: 'height-or-signal',
    feedback: {
      correct:
        'Yes. One return value carries either the needed height or news that balance already failed.',
      incorrect:
        'That does not test the height rule at every junction.',
      secondIncorrect:
        'Use postorder and let an impossible height such as -1 mean “unbalanced below.”',
    },
    hints: ['Parents need child heights.', 'Once a lower subtree fails, its ancestors can stop.'],
  },
  retrievalCheck: {
    prompt:
      'Type the largest allowed absolute difference between sibling subtree heights.',
    acceptedAnswers: ['1', 'one'],
    placeholder: 'Allowed difference',
    feedback: {
      correct:
        'Correct. Differences of 0 or 1 are safe; 2 or more fail.',
      incorrect:
        'Recall the bridge’s one-level safety rule.',
      secondIncorrect:
        'The largest allowed difference is 1.',
    },
    hints: ['Equal heights pass.', 'One extra level also passes.'],
  },
  reconstructionCheck: {
    prompt:
      'Put the height-or-failure inspection steps in order.',
    feedback: {
      correct:
        'Both subtrees are checked before the local comparison and height return.',
      incorrect:
        'Do not report a parent height until both child results are known and safe.',
      secondIncorrect:
        'Use empty → left → right → compare → return height.',
    },
    hints: ['The base case starts the postorder.', 'A failure signal should travel upward.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] as level-order JSON and return true only when every node’s child heights differ by at most one.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    # TODO: build the sparse binary tree.

    def checked_height(node):
        # Return -1 when this subtree is unbalanced.
        pass

    # TODO: call checked_height on the root.
    return False`,
    cases: {
      visibleExample: {
        input: { tree: [3, 9, 20, null, null, 15, 7] },
        expected: true,
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, 2, 3, 3, null, null, 4, 4] },
        expected: false,
      },
    },
    feedback: {
      correct:
        'Inspection complete. Your result catches deep imbalance and accepts an empty bridge.',
      incorrect:
        'A lower junction escaped inspection or a safe one-level difference was rejected.',
      secondIncorrect:
        'Return -1 if either child returned -1 or abs(left-right)>1; otherwise return 1+max(left,right).',
    },
    hints: [
      'An empty tree is balanced.',
      'Build level-order children with a queue rather than fixed array indexes.',
      'The final result is checked_height(root) != -1.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'a',
      nodes: [
        { id: 'a', value: 1, left: 'b', right: 'c' },
        { id: 'b', value: 2, left: 'd', right: 'e' },
        { id: 'c', value: 2 },
        { id: 'd', value: 3, left: 'f', right: 'g' },
        { id: 'e', value: 3 },
        { id: 'f', value: 4 },
        { id: 'g', value: 4 },
      ],
      highlightedNodeIds: ['a', 'b', 'd'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(balancedBinaryTreeMissionSeed)

export default problemLesson
