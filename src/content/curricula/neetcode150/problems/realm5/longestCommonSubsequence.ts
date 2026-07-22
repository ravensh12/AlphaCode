import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const longestCommonSubsequenceMissionSeed = buildRealm5Mission({
  slug: 'longest-common-subsequence',
  estimatedMinutes: 25,
  mission: {
    title: 'The Shared Transmission Skeleton',
    context:
      'Two field radios recorded related messages with extra symbols mixed into each copy. A symbol order is useful only when it appears in both recordings in the same relative order.',
    prompt:
      'Return the greatest number of symbols in a shared ordered subsequence. Symbols may be skipped, but neither recording may be reordered.',
  },
  objective:
    'Compare prefixes of two sequences with a grid recurrence for matching and nonmatching final symbols.',
  priorKnowledge: [
    'A subsequence keeps relative order while allowing skipped symbols.',
    'A two-dimensional state can represent one prefix from each string.',
  ],
  recognitionCue:
    'Two sequences must preserve order while maximizing a shared subsequence that need not be contiguous.',
  misconception:
    'Matching each symbol to its first occurrence in the other string can block a longer alignment later.',
  algorithmSteps: [
    {
      id: 'create-prefix-grid',
      instruction: 'Create a grid with one extra empty-prefix row and column, filled with zero.',
    },
    {
      id: 'scan-prefix-pairs',
      instruction: 'Process every nonempty pair of prefixes.',
    },
    {
      id: 'extend-diagonal-match',
      instruction: 'When final symbols match, use the diagonal prefix answer plus one.',
    },
    {
      id: 'skip-one-mismatch',
      instruction: 'Otherwise keep the larger answer from dropping either final symbol.',
    },
    {
      id: 'return-full-pair',
      instruction: 'Return the bottom-right grid value.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(m × n)',
    explanation:
      'Every pair of prefix lengths is filled once in a rectangular table.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1],
      [0, 1, 2, 2, 2],
      [0, 1, 2, 3, 3],
      [0, 1, 2, 3, 3],
    ],
    rowLabels: ['∅', 'm', 'o', 's', 's'],
    columnLabels: ['∅', 'm', 'o', 's', 't'],
    highlightedCells: [{ row: 4, column: 4, label: 'length 3' }],
    dependencyCells: [
      { row: 3, column: 3 },
      { row: 3, column: 4 },
      { row: 4, column: 3 },
    ],
  },
  workedExample: {
    prompt:
      'For recordings "moss" and "most", the grid reaches 3. One shared skeleton is m, o, s; the extra s and t cannot both extend it.',
    code: [
      'dp = [[0] * 5 for _ in range(5)]',
      'for i in range(1, 5):',
      '    for j in range(1, 5):',
      '        if first[i - 1] == second[j - 1]: dp[i][j] = dp[i - 1][j - 1] + 1',
      '        else: dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])',
      'return dp[4][4]',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Matching m extends the empty prefixes to length 1.',
      'Matching o extends the diagonal state to length 2.',
      'The first shared s extends the alignment to length 3.',
      'At the final s/t mismatch, the best up-or-left value remains 3.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state can represent all safe alignments after either recording skips a symbol?',
    correct:
      'Store the best shared subsequence length for every pair of prefixes.',
    distractors: [
      'Match each symbol greedily to the earliest equal symbol in the other recording.',
      'Remember only the number of equal symbols at matching indices.',
      'Generate every subsequence of both recordings and compare all pairs.',
    ],
    hint: 'A mismatch creates two smaller prefix choices.',
  },
  retrievalCheck: {
    prompt:
      'What transition is used when the final symbols of two prefixes do not match?',
    acceptedAnswers: [
      'max(dp[i - 1][j], dp[i][j - 1])',
      'max(dp[i-1][j], dp[i][j-1])',
      'max(dp[i-1][j],dp[i][j-1])',
      'max(dp[i][j - 1], dp[i - 1][j])',
      'max(dp[i][j-1], dp[i-1][j])',
      'max(up, left)',
      'max(left, up)',
      'take the larger result after dropping either final symbol',
    ],
    placeholder: 'Type the mismatch transition',
    hint: 'Skip one final symbol, but not both at once.',
  },
  reconstructionPrompt:
    'Order the two-prefix table fill from empty borders through match and mismatch transitions.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains strings first and second. Return the length of their longest common subsequence.',
    starterCode: `def solve(data):
    first = data["first"]
    second = data["second"]
    dp = [[0] * (len(second) + 1) for _ in range(len(first) + 1)]

    for i in range(1, len(first) + 1):
        for j in range(1, len(second) + 1):
            if first[i - 1] == second[j - 1]:
                # Extend the diagonal match.
                pass
            else:
                # Keep the better one-symbol skip.
                pass

    return dp[len(first)][len(second)]`,
    cases: {
      visibleExample: {
        input: { first: 'moss', second: 'most' },
        expected: 3,
      },
      hiddenBoundary: {
        input: { first: '', second: 'beacon' },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { first: 'aaaa', second: 'aa' },
        expected: 2,
      },
    },
    hints: [
      'A match uses dp[i - 1][j - 1] + 1.',
      'A mismatch uses max(dp[i - 1][j], dp[i][j - 1]).',
      'The extra row and column already cover empty prefixes.',
    ],
  },
})

export const problemLesson = createProblemMission(
  longestCommonSubsequenceMissionSeed,
)

export default problemLesson
