import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const binarySearchMissionSeed = createRealm2MissionSeed({
  slug: 'binary-search',
  estimatedMinutes: 18,
  mission: {
    title: 'The Numbered Archive Shelf',
    context:
      'A library robot faces one long shelf whose book codes increase from left to right. It can inspect a middle code and then ignore the half that cannot contain its request.',
    prompt:
      'Return the index of the requested code in the sorted array, or -1 when the code is absent.',
  },
  objective:
    'Locate a target in logarithmic time by preserving an inclusive candidate interval.',
  priorKnowledge: [
    'The array is sorted in increasing order.',
    'An index interval can be represented by low and high bounds.',
    'Integer division can choose a middle index.',
  ],
  recognitionCue:
    'The search space is ordered, and one comparison can discard an entire half.',
  misconception:
    'Updating low to mid or high to mid can leave the same interval forever; the rejected middle must be excluded.',
  keyRule:
    'While low <= high, compare nums[mid]; use low = mid + 1 or high = mid - 1 so every remaining index could still hold the target.',
  algorithmSteps: [
    {
      id: 'set-inclusive-bounds',
      instruction: 'Set low to 0 and high to the last index.',
    },
    {
      id: 'check-candidate-interval',
      instruction: 'Continue while low is not greater than high.',
    },
    {
      id: 'choose-middle',
      instruction: 'Choose mid halfway between low and high.',
    },
    {
      id: 'return-match',
      instruction: 'If the middle value equals the target, return mid.',
    },
    {
      id: 'discard-half',
      instruction:
        'If the middle value is too small move low past mid; otherwise move high before mid.',
    },
    {
      id: 'report-absent',
      instruction: 'Return -1 after the interval becomes empty.',
    },
  ],
  complexity: {
    time: 'O(log n)',
    space: 'O(1)',
    explanation:
      'Each comparison halves the candidate interval, and the iterative version stores only three indices.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'binarySearch',
      values: [-5, 0, 4, 9, 13],
      low: 0,
      high: 4,
      mid: 2,
    },
  },
  workedExample: {
    prompt:
      'Search [-5, 0, 4, 9, 13] for 9. The first middle is 4, so indices through 2 are discarded. The next middle is 9.',
    code: [
      'low = 0, high = 4, mid = 2, value = 4',
      '4 < 9, so low = 3',
      'low = 3, high = 4, mid = 3, value = 9',
      'return 3',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The initial candidate interval covers every index.',
      'Because 4 is too small, sorted order rules out indices 0 through 2.',
      'The new midpoint is index 3.',
      'Its value matches, so index 3 is returned.',
    ],
    diagram: {
      kind: 'binarySearch',
      values: [-5, 0, 4, 9, 13],
      low: 3,
      high: 4,
      mid: 3,
    },
    diagramSequence: [
      {
        kind: 'binarySearch',
        values: [-5, 0, 4, 9, 13],
        low: 0,
        high: 4,
        mid: 2,
      },
      {
        kind: 'binarySearch',
        values: [-5, 0, 4, 9, 13],
        low: 3,
        high: 4,
        mid: 3,
      },
    ],
  },
  patternCheck: {
    prompt:
      'The midpoint value is smaller than the target. Which update preserves all possible matches and guarantees progress?',
    options: [
      { id: 'raise-low', label: 'Set low to mid + 1.' },
      { id: 'keep-mid', label: 'Set low to mid.' },
      { id: 'lower-high', label: 'Set high to mid - 1.' },
      { id: 'restart', label: 'Reset both bounds to the full array.' },
    ],
    correctOptionId: 'raise-low',
    diagram: {
      kind: 'binarySearch',
      values: [-5, 0, 4, 9, 13],
      low: 0,
      high: 4,
      mid: 2,
    },
  },
  retrievalCheck: {
    prompt:
      'For inclusive low and high bounds, what loop condition keeps searching while at least one candidate remains?',
    acceptedAnswers: [
      'low <= high',
      'low is less than or equal to high',
      'low<=high',
      'while low <= high',
      'low less than or equal to high',
      'low is not greater than high',
    ],
    placeholder: 'Type the loop condition',
    diagram: {
      kind: 'binarySearch',
      values: [2, 4, 6],
      low: 1,
      high: 1,
      mid: 1,
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the archive search from inclusive bounds through midpoint comparison, half removal, and the absent result.',
    diagram: {
      kind: 'binarySearch',
      values: [2, 4, 6, 8, 10],
      low: 1,
      high: 3,
      mid: 2,
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read sorted data["nums"] and data["target"]; return the target index or -1.',
    starterCode: `def solve(data):
    nums = data["nums"]
    target = data["target"]
    low, high = 0, len(nums) - 1

    while low <= high:
        mid = low + (high - low) // 2
        # Compare nums[mid] and shrink the inclusive interval.
        pass

    return -1`,
    cases: {
      visibleExample: {
        input: { nums: [-5, 0, 4, 9, 13], target: 9 },
        expected: 3,
      },
      hiddenBoundary: {
        input: { nums: [], target: 7 },
        expected: -1,
      },
      hiddenAdversarial: {
        input: { nums: [2, 4, 6, 8, 10], target: 7 },
        expected: -1,
      },
    },
    diagram: {
      kind: 'binarySearch',
      values: [-5, 0, 4, 9, 13],
      low: 0,
      high: 4,
      mid: 2,
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(binarySearchMissionSeed)

export default problemLesson
