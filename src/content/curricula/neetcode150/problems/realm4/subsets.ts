import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const subsetsMissionSeed = createRealm4MissionSeed({
  slug: 'subsets',
  estimatedMinutes: 22,
  mission: {
    title: 'The Museum Display Mixer',
    context:
      'A school museum has a short row of distinct artifacts. Curators want to photograph every possible display, including the empty table and the display using every artifact.',
    prompt:
      'List every display in a fixed depth-first order: record the current display, then try each later artifact before backing up.',
  },
  objective:
    'Generate every subset by extending one partial choice, recording it, and undoing each choice after recursion.',
  priorKnowledge: [
    'A recursive call can continue from a smaller remaining range.',
    'A list copy freezes the current choices.',
    'Backtracking removes the most recent choice before trying another.',
  ],
  recognitionCue:
    'The task asks for every selection where each distinct item may be chosen or skipped and order inside a selection stays fixed.',
  misconception:
    'Appending the same mutable path without copying makes all saved displays change together later.',
  keyRule:
    'At start index i, record a copy of path, choose each item j from i onward, recurse from j + 1, then pop.',
  algorithmSteps: [
    {
      id: 'start-empty-path',
      instruction: 'Create an empty result list and an empty current display.',
    },
    {
      id: 'record-current',
      instruction: 'At every recursive frame, append a copy of the current display.',
    },
    {
      id: 'choose-later-item',
      instruction: 'Loop over each artifact at or after the frame’s start index.',
    },
    {
      id: 'recurse-forward',
      instruction: 'Choose that artifact and recurse starting after its position.',
    },
    {
      id: 'undo-choice',
      instruction: 'Pop the artifact so the next loop choice starts from the same prefix.',
    },
    {
      id: 'return-displays',
      instruction: 'Return the displays in the order they were recorded.',
    },
  ],
  complexity: {
    time: 'O(n · 2^n)',
    space: 'O(n) auxiliary',
    explanation:
      'There are 2^n displays and copying one can take n time; the active recursion path holds at most n artifacts, excluding returned output.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'record []', arguments: { start: 0 }, state: 'returned' },
        {
          id: 'take-2',
          label: 'record [2]',
          arguments: { start: 1 },
          state: 'active',
        },
        {
          id: 'take-5',
          label: 'record [2, 5]',
          arguments: { start: 2 },
          state: 'pending',
        },
      ],
      activeFrameId: 'take-2',
    },
  },
  workedExample: {
    prompt:
      'With artifacts [2, 5], record [], descend through 2 to record [2] and [2, 5], then back up and start with 5 to record [5].',
    code: [
      'visit(start=0, path=[])  -> save []',
      'choose 2; visit(1, [2]) -> save [2]',
      'choose 5; visit(2, [2, 5]) -> save [2, 5]',
      'pop 5, then pop 2',
      'choose 5; visit(2, [5]) -> save [5]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The root frame saves the empty display before making a choice.',
      'Choosing 2 moves the start boundary right, so 2 cannot be chosen twice.',
      'The [2, 5] frame has no later artifact, so it returns and both choices are undone in turn.',
      'The root loop can now choose 5, producing the final display [5].',
    ],
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'a', label: '[]', arguments: { start: 0 }, state: 'returned' },
        { id: 'b', label: '[2]', arguments: { start: 1 }, state: 'returned' },
        {
          id: 'c',
          label: '[2, 5]',
          arguments: { start: 2 },
          result: 'saved',
          state: 'active',
        },
      ],
      activeFrameId: 'c',
    },
  },
  patternCheck: {
    prompt:
      'The curator needs every selection exactly once. Which search plan matches that goal?',
    options: [
      {
        id: 'record-and-extend',
        label:
          'Record each path, extend it only with later artifacts, and pop after every recursive call.',
      },
      {
        id: 'save-at-full-length',
        label: 'Save a path only after it uses every artifact.',
      },
      {
        id: 'restart-from-zero',
        label: 'Restart choices at index zero in every frame.',
      },
      {
        id: 'reuse-one-list',
        label: 'Store the same path object without making copies.',
      },
    ],
    correctOptionId: 'record-and-extend',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'empty', label: '[]', state: 'returned' },
        { id: 'one', label: '[2]', state: 'active' },
      ],
      activeFrameId: 'one',
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the backtracking rule: after returning from a chosen artifact, ______ before trying its sibling.',
    acceptedAnswers: [
      'pop the chosen artifact',
      'remove the last choice',
      'undo the choice',
      'pop the artifact',
      'pop the last artifact',
      'pop it',
      'pop the path',
      'remove the most recent choice',
      'undo the last choice',
    ],
    placeholder: 'Type the undo action',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'parent', label: '[2]', state: 'active' },
        { id: 'child', label: '[2, 5]', state: 'returned' },
      ],
      activeFrameId: 'parent',
    },
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the exhibit generator by ordering its setup, save, choose, recurse, undo, and return actions.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'path', arguments: { start: 0 }, state: 'active' },
      ],
      activeFrameId: 'root',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read distinct integers from data["artifacts"] and return every display. Use depth-first order that saves the current path before trying later indices.',
    starterCode: `def solve(data):
    artifacts = data["artifacts"]
    displays = []
    path = []

    def visit(start):
        # Save this display, then explore choices from start onward.
        pass

    visit(0)
    return displays`,
    cases: {
      visibleExample: {
        input: { artifacts: [2, 5] },
        expected: [[], [2], [2, 5], [5]],
      },
      hiddenBoundary: {
        input: { artifacts: [] },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { artifacts: [-1, 0, 3] },
        expected: [
          [],
          [-1],
          [-1, 0],
          [-1, 0, 3],
          [-1, 3],
          [0],
          [0, 3],
          [3],
        ],
      },
    },
    comparator: { kind: 'unordered' },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: '[]', arguments: { start: 0 }, state: 'returned' },
        { id: 'branch', label: '[-1]', arguments: { start: 1 }, state: 'active' },
      ],
      activeFrameId: 'branch',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(subsetsMissionSeed)

export default problemLesson
