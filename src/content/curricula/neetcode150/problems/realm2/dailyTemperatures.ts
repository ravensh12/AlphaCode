import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const dailyTemperaturesMissionSeed = createRealm2MissionSeed({
  slug: 'daily-temperatures',
  estimatedMinutes: 21,
  mission: {
    title: 'The Greenhouse Warm-Day Board',
    context:
      'A school greenhouse records one temperature each morning. For every day, the gardeners want to know how many mornings pass before a strictly warmer reading appears.',
    prompt:
      'Return one wait count per reading. Use 0 for a day that never gets a warmer future reading.',
  },
  objective:
    'Resolve next-warmer waits in one pass with a decreasing stack of unresolved day indices.',
  priorKnowledge: [
    'An index remembers both a reading and its position.',
    'A stack exposes the newest unresolved day first.',
    'Strictly warmer means equal readings do not resolve each other.',
  ],
  recognitionCue:
    'Each position asks for the next later value that is strictly greater.',
  misconception:
    'Storing only temperatures loses the day index needed to calculate the waiting distance.',
  keyRule:
    'Keep unresolved indices whose temperatures decrease from bottom to top, and pop while the current reading is greater than the top reading.',
  algorithmSteps: [
    {
      id: 'open-waits',
      instruction: 'Create a zero-filled answer array and an empty index stack.',
    },
    {
      id: 'scan-reading',
      instruction: 'Scan temperatures from left to right with each day index.',
    },
    {
      id: 'resolve-colder-days',
      instruction:
        'While the current reading is warmer than the stack-top day, pop that day and store the index difference.',
    },
    {
      id: 'push-current-day',
      instruction: 'Push the current unresolved day index.',
    },
    {
      id: 'return-waits',
      instruction: 'Return the waits; untouched positions remain zero.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Every day index enters and leaves the stack at most once; an entirely decreasing forecast keeps all indices.',
  },
  explanationVisuals: {
    diagram: { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
  },
  workedExample: {
    prompt:
      'For [71, 70, 72, 69, 75], day 2 resolves days 1 and 0. Day 4 later resolves days 3 and 2.',
    code: [
      'waits = [0, 0, 0, 0, 0]',
      'stack after 71, 70 -> [day 0, day 1]',
      'read 72 -> waits[1] = 1, waits[0] = 2',
      'push day 2, then day 3',
      'read 75 -> waits[3] = 1, waits[2] = 2',
    ],
    currentLineIndex: 2,
    walkthrough: [
      '70 cannot help day 0 because it is cooler, so both days wait.',
      '72 is warmer than 70 and 71, resolving the stack top twice.',
      '69 waits above day 2 because it is cooler than 72.',
      '75 resolves both remaining colder days; day 4 stays at 0.',
    ],
    diagram: { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
    diagramSequence: [
      { kind: 'stack', items: ['day 0: 71'] },
      { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
      { kind: 'stack', items: [] },
      { kind: 'stack', items: ['day 2: 72', 'day 3: 69'] },
      { kind: 'stack', items: ['day 4: 75'] },
    ],
  },
  patternCheck: {
    prompt:
      'A new warm reading can settle several earlier days at once. Which structure keeps exactly the unresolved candidates?',
    options: [
      {
        id: 'decreasing-index-stack',
        label: 'A stack of indices with decreasing unresolved temperatures.',
      },
      {
        id: 'sorted-readings',
        label: 'A sorted list of temperatures with their dates removed.',
      },
      {
        id: 'running-maximum',
        label: 'One running maximum without unresolved day positions.',
      },
      {
        id: 'neighbor-only',
        label: 'Compare each day only with the next morning.',
      },
    ],
    correctOptionId: 'decreasing-index-stack',
    diagram: { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
  },
  retrievalCheck: {
    prompt:
      'What condition lets the current day pop and resolve the stack-top day?',
    acceptedAnswers: [
      'current temperature is greater than the top temperature',
      'the current reading is strictly warmer than the stack top',
      'temperatures[current] > temperatures[stack[-1]]',
      'the current temperature is greater than the top temperature',
      'current temperature > top temperature',
      'the current reading is warmer than the stack top',
      'current day is warmer than the stack top day',
    ],
    placeholder: 'Type the pop condition',
    diagram: { kind: 'stack', items: ['day 2: 72', 'day 3: 69'] },
  },
  reconstructionCheck: {
    prompt:
      'Put the warm-day scan in order: initialize, read a day, resolve colder tops, push the day, and return.',
    diagram: { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["temperatures"] and return each day’s distance to its next strictly warmer reading, or 0 when none exists.',
    starterCode: `def solve(data):
    temperatures = data["temperatures"]
    waits = [0] * len(temperatures)
    unresolved = []

    for day, temperature in enumerate(temperatures):
        # Resolve every colder day exposed at the stack top.
        pass

    return waits`,
    cases: {
      visibleExample: {
        input: { temperatures: [71, 70, 72, 69, 75] },
        expected: [2, 1, 2, 1, 0],
      },
      hiddenBoundary: {
        input: { temperatures: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: { temperatures: [90, 80, 70, 60] },
        expected: [0, 0, 0, 0],
      },
    },
    diagram: { kind: 'stack', items: ['day 0: 71', 'day 1: 70'] },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(dailyTemperaturesMissionSeed)

export default problemLesson
