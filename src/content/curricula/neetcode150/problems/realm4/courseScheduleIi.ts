import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const courseScheduleIiMissionSeed = createRealm4MissionSeed({
  slug: 'course-schedule-ii',
  estimatedMinutes: 24,
  mission: {
    title: 'The Maker-Fair Station Route',
    context:
      'A maker fair numbers its activity stations. Some stations require a visitor to finish another station first, and guides need one complete legal route.',
    prompt:
      'Return any station order that respects every requirement. Return [] if no complete route exists.',
  },
  objective:
    'Build a topological order with indegrees and a collection of currently available nodes.',
  priorKnowledge: [
    'A node’s indegree counts unfinished incoming requirements.',
    'An indegree-zero node is currently safe to schedule.',
    'Any indegree-zero node may safely appear next.',
  ],
  recognitionCue:
    'Directed prerequisites require one complete order that places every requirement first.',
  misconception:
    'Choosing a node whose indegree is still positive can place it before an unfinished requirement.',
  keyRule:
    'Make a station available only when its indegree becomes zero; a full order exists only if the output length equals the station count.',
  algorithmSteps: [
    { id: 'build-graph-indegree', instruction: 'Build required-to-next edges and count each station’s indegree.' },
    { id: 'seed-zero-heap', instruction: 'Add every indegree-zero station to the available collection.' },
    { id: 'pop-smallest', instruction: 'Remove any available station and append it to the route.' },
    { id: 'release-neighbors', instruction: 'Decrease the indegree of each station it unlocks.' },
    { id: 'push-new-zero', instruction: 'Push a neighbor exactly when its indegree becomes zero.' },
    { id: 'repeat-until-empty', instruction: 'Continue until the availability heap is empty.' },
    { id: 'check-route-length', instruction: 'Return the route if it includes every station; otherwise return an empty list.' },
  ],
  complexity: {
    time: 'O((v + e) log v)',
    space: 'O(v + e)',
    explanation:
      'Every node enters the heap once and every edge lowers one indegree; graph, indegrees, heap, and output use linear storage.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 's0', label: '0' },
        { id: 's1', label: '1' },
        { id: 's2', label: '2' },
        { id: 's3', label: '3' },
        { id: 's4', label: '4' },
        { id: 's5', label: '5' },
      ],
      edges: [
        { id: 'e02', from: 's0', to: 's2' },
        { id: 'e12', from: 's1', to: 's2' },
        { id: 'e13', from: 's1', to: 's3' },
        { id: 'e24', from: 's2', to: 's4' },
        { id: 'e34', from: 's3', to: 's4' },
        { id: 'e45', from: 's4', to: 's5' },
      ],
      highlightedNodeIds: ['s0', 's1'],
    },
  },
  workedExample: {
    prompt:
      'Stations 0 and 1 begin available. The min-heap chooses 0, then 1; those releases make 2 and 3 available, and the same tie rule chooses 2 first.',
    code: [
      'heap starts [0, 1]',
      'pop 0, then pop 1 -> route [0, 1]',
      'indegrees of 2 and 3 reach zero -> heap [2, 3]',
      'pop 2, 3, then released 4, then 5',
      'six stations scheduled -> return [0,1,2,3,4,5]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'A station enters the heap only after all incoming requirements are removed.',
      'The heap provides the requested smallest-number tie break.',
      'Station 4 waits for both 2 and 3.',
      'The output length reaches six, proving no cycle blocked the route.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: '2 available' },
        { id: 'b', label: '3 available' },
        { id: 'c', label: '4 waiting for both' },
      ],
      edges: [
        { id: 'ac', from: 'a', to: 'c' },
        { id: 'bc', from: 'b', to: 'c' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  patternCheck: {
    prompt:
      'Two stations have indegree zero at the same moment. Which choice keeps the route valid?',
    options: [
      { id: 'min-heap', label: 'Choose either available station; both have all requirements finished.' },
      { id: 'stack', label: 'Choose a station before its indegree reaches zero.' },
      { id: 'all-nodes', label: 'A list containing nodes with positive indegree too.' },
      { id: 'random-choice', label: 'Ignore indegrees and choose from every station.' },
    ],
    correctOptionId: 'min-heap',
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [2, 3, 7],
      highlight: 0,
      pointers: [{ index: 0, label: 'next' }],
    },
  },
  retrievalCheck: {
    prompt:
      'What final check distinguishes a complete topological route from a graph blocked by a cycle?',
    acceptedAnswers: [
      'the route length equals the station count',
      'len(order) == count',
      'every station appears in the output',
      'the output length equals the station count',
      'len(route) == count',
      'route length equals station count',
      'the route includes every station',
      'the order length equals the number of stations',
    ],
    placeholder: 'Type the completeness check',
    diagram: {
      kind: 'array',
      values: [0, 1, 2, 3, 4, 5],
      highlight: 5,
      visited: [0, 1, 2, 3, 4],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the route builder: graph and indegrees, seed zero heap, pop smallest, append, lower neighbors, push new zeros, length check.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'r', label: 'required' },
        { id: 'n', label: 'next' },
      ],
      edges: [{ id: 'rn', from: 'r', to: 'n' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["stationCount"] and [station, requiredStation] pairs in data["requirements"]. Return any valid complete order, or [].',
    starterCode: `def solve(data):
    import heapq

    count = data["stationCount"]
    graph = [[] for _ in range(count)]
    indegree = [0] * count
    # Build edges and indegrees.

    available = []
    # Seed all zero-indegree stations, then perform Kahn's algorithm.
    route = []
    return route if len(route) == count else []`,
    cases: {
      visibleExample: {
        input: {
          stationCount: 6,
          requirements: [
            [2, 0],
            [2, 1],
            [3, 1],
            [4, 2],
            [4, 3],
            [5, 4],
          ],
        },
        expected: [0, 1, 2, 3, 4, 5],
      },
      hiddenBoundary: {
        input: { stationCount: 0, requirements: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          stationCount: 3,
          requirements: [
            [1, 0],
            [2, 1],
            [0, 2],
          ],
        },
        expected: [],
      },
    },
    comparator: {
      kind: 'semantic',
      validator: 'courseScheduleOrder',
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 's0', label: '0' },
        { id: 's1', label: '1' },
        { id: 's2', label: '2' },
      ],
      edges: [
        { id: 'e01', from: 's0', to: 's1' },
        { id: 'e12', from: 's1', to: 's2' },
      ],
      highlightedNodeIds: ['s0'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(courseScheduleIiMissionSeed)

export default problemLesson
