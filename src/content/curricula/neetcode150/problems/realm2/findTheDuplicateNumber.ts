import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const findTheDuplicateNumberMissionSeed = createRealm2MissionSeed({
  slug: 'find-the-duplicate-number',
  estimatedMinutes: 25,
  mission: {
    title: 'The Repeating Portal Map',
    context:
      'A portal table has slots 0 through n, and each slot names a destination from 1 through n. Exactly one destination number appears more than once.',
    prompt:
      'Find the repeated destination without changing the table and while using only constant extra memory.',
  },
  objective:
    'Interpret array values as next pointers and find the entrance of the resulting cycle.',
  priorKnowledge: [
    'Index i can point to index nums[i].',
    'With n+1 pointers into n nonzero destinations, some path must cycle.',
    'Floyd’s method can find both a meeting point and a cycle entrance.',
  ],
  recognitionCue:
    'The values stay within the array’s index range, one value repeats, and mutation plus extra storage are forbidden.',
  misconception:
    'The first slow-fast meeting is somewhere inside the cycle, but it is not always the repeated destination.',
  keyRule:
    'After slow and fast meet, start a finder at index 0 and move finder and slow one step each; their next meeting is the duplicate value.',
  algorithmSteps: [
    {
      id: 'start-index-walkers',
      instruction: 'Set slow and fast to index 0.',
    },
    {
      id: 'find-cycle-meeting',
      instruction:
        'Move slow to nums[slow] and fast to nums[nums[fast]] until they meet.',
    },
    {
      id: 'start-entrance-finder',
      instruction: 'Set finder to index 0 while leaving slow at the meeting.',
    },
    {
      id: 'walk-to-entrance',
      instruction:
        'Move finder and slow one value-link per step until they meet.',
    },
    {
      id: 'return-duplicate',
      instruction: 'Return their shared index, the cycle entrance.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Both Floyd phases take linear pointer steps, and the input remains unchanged with only three integer pointers.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 'index 0', next: 'i2' },
        { id: 'i1', value: 'index 1', next: 'i5' },
        { id: 'i2', value: 'index 2', next: 'i1' },
        { id: 'i3', value: 'index 3', next: 'i4' },
        { id: 'i4', value: 'index 4', next: 'i3' },
        { id: 'i5', value: 'index 5', next: 'i4' },
      ],
      highlightedNodeIds: ['i4'],
    },
  },
  workedExample: {
    prompt:
      'For [2,5,1,4,3,4], following values as links gives 0 → 2 → 1 → 5 → 4 → 3 → 4. The cycle begins at destination 4.',
    code: [
      'phase 1: slow moves one link, fast moves two',
      'they eventually meet inside cycle 4 -> 3 -> 4',
      'finder starts again at index 0',
      'finder and slow now move one link each',
      'they meet at index 4 -> return 4',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The duplicate destination creates two incoming routes into index 4.',
      'That merge becomes the entrance to a value-pointer cycle.',
      'The first phase proves and locates the cycle internally.',
      'The reset-and-walk phase identifies its entrance, which equals the repeated number.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 0, next: 'i2' },
        { id: 'i2', value: 2, next: 'i1' },
        { id: 'i1', value: 1, next: 'i5' },
        { id: 'i5', value: 5, next: 'i4' },
        { id: 'i4', value: 4, next: 'i3' },
        { id: 'i3', value: 3, next: 'i4' },
      ],
      pointers: [
        { nodeId: 'i4', label: 'finder' },
        { nodeId: 'i4', label: 'slow' },
      ],
      highlightedNodeIds: ['i4'],
    },
  },
  patternCheck: {
    prompt:
      'Why can the array be treated like a linked route?',
    options: [
      {
        id: 'values-are-indices',
        label: 'Every stored value is a valid next index from 1 through n.',
      },
      {
        id: 'array-is-sorted',
        label: 'The values are guaranteed to increase from left to right.',
      },
      {
        id: 'values-are-unique',
        label: 'Every destination occurs exactly once.',
      },
      {
        id: 'indices-are-values',
        label: 'Each slot number must equal the value stored inside it.',
      },
    ],
    correctOptionId: 'values-are-indices',
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 0, next: 'i2' },
        { id: 'i2', value: 2, next: 'i1' },
        { id: 'i1', value: 1, next: 'i2' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'After the first slow-fast meeting, where does finder start and how fast do finder and slow move?',
    acceptedAnswers: [
      'finder starts at 0 and both move one step',
      'start finder at index 0, then move each one link',
      'finder = 0; finder and slow advance once per round',
      'finder starts at index 0 and both move one step',
      'start finder at 0 and move both one step',
      'finder starts at 0, both move one step each',
    ],
    placeholder: 'Type the second-phase rule',
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 0, next: 'i1' },
        { id: 'i1', value: 1, next: 'i1' },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore Floyd’s duplicate finder from index walkers through cycle meeting, finder reset, equal-speed walk, and return.',
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 0, next: 'i3' },
        { id: 'i3', value: 3, next: 'i1' },
        { id: 'i1', value: 1, next: 'i3' },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["nums"] has length n+1, values from 1 through n, and one repeated value. Return that value without changing nums or using a set.',
    starterCode: `def solve(data):
    nums = data["nums"]
    slow = 0
    fast = 0

    # Phase 1: meet inside the value-pointer cycle.
    pass

    finder = 0
    # Phase 2: move two one-step pointers to the entrance.
    pass

    return finder`,
    cases: {
      visibleExample: {
        input: { nums: [2, 5, 1, 4, 3, 4] },
        expected: 4,
      },
      hiddenBoundary: {
        input: { nums: [1, 1] },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { nums: [3, 1, 3, 4, 2] },
        expected: 3,
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'i0',
      nodes: [
        { id: 'i0', value: 0, next: 'i2' },
        { id: 'i2', value: 2, next: 'i1' },
        { id: 'i1', value: 1, next: 'i5' },
        { id: 'i5', value: 5, next: 'i4' },
        { id: 'i4', value: 4, next: 'i3' },
        { id: 'i3', value: 3, next: 'i4' },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  findTheDuplicateNumberMissionSeed,
)

export default problemLesson
