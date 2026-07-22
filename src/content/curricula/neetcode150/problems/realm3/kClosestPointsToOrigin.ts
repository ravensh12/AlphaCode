import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const kClosestPointsToOriginMissionSeed = {
  slug: 'k-closest-points-to-origin',
  estimatedMinutes: 24,
  mission: {
    title: 'Dispatch the Nearest Drones',
    context:
      'A control tower at coordinate (0, 0) receives drone locations. It must choose k drones with the shortest straight-line distance for a quick rescue launch.',
    prompt:
      'Return any k coordinate pairs with the smallest straight-line distances. Output order does not matter, and equal-distance boundary points are interchangeable.',
  },
  objective:
    'Use squared distance as a priority and select only the k smallest point keys.',
  priorKnowledge: [
    'Comparing squared distances avoids an unnecessary square root.',
    'A heap can repeatedly reveal the smallest priority.',
  ],
  recognitionCue:
    'The task asks for a small number k of items ranked by a numeric distance key.',
  misconception:
    'Ranking by |x| + |y| measures grid steps, not the requested straight-line distance.',
  algorithmSteps: [
    {
      id: 'make-point-keys',
      instruction: 'For every point, compute x² + y² as its distance key.',
    },
    {
      id: 'heap-points',
      instruction: 'Push entries ordered by distance, then x, then y into a min-heap.',
    },
    {
      id: 'take-k',
      instruction: 'Remove exactly k entries from the heap.',
    },
    {
      id: 'return-pairs',
      instruction: 'Return their coordinate pairs in removal order.',
    },
  ],
  complexity: {
    time: 'O(n log n + k log n)',
    space: 'O(n)',
    explanation:
      'The starter pushes n keyed points one at a time, then removes k entries; each heap operation costs O(log n).',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: ['8:(-2,2)', '10:(1,3)', '8:(2,-2)'],
      highlight: 0,
      pointers: [{ index: 0, label: 'nearest key' }],
    },
  },
  workedExample: {
    prompt:
      'Points (1,3), (-2,2), and (2,-2) have squared distances 10, 8, and 8. With k = 2, the tied distance-8 points win, ordered by x.',
    code: [
      'heap = []',
      'for x, y in points:',
      '    heappush(heap, (x*x + y*y, x, y))',
      'answer = []',
      'for _ in range(k):',
      '    distance, x, y = heappop(heap)',
      '    answer.append([x, y])',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'No square roots are needed because squaring preserves nonnegative distance order.',
      'Both (-2,2) and (2,-2) have key 8, lower than point (1,3).',
      'Tuple tie-breaking places x = -2 first, making the output predictable.',
    ],
  },
  patternCheck: {
    prompt:
      'Which priority correctly ranks drones by straight-line distance from the tower?',
    options: [
      {
        id: 'squared-distance',
        label: 'x*x + y*y, with coordinates used only to break ties.',
      },
      {
        id: 'coordinate-sum',
        label: 'x + y, allowing negative coordinates to cancel.',
      },
      {
        id: 'largest-axis',
        label: 'max(x, y) without using absolute values.',
      },
      {
        id: 'input-position',
        label: 'The drone’s index in the incoming array.',
      },
    ],
    correctOptionId: 'squared-distance',
    feedback: {
      correct:
        'Exactly. Squared Euclidean distance has the same ordering as distance and uses simple integer math.',
      incorrect:
        'That key does not measure straight-line distance from (0, 0).',
      secondIncorrect:
        'Use x² + y²; no square root is needed for ranking.',
    },
    hints: ['The distance formula contains both squared coordinates.', 'All squared distances are nonnegative.'],
  },
  retrievalCheck: {
    prompt:
      'Type the squared-distance formula for point (x, y).',
    acceptedAnswers: [
      'x*x + y*y',
      'x^2 + y^2',
      'x squared plus y squared',
      'x*x+y*y',
      'x^2+y^2',
      'x**2 + y**2',
      'x**2+y**2',
      'x squared + y squared',
    ],
    placeholder: 'Distance key',
    feedback: {
      correct:
        'Right. That key preserves the nearest-to-farthest order.',
      incorrect:
        'Use the two legs of the right triangle from the origin.',
      secondIncorrect:
        'Type x*x + y*y.',
    },
    hints: ['Pythagoras gives the formula.', 'Leave off the square root.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the deterministic nearest-drone selection.',
    feedback: {
      correct:
        'Every point receives the right key before the first k priorities are removed.',
      incorrect:
        'Compute priorities before taking k, and return coordinate pairs rather than keys.',
      secondIncorrect:
        'Use keys → heap → take k → return pairs.',
    },
    hints: ['The tie-break fields belong in the heap tuple.', 'k can be zero.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read points and k, then return any k coordinate lists whose squared distances are the k smallest. Output order does not matter.',
    starterCode: `import heapq

def solve(data):
    heap = []
    for point in data["points"]:
        x, y = point
        # TODO: push a deterministic distance entry.
        pass

    answer = []
    for _ in range(data["k"]):
        # TODO: pop the next point and append [x, y].
        pass
    return answer`,
    cases: {
      visibleExample: {
        input: { points: [[1, 3], [-2, 2], [2, -2]], k: 2 },
        expected: [[-2, 2], [2, -2]],
      },
      hiddenBoundary: {
        input: { points: [], k: 0 },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          points: [[0, 1], [1, 0], [0, -1], [-1, 0], [9, 9]],
          k: 3,
        },
        expected: [[-1, 0], [0, -1], [0, 1]],
      },
    },
    comparator: { kind: 'semantic', validator: 'kClosestPoints' },
    feedback: {
      correct:
        'The selected drones have the k smallest distances, including a valid choice across ties.',
      incorrect:
        'At least one selected point is not among the k nearest distances.',
      secondIncorrect:
        'Push (x*x+y*y,x,y); pop k times and append [x,y].',
    },
    hints: [
      'Python tuples compare from left to right.',
      'Coordinates may be negative.',
      'k = 0 should leave the output empty.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: ['1:(-1,0)', '1:(0,-1)', '1:(0,1)', '1:(1,0)', '162:(9,9)'],
      highlight: 0,
      pointers: [{ index: 0, label: 'first tie by x' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(kClosestPointsToOriginMissionSeed)

export default problemLesson
