import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const nQueensMissionSeed = createRealm4MissionSeed({
  slug: 'n-queens',
  estimatedMinutes: 28,
  mission: {
    title: 'The Laser-Tower Grid',
    context:
      'A technology club places one laser tower in each row of a square testing floor. Towers fire along their column and both diagonals, so no two towers may share any firing line.',
    prompt:
      'Return every safe floor plan. Process rows from top to bottom and test columns from left to right.',
  },
  objective:
    'Solve a row-by-row constraint search using occupied column and diagonal sets with exact backtracking.',
  priorKnowledge: [
    'Placing exactly one tower per row removes row conflicts automatically.',
    'Cells share a descending diagonal when row minus column matches.',
    'Cells share an ascending diagonal when row plus column matches.',
  ],
  recognitionCue:
    'A board needs one choice per row, and each choice must satisfy several reusable conflict rules.',
  misconception:
    'Checking columns alone misses towers that attack each other diagonally.',
  keyRule:
    'A cell (r, c) is safe only when c, r - c, and r + c are all unused; add all three before recursion and remove all three afterward.',
  algorithmSteps: [
    {
      id: 'open-board-state',
      instruction: 'Create an empty board and sets for used columns and both diagonal keys.',
    },
    {
      id: 'save-full-board',
      instruction: 'When row equals board size, convert the board to strings and save it.',
    },
    {
      id: 'scan-row-columns',
      instruction: 'Try each column from left to right in the current row.',
    },
    {
      id: 'reject-conflict',
      instruction: 'Skip a cell whose column or either diagonal key is already used.',
    },
    {
      id: 'place-tower',
      instruction: 'Place a tower and add its column, descending key, and ascending key.',
    },
    {
      id: 'advance-row',
      instruction: 'Recurse to the next row.',
    },
    {
      id: 'remove-tower',
      instruction: 'Erase the tower and remove all three keys before trying another column.',
    },
    {
      id: 'return-layouts',
      instruction: 'Return every saved layout in row-search order.',
    },
  ],
  complexity: {
    time: 'O(n!)',
    space: 'O(n) auxiliary',
    explanation:
      'Column uniqueness bounds the main search by permutations of columns, while the active placements and three constraint sets each use O(n) space.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', 'Q', '.', '.'],
        ['.', '.', '.', 'Q'],
        ['Q', '.', '.', '.'],
        ['.', '.', 'Q', '.'],
      ],
      highlightedCells: [
        { row: 0, column: 1, label: 'r-c=-1' },
        { row: 1, column: 3, label: 'r+c=4' },
        { row: 2, column: 0 },
        { row: 3, column: 2 },
      ],
    },
  },
  workedExample: {
    prompt:
      'On a 4-by-4 floor, placing towers at columns 1, 3, 0, and 2 for rows 0 through 3 creates one safe plan.',
    code: [
      'row 0: choose column 1',
      'row 1: columns 0,1,2 conflict; choose 3',
      'row 2: choose column 0',
      'row 3: choose column 2',
      'row 4 reached -> save the board',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Each chosen column is new, so no vertical firing line repeats.',
      'The r-c keys are -1, -2, 2, and 1, all distinct.',
      'The r+c keys are 1, 4, 2, and 5, also distinct.',
      'Reaching row 4 proves every row has one safe tower, so the layout is saved.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', 'Q', '.', '.'],
        ['.', '.', '.', 'Q'],
        ['Q', '.', '.', '.'],
        ['.', '.', 'Q', '.'],
      ],
      pointers: [{ row: 3, column: 2, label: 'last placement' }],
      highlightedCells: [
        { row: 0, column: 1 },
        { row: 1, column: 3 },
        { row: 2, column: 0 },
        { row: 3, column: 2 },
      ],
    },
  },
  patternCheck: {
    prompt:
      'A candidate cell has a free column. What else must be checked in constant time?',
    options: [
      {
        id: 'both-diagonal-keys',
        label:
          'Check whether row - column or row + column is already occupied.',
      },
      {
        id: 'same-row',
        label: 'Check only the current row, which already has no tower.',
      },
      {
        id: 'nearby-cells',
        label: 'Check only the eight immediately neighboring cells.',
      },
      {
        id: 'board-count',
        label: 'Check whether fewer than n towers exist anywhere.',
      },
    ],
    correctOptionId: 'both-diagonal-keys',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', 'Q', '.', '.'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
      ],
      highlightedCells: [
        { row: 0, column: 1, label: 'tower' },
        { row: 1, column: 0, label: 'diagonal' },
        { row: 1, column: 2, label: 'diagonal' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the two arithmetic keys used to identify the diagonals through cell (row, column).',
    acceptedAnswers: [
      'row - column and row + column',
      'r-c and r+c',
      'r minus c and r plus c',
      'row-column and row+column',
      'r - c and r + c',
      'row minus column and row plus column',
    ],
    placeholder: 'two diagonal formulas',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', '.', '.'],
        ['.', 'Q', '.'],
        ['.', '.', '.'],
      ],
      highlightedCells: [{ row: 1, column: 1, label: '(r,c)' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the floor planner: setup sets, full-board check, scan columns, reject conflicts, place and mark, recurse, unmark and erase, return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
      ],
      pointers: [{ row: 0, column: 0, label: 'scan row 0' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read positive integer data["size"] and return every safe tower layout as a list of row strings using "Q" and ".". Try columns left to right.',
    starterCode: `def solve(data):
    size = data["size"]
    board = [["."] * size for _ in range(size)]
    columns = set()
    descending = set()
    ascending = set()
    layouts = []

    def place(row):
        # Try safe columns, recurse, then remove all placement state.
        pass

    place(0)
    return layouts`,
    cases: {
      visibleExample: {
        input: { size: 4 },
        expected: [
          ['.Q..', '...Q', 'Q...', '..Q.'],
          ['..Q.', 'Q...', '...Q', '.Q..'],
        ],
      },
      hiddenBoundary: {
        input: { size: 1 },
        expected: [['Q']],
      },
      hiddenAdversarial: {
        input: { size: 3 },
        expected: [],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['.', 'Q', '.', '.'],
        ['.', '.', '.', 'Q'],
        ['Q', '.', '.', '.'],
        ['.', '.', 'Q', '.'],
      ],
      highlightedCells: [
        { row: 0, column: 1 },
        { row: 1, column: 3 },
        { row: 2, column: 0 },
        { row: 3, column: 2 },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(nQueensMissionSeed)

export default problemLesson
