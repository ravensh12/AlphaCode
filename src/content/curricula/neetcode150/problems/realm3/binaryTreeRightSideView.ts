import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const binaryTreeRightSideViewMissionSeed = {
  slug: 'binary-tree-right-side-view',
  estimatedMinutes: 21,
  mission: {
    title: 'Sketch the Sunset Silhouette',
    context:
      'An artist stands east of a branching sculpture at sunset. From each height, only the outermost piece on the right edge belongs in the silhouette.',
    prompt:
      'Read the level-order JSON tree and return the one visible value from the right side at each depth.',
  },
  objective:
    'Run level-order search and keep the final node processed at each level.',
  priorKnowledge: [
    'A queue can separate a tree into levels.',
    'Left-to-right child order makes the last node of a level its rightmost node.',
  ],
  recognitionCue:
    'The output asks for one edge value per depth as viewed from one side.',
  misconception:
    'Following only right-child links fails when a missing right child reveals a node from the left subtree.',
  algorithmSteps: [
    {
      id: 'start-queue',
      instruction: 'Queue the root, returning an empty list when it is missing.',
    },
    {
      id: 'mark-level-size',
      instruction: 'Freeze the number of nodes on the current level.',
    },
    {
      id: 'scan-level',
      instruction: 'Process that level left to right while enqueuing real children.',
    },
    {
      id: 'record-last',
      instruction: 'Record the value of the level’s final processed node.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(w)',
    explanation:
      'Every node is queued once, and the queue holds at most one broad level of width w.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two', right: 'three' },
        { id: 'two', value: 2, right: 'five' },
        { id: 'three', value: 3, right: 'four' },
        { id: 'five', value: 5 },
        { id: 'four', value: 4 },
      ],
      highlightedNodeIds: ['one', 'three', 'four'],
      pointers: [{ nodeId: 'four', label: 'sunset edge' }],
    },
  },
  workedExample: {
    prompt:
      'For [1, 2, 3, null, 5, null, 4], the last values on levels one, two, and three are 1, 3, and 4.',
    code: [
      'while queue:',
      '    level_size = len(queue)',
      '    for position in range(level_size):',
      '        node = queue.popleft()',
      '        if position == level_size - 1: view.append(node.value)',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Level one contains only 1.',
      'Level two is [2, 3], so 3 blocks 2 from the right.',
      'Level three is [5, 4], so 4 forms the outer edge.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan still works when some right-child links are missing?',
    options: [
      {
        id: 'last-per-level',
        label: 'Scan every level left to right and save its last node.',
      },
      {
        id: 'right-chain-only',
        label: 'Start at the root and repeatedly follow only right children.',
      },
      {
        id: 'largest-value',
        label: 'Choose the largest numeric value on each level.',
      },
      {
        id: 'all-leaves',
        label: 'Return every leaf from left to right.',
      },
    ],
    correctOptionId: 'last-per-level',
    feedback: {
      correct:
        'Yes. The level boundary finds the geometric right edge even when it comes from a left subtree.',
      incorrect:
        'That confuses position with value, leaves, or a possibly broken right-child chain.',
      secondIncorrect:
        'Use breadth-first levels and keep the final node in each fixed-size group.',
    },
    hints: ['One answer is needed for every depth.', 'A left child can be visible if nothing lies farther right.'],
  },
  retrievalCheck: {
    prompt:
      'In a left-to-right level scan, which node’s value is saved?',
    acceptedAnswers: [
      'the last node',
      'last node',
      'the rightmost node',
      'rightmost node',
      'the final node',
      'final node',
      'the last one',
      'rightmost',
    ],
    placeholder: 'Position on the level',
    feedback: {
      correct:
        'Correct. The final node in that level is farthest right.',
      incorrect:
        'Think about the scan order across one complete level.',
      secondIncorrect:
        'Save the last node.',
    },
    hints: ['The queue preserves left-to-right order.', 'The desired node has position level_size - 1.'],
  },
  reconstructionCheck: {
    prompt:
      'Put the silhouette queue actions back in order.',
    feedback: {
      correct:
        'Each fixed-size level is scanned before its last value is added to the view.',
      incorrect:
        'Freeze the level count before the queue grows with children.',
      secondIncorrect:
        'Use queue root → mark size → scan level → record last.',
    },
    hints: ['Empty input never enters the queue loop.', 'Children wait for later levels.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] in level order and return the values visible from the right, top to bottom.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return []
    # TODO: build the sparse tree.
    root = None
    queue = deque([root])
    view = []

    while queue:
        # TODO: process one fixed-size level and save its last value.
        pass
    return view`,
    cases: {
      visibleExample: {
        input: { tree: [1, 2, 3, null, 5, null, 4] },
        expected: [1, 3, 4],
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, null, 3, null, 4] },
        expected: [1, 2, 3, 4],
      },
    },
    feedback: {
      correct:
        'The sunset silhouette is correct even for a tree leaning entirely left.',
      incorrect:
        'A level edge was skipped or confused with a right-child chain.',
      secondIncorrect:
        'Process len(queue) nodes per level; append node.value when its loop position is the final one.',
    },
    hints: [
      'Use a queue-based level-order tree builder.',
      'Enqueue left then right to preserve scan order.',
      'A one-node level still has a last node.',
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
  binaryTreeRightSideViewMissionSeed,
)

export default problemLesson
