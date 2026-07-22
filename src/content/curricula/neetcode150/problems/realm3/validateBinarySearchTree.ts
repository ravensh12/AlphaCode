import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const validateBinarySearchTreeMissionSeed = {
  slug: 'validate-binary-search-tree',
  estimatedMinutes: 24,
  mission: {
    title: 'Audit the Number Grove',
    context:
      'A grove files numbered seeds in branching cabinets: every seed to the left must be smaller, and every seed to the right must be larger. One misplaced seed can break a rule set by a distant cabinet.',
    prompt:
      'Inspect the level-order JSON tree and return whether it follows strict binary-search ordering everywhere.',
  },
  objective:
    'Validate every node against lower and upper bounds inherited from all ancestors.',
  priorKnowledge: [
    'A search-tree node divides values into smaller-left and larger-right regions.',
    'Recursive calls can carry allowed ranges as parameters.',
  ],
  recognitionCue:
    'The rule concerns all descendants, so each node must obey limits created by more than its immediate parent.',
  misconception:
    'Checking only parent-child pairs accepts a deep value that crosses an older ancestor’s boundary.',
  algorithmSteps: [
    {
      id: 'empty-valid',
      instruction: 'Treat a missing node as valid.',
    },
    {
      id: 'check-range',
      instruction: 'Reject a value that is not strictly between its lower and upper bounds.',
    },
    {
      id: 'tighten-left',
      instruction: 'Validate the left subtree with the current value as its upper bound.',
    },
    {
      id: 'tighten-right',
      instruction: 'Validate the right subtree with the current value as its lower bound.',
    },
    {
      id: 'require-both',
      instruction: 'Report valid only when both subtree checks pass.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'Every node is checked once; the active recursive path uses up to h stack frames.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'five',
      nodes: [
        { id: 'five', value: 5, left: 'one', right: 'four' },
        { id: 'one', value: 1 },
        { id: 'four', value: 4, left: 'three', right: 'six' },
        { id: 'three', value: 3 },
        { id: 'six', value: 6 },
      ],
      highlightedNodeIds: ['four'],
      pointers: [{ nodeId: 'four', label: 'must be > 5' }],
    },
  },
  workedExample: {
    prompt:
      'In [5, 1, 4, null, null, 3, 6], node 4 is the root’s right child, so its inherited lower bound is 5. Because 4 is not greater than 5, the audit fails.',
    code: [
      'def valid(node, low, high):',
      '    if node is None: return True',
      '    if not (low < node.value < high): return False',
      '    return valid(node.left, low, node.value) and \\',
      '           valid(node.right, node.value, high)',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Root 5 begins with no finite limits.',
      'Its right subtree inherits the strict range (5, infinity).',
      'Value 4 breaks that range immediately, even though its own children look ordered.',
    ],
  },
  patternCheck: {
    prompt:
      'Which check catches values that violate a rule set several levels above?',
    options: [
      {
        id: 'ancestor-bounds',
        label: 'Carry a strict allowed interval into every recursive call.',
      },
      {
        id: 'parent-pairs',
        label: 'Compare each node only with its immediate children.',
      },
      {
        id: 'balanced-shape',
        label: 'Require the two subtree heights to stay within one.',
      },
      {
        id: 'unique-values',
        label: 'Put all values in a set and check only for duplicates.',
      },
    ],
    correctOptionId: 'ancestor-bounds',
    feedback: {
      correct:
        'Exactly. The interval summarizes every ancestor rule that still applies.',
      incorrect:
        'That misses ordering across generations or checks a different property.',
      secondIncorrect:
        'Pass (low,node.value) left and (node.value,high) right.',
    },
    hints: ['A right descendant of 5 must stay above 5 at every depth.', 'Each turn tightens one side of the interval.'],
  },
  retrievalCheck: {
    prompt:
      'For the left child call, which bound becomes the current node value?',
    acceptedAnswers: [
      'upper bound',
      'the upper bound',
      'high',
      'the high bound',
      'upper',
      'the upper',
      'high bound',
      'max',
      'maximum',
    ],
    placeholder: 'Bound name',
    feedback: {
      correct:
        'Right. Everything on the left must remain strictly below the current value.',
      incorrect:
        'Ask which side of the allowed interval limits larger values.',
      secondIncorrect:
        'The upper bound becomes node.value.',
    },
    hints: ['Left means smaller.', 'The lower bound is inherited unchanged.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the strict-range audit routine.',
    feedback: {
      correct:
        'The node passes its inherited interval before each child receives a tighter one.',
      incorrect:
        'Check the current range before recursing, and require both sides.',
      secondIncorrect:
        'Use empty → range check → left range → right range → require both.',
    },
    hints: ['Missing subtrees cannot break ordering.', 'Bounds are strict, so equal values fail.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] in level order and return true only if every value follows strict binary-search-tree bounds; duplicates are invalid.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return True
    # TODO: build the sparse tree.
    root = None

    def valid(node, low, high):
        # TODO: enforce the inherited strict interval.
        pass

    return valid(root, float("-inf"), float("inf"))`,
    cases: {
      visibleExample: {
        input: { tree: [2, 1, 3] },
        expected: true,
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: { tree: [5, 1, 4, null, null, 3, 6] },
        expected: false,
      },
    },
    feedback: {
      correct:
        'The grove audit catches both local and distant ordering mistakes.',
      incorrect:
        'A deep ancestor bound or strict equality rule was lost.',
      secondIncorrect:
        'Reject unless low < value < high; recurse left with high=value and right with low=value.',
    },
    hints: [
      'Use a queue to build the sparse input tree.',
      'An empty node returns True.',
      'Both recursive results must be True.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'five',
      nodes: [
        { id: 'five', value: 5, left: 'one', right: 'four' },
        { id: 'one', value: 1 },
        { id: 'four', value: 4, left: 'three', right: 'six' },
        { id: 'three', value: 3 },
        { id: 'six', value: 6 },
      ],
      highlightedNodeIds: ['five', 'four'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  validateBinarySearchTreeMissionSeed,
)

export default problemLesson
