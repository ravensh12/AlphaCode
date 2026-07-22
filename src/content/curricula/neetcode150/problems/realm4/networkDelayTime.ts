import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const networkDelayTimeMissionSeed = createRealm4MissionSeed({
  slug: 'network-delay-time',
  estimatedMinutes: 25,
  mission: {
    title: 'The Beacon Broadcast Timer',
    context:
      'A science camp sends a beacon through one-way radio relays. Each directed link has a positive travel time, and a relay forwards the signal as soon as its earliest copy arrives.',
    prompt:
      'Return the time when every named relay has received the beacon, or -1 if any relay is unreachable from the starting relay.',
  },
  objective:
    'Compute positive-weight shortest paths with Dijkstra’s min-heap, then take the largest finalized distance.',
  priorKnowledge: [
    'An adjacency list can store directed neighbors and edge weights.',
    'A min-heap chooses the smallest tentative distance.',
    'The first non-stale heap removal finalizes a Dijkstra distance.',
  ],
  recognitionCue:
    'A weighted directed graph asks for earliest arrival from one source, and all weights are nonnegative.',
  misconception:
    'Plain BFS minimizes edge count, not total travel time when links have different weights.',
  keyRule:
    'Pop the smallest tentative time, skip stale entries, and relax an edge only when current time + weight improves its destination.',
  algorithmSteps: [
    { id: 'build-weighted-graph', instruction: 'Build directed weighted adjacency lists for every relay.' },
    { id: 'seed-source-time', instruction: 'Set the start distance to zero and push it into a min-heap.' },
    { id: 'pop-smallest-time', instruction: 'Pop the relay with the smallest tentative arrival time.' },
    { id: 'skip-stale-entry', instruction: 'Skip a heap entry larger than the relay’s best recorded distance.' },
    { id: 'relax-outgoing-links', instruction: 'Test current distance plus each outgoing link weight.' },
    { id: 'push-improvements', instruction: 'Record and heap-push every strictly improved destination time.' },
    { id: 'check-all-reached', instruction: 'Return -1 if any named relay still has infinite distance.' },
    { id: 'return-latest-arrival', instruction: 'Otherwise return the maximum shortest distance.' },
  ],
  complexity: {
    time: 'O((v + e) log v)',
    space: 'O(v + e)',
    explanation:
      'Adjacency stores all links, while heap operations for distance improvements add a logarithmic factor and distances store each relay.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A / 0' },
        { id: 'b', label: 'B / 2' },
        { id: 'c', label: 'C / 3' },
        { id: 'd', label: 'D / 5' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 2 },
        { id: 'ac', from: 'a', to: 'c', weight: 5 },
        { id: 'bc', from: 'b', to: 'c', weight: 1 },
        { id: 'cd', from: 'c', to: 'd', weight: 2 },
        { id: 'bd', from: 'b', to: 'd', weight: 7 },
      ],
      highlightedEdgeIds: ['ab', 'bc', 'cd'],
    },
  },
  workedExample: {
    prompt:
      'A reaches B at time 2. B improves C from 5 to 3, and C reaches D at time 5. The last relay therefore receives the beacon at time 5.',
    code: [
      'heap starts [(0, A)]',
      'pop A -> record B=2 and C=5',
      'pop B=2 -> improve C=3 and propose D=9',
      'pop C=3 -> improve D=5; later stale entries are skipped',
      'max distances [0,2,3,5] -> return 5',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The two-link route A→B→C costs 3, beating direct A→C cost 5.',
      'The heap exposes that improvement before the stale C=5 entry.',
      'D’s best route continues from C for total time 5.',
      'All relays are reachable, and the maximum earliest arrival is 5.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A 0' },
        { id: 'b', label: 'B 2' },
        { id: 'c', label: 'C 3' },
        { id: 'd', label: 'D 5' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 2 },
        { id: 'bc', from: 'b', to: 'c', weight: 1 },
        { id: 'cd', from: 'c', to: 'd', weight: 2 },
      ],
      highlightedNodeIds: ['d'],
    },
  },
  patternCheck: {
    prompt:
      'A heap entry says C arrives at time 5, but the distance map now says 3. What should Dijkstra do?',
    options: [
      { id: 'skip-stale', label: 'Skip the stale time-5 entry.' },
      { id: 'overwrite-better', label: 'Replace the distance map with 5.' },
      { id: 'run-bfs', label: 'Discard all weights and restart with BFS.' },
      { id: 'finalize-twice', label: 'Expand C again from the worse time.' },
    ],
    correctOptionId: 'skip-stale',
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: ['C:3', 'C:5', 'D:9'],
      highlight: 0,
      pointers: [{ index: 1, label: 'stale later' }],
    },
  },
  retrievalCheck: {
    prompt:
      'What value should be returned after all shortest distances are known and every relay is reachable?',
    acceptedAnswers: [
      'the maximum shortest distance',
      'the largest finalized arrival time',
      'max(distances)',
      'the maximum distance',
      'the largest shortest distance',
      'the max of all distances',
      'the latest arrival time',
      'the maximum arrival time',
      'max(distance.values())',
    ],
    placeholder: 'Type the final aggregation',
    diagram: {
      kind: 'array',
      values: [0, 2, 3, 5],
      highlight: 3,
      pointers: [{ index: 3, label: 'latest' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the broadcast timer: build graph, seed source, pop minimum, skip stale, relax links, push improvements, reachability check, maximum.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 's', label: 'source' },
        { id: 'v', label: 'relay' },
      ],
      edges: [{ id: 'sv', from: 's', to: 'v', weight: 4 }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read relay labels from data["relays"], start label data["start"], and directed [from, to, time] entries from data["links"]. Return the latest earliest arrival or -1.',
    starterCode: `def solve(data):
    import heapq

    relays = data["relays"]
    graph = {relay: [] for relay in relays}
    for origin, destination, travel_time in data["links"]:
        graph[origin].append((destination, travel_time))

    distance = {relay: float("inf") for relay in relays}
    distance[data["start"]] = 0
    heap = [(0, data["start"])]

    # Pop non-stale entries and relax outgoing links.
    return -1`,
    cases: {
      visibleExample: {
        input: {
          relays: ['A', 'B', 'C', 'D'],
          start: 'A',
          links: [
            ['A', 'B', 2],
            ['A', 'C', 5],
            ['B', 'C', 1],
            ['C', 'D', 2],
            ['B', 'D', 7],
          ],
        },
        expected: 5,
      },
      hiddenBoundary: {
        input: { relays: ['Z'], start: 'Z', links: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          relays: ['A', 'B', 'C'],
          start: 'A',
          links: [
            ['A', 'B', 2],
            ['C', 'A', 1],
          ],
        },
        expected: -1,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C unreachable' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', weight: 2 },
        { id: 'ca', from: 'c', to: 'a', weight: 1 },
      ],
      highlightedNodeIds: ['c'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(networkDelayTimeMissionSeed)

export default problemLesson
