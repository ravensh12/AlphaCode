import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const combinationSumMissionSeed = createRealm4MissionSeed({
  slug: 'combination-sum',
  estimatedMinutes: 24,
  mission: {
    title: 'The Crystal Charge Workshop',
    context:
      'A robotics club owns crystal types with distinct positive charge values. A robot battery may use any number of crystals of each type, and the engineers need every recipe that reaches one exact charge.',
    prompt:
      'Return recipes in nondecreasing value order. Explore each crystal type in the supplied order, and allow the same type to be chosen again.',
  },
  objective:
    'Build all target-sum combinations with reusable choices, a remaining-total boundary, and backtracking.',
  priorKnowledge: [
    'Positive values make a branch impossible once its remaining total drops below zero.',
    'Keeping a start index prevents reordered copies of the same recipe.',
    'A backtracking path must be restored after recursion.',
  ],
  recognitionCue:
    'The task asks for every combination that reaches a target, and each positive choice can be reused.',
  misconception:
    'Advancing to index i + 1 after every choice wrongly limits each crystal to one use.',
  keyRule:
    'After choosing candidates[i], recurse with the same index i; move to later indices only when trying sibling choices.',
  algorithmSteps: [
    {
      id: 'open-recipe',
      instruction: 'Create an empty result list and current recipe.',
    },
    {
      id: 'check-remainder',
      instruction: 'Save a recipe when remaining charge is zero; stop when it is negative.',
    },
    {
      id: 'loop-from-start',
      instruction: 'Try each crystal at or after the current start index.',
    },
    {
      id: 'reuse-choice',
      instruction: 'Append the crystal and recurse with its same index and a smaller remainder.',
    },
    {
      id: 'undo-crystal',
      instruction: 'Pop the crystal before trying the next type.',
    },
    {
      id: 'return-recipes',
      instruction: 'Return all saved recipes in depth-first order.',
    },
  ],
  complexity: {
    time: 'O(n^(t/m)) worst case',
    space: 'O(t/m) auxiliary',
    explanation:
      'With n choices, target t, and smallest value m, a branch is at most t/m choices deep; output size can itself be exponential.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'r8', label: 'remain 8', arguments: { path: '[]' }, state: 'returned' },
        {
          id: 'r6',
          label: 'remain 6',
          arguments: { path: '[2]', start: 0 },
          state: 'active',
        },
        {
          id: 'r4',
          label: 'reuse 2',
          arguments: { path: '[2, 2]' },
          state: 'pending',
        },
      ],
      activeFrameId: 'r6',
    },
  },
  workedExample: {
    prompt:
      'For charge types [2, 3, 5] and target 8, the search first reuses 2 four times, later finds [2, 3, 3], and finally pairs 3 with 5.',
    code: [
      'search(start=0, remain=8, path=[])',
      'choose 2 -> remain 6; index stays 0',
      'choose 2 -> remain 4; keep exploring',
      'save [2, 2, 2, 2] when remain is 0',
      'backtrack to discover [2, 3, 3] and [3, 5]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Keeping index 0 lets the first branch use four 2-charge crystals.',
      'When a branch exceeds the charge, positive values let it stop immediately.',
      'After popping choices, the start boundary prevents [3, 2, 3] from repeating [2, 3, 3].',
      'The three recipes appear in deterministic depth-first order.',
    ],
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'a', label: '8 left', arguments: { path: '[]' }, state: 'returned' },
        { id: 'b', label: '6 left', arguments: { path: '[2]' }, state: 'returned' },
        {
          id: 'c',
          label: '0 left',
          arguments: { path: '[2, 2, 2, 2]' },
          result: 'save',
          state: 'active',
        },
      ],
      activeFrameId: 'c',
    },
  },
  patternCheck: {
    prompt:
      'A recipe may contain the same crystal many times but reordered copies are forbidden. Which recursive move is correct?',
    options: [
      {
        id: 'same-index',
        label:
          'After choosing type i, reduce the remainder and recurse from i again.',
      },
      {
        id: 'always-next',
        label: 'After choosing type i, always recurse from i + 1.',
      },
      {
        id: 'restart-all',
        label: 'Restart at index zero and save every ordering.',
      },
      {
        id: 'ignore-remainder',
        label: 'Keep choosing after the remaining charge becomes negative.',
      },
    ],
    correctOptionId: 'same-index',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'parent', label: 'remain 6', state: 'active' },
        { id: 'child', label: 'choose 2 again', state: 'pending' },
      ],
      activeFrameId: 'parent',
    },
  },
  retrievalCheck: {
    prompt:
      'When one crystal type may be reused, what start index should its child call receive?',
    acceptedAnswers: [
      'the same index',
      'i',
      'the current crystal index',
      'same index',
      'the same index i',
      'the same start index',
      'the current index',
      'the same start',
    ],
    placeholder: 'Type the child start index',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'choose index i', arguments: { nextStart: 'i' }, state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the workshop search: order setup, remainder checks, the indexed loop, choose, same-index recursion, undo, and return.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'remaining target', state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read distinct positive data["crystals"] and data["target"]. Return every nondecreasing recipe in the depth-first order described above.',
    starterCode: `def solve(data):
    crystals = data["crystals"]
    target = data["target"]
    recipes = []
    path = []

    def search(start, remaining):
        # Handle the remaining charge, then try reusable choices.
        pass

    search(0, target)
    return recipes`,
    cases: {
      visibleExample: {
        input: { crystals: [2, 3, 5], target: 8 },
        expected: [
          [2, 2, 2, 2],
          [2, 3, 3],
          [3, 5],
        ],
      },
      hiddenBoundary: {
        input: { crystals: [4, 7], target: 0 },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { crystals: [2, 4], target: 7 },
        expected: [],
      },
    },
    comparator: { kind: 'unordered' },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'target', arguments: { remaining: 8 }, state: 'returned' },
        { id: 'reuse', label: 'reuse choice', arguments: { remaining: 6 }, state: 'active' },
      ],
      activeFrameId: 'reuse',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(combinationSumMissionSeed)

export default problemLesson
