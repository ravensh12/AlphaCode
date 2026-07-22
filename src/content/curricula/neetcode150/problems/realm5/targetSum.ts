import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const targetSumMissionSeed = buildRealm5Mission({
  slug: 'target-sum',
  estimatedMinutes: 26,
  mission: {
    title: 'The Plus-Minus Control Panel',
    context:
      'A control panel lists nonnegative power values. An engineer must place either a plus sign or a minus sign before every value so the signed total reaches one requested level.',
    prompt:
      'Return the number of different sign assignments that produce the target total.',
  },
  objective:
    'Transform signed choices into a counted subset-sum goal and update one-use counts backward.',
  priorKnowledge: [
    'If P is the sum of plus-marked values and N is the sum of minus-marked values, then P + N is the total.',
    'Each listed position makes an independent sign choice, including positions containing zero.',
  ],
  recognitionCue:
    'Every nonnegative value receives one of two signs, and the task counts assignments reaching an exact total.',
  misconception:
    'Treating equal values or zeros as one shared choice undercounts assignments made at different positions.',
  algorithmSteps: [
    {
      id: 'check-target-feasibility',
      instruction:
        'Reject targets outside the total magnitude or whose total-plus-target parity is odd.',
    },
    {
      id: 'derive-positive-goal',
      instruction: 'Set the plus-marked subset goal to (total + target) / 2.',
    },
    {
      id: 'seed-empty-subset',
      instruction: 'Set ways[0] = 1 before processing values.',
    },
    {
      id: 'update-sums-backward',
      instruction:
        'For each value, scan sums downward and add ways[sum - value] into ways[sum].',
    },
    {
      id: 'return-goal-count',
      instruction: 'Return the number of subsets reaching the derived goal.',
    },
  ],
  complexity: {
    time: 'O(n × goal)',
    space: 'O(goal)',
    explanation:
      'Each position updates each possible plus-subset sum once, and one count row is stored.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [1, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0],
      [1, 1, 1, 1, 0, 0],
      [1, 1, 1, 2, 1, 1],
      [1, 1, 2, 3, 2, 3],
    ],
    rowLabels: ['start', 'after 2', 'after 1', 'after 3', 'after 2'],
    columnLabels: ['sum 0', 'sum 1', 'sum 2', 'sum 3', 'sum 4', 'sum 5'],
    highlightedCells: [{ row: 4, column: 5, label: '3 assignments' }],
    dependencyCells: [
      { row: 3, column: 3 },
      { row: 3, column: 5 },
    ],
  },
  workedExample: {
    prompt:
      'Values [2, 1, 3, 2] total 8 and target 2 create plus-subset goal 5. Three position-based subsets total 5, so three sign assignments work.',
    code: [
      'goal = (sum(values) + target) // 2',
      'ways = [1] + [0] * goal',
      'for value in values:',
      '    for total in range(goal, value - 1, -1):',
      '        ways[total] += ways[total - value]',
      'return ways[goal]',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The plus-marked values must total (8 + 2) / 2 = 5.',
      'The first 2, the second 2, and the other values are processed by position.',
      'Backward updates prevent a nonzero position from being reused.',
      'The final goal state contains 3 assignments.',
    ],
  },
  patternCheck: {
    prompt:
      'Which reduction turns every plus/minus assignment into a one-use counting problem?',
    correct:
      'Count subsets whose sum is (total + target) / 2, after feasibility checks.',
    distractors: [
      'Choose plus whenever the running total is below the target.',
      'Track only whether each sum is reachable, not how many ways reach it.',
      'Generate all 2^n sign strings and total each one.',
    ],
    hint: 'Add the equations P - N = target and P + N = total.',
  },
  retrievalCheck: {
    prompt:
      'What plus-subset goal follows from total S and requested target T?',
    acceptedAnswers: [
      '(S + T) / 2',
      '(S + T) // 2',
      '(S+T)/2',
      '(S+T)//2',
      '(total + target) // 2',
      '(total + target) / 2',
      '(total+target)/2',
      '(total+target)//2',
      'half of total plus target',
      'half of the total plus the target',
    ],
    placeholder: 'Type the transformed goal',
    hint: 'Solve 2P = S + T.',
  },
  reconstructionPrompt:
    'Order the sign-count reduction from parity checks through backward subset updates.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains values, a list of nonnegative integers, and target, an integer. Return the number of position-based plus/minus assignments reaching target.',
    starterCode: `def solve(data):
    values = data["values"]
    target = data["target"]
    total = sum(values)
    if abs(target) > total or (total + target) % 2 != 0:
        return 0

    goal = (total + target) // 2
    ways = [1] + [0] * goal
    for value in values:
        for subtotal in range(goal, value - 1, -1):
            # Count subsets that include this position.
            pass

    return ways[goal]`,
    cases: {
      visibleExample: {
        input: { values: [2, 1, 3, 2], target: 2 },
        expected: 3,
      },
      hiddenBoundary: {
        input: { values: [], target: 0 },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { values: [0, 0, 1], target: 1 },
        expected: 4,
      },
    },
    hints: [
      'Reject impossible magnitude and odd-parity goals.',
      'Scan subtotal downward for each position.',
      'Use ways[subtotal] += ways[subtotal - value]; zero then doubles every count.',
    ],
  },
})

export const problemLesson = createProblemMission(targetSumMissionSeed)

export default problemLesson
