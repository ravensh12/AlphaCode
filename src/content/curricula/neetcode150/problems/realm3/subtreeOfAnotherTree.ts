import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const subtreeOfAnotherTreeMissionSeed = {
  slug: 'subtree-of-another-tree',
  estimatedMinutes: 26,
  mission: {
    title: 'Find the Hidden Mini-Map',
    context:
      'A giant branching cave map may contain a smaller map copied exactly from one chamber downward. The search team needs to know whether the mini-map begins anywhere in the cave.',
    prompt:
      'Given a main tree and a candidate tree in level-order JSON, report whether some main-tree node starts an exact copy of the candidate.',
  },
  objective:
    'Search every possible root in one tree and use exact paired-tree comparison at each candidate root.',
  priorKnowledge: [
    'Exact tree comparison checks both values and missing-child shape.',
    'A depth-first search can visit every possible starting node.',
  ],
  recognitionCue:
    'The task asks whether a whole rooted tree appears starting at any node inside a larger tree.',
  misconception:
    'Finding the candidate root value is not enough; every descendant and gap must also match.',
  algorithmSteps: [
    {
      id: 'empty-candidate',
      instruction: 'If the candidate tree is empty, report that it is contained.',
    },
    {
      id: 'exhausted-main',
      instruction: 'If the main node is missing, this search branch cannot match.',
    },
    {
      id: 'test-current-root',
      instruction: 'Use exact-tree comparison at the current main node.',
    },
    {
      id: 'search-below',
      instruction: 'If needed, search for a start in the left or right subtree.',
    },
  ],
  complexity: {
    time: 'O(n × m) worst case',
    space: 'O(h + k)',
    explanation:
      'Up to n main-tree starts may each compare m candidate nodes; recursive stacks follow tree heights h and k.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'three',
      nodes: [
        { id: 'three', value: 3, left: 'four', right: 'five' },
        { id: 'four', value: 4, left: 'one', right: 'two' },
        { id: 'five', value: 5 },
        { id: 'one', value: 1 },
        { id: 'two', value: 2 },
      ],
      pointers: [{ nodeId: 'four', label: 'candidate start' }],
      highlightedNodeIds: ['four', 'one', 'two'],
    },
  },
  workedExample: {
    prompt:
      'Inside [3, 4, 5, 1, 2], the node holding 4 starts the exact tree [4, 1, 2], including all child gaps.',
    code: [
      'def contains(main, small):',
      '    if small is None: return True',
      '    if main is None: return False',
      '    if same(main, small): return True',
      '    return contains(main.left, small) or contains(main.right, small)',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The root value 3 does not match candidate root 4.',
      'The search moves to the main tree’s left child.',
      'At value 4, exact comparison confirms children 1 and 2 and returns true.',
    ],
  },
  patternCheck: {
    prompt:
      'Which strategy finds a complete mini-map rather than just a matching label?',
    options: [
      {
        id: 'search-and-compare',
        label: 'Try every main-tree start and run exact comparison there.',
      },
      {
        id: 'root-value-only',
        label: 'Return true at the first node with the candidate root value.',
      },
      {
        id: 'same-node-count',
        label: 'Compare only the number of nodes in both trees.',
      },
      {
        id: 'leaf-membership',
        label: 'Check whether every candidate leaf value appears somewhere.',
      },
    ],
    correctOptionId: 'search-and-compare',
    feedback: {
      correct:
        'Yes. One DFS finds possible roots, and the paired comparison proves the whole shape.',
      incorrect:
        'That can accept scattered values or an incomplete match.',
      secondIncorrect:
        'Separate the job into “where could it start?” and “does everything below match?”',
    },
    hints: ['The same root value may appear many times.', 'A candidate is anchored at one main-tree node.'],
  },
  retrievalCheck: {
    prompt:
      'Type the result when the candidate tree is empty.',
    acceptedAnswers: ['true'],
    matcher: { mode: 'boolean', expected: true },
    placeholder: 'Boolean result',
    feedback: {
      correct:
        'Correct. The empty tree is contained without needing a node.',
      incorrect:
        'Use the usual empty-pattern convention.',
      secondIncorrect:
        'Return true.',
    },
    hints: ['There is nothing left to match.', 'This case should work even if the main tree is empty.'],
  },
  reconstructionCheck: {
    prompt:
      'Order the outer subtree-search actions.',
    feedback: {
      correct:
        'The special empty cases come before the current-root test and deeper search.',
      incorrect:
        'Handle an empty candidate before deciding that an empty main branch failed.',
      secondIncorrect:
        'Use empty candidate → empty main → compare here → search children.',
    },
    hints: ['The candidate’s empty case wins first.', 'Search below only after the current start fails.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["tree"] and data["candidate"] as level-order trees. Return true when candidate is an exact rooted subtree of tree.',
    starterCode: `from collections import deque

def solve(data):
    # TODO: build both sparse trees from their level-order lists.
    main_root = None
    candidate_root = None

    def same(first, second):
        pass

    def contains(node):
        # TODO: test this start, then search both children.
        pass

    return contains(main_root)`,
    cases: {
      visibleExample: {
        input: { tree: [3, 4, 5, 1, 2], candidate: [4, 1, 2] },
        expected: true,
      },
      hiddenBoundary: {
        input: { tree: [8], candidate: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          tree: [3, 4, 5, 1, 2, null, null, null, null, 0],
          candidate: [4, 1, 2],
        },
        expected: false,
      },
    },
    feedback: {
      correct:
        'Mini-map search complete. Extra descendants correctly prevent a false match.',
      incorrect:
        'A candidate start was skipped or an almost-match was accepted.',
      secondIncorrect:
        'Build both roots, make same() compare exact shape and values, then test same(node,candidate) at every main node.',
    },
    hints: [
      'An empty candidate returns true before searching.',
      'Exact comparison must notice an extra child in either tree.',
      'The outer search uses OR across current, left, and right possibilities.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'four',
      nodes: [
        { id: 'four', value: 4, left: 'one', right: 'two' },
        { id: 'one', value: 1 },
        { id: 'two', value: 2, left: 'zero' },
        { id: 'zero', value: 0 },
      ],
      highlightedNodeIds: ['zero'],
      pointers: [{ nodeId: 'zero', label: 'extra node' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(subtreeOfAnotherTreeMissionSeed)

export default problemLesson
