import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const wordLadderMissionSeed = createRealm4MissionSeed({
  slug: 'word-ladder',
  estimatedMinutes: 26,
  mission: {
    title: 'The One-Letter Lock Route',
    context:
      'A puzzle lock displays a word. One move changes exactly one letter, and every word after the starting word must appear on an approved card.',
    prompt:
      'Return the number of words in the shortest route from the start word to the goal word, including both ends. Return 0 when no route exists.',
  },
  objective:
    'Run BFS on an implicit word graph using wildcard-pattern buckets to find neighbors efficiently.',
  priorKnowledge: [
    'BFS finds the fewest edges in an unweighted graph.',
    'Words sharing a one-wildcard pattern differ in at most one position.',
    'A visited set prevents cycling between words.',
  ],
  recognitionCue:
    'States transform by one legal edit, all moves cost the same, and the shortest number of transformations is requested.',
  misconception:
    'Depth-first search may find a valid chain first but not the shortest chain.',
  keyRule:
    'Group words by each one-wildcard pattern, then BFS by route length and visit each word only once.',
  algorithmSteps: [
    { id: 'handle-same-word', instruction: 'Return one when the start already equals the goal.' },
    { id: 'check-goal-card', instruction: 'Return zero when the distinct goal is absent from the approved cards.' },
    { id: 'build-pattern-buckets', instruction: 'Map every one-wildcard pattern to approved words that match it.' },
    { id: 'seed-word-queue', instruction: 'Enqueue the start word with route length one and mark it visited.' },
    { id: 'expand-word', instruction: 'Generate each wildcard pattern for the dequeued word.' },
    { id: 'enqueue-new-neighbors', instruction: 'Enqueue unvisited words in those buckets with length plus one.' },
    { id: 'return-on-goal', instruction: 'Return immediately when the goal word is dequeued or discovered.' },
    { id: 'return-no-route', instruction: 'Return zero if the queue empties.' },
  ],
  complexity: {
    time: 'O(w · l²)',
    space: 'O(w · l²)',
    explanation:
      'For w words of length l, constructing l sliced wildcard strings can cost l each; buckets, visited state, and queue store the word graph index.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'cold', label: 'cold' },
        { id: 'cord', label: 'cord' },
        { id: 'card', label: 'card' },
        { id: 'ward', label: 'ward' },
        { id: 'warm', label: 'warm' },
        { id: 'bold', label: 'bold' },
      ],
      edges: [
        { id: 'e1', from: 'cold', to: 'cord', label: 'co*d' },
        { id: 'e2', from: 'cold', to: 'bold', label: '*old' },
        { id: 'e3', from: 'cord', to: 'card', label: 'c*rd' },
        { id: 'e4', from: 'card', to: 'ward', label: '*ard' },
        { id: 'e5', from: 'ward', to: 'warm', label: 'war*' },
      ],
      highlightedNodeIds: ['cold', 'cord', 'card', 'ward', 'warm'],
    },
  },
  workedExample: {
    prompt:
      'From cold, BFS sees cord and bold at route length 2. Only cord continues through card and ward to warm, producing a five-word shortest route.',
    code: [
      'queue starts [(cold, 1)]',
      'cold patterns reach cord and bold -> length 2',
      'cord reaches card -> length 3',
      'card reaches ward -> length 4',
      'ward reaches warm -> return 5',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Wildcard bucket co*d links cold with cord.',
      'BFS finishes all shorter route lengths before longer ones.',
      'The bold branch does not reach the goal but cannot delay the shortest answer.',
      'The first arrival at warm therefore uses the minimum number of one-letter moves.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'cold / 1' },
        { id: 'b', label: 'cord / 2' },
        { id: 'c', label: 'card / 3' },
        { id: 'd', label: 'ward / 4' },
        { id: 'e', label: 'warm / 5' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bc', from: 'b', to: 'c' },
        { id: 'cd', from: 'c', to: 'd' },
        { id: 'de', from: 'd', to: 'e' },
      ],
      highlightedNodeIds: ['e'],
    },
  },
  patternCheck: {
    prompt:
      'Why is BFS the correct outer search for this lock route?',
    options: [
      { id: 'equal-cost-layers', label: 'Every one-letter move costs one, so BFS explores route lengths in increasing order.' },
      { id: 'alphabetical', label: 'BFS always visits words alphabetically.' },
      { id: 'deepest-first', label: 'BFS explores the deepest possible chain before alternatives.' },
      { id: 'weighted-edges', label: 'BFS handles different move costs without changes.' },
    ],
    correctOptionId: 'equal-cost-layers',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 's', label: 'start / 1' },
        { id: 'a', label: 'layer 2' },
        { id: 'b', label: 'layer 2' },
      ],
      edges: [
        { id: 'sa', from: 's', to: 'a' },
        { id: 'sb', from: 's', to: 'b' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  retrievalCheck: {
    prompt:
      'What wildcard pattern shows that cold and cord are one-letter neighbors?',
    acceptedAnswers: ['co*d', 'co star d', 'the pattern co*d'],
    placeholder: 'Type the shared pattern',
    diagram: {
      kind: 'hashmap',
      entries: [{ key: 'co*d', value: 'cold, cord' }],
      lookup: 'co*d',
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the lock search: same check, goal check, build buckets, seed BFS, expand patterns, enqueue unvisited words, goal return, zero fallback.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'x', label: 'cold' },
        { id: 'y', label: 'cord' },
      ],
      edges: [{ id: 'xy', from: 'x', to: 'y', label: 'one letter' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read equal-length data["start"], data["goal"], and approved data["cards"]. Return the shortest route’s word count, or 0.',
    starterCode: `def solve(data):
    start = data["start"]
    goal = data["goal"]
    cards = data["cards"]
    if start == goal:
        return 1

    buckets = {}
    # Index approved words by every one-wildcard pattern.

    queue = [(start, 1)]
    visited = {start}
    # Run BFS through bucket neighbors.
    return 0`,
    cases: {
      visibleExample: {
        input: {
          start: 'cold',
          goal: 'warm',
          cards: ['cord', 'card', 'ward', 'warm', 'bold'],
        },
        expected: 5,
      },
      hiddenBoundary: {
        input: { start: 'same', goal: 'same', cards: [] },
        expected: 1,
      },
      hiddenAdversarial: {
        input: {
          start: 'mist',
          goal: 'gold',
          cards: ['most', 'moss', 'loss', 'gold'],
        },
        expected: 0,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'cold', label: 'cold' },
        { id: 'cord', label: 'cord' },
        { id: 'card', label: 'card' },
        { id: 'ward', label: 'ward' },
        { id: 'warm', label: 'warm' },
      ],
      edges: [
        { id: 'e1', from: 'cold', to: 'cord' },
        { id: 'e2', from: 'cord', to: 'card' },
        { id: 'e3', from: 'card', to: 'ward' },
        { id: 'e4', from: 'ward', to: 'warm' },
      ],
      highlightedNodeIds: ['warm'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(wordLadderMissionSeed)

export default problemLesson
