import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const editDistanceMissionSeed = buildRealm5Mission({
  slug: 'edit-distance',
  estimatedMinutes: 26,
  mission: {
    title: 'The Message Repair Grid',
    context:
      'A damaged field note can be repaired one character at a time. One repair may insert a character, delete a character, or replace a character.',
    prompt:
      'Return the fewest repairs needed to transform the draft string into the goal string.',
  },
  objective:
    'Minimize edits over pairs of prefixes using match, insertion, deletion, and replacement transitions.',
  priorKnowledge: [
    'Transforming a prefix into an empty string requires deleting every character.',
    'When final characters match, no new edit is required.',
  ],
  recognitionCue:
    'One string must become another using unit-cost insert, delete, and replace operations.',
  misconception:
    'Counting mismatched positions fails when an insertion or deletion shifts all later positions.',
  algorithmSteps: [
    {
      id: 'initialize-empty-borders',
      instruction: 'Fill the empty-prefix row and column with their prefix lengths.',
    },
    {
      id: 'scan-prefix-grid',
      instruction: 'Process every nonempty draft/goal prefix pair.',
    },
    {
      id: 'copy-diagonal-match',
      instruction: 'If final characters match, copy the diagonal prefix cost.',
    },
    {
      id: 'minimize-three-edits',
      instruction:
        'Otherwise add one to the minimum of insertion, deletion, and replacement predecessor costs.',
    },
    {
      id: 'return-full-repair-cost',
      instruction: 'Return the bottom-right cost.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(m × n)',
    explanation:
      'Each pair of prefix lengths is solved once and stored in the repair grid.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [0, 1, 2, 3, 4, 5],
      [1, 0, 1, 2, 3, 4],
      [2, 1, 0, 1, 2, 3],
      [3, 2, 1, 1, 1, 2],
      [4, 3, 2, 1, 2, 2],
      [5, 4, 3, 2, 2, 2],
    ],
    rowLabels: ['∅', 't', 'tr', 'tra', 'trai', 'trail'],
    columnLabels: ['∅', 't', 'tr', 'tri', 'tria', 'trial'],
    highlightedCells: [{ row: 5, column: 5, label: '2 repairs' }],
    dependencyCells: [
      { row: 4, column: 4 },
      { row: 4, column: 5 },
      { row: 5, column: 4 },
    ],
  },
  workedExample: {
    prompt:
      'Changing "trail" into "trial" needs two repairs because the middle a and i exchange order, and swapping is not one allowed operation.',
    code: [
      'if draft[i - 1] == goal[j - 1]:',
      '    dp[i][j] = dp[i - 1][j - 1]',
      'else:',
      '    delete = dp[i - 1][j]',
      '    insert = dp[i][j - 1]',
      '    replace = dp[i - 1][j - 1]',
      '    dp[i][j] = 1 + min(delete, insert, replace)',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The shared prefix "tr" copies diagonal costs of zero.',
      'At the changed middle, each mismatch compares three possible previous repairs.',
      'Two replacements can turn a/i into i/a.',
      'The shared final l copies that cost, leaving answer 2.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state remains valid when one insertion shifts every later character?',
    correct:
      'Store the minimum repair cost for every pair of draft and goal prefixes.',
    distractors: [
      'Count only positions whose characters differ.',
      'Remember only the number of matching characters seen so far.',
      'Generate every string reachable by every edit sequence.',
    ],
    hint: 'Insertion and deletion change the two consumed-prefix lengths differently.',
  },
  retrievalCheck: {
    prompt:
      'At a mismatch, which three neighboring states are minimized before adding one?',
    acceptedAnswers: [
      'up, left, and diagonal',
      'up, left, diagonal',
      'up left and diagonal',
      'up left diagonal',
      'dp[i - 1][j], dp[i][j - 1], and dp[i - 1][j - 1]',
      'dp[i-1][j], dp[i][j-1], and dp[i-1][j-1]',
      'dp[i-1][j], dp[i][j-1], dp[i-1][j-1]',
      'the delete, insert, and replace predecessors',
      'delete, insert, and replace',
      'insert, delete, and replace',
    ],
    placeholder: 'Type the three predecessors',
    hint: 'Each allowed edit explains one neighboring grid direction.',
  },
  reconstructionPrompt:
    'Restore the repair-grid algorithm from empty borders through match and mismatch cases.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains draft and goal strings. Return the minimum number of single-character insertions, deletions, or replacements needed.',
    starterCode: `def solve(data):
    draft = data["draft"]
    goal = data["goal"]
    dp = [[0] * (len(goal) + 1) for _ in range(len(draft) + 1)]

    for i in range(len(draft) + 1):
        dp[i][0] = i
    for j in range(len(goal) + 1):
        dp[0][j] = j

    for i in range(1, len(draft) + 1):
        for j in range(1, len(goal) + 1):
            if draft[i - 1] == goal[j - 1]:
                # Copy the diagonal cost.
                pass
            else:
                # Add one to the best edit predecessor.
                pass

    return dp[len(draft)][len(goal)]`,
    cases: {
      visibleExample: {
        input: { draft: 'trail', goal: 'trial' },
        expected: 2,
      },
      hiddenBoundary: {
        input: { draft: '', goal: 'map' },
        expected: 3,
      },
      hiddenAdversarial: {
        input: { draft: 'aaaa', goal: 'bbbb' },
        expected: 4,
      },
    },
    hints: [
      'Matching characters use dp[i - 1][j - 1].',
      'A mismatch uses 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]).',
      'The initialized borders handle empty prefixes.',
    ],
  },
})

export const problemLesson = createProblemMission(editDistanceMissionSeed)

export default problemLesson
