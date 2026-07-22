import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const minCostToConnectAllPointsMissionSeed = createRealm4MissionSeed({
  slug: 'min-cost-to-connect-all-points',
  estimatedMinutes: 26,
  mission: {
    title: 'The Sensor Cable Network',
    context:
      'A field lab places sensors on a grid. Cable cost is the horizontal gap plus the vertical gap. Every sensor must join one network.',
    prompt:
      'Return the smallest total cable cost. Extra cycles are unnecessary because they add cost without connecting a new sensor.',
  },
  objective:
    'Use Prim’s method to build a minimum-cost tree with Manhattan distance.',
  priorKnowledge: [
    'A spanning tree connects n vertices with n - 1 edges.',
    'Manhattan distance is abs(x1 - x2) + abs(y1 - y2).',
    'Prim’s algorithm grows one connected set by its cheapest crossing edge.',
  ],
  recognitionCue:
    'All points must connect for the smallest total cost; no single start-to-end route is requested.',
  misconception:
    'Connecting each sensor to its individually nearest sensor can form separate clusters instead of one network.',
  keyRule:
    'Add the unused sensor with the cheapest link to the tree, then lower each remaining sensor’s best known link.',
  algorithmSteps: [
    { id: 'handle-small-input', instruction: 'Return zero when fewer than two sensors exist.' },
    { id: 'open-prim-state', instruction: 'Mark no sensors used and set one start sensor’s best connection to zero.' },
    { id: 'select-cheapest-unused', instruction: 'Choose the unused sensor with minimum best connection cost.' },
    { id: 'add-edge-cost', instruction: 'Mark it used and add that cost to the total.' },
    { id: 'measure-remaining', instruction: 'Compute its Manhattan distance to every unused sensor.' },
    { id: 'relax-best-costs', instruction: 'Lower each remaining sensor’s best cost when this connection is cheaper.' },
    { id: 'repeat-all-points', instruction: 'Repeat until every sensor is in the tree.' },
    { id: 'return-total', instruction: 'Return the accumulated cable cost.' },
  ],
  complexity: {
    time: 'O(n²)',
    space: 'O(n)',
    explanation:
      'The array-based Prim scan selects and relaxes across n sensors for n rounds, while used and best-cost arrays store n values.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: '(0,0)' },
        { id: 'b', label: '(2,1)' },
        { id: 'c', label: '(3,3)' },
        { id: 'd', label: '(6,2)' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 3 },
        { id: 'bc', from: 'b', to: 'c', weight: 3 },
        { id: 'cd', from: 'c', to: 'd', weight: 4 },
        { id: 'bd', from: 'b', to: 'd', weight: 5 },
      ],
      highlightedEdgeIds: ['ab', 'bc', 'cd'],
    },
  },
  workedExample: {
    prompt:
      'Starting at (0,0), Prim adds (2,1) for 3, then (3,3) for 3, then (6,2) for 4. The total is 10.',
    code: [
      'tree starts at (0,0), added cost 0',
      'best next is (2,1), cost 3',
      'relax through (2,1): (3,3) now costs 3',
      'add (3,3), then relax (6,2) to cost 4',
      'add final sensor -> total 0 + 3 + 3 + 4 = 10',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The zero start cost does not represent a physical cable.',
      'Each selected best value is the cheapest edge crossing from the built tree.',
      'Relaxation remembers only the cheapest known connection for each outside sensor.',
      'Three chosen edges connect four sensors without a cycle.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 3 },
        { id: 'bc', from: 'b', to: 'c', weight: 3 },
        { id: 'cd', from: 'c', to: 'd', weight: 4 },
      ],
      highlightedEdgeIds: ['ab', 'bc', 'cd'],
    },
  },
  patternCheck: {
    prompt:
      'At each Prim step, which sensor should join the existing network?',
    options: [
      { id: 'cheapest-crossing', label: 'The unused sensor with the cheapest known edge to any used sensor.' },
      { id: 'largest-coordinate', label: 'The sensor with the largest x-coordinate.' },
      { id: 'nearest-origin', label: 'The sensor nearest the original starting point only.' },
      { id: 'random-unused', label: 'Any unused sensor with an arbitrary connecting edge.' },
    ],
    correctOptionId: 'cheapest-crossing',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'tree', label: 'built tree' },
        { id: 'near', label: 'cost 3' },
        { id: 'far', label: 'cost 8' },
      ],
      edges: [
        { id: 'tn', from: 'tree', to: 'near', weight: 3 },
        { id: 'tf', from: 'tree', to: 'far', weight: 8 },
      ],
      highlightedEdgeIds: ['tn'],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the cable-cost formula between (x1, y1) and (x2, y2).',
    acceptedAnswers: [
      'abs(x1 - x2) + abs(y1 - y2)',
      '|x1-x2| + |y1-y2|',
      'horizontal distance plus vertical distance',
      'abs(x1-x2) + abs(y1-y2)',
      'abs(x1-x2)+abs(y1-y2)',
      '|x1 - x2| + |y1 - y2|',
      '|x1-x2|+|y1-y2|',
    ],
    placeholder: 'Manhattan distance formula',
    diagram: {
      kind: 'array',
      values: ['|x1-x2|', '+', '|y1-y2|'],
      highlight: 1,
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore Prim’s scan: small case, initialize best, select cheapest unused, add cost and mark, measure remaining, relax, repeat, return.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'in', label: 'inside tree' },
        { id: 'out', label: 'outside' },
      ],
      edges: [{ id: 'cross', from: 'in', to: 'out', weight: 4 }],
      highlightedEdgeIds: ['cross'],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read coordinate pairs from data["sensors"]. Return the minimum total Manhattan cable cost needed to connect all sensors.',
    starterCode: `def solve(data):
    points = data["sensors"]
    count = len(points)
    if count < 2:
        return 0

    used = [False] * count
    best = [float("inf")] * count
    best[0] = 0
    total = 0

    for _ in range(count):
        # Select the cheapest unused point, add it, and relax others.
        pass

    return total`,
    cases: {
      visibleExample: {
        input: {
          sensors: [
            [0, 0],
            [2, 1],
            [3, 3],
            [6, 2],
          ],
        },
        expected: 10,
      },
      hiddenBoundary: {
        input: { sensors: [[8, -2]] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          sensors: [
            [1, 1],
            [1, 1],
            [4, 1],
          ],
        },
        expected: 3,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: '(1,1)' },
        { id: 'b', label: '(1,1)' },
        { id: 'c', label: '(4,1)' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 0 },
        { id: 'bc', from: 'b', to: 'c', weight: 3 },
      ],
      highlightedEdgeIds: ['ab', 'bc'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  minCostToConnectAllPointsMissionSeed,
)

export default problemLesson
