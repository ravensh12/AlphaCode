import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const longestIncreasingPathInAMatrixMissionSeed = buildRealm5Mission({
  slug: 'longest-increasing-path-in-a-matrix',
  estimatedMinutes: 29,
  mission: {
    title: 'The Uphill Sensor Trail',
    context:
      'A rover moves between north, south, east, and west neighboring terrain sensors. It may enter a sensor only when that sensor’s height is strictly greater than its current height.',
    prompt:
      'Return the greatest number of sensors the rover can visit in one strictly uphill trail.',
  },
  objective:
    'Memoize the longest uphill trail starting at each cell in the directed acyclic graph created by increasing moves.',
  priorKnowledge: [
    'Strictly increasing moves cannot return to an earlier height, so they cannot form a cycle.',
    'Many starting cells may reuse the answer for the same later cell.',
  ],
  recognitionCue:
    'A grid path may start anywhere, moves by local neighbors, and every move must increase a value.',
  misconception:
    'Starting only at the smallest cell can miss the longest trail when that cell cannot reach the useful region.',
  algorithmSteps: [
    {
      id: 'create-cell-memo',
      instruction: 'Create an unknown trail-length state for every cell.',
    },
    {
      id: 'define-cell-search',
      instruction: 'For one cell, begin with trail length one.',
    },
    {
      id: 'visit-higher-neighbors',
      instruction: 'Inspect each in-bounds neighbor whose height is strictly greater.',
    },
    {
      id: 'memoize-best-extension',
      instruction: 'Store one plus the longest memoized higher-neighbor trail.',
    },
    {
      id: 'compare-all-starts',
      instruction: 'Run the memoized search from every cell and return the maximum.',
    },
  ],
  complexity: {
    time: 'O(rows × columns)',
    space: 'O(rows × columns)',
    explanation:
      'Memoization finishes each cell once and inspects four neighbors; memo and recursion can hold every cell.',
  },
  diagram: {
    kind: 'grid',
    variant: 'grid',
    cells: [
      [8, 9, 4],
      [7, 6, 5],
      [2, 3, 1],
    ],
    rowLabels: ['north', 'middle', 'south'],
    columnLabels: ['west', 'center', 'east'],
    highlightedCells: [
      { row: 2, column: 2, label: '1' },
      { row: 2, column: 1, label: '3' },
      { row: 1, column: 1, label: '6' },
      { row: 1, column: 0, label: '7' },
      { row: 0, column: 0, label: '8' },
      { row: 0, column: 1, label: '9' },
    ],
  },
  workedExample: {
    prompt:
      'In the shown terrain, one trail is 1 → 3 → 6 → 7 → 8 → 9, using six neighboring cells. Memoized suffix lengths prevent repeated searches.',
    code: [
      'def trail(row, col):',
      '    if memo[row][col]: return memo[row][col]',
      '    best = 1',
      '    for next_row, next_col in neighbors(row, col):',
      '        if height[next_row][next_col] > height[row][col]:',
      '            best = max(best, 1 + trail(next_row, next_col))',
      '    memo[row][col] = best',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Cell 9 has no higher neighbor, so its trail length is 1.',
      'Cell 8 stores 2 by stepping to 9.',
      'Cells 7, 6, and 3 reuse the stored suffix and grow lengths 3, 4, and 5.',
      'Cell 1 extends to 3 and stores length 6.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan avoids recomputing the same uphill suffix from many starting cells?',
    correct:
      'Run DFS from every cell and memoize the longest trail starting at each cell.',
    distractors: [
      'Start at the globally smallest cell and always take the smallest higher neighbor.',
      'Remember only whether each cell has ever been visited by any start.',
      'Enumerate every simple grid path before checking whether heights rise.',
    ],
    hint: 'The answer from a cell depends only on higher neighbors, not on the path used to reach it.',
  },
  retrievalCheck: {
    prompt:
      'What value should memo[row][col] store?',
    acceptedAnswers: [
      'the longest increasing path starting at that cell',
      'the longest increasing path starting from that cell',
      'the longest increasing path from that cell',
      'longest increasing path starting at that cell',
      'longest increasing path starting from that cell',
      'longest increasing path from that cell',
      'the length of the longest increasing path starting at that cell',
      'the longest uphill trail starting at that cell',
      'longest uphill trail starting at that cell',
      'longest uphill trail starting at row col',
      'the longest uphill path from that cell',
      '1 plus the best higher-neighbor trail',
    ],
    placeholder: 'Describe the memo state',
    hint: 'Choose a direction for the state: this mission uses paths starting here.',
  },
  reconstructionPrompt:
    'Order the memoized terrain search from cell-state setup through comparison of all starts.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains heights, a nonempty rectangular integer grid. Return the maximum length of a strictly increasing four-direction path.',
    starterCode: `def solve(data):
    heights = data["heights"]
    rows, columns = len(heights), len(heights[0])
    memo = [[0] * columns for _ in range(rows)]
    directions = ((1, 0), (-1, 0), (0, 1), (0, -1))

    def trail(row, column):
        if memo[row][column] != 0:
            return memo[row][column]
        best = 1
        for dr, dc in directions:
            nr, nc = row + dr, column + dc
            if 0 <= nr < rows and 0 <= nc < columns and heights[nr][nc] > heights[row][column]:
                # Extend through this higher neighbor.
                pass
        memo[row][column] = best
        return best

    return max(trail(r, c) for r in range(rows) for c in range(columns))`,
    cases: {
      visibleExample: {
        input: { heights: [[8, 9, 4], [7, 6, 5], [2, 3, 1]] },
        expected: 6,
      },
      hiddenBoundary: { input: { heights: [[42]] }, expected: 1 },
      hiddenAdversarial: {
        input: { heights: [[5, 5], [5, 5]] },
        expected: 1,
      },
    },
    hints: [
      'Initialize a cell’s best trail to 1.',
      'For a higher neighbor, use best = max(best, 1 + trail(nr, nc)).',
      'Memoize before returning from the helper.',
    ],
  },
})

export const problemLesson = createProblemMission(
  longestIncreasingPathInAMatrixMissionSeed,
)

export default problemLesson
