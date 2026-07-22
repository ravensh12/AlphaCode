import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const uniquePathsMissionSeed = buildRealm5Mission({
  slug: 'unique-paths',
  estimatedMinutes: 20,
  mission: {
    title: 'The Glasshouse Delivery Grid',
    context:
      'A garden cart starts in the northwest room of a rectangular glasshouse. Each move goes one room east or one room south until the cart reaches the southeast room.',
    prompt:
      'Given the row and column counts, return how many different valid routes reach the destination.',
  },
  objective:
    'Count grid routes by adding the route totals from the cell above and the cell to the left.',
  priorKnowledge: [
    'Every non-edge cell can be entered only from above or from the left.',
    'There is exactly one route along the top edge and left edge.',
  ],
  recognitionCue:
    'Movement through a grid is restricted to two forward directions, and the task counts all routes.',
  misconception:
    'Multiplying the row and column counts measures cells, not distinct move orders.',
  algorithmSteps: [
    {
      id: 'seed-edge-routes',
      instruction: 'Initialize the top row and left column with one route each.',
    },
    {
      id: 'scan-grid-rows',
      instruction: 'Process remaining rows from top to bottom.',
    },
    {
      id: 'scan-grid-columns',
      instruction: 'Within each row, process columns from left to right.',
    },
    {
      id: 'add-up-left',
      instruction: 'Set each cell count to the count above plus the count on its left.',
    },
    {
      id: 'return-southeast',
      instruction: 'Return the route count at the southeast cell.',
    },
  ],
  complexity: {
    time: 'O(rows × columns)',
    space: 'O(columns)',
    explanation:
      'Each cell is updated once, and one rolling row stores the counts.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5],
      [1, 3, 6, 10, 15],
      [1, 4, 10, 20, 35],
    ],
    rowLabels: ['row 0', 'row 1', 'row 2', 'row 3'],
    columnLabels: ['col 0', 'col 1', 'col 2', 'col 3', 'col 4'],
    highlightedCells: [{ row: 3, column: 4, label: 'destination' }],
    dependencyCells: [
      { row: 2, column: 4 },
      { row: 3, column: 3 },
    ],
  },
  workedExample: {
    prompt:
      'In a 4-by-5 glasshouse, the last room receives 15 routes from above and 20 from the left, for 35 total routes.',
    code: [
      'ways = [1] * 5',
      'for row in range(1, 4):',
      '    for col in range(1, 5):',
      '        ways[col] = ways[col] + ways[col - 1]',
      'return ways[4]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first row begins as [1, 1, 1, 1, 1].',
      'The second row becomes [1, 2, 3, 4, 5].',
      'The third row becomes [1, 3, 6, 10, 15].',
      'The final rolling row ends at 35.',
    ],
  },
  patternCheck: {
    prompt:
      'Which local transition counts every east/south route without tracing routes one at a time?',
    correct:
      'For each cell, add the route count from above to the route count from the left.',
    distractors: [
      'Multiply the current row number by the current column number.',
      'Remember only the route count in the previous diagonal cell.',
      'List every sequence of east and south moves and reject paths leaving the grid.',
    ],
    hint: 'Classify routes by their final move into a cell.',
  },
  retrievalCheck: {
    prompt:
      'Complete the grid transition: ways[row][col] = ______.',
    acceptedAnswers: [
      'ways[row - 1][col] + ways[row][col - 1]',
      'ways[row-1][col] + ways[row][col-1]',
      'ways[row-1][col]+ways[row][col-1]',
      'ways[row][col - 1] + ways[row - 1][col]',
      'ways[row][col-1] + ways[row-1][col]',
      'above + left',
      'left + above',
      'above plus left',
      'the count above plus the count to the left',
    ],
    placeholder: 'Type the two predecessors',
    hint: 'No other direction can enter the current room.',
  },
  reconstructionPrompt:
    'Order the route-table fill from edge initialization to the southeast answer.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains positive integers rows and columns. Return the number of east/south routes from the northwest cell to the southeast cell.',
    starterCode: `def solve(data):
    rows = data["rows"]
    columns = data["columns"]
    ways = [1] * columns

    for row in range(1, rows):
        for column in range(1, columns):
            # Combine the value above with the value to the left.
            pass

    return ways[-1]`,
    cases: {
      visibleExample: {
        input: { rows: 4, columns: 5 },
        expected: 35,
      },
      hiddenBoundary: {
        input: { rows: 1, columns: 1 },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { rows: 2, columns: 9 },
        expected: 9,
      },
    },
    hints: [
      'ways[column] still holds the count from the row above.',
      'ways[column - 1] already holds the count from the current row.',
      'Add those two values in place.',
    ],
  },
})

export const problemLesson = createProblemMission(uniquePathsMissionSeed)

export default problemLesson
