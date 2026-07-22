import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const burstBalloonsMissionSeed = buildRealm5Mission({
  slug: 'burst-balloons',
  estimatedMinutes: 31,
  mission: {
    title: 'The Resonant Orb Chamber',
    context:
      'A chamber holds a row of energy orbs. Removing an orb earns the product of its own value and the values of its current nearest surviving neighbors; missing outside neighbors count as 1.',
    prompt:
      'Return the maximum energy obtainable by removing every orb in the best order.',
  },
  objective:
    'Use interval dynamic programming by choosing which orb is removed last inside each open interval.',
  priorKnowledge: [
    'Removing an orb changes which values become neighbors.',
    'If the last orb in an interval is fixed, its two outside boundary neighbors are known.',
  ],
  recognitionCue:
    'Actions change adjacency, and the score for one action depends on which items survive beside it.',
  misconception:
    'Choosing the largest immediate product can destroy neighboring relationships needed for a better total.',
  algorithmSteps: [
    {
      id: 'pad-boundary-ones',
      instruction: 'Add a value 1 before and after the orb list as permanent boundaries.',
    },
    {
      id: 'create-interval-table',
      instruction: 'Create a table for maximum energy inside every open boundary pair.',
    },
    {
      id: 'grow-interval-width',
      instruction: 'Process intervals from narrowest to widest.',
    },
    {
      id: 'try-each-last-orb',
      instruction:
        'For each interval, try every inner orb as last and combine left interval, final product, and right interval.',
    },
    {
      id: 'return-full-interval',
      instruction: 'Return the state between the two padded boundaries.',
    },
  ],
  complexity: {
    time: 'O(n^3)',
    space: 'O(n^2)',
    explanation:
      'There are O(n²) intervals and each tries O(n) choices for its last removed orb.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['-', '-', 8, 30, 33],
      ['-', '-', '-', 24, 30],
      ['-', '-', '-', '-', 12],
      ['-', '-', '-', '-', '-'],
      ['-', '-', '-', '-', '-'],
    ],
    rowLabels: ['left 0', 'left 1', 'left 2', 'left 3', 'left 4'],
    columnLabels: ['right 0', 'right 1', 'right 2', 'right 3', 'right 4'],
    highlightedCells: [{ row: 0, column: 4, label: 'all orbs' }],
    dependencyCells: [
      { row: 0, column: 3 },
      { row: 3, column: 4 },
    ],
  },
  workedExample: {
    prompt:
      'For orbs [2, 4, 3], choose 3 as the last orb. The left interval can earn 30, then the final 3 earns 1 × 3 × 1, totaling 33.',
    code: [
      'values = [1, 2, 4, 3, 1]',
      'for width in range(2, len(values)):',
      '    for left in range(len(values) - width):',
      '        right = left + width',
      '        for last in range(left + 1, right):',
      '            dp[left][right] = max(dp[left][right], dp[left][last] + values[left] * values[last] * values[right] + dp[last][right])',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Padding fixes outside boundary values at 1.',
      'Narrow intervals compute the score of one inner orb.',
      'The interval containing 2 and 4 earns 30 when 4 is removed before 2.',
      'Removing 3 last adds 3 to that interval result, giving 33.',
    ],
  },
  patternCheck: {
    prompt:
      'Which viewpoint makes the changing-neighbor score split into independent subproblems?',
    correct:
      'Choose the last removed orb in an interval, leaving fixed boundary neighbors.',
    distractors: [
      'Always remove the orb with the largest current local product.',
      'Store only the best score after removing each individual orb.',
      'Generate all n! removal orders and compare their totals.',
    ],
    hint: 'The first removed orb has changing neighbors; the last one has known boundary neighbors.',
  },
  retrievalCheck: {
    prompt:
      'For boundaries left/right and last inner orb k, what three parts form the candidate score?',
    acceptedAnswers: [
      'dp[left][k] + values[left] * values[k] * values[right] + dp[k][right]',
      'dp[left][k] + values[left]*values[k]*values[right] + dp[k][right]',
      'dp[left][k]+values[left]*values[k]*values[right]+dp[k][right]',
      'dp[left][k] + dp[k][right] + values[left] * values[k] * values[right]',
      'dp[left][k] + dp[k][right] + values[left]*values[k]*values[right]',
      'left interval plus boundary product plus right interval',
      'the left interval plus the boundary product plus the right interval',
      'the left interval, the boundary product, and the right interval',
      'dp left k plus final burst plus dp k right',
    ],
    placeholder: 'Type the interval candidate',
    hint: 'The final orb separates two already-solved open intervals.',
  },
  reconstructionPrompt:
    'Order the interval optimization from padding through increasing widths and last-orb choices.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains orbs, a list of positive integers. Return the maximum total earned by removing all orbs under the current-neighbor product rule.',
    starterCode: `def solve(data):
    orbs = data["orbs"]
    values = [1] + orbs + [1]
    dp = [[0] * len(values) for _ in range(len(values))]

    for width in range(2, len(values)):
        for left in range(0, len(values) - width):
            right = left + width
            for last in range(left + 1, right):
                # Combine two solved intervals with this final removal.
                pass

    return dp[0][len(values) - 1]`,
    cases: {
      visibleExample: { input: { orbs: [2, 4, 3] }, expected: 33 },
      hiddenBoundary: { input: { orbs: [] }, expected: 0 },
      hiddenAdversarial: { input: { orbs: [1, 5, 1] }, expected: 15 },
    },
    hints: [
      'Intervals are open: left and right are surviving boundaries.',
      'Try every last index strictly between them.',
      'Use dp[left][last] + values[left] * values[last] * values[right] + dp[last][right].',
    ],
  },
})

export const problemLesson = createProblemMission(burstBalloonsMissionSeed)

export default problemLesson
