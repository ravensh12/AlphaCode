import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const setMatrixZeroesMissionSeed = {
  slug: 'set-matrix-zeroes',
  estimatedMinutes: 24,
  mission: {
    title: 'The Silent Beacon Grid',
    context:
      'A science museum controls a rectangular wall of light beacons. A zero reading means its entire row wire and column wire must be switched off.',
    prompt:
      'Return the JSON matrix after every row and column containing an original zero has been filled with zeroes.',
  },
  objective:
    'Use the first row and first column as in-place marker storage.',
  priorKnowledge: [
    'A matrix row and column intersect at one cell.',
    'Markers can record work that must happen in a later pass.',
    'The first row and first column need separate zero flags.',
  ],
  recognitionCue:
    'A cell value triggers a change across both its complete row and complete column.',
  misconception:
    'Writing zeroes during the discovery scan creates new triggers that were not in the original grid.',
  algorithmSteps: [
    {
      id: 'remember-edges',
      instruction:
        'Record whether the original first row or first column contains a zero.',
    },
    {
      id: 'mark-interior',
      instruction:
        'For each interior zero at (row, column), zero its markers matrix[row][0] and matrix[0][column].',
    },
    {
      id: 'clear-interior',
      instruction:
        'Zero interior cells whose row or column marker is zero.',
    },
    {
      id: 'clear-edges',
      instruction:
        'Use the saved flags to zero the first row and first column last.',
    },
  ],
  complexity: {
    time: 'O(rows × columns)',
    space: 'O(1)',
    explanation:
      'A constant number of full-grid passes touch each cell, while markers reuse existing matrix cells.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [4, 0, 6],
        [7, 8, 9],
      ],
      highlightedCells: [
        { row: 1, column: 1, label: 'original zero' },
        { row: 1, column: 0, label: 'row marker' },
        { row: 0, column: 1, label: 'column marker' },
      ],
    },
  },
  workedExample: {
    prompt:
      'In [[1,2,0],[4,5,6],[7,8,9]], the top-row flag is true. Column marker 2 is zero, so column 2 clears; then the saved flag clears row 0.',
    code: [
      'first_row_zero = True',
      'column marker at matrix[0][2] is 0',
      'clear interior column 2',
      'clear the first row last',
      'result = [[0,0,0],[4,5,0],[7,8,0]]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The original zero appears in the first row, so save that fact separately.',
      'Its column marker already equals zero.',
      'Interior cells in column 2 become zero.',
      'Finally the saved top-row flag clears the complete first row.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 0, 0],
        [4, 5, 0],
        [7, 8, 0],
      ],
      highlightedCells: [
        { row: 0, column: 1, label: 'zero row' },
        { row: 2, column: 2, label: 'zero column' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Why should the first row and first column be cleared only after the interior?',
    options: [
      {
        id: 'preserve-markers',
        label: 'They hold markers that the interior pass still needs to read.',
      },
      {
        id: 'sort-grid',
        label: 'Clearing them last sorts every row.',
      },
      {
        id: 'avoid-corners',
        label: 'The top-left cell can never be zero.',
      },
    ],
    correctOptionId: 'preserve-markers',
    feedback: {
      correct: 'Yes. Erasing marker storage early would spread false information.',
      incorrect: 'The order protects marker data; it does not sort values or forbid a zero corner.',
      secondIncorrect:
        'Read all row and column markers before using saved flags to clear their storage edges.',
    },
    hints: [
      'What information is stored in matrix[row][0] and matrix[0][column]?',
      'That information must survive until interior cells are decided.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['corner', 'col mark', 'col mark'],
        ['row mark', 'cell', 'cell'],
        ['row mark', 'cell', 'cell'],
      ],
      highlightedCells: [
        { row: 0, column: 1, label: 'storage' },
        { row: 1, column: 0, label: 'storage' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type where an interior zero at (row, column) places its two markers.',
    acceptedAnswers: [
      'matrix[row][0] and matrix[0][column]',
      'first cell of its row and first cell of its column',
      'row marker at column 0 and column marker at row 0',
      'matrix[0][column] and matrix[row][0]',
      'matrix[row][0] and matrix[0][col]',
      'matrix[r][0] and matrix[0][c]',
    ],
    placeholder: 'two marker cells',
    feedback: {
      correct: 'Correct. Those edge cells represent the whole row and column.',
      incorrect: 'Name one cell in the first column and one in the first row.',
      secondIncorrect: 'Use matrix[row][0] and matrix[0][column].',
    },
    hints: [
      'A row marker lives at that row’s left edge.',
      'A column marker lives at that column’s top edge.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the beacon repair passes in their safe order.',
    feedback: {
      correct: 'Original zeroes are marked first, then changes are applied without chain reactions.',
      incorrect: 'The edge flags and markers must be captured before any clearing.',
      secondIncorrect:
        'Remember edge flags, mark interior zeroes, clear interior, then clear the edges.',
    },
    hints: [
      'Discovery comes before mutation.',
      'The first row and column are both storage and output.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Clear zero-triggered rows and columns directly inside data["matrix"]. The judge observes that matrix after solve returns; the function return value is ignored.',
    starterCode: `def solve(data):
    matrix = data["matrix"]
    rows, columns = len(matrix), len(matrix[0])
    first_row_zero = any(matrix[0][column] == 0 for column in range(columns))
    first_column_zero = any(matrix[row][0] == 0 for row in range(rows))

    # TODO: mark from interior zeroes, clear the interior, then clear edges.

    return None`,
    cases: {
      visibleExample: {
        input: {
          matrix: [
            [1, 2, 0],
            [4, 5, 6],
            [7, 8, 9],
          ],
        },
        expected: [
          [0, 0, 0],
          [4, 5, 0],
          [7, 8, 0],
        ],
      },
      hiddenBoundary: {
        input: { matrix: [[0]] },
        expected: [[0]],
      },
      hiddenAdversarial: {
        input: {
          matrix: [
            [1, 2, 3, 4],
            [0, 6, 7, 8],
            [9, 10, 0, 12],
          ],
        },
        expected: [
          [0, 2, 0, 4],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
    },
    observation: {
      kind: 'argument',
      argumentIndex: 0,
      path: ['matrix'],
      codec: {
        kind: 'list',
        item: { kind: 'list', item: { kind: 'integer' } },
      },
    },
    verificationNotes: [
      'The browser verifies the mutated matrix after solve returns.',
      'It cannot prove O(1) auxiliary space; keep markers in the first row and column.',
    ],
    feedback: {
      correct: 'Every silent beacon now clears exactly its original row and column.',
      incorrect:
        'The repaired grid is wrong. Check first-edge flags and avoid using newly written zeroes as discoveries.',
      secondIncorrect:
        'Mark interior first; clear interior from markers; then apply first_row_zero and first_column_zero.',
    },
    hints: [
      'Discovery loops should start at row 1 and column 1.',
      'Set matrix[row][0] and matrix[0][column] for each original interior zero.',
      'Clear the first row and first column only after interior cells.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 2, 0, 4],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      highlightedCells: [
        { row: 1, column: 0, label: 'original zero' },
        { row: 2, column: 2, label: 'original zero' },
      ],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(setMatrixZeroesMissionSeed)

export default problemLesson
