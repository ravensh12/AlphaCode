import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const pacificAtlanticWaterFlowMissionSeed = createRealm4MissionSeed({
  slug: 'pacific-atlantic-water-flow',
  estimatedMinutes: 25,
  mission: {
    title: 'The Two-River Ridge',
    context:
      'A mountain model drains toward the north-or-west Blue River and the south-or-east Gold River. Rain moves from a cell to an equal or lower orthogonal neighbor.',
    prompt:
      'Return row-and-column pairs for ridge cells whose rain can reach both rivers, ordered by row and then column.',
  },
  objective:
    'Reverse two boundary flood fills from the rivers and intersect their reachable cell sets.',
  priorKnowledge: [
    'Forward rain can move only to a height no greater than its current height.',
    'A reverse search follows the opposite inequality.',
    'Set intersection finds cells reached by both searches.',
  ],
  recognitionCue:
    'Many cells ask whether they can reach the same boundary targets under a monotonic movement rule.',
  misconception:
    'Running a separate downhill search from every cell repeats work and can cost far more than two boundary searches.',
  keyRule:
    'Search backward from each river into equal-or-higher neighbors; cells marked by both reverse searches drain to both rivers.',
  algorithmSteps: [
    { id: 'handle-empty-ridge', instruction: 'Return an empty list for an empty height matrix.' },
    { id: 'seed-blue-edges', instruction: 'Start one search from every top-row and left-column cell.' },
    { id: 'seed-gold-edges', instruction: 'Start another search from every bottom-row and right-column cell.' },
    { id: 'climb-in-reverse', instruction: 'From a reached cell, visit unmarked neighbors with equal or greater height.' },
    { id: 'finish-searches', instruction: 'Complete both reverse flood fills.' },
    { id: 'scan-intersection', instruction: 'Scan row-major and collect cells marked by both searches.' },
    { id: 'return-coordinates', instruction: 'Return coordinate pairs in scan order.' },
  ],
  complexity: {
    time: 'O(r · c)',
    space: 'O(r · c)',
    explanation:
      'Each reverse search marks every cell at most once, and the two reached sets can each contain the full matrix.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 1],
      ],
      rowLabels: ['Blue edge', '', 'Gold edge'],
      highlightedCells: [
        { row: 0, column: 2, label: 'both' },
        { row: 1, column: 2, label: 'both' },
        { row: 2, column: 0, label: 'both' },
        { row: 2, column: 1, label: 'both' },
      ],
    },
  },
  workedExample: {
    prompt:
      'On the 3-by-3 ridge, the top-right and bottom-left boundary cells touch both river systems through their two boundary sides. The height-4 cells beside them also connect both ways.',
    code: [
      'blue = reverse_fill(top row + left column)',
      'gold = reverse_fill(bottom row + right column)',
      'reverse moves only to neighbor height >= current height',
      'scan cells present in blue and gold',
      'collect [0,2], [1,2], [2,0], [2,1]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The Blue search climbs from the north and west boundaries.',
      'The Gold search climbs from the south and east boundaries.',
      'The low bottom-right cell cannot drain uphill toward Blue in the forward direction.',
      'Row-major intersection gives four coordinate pairs.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 1],
      ],
      highlightedCells: [
        { row: 0, column: 2 },
        { row: 1, column: 2 },
        { row: 2, column: 0 },
        { row: 2, column: 1 },
      ],
    },
  },
  patternCheck: {
    prompt:
      'During a reverse search from a river, which neighboring heights may be entered?',
    options: [
      { id: 'equal-or-higher', label: 'Neighbors whose height is equal to or greater than the current cell.' },
      { id: 'strictly-lower', label: 'Only neighbors strictly lower than the current cell.' },
      { id: 'any-height', label: 'Every neighbor regardless of height.' },
      { id: 'diagonal-only', label: 'Only diagonal neighbors of equal height.' },
    ],
    correctOptionId: 'equal-or-higher',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [2, 4],
        [1, 3],
      ],
      pointers: [{ row: 1, column: 0, label: 'river search' }],
      highlightedCells: [{ row: 0, column: 0, label: 'can climb' }],
    },
  },
  retrievalCheck: {
    prompt:
      'Why does the reverse search move to equal-or-higher cells?',
    acceptedAnswers: [
      'because those cells can flow downhill back to the current cell',
      'it reverses the forward equal-or-lower flow rule',
      'a higher neighbor can drain to the lower current cell',
      'because rain from those cells can flow down to this cell',
      'because water flows downhill from them to the current cell',
      'higher cells can drain to the current cell',
      'because forward rain moves to equal or lower heights',
    ],
    placeholder: 'Explain the reversed inequality',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [[2, 4]],
      highlightedCells: [
        { row: 0, column: 0, label: 'river side' },
        { row: 0, column: 1, label: 'reverse reach' },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the ridge analysis: empty check, seed Blue, seed Gold, reverse-climb each, intersect in row order, return.',
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2],
        [2, 3],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: 'Blue' },
        { row: 1, column: 1, label: 'Gold' },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read integer matrix data["heights"]. Return [row, column] pairs that can drain to both north-or-west and south-or-east boundaries, in row-major order.',
    starterCode: `def solve(data):
    heights = data["heights"]
    if not heights:
        return []

    def reverse_fill(starts):
        reached = set(starts)
        # Explore orthogonal equal-or-higher neighbors.
        pass

    # Build both boundary start sets, run fills, and intersect.
    return []`,
    cases: {
      visibleExample: {
        input: {
          heights: [
            [1, 2, 3],
            [2, 3, 4],
            [3, 4, 1],
          ],
        },
        expected: [
          [0, 2],
          [1, 2],
          [2, 0],
          [2, 1],
        ],
      },
      hiddenBoundary: {
        input: { heights: [[7]] },
        expected: [[0, 0]],
      },
      hiddenAdversarial: {
        input: {
          heights: [
            [5, 5],
            [5, 5],
          ],
        },
        expected: [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 1],
      ],
      highlightedCells: [
        { row: 0, column: 2, label: 'both' },
        { row: 2, column: 0, label: 'both' },
      ],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  pacificAtlanticWaterFlowMissionSeed,
)

export default problemLesson
