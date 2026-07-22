import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const longestIncreasingSubsequenceMissionSeed = buildRealm5Mission({
  slug: 'longest-increasing-subsequence',
  estimatedMinutes: 24,
  mission: {
    title: 'The Rising Cadet Record',
    context:
      'A flight academy records one score after each drill. An instructor may skip records but wants the longest time-ordered selection whose scores rise strictly.',
    prompt:
      'Return the length of the longest strictly increasing subsequence while keeping the original record order.',
  },
  objective:
    'Store the best increasing subsequence length ending at every position and extend compatible earlier endings.',
  priorKnowledge: [
    'A subsequence may skip positions but cannot reorder them.',
    'Strictly increasing means equal scores cannot extend a sequence.',
  ],
  recognitionCue:
    'The task asks for an ordered, not necessarily contiguous, sequence that optimizes a property at each ending position.',
  misconception:
    'Counting every rise between neighboring values misses sequences that improve only after skipping a drop.',
  algorithmSteps: [
    {
      id: 'seed-single-score',
      instruction: 'Initialize every ending length to one for the score by itself.',
    },
    {
      id: 'visit-each-ending',
      instruction: 'Process each score as a possible subsequence ending.',
    },
    {
      id: 'inspect-earlier-scores',
      instruction: 'Inspect all earlier scores before the current ending.',
    },
    {
      id: 'extend-smaller-ending',
      instruction:
        'When an earlier score is smaller, extend its ending length by one and keep the maximum.',
    },
    {
      id: 'return-longest-ending',
      instruction: 'Return the largest ending length, or zero for no scores.',
    },
  ],
  complexity: {
    time: 'O(n^2)',
    space: 'O(n)',
    explanation:
      'Each ending compares with all earlier positions, and one length is stored per position.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [5, 2, 8, 3, 4, 10],
      [1, 1, 2, 2, 3, 4],
    ],
    rowLabels: ['score', 'best ending here'],
    columnLabels: ['0', '1', '2', '3', '4', '5'],
    highlightedCells: [{ row: 1, column: 5, label: '2, 3, 4, 10' }],
    dependencyCells: [
      { row: 1, column: 2 },
      { row: 1, column: 4 },
    ],
  },
  workedExample: {
    prompt:
      'For scores [5, 2, 8, 3, 4, 10], ending lengths are [1, 1, 2, 2, 3, 4]. One longest selection is 2, 3, 4, 10.',
    code: [
      'ending = [1] * len(scores)',
      'for i in range(len(scores)):',
      '    for j in range(i):',
      '        if scores[j] < scores[i]:',
      '            ending[i] = max(ending[i], ending[j] + 1)',
      'return max(ending, default=0)',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Scores 5 and 2 each begin a length-1 sequence.',
      'Score 8 extends either earlier score, reaching length 2.',
      'Score 3 extends 2, and score 4 extends that result to length 3.',
      'Score 10 extends the length-3 ending at 4, producing length 4.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state allows a later score to choose the best among many earlier rising sequences?',
    correct:
      'Store the longest increasing subsequence length that ends at each position.',
    distractors: [
      'Count only consecutive pairs where the next score is larger.',
      'Remember only the smallest score seen so far and no sequence length.',
      'Generate every subsequence before testing whether it increases.',
    ],
    hint: 'The same current score may extend several different earlier endings.',
  },
  retrievalCheck: {
    prompt:
      'When scores[j] < scores[i], what candidate can update ending[i]?',
    acceptedAnswers: [
      'ending[j] + 1',
      'ending[j]+1',
      '1 + ending[j]',
      '1+ending[j]',
      'one plus ending[j]',
      'the earlier ending length plus one',
    ],
    placeholder: 'Type the candidate',
    hint: 'Append the current score to a valid sequence ending at j.',
  },
  reconstructionPrompt:
    'Order the quadratic subsequence scan from single-score bases to the maximum ending.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains ratings, an integer list. Return the length of its longest strictly increasing subsequence.',
    starterCode: `def solve(data):
    ratings = data["ratings"]
    ending = [1] * len(ratings)

    for i in range(len(ratings)):
        for j in range(i):
            if ratings[j] < ratings[i]:
                # Extend the best compatible sequence ending at j.
                pass

    return max(ending, default=0)`,
    cases: {
      visibleExample: {
        input: { ratings: [5, 2, 8, 3, 4, 10] },
        expected: 4,
      },
      hiddenBoundary: { input: { ratings: [] }, expected: 0 },
      hiddenAdversarial: { input: { ratings: [9, 9, 9, 9] }, expected: 1 },
    },
    hints: [
      'Every position begins with ending length 1.',
      'Use ending[i] = max(ending[i], ending[j] + 1).',
      'Equal values do not satisfy the strict comparison.',
    ],
  },
})

export const problemLesson = createProblemMission(
  longestIncreasingSubsequenceMissionSeed,
)

export default problemLesson
