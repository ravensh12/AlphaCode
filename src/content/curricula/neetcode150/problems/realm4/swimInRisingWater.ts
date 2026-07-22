import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const swimInRisingWaterMissionSeed = createRealm4MissionSeed({
  slug: 'swim-in-rising-water',
  estimatedMinutes: 26,
  mission: {
    title: 'The Flooded Robot Course',
    context:
      'A square robot course labels each cell with the water level needed before that platform is passable. At a chosen time, the robot can move orthogonally through every cell whose label is at most that time.',
    prompt:
      'Return the earliest water level that permits a route from the upper-left platform to the lower-right platform.',
  },
  objective:
    'Find a minimax grid path with a Dijkstra-style heap whose route cost is the maximum elevation seen.',
  priorKnowledge: [
    'A route cannot be used before its highest platform is passable.',
    'A min-heap can prioritize the lowest known route cost.',
    'Dijkstra can work with a monotone combine operation such as max.',
  ],
  recognitionCue:
    'The cost of a path is its worst edge or cell value, and the goal is to minimize that maximum.',
  misconception:
    'Adding cell heights solves a sum-cost path, but waiting time depends only on the highest platform used.',
  keyRule:
    'The candidate cost for a neighbor is max(current route cost, neighbor elevation); always expand the smallest such cost first.',
  algorithmSteps: [
    { id: 'seed-start-cost', instruction: 'Set the start route cost to its own elevation and push it into a min-heap.' },
    { id: 'pop-lowest-maximum', instruction: 'Pop the cell with the smallest known route maximum.' },
    { id: 'skip-stale-cell', instruction: 'Skip an entry larger than that cell’s recorded best cost.' },
    { id: 'return-at-target', instruction: 'Return the cost when the lower-right cell is popped.' },
    { id: 'inspect-neighbors', instruction: 'Inspect all in-bounds orthogonal neighbors.' },
    { id: 'compute-route-maximum', instruction: 'Set candidate to the larger of current cost and neighbor elevation.' },
    { id: 'relax-neighbor', instruction: 'Record and push the candidate when it lowers the neighbor’s best cost.' },
    { id: 'continue-search', instruction: 'Repeat until the target is finalized.' },
  ],
  complexity: {
    time: 'O(r · c log(r · c))',
    space: 'O(r · c)',
    explanation:
      'Each grid cell stores a best minimax cost and may enter the heap; heap operations use the number of cells.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 2, 8],
        [1, 3, 7],
        [6, 4, 5],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'start' },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 1 },
        { row: 2, column: 2, label: 'finish at 5' },
      ],
    },
  },
  workedExample: {
    prompt:
      'The route 0→1→3→4→5 reaches the finish and its highest platform is 5. Since the finish itself is labeled 5, no earlier level can work.',
    code: [
      'start cost = 0',
      'move to elevation 1 -> route max 1',
      'move to 3 -> route max 3',
      'move to 4 -> route max 4',
      'move to finish 5 -> route max 5; return 5',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The path cost grows only when a higher platform is entered.',
      'The heap explores route maxima 0, 1, 2, 3, and 4 before 5.',
      'A route through elevation 8 or 7 is available later but is not competitive.',
      'Popping the target at cost 5 proves that minimax value is final.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 2, 8],
        [1, 3, 7],
        [6, 4, 5],
      ],
      pointers: [{ row: 2, column: 2, label: 'cost 5' }],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
        { row: 2, column: 1 },
        { row: 2, column: 2 },
      ],
    },
  },
  patternCheck: {
    prompt:
      'A route reaches a neighbor of elevation 7 with current route cost 4. What candidate cost enters the heap?',
    options: [
      { id: 'maximum-seven', label: '7, the maximum of 4 and 7.' },
      { id: 'sum-eleven', label: '11, the sum of every value.' },
      { id: 'current-four', label: '4, ignoring the neighbor elevation.' },
      { id: 'difference-three', label: '3, the elevation difference.' },
    ],
    correctOptionId: 'maximum-seven',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[4, 7]],
      highlightedCells: [
        { row: 0, column: 0, label: 'route max 4' },
        { row: 0, column: 1, label: 'candidate 7' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the relaxation formula: candidate = ______.',
    acceptedAnswers: [
      'max(current cost, neighbor elevation)',
      'max(route_max, grid[nr][nc])',
      'the larger of the path cost and next cell height',
      'max of current cost and neighbor elevation',
      'the maximum of the current cost and the neighbor elevation',
      'max(current route cost, neighbor elevation)',
      'max(cost, neighbor elevation)',
      'the larger of the current cost and the neighbor elevation',
    ],
    placeholder: 'Type the minimax formula',
    diagram: {
      kind: 'array',
      values: ['current maximum', 'neighbor elevation'],
      highlight: 1,
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the flood search: seed start, pop minimum maximum, skip stale, target check, inspect neighbors, compute max, relax, repeat.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 2],
        [1, 3],
      ],
      pointers: [{ row: 0, column: 0, label: 'heap start' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read square elevation matrix data["course"]. Return the minimum possible maximum elevation along an orthogonal route from top-left to bottom-right.',
    starterCode: `def solve(data):
    import heapq

    grid = data["course"]
    rows, columns = len(grid), len(grid[0])
    best = [[float("inf")] * columns for _ in range(rows)]
    best[0][0] = grid[0][0]
    heap = [(grid[0][0], 0, 0)]

    # Run minimax Dijkstra until the target is popped.
    return -1`,
    cases: {
      visibleExample: {
        input: {
          course: [
            [0, 2, 8],
            [1, 3, 7],
            [6, 4, 5],
          ],
        },
        expected: 5,
      },
      hiddenBoundary: {
        input: { course: [[9]] },
        expected: 9,
      },
      hiddenAdversarial: {
        input: {
          course: [
            [0, 100],
            [2, 3],
          ],
        },
        expected: 3,
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 100],
        [2, 3],
      ],
      highlightedCells: [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
        { row: 1, column: 1, label: 'best max 3' },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(swimInRisingWaterMissionSeed)

export default problemLesson
