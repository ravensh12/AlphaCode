import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const subsetsIiMissionSeed = createRealm4MissionSeed({
  slug: 'subsets-ii',
  estimatedMinutes: 24,
  mission: {
    title: 'The Duplicate Sticker Catalog',
    context:
      'A yearbook team has sticker tiles, and several tiles may show the same number. They need every visually different sticker bundle, but swapping identical copies must not create duplicate catalog pages.',
    prompt:
      'Sort the sticker values, record each partial bundle, and skip an equal-value sticker only when an earlier equal sibling was already tried in the same recursive frame.',
  },
  objective:
    'Generate unique subsets from duplicate values by sorting and skipping equal sibling choices.',
  priorKnowledge: [
    'Sorting places equal values next to one another.',
    'A start index keeps each physical input position from being reused.',
    'Backtracking restores the current bundle after a child call.',
  ],
  recognitionCue:
    'The task asks for all subsets, but equal input values can create duplicate-looking answers.',
  misconception:
    'Skipping every repeated value is too aggressive because a valid bundle may contain two or more equal stickers.',
  keyRule:
    'After sorting, skip nums[i] only when i > start and nums[i] equals nums[i - 1]; deeper frames may still choose another copy.',
  algorithmSteps: [
    {
      id: 'sort-stickers',
      instruction: 'Sort the sticker values so equal choices are adjacent.',
    },
    {
      id: 'record-bundle',
      instruction: 'Record a copy of the current bundle in every recursive frame.',
    },
    {
      id: 'scan-siblings',
      instruction: 'Loop over candidate positions from the frame’s start index.',
    },
    {
      id: 'skip-equal-sibling',
      instruction: 'Skip position i when i > start and nums[i] == nums[i - 1]: both copies are siblings in this frame.',
    },
    {
      id: 'choose-and-descend',
      instruction: 'Choose an allowed sticker and recurse from the next position.',
    },
    {
      id: 'undo-sticker',
      instruction: 'Pop the chosen sticker before trying another sibling.',
    },
    {
      id: 'return-catalog',
      instruction: 'Return the unique bundles in depth-first order.',
    },
  ],
  complexity: {
    time: 'O(n · 2^n)',
    space: 'O(n) auxiliary',
    explanation:
      'In the all-distinct case there are 2^n bundles and each copy may cost n; sorting costs O(n log n) and the active path uses O(n).',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'start 0: [1,2,2]', state: 'returned' },
        { id: 'one', label: 'path [1]', arguments: { start: 1 }, state: 'active' },
        { id: 'two', label: 'path [1,2]', arguments: { start: 2 }, state: 'pending' },
      ],
      activeFrameId: 'one',
    },
  },
  workedExample: {
    prompt:
      'For sorted stickers [1, 2, 2], a deeper frame may build [1, 2, 2]. Back at the root, however, the second 2 is skipped because the first 2 already started that sibling branch.',
    code: [
      'visit(start=0, path=[]) -> save []',
      'choose 1 -> save [1]',
      'choose first 2 -> save [1, 2], then [1, 2, 2]',
      'root chooses first 2 -> save [2], then [2, 2]',
      'root skips second 2 as an equal sibling',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The sorted order makes duplicate decisions adjacent.',
      'At start 2, the second 2 is the first choice in that deeper frame, so [1, 2, 2] is valid.',
      'At start 0, positions 1 and 2 both offer 2 as sibling first choices.',
      'Skipping only the later sibling removes duplicate pages without removing repeated-value bundles.',
    ],
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'a', label: '[]', state: 'returned' },
        { id: 'b', label: '[2] from index 1', state: 'active' },
        { id: 'c', label: 'skip sibling index 2', result: 'duplicate', state: 'pending' },
      ],
      activeFrameId: 'b',
    },
  },
  patternCheck: {
    prompt:
      'Two equal stickers sit next to each other after sorting. When should the later copy be skipped?',
    options: [
      {
        id: 'same-frame-only',
        label:
          'Skip it only when the earlier equal sticker was a sibling choice in the same frame.',
      },
      {
        id: 'always-skip',
        label: 'Skip every value that equals any earlier input value.',
      },
      {
        id: 'never-skip',
        label: 'Never skip equal choices; remove duplicate outputs afterward.',
      },
      {
        id: 'skip-first-copy',
        label: 'Skip the first copy and choose only the last copy.',
      },
    ],
    correctOptionId: 'same-frame-only',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'siblings: 2, 2', arguments: { start: 1 }, state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  retrievalCheck: {
    prompt:
      'Type the exact duplicate-skip condition using i, start, and the sorted values.',
    acceptedAnswers: [
      'i > start and nums[i] == nums[i - 1]',
      'i > start and nums[i] == nums[i-1]',
      'i>start and nums[i]==nums[i-1]',
      'i > start and nums[i] equals nums[i - 1]',
      'i > start and stickers[i] == stickers[i - 1]',
      'i > start and stickers[i] == stickers[i-1]',
      'i > start and values[i] equals values[i - 1]',
      'skip when i is past start and equals the previous value',
    ],
    placeholder: 'i > start and ...',
    diagram: {
      kind: 'array',
      values: [1, 2, 2],
      highlight: 2,
      pointers: [
        { index: 1, label: 'start' },
        { index: 2, label: 'i' },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the unique-catalog search: sort, record, scan, skip equal sibling, choose, recurse, undo, and return.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'one sibling level', state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read integer data["stickers"], sort a copy, and return every visually unique bundle in record-before-extend depth-first order.',
    starterCode: `def solve(data):
    stickers = sorted(data["stickers"])
    catalog = []
    path = []

    def visit(start):
        # Save path, skip equal siblings, and backtrack.
        pass

    visit(0)
    return catalog`,
    cases: {
      visibleExample: {
        input: { stickers: [1, 2, 2] },
        expected: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]],
      },
      hiddenBoundary: {
        input: { stickers: [] },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { stickers: [3, 3, 3] },
        expected: [[], [3], [3, 3], [3, 3, 3]],
      },
    },
    comparator: { kind: 'unordered' },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'sorted choices', state: 'returned' },
        { id: 'branch', label: 'one copy chosen', state: 'active' },
      ],
      activeFrameId: 'branch',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(subsetsIiMissionSeed)

export default problemLesson
