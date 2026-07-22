import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const maximumSubarrayMissionSeed = buildRealm5Mission({
  slug: 'maximum-subarray',
  estimatedMinutes: 19,
  mission: {
    title: 'The Strongest Signal Window',
    context:
      'A receiver records gains and losses along one timeline. Engineers want one nonempty continuous window with the greatest total signal strength.',
    prompt:
      'Return the largest sum of any nonempty contiguous slice of the readings.',
  },
  objective:
    'Apply Kadane’s invariant: the best slice ending here either starts here or extends the best slice ending one position earlier.',
  priorKnowledge: [
    'The selected readings must be contiguous.',
    'A negative running prefix should be abandoned when starting fresh is better.',
  ],
  recognitionCue:
    'The task asks for a maximum sum over one nonempty contiguous range.',
  misconception:
    'Starting the running and global totals at zero returns an invalid empty slice for an all-negative input.',
  algorithmSteps: [
    {
      id: 'seed-first-reading',
      instruction: 'Initialize ending-best and global-best to the first reading.',
    },
    {
      id: 'scan-later-readings',
      instruction: 'Process each remaining reading from left to right.',
    },
    {
      id: 'start-or-extend',
      instruction:
        'Set ending-best to the larger of the current reading and current plus the previous ending-best.',
    },
    {
      id: 'update-global-best',
      instruction: 'Raise global-best when the new ending-best is larger.',
    },
    {
      id: 'return-window-total',
      instruction: 'Return global-best after the scan.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each reading is processed once with two rolling sums.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [-4, 6, -2, 5, -7, 3],
      [-4, 6, 4, 9, 2, 5],
      [-4, 6, 6, 9, 9, 9],
    ],
    rowLabels: ['reading', 'best ending here', 'best anywhere'],
    columnLabels: ['0', '1', '2', '3', '4', '5'],
    highlightedCells: [{ row: 1, column: 3, label: '6 - 2 + 5' }],
    dependencyCells: [{ row: 1, column: 2 }],
  },
  workedExample: {
    prompt:
      'For readings [-4, 6, -2, 5, -7, 3], the best ending totals become -4, 6, 4, 9, 2, 5. The strongest window totals 9.',
    code: [
      'ending = best = readings[0]',
      'for value in readings[1:]:',
      '    ending = max(value, ending + value)',
      '    best = max(best, ending)',
      'return best',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The first reading seeds a valid nonempty window at -4.',
      'At 6, starting fresh beats extending -4.',
      'Values -2 and 5 extend that window to total 9.',
      'The later drop and 3 never exceed the saved global total.',
    ],
  },
  patternCheck: {
    prompt:
      'Which local decision safely summarizes every contiguous window ending at the current reading?',
    correct:
      'Choose between starting at the current reading and extending the previous best ending window.',
    distractors: [
      'Discard every negative reading even when it lies inside a profitable window.',
      'Track only the total sum of all readings seen so far.',
      'Compute the sum of every possible start/end pair.',
    ],
    hint: 'Any slice ending here either includes the previous position or begins here.',
  },
  retrievalCheck: {
    prompt:
      'Complete Kadane’s transition: ending = max(value, ______).',
    acceptedAnswers: [
      'ending + value',
      'ending+value',
      'value + ending',
      'value+ending',
      'ending plus value',
      'previous ending plus value',
      'the previous ending best plus the current value',
    ],
    placeholder: 'Type the extend case',
    hint: 'The second candidate extends the best slice ending one step earlier.',
  },
  reconstructionPrompt:
    'Restore the one-pass window scan from nonempty initialization through the global update.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains signals, a nonempty integer list. Return the maximum sum of a nonempty contiguous slice.',
    starterCode: `def solve(data):
    signals = data["signals"]
    ending = best = signals[0]

    for value in signals[1:]:
        # Choose whether to start here or extend, then update best.
        pass

    return best`,
    cases: {
      visibleExample: {
        input: { signals: [-4, 6, -2, 5, -7, 3] },
        expected: 9,
      },
      hiddenBoundary: { input: { signals: [-8] }, expected: -8 },
      hiddenAdversarial: {
        input: { signals: [-5, -2, -9] },
        expected: -2,
      },
    },
    hints: [
      'Initialize from signals[0], not zero.',
      'Use ending = max(value, ending + value).',
      'Then set best = max(best, ending).',
    ],
  },
})

export const problemLesson = createProblemMission(maximumSubarrayMissionSeed)

export default problemLesson
