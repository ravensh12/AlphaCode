import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const redundantConnectionMissionSeed = createRealm4MissionSeed({
  slug: 'redundant-connection',
  estimatedMinutes: 22,
  mission: {
    title: 'The Extra Skywalk',
    context:
      'Campus buildings receive two-way skywalks one proposal at a time. The planners want the first proposal that would create a loop among buildings already connected.',
    prompt:
      'Process the edge list in order and return that first redundant [buildingA, buildingB] pair. Return [] if none creates a loop.',
  },
  objective:
    'Detect the first cycle-closing undirected edge with incremental union-find.',
  priorKnowledge: [
    'Union-find answers whether two vertices already share a component.',
    'Adding an edge inside one component creates a cycle.',
    'Input order matters when the first redundant edge is requested.',
  ],
  recognitionCue:
    'Undirected edges arrive over time and the task asks which edge first connects already-connected endpoints.',
  misconception:
    'Unioning endpoints before comparing their roots makes every edge appear to have matching roots.',
  keyRule:
    'Find both roots before union; if they match, return the current edge immediately, otherwise merge them.',
  algorithmSteps: [
    { id: 'collect-buildings', instruction: 'Create a parent and size entry for every building label that appears.' },
    { id: 'read-next-walk', instruction: 'Process skywalk proposals in their given order.' },
    { id: 'find-two-roots', instruction: 'Find the current root of each endpoint before changing parents.' },
    { id: 'return-equal-root-edge', instruction: 'If the roots match, return the current pair as redundant.' },
    { id: 'union-different-roots', instruction: 'Otherwise join the two components by size.' },
    { id: 'continue-scan', instruction: 'Continue to the next proposal after a successful merge.' },
    { id: 'return-empty', instruction: 'Return an empty list if every edge joins separate components.' },
  ],
  complexity: {
    time: 'O(e α(v))',
    space: 'O(v)',
    explanation:
      'Each edge uses two nearly constant amortized finds and at most one union; disjoint-set maps store each building.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'b1', label: '1' },
        { id: 'b2', label: '2' },
        { id: 'b3', label: '3' },
        { id: 'b4', label: '4' },
      ],
      edges: [
        { id: 'e12', from: 'b1', to: 'b2' },
        { id: 'e23', from: 'b2', to: 'b3' },
        { id: 'e34', from: 'b3', to: 'b4' },
        { id: 'e14', from: 'b1', to: 'b4', label: 'extra' },
      ],
      highlightedEdgeIds: ['e14'],
    },
  },
  workedExample: {
    prompt:
      'Edges 1-2, 2-3, and 3-4 build one chain. Proposal 1-4 then has the same root at both endpoints, so it is the first extra skywalk.',
    code: [
      'union 1-2',
      'union 2-3 -> roots of 1 and 3 now match',
      'union 3-4 -> all four share one component',
      'inspect 1-4: find(1) == find(4)',
      'return [1, 4] before reading later proposals',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first three edges each reduce the component count.',
      'A path already connects 1 to 4 through 2 and 3.',
      'Adding the direct 1-4 edge closes a loop.',
      'Immediate return preserves the first-in-input requirement.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'r', label: 'root', parentId: 'r', size: 4 },
        { id: 'b1', label: '1', parentId: 'r' },
        { id: 'b2', label: '2', parentId: 'r' },
        { id: 'b3', label: '3', parentId: 'r' },
        { id: 'b4', label: '4', parentId: 'r' },
      ],
      highlightedNodeIds: ['b1', 'b4'],
    },
  },
  patternCheck: {
    prompt:
      'Before adding a proposed skywalk, both endpoint roots are equal. What should the algorithm do?',
    options: [
      { id: 'return-current-edge', label: 'Return the current edge because an existing path already connects its endpoints.' },
      { id: 'union-again', label: 'Union the equal roots and keep scanning.' },
      { id: 'remove-old-edge', label: 'Delete the earliest edge in that component.' },
      { id: 'reset-dsu', label: 'Reset every building to its own component.' },
    ],
    correctOptionId: 'return-current-edge',
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'a', label: 'A', parentId: 'r' },
        { id: 'b', label: 'B', parentId: 'r' },
        { id: 'r', label: 'same root', parentId: 'r' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  retrievalCheck: {
    prompt:
      'Why must root comparison happen before the union for the current edge?',
    acceptedAnswers: [
      'union would make the roots equal even for a useful edge',
      'we must know whether the endpoints were already connected',
      'compare before changing the components',
      'because after union the roots always match',
      'otherwise every edge would appear redundant',
      'to know whether the endpoints were already connected',
      'union first makes every edge look redundant',
    ],
    placeholder: 'Explain the operation order',
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'a', label: 'root A', parentId: 'a' },
        { id: 'b', label: 'root B', parentId: 'b' },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the skywalk scan: initialize labels, read edge, find roots, return if equal, union if different, continue, empty fallback.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ id: 'edge', from: 'a', to: 'b', label: 'next proposal' }],
      highlightedEdgeIds: ['edge'],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read undirected data["skywalks"] pairs and return the first pair whose addition joins endpoints already connected by earlier pairs, or [].',
    starterCode: `def solve(data):
    edges = data["skywalks"]
    labels = {node for edge in edges for node in edge}
    parent = {node: node for node in labels}
    size = {node: 1 for node in labels}

    def find(node):
        # Return the compressed component root.
        pass

    # Compare roots before each union and return the first match.
    return []`,
    cases: {
      visibleExample: {
        input: {
          skywalks: [
            [1, 2],
            [2, 3],
            [3, 4],
            [1, 4],
            [1, 5],
          ],
        },
        expected: [1, 4],
      },
      hiddenBoundary: {
        input: { skywalks: [[8, 9]] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          skywalks: [
            [4, 5],
            [5, 6],
            [6, 4],
            [4, 6],
          ],
        },
        expected: [6, 4],
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'b4', label: '4' },
        { id: 'b5', label: '5' },
        { id: 'b6', label: '6' },
      ],
      edges: [
        { id: 'e45', from: 'b4', to: 'b5' },
        { id: 'e56', from: 'b5', to: 'b6' },
        { id: 'e64', from: 'b6', to: 'b4', label: 'first loop' },
      ],
      highlightedEdgeIds: ['e64'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(redundantConnectionMissionSeed)

export default problemLesson
