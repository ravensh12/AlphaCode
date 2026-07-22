import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const detectSquaresMissionSeed = {
  slug: 'detect-squares',
  estimatedMinutes: 28,
  mission: {
    title: 'The Firefly Square Counter',
    context:
      'A night exhibit records glowing firefly markers at integer coordinates. The same coordinate may receive several markers, and visitors ask how many axis-aligned squares can use a chosen coordinate as one corner.',
    prompt:
      'Process JSON add and count events in order. Return one count for each count event, including duplicate-marker combinations.',
  },
  objective:
    'Store coordinate frequencies and enumerate possible vertical partner corners for each query.',
  priorKnowledge: [
    'A frequency map preserves duplicate counts.',
    'An axis-aligned square has equal horizontal and vertical side lengths.',
    'Independent corner choices multiply their frequencies.',
  ],
  recognitionCue:
    'Points arrive over time, duplicates matter, and queries count geometric shapes anchored at one coordinate.',
  misconception:
    'A set loses duplicate markers, even though two markers at one corner create two distinct square choices.',
  algorithmSteps: [
    {
      id: 'store-frequency',
      instruction: 'For each add event, increase that coordinate’s frequency.',
    },
    {
      id: 'choose-vertical',
      instruction:
        'For a count event at (x, y), enumerate stored (x, other_y) points with other_y != y.',
    },
    {
      id: 'measure-side',
      instruction: 'Set side length to the absolute difference between the y values.',
    },
    {
      id: 'check-both-sides',
      instruction:
        'Check the two matching corners at x + side and at x - side.',
    },
    {
      id: 'multiply-counts',
      instruction:
        'Add the product of all three stored-corner frequencies for each side.',
    },
  ],
  complexity: {
    time: 'O(k) per count event',
    space: 'O(p)',
    explanation:
      'A query scans k distinct y-coordinates on its vertical line, while p stored coordinates remain in maps.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['', '', '●', '', 'Q'],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '●', '', '●'],
      ],
      rowLabels: ['y=10', 'y=8', 'y=5', 'y=2'],
      columnLabels: ['x=1', 'x=3', 'x=5', 'x=8', 'x=11'],
      highlightedCells: [
        { row: 0, column: 2, label: 'corner' },
        { row: 0, column: 4, label: 'query' },
        { row: 3, column: 2, label: 'corner' },
        { row: 3, column: 4, label: 'vertical partner' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Markers at (3,10), (11,2), and (3,2) form one square with query (11,10). Adding a second marker at (3,2) makes two choices there, so the next count becomes 2.',
    code: [
      'vertical partner (11,2): frequency 1',
      'other corners (3,10): 1 and (3,2): 1',
      'count contribution = 1 × 1 × 1 = 1',
      'add another marker at (3,2)',
      'new contribution = 1 × 1 × 2 = 2',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The vertical distance from y=10 to y=2 is 8.',
      'Moving left by 8 reaches x=3 for both missing corners.',
      'The first query has one marker choice at every stored corner.',
      'The duplicate lower-left marker doubles the second answer.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['(3,10) ×1', '(11,10) query'],
        ['(3,2) ×2', '(11,2) ×1'],
      ],
      highlightedCells: [
        { row: 1, column: 0, label: 'duplicate choices' },
        { row: 0, column: 1, label: 'query corner' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Why does one valid square contribute a product of three frequencies?',
    options: [
      {
        id: 'independent-corners',
        label:
          'Each of the three stored corners offers an independent marker choice.',
      },
      {
        id: 'three-sides',
        label: 'Only three sides of a square need to be counted.',
      },
      {
        id: 'sort-points',
        label: 'Multiplication sorts the coordinates.',
      },
    ],
    correctOptionId: 'independent-corners',
    feedback: {
      correct: 'Exactly. One choice from each corner combines with every choice at the others.',
      incorrect: 'The product counts marker combinations, not sides or ordering.',
      secondIncorrect:
        'If corner frequencies are a, b, and c, there are a × b × c stored-corner combinations.',
    },
    hints: [
      'Imagine two markers at one corner and one at each other corner.',
      'Either duplicate can complete the shape.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['×2', 'query'],
        ['×3', '×4'],
      ],
      highlightedCells: [
        { row: 0, column: 0, label: '2 choices' },
        { row: 1, column: 0, label: '3 choices' },
        { row: 1, column: 1, label: '4 choices' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type how to compute the square side length from query y and a vertical partner other_y.',
    acceptedAnswers: [
      'abs(other_y - y)',
      'absolute difference of the y coordinates',
      '|other_y - y|',
      'abs(y - other_y)',
      'abs(other_y-y)',
      'abs(y-other_y)',
      'the absolute difference of the y values',
    ],
    placeholder: 'side = ...',
    feedback: {
      correct: 'Correct. Side length is the nonnegative vertical distance.',
      incorrect: 'Use the distance between the two y-coordinates.',
      secondIncorrect: 'Use abs(other_y - y).',
    },
    hints: [
      'The partner may be above or below the query.',
      'Distance should never be negative.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the event processor and square-count routine.',
    feedback: {
      correct: 'The exhibit now counts both left and right squares with duplicate weights.',
      incorrect: 'Choose a vertical partner before looking sideways by the same distance.',
      secondIncorrect:
        'Store frequency; choose vertical; measure side; check both horizontal directions; multiply counts.',
    },
    hints: [
      'A zero-length side is not a square.',
      'Check x + side and x - side separately.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["events"], each {"op":"add","point":{"x":...,"y":...}} or {"op":"count","point":...}. Return a list of answers for count events in order.',
    starterCode: `from collections import defaultdict

def solve(data):
    frequencies = defaultdict(int)
    ys_by_x = defaultdict(set)
    answers = []

    for event in data["events"]:
        x, y = event["point"]["x"], event["point"]["y"]
        if event["op"] == "add":
            frequencies[(x, y)] += 1
            ys_by_x[x].add(y)
        else:
            total = 0
            # TODO: try every other_y on x, then both horizontal directions.
            answers.append(total)

    return answers`,
    cases: {
      visibleExample: {
        input: {
          events: [
            { op: 'add', point: { x: 3, y: 10 } },
            { op: 'add', point: { x: 11, y: 2 } },
            { op: 'add', point: { x: 3, y: 2 } },
            { op: 'count', point: { x: 11, y: 10 } },
            { op: 'add', point: { x: 3, y: 2 } },
            { op: 'count', point: { x: 11, y: 10 } },
          ],
        },
        expected: [1, 2],
      },
      hiddenBoundary: {
        input: {
          events: [{ op: 'count', point: { x: 0, y: 0 } }],
        },
        expected: [0],
      },
      hiddenAdversarial: {
        input: {
          events: [
            { op: 'add', point: { x: 0, y: 2 } },
            { op: 'add', point: { x: 0, y: 2 } },
            { op: 'add', point: { x: 2, y: 0 } },
            { op: 'add', point: { x: 2, y: 2 } },
            { op: 'add', point: { x: 2, y: 2 } },
            { op: 'add', point: { x: -2, y: 0 } },
            { op: 'add', point: { x: -2, y: 2 } },
            { op: 'count', point: { x: 0, y: 0 } },
          ],
        },
        expected: [6],
      },
    },
    feedback: {
      correct: 'The firefly exhibit counts every valid square and every duplicate choice.',
      incorrect:
        'A query failed. Recheck duplicate frequencies, both horizontal directions, and zero-length partners.',
      secondIncorrect:
        'For each other_y != y, add freq[(x,other_y)] * freq[(x±side,y)] * freq[(x±side,other_y)].',
    },
    hints: [
      'Store frequencies by (x, y), not just presence.',
      'Iterate other_y in ys_by_x[x] and skip other_y == y.',
      'For direction in (-1, 1), use other_x = x + direction * side.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['(-2,2) ×1', '(0,2) ×2', '(2,2) ×2'],
        ['(-2,0) ×1', '(0,0) query', '(2,0) ×1'],
      ],
      highlightedCells: [
        { row: 1, column: 1, label: 'anchor' },
        { row: 0, column: 1, label: 'vertical ×2' },
      ],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(detectSquaresMissionSeed)

export default problemLesson
