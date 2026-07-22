import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const kokoEatingBananasMissionSeed = createRealm2MissionSeed({
  slug: 'koko-eating-bananas',
  estimatedMinutes: 23,
  mission: {
    title: 'The Moon-Monkey Snack Shift',
    context:
      'A moon-monkey has several snack bins and a limited number of hourly bells. During one hour it works on only one bin, eating up to a fixed number of snacks from that bin.',
    prompt:
      'Find the smallest positive eating speed that empties every bin within the available hours.',
  },
  objective:
    'Binary-search the smallest feasible integer rate using a monotonic time test.',
  priorKnowledge: [
    'A partially eaten bin still costs a whole hour.',
    'Faster rates never require more hours than slower rates.',
    'Binary search can locate a boundary in a true-or-false range.',
  ],
  recognitionCue:
    'The answer is a minimum numeric capacity, and testing a candidate splits all rates into too slow versus fast enough.',
  misconception:
    'Using ordinary division and rounding down undercounts the hour needed for a bin with leftovers.',
  keyRule:
    'Candidate speed s needs sum((pile + s - 1) // s) hours; if feasible, keep s and search left, otherwise search right.',
  algorithmSteps: [
    {
      id: 'set-speed-range',
      instruction: 'Set low speed to 1 and high speed to the largest pile.',
    },
    {
      id: 'choose-speed',
      instruction: 'Choose the midpoint candidate speed.',
    },
    {
      id: 'count-hours',
      instruction:
        'Add the ceiling of pile divided by speed, written (pile + speed - 1) // speed, for every pile.',
    },
    {
      id: 'keep-feasible-half',
      instruction:
        'If the hours fit, save the speed by moving high to mid; otherwise move low past mid.',
    },
    {
      id: 'return-minimum-speed',
      instruction: 'When low equals high, return that minimum feasible speed.',
    },
  ],
  complexity: {
    time: 'O(n log M)',
    space: 'O(1)',
    explanation:
      'Each feasibility test scans n piles, and binary search tests logarithmically many speeds up to maximum pile M.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      low: 1,
      high: 10,
      mid: 5,
    },
  },
  workedExample: {
    prompt:
      'For bins [3, 7, 11] and 8 hours, speed 6 needs 1 + 2 + 2 = 5 hours, so search slower. Speed 3 needs exactly 8 hours, while speed 2 needs 12.',
    code: [
      'speed 6 -> hours 1 + 2 + 2 = 5 (feasible)',
      'speed 3 -> hours 1 + 3 + 4 = 8 (feasible)',
      'speed 2 -> hours 2 + 4 + 6 = 12 (too slow)',
      'first feasible speed is 3',
    ],
    currentLineIndex: 1,
    walkthrough: [
      'Feasibility stays true for every speed above a feasible speed.',
      'The first test proves that the answer is no greater than 6.',
      'Speed 2 is on the false side of the boundary.',
      'Speed 3 is the smallest point on the true side.',
    ],
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      low: 2,
      high: 5,
      mid: 3,
    },
  },
  patternCheck: {
    prompt:
      'A candidate speed finishes early. How should a minimum-feasible-rate search update its range?',
    options: [
      {
        id: 'keep-mid-search-left',
        label: 'Keep mid as possible by setting high = mid and search slower.',
      },
      {
        id: 'discard-mid-search-right',
        label: 'Set low = mid + 1 because every faster speed is also feasible.',
      },
      {
        id: 'return-mid-now',
        label: 'Return mid immediately without checking slower rates.',
      },
      {
        id: 'change-piles',
        label: 'Sort and combine piles before testing another speed.',
      },
    ],
    correctOptionId: 'keep-mid-search-left',
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6, 7, 8],
      low: 0,
      high: 7,
      mid: 3,
    },
  },
  retrievalCheck: {
    prompt:
      'Write the integer formula for hours needed to finish one pile p at speed s.',
    acceptedAnswers: [
      '(p + s - 1) // s',
      'ceil(p / s)',
      'ceiling of p divided by s',
      '(p+s-1)//s',
      'ceil(p/s)',
      'math.ceil(p / s)',
      'math.ceil(p/s)',
      'the ceiling of p divided by s',
    ],
    placeholder: 'Type the ceiling formula',
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6],
      low: 0,
      high: 5,
      mid: 2,
    },
  },
  reconstructionCheck: {
    prompt:
      'Put the rate search in order from bounds and candidate through hour counting, feasibility update, and final speed.',
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6, 7],
      low: 1,
      high: 6,
      mid: 3,
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["piles"] and data["hours"]; return the smallest whole-number speed that finishes all nonempty piles on time.',
    starterCode: `def solve(data):
    piles = data["piles"]
    hours = data["hours"]
    low, high = 1, max(piles)

    while low < high:
        speed = low + (high - low) // 2
        needed = 0
        # Count whole hours, then keep the correct half of speeds.
        pass

    return low`,
    cases: {
      visibleExample: {
        input: { piles: [3, 7, 11], hours: 8 },
        expected: 3,
      },
      hiddenBoundary: {
        input: { piles: [1], hours: 1 },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { piles: [19, 8, 14, 3], hours: 6 },
        expected: 10,
      },
    },
    diagram: {
      kind: 'binarySearch',
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      low: 0,
      high: 9,
      mid: 4,
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(kokoEatingBananasMissionSeed)

export default problemLesson
