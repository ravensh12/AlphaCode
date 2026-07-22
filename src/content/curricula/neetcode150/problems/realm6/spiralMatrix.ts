import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const spiralMatrixMissionSeed = {
  slug: 'spiral-matrix',
  estimatedMinutes: 22,
  mission: {
    title: 'The Greenhouse Sensor Spiral',
    context:
      'A greenhouse arranges soil sensors in a rectangular JSON grid. A maintenance rover begins at the top-left sensor and circles inward clockwise.',
    prompt:
      'Return the sensor readings in the exact order the rover visits them, with every cell included once.',
  },
  objective:
    'Shrink four matrix boundaries after traversing each side of a clockwise layer.',
  priorKnowledge: [
    'A rectangular matrix has rows and columns.',
    'Four indices can describe the unvisited rectangle.',
    'A loop may stop when opposite boundaries cross.',
  ],
  recognitionCue:
    'A grid traversal follows the outside edge, then repeats on a smaller inner rectangle.',
  misconception:
    'Always traversing the bottom and left sides can duplicate cells when only one row or one column remains.',
  algorithmSteps: [
    {
      id: 'set-bounds',
      instruction: 'Set top, bottom, left, and right around the full grid.',
    },
    {
      id: 'cross-top',
      instruction: 'Read the top edge left to right, then move top inward.',
    },
    {
      id: 'cross-right',
      instruction: 'Read the right edge top to bottom, then move right inward.',
    },
    {
      id: 'guard-inner',
      instruction: 'Continue only if top <= bottom and left <= right.',
    },
    {
      id: 'cross-bottom-left',
      instruction:
        'Read the bottom edge right to left and left edge bottom to top, shrinking both.',
    },
  ],
  complexity: {
    time: 'O(rows × columns)',
    space: 'O(1) beyond output',
    explanation:
      'Every grid cell enters the output once, while four boundary integers guide the walk.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'start' },
        { row: 0, column: 3, label: 'turn' },
        { row: 2, column: 3, label: 'turn' },
      ],
      pointers: [{ row: 0, column: 0, label: 'rover' }],
    },
  },
  workedExample: {
    prompt:
      'On [[1,2,3],[4,5,6],[7,8,9]], the rover takes 1,2,3 across; 6,9 down; 8,7 back; 4 up; then the center 5.',
    code: [
      'top edge:    [1, 2, 3]',
      'right edge:  [6, 9]',
      'bottom edge: [8, 7]',
      'left edge:   [4]',
      'inner cell:  [5]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The outside ring contributes eight values.',
      'Each completed side moves its boundary inward.',
      'The guards prevent any side from visiting a crossed boundary.',
      'The final center is visited as a one-cell top edge.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: '1' },
        { row: 0, column: 1, label: '2' },
        { row: 0, column: 2, label: '3' },
        { row: 1, column: 2, label: '4' },
        { row: 2, column: 2, label: '5' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Why are boundary checks needed before crossing the bottom and left edges?',
    options: [
      {
        id: 'avoid-duplicates',
        label:
          'The remaining layer may have collapsed to one row or column already visited.',
      },
      {
        id: 'sort-values',
        label: 'The checks keep sensor values in numerical order.',
      },
      {
        id: 'square-only',
        label: 'The checks turn every rectangle into a square.',
      },
    ],
    correctOptionId: 'avoid-duplicates',
    feedback: {
      correct: 'Yes. Crossed boundaries mean that side no longer exists.',
      incorrect: 'The boundaries control positions, not sensor value order or grid shape.',
      secondIncorrect:
        'A one-row layer is consumed by the top pass; do not consume it again as the bottom.',
    },
    hints: [
      'Picture a grid with only one row.',
      'After the top boundary moves, top may be greater than bottom.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[4, 5, 6, 7]],
      highlightedCells: [
        { row: 0, column: 0, label: 'top and bottom' },
        { row: 0, column: 3, label: 'same row' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the condition that says an unvisited rectangle still exists.',
    acceptedAnswers: [
      'top <= bottom and left <= right',
      'top is less than or equal to bottom and left is less than or equal to right',
      'top <= bottom && left <= right',
      'top<=bottom and left<=right',
      'top<=bottom && left<=right',
      'left <= right and top <= bottom',
    ],
    placeholder: 'top ... bottom and left ... right',
    feedback: {
      correct: 'Correct. Both pairs of boundaries must remain ordered.',
      incorrect: 'Include a comparison for rows and another for columns.',
      secondIncorrect: 'Use top <= bottom and left <= right.',
    },
    hints: [
      'Rows remain when top has not passed bottom.',
      'Columns remain when left has not passed right.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the rover’s clockwise layer routine.',
    feedback: {
      correct: 'The rover now circles inward without skipping or repeating a sensor.',
      incorrect: 'A clockwise layer begins across the top and down the right.',
      secondIncorrect:
        'Set bounds; cross top; cross right; guard; then cross bottom and left.',
    },
    hints: [
      'Move a boundary immediately after its side is complete.',
      'The guard belongs before the return trip.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies a non-empty rectangular integer matrix in data["matrix"]. Return one JSON list containing its readings in clockwise inward order.',
    starterCode: `def solve(data):
    matrix = data["matrix"]
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    order = []

    while top <= bottom and left <= right:
        # TODO: traverse and shrink the four sides with guards.
        break

    return order`,
    cases: {
      visibleExample: {
        input: {
          matrix: [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
          ],
        },
        expected: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7],
      },
      hiddenBoundary: {
        input: { matrix: [[5]] },
        expected: [5],
      },
      hiddenAdversarial: {
        input: {
          matrix: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            [10, 11, 12],
          ],
        },
        expected: [1, 2, 3, 6, 9, 12, 11, 10, 7, 4, 5, 8],
      },
    },
    feedback: {
      correct: 'The rover samples every sensor exactly once in a clean spiral.',
      incorrect:
        'The route skipped or repeated a cell. Recheck boundary updates and single-row or single-column layers.',
      secondIncorrect:
        'Traverse top and right, guard crossed bounds, then traverse bottom and left.',
    },
    hints: [
      'Use ranges based on the current boundaries, not the original dimensions.',
      'Increment top and decrement right after their passes.',
      'Before bottom and left, verify top <= bottom and left <= right.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10, 11, 12],
      ],
      pointers: [{ row: 3, column: 2, label: 'outer turn' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(spiralMatrixMissionSeed)

export default problemLesson
