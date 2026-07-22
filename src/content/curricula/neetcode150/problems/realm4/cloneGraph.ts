import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const cloneGraphMissionSeed = createRealm4MissionSeed({
  slug: 'clone-graph',
  estimatedMinutes: 23,
  mission: {
    title: 'The Transit Map Backup',
    context:
      'A town stores a transit map as station names with neighbor lists. An archivist must build a fresh backup of every station reachable from one starting station, including loops, while leaving unrelated stations out.',
    prompt:
      'Return a new adjacency object for the reachable component. Copy each station’s full neighbor list into its fresh record.',
  },
  objective:
    'Copy a cyclic graph by memoizing each discovered node before recursively copying its neighbors.',
  priorKnowledge: [
    'An adjacency list records neighbors for each graph node.',
    'Undirected graphs can contain cycles.',
    'A dictionary can map an original node identity to its fresh copy.',
  ],
  recognitionCue:
    'A connected graph structure must be duplicated without sharing original nodes or looping forever on cycles.',
  misconception:
    'Creating the copy only after finishing all neighbors causes infinite recursion when an edge points back.',
  keyRule:
    'Create and memoize a station’s empty clone before traversing its neighbors, then fill the clone’s neighbor list.',
  algorithmSteps: [
    { id: 'handle-no-start', instruction: 'Return an empty object when no start station is supplied.' },
    { id: 'open-clone-map', instruction: 'Create a map from original station names to fresh neighbor lists.' },
    { id: 'reuse-known-copy', instruction: 'Return immediately when a station already has a clone entry.' },
    { id: 'memoize-empty-copy', instruction: 'Create an empty list for a new station before visiting neighbors.' },
    { id: 'copy-neighbors', instruction: 'Visit each original neighbor in order and append its name to the fresh list.' },
    { id: 'visit-from-start', instruction: 'Launch the traversal from the requested station only.' },
    { id: 'return-component', instruction: 'Return the fresh adjacency object for discovered stations.' },
  ],
  complexity: {
    time: 'O(v + e)',
    space: 'O(v)',
    explanation:
      'Each reachable station is cloned once and each adjacency entry is copied once; the clone map and traversal hold reachable nodes.',
  },
  explanationVisuals: {
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
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ac', from: 'a', to: 'c' },
        { id: 'bd', from: 'b', to: 'd' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
      highlightedNodeIds: ['a'],
    },
  },
  workedExample: {
    prompt:
      'Starting at A, create A’s empty backup before visiting B and C. When B points back to A, the memoized A copy safely ends that recursive branch.',
    code: [
      'copy A: memo[A] = []',
      'visit B: memo[B] = []',
      'B sees A -> reuse memo[A]',
      'continue to D, then C; reuse any known copy',
      'return adjacency for A, B, C, and D',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'A exists in the clone map before any cycle can return to it.',
      'Every later encounter with A reuses the same fresh record.',
      'D can be reached through B and C but is still created only once.',
      'Disconnected station X is never visited from A and stays out of the backup.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'A copy' },
        { id: 'b', label: 'B copy' },
        { id: 'd', label: 'D pending' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bd', from: 'b', to: 'd' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  patternCheck: {
    prompt:
      'A neighbor edge points back to a station currently being copied. Which action prevents endless recursion?',
    options: [
      { id: 'memoize-before-neighbors', label: 'Memoize the empty station copy before visiting any neighbor.' },
      { id: 'copy-after-neighbors', label: 'Wait to create the station copy until all neighbors finish.' },
      { id: 'drop-back-edge', label: 'Delete every edge that points to an earlier station.' },
      { id: 'copy-every-visit', label: 'Create a different station copy on every visit.' },
    ],
    correctOptionId: 'memoize-before-neighbors',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'A memoized' },
        { id: 'b', label: 'B active' },
      ],
      edges: [{ id: 'ab', from: 'a', to: 'b' }],
      highlightedNodeIds: ['a'],
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the cycle-safe rule: create and memoize a node copy ______.',
    acceptedAnswers: [
      'before visiting its neighbors',
      'before recursing on neighbors',
      'as soon as the node is first discovered',
      'before visiting neighbors',
      'before visiting any neighbor',
      'before exploring its neighbors',
      'before traversing its neighbors',
      'when the node is first discovered',
    ],
    placeholder: 'Type when memoization happens',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'p', label: 'parent' },
        { id: 'q', label: 'neighbor' },
      ],
      edges: [{ id: 'back', from: 'q', to: 'p', label: 'cycle' }],
      highlightedNodeIds: ['p'],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the backup traversal: handle no start, open memo, reuse known, create empty copy, visit neighbors, launch at start, return.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 's', label: 'start' },
        { id: 'n', label: 'neighbor' },
      ],
      edges: [{ id: 'sn', from: 's', to: 'n' }],
      highlightedNodeIds: ['s'],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["start"] and data["adjacency"]. Return a fresh adjacency object containing only stations reachable from start. Neighbor order does not matter.',
    starterCode: `def solve(data):
    start = data["start"]
    adjacency = data["adjacency"]
    copied = {}

    def clone(station):
        # Reuse known copies; memoize before visiting neighbors.
        pass

    if start is None:
        return {}
    clone(start)
    return copied`,
    cases: {
      visibleExample: {
        input: {
          start: 'A',
          adjacency: {
            A: ['B', 'C'],
            B: ['A', 'D'],
            C: ['A', 'D'],
            D: ['B', 'C'],
            X: [],
          },
        },
        expected: {
          A: ['B', 'C'],
          B: ['A', 'D'],
          D: ['B', 'C'],
          C: ['A', 'D'],
        },
      },
      hiddenBoundary: {
        input: { start: null, adjacency: {} },
        expected: {},
      },
      hiddenAdversarial: {
        input: {
          start: 'P',
          adjacency: { P: ['P', 'Q'], Q: ['P'], Z: ['Z'] },
        },
        expected: { P: ['P', 'Q'], Q: ['P'] },
      },
    },
    comparator: { kind: 'unordered' },
    verificationNotes: [
      'The browser verifies reachable labels and edges after serialization.',
      'Object identity does not cross the JSON boundary, so the judge cannot prove the clone is disjoint from the input graph; creating fresh records remains required.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'p', label: 'P' },
        { id: 'q', label: 'Q' },
      ],
      edges: [
        { id: 'self', from: 'p', to: 'p', label: 'self-loop' },
        { id: 'pq', from: 'p', to: 'q' },
      ],
      highlightedNodeIds: ['p'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(cloneGraphMissionSeed)

export default problemLesson
