import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const carFleetMissionSeed = createRealm2MissionSeed({
  slug: 'car-fleet',
  estimatedMinutes: 23,
  mission: {
    title: 'The Moonbase Rover Convoys',
    context:
      'Rovers travel along one narrow moon road toward a supply base. A rover may catch a slower rover ahead, but it cannot pass, so the two continue as one convoy.',
    prompt:
      'Given the base position and each rover’s starting position and constant speed, count how many separate convoys arrive. Rovers meeting exactly at the base count together.',
  },
  objective:
    'Count final convoys by scanning rovers from nearest to farthest and comparing their solo arrival times.',
  priorKnowledge: [
    'Travel time equals remaining distance divided by speed.',
    'A rover cannot pass another rover ahead of it.',
    'Sorting by position can reveal road order.',
  ],
  recognitionCue:
    'Moving objects share one lane, faster objects merge into slower objects ahead, and only final groups matter.',
  misconception:
    'Comparing neighboring speeds is not enough; starting distances determine whether and when a catch happens.',
  keyRule:
    'After sorting positions descending, a rover forms a new fleet only when its solo arrival time is greater than the latest fleet time ahead; equal or smaller times merge.',
  algorithmSteps: [
    {
      id: 'pair-rovers',
      instruction: 'Pair each starting position with its speed.',
    },
    {
      id: 'sort-nearest-first',
      instruction: 'Sort rover pairs by position from nearest base to farthest.',
    },
    {
      id: 'compute-arrival',
      instruction:
        'For each pair, compute solo arrival time (target - position) / speed.',
    },
    {
      id: 'compare-fleet-time',
      instruction:
        'Push a new fleet time only if it is greater than the fleet time on top.',
    },
    {
      id: 'count-fleets',
      instruction: 'Return the number of stored fleet times.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'Sorting dominates the scan. In the clearest stack version, up to n distinct fleet arrival times are stored.',
  },
  explanationVisuals: {
    diagram: { kind: 'stack', items: ['front fleet: 5.0', 'rear fleet: 8.3'] },
  },
  workedExample: {
    prompt:
      'A base sits at 25. Rovers at 20, 10, and 0 with speeds 1, 5, and 3 have solo times 5, 3, and about 8.3. The middle rover catches the front fleet; the far rover arrives later alone.',
    code: [
      'nearest rover time = (25 - 20) / 1 = 5',
      'middle rover time = (25 - 10) / 5 = 3',
      '3 <= 5, so it joins the fleet ahead',
      'far rover time = (25 - 0) / 3 = 8.33',
      '8.33 > 5, so it creates another fleet',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The nearest rover sets the first fleet arrival time at 5.',
      'The middle rover would arrive sooner alone, so it must catch the rover ahead.',
      'Its solo time is discarded because the merged fleet still arrives at time 5.',
      'The far rover cannot reach that fleet before the base, producing fleet two.',
    ],
    diagram: { kind: 'stack', items: ['arrival 5.0', 'arrival 8.3'] },
    diagramSequence: [
      { kind: 'stack', items: ['arrival 5.0'] },
      { kind: 'stack', items: ['arrival 5.0'] },
      { kind: 'stack', items: ['arrival 5.0', 'arrival 8.3'] },
    ],
  },
  patternCheck: {
    prompt:
      'After road-order sorting, a rear rover’s solo arrival time is smaller than the fleet time ahead. What happens?',
    options: [
      {
        id: 'merge-ahead',
        label: 'It catches the fleet ahead, so no new fleet time is added.',
      },
      {
        id: 'new-fleet',
        label: 'It creates a new fleet because its speed is different.',
      },
      {
        id: 'replace-front-time',
        label: 'It replaces the front fleet time with its faster time.',
      },
      {
        id: 'compare-start-only',
        label: 'Its arrival time is ignored and only positions are compared.',
      },
    ],
    correctOptionId: 'merge-ahead',
    diagram: { kind: 'stack', items: ['front time 5.0'] },
  },
  retrievalCheck: {
    prompt:
      'When scanning nearest to farthest, what arrival-time condition creates a new fleet?',
    acceptedAnswers: [
      'current time is greater than the top fleet time',
      'arrival time > stack[-1]',
      'the rear rover arrives later than the fleet ahead',
      'arrival time is greater than the top fleet time',
      'its solo arrival time is greater than the fleet time ahead',
      'arrival time greater than the fleet time on top',
      'arrival > top fleet time',
    ],
    placeholder: 'Type the new-fleet condition',
    diagram: { kind: 'stack', items: ['front time 5.0', 'rear time 8.3'] },
  },
  reconstructionCheck: {
    prompt:
      'Order the convoy counter from pairing and sorting through time comparison and fleet count.',
    diagram: { kind: 'stack', items: ['time 5.0', 'time 8.3'] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read target, position, and speed. Return the number of rover fleets that reach target; empty arrays represent no rovers.',
    starterCode: `def solve(data):
    target = data["target"]
    rovers = list(zip(data["position"], data["speed"]))
    fleets = []

    for position, speed in sorted(rovers, reverse=True):
        arrival = (target - position) / speed
        # Decide whether this rover joins the fleet ahead.
        pass

    return len(fleets)`,
    cases: {
      visibleExample: {
        input: {
          target: 25,
          position: [20, 10, 0],
          speed: [1, 5, 3],
        },
        expected: 2,
      },
      hiddenBoundary: {
        input: { target: 10, position: [], speed: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          target: 12,
          position: [6, 0, 3],
          speed: [2, 4, 3],
        },
        expected: 1,
      },
    },
    diagram: { kind: 'stack', items: ['arrival 3.0'] },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(carFleetMissionSeed)

export default problemLesson
