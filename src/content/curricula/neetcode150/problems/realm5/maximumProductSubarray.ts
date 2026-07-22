import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const maximumProductSubarrayMissionSeed = buildRealm5Mission({
  slug: 'maximum-product-subarray',
  estimatedMinutes: 23,
  mission: {
    title: 'The Sign-Flip Signal',
    context:
      'A signal multiplies each factor in one unbroken run. A negative flips the sign. A second negative can turn a low product into a high one.',
    prompt:
      'Return the greatest product from any nonempty unbroken run.',
  },
  objective:
    'Track the high and low products ending at each position because a negative can swap their roles.',
  priorKnowledge: [
    'Multiplying by a negative number reverses numeric order.',
    'A new contiguous run may start at the current value.',
  ],
  recognitionCue:
    'The best unbroken product may use negatives, so both ending extremes matter.',
  misconception:
    'Keeping only the largest ending product loses a negative product that a later negative value could turn positive.',
  algorithmSteps: [
    {
      id: 'seed-first-factor',
      instruction: 'Initialize ending maximum, ending minimum, and answer to the first factor.',
    },
    {
      id: 'scan-remaining-factors',
      instruction: 'Read each remaining factor from left to right.',
    },
    {
      id: 'form-three-candidates',
      instruction:
        'Compare starting fresh, extending the prior maximum, and extending the prior minimum.',
    },
    {
      id: 'update-both-extremes',
      instruction: 'Store the largest and smallest candidates as the new ending states.',
    },
    {
      id: 'record-global-product',
      instruction: 'Update and return the greatest ending maximum ever seen.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each factor creates three constant-time candidates, and only two ending states plus the answer are stored.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [-2, 4, -3],
      [-2, 4, 24],
      [-2, -8, -12],
    ],
    rowLabels: ['factor', 'ending max', 'ending min'],
    columnLabels: ['0', '1', '2'],
    highlightedCells: [{ row: 1, column: 2, label: '(-8) × (-3)' }],
    dependencyCells: [
      { row: 1, column: 1 },
      { row: 2, column: 1 },
    ],
  },
  workedExample: {
    prompt:
      'For factors [-2, 4, -3], the ending extremes after 4 are 4 and -8. Multiplying -8 by -3 produces 24, the best run.',
    code: [
      'ending_max = ending_min = answer = -2',
      'for value in [4, -3]:',
      '    choices = (value, value * ending_max, value * ending_min)',
      '    ending_max, ending_min = max(choices), min(choices)',
      '    answer = max(answer, ending_max)',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first factor seeds both ending states at -2.',
      'At 4, the largest ending product is 4 and the smallest is -8.',
      'At -3, the old minimum creates 24 while the old maximum creates -12.',
      'The global answer becomes 24.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state is necessary when negative factors can reverse which partial product is useful?',
    correct:
      'Keep both the largest and smallest product ending at the current position.',
    distractors: [
      'Reset whenever the current product becomes negative.',
      'Keep only the largest product ending at the previous position.',
      'Multiply every possible contiguous range from scratch.',
    ],
    hint: 'Ask what happens when a large-magnitude negative product meets another negative.',
  },
  retrievalCheck: {
    prompt:
      'What three candidates determine the new ending maximum and minimum for value x?',
    acceptedAnswers: [
      'x, x * ending_max, and x * ending_min',
      'x, x * ending_max, x * ending_min',
      'x, x*ending_max, and x*ending_min',
      'x, x*ending_max, x*ending_min',
      '(x, x*ending_max, x*ending_min)',
      '(x, x * ending_max, x * ending_min)',
      'start at x or extend either previous extreme',
    ],
    placeholder: 'Type the three candidates',
    hint: 'One candidate starts fresh; two extend earlier runs.',
  },
  reconstructionPrompt:
    'Restore the polarity-aware scan from first-factor seeding through the global maximum update.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains factors, a nonempty integer list. Return the maximum product of any nonempty contiguous slice.',
    starterCode: `def solve(data):
    factors = data["factors"]
    ending_max = ending_min = answer = factors[0]

    for value in factors[1:]:
        choices = (value, value * ending_max, value * ending_min)
        # Update both extremes from the same old states.
        pass
        answer = max(answer, ending_max)

    return answer`,
    cases: {
      visibleExample: { input: { factors: [-2, 4, -3] }, expected: 24 },
      hiddenBoundary: { input: { factors: [7] }, expected: 7 },
      hiddenAdversarial: {
        input: { factors: [-1, -2, -9, 0, -4] },
        expected: 18,
      },
    },
    hints: [
      'Compute choices before changing either ending state.',
      'Assign ending_max = max(choices) and ending_min = min(choices).',
      'Update answer only after both ending states are ready.',
    ],
  },
})

export const problemLesson = createProblemMission(
  maximumProductSubarrayMissionSeed,
)

export default problemLesson
