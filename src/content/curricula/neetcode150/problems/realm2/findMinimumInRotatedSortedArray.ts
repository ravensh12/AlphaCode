import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const findMinimumInRotatedSortedArrayMissionSeed =
  createRealm2MissionSeed({
    slug: 'find-minimum-in-rotated-sorted-array',
    estimatedMinutes: 20,
    mission: {
      title: 'The Rotated Supply Carousel',
      context:
        'Distinct supply codes were sorted on a circular belt, then the belt stopped after an unknown rotation. The smallest code marks the point where the sorted order wraps.',
      prompt:
        'Return the smallest code from the nonempty rotated array. The belt may have stopped without rotating at all.',
    },
    objective:
      'Find the rotation boundary in logarithmic time by comparing the midpoint with the right endpoint.',
    priorKnowledge: [
      'The array contains distinct values.',
      'A rotated sorted array has one low-value segment after one high-value segment.',
      'The minimum is the first value in the low segment.',
    ],
    recognitionCue:
      'A sorted sequence has one wrap point, and the task asks for the boundary value rather than an arbitrary target.',
    misconception:
      'Comparing only with the first value can be awkward once the search interval no longer includes the original first index.',
    keyRule:
      'With low < high, nums[mid] > nums[high] puts the minimum strictly right of mid; otherwise the minimum is at mid or left, so keep mid.',
    algorithmSteps: [
      {
        id: 'set-rotation-bounds',
        instruction: 'Set low to 0 and high to the final index.',
      },
      {
        id: 'search-until-one',
        instruction: 'Repeat while low is less than high.',
      },
      {
        id: 'choose-rotation-middle',
        instruction: 'Choose the midpoint of the current interval.',
      },
      {
        id: 'compare-right-end',
        instruction:
          'If nums[mid] is greater than nums[high], move low to mid + 1.',
      },
      {
        id: 'keep-middle-left',
        instruction: 'Otherwise move high to mid, keeping mid as a candidate.',
      },
      {
        id: 'return-boundary',
        instruction: 'Return nums[low] when the bounds meet.',
      },
    ],
    complexity: {
      time: 'O(log n)',
      space: 'O(1)',
      explanation:
        'Each endpoint comparison discards about half of the remaining rotation candidates while storing constant state.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'binarySearch',
        values: [12, 15, 2, 4, 8],
        low: 0,
        high: 4,
        mid: 2,
      },
    },
    workedExample: {
      prompt:
        'For [12, 15, 2, 4, 8], midpoint value 2 is below the right value 8, so the minimum could be 2 or lie left. Keeping mid eventually isolates index 2.',
      code: [
        'low = 0, high = 4, mid = 2',
        'nums[mid] = 2 <= nums[high] = 8',
        'high = mid = 2',
        'next mid value 15 > right value 2',
        'low moves to 2 -> return 2',
      ],
      currentLineIndex: 2,
      walkthrough: [
        'A midpoint below the right endpoint lies in the low sorted segment.',
        'That midpoint might itself be the minimum, so it cannot be discarded.',
        'The next comparison identifies the high segment ending at index 1.',
        'Both bounds meet at the wrap point containing 2.',
      ],
      diagram: {
        kind: 'binarySearch',
        values: [12, 15, 2, 4, 8],
        low: 0,
        high: 2,
        mid: 1,
      },
      diagramSequence: [
        {
          kind: 'binarySearch',
          values: [12, 15, 2, 4, 8],
          low: 0,
          high: 4,
          mid: 2,
        },
        {
          kind: 'binarySearch',
          values: [12, 15, 2, 4, 8],
          low: 0,
          high: 2,
          mid: 1,
        },
        {
          kind: 'binarySearch',
          values: [12, 15, 2, 4, 8],
          low: 2,
          high: 2,
          mid: 2,
        },
      ],
    },
    patternCheck: {
      prompt:
        'The midpoint is greater than the current right endpoint. Where must the minimum be?',
      options: [
        {
          id: 'strictly-right',
          label: 'Strictly to the right of mid, after the wrap.',
        },
        {
          id: 'at-mid',
          label: 'Exactly at mid because mid is large.',
        },
        {
          id: 'strictly-left',
          label: 'Strictly left of mid in the larger-value segment.',
        },
        {
          id: 'anywhere',
          label: 'Anywhere; the comparison gives no information.',
        },
      ],
      correctOptionId: 'strictly-right',
      diagram: {
        kind: 'binarySearch',
        values: [12, 15, 2, 4, 8],
        low: 0,
        high: 2,
        mid: 1,
      },
    },
    retrievalCheck: {
      prompt:
        'Why does the smaller-or-equal branch set high = mid instead of mid - 1?',
      acceptedAnswers: [
        'mid might be the minimum',
        'the midpoint is still a candidate',
        'we must keep mid because it could be the rotation point',
        'mid could be the minimum',
        'mid may be the minimum',
        'mid can be the minimum',
        'mid might still be the minimum',
        'mid could still be the minimum',
        'mid is still a candidate',
        'the minimum could be at mid',
        'the minimum might be at mid',
      ],
      placeholder: 'Type why mid stays',
      diagram: {
        kind: 'binarySearch',
        values: [12, 15, 2, 4, 8],
        low: 0,
        high: 4,
        mid: 2,
      },
    },
    reconstructionCheck: {
      prompt:
        'Order the rotation-boundary search from endpoints through right comparison, candidate-preserving updates, and return.',
      diagram: {
        kind: 'binarySearch',
        values: [9, 13, 18, 1, 4],
        low: 0,
        high: 4,
        mid: 2,
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read nonempty, distinct data["nums"] and return its minimum after any rotation.',
      starterCode: `def solve(data):
    nums = data["nums"]
    low, high = 0, len(nums) - 1

    while low < high:
        mid = low + (high - low) // 2
        # Use nums[high] to decide which side still holds the minimum.
        pass

    return nums[low]`,
      cases: {
        visibleExample: {
          input: { nums: [12, 15, 2, 4, 8] },
          expected: 2,
        },
        hiddenBoundary: {
          input: { nums: [7] },
          expected: 7,
        },
        hiddenAdversarial: {
          input: { nums: [-3, 0, 5, 9] },
          expected: -3,
        },
      },
      diagram: {
        kind: 'binarySearch',
        values: [12, 15, 2, 4, 8],
        low: 0,
        high: 4,
        mid: 2,
      },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  findMinimumInRotatedSortedArrayMissionSeed,
)

export default problemLesson
