import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const houseRobberMissionSeed = buildRealm5Mission({
  slug: 'house-robber',
  estimatedMinutes: 21,
  mission: {
    title: 'The Sleeping Sensor Lockers',
    context:
      'A courier moves past a straight row of supply lockers. Opening two neighboring lockers wakes a shared motion sensor, but non-neighboring lockers can be opened safely.',
    prompt:
      'Given the credits stored in each locker, return the greatest total the courier can collect without opening adjacent lockers.',
  },
  objective:
    'Use a take-or-skip recurrence that compares taking the current value with keeping the best earlier total.',
  priorKnowledge: [
    'Taking one locker forbids only its immediate neighbor.',
    'A prefix optimum can summarize every valid choice made earlier.',
  ],
  recognitionCue:
    'Each item offers a take-or-skip choice, and taking it conflicts with the immediately previous item.',
  misconception:
    'Always taking the larger value in each neighboring pair can make two chosen lockers adjacent or block a better later combination.',
  algorithmSteps: [
    {
      id: 'open-empty-prefix',
      instruction: 'Initialize the best totals for the empty prefix and prior prefix to zero.',
    },
    {
      id: 'read-locker',
      instruction: 'Process locker values from left to right.',
    },
    {
      id: 'compare-take-skip',
      instruction:
        'Compare skipping the locker with taking it plus the best total from two positions back.',
    },
    {
      id: 'shift-prefix-totals',
      instruction: 'Shift the rolling prefix totals to include the current locker.',
    },
    {
      id: 'return-best-prefix',
      instruction: 'Return the best total for the full row.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each locker causes one take-versus-skip comparison, stored in two rolling totals.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [4, 9, 5, 8, 2],
      [4, 9, 9, 17, 17],
    ],
    rowLabels: ['locker', 'best prefix'],
    columnLabels: ['0', '1', '2', '3', '4'],
    highlightedCells: [{ row: 1, column: 3, label: 'take 8' }],
    dependencyCells: [
      { row: 1, column: 1 },
      { row: 1, column: 2 },
    ],
  },
  workedExample: {
    prompt:
      'For lockers [4, 9, 5, 8, 2], the prefix totals become 4, 9, 9, 17, 17. Taking lockers worth 9 and 8 gives the best safe total, 17.',
    code: [
      'two_back, one_back = 0, 0',
      'for credits in [4, 9, 5, 8, 2]:',
      '    current = max(one_back, two_back + credits)',
      '    two_back, one_back = one_back, current',
      'return one_back',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'At 4, taking beats skipping, so the best total is 4.',
      'At 9, taking 9 beats keeping 4.',
      'At 5, both valid choices stay at or below 9.',
      'At 8, 9 + 8 raises the best total to 17; the final 2 cannot improve it.',
    ],
  },
  patternCheck: {
    prompt:
      'Which comparison correctly handles every locker while preserving the no-neighbors rule?',
    correct:
      'Compare the best total without this locker against its value plus the total from two lockers back.',
    distractors: [
      'Compare only the current value with the value immediately before it.',
      'Add every positive locker and remove conflicts after the scan.',
      'Try every subset of lockers and test adjacency at the end.',
    ],
    hint: 'Taking the current locker is compatible with the prefix ending two positions earlier.',
  },
  retrievalCheck: {
    prompt:
      'Complete the rolling recurrence: current = max(one_back, ______).',
    acceptedAnswers: [
      'two_back + credits',
      'two_back+credits',
      'credits + two_back',
      'two_back + value',
      'two_back+value',
      'value + two_back',
      'two_back + current locker',
      'the best two positions back plus the current value',
    ],
    placeholder: 'Type the take case',
    hint: 'The skip case is one_back; the take case must avoid the neighbor.',
  },
  reconstructionPrompt:
    'Restore the take-or-skip locker scan in the order that preserves both rolling totals.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains credits, a list of nonnegative locker values. Return the maximum sum from a set of nonadjacent positions.',
    starterCode: `def solve(data):
    credits = data["credits"]
    two_back, one_back = 0, 0

    for value in credits:
        # Compare skipping with taking this value.
        pass

    return one_back`,
    cases: {
      visibleExample: { input: { credits: [4, 9, 5, 8, 2] }, expected: 17 },
      hiddenBoundary: { input: { credits: [] }, expected: 0 },
      hiddenAdversarial: {
        input: { credits: [10, 1, 1, 10, 1, 10] },
        expected: 30,
      },
    },
    hints: [
      'Let one_back be the best total for the processed prefix.',
      'Compute current = max(one_back, two_back + value).',
      'Shift two_back and one_back together after each comparison.',
    ],
  },
})

export const problemLesson = createProblemMission(houseRobberMissionSeed)

export default problemLesson
