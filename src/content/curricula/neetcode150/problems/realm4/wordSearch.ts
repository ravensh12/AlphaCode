import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const wordSearchMissionSeed = createRealm4MissionSeed({
  slug: 'word-search',
  estimatedMinutes: 25,
  mission: {
    title: 'The Letter-Lantern Trail',
    context:
      'Campers arranged letter lanterns in a rectangular field. A secret trail spells a code by stepping north, south, east, or west, and one lantern cannot be used twice on the same trail.',
    prompt:
      'Report whether the requested code can be traced from some starting cell while obeying the movement and no-reuse rules.',
  },
  objective:
    'Search a grid with path-local marking, four-direction recursion, and precise success and boundary checks.',
  priorKnowledge: [
    'A grid cell is addressed by row and column.',
    'Four-direction movement changes exactly one coordinate by one.',
    'Backtracking can mark a choice temporarily and restore it later.',
  ],
  recognitionCue:
    'A sequence must be matched along neighboring grid cells, and cells cannot be reused within one candidate path.',
  misconception:
    'Leaving cells permanently marked after one failed starting path can hide a valid path that begins elsewhere.',
  keyRule:
    'A recursive frame must match the current letter, mark that cell only for its active path, explore four neighbors, then unmark on return.',
  algorithmSteps: [
    {
      id: 'handle-empty-code',
      instruction: 'Accept immediately when the requested code is empty.',
    },
    {
      id: 'try-each-start',
      instruction: 'Use every grid cell as a possible first lantern.',
    },
    {
      id: 'check-frame',
      instruction: 'Reject out-of-bounds, already-used, or mismatched cells.',
    },
    {
      id: 'finish-on-length',
      instruction: 'Accept when every code character has been matched.',
    },
    {
      id: 'mark-cell',
      instruction: 'Temporarily mark the matching cell as used on this path.',
    },
    {
      id: 'search-neighbors',
      instruction: 'Recurse to its four orthogonal neighbors for the next character.',
    },
    {
      id: 'restore-cell',
      instruction: 'Remove the mark before returning so another path may use the cell.',
    },
    {
      id: 'report-result',
      instruction: 'Return true on any successful start; otherwise return false.',
    },
  ],
  complexity: {
    time: 'O(r · c · 4^w)',
    space: 'O(w)',
    explanation:
      'Each of r·c starts can branch in four directions for a code of length w; the active path and recursion stack hold at most w cells.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['C', 'O', 'D'],
        ['A', 'D', 'E'],
        ['M', 'A', 'P'],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'C' },
        { row: 0, column: 1, label: 'O' },
        { row: 0, column: 2, label: 'D' },
        { row: 1, column: 2, label: 'E' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Trace CODE in the lantern field. Start at C in the upper-left, move east through O and D, then move south to E.',
    code: [
      'match (0,0) = C; mark it',
      'move east: (0,1) = O; mark it',
      'move east: (0,2) = D; mark it',
      'move south: (1,2) = E; all letters matched',
      'return true while restoring marks',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'C is a valid starting lantern for character zero.',
      'Each move changes only the column until the D lantern.',
      'The final move changes only the row, so it is allowed.',
      'The success travels back through the recursive calls; temporary marks do not leak into later searches.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['C', 'O', 'D'],
        ['A', 'D', 'E'],
        ['M', 'A', 'P'],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 2 },
        { row: 1, column: 2, label: 'finish' },
      ],
      pointers: [{ row: 1, column: 2, label: 'index 3' }],
    },
  },
  patternCheck: {
    prompt:
      'One attempted trail fails after several steps. What should happen before trying a different direction or starting lantern?',
    options: [
      {
        id: 'unmark-on-return',
        label: 'Unmark every cell as its recursive frame returns.',
      },
      {
        id: 'keep-all-marks',
        label: 'Keep all visited marks for every future starting lantern.',
      },
      {
        id: 'allow-diagonals',
        label: 'Add diagonal moves to escape the failed route.',
      },
      {
        id: 'reuse-current-cell',
        label: 'Reuse any earlier cell if its letter matches again.',
      },
    ],
    correctOptionId: 'unmark-on-return',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['A', 'B'],
        ['C', 'D'],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'marked' },
        { row: 0, column: 1, label: 'backtrack' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Name the two coordinate conditions that make a move orthogonal rather than diagonal.',
    acceptedAnswers: [
      'change one of row or column by one and keep the other unchanged',
      'move one row or one column, not both',
      'north south east or west only',
      'change exactly one coordinate by one',
      'one coordinate changes by one and the other stays the same',
      'change the row or the column by one, not both',
      'move one row or one column but not both',
      'up down left or right only',
    ],
    placeholder: 'Describe a legal coordinate move',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['N', 'N', 'N'],
        ['N', 'X', 'N'],
        ['N', 'N', 'N'],
      ],
      highlightedCells: [{ row: 1, column: 1, label: 'current' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the trail finder: empty check, choose starts, validate a frame, mark, search four neighbors, restore, and report.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['S', 'E'],
        ['A', 'R'],
      ],
      pointers: [{ row: 0, column: 0, label: 'start' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read the rectangular character matrix data["field"] and string data["trail"]. Return true when the trail can be formed by orthogonal moves without reusing a cell.',
    starterCode: `def solve(data):
    field = data["field"]
    trail = data["trail"]

    def search(row, column, index, used):
        # Check this frame, mark the cell, explore, then restore.
        pass

    # Try each cell as the first lantern.
    return False`,
    cases: {
      visibleExample: {
        input: {
          field: [
            ['C', 'O', 'D'],
            ['A', 'D', 'E'],
            ['M', 'A', 'P'],
          ],
          trail: 'CODE',
        },
        expected: true,
      },
      hiddenBoundary: {
        input: { field: [], trail: '' },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          field: [
            ['A', 'B'],
            ['C', 'D'],
          ],
          trail: 'ABDA',
        },
        expected: false,
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['C', 'O', 'D'],
        ['A', 'D', 'E'],
        ['M', 'A', 'P'],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 2 },
        { row: 1, column: 2 },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(wordSearchMissionSeed)

export default problemLesson
