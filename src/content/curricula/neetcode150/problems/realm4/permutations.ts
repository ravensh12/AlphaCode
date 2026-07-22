import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const permutationsMissionSeed = createRealm4MissionSeed({
  slug: 'permutations',
  estimatedMinutes: 22,
  mission: {
    title: 'The Drone Launch Parade',
    context:
      'A science fair has a small set of drones with distinct number tags. The announcer wants every possible launch order so each drone gets a turn in every position.',
    prompt:
      'List launch orders by scanning the original tag list from left to right at each open position and skipping tags already used in the current order.',
  },
  objective:
    'Generate all full-length arrangements by tracking which distinct choices are active, then undoing each choice.',
  priorKnowledge: [
    'A permutation uses every input item exactly once.',
    'A set can record choices already used on the active path.',
    'A result should receive a copy of a completed path.',
  ],
  recognitionCue:
    'Every item must appear once, and changing positions creates a different answer.',
  misconception:
    'Using a global used set without removing a tag after recursion prevents sibling branches from using it.',
  keyRule:
    'Choose only unused tags, save only full-length paths, and remove both the tag and path entry when a child returns.',
  algorithmSteps: [
    {
      id: 'open-order',
      instruction: 'Create an empty output, path, and set of used tags.',
    },
    {
      id: 'save-full-path',
      instruction: 'When path length equals the tag count, append a copy and return.',
    },
    {
      id: 'scan-tags',
      instruction: 'Scan tags in input order and skip any tag already used.',
    },
    {
      id: 'choose-tag',
      instruction: 'Add an unused tag to both path and used.',
    },
    {
      id: 'fill-next-slot',
      instruction: 'Recurse to fill the next launch position.',
    },
    {
      id: 'undo-tag',
      instruction: 'Pop the path and remove the tag from used before the next sibling.',
    },
    {
      id: 'return-orders',
      instruction: 'Return all completed launch orders.',
    },
  ],
  complexity: {
    time: 'O(n · n!)',
    space: 'O(n) auxiliary',
    explanation:
      'There are n! complete orders and copying each costs n; the path, used set, and recursion depth each hold at most n entries.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'slot0', label: 'choose first', arguments: { path: '[]' }, state: 'returned' },
        { id: 'slot1', label: 'choose second', arguments: { path: '[1]' }, state: 'active' },
        { id: 'slot2', label: 'choose third', arguments: { path: '[1, 3]' }, state: 'pending' },
      ],
      activeFrameId: 'slot1',
    },
  },
  workedExample: {
    prompt:
      'For tags [1, 3, 7], the first branch fixes 1, then tries 3 before 7. After saving [1, 3, 7], it swaps the final choices through backtracking.',
    code: [
      'path []: choose 1',
      'path [1]: choose 3',
      'path [1, 3]: choose 7 and save [1, 3, 7]',
      'undo 7 and 3; choose 7, then 3',
      'undo 1; repeat with first tag 3, then 7',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The used set blocks 1 from filling a second position in its own branch.',
      'A path is saved only after all three positions are filled.',
      'Removing 3 after its branch lets the sibling beginning [1, 7] use 3.',
      'Repeating the same rule for first choices 3 and 7 creates six orders.',
    ],
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'a', label: '[]', state: 'returned' },
        { id: 'b', label: '[1]', state: 'returned' },
        { id: 'c', label: '[1, 3]', state: 'returned' },
        { id: 'd', label: '[1, 3, 7]', result: 'saved', state: 'active' },
      ],
      activeFrameId: 'd',
    },
  },
  patternCheck: {
    prompt:
      'The next launch position is empty. Which state makes every order possible without repeating a drone inside one order?',
    options: [
      {
        id: 'path-used-state',
        label:
          'Keep a path-local used set, choose an unused tag, then remove it after recursion.',
      },
      {
        id: 'advance-index',
        label: 'Only choose tags to the right of the previous tag.',
      },
      {
        id: 'never-unmark',
        label: 'Mark a tag globally and never unmark it.',
      },
      {
        id: 'save-prefixes',
        label: 'Save every partial prefix as a completed launch order.',
      },
    ],
    correctOptionId: 'path-used-state',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'parent', label: '[1]', arguments: { used: '1' }, state: 'active' },
        { id: 'child', label: '[1, 3]', arguments: { used: '1,3' }, state: 'pending' },
      ],
      activeFrameId: 'parent',
    },
  },
  retrievalCheck: {
    prompt:
      'After a recursive launch-order branch returns, what two pieces of state must be undone?',
    acceptedAnswers: [
      'pop the path and remove the tag from used',
      'remove the last path item and unmark it as used',
      'undo the path choice and the used marker',
      'the path and the used set',
      'path and used',
      'pop the path and unmark the tag',
      'remove the tag from the path and the used set',
    ],
    placeholder: 'Name both undo operations',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'backtrack one tag', state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  reconstructionCheck: {
    prompt:
      'Put the parade generator back in order: setup, full-path check, scan, choose, recurse, undo, and return.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'slot', label: 'fill next position', state: 'active' },
      ],
      activeFrameId: 'slot',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read distinct integer data["droneTags"] and return every launch order. At each position, try unused tags in their original input order.',
    starterCode: `def solve(data):
    tags = data["droneTags"]
    orders = []
    path = []
    used = set()

    def arrange():
        # Save full paths; otherwise choose each unused tag.
        pass

    arrange()
    return orders`,
    cases: {
      visibleExample: {
        input: { droneTags: [1, 3, 7] },
        expected: [
          [1, 3, 7],
          [1, 7, 3],
          [3, 1, 7],
          [3, 7, 1],
          [7, 1, 3],
          [7, 3, 1],
        ],
      },
      hiddenBoundary: {
        input: { droneTags: [] },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { droneTags: [-2, 4] },
        expected: [
          [-2, 4],
          [4, -2],
        ],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'open positions', state: 'returned' },
        { id: 'branch', label: 'first tag chosen', state: 'active' },
      ],
      activeFrameId: 'branch',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(permutationsMissionSeed)

export default problemLesson
