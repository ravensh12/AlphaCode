import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const numberOfIslandsMissionSeed = createRealm4MissionSeed({
  slug: 'number-of-islands',
  estimatedMinutes: 22,
  mission: {
    title: 'The Rooftop Garden Survey',
    context:
      'A drone maps planted and empty roof squares. Planted squares belong to the same garden only when they touch along an edge, not merely at a corner.',
    prompt:
      'Count the separate rooftop gardens in the rectangular 0-and-1 map.',
  },
  objective:
    'Count connected grid components by starting one flood fill from each unvisited planted cell.',
  priorKnowledge: [
    'A matrix can be scanned row by row.',
    'Orthogonal neighbors differ by one row or one column.',
    'DFS or BFS can mark every reachable cell.',
  ],
  recognitionCue:
    'The task asks how many separate regions are formed by equal grid cells connected in four directions.',
  misconception:
    'Counting every planted square counts area, not connected regions.',
  keyRule:
    'Increment the answer only when an unvisited 1 starts a flood fill; that fill marks its entire orthogonal component.',
  algorithmSteps: [
    { id: 'open-visited', instruction: 'Create an empty visited-cell set and a garden count of zero.' },
    { id: 'scan-grid', instruction: 'Scan every row and column in the map.' },
    { id: 'start-new-garden', instruction: 'When an unvisited planted cell appears, increment the garden count.' },
    { id: 'flood-component', instruction: 'Flood fill from that cell through planted orthogonal neighbors.' },
    { id: 'mark-on-entry', instruction: 'Mark each cell when it enters the search so it is processed once.' },
    { id: 'return-count', instruction: 'Return the number of flood-fill starts.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Each of r·c cells is scanned and entered at most once; visited state and the search frontier can cover the grid.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0, 0],
        [0, 1, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 0, 0],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'garden 1' },
        { row: 1, column: 3, label: 'garden 2' },
        { row: 2, column: 0, label: 'garden 3' },
      ],
    },
  },
  workedExample: {
    prompt:
      'The survey map has a three-cell garden near the top-left, a two-cell garden on the right, and a three-cell garden near the bottom-left.',
    code: [
      'scan (0,0): new planted component -> count 1',
      'flood (0,0), (0,1), (1,1)',
      'scan (1,3): new component -> count 2; flood (2,3)',
      'scan (2,0): new component -> count 3; flood its lower neighbors',
      'finish scan -> return 3',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Flooding the first garden marks all edge-connected cells before the scan continues.',
      'The right-hand cells cannot cross the zero column, so they start a second fill.',
      'The lower-left group is separated from the first by an empty square.',
      'No marked cell increments the count again.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0, 0],
        [0, 1, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 0, 0],
      ],
      highlightedCells: [
        { row: 2, column: 0 },
        { row: 3, column: 0 },
        { row: 3, column: 1, label: 'third fill' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'The scan reaches a planted square already marked by an earlier flood fill. What should happen?',
    options: [
      { id: 'skip-marked', label: 'Skip it because its garden was already counted.' },
      { id: 'count-again', label: 'Increment the garden count again.' },
      { id: 'join-diagonal', label: 'Connect it to any diagonal planted square.' },
      { id: 'erase-neighbors', label: 'Erase all neighboring squares.' },
    ],
    correctOptionId: 'skip-marked',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1],
        [0, 1],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 1, label: 'already reached' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'When exactly should the garden counter increase?',
    acceptedAnswers: [
      'when an unvisited planted cell starts a flood fill',
      'at each new unvisited 1',
      'once per new connected component',
      'when an unvisited 1 starts a flood fill',
      'when a new unvisited planted cell is found',
      'when a flood fill starts',
      'once per flood fill start',
      'at each new unvisited planted cell',
      'when the scan finds an unvisited planted cell',
      'when we find an unvisited 1',
      'when a new island is found',
      'when a new island starts',
    ],
    placeholder: 'State the counting event',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[1, 0, 1]],
      highlightedCells: [{ row: 0, column: 2, label: 'new start' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the survey: initialize, scan cells, detect an unvisited plant, count, flood and mark its component, then return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 0],
        [1, 1],
      ],
      pointers: [{ row: 0, column: 0, label: 'scan' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["roofMap"], a rectangular matrix of 0 and 1, and return the number of orthogonally connected groups of 1 cells.',
    starterCode: `def solve(data):
    roof = data["roofMap"]
    visited = set()
    gardens = 0

    def flood(row, column):
        # Mark this planted cell and visit four planted neighbors.
        pass

    # Scan every cell and launch one fill per new garden.
    return gardens`,
    cases: {
      visibleExample: {
        input: {
          roofMap: [
            [1, 1, 0, 0],
            [0, 1, 0, 1],
            [1, 0, 0, 1],
            [1, 1, 0, 0],
          ],
        },
        expected: 3,
      },
      hiddenBoundary: {
        input: { roofMap: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          roofMap: [
            [1, 0, 1],
            [0, 1, 0],
            [1, 0, 1],
          ],
        },
        expected: 5,
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 1, 0],
        [0, 1, 0],
        [1, 0, 1],
      ],
      highlightedCells: [{ row: 0, column: 0, label: 'flood start' }],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(numberOfIslandsMissionSeed)

export default problemLesson
