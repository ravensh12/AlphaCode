import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const wallsAndGatesMissionSeed = createRealm4MissionSeed({
  slug: 'walls-and-gates',
  estimatedMinutes: 23,
  mission: {
    title: 'The Nearest Water Station',
    context:
      'A festival map uses 0 for water stations, -1 for closed booths, and 999 for open walking squares. Organizers want the shortest walking distance from every open square to any station.',
    prompt:
      'Fill the map with orthogonal step counts while keeping stations and closed booths unchanged. Leave 999 where no station is reachable.',
  },
  objective:
    'Compute nearest-source grid distances with one multi-source breadth-first search.',
  priorKnowledge: [
    'BFS visits unweighted paths in increasing edge count.',
    'A queue can begin with several sources at distance zero.',
    'Writing a distance also marks a square as discovered.',
  ],
  recognitionCue:
    'Every grid cell needs its distance to the nearest of many equally good starting sources.',
  misconception:
    'Running a separate BFS from every open square repeats most of the same exploration.',
  keyRule:
    'Enqueue every station first, then assign each still-999 neighbor parent distance + 1 exactly once.',
  algorithmSteps: [
    { id: 'copy-map', instruction: 'Copy the input matrix so the JSON input is not changed.' },
    { id: 'seed-all-stations', instruction: 'Enqueue every 0 cell before expansion begins.' },
    { id: 'pop-frontier', instruction: 'Remove the next cell from the queue.' },
    { id: 'inspect-neighbors', instruction: 'Inspect its four in-bounds orthogonal neighbors.' },
    { id: 'label-open-square', instruction: 'For each neighbor still equal to 999, write current distance + 1.' },
    { id: 'enqueue-once', instruction: 'Enqueue that newly labeled square exactly once.' },
    { id: 'return-distances', instruction: 'Return the completed distance matrix.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Each cell enters the queue at most once, and the queue can hold a large part of the r-by-c map.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [999, -1, 0, 999],
        [999, 999, 999, 999],
        [0, -1, 999, -1],
      ],
      highlightedCells: [
        { row: 0, column: 2, label: 'source' },
        { row: 2, column: 0, label: 'source' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Both water stations enter the queue at distance zero. Their waves label adjacent open squares 1, then the next layer 2, meeting without overwriting earlier distances.',
    code: [
      'queue = [(0,2), (2,0)]',
      'distance 1: label (0,3), (1,2), (1,0)',
      'distance 2: label (1,3), (1,1), (2,2), (0,0)',
      'closed booths never enter the queue',
      'return the labeled map',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Seeding both sources makes their distance waves advance together.',
      'The first source to reach an open square gives its shortest possible path.',
      'Changing 999 to a distance prevents duplicate queue entries.',
      'Walls and unreachable open cells remain unchanged.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, -1, 0, 1],
        [1, 2, 1, 2],
        [0, -1, 2, -1],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'layer 2' },
        { row: 1, column: 1, label: 'layer 2' },
        { row: 2, column: 2, label: 'layer 2' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Why should all water stations be placed in the queue before any neighbor is expanded?',
    options: [
      { id: 'competing-waves', label: 'Their BFS waves then compete fairly, so the first visit is from a nearest station.' },
      { id: 'avoid-queue', label: 'It removes the need for a queue after the first step.' },
      { id: 'cross-walls', label: 'It allows distance waves to cross closed booths.' },
      { id: 'largest-distance', label: 'It makes the farthest station reach each square first.' },
    ],
    correctOptionId: 'competing-waves',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[0, 999, 999, 0]],
      highlightedCells: [
        { row: 0, column: 0, label: 'source' },
        { row: 0, column: 3, label: 'source' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Which cell value tells the BFS that an open square has not been discovered yet?',
    acceptedAnswers: ['999', 'the value 999', 'an unchanged 999'],
    placeholder: 'Type the sentinel value',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[0, 1, 999]],
      highlightedCells: [{ row: 0, column: 2, label: 'undiscovered' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the distance fill: copy map, seed all stations, pop queue, inspect neighbors, label untouched squares, enqueue, return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [0, 999],
        [999, 999],
      ],
      pointers: [{ row: 0, column: 0, label: 'queue front' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["festivalMap"], using 0, -1, and 999, and return a new matrix containing shortest orthogonal distance to any 0 station.',
    starterCode: `def solve(data):
    grid = [row[:] for row in data["festivalMap"]]
    queue = []

    # Add every station to queue before expanding.
    front = 0
    while front < len(queue):
        row, column = queue[front]
        front += 1
        # Label untouched neighbors and enqueue them.
        pass

    return grid`,
    cases: {
      visibleExample: {
        input: {
          festivalMap: [
            [999, -1, 0, 999],
            [999, 999, 999, 999],
            [0, -1, 999, -1],
          ],
        },
        expected: [
          [2, -1, 0, 1],
          [1, 2, 1, 2],
          [0, -1, 2, -1],
        ],
      },
      hiddenBoundary: {
        input: {
          festivalMap: [
            [999, -1],
            [999, 999],
          ],
        },
        expected: [
          [999, -1],
          [999, 999],
        ],
      },
      hiddenAdversarial: {
        input: { festivalMap: [[0, 999, 999, 0]] },
        expected: [[0, 1, 1, 0]],
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[0, 1, 1, 0]],
      highlightedCells: [
        { row: 0, column: 1, label: 'left wave' },
        { row: 0, column: 2, label: 'right wave' },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(wallsAndGatesMissionSeed)

export default problemLesson
