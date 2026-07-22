import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const maxAreaOfIslandMissionSeed = createRealm4MissionSeed({
  slug: 'max-area-of-island',
  estimatedMinutes: 22,
  mission: {
    title: 'The Largest Solar Patch',
    context:
      'A satellite image marks roof squares with solar panels as 1 and unused squares as 0. Panels form one patch only through shared edges.',
    prompt:
      'Measure every separate solar patch and return the number of cells in the largest one.',
  },
  objective:
    'Compute component sizes by making each flood fill return its cell count and tracking the maximum.',
  priorKnowledge: [
    'A flood fill reaches one full four-direction component.',
    'A recursive return value can combine work from child calls.',
    'A running maximum keeps the largest completed measurement.',
  ],
  recognitionCue:
    'The grid contains connected regions, but the question asks for the size of the largest region rather than their count.',
  misconception:
    'Adding all panel cells together merges separate patches into one false area.',
  keyRule:
    'A fill returns 0 for invalid or visited cells and otherwise returns 1 plus the four neighbor areas.',
  algorithmSteps: [
    { id: 'open-visited', instruction: 'Create visited state and set the best area to zero.' },
    { id: 'define-zero-case', instruction: 'Make flood return zero for water, bounds, or visited cells.' },
    { id: 'mark-panel', instruction: 'Mark a valid panel cell before exploring neighbors.' },
    { id: 'sum-neighbors', instruction: 'Return one plus the areas from four recursive neighbor calls.' },
    { id: 'scan-starts', instruction: 'Run flood from each grid cell and update the maximum.' },
    { id: 'return-largest', instruction: 'Return the largest completed area.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Every cell is scanned and each panel enters a fill once; visited state and a worst-case recursive frontier can cover the matrix.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0, 0],
        [1, 0, 0, 1],
        [1, 1, 0, 1],
        [0, 0, 1, 1],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 2, column: 0 },
        { row: 2, column: 1, label: 'area 5' },
      ],
    },
  },
  workedExample: {
    prompt:
      'The left solar patch covers five edge-connected cells. The right patch covers four, so the largest measurement remains five.',
    code: [
      'flood left start -> 1 + neighbor areas',
      'mark five connected left cells -> area 5',
      'best = max(0, 5)',
      'flood right start -> area 4',
      'best = max(5, 4) -> return 5',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Each marked cell contributes exactly one to its fill.',
      'Zero cells and already marked cells contribute zero.',
      'The left and right patches are separated by an empty column.',
      'Comparing completed fill totals chooses five.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0, 0],
        [1, 0, 0, 1],
        [1, 1, 0, 1],
        [0, 0, 1, 1],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 2, column: 0 },
        { row: 2, column: 1, label: 'largest' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'A flood call lands on an already measured panel. What area should that call contribute?',
    options: [
      { id: 'contribute-zero', label: 'Return 0 so the cell is not counted twice.' },
      { id: 'contribute-one', label: 'Return 1 again because it is a panel.' },
      { id: 'restart-fill', label: 'Clear visited and measure the patch again.' },
      { id: 'return-best', label: 'Return the largest global area found so far.' },
    ],
    correctOptionId: 'contribute-zero',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1],
        [1, 0],
      ],
      highlightedCells: [{ row: 0, column: 1, label: 'already counted' }],
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the area recurrence for a new panel cell: area equals ______.',
    acceptedAnswers: [
      '1 plus the four neighbor areas',
      'one plus flood in each orthogonal direction',
      '1 + up + down + left + right',
      'one plus the four neighbor areas',
      '1 plus the areas of the four neighbors',
      '1 + the four neighbor areas',
      '1+up+down+left+right',
      'one plus the areas of its four neighbors',
    ],
    placeholder: 'Type the recurrence',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 1, 0],
      ],
      highlightedCells: [{ row: 1, column: 1, label: '+1' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the area survey: initialize, reject invalid cells, mark, sum four fills, scan starts, update best, return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1],
        [0, 1],
      ],
      pointers: [{ row: 0, column: 0, label: 'start' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["panelMap"], a rectangular 0-and-1 matrix, and return the area of its largest orthogonally connected 1 region.',
    starterCode: `def solve(data):
    panels = data["panelMap"]
    visited = set()

    def area(row, column):
        # Return zero for invalid cells; otherwise count this component.
        pass

    largest = 0
    # Scan all possible component starts and update largest.
    return largest`,
    cases: {
      visibleExample: {
        input: {
          panelMap: [
            [1, 1, 0, 0],
            [1, 0, 0, 1],
            [1, 1, 0, 1],
            [0, 0, 1, 1],
          ],
        },
        expected: 5,
      },
      hiddenBoundary: {
        input: { panelMap: [[0]] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          panelMap: [
            [1, 0],
            [0, 1],
          ],
        },
        expected: 1,
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0],
        [1, 0, 1],
        [1, 1, 1],
      ],
      highlightedCells: [{ row: 0, column: 0, label: 'measure component' }],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(maxAreaOfIslandMissionSeed)

export default problemLesson
