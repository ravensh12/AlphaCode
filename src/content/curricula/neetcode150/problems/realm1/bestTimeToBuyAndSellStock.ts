import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const bestTimeToBuyAndSellStockMissionSeed = {
  slug: 'best-time-to-buy-and-sell-stock',
  estimatedMinutes: 19,
  mission: {
    title: 'The Moon-Market Crystal Trade',
    context:
      'A crystal’s price is recorded once per day. A cadet may buy on one day and sell on one later day, or skip the trade if no profit is possible.',
    prompt:
      'Return the greatest nonnegative profit from one buy followed by one sale.',
  },
  objective:
    'Track the cheapest earlier price and the best later gain in one scan.',
  priorKnowledge: [
    'A sale must occur after its purchase.',
    'Profit is sale price minus purchase price.',
    'A running minimum summarizes the cheapest earlier day.',
  ],
  recognitionCue:
    'You need the best ordered pair where a smaller earlier value is subtracted from a later value.',
  misconception:
    'Subtracting the list minimum from the list maximum can choose a sale that happened before the purchase.',
  algorithmSteps: [
    { id: 'handle-short-log', instruction: 'Return 0 when fewer than two prices exist.' },
    { id: 'set-cheapest', instruction: 'Use the first price as the cheapest purchase seen so far.' },
    { id: 'start-profit', instruction: 'Initialize best profit to 0.' },
    { id: 'scan-sale', instruction: 'Scan each later price as a possible sale.' },
    { id: 'update-profit', instruction: 'Compare best with current price minus cheapest.' },
    { id: 'update-cheapest', instruction: 'Lower cheapest when the current price is a better future purchase.' },
    { id: 'return-profit', instruction: 'Return the best profit after the scan.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Every daily price is inspected once, and only the cheapest price and best profit are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [7, 3, 5, 1, 6],
      pointers: [
        { index: 3, label: 'buy 1' },
        { index: 4, label: 'sell 6' },
      ],
      visited: [0, 1, 2],
    },
  },
  workedExample: {
    prompt:
      'Prices [7, 3, 5, 1, 6] first offer profit 2 from 3 to 5. Price 1 becomes a new cheapest purchase, and selling at 6 raises best to 5.',
    code: [
      'def best_trade(prices):',
      '    if len(prices) < 2: return 0',
      '    cheapest = prices[0]',
      '    best = 0',
      '    for price in prices[1:]:',
      '        best = max(best, price - cheapest)',
      '        cheapest = min(cheapest, price)',
      '    return best',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Price 3 replaces 7 as the cheapest earlier purchase.',
      'Price 5 gives gain 2, so best becomes 2.',
      'Price 1 resets cheapest; price 6 later gives gain 5.',
    ],
    diagram: { kind: 'array', values: [7, 3, 5, 1, 6], highlight: 4, pointers: [{ index: 3, label: 'cheapest' }, { index: 4, label: 'candidate sale' }] },
  },
  patternCheck: {
    prompt:
      'Why is the running cheapest price always a legal purchase for today’s sale?',
    options: [
      { id: 'seen-earlier', label: 'It was chosen only from days already scanned before or at today.' },
      { id: 'global-minimum', label: 'It is found by looking ahead through all future days.' },
      { id: 'largest-price', label: 'The cheapest price is always also the largest price.' },
      { id: 'order-irrelevant', label: 'Buy and sale order never matters.' },
    ],
    correctOptionId: 'seen-earlier',
    feedback: {
      correct: 'Exactly. The scan never uses a future day as an earlier purchase.',
      incorrect: 'That explanation breaks the required buy-before-sell order.',
      secondIncorrect: 'Cheapest summarizes only the prefix already visited.',
    },
    hints: ['The scan moves left to right.', 'No future price enters the variable early.'],
    diagram: { kind: 'array', values: [9, 4, 7, 2, 8], highlight: 4, visited: [0, 1, 2, 3] },
  },
  retrievalCheck: {
    prompt:
      'Write the candidate profit checked at a possible sale price.',
    acceptedAnswers: [
      'price - cheapest',
      'sale price minus cheapest',
      'current price - minimum price',
      'sale - buy',
      'price-cheapest',
      'price minus cheapest',
      'current price minus cheapest',
      'current price - cheapest',
      'sale price - cheapest',
      'sale minus buy',
    ],
    placeholder: 'candidate = ...',
    feedback: {
      correct: 'Right. The cheapest stored purchase gives today’s best possible gain.',
      incorrect: 'Subtract the best earlier purchase price from the current sale price.',
      secondIncorrect: 'Use price - cheapest.',
    },
    hints: ['Profit is received minus paid.', 'The current item is treated as the sale.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the trade scan so every sale uses an earlier purchase.',
    feedback: {
      correct: 'Trade scanner restored. Prefix minimum keeps time order intact.',
      incorrect: 'Initialize from the first day before scanning later sale candidates.',
      secondIncorrect: 'Handle short log, set cheapest, start best, scan, update profit, update cheapest, return.',
    },
    hints: ['Best starts at zero because skipping is allowed.', 'A lower current price helps future sales.'],
    diagram: { kind: 'array', values: [9, 4, 7, 2, 8, 5], highlight: 4, pointers: [{ index: 3, label: 'buy' }, { index: 4, label: 'sell' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read nonnegative data["prices"] and return the greatest profit from one purchase and one later sale, or 0.',
    starterCode: `def solve(data):
    prices = data["prices"]
    if len(prices) < 2:
        return 0

    cheapest = prices[0]
    best = 0
    # Scan later prices as sales; update best and cheapest.
    return best`,
    cases: {
      visibleExample: { input: { prices: [9, 4, 7, 2, 8, 5] }, expected: 6 },
      hiddenBoundary: { input: { prices: [5] }, expected: 0 },
      hiddenAdversarial: { input: { prices: [8, 7, 6, 5, 4] }, expected: 0 },
    },
    feedback: {
      correct: 'Trade planned! Your prefix minimum respects time and avoids negative profit.',
      incorrect: 'The gain is wrong. Check buy-before-sell order and the zero fallback.',
      secondIncorrect: 'For each later price, update best with price-cheapest, then lower cheapest.',
    },
    hints: [
      'Do not compute global max minus global min.',
      'Loop over prices[1:].',
      'Keep best at least zero.',
    ],
    diagram: { kind: 'array', values: [9, 4, 7, 2, 8, 5], pointers: [{ index: 3, label: '2' }, { index: 4, label: '8; gain 6' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(bestTimeToBuyAndSellStockMissionSeed)
export default problemLesson
