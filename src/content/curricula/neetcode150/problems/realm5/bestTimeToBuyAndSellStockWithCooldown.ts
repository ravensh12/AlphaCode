import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const bestTimeToBuyAndSellStockWithCooldownMissionSeed =
  buildRealm5Mission({
    slug: 'best-time-to-buy-and-sell-stock-with-cooldown',
    estimatedMinutes: 27,
    mission: {
      title: 'The Frost-Locked Market Drone',
      context:
        'A trading drone may hold at most one energy cell. It can buy or sell once per day, but after a sale its gripper must cool for the entire next day before buying again.',
      prompt:
        'Given daily cell prices, return the greatest profit possible after any number of valid trades.',
    },
    objective:
      'Model each day with holding, just-sold, and resting profit states so cooldown legality is preserved.',
    priorKnowledge: [
      'A buy can follow only a resting state, not a sale from the previous day.',
      'Daily state updates must all read the previous day’s values.',
    ],
    recognitionCue:
      'Repeated decisions have a small set of modes, and one action blocks another action on the next step.',
    misconception:
      'Updating resting profit before buying on the same day can illegally skip the required cooldown.',
    algorithmSteps: [
      {
        id: 'seed-market-states',
        instruction:
          'Initialize holding from the first price, resting to zero, and just-sold as impossible.',
      },
      {
        id: 'scan-later-days',
        instruction: 'Process each later price in time order.',
      },
      {
        id: 'compute-holding-state',
        instruction: 'Keep holding or buy today using only yesterday’s resting profit.',
      },
      {
        id: 'compute-sold-rest-states',
        instruction:
          'Compute selling from yesterday’s holding state and resting from yesterday’s sold or resting state.',
      },
      {
        id: 'return-no-stock-profit',
        instruction: 'Return the better final just-sold or resting profit.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(1)',
      explanation:
        'Each day performs constant work over three rolling states.',
    },
    diagram: {
      kind: 'grid',
      variant: 'dpTable',
      cells: [
        [2, 5, 1, 6, 3, 8],
        [-2, -2, -1, -1, 0, 0],
        ['—', 3, -1, 5, 2, 8],
        [0, 0, 3, 3, 5, 5],
      ],
      rowLabels: ['price', 'hold', 'sold', 'rest'],
      columnLabels: ['day 0', 'day 1', 'day 2', 'day 3', 'day 4', 'day 5'],
      highlightedCells: [{ row: 2, column: 5, label: 'profit 8' }],
      dependencyCells: [
        { row: 1, column: 4 },
        { row: 3, column: 4 },
      ],
    },
    workedExample: {
      prompt:
        'For prices [2, 5, 1, 6, 3, 8], selling on day 1 earns 3, day 2 is cooldown, then buying at 3 and selling at 8 adds 5. The total is 8.',
      code: [
        'hold, sold, rest = -prices[0], float("-inf"), 0',
        'for price in prices[1:]:',
        '    next_hold = max(hold, rest - price)',
        '    next_sold = hold + price',
        '    next_rest = max(rest, sold)',
        '    hold, sold, rest = next_hold, next_sold, next_rest',
      ],
      currentLineIndex: 5,
      walkthrough: [
        'Buying at 2 then selling at 5 creates sold profit 3.',
        'That sold state moves to rest during the day-2 cooldown.',
        'After cooldown, the drone can buy at price 3 while retaining earlier profit.',
        'Selling at 8 yields final profit 8.',
      ],
    },
    patternCheck: {
      prompt:
        'Which state design prevents buying immediately after a sale while still allowing many trades?',
      correct:
        'Track separate hold, sold-today, and rest profits, with buying allowed only from prior rest.',
      distractors: [
        'Add every positive day-to-day price increase without tracking cooldown days.',
        'Remember only whether today’s price is lower than yesterday’s.',
        'Enumerate every possible sequence of buy, sell, rest, and cooldown actions.',
      ],
      hint: 'Legality depends on the mode held at the end of the previous day.',
    },
    retrievalCheck: {
      prompt:
        'Complete the legal buy/hold transition: next_hold = max(hold, ______).',
      acceptedAnswers: [
        'rest - price',
        'rest-price',
        'rest minus price',
        'previous rest minus price',
        "yesterday's rest minus price",
        "yesterday's rest minus today's price",
      ],
      placeholder: 'Type the buy candidate',
      hint: 'A purchase spends today’s price from a previously resting state.',
    },
    reconstructionPrompt:
      'Restore the three-state market update without mixing old and new day values.',
    pythonChallenge: {
      prompt:
        'Write solve(data). The JSON object contains prices, a list of nonnegative daily prices. Return maximum profit with one held item at most and one full cooldown day after every sale.',
      starterCode: `def solve(data):
    prices = data["prices"]
    if not prices:
        return 0

    hold, sold, rest = -prices[0], float("-inf"), 0
    for price in prices[1:]:
        # Compute all three next states from the old states.
        pass

    return max(sold, rest)`,
      cases: {
        visibleExample: {
          input: { prices: [2, 5, 1, 6, 3, 8] },
          expected: 8,
        },
        hiddenBoundary: { input: { prices: [] }, expected: 0 },
        hiddenAdversarial: {
          input: { prices: [1, 5, 1, 5] },
          expected: 4,
        },
      },
      hints: [
        'next_hold = max(hold, rest - price).',
        'next_sold = hold + price and next_rest = max(rest, sold).',
        'Assign all three next states together after computing them.',
      ],
    },
  })

export const problemLesson = createProblemMission(
  bestTimeToBuyAndSellStockWithCooldownMissionSeed,
)

export default problemLesson
