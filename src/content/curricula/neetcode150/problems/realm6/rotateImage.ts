import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const rotateImageMissionSeed = {
  slug: 'rotate-image',
  estimatedMinutes: 22,
  mission: {
    title: 'The Turning Tile Mural',
    context:
      'An art club stores a square tile mural as a JSON matrix. The display frame turns the design one quarter-turn clockwise.',
    prompt:
      'Return the square matrix after a 90-degree clockwise rotation, rearranging its existing cell values.',
  },
  objective:
    'Rotate a square matrix by transposing it and reversing every row.',
  priorKnowledge: [
    'A matrix cell is addressed by row and column.',
    'Transposing swaps matrix[row][column] with matrix[column][row].',
    'A Python list can be reversed in place.',
  ],
  recognitionCue:
    'Every cell of a square matrix must move through a fixed quarter-turn.',
  misconception:
    'Transposing alone reflects across the main diagonal; it does not complete a clockwise rotation.',
  algorithmSteps: [
    {
      id: 'transpose-upper',
      instruction:
        'For each cell above the main diagonal, swap it with its mirrored cell below.',
    },
    {
      id: 'reverse-rows',
      instruction: 'Reverse every row of the transposed matrix.',
    },
    {
      id: 'return-matrix',
      instruction: 'Return the rotated matrix as JSON.',
    },
  ],
  complexity: {
    time: 'O(n²)',
    space: 'O(1)',
    explanation:
      'The n by n cells are touched a constant number of times, and swaps need only temporary variables.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      rowLabels: ['top', 'middle', 'bottom'],
      highlightedCells: [
        { row: 0, column: 2, label: 'moves right' },
        { row: 2, column: 2, label: 'moves bottom' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For [[1,2,3],[4,5,6],[7,8,9]], transpose to [[1,4,7],[2,5,8],[3,6,9]], then reverse each row.',
    code: [
      'start     = [[1,2,3],[4,5,6],[7,8,9]]',
      'transpose = [[1,4,7],[2,5,8],[3,6,9]]',
      'reverse each row',
      'rotated   = [[7,4,1],[8,5,2],[9,6,3]]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The diagonal values 1, 5, and 9 stay in place during transpose.',
      'Each off-diagonal pair swaps row and column.',
      'Reversing rows moves the old bottom row to the new left-to-right positions.',
      'The final grid is a clockwise quarter-turn.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [7, 4, 1],
        [8, 5, 2],
        [9, 6, 3],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'old bottom-left' },
        { row: 0, column: 2, label: 'old top-left' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Which two in-place transformations produce a clockwise quarter-turn?',
    options: [
      {
        id: 'transpose-reverse-rows',
        label: 'Transpose across the main diagonal, then reverse each row.',
      },
      {
        id: 'reverse-rows-only',
        label: 'Reverse each row and stop.',
      },
      {
        id: 'transpose-only',
        label: 'Transpose across the main diagonal and stop.',
      },
    ],
    correctOptionId: 'transpose-reverse-rows',
    feedback: {
      correct: 'Exactly. The reflection plus horizontal flip creates the rotation.',
      incorrect: 'That transformation is only a reflection, not the requested turn.',
      secondIncorrect:
        'Use two stages: transpose first, then reverse every row.',
    },
    hints: [
      'Track where the old top-left and bottom-left cells should land.',
      'One operation swaps row/column; the other flips each row.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'a' },
        { row: 1, column: 0, label: 'c' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'After transposing for a clockwise rotation, what must happen to every row?',
    acceptedAnswers: [
      'reverse every row',
      'reverse each row',
      'reverse the rows individually',
      'flip each row',
      'flip every row',
      'reverse the rows',
      'each row must be reversed',
      'row.reverse()',
    ],
    placeholder: 'Do this to each row',
    feedback: {
      correct: 'Right. Reversing each row completes the clockwise turn.',
      incorrect: 'Name the list operation applied inside every row.',
      secondIncorrect: 'Answer: reverse each row.',
    },
    hints: [
      'It changes the left-to-right order.',
      'In Python, row.reverse() performs it in place.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the mural-turn instructions in the proper order.',
    feedback: {
      correct: 'The mural now turns clockwise without a second grid.',
      incorrect: 'The diagonal swaps must finish before row reversal.',
      secondIncorrect: 'Transpose the upper triangle, reverse rows, then return.',
    },
    hints: [
      'Avoid swapping both halves of the matrix or cells will swap back.',
      'Returning happens after both transformations.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Rotate data["matrix"] 90 degrees clockwise in place. The judge observes that matrix after solve returns; the function return value is ignored.',
    starterCode: `def solve(data):
    matrix = data["matrix"]
    size = len(matrix)

    # TODO: transpose by swapping only cells above the diagonal.

    for row in matrix:
        # TODO: reverse this row.
        pass

    return None`,
    cases: {
      visibleExample: {
        input: {
          matrix: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ],
        },
        expected: [
          [7, 4, 1],
          [8, 5, 2],
          [9, 6, 3],
        ],
      },
      hiddenBoundary: {
        input: { matrix: [[7]] },
        expected: [[7]],
      },
      hiddenAdversarial: {
        input: {
          matrix: [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
            [13, 14, 15, 16],
          ],
        },
        expected: [
          [13, 9, 5, 1],
          [14, 10, 6, 2],
          [15, 11, 7, 3],
          [16, 12, 8, 4],
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
      'It cannot prove constant auxiliary space; use transpose swaps and row reversal rather than allocating a second matrix.',
    ],
    feedback: {
      correct: 'The tile mural turns clockwise with every value preserved.',
      incorrect:
        'A tile landed incorrectly. Recheck diagonal swap bounds, operation order, and the one-cell case.',
      secondIncorrect:
        'For row in range(size), swap columns greater than row; then call reverse() on each row.',
    },
    hints: [
      'Loop column from row + 1 to size - 1.',
      'Swap matrix[row][column] with matrix[column][row].',
      'Then call row.reverse().',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [13, 9, 5, 1],
        [14, 10, 6, 2],
        [15, 11, 7, 3],
        [16, 12, 8, 4],
      ],
      highlightedCells: [{ row: 0, column: 0, label: 'old bottom-left' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(rotateImageMissionSeed)

export default problemLesson
