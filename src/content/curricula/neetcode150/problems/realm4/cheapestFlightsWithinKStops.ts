import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const cheapestFlightsWithinKStopsMissionSeed = createRealm4MissionSeed({
  slug: 'cheapest-flights-within-k-stops',
  estimatedMinutes: 26,
  mission: {
    title: 'The Limited-Hop Drone Fare',
    context:
      'A delivery team can book directed drone hops between depots, each with a fare. A package may pass through at most a fixed number of intermediate depots before reaching its destination.',
    prompt:
      'Return the cheapest allowed fare, or -1 if no route fits the stop limit. A route with at most k intermediate stops uses at most k + 1 hops.',
  },
  objective:
    'Compute a shortest path under an edge-count limit with layered Bellman-Ford relaxation.',
  priorKnowledge: [
    'A route with k intermediate stops contains at most k + 1 directed edges.',
    'Bellman-Ford can relax every edge once per allowed edge count.',
    'A copied distance layer prevents one round from using multiple new edges.',
  ],
  recognitionCue:
    'A weighted route must be cheapest while also obeying a maximum number of hops or stops.',
  misconception:
    'Updating one distance array in place can chain several flights during one round and silently exceed the hop limit.',
  keyRule:
    'For each of k + 1 rounds, relax every flight from the previous layer into a copied next layer, never from values improved in the same round.',
  algorithmSteps: [
    { id: 'handle-same-depot', instruction: 'Return zero when source and destination are identical.' },
    { id: 'open-distance-layer', instruction: 'Set source cost to zero and every other depot cost to infinity.' },
    { id: 'repeat-hop-rounds', instruction: 'Run exactly maxStops + 1 relaxation rounds.' },
    { id: 'copy-previous-costs', instruction: 'Begin each round with a copy of the previous distance layer.' },
    { id: 'scan-flights', instruction: 'Inspect every directed [origin, destination, fare] flight.' },
    { id: 'relax-from-previous', instruction: 'Use only the previous layer’s origin cost to improve the copied destination.' },
    { id: 'publish-next-layer', instruction: 'Replace the current distance layer after the whole flight scan.' },
    { id: 'return-fare-or-minus', instruction: 'Return the destination cost, or -1 if it remains infinite.' },
  ],
  complexity: {
    time: 'O((k + 1) · e)',
    space: 'O(v)',
    explanation:
      'Each allowed-hop round scans all e flights, while previous and next distance maps store one cost per depot.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 100 },
        { id: 'bd', from: 'b', to: 'd', weight: 100 },
        { id: 'ac', from: 'a', to: 'c', weight: 50 },
        { id: 'cd', from: 'c', to: 'd', weight: 300 },
        { id: 'bc', from: 'b', to: 'c', weight: 20 },
      ],
      highlightedEdgeIds: ['ab', 'bd'],
    },
  },
  workedExample: {
    prompt:
      'With one intermediate stop, at most two hops are allowed. A→B→D costs 200, beating A→C→D at 350; the tempting three-hop chain is not allowed.',
    code: [
      'round 1: costs B=100, C=50',
      'publish the one-hop layer',
      'round 2 from that snapshot: D=min(100+100, 50+300)=200',
      'B→C may improve C, but that new C cannot feed D in round 2',
      'two rounds complete -> return 200',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The first round represents routes using at most one hop.',
      'The second round represents routes using at most two hops.',
      'Snapshot isolation blocks a third edge from sneaking into the second round.',
      'The destination’s cheapest allowed fare is 200.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A / 0 hops' },
        { id: 'b', label: 'B / 1 hop' },
        { id: 'd', label: 'D / 2 hops' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 100 },
        { id: 'bd', from: 'b', to: 'd', weight: 100 },
      ],
      highlightedEdgeIds: ['ab', 'bd'],
    },
  },
  patternCheck: {
    prompt:
      'During one relaxation round, which origin cost may a flight use?',
    options: [
      { id: 'previous-layer-only', label: 'Only the origin cost from the previous completed layer.' },
      { id: 'new-same-round', label: 'Any cheaper cost written earlier in the same round.' },
      { id: 'direct-only', label: 'Only the original direct fare from the source.' },
      { id: 'largest-cost', label: 'The largest cost found for the origin.' },
    ],
    correctOptionId: 'previous-layer-only',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'prev', label: 'previous layer' },
        { id: 'next', label: 'next layer' },
      ],
      edges: [{ id: 'relax', from: 'prev', to: 'next', label: 'one more hop' }],
      highlightedEdgeIds: ['relax'],
    },
  },
  retrievalCheck: {
    prompt:
      'If at most k intermediate stops are allowed, how many edge-relaxation rounds are needed?',
    acceptedAnswers: [
      'k + 1',
      'k plus one',
      'one round per allowed hop, so k + 1',
      'k+1',
      'k plus 1',
      'maxstops + 1',
      'maxstops+1',
    ],
    placeholder: 'Type the number of rounds',
    diagram: {
      kind: 'array',
      values: ['source', 'stop 1', 'destination'],
      highlight: 2,
      pointers: [{ index: 2, label: '2 edges for k=1' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the fare search: same-depot check, initialize, repeat k+1, copy layer, scan flights, relax from previous, publish, return.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'u', label: 'origin' },
        { id: 'v', label: 'destination' },
      ],
      edges: [{ id: 'uv', from: 'u', to: 'v', weight: 25 }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read depot labels, directed [from, to, fare] data["flights"], data["source"], data["destination"], and data["maxStops"]. Return the cheapest allowed fare or -1.',
    starterCode: `def solve(data):
    depots = data["depots"]
    source = data["source"]
    destination = data["destination"]
    if source == destination:
        return 0

    costs = {depot: float("inf") for depot in depots}
    costs[source] = 0

    for _ in range(data["maxStops"] + 1):
        next_costs = costs.copy()
        # Relax every flight from costs into next_costs.
        pass
        costs = next_costs

    return -1 if costs[destination] == float("inf") else costs[destination]`,
    cases: {
      visibleExample: {
        input: {
          depots: ['A', 'B', 'C', 'D'],
          source: 'A',
          destination: 'D',
          maxStops: 1,
          flights: [
            ['A', 'B', 100],
            ['B', 'D', 100],
            ['A', 'C', 50],
            ['C', 'D', 300],
            ['B', 'C', 20],
          ],
        },
        expected: 200,
      },
      hiddenBoundary: {
        input: {
          depots: ['Q'],
          source: 'Q',
          destination: 'Q',
          maxStops: 0,
          flights: [],
        },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          depots: ['A', 'B', 'C', 'D'],
          source: 'A',
          destination: 'D',
          maxStops: 1,
          flights: [
            ['A', 'B', 10],
            ['B', 'C', 10],
            ['C', 'D', 10],
            ['A', 'D', 80],
          ],
        },
        expected: 80,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 10 },
        { id: 'bc', from: 'b', to: 'c', weight: 10 },
        { id: 'cd', from: 'c', to: 'd', weight: 10 },
        { id: 'ad', from: 'a', to: 'd', weight: 80 },
      ],
      highlightedEdgeIds: ['ad'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  cheapestFlightsWithinKStopsMissionSeed,
)

export default problemLesson
