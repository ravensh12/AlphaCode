import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const combinationSumIiMissionSeed = createRealm4MissionSeed({
  slug: 'combination-sum-ii',
  estimatedMinutes: 26,
  mission: {
    title: 'The One-Use Supply Crates',
    context:
      'A makerspace has numbered supply crates. Several crates can hold the same number of parts, but each physical crate may be opened at most once for a build.',
    prompt:
      'Find every different crate-value recipe reaching the requested part total. Sort values first, use each position once, and do not return duplicate recipes.',
  },
  objective:
    'Find unique target-sum combinations with one-use positions, sorted pruning, and sibling duplicate skipping.',
  priorKnowledge: [
    'Sorting groups equal crate values and makes over-target pruning safe for positive numbers.',
    'Passing i + 1 prevents one physical crate from being selected twice.',
    'Equal sibling choices create the same value recipe.',
  ],
  recognitionCue:
    'Values may repeat, each input position is single-use, and only unique target-sum combinations count.',
  misconception:
    'Reusing the same index turns a one-use crate into an unlimited supply and can invent invalid recipes.',
  keyRule:
    'Sort first, recurse from i + 1 after choosing, and skip candidates[i] when i > start and it equals the previous sibling.',
  algorithmSteps: [
    {
      id: 'sort-crates',
      instruction: 'Sort crate values so duplicates are adjacent and large values can prune.',
    },
    {
      id: 'check-total',
      instruction: 'Save a path when its remaining total is zero.',
    },
    {
      id: 'scan-unused',
      instruction: 'Loop over positions from the frame’s start index.',
    },
    {
      id: 'skip-duplicate-sibling',
      instruction: 'Skip a value equal to the previous sibling choice in this frame.',
    },
    {
      id: 'stop-too-large',
      instruction: 'Break when the sorted positive value exceeds the remainder.',
    },
    {
      id: 'choose-once',
      instruction: 'Choose the value and recurse from the following position.',
    },
    {
      id: 'undo-crate',
      instruction: 'Pop the crate value before trying the next allowed sibling.',
    },
    {
      id: 'return-recipes',
      instruction: 'Return unique recipes in depth-first order.',
    },
  ],
  complexity: {
    time: 'O(n · 2^n)',
    space: 'O(n) auxiliary',
    explanation:
      'A one-use choice tree has at most 2^n branches and copying outputs costs up to n each; sorting costs O(n log n).',
  },
  explanationVisuals: {
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'remain 6', arguments: { start: 0 }, state: 'returned' },
        {
          id: 'one',
          label: 'choose first 1',
          arguments: { remain: 5, start: 1 },
          state: 'active',
        },
        {
          id: 'next',
          label: 'next position only',
          arguments: { start: 2 },
          state: 'pending',
        },
      ],
      activeFrameId: 'one',
    },
  },
  workedExample: {
    prompt:
      'Crates [1, 1, 2, 3, 5] must total 6. The first 1 can lead to [1, 2, 3] and [1, 5]. At the root, the second 1 is skipped as an equal sibling.',
    code: [
      'sorted values = [1, 1, 2, 3, 5]',
      'choose index 0 value 1; child starts at index 1',
      'choose 2, then 3 -> save [1, 2, 3]',
      'backtrack and choose 5 -> save [1, 5]',
      'root skips index 1 because it repeats sibling value 1',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The child start always moves right, so no crate position can reappear in one recipe.',
      'The recipe [1, 2, 3] uses one of the equal 1-crates, but its value sequence is stored once.',
      'The [1, 5] branch reaches the target directly.',
      'Sibling skipping removes the duplicate branch that would begin with the other 1.',
    ],
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'a', label: '[] / 6 left', state: 'returned' },
        { id: 'b', label: '[1] / 5 left', state: 'returned' },
        { id: 'c', label: '[1, 2, 3] / 0 left', result: 'save', state: 'active' },
      ],
      activeFrameId: 'c',
    },
  },
  patternCheck: {
    prompt:
      'The sorted list has equal-valued crates at neighboring positions. Which plan respects both one-use and uniqueness?',
    options: [
      {
        id: 'next-and-skip',
        label:
          'Recurse from i + 1 and skip later equal values only at the same sibling level.',
      },
      {
        id: 'same-index',
        label: 'Recurse from i so the selected physical crate can be reused.',
      },
      {
        id: 'skip-all-equals',
        label: 'Ban a value everywhere after its first appearance.',
      },
      {
        id: 'keep-orderings',
        label: 'Restart from zero and keep reordered copies as different recipes.',
      },
    ],
    correctOptionId: 'next-and-skip',
    diagram: {
      kind: 'array',
      values: [1, 1, 2, 3, 5],
      highlight: 1,
      pointers: [
        { index: 0, label: 'previous sibling' },
        { index: 1, label: 'skip here' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'After choosing crate position i, which start index must the child use, and why?',
    acceptedAnswers: [
      'i + 1 so the crate is used once',
      'the next index because each position is single-use',
      'i plus one to prevent reuse',
      'i + 1',
      'i+1',
      'i + 1 to prevent reuse',
      'i+1 to prevent reuse',
      'i+1 so the crate is used once',
      'i + 1 because each position is single-use',
      'i + 1 so the crate cannot be reused',
    ],
    placeholder: 'index and reason',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'choose i', arguments: { childStart: 'i + 1' }, state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  reconstructionCheck: {
    prompt:
      'Order the crate search: sort, target check, scan, skip duplicate sibling, prune, choose, recurse from next, undo, return.',
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'frame', label: 'single-use search', state: 'active' },
      ],
      activeFrameId: 'frame',
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read positive data["crateValues"] and data["target"]. Return unique sorted-value recipes in depth-first order, using each input position at most once.',
    starterCode: `def solve(data):
    values = sorted(data["crateValues"])
    target = data["target"]
    recipes = []
    path = []

    def search(start, remaining):
        # Skip equal siblings, prune, and move to the next index.
        pass

    search(0, target)
    return recipes`,
    cases: {
      visibleExample: {
        input: { crateValues: [1, 1, 2, 3, 5], target: 6 },
        expected: [
          [1, 2, 3],
          [1, 5],
        ],
      },
      hiddenBoundary: {
        input: { crateValues: [], target: 0 },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: { crateValues: [2, 2, 2, 3], target: 4 },
        expected: [[2, 2]],
      },
    },
    comparator: { kind: 'unordered' },
    diagram: {
      kind: 'recursion',
      frames: [
        { id: 'root', label: 'one-use positions', state: 'returned' },
        { id: 'child', label: 'start after choice', state: 'active' },
      ],
      activeFrameId: 'child',
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(combinationSumIiMissionSeed)

export default problemLesson
