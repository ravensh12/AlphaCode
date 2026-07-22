import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const medianOfTwoSortedArraysMissionSeed =
  createRealm2MissionSeed({
    slug: 'median-of-two-sorted-arrays',
    estimatedMinutes: 30,
    mission: {
      title: 'The Twin Scoreboard Balance',
      context:
        'Two school leagues keep separate score strips, each already sorted. The announcer needs the middle score of both leagues together without building and sorting one giant strip.',
      prompt:
        'Return the combined median. For an even total, return the average of the two middle values; at least one strip is nonempty.',
    },
    objective:
      'Find a balanced partition across two sorted arrays by binary-searching the shorter array.',
    priorKnowledge: [
      'A median splits sorted values into equal-sized left and right groups.',
      'Only the largest left value and smallest right value matter at a partition.',
      'Negative and positive infinity can represent missing edge values.',
    ],
    recognitionCue:
      'Two inputs are independently sorted, but the answer depends only on their combined middle boundary.',
    misconception:
      'Binary-searching both arrays independently for one target does not enforce equal combined partition sizes.',
    keyRule:
      'Choose cuts i and j with i + j = total // 2; the partition is valid when leftA <= rightB and leftB <= rightA.',
    algorithmSteps: [
      {
        id: 'choose-shorter-array',
        instruction: 'Call the shorter array A and the other array B.',
      },
      {
        id: 'search-cut-range',
        instruction: 'Binary-search cut i from 0 through len(A).',
      },
      {
        id: 'balance-other-cut',
        instruction: 'Set cut j to total // 2 - i.',
      },
      {
        id: 'read-boundary-values',
        instruction:
          'Read values beside both cuts, using infinities beyond array edges.',
      },
      {
        id: 'move-invalid-cut',
        instruction:
          'Move i left if leftA > rightB, or right if leftB > rightA.',
      },
      {
        id: 'compute-median',
        instruction:
          'At a valid partition, use the smallest right value for odd total or average the inner boundaries for even total.',
      },
    ],
    complexity: {
      time: 'O(log min(m, n))',
      space: 'O(1)',
      explanation:
        'Only cut positions in the shorter array are searched, and each check reads a constant number of boundary values.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'binarySearch',
        values: [1, 4],
        low: 0,
        high: 1,
        mid: 1,
      },
    },
    workedExample: {
      prompt:
        'For A=[1,4] and B=[2,3,8,9], cuts after 1 in A and after 3 in B make left values {1,2,3} and right values {4,8,9}. The inner values are 3 and 4.',
      code: [
        'total = 6, left size = 3',
        'i = 1 in A, j = 2 in B',
        'leftA = 1, rightA = 4',
        'leftB = 3, rightB = 8',
        'valid -> median = (max(1,3) + min(4,8)) / 2 = 3.5',
      ],
      currentLineIndex: 4,
      walkthrough: [
        'The cuts place exactly three combined values on the left.',
        'Both cross inequalities hold: 1 <= 8 and 3 <= 4.',
        'Thus every left-side value is no greater than every right-side value.',
        'An even total averages the greatest left value 3 and smallest right value 4.',
      ],
      diagram: {
        kind: 'binarySearch',
        values: [1, 4],
        low: 1,
        high: 1,
        mid: 1,
      },
      diagramSequence: [
        {
          kind: 'binarySearch',
          values: [1, 4],
          low: 0,
          high: 1,
          mid: 1,
        },
        {
          kind: 'binarySearch',
          values: [1, 4],
          low: 1,
          high: 1,
          mid: 1,
        },
      ],
    },
    patternCheck: {
      prompt:
        'Which condition proves that two balanced cuts form one correctly ordered combined split?',
      options: [
        {
          id: 'cross-boundaries-valid',
          label: 'leftA <= rightB and leftB <= rightA.',
        },
        {
          id: 'equal-cut-indices',
          label: 'The two cut indices are numerically equal.',
        },
        {
          id: 'same-boundary-values',
          label: 'The values beside both cuts are all identical.',
        },
        {
          id: 'shorter-left-only',
          label: 'Only leftA <= rightA; the other array does not matter.',
        },
      ],
      correctOptionId: 'cross-boundaries-valid',
      diagram: {
        kind: 'binarySearch',
        values: [1, 4],
        low: 0,
        high: 1,
        mid: 1,
      },
    },
    retrievalCheck: {
      prompt:
        'If the first cut is i and the combined left side needs total // 2 values, what is the second cut j?',
      acceptedAnswers: [
        'total // 2 - i',
        'j = total // 2 - i',
        'half minus i',
        'total//2 - i',
        'total//2-i',
        'half - i',
        'j = half - i',
      ],
      placeholder: 'Type the second-cut formula',
      diagram: {
        kind: 'binarySearch',
        values: [1, 4],
        low: 0,
        high: 1,
        mid: 1,
      },
    },
    reconstructionCheck: {
      prompt:
        'Rebuild the partition search from choosing the shorter strip through balanced cuts, cross checks, movement, and median calculation.',
      diagram: {
        kind: 'binarySearch',
        values: [-4, 3],
        low: 0,
        high: 1,
        mid: 1,
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read sorted arrays data["a"] and data["b"]; return their combined median as a JSON number without merging the full arrays.',
      starterCode: `def solve(data):
    a, b = data["a"], data["b"]
    if len(a) > len(b):
        a, b = b, a

    total = len(a) + len(b)
    half = total // 2
    low, high = 0, len(a)

    while low <= high:
        cut_a = low + (high - low) // 2
        cut_b = half - cut_a
        # Read four partition boundaries, move the cut, or return median.
        pass

    raise ValueError("valid sorted inputs always have a partition")`,
      cases: {
        visibleExample: {
          input: { a: [1, 4], b: [2, 3, 8, 9] },
          expected: 3.5,
        },
        hiddenBoundary: {
          input: { a: [], b: [4, 8] },
          expected: 6,
        },
        hiddenAdversarial: {
          input: { a: [-10, -4, 3], b: [-7, -2, 6, 12] },
          expected: -2,
        },
      },
      diagram: {
        kind: 'binarySearch',
        values: [1, 4],
        low: 0,
        high: 1,
        mid: 1,
      },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  medianOfTwoSortedArraysMissionSeed,
)

export default problemLesson
