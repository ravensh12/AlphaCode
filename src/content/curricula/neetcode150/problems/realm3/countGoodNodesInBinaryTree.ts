import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const countGoodNodesInBinaryTreeMissionSeed = {
  slug: 'count-good-nodes-in-binary-tree',
  estimatedMinutes: 23,
  mission: {
    title: 'Count the Record-High Beacons',
    context:
      'Each beacon in a branching valley has a signal number. A beacon earns a gold flag when no earlier beacon on its route from headquarters has a greater number.',
    prompt:
      'From a level-order JSON tree, count nodes whose value is at least the greatest value seen earlier on their root-to-node path.',
  },
  objective:
    'Carry the path maximum through depth-first search and count nodes that meet or exceed it.',
  priorKnowledge: [
    'Each root-to-node route has its own history.',
    'A running maximum summarizes all earlier values on one route.',
  ],
  recognitionCue:
    'A node is judged against every ancestor on its own path, not against siblings or the whole tree.',
  misconception:
    'Using one global maximum across the traversal wrongly lets one branch affect another branch.',
  algorithmSteps: [
    {
      id: 'stop-at-null',
      instruction: 'Return 0 when the current node is missing.',
    },
    {
      id: 'judge-current',
      instruction: 'Count 1 when the node value is at least the incoming path maximum.',
    },
    {
      id: 'raise-path-max',
      instruction: 'Update the path maximum with the current value.',
    },
    {
      id: 'visit-branches',
      instruction: 'Add counts from left and right using the updated maximum.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'Each node receives one path maximum, and recursion stores at most h active route nodes.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'three',
      nodes: [
        { id: 'three', value: 3, left: 'one', right: 'four' },
        { id: 'one', value: 1, left: 'left-three' },
        { id: 'four', value: 4, left: 'low-one', right: 'five' },
        { id: 'left-three', value: 3 },
        { id: 'low-one', value: 1 },
        { id: 'five', value: 5 },
      ],
      highlightedNodeIds: ['three', 'left-three', 'four', 'five'],
      pointers: [{ nodeId: 'left-three', label: 'ties record 3' }],
    },
  },
  workedExample: {
    prompt:
      'In [3, 1, 4, 3, null, 1, 5], the root, left-side 3, right-side 4, and 5 meet their route records, for a count of 4.',
    code: [
      'def count(node, path_max):',
      '    if node is None: return 0',
      '    earned = 1 if node.value >= path_max else 0',
      '    next_max = max(path_max, node.value)',
      '    return earned + count(node.left, next_max) + count(node.right, next_max)',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Root 3 sets the first route record and counts.',
      'The left value 1 does not count, but its child 3 ties the record and does.',
      'On the right route, 4 and then 5 each set a new record.',
    ],
  },
  patternCheck: {
    prompt:
      'What state should travel from a parent into each child call?',
    options: [
      {
        id: 'path-maximum',
        label: 'The greatest value seen on that root-to-parent route.',
      },
      {
        id: 'global-maximum',
        label: 'The greatest value found anywhere in the traversal so far.',
      },
      {
        id: 'parent-only',
        label: 'Only the immediate parent value.',
      },
      {
        id: 'level-average',
        label: 'The average of all values on the current level.',
      },
    ],
    correctOptionId: 'path-maximum',
    feedback: {
      correct:
        'Yes. The path maximum is the smallest summary that represents every ancestor on that route.',
      incorrect:
        'That either forgets older ancestors or mixes unrelated branches.',
      secondIncorrect:
        'Pass max(path_max, node.value) separately into both child routes.',
    },
    hints: ['Siblings do not become each other’s ancestors.', 'One number can summarize all ancestor comparisons.'],
  },
  retrievalCheck: {
    prompt:
      'Complete the flag rule: count the node when node.value is ______ the path maximum.',
    acceptedAnswers: [
      'greater than or equal to',
      'at least',
      'greater than or equal to the',
      'greater than or equal',
      'greater or equal to',
      '>=',
      'at least equal to',
    ],
    placeholder: 'Comparison words',
    feedback: {
      correct:
        'Correct. A tie still means no ancestor was greater.',
      incorrect:
        'Remember that matching the earlier record also earns a flag.',
      secondIncorrect:
        'Use “greater than or equal to.”',
    },
    hints: ['The rule says no ancestor is greater.', 'Equality passes.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the path-record DFS actions.',
    feedback: {
      correct:
        'The current node is judged against the old record before the new record travels downward.',
      incorrect:
        'Do not update the path maximum before deciding whether the current node tied or beat it.',
      secondIncorrect:
        'Use stop → judge → update maximum → visit branches.',
    },
    hints: ['The incoming value describes ancestors only.', 'Both children receive the same updated record value.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] in level order and return the number of nodes that are at least every earlier value on their own root path.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    if not values:
        return 0
    # TODO: build the sparse tree.
    root = None

    def count_records(node, path_max):
        # TODO: judge this node and recurse with an updated route record.
        pass

    return count_records(root, root.value)`,
    cases: {
      visibleExample: {
        input: { tree: [3, 1, 4, 3, null, 1, 5] },
        expected: 4,
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { tree: [-1, -2, -3, -4, null, -1, -2] },
        expected: 2,
      },
    },
    feedback: {
      correct:
        'All record-high beacons were counted, including ties and negative routes.',
      incorrect:
        'A route record was mixed across branches or equality was not counted.',
      secondIncorrect:
        'At each node, earned=int(value>=path_max), next_max=max(path_max,value), then add both child results.',
    },
    hints: [
      'Do not initialize the record to 0; tree values may be negative.',
      'Starting with root.value guarantees the root counts.',
      'Integers can be added to recursive child counts.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'minus-one',
      nodes: [
        { id: 'minus-one', value: -1, left: 'minus-two', right: 'minus-three' },
        { id: 'minus-two', value: -2, left: 'minus-four' },
        { id: 'minus-three', value: -3, left: 'tie', right: 'low' },
        { id: 'minus-four', value: -4 },
        { id: 'tie', value: -1 },
        { id: 'low', value: -2 },
      ],
      highlightedNodeIds: ['minus-one', 'tie'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  countGoodNodesInBinaryTreeMissionSeed,
)

export default problemLesson
