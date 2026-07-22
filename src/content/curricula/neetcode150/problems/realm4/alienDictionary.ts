import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const alienDictionaryMissionSeed = createRealm4MissionSeed({
  slug: 'alien-dictionary',
  estimatedMinutes: 28,
  mission: {
    title: 'The Archivist’s Symbol Order',
    context:
      'An archivist finds labels sorted with an unknown alphabet. Two neighboring labels can reveal which symbol comes first.',
    prompt:
      'Return any symbol order that explains the sorted labels. Return an empty string when a bad prefix or cycle makes the list impossible.',
  },
  objective:
    'Build first-difference rules, reject bad prefixes, and topologically order the symbols.',
  priorKnowledge: [
    'In lexicographic order, the first differing character decides which word comes first.',
    'A longer word cannot appear before its exact shorter prefix.',
    'Topological sorting places each earlier symbol before the symbols that follow it.',
  ],
  recognitionCue:
    'Sorted words in an unknown alphabet turn neighboring first differences into directed rules.',
  misconception:
    'Using every difference invents rules. Only the first difference between two neighbors is guaranteed.',
  keyRule:
    'For each neighboring pair, reject a longer word before its own prefix. Otherwise add one edge at the first difference, then order all symbols.',
  algorithmSteps: [
    { id: 'collect-all-symbols', instruction: 'Create a graph and indegree entry for every symbol in every label.' },
    { id: 'compare-neighbors', instruction: 'Compare each neighboring pair of sorted labels.' },
    { id: 'reject-bad-prefix', instruction: 'Return empty if the earlier label is longer and starts with the later label.' },
    { id: 'find-first-difference', instruction: 'Find the first position where the neighboring labels differ.' },
    { id: 'add-one-edge', instruction: 'Add that earlier-symbol to later-symbol edge once and increase indegree once.' },
    { id: 'seed-zero-symbols', instruction: 'Push all indegree-zero symbols into a min-heap.' },
    { id: 'topological-pop', instruction: 'Pop the smallest symbol, append it, and release its outgoing neighbors.' },
    { id: 'check-symbol-count', instruction: 'Return the order if all symbols appear; otherwise return empty for a cycle.' },
  ],
  complexity: {
    time: 'O(c + e log a)',
    space: 'O(a + e)',
    explanation:
      'Scan c characters to build rules among a symbols. Then process each edge and each available-symbol heap update once.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
        { id: 'z', label: 'z' },
        { id: 'c', label: 'c' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', label: 'za < zb' },
        { id: 'zc', from: 'z', to: 'c', label: 'zb < ca' },
      ],
      highlightedNodeIds: ['a', 'z'],
    },
  },
  workedExample: {
    prompt:
      'Labels za, zb, ca, cb reveal a before b and z before c. Choosing available symbols in letter order produces a, b, z, c.',
    code: [
      'za vs zb -> first difference a < b',
      'zb vs ca -> first difference z < c',
      'ca vs cb repeats a < b; do not double-count it',
      'min-heap starts [a, z]; pop a, then newly free b',
      'pop b, z, c -> return "abzc"',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Only adjacent labels are needed to obtain guaranteed constraints.',
      'The duplicate a→b edge does not increase b’s indegree twice.',
      'After a releases b, the chosen tie rule selects b before z.',
      'All four symbols appear, so the ordering is valid.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'a / first' },
        { id: 'b', label: 'b / second' },
        { id: 'z', label: 'z / third' },
        { id: 'c', label: 'c / fourth' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'zc', from: 'z', to: 'c' },
      ],
      highlightedNodeIds: ['a', 'b'],
    },
  },
  patternCheck: {
    prompt:
      'Neighboring labels differ at several positions. Which difference creates a trustworthy alphabet edge?',
    options: [
      { id: 'first-difference', label: 'Only their first differing position.' },
      { id: 'every-difference', label: 'Every position where the two labels differ.' },
      { id: 'last-difference', label: 'Only their final differing position.' },
      { id: 'shorter-symbols', label: 'Every symbol in the shorter label before every symbol in the longer one.' },
    ],
    correctOptionId: 'first-difference',
    diagram: {
      kind: 'string',
      chars: 'za | zb',
      pointers: [
        { index: 1, label: 'a' },
        { index: 6, label: 'b' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'State the invalid-prefix rule that makes the scroll list impossible.',
    acceptedAnswers: [
      'an earlier longer word cannot start with the later shorter word',
      'a word cannot come before its own prefix',
      'reject when first startswith second and first is longer',
      'a longer word cannot appear before its prefix',
      'a longer word cannot come before its prefix',
      'a longer word cannot appear before its exact shorter prefix',
      'a word cannot appear before its own prefix',
    ],
    placeholder: 'Describe the bad prefix case',
    diagram: {
      kind: 'array',
      values: ['rain', 'ra'],
      highlight: 1,
      pointers: [{ index: 1, label: 'prefix after longer word' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the archivist: collect symbols, compare neighbors, reject prefix, find first difference, add unique edge, heap zeros, topo pop, count check.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'x', label: 'earlier symbol' },
        { id: 'y', label: 'later symbol' },
      ],
      edges: [{ id: 'xy', from: 'x', to: 'y' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read sorted data["scrolls"]. Return any valid ordering of all seen characters, or "" for an invalid prefix or cycle.',
    starterCode: `def solve(data):
    import heapq

    words = data["scrolls"]
    graph = {char: set() for word in words for char in word}
    indegree = {char: 0 for char in graph}

    # Compare adjacent words, validate prefixes, and add first-difference edges.
    available = []
    # Heap-sort the zero-indegree symbols and verify the final count.
    return ""`,
    cases: {
      visibleExample: {
        input: { scrolls: ['za', 'zb', 'ca', 'cb'] },
        expected: 'abzc',
      },
      hiddenBoundary: {
        input: { scrolls: ['m'] },
        expected: 'm',
      },
      hiddenAdversarial: {
        input: { scrolls: ['rain', 'ra'] },
        expected: '',
      },
      additional: [
        {
          id: 'hidden-cycle',
          input: { scrolls: ['za', 'zb', 'ca', 'cb', 'za'] },
          expected: '',
          visibility: 'hidden',
        },
      ],
    },
    comparator: {
      kind: 'semantic',
      validator: 'alienDictionaryOrder',
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
        { id: 'z', label: 'z' },
        { id: 'c', label: 'c' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'zc', from: 'z', to: 'c' },
      ],
      highlightedNodeIds: ['a'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(alienDictionaryMissionSeed)

export default problemLesson
