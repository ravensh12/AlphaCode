import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const binaryTreeLevelOrderTraversalMissionSeed = {
  slug: 'binary-tree-level-order-traversal',
  estimatedMinutes: 22,
  mission: {
    title: 'Call the Treehouse Roll',
    context:
      'A camp leader calls names floor by floor through a branching treehouse. Everyone on one floor must answer before the leader moves down.',
    prompt:
      'Read a level-order JSON tree and return a list of value lists, one list for each depth from top to bottom.',
  },
  objective:
    'Use breadth-first search with a queue boundary to group nodes by tree level.',
  priorKnowledge: [
    'A queue removes items in the same order they were added.',
    'Children belong to the level after their parent.',
  ],
  recognitionCue:
    'The output is grouped by distance from the root rather than by complete root-to-leaf paths.',
  misconception:
    'Draining a growing queue as one level mixes newly added children with their parents.',
  algorithmSteps: [
    {
      id: 'queue-root',
      instruction: 'Put the root in a queue, or return an empty result for no root.',
    },
    {
      id: 'freeze-level-size',
      instruction: 'Record the queue length at the start of the level.',
    },
    {
      id: 'collect-level',
      instruction: 'Remove exactly that many nodes and collect their values.',
    },
    {
      id: 'enqueue-children',
      instruction: 'Add each removed node’s real children to the queue.',
    },
    {
      id: 'save-level',
      instruction: 'Append the completed level list and repeat.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(w)',
    explanation:
      'Every node enters and leaves the queue once; the queue holds at most the maximum level width w.',
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
      pointers: [{ nodeId: 'nine', label: 'level 2 starts' }],
    },
  },
  workedExample: {
    prompt:
      'For [3, 9, 20, null, null, 15, 7], the queue boundaries produce [3], then [9, 20], then [15, 7].',
    code: [
      'queue = deque([root])',
      'while queue:',
      '    level = []',
      '    for _ in range(len(queue)):',
      '        node = queue.popleft()',
      '        level.append(node.value)',
      '    levels.append(level)',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first frozen queue size is 1, so only root 3 enters level one.',
      'Its children make the next frozen size 2, producing [9, 20].',
      'Only children 15 and 7 remain for the final level.',
    ],
  },
  patternCheck: {
    prompt:
      'What keeps one floor’s roll call separate from the next?',
    options: [
      {
        id: 'freeze-queue-length',
        label: 'Save the queue length before processing that floor.',
      },
      {
        id: 'drain-entire-queue',
        label: 'Keep removing until the queue is empty, including new children.',
      },
      {
        id: 'sort-values',
        label: 'Sort all node values and split them into equal groups.',
      },
      {
        id: 'use-one-stack',
        label: 'Use a stack and finish one deep branch at a time.',
      },
    ],
    correctOptionId: 'freeze-queue-length',
    feedback: {
      correct:
        'Exactly. The saved length counts only nodes already waiting on the current floor.',
      incorrect:
        'That loses the boundary between parent and child levels.',
      secondIncorrect:
        'Record len(queue), then pop exactly that many nodes before saving the level.',
    },
    hints: ['The queue grows while a level is processed.', 'New children must wait for the next outer loop.'],
  },
  retrievalCheck: {
    prompt:
      'Type the data structure that naturally visits nodes first-in, first-out.',
    acceptedAnswers: ['queue', 'a queue', 'fifo queue', 'a fifo queue', 'deque', 'a deque'],
    placeholder: 'Data structure',
    feedback: {
      correct:
        'Right. FIFO order keeps all parents ahead of their children.',
      incorrect:
        'Choose the structure that removes the oldest waiting node.',
      secondIncorrect:
        'Use a queue.',
    },
    hints: ['FIFO means first in, first out.', 'A deque can implement it in Python.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the floor-by-floor queue routine.',
    feedback: {
      correct:
        'The frozen boundary protects each level while children queue for the next one.',
      incorrect:
        'Save the level size before popping and append the level only after its nodes are collected.',
      secondIncorrect:
        'Use queue root → freeze size → collect → enqueue children → save level.',
    },
    hints: ['Handle an empty root before queue setup.', 'The repeated middle actions happen for a fixed count.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] as a level-order list with null gaps and return nested lists grouped by depth.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return []

    # TODO: build the sparse tree.
    root = None
    queue = deque([root])
    levels = []
    while queue:
        # TODO: collect exactly one level.
        pass
    return levels`,
    cases: {
      visibleExample: {
        input: { tree: [3, 9, 20, null, null, 15, 7] },
        expected: [[3], [9, 20], [15, 7]],
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { tree: [1, 2, 3, 4, null, null, 5] },
        expected: [[1], [2, 3], [4, 5]],
      },
    },
    feedback: {
      correct:
        'Every treehouse floor answers in order, including uneven floors.',
      incorrect:
        'A floor boundary or sparse child was handled incorrectly.',
      secondIncorrect:
        'For each outer loop, set size=len(queue), pop size nodes, enqueue real children, and append that level.',
    },
    hints: [
      'Build the tree by consuming children for queued real parents.',
      'Never enqueue None nodes for traversal.',
      'Use a fresh level list in each outer loop.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two', right: 'three' },
        { id: 'two', value: 2, left: 'four' },
        { id: 'three', value: 3, right: 'five' },
        { id: 'four', value: 4 },
        { id: 'five', value: 5 },
      ],
      highlightedNodeIds: ['four', 'five'],
      pointers: [{ nodeId: 'four', label: 'same level' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  binaryTreeLevelOrderTraversalMissionSeed,
)

export default problemLesson
