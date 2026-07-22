import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const minCostClimbingStairsMissionSeed = buildRealm5Mission({
  slug: 'min-cost-climbing-stairs',
  estimatedMinutes: 20,
  mission: {
    title: 'The Toll-Step Service Tower',
    context:
      'A repair drone may begin on either of the first two steps of a service tower. Landing on a numbered step spends that step’s battery fee, and each move rises one or two steps.',
    prompt:
      'Return the least battery charge the drone must spend to move beyond the final numbered step.',
  },
  objective:
    'Minimize an accumulated cost by combining the cheaper of two predecessor states at every step.',
  priorKnowledge: [
    'The drone can arrive at a step only from one or two positions below.',
    'Starting before step 0 or step 1 costs nothing.',
  ],
  recognitionCue:
    'A cheapest route to the current position depends on the cheaper of a fixed number of earlier routes.',
  misconception:
    'Choosing the smaller next fee greedily can lead into an expensive step later; compare complete costs to arrive.',
  algorithmSteps: [
    {
      id: 'start-two-free-states',
      instruction: 'Treat the two starting positions as having zero prior cost.',
    },
    {
      id: 'visit-each-fee',
      instruction: 'Read the step fees from bottom to top.',
    },
    {
      id: 'add-cheaper-arrival',
      instruction:
        'For each fee, add it to the smaller cost of the two ways that can reach it.',
    },
    {
      id: 'roll-two-costs',
      instruction: 'Shift the two latest landing costs after every step.',
    },
    {
      id: 'choose-platform-entry',
      instruction: 'Return the smaller of the final two landing costs.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Every fee is processed once, while two rolling costs hold all needed history.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [4, 9, 2, 7, 3, 'top'],
      [4, 9, 6, 13, 9, 9],
    ],
    rowLabels: ['fee', 'least spent'],
    columnLabels: ['0', '1', '2', '3', '4', 'exit'],
    highlightedCells: [{ row: 1, column: 5, label: 'answer' }],
    dependencyCells: [
      { row: 1, column: 3 },
      { row: 1, column: 4 },
    ],
  },
  workedExample: {
    prompt:
      'For fees [4, 9, 2, 7, 3], the cheapest landing totals are 4, 9, 6, 13, and 9. The platform can follow either of the last two steps, so the answer is 9.',
    code: [
      'two_back, one_back = 0, 0',
      'for fee in [4, 9, 2, 7, 3]:',
      '    landing = fee + min(two_back, one_back)',
      '    two_back, one_back = one_back, landing',
      'return min(two_back, one_back)',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Fee 4 creates landing cost 4; fee 9 creates landing cost 9.',
      'Fee 2 follows the cheaper zero-to-4 route, giving 6.',
      'Fee 7 gives 13, while fee 3 gives 9.',
      'The exit chooses min(13, 9), so the drone spends 9.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state makes future step decisions safe even when the locally cheapest fee is misleading?',
    correct:
      'Track the least total cost to land on each of the two latest steps.',
    distractors: [
      'Always jump toward the smaller of the next two fee labels.',
      'Remember only the fee printed on the current step.',
      'List every possible jump route and total each one after reaching the top.',
    ],
    hint: 'A fee and the total cost to arrive at that fee are different quantities.',
  },
  retrievalCheck: {
    prompt:
      'For a step with fee c, what rolling transition computes its cheapest landing cost?',
    acceptedAnswers: [
      'c + min(two_back, one_back)',
      'c + min(one_back, two_back)',
      'c+min(two_back,one_back)',
      'c+min(one_back,two_back)',
      'fee + min(two_back, one_back)',
      'fee + min(one_back, two_back)',
      'min(two_back, one_back) + c',
      'min(one_back, two_back) + c',
      'min(two_back, one_back) + fee',
      'min(one_back, two_back) + fee',
      'add the fee to the smaller previous landing cost',
      'fee plus the smaller of the two previous landing costs',
      'c plus the smaller of the two previous landing costs',
    ],
    placeholder: 'Type the cost transition',
    hint: 'Both predecessor positions can reach the current step.',
  },
  reconstructionPrompt:
    'Rebuild the battery-saving scan from its free starts through the platform choice.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains fees, a list with at least two nonnegative step fees. Return the minimum total fee needed to move past the list.',
    starterCode: `def solve(data):
    fees = data["fees"]
    two_back, one_back = 0, 0

    for fee in fees:
        # Compute this landing cost and shift the rolling states.
        pass

    return min(two_back, one_back)`,
    cases: {
      visibleExample: { input: { fees: [4, 9, 2, 7, 3] }, expected: 9 },
      hiddenBoundary: { input: { fees: [7, 2] }, expected: 2 },
      hiddenAdversarial: {
        input: { fees: [3, 40, 2, 2, 50, 1, 1, 1] },
        expected: 9,
      },
    },
    hints: [
      'Begin with two zero costs because either first step may be the start.',
      'Use landing = fee + min(two_back, one_back).',
      'Shift the states, then return their minimum after the loop.',
    ],
  },
})

export const problemLesson = createProblemMission(
  minCostClimbingStairsMissionSeed,
)

export default problemLesson
