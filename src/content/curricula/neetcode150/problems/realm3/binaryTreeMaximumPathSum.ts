import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const binaryTreeMaximumPathSumMissionSeed = {
  slug: 'binary-tree-maximum-path-sum',
  estimatedMinutes: 30,
  mission: {
    title: 'Chart the Brightest Energy Route',
    context:
      'A branching power grid gives or drains energy at each station. An engineer wants one continuous route with the greatest total, and the route may start and end at any stations.',
    prompt:
      'Read the level-order JSON tree and return the largest sum along any nonempty path that follows parent-child links without revisiting a node.',
  },
  objective:
    'Use postorder gains, ignore harmful negative branches, and track the best two-sided path at every node.',
  priorKnowledge: [
    'A path extended to a parent can use at most one child branch.',
    'A finished path may join one left branch and one right branch through a node.',
  ],
  recognitionCue:
    'The best route may begin and end anywhere, while each node can connect at most two path edges.',
  misconception:
    'Returning both child gains upward creates a fork, which is not a single path a parent can extend.',
  algorithmSteps: [
    {
      id: 'empty-gain',
      instruction: 'Give a missing child a gain of 0.',
    },
    {
      id: 'clamp-gains',
      instruction: 'Compute both child gains and replace negative gains with 0.',
    },
    {
      id: 'test-complete-path',
      instruction: 'Update the best total with node value plus both safe gains.',
    },
    {
      id: 'return-one-arm',
      instruction: 'Return node value plus the larger safe gain to the parent.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'One postorder visit processes every node, and recursion holds at most h nodes.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'minus-ten',
      nodes: [
        { id: 'minus-ten', value: -10, left: 'nine', right: 'twenty' },
        { id: 'nine', value: 9 },
        { id: 'twenty', value: 20, left: 'fifteen', right: 'seven' },
        { id: 'fifteen', value: 15 },
        { id: 'seven', value: 7 },
      ],
      highlightedNodeIds: ['fifteen', 'twenty', 'seven'],
      pointers: [{ nodeId: 'twenty', label: '15 + 20 + 7' }],
    },
  },
  workedExample: {
    prompt:
      'In [-10, 9, 20, null, null, 15, 7], station 20 joins gains 15 and 7 for total 42. Extending through -10 would only lower it.',
    code: [
      'def brightest_route(root):',
      '    best = float("-inf")',
      '    def gain(node):',
      '        nonlocal best',
      '        if node is None: return 0',
      '        left = max(0, gain(node.left))',
      '        right = max(0, gain(node.right))',
      '        best = max(best, node.value + left + right)',
      '        return node.value + max(left, right)',
      '    gain(root)',
      '    return best',
    ],
    currentLineIndex: 7,
    walkthrough: [
      'Leaves 15 and 7 provide positive gains.',
      'Node 20 forms a complete route totaling 15 + 20 + 7 = 42.',
      'Only gain 35 can travel upward, and adding -10 cannot beat 42.',
    ],
  },
  patternCheck: {
    prompt:
      'Why are the local best update and the returned gain different?',
    options: [
      {
        id: 'two-arms-local-one-up',
        label: 'A completed path may use two child arms, but an upward path may use only one.',
      },
      {
        id: 'always-return-both',
        label: 'Both child arms should always be returned to every ancestor.',
      },
      {
        id: 'ignore-node-value',
        label: 'The local update uses children, while the return uses no current value.',
      },
      {
        id: 'choose-shorter-arm',
        label: 'The upward gain must use the smaller child to avoid revisiting.',
      },
    ],
    correctOptionId: 'two-arms-local-one-up',
    feedback: {
      correct:
        'Exactly. The turning point may join two arms, but a path cannot fork again above it.',
      incorrect:
        'That breaks path shape or throws away useful energy.',
      secondIncorrect:
        'Update with value+left+right; return value+max(left,right).',
    },
    hints: ['A path gives each internal node at most two path neighbors.', 'The parent link already uses one side of the upward path.'],
  },
  retrievalCheck: {
    prompt:
      'What value replaces a negative child gain before it is used?',
    acceptedAnswers: ['0', 'zero'],
    placeholder: 'Clamped gain',
    feedback: {
      correct:
        'Right. Skipping a harmful branch is better than reducing the route total.',
      incorrect:
        'A path is allowed to end at the current node instead of taking that branch.',
      secondIncorrect:
        'Clamp it to 0.',
    },
    hints: ['The route does not have to include every child.', 'Use max(0, child_gain).'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the postorder energy-gain routine.',
    feedback: {
      correct:
        'Safe gains support a two-arm local answer and a one-arm return.',
      incorrect:
        'Both child gains must be known and clamped before the best total is tested.',
      secondIncorrect:
        'Use empty gain → clamp children → test complete path → return one arm.',
    },
    hints: ['The global best should start below any possible node value.', 'The return cannot include both branches.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read a nonempty level-order integer tree and return the greatest sum of any nonempty parent-child path.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    # TODO: build the sparse tree.
    root = None
    best = float("-inf")

    def gain(node):
        nonlocal best
        # TODO: update a two-arm best and return one arm.
        pass

    gain(root)
    return best`,
    cases: {
      visibleExample: {
        input: { tree: [-10, 9, 20, null, null, 15, 7] },
        expected: 42,
      },
      hiddenBoundary: {
        input: { tree: [5] },
        expected: 5,
      },
      hiddenAdversarial: {
        input: { tree: [-3, -2, -4] },
        expected: -2,
      },
    },
    feedback: {
      correct:
        'The brightest route is correct, even when every station drains energy.',
      incorrect:
        'A negative branch was forced into the route or a two-arm value was returned upward.',
      secondIncorrect:
        'Clamp child gains at zero, update best with value+left+right, and return value+max(left,right).',
    },
    hints: [
      'Initialize best to negative infinity, not zero.',
      'A leaf must be able to become the answer by itself.',
      'Build level-order children with a queue.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'minus-three',
      nodes: [
        { id: 'minus-three', value: -3, left: 'minus-two', right: 'minus-four' },
        { id: 'minus-two', value: -2 },
        { id: 'minus-four', value: -4 },
      ],
      highlightedNodeIds: ['minus-two'],
      pointers: [{ nodeId: 'minus-two', label: 'best alone' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  binaryTreeMaximumPathSumMissionSeed,
)

export default problemLesson
