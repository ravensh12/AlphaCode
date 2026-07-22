import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const searchInRotatedSortedArrayMissionSeed =
  createRealm2MissionSeed({
    slug: 'search-in-rotated-sorted-array',
    estimatedMinutes: 23,
    mission: {
      title: 'The Carousel Crate Locator',
      context:
        'Distinct numbered crates were arranged in increasing order before their circular platform turned. A courier needs the current slot of one requested crate.',
      prompt:
        'Return the requested crate’s index in the rotated array, or -1 if the crate is not present.',
    },
    objective:
      'Binary-search a rotated array by identifying the sorted half at every midpoint.',
    priorKnowledge: [
      'A rotated distinct array contains two increasing segments.',
      'At least one side of any midpoint is normally sorted.',
      'A target can be tested against the endpoints of a sorted interval.',
    ],
    recognitionCue:
      'The data is sorted except for one wrap, and an exact target index is required.',
    misconception:
      'Choosing a side from target versus midpoint alone ignores the rotation and can discard the target’s sorted segment.',
    keyRule:
      'Identify the sorted half first, then keep it only when the target lies within its inclusive value range; otherwise search the other half.',
    algorithmSteps: [
      {
        id: 'set-target-bounds',
        instruction: 'Set inclusive low and high bounds around the array.',
      },
      {
        id: 'choose-target-middle',
        instruction: 'Choose mid and return it if nums[mid] is the target.',
      },
      {
        id: 'identify-sorted-half',
        instruction:
          'Use nums[low] <= nums[mid] to decide whether the left half is sorted.',
      },
      {
        id: 'test-target-range',
        instruction:
          'Test whether the target lies inside the sorted half’s endpoint values.',
      },
      {
        id: 'keep-correct-half',
        instruction:
          'Keep the sorted half when it contains the target; otherwise keep the opposite half.',
      },
      {
        id: 'return-not-found',
        instruction: 'Return -1 when the candidate interval empties.',
      },
    ],
    complexity: {
      time: 'O(log n)',
      space: 'O(1)',
      explanation:
        'With distinct values, each iteration identifies a sorted half and removes half the candidate indices using constant state.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'binarySearch',
        values: [9, 12, 15, 2, 4, 6],
        low: 0,
        high: 5,
        mid: 2,
      },
    },
    workedExample: {
      prompt:
        'Search [9, 12, 15, 2, 4, 6] for 4. At midpoint 15, the left half is sorted but cannot contain 4, so the search moves right and finds index 4.',
      code: [
        'low = 0, high = 5, mid = 2, value = 15',
        'left range [9, 15] is sorted',
        'target 4 is outside [9, 15], so low = 3',
        'new mid = 4, value = 4',
        'return 4',
      ],
      currentLineIndex: 2,
      walkthrough: [
        'The comparison nums[low] <= nums[mid] proves the left side is ordered.',
        'Because 4 is below that side’s smallest value, it cannot be there.',
        'Indices 0 through 2 are safely discarded.',
        'The next midpoint lands on the requested crate.',
      ],
      diagram: {
        kind: 'binarySearch',
        values: [9, 12, 15, 2, 4, 6],
        low: 3,
        high: 5,
        mid: 4,
      },
      diagramSequence: [
        {
          kind: 'binarySearch',
          values: [9, 12, 15, 2, 4, 6],
          low: 0,
          high: 5,
          mid: 2,
        },
        {
          kind: 'binarySearch',
          values: [9, 12, 15, 2, 4, 6],
          low: 3,
          high: 5,
          mid: 4,
        },
      ],
    },
    patternCheck: {
      prompt:
        'The left half is sorted, but the target is outside its endpoint values. Which side remains possible?',
      options: [
        {
          id: 'search-right-half',
          label: 'Discard mid and the left half; search to the right.',
        },
        {
          id: 'search-left-anyway',
          label: 'Search left because sorted halves always contain the target.',
        },
        {
          id: 'restart-at-rotation',
          label: 'Restart a linear scan from index zero.',
        },
        {
          id: 'sort-array',
          label: 'Sort the array and return the index from the new order.',
        },
      ],
      correctOptionId: 'search-right-half',
      diagram: {
        kind: 'binarySearch',
        values: [9, 12, 15, 2, 4, 6],
        low: 0,
        high: 5,
        mid: 2,
      },
    },
    retrievalCheck: {
      prompt:
        'What comparison identifies a sorted left half when values are distinct?',
      acceptedAnswers: [
        'nums[low] <= nums[mid]',
        'the low value is less than or equal to the middle value',
        'nums at low <= nums at mid',
        'nums[low]<=nums[mid]',
        'nums[low] is less than or equal to nums[mid]',
        'the low value is at most the middle value',
      ],
      placeholder: 'Type the sorted-left check',
      diagram: {
        kind: 'binarySearch',
        values: [9, 12, 15, 2, 4, 6],
        low: 0,
        high: 5,
        mid: 2,
      },
    },
    reconstructionCheck: {
      prompt:
        'Restore the locator from bounds and midpoint through sorted-half detection, target-range testing, and the missing result.',
      diagram: {
        kind: 'binarySearch',
        values: [30, 35, 2, 5, 9, 14, 20],
        low: 0,
        high: 6,
        mid: 3,
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read distinct, rotated data["nums"] and data["target"]; return the original index or -1.',
      starterCode: `def solve(data):
    nums = data["nums"]
    target = data["target"]
    low, high = 0, len(nums) - 1

    while low <= high:
        mid = low + (high - low) // 2
        # Find the sorted half, then keep the half that can contain target.
        pass

    return -1`,
      cases: {
        visibleExample: {
          input: { nums: [9, 12, 15, 2, 4, 6], target: 4 },
          expected: 4,
        },
        hiddenBoundary: {
          input: { nums: [5], target: 3 },
          expected: -1,
        },
        hiddenAdversarial: {
          input: { nums: [30, 35, 2, 5, 9, 14, 20], target: 8 },
          expected: -1,
        },
      },
      diagram: {
        kind: 'binarySearch',
        values: [9, 12, 15, 2, 4, 6],
        low: 0,
        high: 5,
        mid: 2,
      },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  searchInRotatedSortedArrayMissionSeed,
)

export default problemLesson
