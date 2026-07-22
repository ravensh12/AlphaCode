import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const rottingOrangesMissionSeed = createRealm4MissionSeed({
  slug: 'rotting-oranges',
  estimatedMinutes: 22,
  mission: {
    title: 'The Overheating Battery Bay',
    context:
      'A battery bay marks empty slots as 0, cool battery cells as 1, and overheating cells as 2. Each minute, heat spreads from every hot cell to adjacent cool cells.',
    prompt:
      'Return the number of minutes until no cool cell remains, or -1 if barriers of empty slots leave a cool cell unreachable.',
  },
  objective:
    'Simulate simultaneous spreading with multi-source BFS layers and a remaining-target count.',
  priorKnowledge: [
    'BFS layers represent equal numbers of unweighted steps.',
    'All starting sources can share one queue.',
    'A counter can detect whether any target cell remains unreachable.',
  ],
  recognitionCue:
    'A state spreads one edge per time unit from several starting cells at the same time.',
  misconception:
    'Processing one hot source to completion before the others overstates elapsed time because spreading is simultaneous.',
  keyRule:
    'Seed every initial 2, process the queue by minute layers, change each neighboring 1 to 2 once, and decrement the cool count.',
  algorithmSteps: [
    { id: 'copy-and-count', instruction: 'Copy the bay, count cool cells, and enqueue every hot cell.' },
    { id: 'handle-no-cool', instruction: 'Return zero immediately when the cool count is zero.' },
    { id: 'open-minute-layer', instruction: 'Process exactly the current queue length as one minute layer.' },
    { id: 'spread-to-cool', instruction: 'For each hot cell, convert adjacent cool cells to hot.' },
    { id: 'count-and-enqueue', instruction: 'Decrement cool for each conversion and enqueue the new hot cell.' },
    { id: 'advance-minute', instruction: 'Increase minutes after a layer that performs spreading.' },
    { id: 'check-unreachable', instruction: 'Return minutes if cool is zero; otherwise return -1.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Each cell changes state and enters the queue at most once; the queue can contain many grid cells.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 1, 0],
        [1, 1, 1],
        [0, 1, 2],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'source' },
        { row: 2, column: 2, label: 'source' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Two hot corners spread together. Four nearby cool cells heat after minute 1, and the center heats after minute 2.',
    code: [
      'minute 0 queue = [(0,0), (2,2)]',
      'minute 1 converts (0,1), (1,0), (1,2), (2,1)',
      'new hot cells form the next queue layer',
      'minute 2 converts center (1,1)',
      'cool count is 0 -> return 2',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Both initial hot cells belong to the same time layer.',
      'A cool cell is converted when first discovered, preventing duplicate queue entries.',
      'The center is two orthogonal steps from either source.',
      'The remaining-cool counter proves the process finished.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 2, 0],
        [2, 2, 2],
        [0, 2, 2],
      ],
      highlightedCells: [{ row: 1, column: 1, label: 'minute 2' }],
    },
  },
  patternCheck: {
    prompt:
      'Why is the queue seeded with every initially hot battery cell?',
    options: [
      { id: 'same-time-layer', label: 'All initial sources must spread as minute zero of the same BFS.' },
      { id: 'one-source-path', label: 'Only the first source is allowed to spread.' },
      { id: 'skip-counting', label: 'It makes counting cool cells unnecessary in every case.' },
      { id: 'cross-empty', label: 'It permits heat to cross empty slots.' },
    ],
    correctOptionId: 'same-time-layer',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[2, 1, 1, 2]],
      highlightedCells: [
        { row: 0, column: 0, label: 'minute 0' },
        { row: 0, column: 3, label: 'minute 0' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'What final condition decides between returning elapsed minutes and returning -1?',
    acceptedAnswers: [
      'whether the cool count is zero',
      'return minutes if no cool cells remain otherwise -1',
      'check if every 1 was reached',
      'whether any cool cell remains',
      'if the cool count is zero',
      'whether the cool counter is zero',
      'whether all cool cells were converted',
      'if any cool cells remain',
    ],
    placeholder: 'State the remaining-cell check',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[2, 0, 1]],
      highlightedCells: [{ row: 0, column: 2, label: 'unreachable cool' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the heat simulation: copy and count, seed sources, handle zero, process layers, spread and decrement, advance time, final check.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 1],
        [1, 1],
      ],
      pointers: [{ row: 0, column: 0, label: 'queue front' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["batteryBay"], a matrix using 0, 1, and 2, and return simultaneous spread minutes or -1 when a cool cell cannot be reached.',
    starterCode: `def solve(data):
    bay = [row[:] for row in data["batteryBay"]]
    queue = []
    cool = 0

    # Count cool cells and enqueue every initial hot cell.
    minutes = 0
    # Process one queue layer per minute and update cool.
    return -1`,
    cases: {
      visibleExample: {
        input: {
          batteryBay: [
            [2, 1, 0],
            [1, 1, 1],
            [0, 1, 2],
          ],
        },
        expected: 2,
      },
      hiddenBoundary: {
        input: { batteryBay: [[0, 2]] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { batteryBay: [[2, 0, 1]] },
        expected: -1,
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 1, 0],
        [1, 1, 1],
        [0, 1, 2],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'source A' },
        { row: 2, column: 2, label: 'source B' },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(rottingOrangesMissionSeed)

export default problemLesson
