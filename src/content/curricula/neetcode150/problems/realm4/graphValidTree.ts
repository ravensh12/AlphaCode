import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const graphValidTreeMissionSeed = createRealm4MissionSeed({
  slug: 'graph-valid-tree',
  estimatedMinutes: 24,
  mission: {
    title: 'The Rope-Bridge Blueprint',
    context:
      'An adventure park has numbered platforms joined by two-way rope bridges. The blueprint is safe as a simple branching network only if every platform connects and there is no loop.',
    prompt:
      'Return whether the given platform count and undirected bridge pairs form exactly one tree.',
  },
  objective:
    'Verify the tree edge count and use disjoint-set union to reject a cycle while connecting components.',
  priorKnowledge: [
    'A tree with v vertices has exactly v - 1 edges.',
    'Union-find tracks which vertices already share a component.',
    'Joining two vertices already in one component creates a cycle.',
  ],
  recognitionCue:
    'An undirected graph must be both connected and acyclic.',
  misconception:
    'Having exactly v - 1 bridges alone is not enough when one part contains a cycle and another platform is disconnected.',
  keyRule:
    'Require exactly v - 1 edges, then reject any edge whose endpoints already have the same union-find root.',
  algorithmSteps: [
    { id: 'check-edge-count', instruction: 'Reject unless the bridge count equals platform count minus one.' },
    { id: 'open-parent-rank', instruction: 'Give each platform its own parent and an initial rank.' },
    { id: 'find-root', instruction: 'Find roots with path compression.' },
    { id: 'inspect-bridge', instruction: 'Find the roots of both endpoints for each bridge.' },
    { id: 'reject-same-root', instruction: 'Return false if the roots already match, because the bridge closes a loop.' },
    { id: 'union-different-roots', instruction: 'Join different roots using rank or size.' },
    { id: 'return-valid', instruction: 'Return true after every bridge joins successfully.' },
  ],
  complexity: {
    time: 'O((v + e) α(v))',
    space: 'O(v)',
    explanation:
      'Path compression and union by rank make each disjoint-set operation nearly constant; parent and rank arrays store v platforms.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'p0', label: '0', parentId: 'p0', rank: 2 },
        { id: 'p1', label: '1', parentId: 'p0', rank: 1 },
        { id: 'p2', label: '2', parentId: 'p0', rank: 1 },
        { id: 'p3', label: '3', parentId: 'p2', rank: 1 },
        { id: 'p4', label: '4', parentId: 'p2', rank: 1 },
      ],
      highlightedNodeIds: ['p0'],
    },
  },
  workedExample: {
    prompt:
      'Five platforms use bridges 0-1, 0-2, 2-3, and 2-4. Four bridges match v - 1, and every union joins two different roots.',
    code: [
      '5 platforms require exactly 4 bridges',
      'union(0,1), then union(0,2)',
      'union(2,3) joins platform 3 to the main root',
      'union(2,4) joins platform 4',
      'no same-root edge appeared -> return true',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The edge-count check passes before union work begins.',
      'Each bridge reduces the number of components by one.',
      'No edge connects vertices already joined, so there is no cycle.',
      'Four successful unions from five starting components leave one connected network.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'p0', label: '0 root', parentId: 'p0', size: 5 },
        { id: 'p1', label: '1', parentId: 'p0' },
        { id: 'p2', label: '2', parentId: 'p0' },
        { id: 'p3', label: '3', parentId: 'p0' },
        { id: 'p4', label: '4', parentId: 'p0' },
      ],
      highlightedNodeIds: ['p0'],
    },
  },
  patternCheck: {
    prompt:
      'A bridge’s two endpoints already have the same union-find root. What does that prove?',
    options: [
      { id: 'closes-cycle', label: 'That bridge closes a cycle, so the network is not a tree.' },
      { id: 'connects-components', label: 'It joins two previously separate components.' },
      { id: 'proves-connected', label: 'It proves every platform in the graph is connected.' },
      { id: 'needs-more-edges', label: 'It proves another duplicate bridge is required.' },
    ],
    correctOptionId: 'closes-cycle',
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
      'How many edges must an undirected tree with v vertices have?',
    acceptedAnswers: [
      'v - 1',
      'v minus 1',
      'one fewer edge than vertices',
      'v-1',
      'n - 1',
      'n-1',
      'n minus 1',
      'one less than the number of vertices',
    ],
    placeholder: 'Type the edge count',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: '0' },
        { id: 'b', label: '1' },
        { id: 'c', label: '2' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bc', from: 'b', to: 'c' },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the blueprint check: edge count, initialize DSU, find roots, inspect each bridge, reject equal roots, union different roots, return.',
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'a', label: 'A', parentId: 'a' },
        { id: 'b', label: 'B', parentId: 'b' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["platforms"] and undirected data["bridges"] pairs. Return true exactly when the graph is one connected acyclic tree.',
    starterCode: `def solve(data):
    count = data["platforms"]
    bridges = data["bridges"]
    if len(bridges) != count - 1:
        return False

    parent = list(range(count))
    rank = [0] * count

    def find(node):
        # Compress the path to its root.
        pass

    # Union each bridge, rejecting equal roots.
    return True`,
    cases: {
      visibleExample: {
        input: {
          platforms: 5,
          bridges: [
            [0, 1],
            [0, 2],
            [2, 3],
            [2, 4],
          ],
        },
        expected: true,
      },
      hiddenBoundary: {
        input: { platforms: 1, bridges: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          platforms: 4,
          bridges: [
            [0, 1],
            [1, 2],
            [2, 0],
          ],
        },
        expected: false,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'p0', label: '0', parentId: 'p0' },
        { id: 'p1', label: '1', parentId: 'p0' },
        { id: 'p2', label: '2', parentId: 'p0' },
        { id: 'p3', label: '3 separate', parentId: 'p3' },
      ],
      highlightedNodeIds: ['p3'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(graphValidTreeMissionSeed)

export default problemLesson
