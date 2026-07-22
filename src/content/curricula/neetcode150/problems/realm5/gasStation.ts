import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const gasStationMissionSeed = buildRealm5Mission({
  slug: 'gas-station',
  estimatedMinutes: 22,
  mission: {
    title: 'The Circular Fuel Relay',
    context:
      'A delivery rover circles a ring of depots. At depot i it gains fuel[i] units, then spends cost[i] units to reach the next depot.',
    prompt:
      'Return a depot index from which an empty-tank rover can complete one clockwise circuit, or -1 if no start works.',
  },
  objective:
    'Use total fuel balance for feasibility and reset the candidate start after any negative running balance.',
  priorKnowledge: [
    'A full circuit is possible only when total fuel is at least total travel cost.',
    'If a candidate fails at one edge, starts after it may still work.',
  ],
  recognitionCue:
    'Resources and costs repeat around a circle, and the task asks for a feasible starting point.',
  misconception:
    'Choosing the depot with the most fuel ignores the travel cost before later depots.',
  algorithmSteps: [
    {
      id: 'start-first-candidate',
      instruction: 'Initialize candidate start, running tank, and total balance to zero.',
    },
    {
      id: 'scan-depot-differences',
      instruction: 'For each depot, add fuel minus cost to both balances.',
    },
    {
      id: 'detect-failed-segment',
      instruction: 'When the running tank becomes negative, reject the current segment.',
    },
    {
      id: 'reset-after-failure',
      instruction: 'Move the candidate to the next depot and reset the running tank.',
    },
    {
      id: 'return-feasible-candidate',
      instruction: 'Return the candidate if total balance is nonnegative; otherwise return -1.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'One scan updates a few balances, and failed starts are skipped in groups.',
  },
  diagram: {
    kind: 'grid',
    variant: 'grid',
    cells: [
      [4, 1, 2, 6],
      [3, 2, 5, 2],
      [1, -1, -3, 4],
      [1, 0, 'reset', 4],
    ],
    rowLabels: ['fuel', 'cost', 'net', 'candidate tank'],
    columnLabels: ['depot 0', 'depot 1', 'depot 2', 'depot 3'],
    highlightedCells: [{ row: 3, column: 2, label: 'start becomes 3' }],
  },
  workedExample: {
    prompt:
      'Fuel [4, 1, 2, 6] and costs [3, 2, 5, 2] have net values [1, -1, -3, 4]. The candidate from 0 fails at depot 2, so depot 3 becomes the valid start.',
    code: [
      'start = tank = total = 0',
      'for i in range(4):',
      '    gain = fuel[i] - cost[i]',
      '    tank += gain; total += gain',
      '    if tank < 0:',
      '        start, tank = i + 1, 0',
      'return start if total >= 0 else -1',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'The candidate starting at 0 has tank balances 1, then 0.',
      'At depot 2 the tank becomes -3, so that candidate segment cannot cross the edge.',
      'Resetting to depot 3 starts with net fuel 4.',
      'The total balance is 1, so depot 3 can complete the ring.',
    ],
  },
  patternCheck: {
    prompt:
      'Why can the scan skip every start inside a segment whose running tank just became negative?',
    correct:
      'Those later starts lose the earlier segment’s nonnegative help and still face the same failing edge.',
    distractors: [
      'The depot after a failure always has the largest fuel value.',
      'Only the total balance matters, so any index can be returned.',
      'Try a full simulation from every depot.',
    ],
    hint: 'Before failure, each prefix from the candidate had nonnegative balance.',
  },
  retrievalCheck: {
    prompt:
      'What two actions occur immediately when the candidate tank drops below zero at index i?',
    acceptedAnswers: [
      'set start to i + 1 and reset tank to 0',
      'start = i + 1; tank = 0',
      'start = i + 1 and tank = 0',
      'start = i+1; tank = 0',
      'start = i+1 and tank = 0',
      'start = index + 1; tank = 0',
      'start = index + 1 and tank = 0',
      'start = index+1 and tank = 0',
      'set start to index + 1 and reset tank to 0',
      'set start to i+1 and reset tank to zero',
      'move the start to the next depot and reset the tank',
      'move the candidate after i and clear the running balance',
      'move start to i+1 and reset tank to 0',
      'move start to i + 1 and reset tank to 0',
    ],
    placeholder: 'Type the reset rule',
    hint: 'The failed segment cannot contain a valid start.',
  },
  reconstructionPrompt:
    'Order the circular balance scan from accumulation through segment reset and final feasibility.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains equal-length nonempty fuel and cost lists. Return a valid clockwise starting index for an empty tank, or -1.',
    starterCode: `def solve(data):
    fuel = data["fuel"]
    cost = data["cost"]
    start = 0
    tank = 0
    total = 0

    for index in range(len(fuel)):
        gain = fuel[index] - cost[index]
        total += gain
        tank += gain
        if tank < 0:
            # Reject this whole candidate segment.
            pass

    return start if total >= 0 else -1`,
    cases: {
      visibleExample: {
        input: { fuel: [4, 1, 2, 6], cost: [3, 2, 5, 2] },
        expected: 3,
      },
      hiddenBoundary: {
        input: { fuel: [5], cost: [5] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { fuel: [2, 2, 2], cost: [3, 1, 3] },
        expected: -1,
      },
    },
    hints: [
      'When tank < 0, set start = index + 1.',
      'Reset tank to zero after moving the candidate.',
      'Only a nonnegative total balance permits a full circuit.',
    ],
  },
})

export const problemLesson = createProblemMission(gasStationMissionSeed)

export default problemLesson
