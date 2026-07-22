import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const coinChangeIiMissionSeed = buildRealm5Mission({
  slug: 'coin-change-ii',
  estimatedMinutes: 24,
  mission: {
    title: 'The Token Recipe Ledger',
    context:
      'A festival booth accepts reusable token values. The ledger treats token order as irrelevant: two 2-tokens and one 3-token are one recipe no matter how they are handed over.',
    prompt:
      'Return the number of different token-count combinations that form the exact charge.',
  },
  objective:
    'Count unordered combinations by processing token types outside and amounts in ascending order inside.',
  priorKnowledge: [
    'Amount zero has one combination: choose no tokens.',
    'A token may be reused, so current-row amounts update from smaller current-row amounts.',
  ],
  recognitionCue:
    'The task counts unlimited-choice combinations where order must not create new answers.',
  misconception:
    'Looping over amounts before token types counts different token orders as separate recipes.',
  algorithmSteps: [
    {
      id: 'seed-empty-recipe',
      instruction: 'Create a ways table with ways[0] = 1 and all other amounts zero.',
    },
    {
      id: 'visit-token-types',
      instruction: 'Process each token value exactly once in the outer loop.',
    },
    {
      id: 'scan-amounts-upward',
      instruction: 'For that token, scan amounts from its value through the charge.',
    },
    {
      id: 'extend-combinations',
      instruction: 'Add ways[amount - token] into ways[amount].',
    },
    {
      id: 'return-charge-count',
      instruction: 'Return ways[charge] after all token types are processed.',
    },
  ],
  complexity: {
    time: 'O(k × amount)',
    space: 'O(amount)',
    explanation:
      'Each of k token types scans the amount table once, which is stored in one row.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      [1, 0, 1, 1, 1, 1, 2, 1, 2, 2, 2, 2, 3],
      [1, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
    ],
    rowLabels: ['start', 'after 2', 'after 3', 'after 7'],
    columnLabels: [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ],
    highlightedCells: [{ row: 3, column: 12, label: '4 recipes' }],
    dependencyCells: [
      { row: 2, column: 5 },
      { row: 2, column: 12 },
    ],
  },
  workedExample: {
    prompt:
      'For tokens [2, 3, 7] and charge 12, the recipes are six 2s; three 2s plus two 3s; four 3s; and one each of 2, 3, and 7. The count is 4.',
    code: [
      'ways = [1] + [0] * 12',
      'for token in [2, 3, 7]:',
      '    for amount in range(token, 13):',
      '        ways[amount] += ways[amount - token]',
      'return ways[12]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'After token 2, every even amount has one recipe.',
      'Token 3 adds recipes whose remaining amount was already buildable.',
      'Processing token 7 last adds only recipes where 7 is the newest token type.',
      'The state at amount 12 finishes at 4 without counting order permutations.',
    ],
  },
  patternCheck: {
    prompt:
      'Which loop order counts token recipes rather than token handoff orders?',
    correct:
      'Loop over token types first, then scan amounts upward for each token.',
    distractors: [
      'Loop over amounts first and try every final token.',
      'Scan amounts downward, preventing a token from being reused.',
      'Generate every ordered token sequence and sort each result afterward.',
    ],
    hint: 'Once a token type is processed, every new recipe has a fixed largest processed type.',
  },
  retrievalCheck: {
    prompt:
      'For one token c, what update extends existing recipes to amount a?',
    acceptedAnswers: [
      'ways[a] += ways[a - c]',
      'ways[a] += ways[a-c]',
      'ways[a]+=ways[a-c]',
      'ways[a] = ways[a] + ways[a-c]',
      'ways[a] = ways[a] + ways[a - c]',
      'add ways for a minus c into ways for a',
    ],
    placeholder: 'Type the combination update',
    hint: 'Append one c-token to each recipe for the smaller amount.',
  },
  reconstructionPrompt:
    'Restore the ledger fill, whose loop order matters, from its empty recipe through the outer token loop.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains coins, distinct positive token values, and amount. Return the number of unordered combinations using each value any number of times.',
    starterCode: `def solve(data):
    coins = data["coins"]
    amount = data["amount"]
    ways = [1] + [0] * amount

    for coin in coins:
        for total in range(coin, amount + 1):
            # Add combinations that end with this coin type.
            pass

    return ways[amount]`,
    cases: {
      visibleExample: {
        input: { coins: [2, 3, 7], amount: 12 },
        expected: 4,
      },
      hiddenBoundary: {
        input: { coins: [4, 9], amount: 0 },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { coins: [4, 6], amount: 7 },
        expected: 0,
      },
    },
    hints: [
      'Keep coins in the outer loop.',
      'Scan total upward so the current coin can be reused.',
      'Use ways[total] += ways[total - coin].',
    ],
  },
})

export const problemLesson = createProblemMission(coinChangeIiMissionSeed)

export default problemLesson
