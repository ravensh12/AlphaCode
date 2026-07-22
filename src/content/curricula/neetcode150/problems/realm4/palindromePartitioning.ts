import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const palindromePartitioningMissionSeed = createRealm4MissionSeed({
  slug: 'palindrome-partitioning',
  estimatedMinutes: 25,
  mission: {
    title: 'The Mirror-Word Ribbon',
    context:
      'An art class prints a word on a ribbon and may cut it between letters. Every resulting strip must read the same forward and backward for the mirror display to work.',
    prompt:
      'List every valid full cutting plan. At each position, test end positions from left to right and recurse only when the next strip is mirrored.',
  },
  objective:
    'Partition a string by choosing palindrome prefixes, recursing from each cut, and backtracking.',
  priorKnowledge: [
    'A substring from start through end can be checked with inward pointers.',
    'A partition must consume the entire original string.',
    'Backtracking can add and remove the latest chosen strip.',
  ],
  recognitionCue:
    'Every answer is a complete sequence of contiguous pieces, and each piece must satisfy a palindrome condition.',
  misconception:
    'Saving a path as soon as one mirrored piece is found records incomplete cutting plans.',
  keyRule:
    'From index start, try every ending index; recurse only on palindrome text[start:end + 1], and save only when start reaches the string length.',
  algorithmSteps: [
    {
      id: 'open-cut-plan',
      instruction: 'Create an empty output list and current strip list.',
    },
    {
      id: 'save-at-end',
      instruction: 'When the start index reaches the text length, save a copy of the full plan.',
    },
    {
      id: 'try-endpoints',
      instruction: 'Try each possible end index from start to the final character.',
    },
    {
      id: 'test-mirror',
      instruction: 'Check whether the proposed contiguous strip is a palindrome.',
    },
    {
      id: 'choose-valid-strip',
      instruction: 'Append a mirrored strip and recurse immediately after its end.',
    },
    {
      id: 'undo-strip',
      instruction: 'Pop the strip before trying a longer endpoint.',
    },
    {
      id: 'return-plans',
      instruction: 'Return all complete cutting plans in depth-first order.',
    },
  ],
  complexity: {
    time: 'O(n · 2^n)',
    space: 'O(n) auxiliary',
    explanation:
      'There are up to 2^(n-1) cut patterns; checking or copying a pattern can cost O(n), while an active plan has at most n pieces.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'start 0: noon', state: 'returned' },
        { id: 'n', label: 'choose "n"', arguments: { start: 1 }, state: 'active' },
        { id: 'o', label: 'try "o" or "oo"', arguments: { start: 2 }, state: 'pending' },
      ],
      activeFrameId: 'n',
    },
  },
  workedExample: {
    prompt:
      'For ribbon noon, endpoint order first cuts every letter, then joins the middle oo, and finally accepts the whole ribbon as one mirrored strip.',
    code: [
      'choose "n", then "o", then "o", then "n" -> save',
      'backtrack to the second character',
      'choose "oo", then "n" -> save',
      'backtrack to start; reject "no" and "noo"',
      'choose "noon" -> save',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Single characters are mirrored, so the first branch reaches ["n", "o", "o", "n"].',
      'The middle substring "oo" is also mirrored, creating ["n", "oo", "n"].',
      'Prefixes "no" and "noo" fail the inward comparison.',
      'The full word "noon" passes, producing the final plan.',
    ],
    diagram: {
      kind: 'string',
      chars: 'noon',
      pointers: [
        { index: 0, label: 'left' },
        { index: 3, label: 'right' },
      ],
      visited: [1, 2],
    },
  },
  patternCheck: {
    prompt:
      'A proposed first strip is not mirrored. What should the search do?',
    options: [
      {
        id: 'skip-that-end',
        label:
          'Skip recursion for that endpoint and test the next possible endpoint.',
      },
      {
        id: 'save-partial',
        label: 'Save the current partial plan anyway.',
      },
      {
        id: 'reorder-letters',
        label: 'Rearrange the strip until it becomes mirrored.',
      },
      {
        id: 'stop-all-search',
        label: 'Stop the entire search after the first failed strip.',
      },
    ],
    correctOptionId: 'skip-that-end',
    diagram: {
      kind: 'string',
      chars: 'noo',
      pointers: [
        { index: 0, label: 'n' },
        { index: 2, label: 'o' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'When is a ribbon-cut path complete enough to save?',
    acceptedAnswers: [
      'when the start index reaches the string length',
      'after all characters are consumed',
      'when the cuts cover the whole string',
      'when start reaches the string length',
      'when start equals the string length',
      'when the start index equals the string length',
      'when start == len(text)',
      'when all characters are consumed',
      'when the whole string is consumed',
    ],
    placeholder: 'State the base case',
    diagram: {
      kind: 'recursion',
      frames: [
        {
          id: 'done',
          label: 'all characters consumed',
          arguments: { start: 4, length: 4 },
          result: 'save',
          state: 'active',
        },
      ],
      activeFrameId: 'done',
    },
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the ribbon search: setup, full-consumption base case, endpoint loop, mirror test, choose, recurse, undo, and return.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'choose next mirrored prefix', state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["ribbon"] and return every complete list of palindrome strips. Try each end index from left to right.',
    starterCode: `def solve(data):
    text = data["ribbon"]
    plans = []
    path = []

    def is_mirror(left, right):
        # Compare characters while moving inward.
        pass

    def cut(start):
        # Save only complete plans; try every mirrored next strip.
        pass

    cut(0)
    return plans`,
    cases: {
      visibleExample: {
        input: { ribbon: 'noon' },
        expected: [
          ['n', 'o', 'o', 'n'],
          ['n', 'oo', 'n'],
          ['noon'],
        ],
      },
      hiddenBoundary: {
        input: { ribbon: '' },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { ribbon: 'aba' },
        expected: [
          ['a', 'b', 'a'],
          ['aba'],
        ],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'start 0', state: 'returned' },
        { id: 'child', label: 'next cut', state: 'active' },
      ],
      activeFrameId: 'child',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  palindromePartitioningMissionSeed,
)

export default problemLesson
