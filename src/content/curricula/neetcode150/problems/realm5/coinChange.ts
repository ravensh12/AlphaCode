import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const coinChangeMissionSeed = buildRealm5Mission({
  slug: 'coin-change',
  estimatedMinutes: 23,
  mission: {
    title: 'The Token Dock Budget',
    context:
      'A cargo dock accepts reusable token values. A payment may use any token value as many times as needed, but the clerk wants to handle as few tokens as possible.',
    prompt:
      'Given the available token values and an exact charge, return the minimum token count, or -1 when the charge cannot be formed.',
  },
  objective:
    'Build minimum counts from amount zero upward by extending reachable smaller amounts.',
  priorKnowledge: [
    'Amount zero needs zero tokens.',
    'Using one token of value c connects amount a - c to amount a.',
  ],
  recognitionCue:
    'Unlimited reusable choices must form an exact total while minimizing the number chosen.',
  misconception:
    'Repeatedly taking the largest token is not always optimal when token values are arbitrary.',
  algorithmSteps: [
    {
      id: 'fill-unreachable-costs',
      instruction: 'Create a table filled with an unreachable marker and set best[0] = 0.',
    },
    {
      id: 'scan-target-amounts',
      instruction: 'Process amounts from 1 through the charge.',
    },
    {
      id: 'try-fitting-tokens',
      instruction: 'For each token that fits, inspect the state at amount minus that token.',
    },
    {
      id: 'keep-fewest-tokens',
      instruction: 'Set the amount state to the smallest reachable predecessor plus one.',
    },
    {
      id: 'return-count-or-failure',
      instruction: 'Return the target state, or -1 if it remains unreachable.',
    },
  ],
  complexity: {
    time: 'O(amount × k)',
    space: 'O(amount)',
    explanation:
      'Each of k token values is tested for every amount, and one table entry is stored per amount.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [[0, 1, 2, 3, 1, 2, 1, 2, 2]],
    rowLabels: ['fewest tokens'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
    highlightedCells: [{ row: 0, column: 8, label: '4 + 4' }],
    dependencyCells: [
      { row: 0, column: 2 },
      { row: 0, column: 4 },
      { row: 0, column: 7 },
    ],
  },
  workedExample: {
    prompt:
      'With token values [1, 4, 6] and charge 8, the state for 8 checks amounts 7, 4, and 2. Extending amount 4 with another 4 gives the minimum, 2.',
    code: [
      'best = [0] + [float("inf")] * 8',
      'for amount in range(1, 9):',
      '    for token in [1, 4, 6]:',
      '        if token <= amount:',
      '            best[amount] = min(best[amount], best[amount - token] + 1)',
      'return best[8]',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Amount 1 needs one token, while amounts 2 and 3 need two and three.',
      'Amount 4 improves immediately to one token.',
      'Amount 6 also needs one token.',
      'Amount 8 chooses best[4] + 1 = 2, beating the other predecessors.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan remains correct for token systems where a largest-first choice can fail?',
    correct:
      'Store the fewest tokens for every smaller amount and try every fitting final token.',
    distractors: [
      'Always take the largest token no greater than the remaining charge.',
      'Remember only whether the previous amount was reachable.',
      'Generate every token multiset before comparing their sizes.',
    ],
    hint: 'Treat each token as a possible final choice for the current amount.',
  },
  retrievalCheck: {
    prompt:
      'Complete the transition for a fitting token c: best[a] = min(best[a], ______).',
    acceptedAnswers: [
      'best[a - c] + 1',
      'best[a-c] + 1',
      'best[a-c]+1',
      '1 + best[a - c]',
      '1 + best[a-c]',
      '1+best[a-c]',
      'one plus the best count for a minus c',
    ],
    placeholder: 'Type the predecessor expression',
    hint: 'Remove the final token, then solve the smaller amount.',
  },
  reconstructionPrompt:
    'Order the minimum-token table fill from its zero base through unreachable-result handling.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains coins, a list of positive token values, and amount, a nonnegative charge. Return the fewest tokens or -1.',
    starterCode: `def solve(data):
    coins = data["coins"]
    amount = data["amount"]
    best = [float("inf")] * (amount + 1)
    best[0] = 0

    for total in range(1, amount + 1):
        for coin in coins:
            if coin <= total:
                # Relax best[total] from best[total - coin].
                pass

    return -1 if best[amount] == float("inf") else best[amount]`,
    cases: {
      visibleExample: {
        input: { coins: [1, 4, 6], amount: 8 },
        expected: 2,
      },
      hiddenBoundary: {
        input: { coins: [3, 5], amount: 0 },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { coins: [5, 7], amount: 1 },
        expected: -1,
      },
    },
    hints: [
      'Initialize every positive amount as unreachable.',
      'Use best[total] = min(best[total], best[total - coin] + 1).',
      'Convert an unreachable target state to -1.',
    ],
  },
})

export const problemLesson = createProblemMission(coinChangeMissionSeed)

export default problemLesson
