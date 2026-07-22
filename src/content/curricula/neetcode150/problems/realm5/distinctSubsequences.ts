import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const distinctSubsequencesMissionSeed = buildRealm5Mission({
  slug: 'distinct-subsequences',
  estimatedMinutes: 27,
  mission: {
    title: 'The Hidden Call-Sign Count',
    context:
      'A long radio log may hide a short call sign many times. Each copy is formed by keeping selected log positions in order and deleting the rest.',
    prompt:
      'Return how many position-based subsequences of the source spell the entire target call sign.',
  },
  objective:
    'Count ways to form each target prefix while scanning source positions exactly once.',
  priorKnowledge: [
    'Equal characters at different source positions create different subsequences.',
    'A source character may be skipped or used to extend one matching target prefix.',
  ],
  recognitionCue:
    'The task counts how many ways one sequence can delete items to become another sequence.',
  misconception:
    'Updating target prefixes from left to right lets one source character fill multiple target positions.',
  algorithmSteps: [
    {
      id: 'seed-empty-target',
      instruction: 'Set the empty-target count to one and all nonempty target-prefix counts to zero.',
    },
    {
      id: 'scan-source-symbols',
      instruction: 'Read source symbols from left to right.',
    },
    {
      id: 'scan-target-backward',
      instruction: 'For each source symbol, inspect target positions from right to left.',
    },
    {
      id: 'extend-matching-prefix',
      instruction:
        'When symbols match, add the count for the previous target prefix into the next prefix.',
    },
    {
      id: 'return-full-target-count',
      instruction: 'Return the count for the complete target.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(n)',
    explanation:
      'Each source symbol checks every target position, and one target-length count row is stored.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [1, 0, 0, 0],
      [1, 1, 0, 0],
      [1, 1, 1, 0],
      [1, 2, 1, 0],
      [1, 3, 1, 0],
      [1, 3, 4, 0],
      [1, 3, 4, 4],
    ],
    rowLabels: ['∅', 'p', 'pe', 'pep', 'pepp', 'peppe', 'pepper'],
    columnLabels: ['∅', 'p', 'pe', 'per'],
    highlightedCells: [{ row: 6, column: 3, label: '4 copies' }],
    dependencyCells: [
      { row: 5, column: 2 },
      { row: 5, column: 3 },
    ],
  },
  workedExample: {
    prompt:
      'The source "pepper" contains target "per" in four position-based ways. Before the final r, four choices already spell "pe", and each can append that r.',
    code: [
      'ways = [1, 0, 0, 0]',
      'for symbol in source:',
      '    for j in range(len(target) - 1, -1, -1):',
      '        if symbol == target[j]:',
      '            ways[j + 1] += ways[j]',
      'return ways[len(target)]',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The first p starts one "p" prefix.',
      'Later p positions raise the "p" count to three.',
      'The two e positions create four ordered "pe" choices in total.',
      'The final r extends all four "pe" choices, producing four "per" subsequences.',
    ],
  },
  patternCheck: {
    prompt:
      'Which update counts source positions separately without using one position twice?',
    correct:
      'Scan target positions backward and add ways[j] into ways[j + 1] on a character match.',
    distractors: [
      'Greedily match each target symbol to the earliest available source symbol.',
      'Store only whether each target prefix is possible.',
      'Generate every source subsequence and compare its text to the target.',
    ],
    hint: 'Backward order protects ways[j] from changes made by the current source symbol.',
  },
  retrievalCheck: {
    prompt:
      'Why must the one-row target update run from right to left?',
    acceptedAnswers: [
      'to avoid using the same source character more than once',
      'to avoid reusing the same source character',
      'so the same source character is not used twice',
      'so a source character cannot be used twice',
      'so the current source symbol cannot fill multiple target positions',
      'so one source position cannot fill multiple target positions',
      'to preserve previous source-prefix counts',
    ],
    placeholder: 'State the update-order invariant',
    hint: 'Every update for one source position must read counts from before that position.',
  },
  reconstructionPrompt:
    'Order the subsequence counter from its empty-target base through backward matching updates.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains source and target strings. Return the number of distinct source-position subsequences equal to target.',
    starterCode: `def solve(data):
    source = data["source"]
    target = data["target"]
    ways = [1] + [0] * len(target)

    for symbol in source:
        for j in range(len(target) - 1, -1, -1):
            if symbol == target[j]:
                # Extend target prefix j with this source position.
                pass

    return ways[len(target)]`,
    cases: {
      visibleExample: {
        input: { source: 'pepper', target: 'per' },
        expected: 4,
      },
      hiddenBoundary: {
        input: { source: 'signal', target: '' },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { source: 'aaaaa', target: 'aaa' },
        expected: 10,
      },
    },
    hints: [
      'ways[0] stays 1 for the empty target.',
      'On a match, use ways[j + 1] += ways[j].',
      'Keep the target loop descending.',
    ],
  },
})

export const problemLesson = createProblemMission(
  distinctSubsequencesMissionSeed,
)

export default problemLesson
