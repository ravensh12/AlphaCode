import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const lowestCommonAncestorOfABinarySearchTreeMissionSeed = {
  slug: 'lowest-common-ancestor-of-a-binary-search-tree',
  estimatedMinutes: 22,
  mission: {
    title: 'Meet at the Trail Split',
    context:
      'A mountain trail map stores smaller checkpoint numbers to the left and larger numbers to the right. Two hikers want the lowest checkpoint that lies on both routes from the lodge.',
    prompt:
      'Use the search-tree ordering to find the deepest shared ancestor of checkpoint values p and q.',
  },
  objective:
    'Walk down a binary search tree until the two target values stop lying on the same side.',
  priorKnowledge: [
    'Every value in a search-tree node’s left subtree is smaller.',
    'Every value in its right subtree is larger.',
  ],
  recognitionCue:
    'Two known values lie in a binary search tree, so their comparisons with one node reveal which direction both routes take.',
  misconception:
    'A general ancestor search works, but ignoring the ordering does extra work and hides the split-point idea.',
  algorithmSteps: [
    {
      id: 'start-root',
      instruction: 'Begin at the search-tree root.',
    },
    {
      id: 'both-smaller',
      instruction: 'If both targets are smaller, move to the left child.',
    },
    {
      id: 'both-larger',
      instruction: 'If both targets are larger, move to the right child.',
    },
    {
      id: 'return-split',
      instruction: 'Otherwise return the current value as the shared split point.',
    },
  ],
  complexity: {
    time: 'O(h)',
    space: 'O(1)',
    explanation:
      'The walk follows one root-to-node route of height h and stores only the current node.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'six',
      nodes: [
        { id: 'six', value: 6, left: 'two', right: 'eight' },
        { id: 'two', value: 2, left: 'zero', right: 'four' },
        { id: 'eight', value: 8, left: 'seven', right: 'nine' },
        { id: 'zero', value: 0 },
        { id: 'four', value: 4 },
        { id: 'seven', value: 7 },
        { id: 'nine', value: 9 },
      ],
      highlightedNodeIds: ['two', 'six', 'eight'],
      pointers: [{ nodeId: 'six', label: 'targets split' }],
    },
  },
  workedExample: {
    prompt:
      'For targets 2 and 8, root 6 sits between them. One route turns left and the other right, so 6 is their lowest shared checkpoint.',
    code: [
      'node = root',
      'while node:',
      '    if p < node.value and q < node.value: node = node.left',
      '    elif p > node.value and q > node.value: node = node.right',
      '    else: return node.value',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Target 2 is smaller than 6.',
      'Target 8 is larger than 6.',
      'The routes separate at 6, so no lower node can belong to both.',
    ],
  },
  patternCheck: {
    prompt:
      'When should the search stop at the current checkpoint?',
    options: [
      {
        id: 'targets-split-or-match',
        label: 'When targets lie on different sides or one equals the current value.',
      },
      {
        id: 'first-leaf',
        label: 'When the walk reaches any leaf.',
      },
      {
        id: 'values-add-up',
        label: 'When the two target values add up to the current value.',
      },
      {
        id: 'always-at-root',
        label: 'Always, because the root is an ancestor of every node.',
      },
    ],
    correctOptionId: 'targets-split-or-match',
    feedback: {
      correct:
        'Exactly. The current node is the last shared route point before a split, and a target can be its own ancestor.',
      incorrect:
        'That can stop too high, too low, or for an unrelated number pattern.',
      secondIncorrect:
        'Continue only while both targets compare to the same side.',
    },
    hints: ['A target equal to the current node cannot lie below it.', 'Different comparison signs mark the split.'],
  },
  retrievalCheck: {
    prompt:
      'If both target values are smaller than the current value, type the direction to move.',
    acceptedAnswers: [
      'left',
      'move left',
      'left child',
      'go left',
      'the left child',
      'move to the left child',
      'to the left',
    ],
    placeholder: 'Direction',
    feedback: {
      correct:
        'Right. Search-tree ordering places both target routes on the left.',
      incorrect:
        'Use the smaller-values side of a search tree.',
      secondIncorrect:
        'Move left.',
    },
    hints: ['Smaller values live on one fixed side.', 'Both targets agree on the direction.'],
  },
  reconstructionCheck: {
    prompt:
      'Reassemble the split-point walk through the search tree.',
    feedback: {
      correct:
        'The two same-side tests lead downward; every other comparison means the split is here.',
      incorrect:
        'Check both smaller and both larger before returning the current node.',
      secondIncorrect:
        'Use start → both smaller → both larger → return split.',
    },
    hints: ['Only one child is followed per loop.', 'The fallback case is the answer.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["tree"] is a level-order binary search tree, and p and q are present integer values. Return their lowest shared ancestor value.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    p = data["p"]
    q = data["q"]
    # TODO: build the sparse search tree.
    node = None

    while node is not None:
        # TODO: move together while both targets share a side.
        pass
    return None`,
    cases: {
      visibleExample: {
        input: {
          tree: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5],
          p: 2,
          q: 8,
        },
        expected: 6,
      },
      hiddenBoundary: {
        input: { tree: [2, 1], p: 2, q: 1 },
        expected: 2,
      },
      hiddenAdversarial: {
        input: {
          tree: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5],
          p: 3,
          q: 5,
        },
        expected: 4,
      },
    },
    feedback: {
      correct:
        'The hikers meet at the deepest shared checkpoint, including when one target is the meeting point.',
      incorrect:
        'The walk stopped at the wrong split. Compare both targets with the same current value.',
      secondIncorrect:
        'Move left if p and q are both smaller, right if both larger, otherwise return node.value.',
    },
    hints: [
      'Build the root from the level-order list, then follow child links.',
      'The order of p and q does not matter.',
      'Do not move when one target equals the current value.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'six',
      nodes: [
        { id: 'six', value: 6, left: 'two', right: 'eight' },
        { id: 'two', value: 2, right: 'four' },
        { id: 'eight', value: 8 },
        { id: 'four', value: 4, left: 'three', right: 'five' },
        { id: 'three', value: 3 },
        { id: 'five', value: 5 },
      ],
      highlightedNodeIds: ['three', 'four', 'five'],
      pointers: [{ nodeId: 'four', label: 'split' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  lowestCommonAncestorOfABinarySearchTreeMissionSeed,
)

export default problemLesson
