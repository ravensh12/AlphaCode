import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const validSudokuMissionSeed = {
  slug: 'valid-sudoku',
  estimatedMinutes: 23,
  mission: {
    title: 'The Four-Sector Rune Grid',
    context:
      'A temple console has a 4×4 board. Filled cells hold runes "1" through "4"; "." marks an empty cell. No filled rune may repeat in a row, column, or 2×2 sector.',
    prompt:
      'Check the current board only. It does not need to be complete or solvable; it only needs to obey all three uniqueness rules.',
  },
  objective:
    'Validate overlapping grid constraints with separate row, column, and sector sets.',
  priorKnowledge: [
    'A set detects whether a value was seen in one group.',
    'Rows and columns can be addressed by their indices.',
    'Integer division maps a cell to its 2×2 sector.',
  ],
  recognitionCue:
    'Each cell belongs to several groups, and duplicates are forbidden independently inside every group.',
  misconception:
    'Checking rows and columns alone misses a repeated rune inside a sector.',
  algorithmSteps: [
    { id: 'open-sets', instruction: 'Create four row sets, four column sets, and four sector sets.' },
    { id: 'scan-cells', instruction: 'Visit every board cell by row and column.' },
    { id: 'skip-empty', instruction: 'Skip "." because an empty cell creates no conflict.' },
    { id: 'locate-sector', instruction: 'Compute the sector from row // 2 and column // 2.' },
    { id: 'reject-repeat', instruction: 'Return false if the rune is in its row, column, or sector set.' },
    { id: 'record-rune', instruction: 'Otherwise add the rune to all three sets.' },
    { id: 'confirm-grid', instruction: 'Return true after every filled cell passes.' },
  ],
  complexity: {
    time: 'O(n²)',
    space: 'O(n²)',
    explanation:
      'A generalized n×n board visits n² cells and may store their runes; for this fixed 4×4 board both bounds are constant.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['1', '2', '.', '4'],
        ['3', '1', '4', '2'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'sector repeat' },
        { row: 1, column: 1, label: 'sector repeat' },
      ],
    },
  },
  workedExample: {
    prompt:
      'In the shown board, rune 1 at row 1, column 1 is new to its row and column, but row 0, column 0 already placed 1 in the same top-left sector.',
    code: [
      'def safe(board):',
      '    rows = [set() for _ in range(4)]',
      '    cols = [set() for _ in range(4)]',
      '    sectors = [set() for _ in range(4)]',
      '    for r in range(4):',
      '        for c in range(4):',
      '            rune = board[r][c]',
      '            if rune == ".": continue',
      '            sector = (r // 2) * 2 + c // 2',
      '            if rune in rows[r] or rune in cols[c] or rune in sectors[sector]: return False',
      '            rows[r].add(rune); cols[c].add(rune); sectors[sector].add(rune)',
      '    return True',
    ],
    currentLineIndex: 9,
    walkthrough: [
      'The first 1 enters row 0, column 0, and sector 0.',
      'The second 1 is not repeated in row 1 or column 1.',
      'Sector 0 already contains 1, so the board is invalid.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['1', '2', '.', '4'],
        ['3', '1', '4', '2'],
        ['.', '.', '.', '.'],
        ['.', '.', '.', '.'],
      ],
      pointers: [{ row: 1, column: 1, label: 'check three sets' }],
    },
  },
  patternCheck: {
    prompt:
      'What must be checked before recording one filled rune?',
    options: [
      { id: 'three-memberships', label: 'Membership in its row set, column set, and sector set.' },
      { id: 'row-only', label: 'Membership only in the current row set.' },
      { id: 'neighbors-only', label: 'Equality with only the four touching cells.' },
      { id: 'count-empties', label: 'Whether the board still contains an empty cell.' },
    ],
    correctOptionId: 'three-memberships',
    feedback: {
      correct: 'Exactly. One cell participates in all three constraints at once.',
      incorrect: 'That check ignores at least one group that can contain a duplicate.',
      secondIncorrect: 'Test the rune against row, column, and 2×2 sector sets.',
    },
    hints: ['A diagonal duplicate can share a sector.', 'Each filled cell enters three sets.'],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [['1', '.'], ['.', '1']],
      highlightedCells: [{ row: 0, column: 0 }, { row: 1, column: 1 }],
    },
  },
  retrievalCheck: {
    prompt:
      'For zero-based row r and column c, write the pair that identifies a 2×2 sector.',
    acceptedAnswers: [
      '(r // 2, c // 2)',
      'r // 2, c // 2',
      '(row // 2, column // 2)',
      'row//2 and col//2',
      '(r//2, c//2)',
      'r//2, c//2',
      'r//2 and c//2',
      'r // 2 and c // 2',
      '(row//2, col//2)',
      'row//2, col//2',
      'row // 2, col // 2',
    ],
    placeholder: 'Type the sector coordinates',
    feedback: {
      correct: 'Right. Integer division groups rows and columns in pairs.',
      incorrect: 'Use integer division on both coordinates.',
      secondIncorrect: 'The pair is (r // 2, c // 2).',
    },
    hints: ['Rows 0 and 1 share a sector row.', 'Columns 2 and 3 share a sector column.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the rune validator from empty sets to a successful final result.',
    feedback: {
      correct: 'Validator restored. Every filled rune is checked before it changes the sets.',
      incorrect: 'Do not record a rune before testing all three memberships.',
      secondIncorrect: 'Open sets, scan, skip dots, locate sector, reject repeats, record, then confirm.',
    },
    hints: ['Empty cells never enter a set.', 'True is safe only after the full grid scan.'],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [['1', '2'], ['3', '.']],
      pointers: [{ row: 1, column: 1, label: 'skip' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Validate data["board"], a 4×4 JSON grid containing ".", "1", "2", "3", or "4", against row, column, and 2×2-sector duplicates.',
    starterCode: `def solve(data):
    board = data["board"]
    rows = [set() for _ in range(4)]
    cols = [set() for _ in range(4)]
    sectors = [set() for _ in range(4)]

    # Scan each filled cell, check three sets, then record it.
    return True`,
    cases: {
      visibleExample: {
        input: {
          board: [
            ['1', '2', '.', '4'],
            ['3', '4', '1', '.'],
            ['2', '1', '4', '3'],
            ['4', '3', '2', '1'],
          ],
        },
        expected: true,
      },
      hiddenBoundary: {
        input: {
          board: [
            ['.', '.', '.', '.'],
            ['.', '.', '.', '.'],
            ['.', '.', '.', '.'],
            ['.', '.', '.', '.'],
          ],
        },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          board: [
            ['1', '.', '.', '.'],
            ['.', '1', '.', '.'],
            ['.', '.', '2', '.'],
            ['.', '.', '.', '2'],
          ],
        },
        expected: false,
      },
      additional: [
        {
          id: 'hidden-row-repeat',
          input: {
            board: [
              ['1', '.', '1', '.'],
              ['.', '.', '.', '.'],
              ['.', '.', '.', '.'],
              ['.', '.', '.', '.'],
            ],
          },
          expected: false,
          visibility: 'hidden',
        },
        {
          id: 'hidden-column-repeat',
          input: {
            board: [
              ['2', '.', '.', '.'],
              ['.', '.', '.', '.'],
              ['2', '.', '.', '.'],
              ['.', '.', '.', '.'],
            ],
          },
          expected: false,
          visibility: 'hidden',
        },
      ],
    },
    feedback: {
      correct: 'Rune grid verified! Your three-set check catches hidden sector conflicts.',
      incorrect: 'A duplicate escaped or an empty cell was counted. Recheck all three groups.',
      secondIncorrect: 'Skip ".", compute sector = (r//2)*2+c//2, test, then add to all sets.',
    },
    hints: [
      'Use nested loops over range(4).',
      'A flat sector index is (r // 2) * 2 + c // 2.',
      'Return false before adding a repeated rune.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [['1', '.'], ['.', '1']],
      highlightedCells: [{ row: 1, column: 1, label: 'same sector' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(validSudokuMissionSeed)
export default problemLesson
