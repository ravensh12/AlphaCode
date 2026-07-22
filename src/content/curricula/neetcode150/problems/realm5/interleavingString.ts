import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const interleavingStringMissionSeed = buildRealm5Mission({
  slug: 'interleaving-string',
  estimatedMinutes: 26,
  mission: {
    title: 'The Braided Message Channels',
    context:
      'Two operators sent symbol streams over separate channels. A recorder braided their symbols into one log while preserving the order within each original channel.',
    prompt:
      'Return whether the recorded log could be formed by taking every symbol from both streams in an order-preserving braid.',
  },
  objective:
    'Use a two-prefix reachability grid that chooses the next symbol from either source stream.',
  priorKnowledge: [
    'Every recorded position must come from exactly one source.',
    'A grid state can count how many symbols have been consumed from each source.',
  ],
  recognitionCue:
    'A third sequence must use all symbols from two sources while preserving each source’s internal order.',
  misconception:
    'Greedily taking a matching symbol from the first stream can fail when the same symbol appears in both streams.',
  algorithmSteps: [
    {
      id: 'check-braid-length',
      instruction: 'Reject the log if its length is not the sum of both source lengths.',
    },
    {
      id: 'seed-empty-sources',
      instruction: 'Mark the state using zero symbols from both sources as reachable.',
    },
    {
      id: 'scan-source-prefixes',
      instruction: 'Process every pair of consumed-source counts.',
    },
    {
      id: 'match-next-source',
      instruction:
        'Mark a state reachable from above or left when that source’s final symbol matches the corresponding log symbol.',
    },
    {
      id: 'return-full-braid',
      instruction: 'Return the state that consumed both complete sources.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(m × n)',
    explanation:
      'Every pair of source-prefix lengths is checked once in a boolean grid.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['T', 'F', 'F', 'F'],
      ['T', 'T', 'F', 'F'],
      ['F', 'T', 'T', 'F'],
      ['F', 'F', 'T', 'T'],
    ],
    rowLabels: ['A: ∅', 'A: A', 'A: AC', 'A: ACE'],
    columnLabels: ['B: ∅', 'B: B', 'B: BD', 'B: BDF'],
    highlightedCells: [{ row: 3, column: 3, label: 'ABCDEF' }],
    dependencyCells: [
      { row: 2, column: 3 },
      { row: 3, column: 2 },
    ],
  },
  workedExample: {
    prompt:
      'Streams "ACE" and "BDF" can form "ABCDEF": take A, then B, then C, D, E, and F while preserving both source orders.',
    code: [
      'dp[0][0] = True',
      'for i in range(4):',
      '    for j in range(4):',
      '        if i == 0 and j == 0: continue',
      '        k = i + j - 1',
      '        from_a = i > 0 and dp[i - 1][j] and a[i - 1] == merged[k]',
      '        from_b = j > 0 and dp[i][j - 1] and b[j - 1] == merged[k]',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'State (1, 0) consumes A from the first stream.',
      'State (1, 1) then consumes B from the second stream.',
      'Reachable states alternate through C, D, and E.',
      'State (3, 3) consumes F and proves the full braid.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state handles positions where either source could supply the same next symbol?',
    correct:
      'Record reachability for every pair of consumed-prefix lengths and allow transitions from either source.',
    distractors: [
      'Always consume from the first stream when both symbols match.',
      'Remember only the total number of consumed symbols.',
      'Generate every possible A/B choice string before comparing the merged log.',
    ],
    hint: 'The same merged index can be reached with different amounts consumed from A and B.',
  },
  retrievalCheck: {
    prompt:
      'For state (i, j), which merged-string index contains its newly consumed final symbol?',
    acceptedAnswers: [
      'i + j - 1',
      'i+j-1',
      'the index i plus j minus one',
    ],
    placeholder: 'Type the merged index',
    hint: 'The state has consumed i + j total symbols.',
  },
  reconstructionPrompt:
    'Restore the braid-reachability grid from length checking through both source transitions.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains laneA, laneB, and merged strings. Return true when merged is an order-preserving use of every symbol from both lanes.',
    starterCode: `def solve(data):
    lane_a = data["laneA"]
    lane_b = data["laneB"]
    merged = data["merged"]
    if len(merged) != len(lane_a) + len(lane_b):
        return False

    dp = [[False] * (len(lane_b) + 1) for _ in range(len(lane_a) + 1)]
    dp[0][0] = True
    for i in range(len(lane_a) + 1):
        for j in range(len(lane_b) + 1):
            if i == 0 and j == 0:
                continue
            k = i + j - 1
            # Set dp[i][j] from a matching reachable state above or left.
            pass

    return dp[len(lane_a)][len(lane_b)]`,
    cases: {
      visibleExample: {
        input: { laneA: 'ACE', laneB: 'BDF', merged: 'ABCDEF' },
        expected: true,
      },
      hiddenBoundary: {
        input: { laneA: '', laneB: '', merged: '' },
        expected: true,
      },
      hiddenAdversarial: {
        input: { laneA: 'ab', laneB: 'ac', merged: 'acba' },
        expected: false,
      },
    },
    hints: [
      'From above, laneA[i - 1] must equal merged[k].',
      'From left, laneB[j - 1] must equal merged[k].',
      'Combine the two valid predecessor conditions with or.',
    ],
  },
})

export const problemLesson = createProblemMission(interleavingStringMissionSeed)

export default problemLesson
