import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const searchA2dMatrixMissionSeed = createRealm2MissionSeed({
  slug: 'search-a-2d-matrix',
  estimatedMinutes: 21,
  mission: {
    title: 'The Museum Locker Wall',
    context:
      'A museum stores artifact codes in a rectangular wall of lockers. Codes rise across each row, and every new row starts above the final code of the row before it.',
    prompt:
      'Report whether a requested code appears anywhere in the wall, including the possibility of an empty wall.',
  },
  objective:
    'Treat an ordered matrix as one virtual sorted array and binary-search it without copying values.',
  priorKnowledge: [
    'Ordinary binary search halves a sorted index range.',
    'Division and remainder can map a flat index to row and column.',
    'All rows have the same column count when the wall is nonempty.',
  ],
  recognitionCue:
    'Rows are internally sorted and their ranges do not overlap, so row-major order is globally sorted.',
  misconception:
    'Binary-searching every row separately adds unnecessary work and complicates deciding which row matters.',
  keyRule:
    'Map virtual index k to row k // columns and column k % columns, then apply ordinary binary search over 0 through rows*columns - 1.',
  algorithmSteps: [
    {
      id: 'handle-empty-wall',
      instruction: 'Return false if the matrix or its first row is empty.',
    },
    {
      id: 'set-flat-bounds',
      instruction:
        'Set low to 0 and high to row_count × column_count - 1.',
    },
    {
      id: 'choose-flat-middle',
      instruction: 'Choose the midpoint of the virtual index interval.',
    },
    {
      id: 'map-middle-cell',
      instruction:
        'Map mid to matrix[mid // columns][mid % columns].',
    },
    {
      id: 'compare-and-shrink',
      instruction:
        'Return true on a match; otherwise discard the too-small or too-large half.',
    },
    {
      id: 'report-missing-code',
      instruction: 'Return false when no virtual indices remain.',
    },
  ],
  complexity: {
    time: 'O(log(mn))',
    space: 'O(1)',
    explanation:
      'Binary search halves m×n virtual positions each step and stores only bounds plus one mapped coordinate.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16, 20, 24, 30],
      low: 0,
      high: 8,
      mid: 4,
    },
  },
  workedExample: {
    prompt:
      'In a 3-by-3 wall, flat midpoint 4 maps to row 1, column 1. That locker contains 12, so a request for 12 succeeds immediately.',
    code: [
      'rows = 3, columns = 3',
      'low = 0, high = 8, mid = 4',
      'row = 4 // 3 = 1',
      'column = 4 % 3 = 1',
      'matrix[1][1] is 12 -> return True',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Nine cells correspond to virtual indices 0 through 8.',
      'Midpoint 4 is chosen exactly as in a one-dimensional search.',
      'Quotient 1 selects the second row; remainder 1 selects its second cell.',
      'The mapped value matches without building a flattened copy.',
    ],
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16, 20, 24, 30],
      low: 0,
      high: 8,
      mid: 4,
    },
  },
  patternCheck: {
    prompt:
      'Which observation allows one logarithmic search across the whole locker wall?',
    options: [
      {
        id: 'virtual-sorted-array',
        label:
          'Row-major order is globally sorted, so map flat indices to cells.',
      },
      {
        id: 'search-every-row',
        label: 'Run a complete binary search on every row.',
      },
      {
        id: 'sort-all-cells',
        label: 'Copy and sort all cells before each request.',
      },
      {
        id: 'diagonal-only',
        label: 'Inspect only the main diagonal because rows are sorted.',
      },
    ],
    correctOptionId: 'virtual-sorted-array',
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16, 20, 24, 30],
      low: 0,
      high: 8,
      mid: 4,
    },
  },
  retrievalCheck: {
    prompt:
      'With c columns, how does flat index k map to a matrix location?',
    acceptedAnswers: [
      'row = k // c and column = k % c',
      'k // columns, k % columns',
      'matrix[k // c][k % c]',
      'row = k // c, column = k % c',
      'row = k//c and column = k%c',
      'matrix[k//c][k%c]',
      'k // c and k % c',
      'k//c, k%c',
    ],
    placeholder: 'Type the row and column formulas',
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16],
      low: 4,
      high: 5,
      mid: 4,
    },
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the virtual search from its empty guard and flat bounds through coordinate mapping and interval updates.',
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16],
      low: 2,
      high: 5,
      mid: 3,
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["matrix"] and data["target"]; return true when the target is present in the globally row-sorted wall.',
    starterCode: `def solve(data):
    matrix = data["matrix"]
    target = data["target"]
    if not matrix or not matrix[0]:
        return False

    rows, columns = len(matrix), len(matrix[0])
    low, high = 0, rows * columns - 1

    while low <= high:
        mid = low + (high - low) // 2
        # Map mid to a cell, compare it, and shrink the interval.
        pass

    return False`,
    cases: {
      visibleExample: {
        input: {
          matrix: [
            [1, 3, 5],
            [8, 12, 16],
            [20, 24, 30],
          ],
          target: 12,
        },
        expected: true,
      },
      hiddenBoundary: {
        input: { matrix: [], target: 4 },
        expected: false,
      },
      hiddenAdversarial: {
        input: {
          matrix: [
            [2, 6, 9],
            [13, 17, 21],
          ],
          target: 12,
        },
        expected: false,
      },
    },
    diagram: {
      kind: 'binarySearch',
      values: [1, 3, 5, 8, 12, 16, 20, 24, 30],
      low: 0,
      high: 8,
      mid: 4,
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(searchA2dMatrixMissionSeed)

export default problemLesson
