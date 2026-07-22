import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const surroundedRegionsMissionSeed = createRealm4MissionSeed({
  slug: 'surrounded-regions',
  estimatedMinutes: 23,
  mission: {
    title: 'The Courtyard Rain Check',
    context:
      'A campus blueprint marks open rain tiles with O and covered tiles with X. An open region drains safely if it connects by shared edges to any outer boundary tile.',
    prompt:
      'Change every trapped open tile to X, but preserve all open tiles connected to the boundary. Return a new board.',
  },
  objective:
    'Protect boundary-connected grid regions with flood fill, then flip only unprotected interior cells.',
  priorKnowledge: [
    'Every truly trapped region is disconnected from the board boundary.',
    'A flood fill can mark all cells connected to several boundary starts.',
    'A second full scan can transform cells based on marks.',
  ],
  recognitionCue:
    'Interior regions are captured unless they have an orthogonal path to the outside boundary.',
  misconception:
    'Flipping every interior O immediately can destroy a long safe corridor that reaches the edge.',
  keyRule:
    'Flood-fill O cells from all four boundaries first; only O cells not reached by that safety search are trapped.',
  algorithmSteps: [
    { id: 'copy-board', instruction: 'Copy the input board and handle an empty board.' },
    { id: 'find-boundary-openings', instruction: 'Inspect every cell on all four outer edges.' },
    { id: 'mark-safe-region', instruction: 'Flood fill from each boundary O and mark connected O cells safe.' },
    { id: 'scan-all-cells', instruction: 'Scan the complete board after safety marking finishes.' },
    { id: 'flip-unsafe-open', instruction: 'Change each O not in the safe set to X.' },
    { id: 'preserve-safe-open', instruction: 'Leave marked O cells unchanged.' },
    { id: 'return-board', instruction: 'Return the transformed copy.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Boundary fills and the final scan each touch a cell only a constant number of times; the safe set can hold the full board.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'X', 'X', 'X', 'X'],
        ['X', 'O', 'O', 'X', 'X'],
        ['X', 'X', 'O', 'X', 'O'],
        ['X', 'O', 'X', 'O', 'X'],
        ['X', 'X', 'X', 'X', 'X'],
      ],
      highlightedCells: [{ row: 2, column: 4, label: 'boundary-safe' }],
    },
  },
  workedExample: {
    prompt:
      'Only the O on the right boundary reaches outside. The center cluster and two isolated interior O tiles have no edge path to a boundary, so they close.',
    code: [
      'start safety fill at boundary cell (2,4)',
      'no other O is connected to that cell',
      'scan interior O cells',
      'flip unmarked center and lower cells to X',
      'preserve (2,4) as O',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Boundary-connected status, not distance from the edge, decides safety.',
      'The middle O cells are enclosed by X in all escape directions.',
      'The isolated lower cells are also unmarked and therefore trapped.',
      'The boundary O remains open even though it has no open neighbor.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'X', 'X', 'X', 'X'],
        ['X', 'X', 'X', 'X', 'X'],
        ['X', 'X', 'X', 'X', 'O'],
        ['X', 'X', 'X', 'X', 'X'],
        ['X', 'X', 'X', 'X', 'X'],
      ],
      highlightedCells: [{ row: 2, column: 4, label: 'preserved' }],
    },
  },
  patternCheck: {
    prompt:
      'Which cells should begin the safety flood fill?',
    options: [
      { id: 'boundary-os', label: 'Every O on the outer boundary.' },
      { id: 'all-interior-os', label: 'Every interior O before checking escape paths.' },
      { id: 'all-xs', label: 'Every X tile on the boundary.' },
      { id: 'center-only', label: 'Only the cell nearest the board center.' },
    ],
    correctOptionId: 'boundary-os',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'O', 'X'],
        ['X', 'O', 'X'],
        ['X', 'X', 'X'],
      ],
      highlightedCells: [{ row: 0, column: 1, label: 'safe start' }],
    },
  },
  retrievalCheck: {
    prompt:
      'After the boundary search, which O cells must be changed to X?',
    acceptedAnswers: [
      'the O cells not reached from a boundary',
      'unmarked open cells',
      'open cells outside the safe set',
      'the unmarked O cells',
      'O cells not marked safe',
      'O cells not connected to the boundary',
      'the trapped O cells',
      'trapped open cells',
      'unsafe open cells',
    ],
    placeholder: 'Describe the cells to flip',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'X', 'X'],
        ['X', 'O', 'X'],
        ['X', 'X', 'X'],
      ],
      highlightedCells: [{ row: 1, column: 1, label: 'unmarked' }],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the rain check: copy, locate boundary O cells, flood safe regions, scan board, flip unmarked O cells, preserve safe cells, return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'O'],
        ['X', 'O'],
      ],
      highlightedCells: [{ row: 0, column: 1, label: 'boundary start' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read rectangular character matrix data["blueprint"] and return a copied board where every O lacking an orthogonal path to the boundary becomes X.',
    starterCode: `def solve(data):
    board = [row[:] for row in data["blueprint"]]
    if not board:
        return []
    safe = set()

    def mark(row, column):
        # Flood only open cells and record them as boundary-safe.
        pass

    # Mark from all four edges, then flip unmarked O cells.
    return board`,
    cases: {
      visibleExample: {
        input: {
          blueprint: [
            ['X', 'X', 'X', 'X', 'X'],
            ['X', 'O', 'O', 'X', 'X'],
            ['X', 'X', 'O', 'X', 'O'],
            ['X', 'O', 'X', 'O', 'X'],
            ['X', 'X', 'X', 'X', 'X'],
          ],
        },
        expected: [
          ['X', 'X', 'X', 'X', 'X'],
          ['X', 'X', 'X', 'X', 'X'],
          ['X', 'X', 'X', 'X', 'O'],
          ['X', 'X', 'X', 'X', 'X'],
          ['X', 'X', 'X', 'X', 'X'],
        ],
      },
      hiddenBoundary: {
        input: { blueprint: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          blueprint: [
            ['X', 'O', 'X'],
            ['X', 'O', 'X'],
            ['X', 'O', 'O'],
          ],
        },
        expected: [
          ['X', 'O', 'X'],
          ['X', 'O', 'X'],
          ['X', 'O', 'O'],
        ],
      },
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['X', 'O', 'X'],
        ['X', 'O', 'X'],
        ['X', 'O', 'O'],
      ],
      highlightedCells: [
        { row: 0, column: 1, label: 'boundary-safe' },
        { row: 1, column: 1 },
        { row: 2, column: 1 },
        { row: 2, column: 2 },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(surroundedRegionsMissionSeed)

export default problemLesson
