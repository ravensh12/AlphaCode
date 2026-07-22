import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const reconstructItineraryMissionSeed = createRealm4MissionSeed({
  slug: 'reconstruct-itinerary',
  estimatedMinutes: 27,
  mission: {
    title: 'The Courier Ticket Chain',
    context:
      'A robot courier has directed travel tickets, and each physical ticket must be used exactly once. Its route begins at a named hub. If several full routes work, dispatch chooses the alphabetically smallest stop sequence.',
    prompt:
      'Return the complete stop list, including the starting hub. Duplicate tickets are separate usable edges.',
  },
  objective:
    'Construct the lexicographically smallest Eulerian trail with ordered adjacency and postorder route building.',
  priorKnowledge: [
    'An Eulerian trail uses every edge exactly once.',
    'A min-heap can choose the smallest available destination.',
    'Postorder appending records a node after all of its outgoing edges are consumed.',
  ],
  recognitionCue:
    'Every directed edge must be used exactly once, edges may repeat, and a lexical tie rule chooses among valid trails.',
  misconception:
    'Plain greedy forward walking can take a tempting small edge that strands unused tickets later.',
  keyRule:
    'Consume the smallest outgoing edge recursively, append a stop only when it has no edges left, then reverse the postorder list.',
  algorithmSteps: [
    { id: 'build-ticket-heaps', instruction: 'Build a min-heap of destinations for each origin, keeping duplicate tickets.' },
    { id: 'start-at-hub', instruction: 'Begin a recursive walk at the supplied hub.' },
    { id: 'consume-smallest-edge', instruction: 'While the current stop has tickets, pop its smallest destination.' },
    { id: 'walk-destination', instruction: 'Recursively consume tickets from that destination.' },
    { id: 'append-on-dead-end', instruction: 'Append the current stop after all of its outgoing tickets are used.' },
    { id: 'reverse-postorder', instruction: 'Reverse the accumulated stop list.' },
    { id: 'return-route', instruction: 'Return the reversed list containing one more stop than tickets.' },
  ],
  complexity: {
    time: 'O(e log e)',
    space: 'O(e)',
    explanation:
      'Each ticket is inserted and removed from a destination heap once; heaps, recursion, and the final route store O(e) entries.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'hub', label: 'HUB' },
        { id: 'arc', label: 'ARC' },
        { id: 'mir', label: 'MIR' },
      ],
      edges: [
        { id: 'h-a', from: 'hub', to: 'arc', label: 'smallest' },
        { id: 'a-h', from: 'arc', to: 'hub' },
        { id: 'h-m', from: 'hub', to: 'mir' },
        { id: 'm-a', from: 'mir', to: 'arc' },
      ],
      highlightedEdgeIds: ['h-a'],
    },
  },
  workedExample: {
    prompt:
      'HUB first consumes its ARC ticket, ARC returns to HUB, and the remaining tickets lead through MIR to ARC. Dead ends append in reverse route order.',
    code: [
      'walk HUB -> pop ARC',
      'walk ARC -> pop HUB',
      'walk HUB -> pop MIR; walk MIR -> pop ARC',
      'append dead ends: ARC, MIR, HUB, ARC, HUB',
      'reverse -> HUB, ARC, HUB, MIR, ARC',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The heap chooses ARC before MIR at the first HUB decision.',
      'Returning to HUB through an edge allows its second ticket to be consumed.',
      'Appending only after outgoing edges finish protects against stranded tickets.',
      'Reversal turns the dead-end order into the actual route.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'h1', label: 'HUB' },
        { id: 'a', label: 'ARC' },
        { id: 'm', label: 'MIR' },
      ],
      edges: [
        { id: 'e1', from: 'h1', to: 'a' },
        { id: 'e2', from: 'a', to: 'h1' },
        { id: 'e3', from: 'h1', to: 'm' },
        { id: 'e4', from: 'm', to: 'a' },
      ],
      highlightedNodeIds: ['a'],
    },
  },
  patternCheck: {
    prompt:
      'Why are stops appended after their outgoing ticket heap becomes empty instead of when first visited?',
    options: [
      { id: 'postorder-splice', label: 'Postorder lets completed dead-end trails splice into one route that uses every edge.' },
      { id: 'count-nodes', label: 'It prevents the same stop name from appearing twice.' },
      { id: 'drop-duplicates', label: 'It removes duplicate physical tickets.' },
      { id: 'avoid-reverse', label: 'It produces the final route without reversing.' },
    ],
    correctOptionId: 'postorder-splice',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'hub', label: 'HUB waiting', state: 'returned' },
        { id: 'arc', label: 'ARC dead end -> append', result: 'ARC', state: 'active' },
      ],
      activeFrameId: 'arc',
    },
  },
  retrievalCheck: {
    prompt:
      'After postorder walking consumes every ticket, what operation turns appended stops into the travel route?',
    acceptedAnswers: [
      'reverse the list',
      'reverse postorder',
      'reverse the appended stops',
      'reverse',
      'reverse it',
      'reverse the route',
      'reverse the postorder list',
      'reversal',
    ],
    placeholder: 'Type the final operation',
    diagram: {
      kind: 'array',
      values: ['ARC', 'MIR', 'HUB', 'ARC', 'HUB'],
      highlight: 4,
      pointers: [{ index: 4, label: 'reverse from here' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore dispatch: build heaps, start hub, pop smallest edge, recurse, append at dead end, reverse, return.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'h', label: 'hub' },
        { id: 'd', label: 'destination' },
      ],
      edges: [{ id: 'ticket', from: 'h', to: 'd', label: 'ticket' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["start"] and directed data["tickets"] pairs. Inputs guarantee a full route. Return the alphabetically smallest route using every ticket once.',
    starterCode: `def solve(data):
    import heapq

    graph = {}
    for origin, destination in data["tickets"]:
        graph.setdefault(origin, [])
        heapq.heappush(graph[origin], destination)

    reversed_route = []
    def walk(stop):
        # Consume every outgoing heap edge, then append this stop.
        pass

    walk(data["start"])
    return list(reversed(reversed_route))`,
    cases: {
      visibleExample: {
        input: {
          start: 'HUB',
          tickets: [
            ['HUB', 'MIR'],
            ['HUB', 'ARC'],
            ['ARC', 'HUB'],
            ['MIR', 'ARC'],
          ],
        },
        expected: ['HUB', 'ARC', 'HUB', 'MIR', 'ARC'],
      },
      hiddenBoundary: {
        input: { start: 'HUB', tickets: [] },
        expected: ['HUB'],
      },
      hiddenAdversarial: {
        input: {
          start: 'HUB',
          tickets: [
            ['HUB', 'A'],
            ['HUB', 'A'],
            ['A', 'HUB'],
          ],
        },
        expected: ['HUB', 'A', 'HUB', 'A'],
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'h', label: 'HUB' },
        { id: 'a', label: 'A' },
      ],
      edges: [
        { id: 'ha1', from: 'h', to: 'a', label: 'ticket 1' },
        { id: 'ha2', from: 'h', to: 'a', label: 'ticket 2' },
        { id: 'ah', from: 'a', to: 'h' },
      ],
      highlightedEdgeIds: ['ha1', 'ha2'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  reconstructItineraryMissionSeed,
)

export default problemLesson
