import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const largestRectangleInHistogramMissionSeed =
  createRealm2MissionSeed({
    slug: 'largest-rectangle-in-histogram',
    estimatedMinutes: 27,
    mission: {
      title: 'The Festival Banner Wall',
      context:
        'A festival wall has adjacent support columns of different heights. A rectangular banner must span consecutive columns and cannot be taller than the shortest column beneath it.',
      prompt:
        'Find the greatest possible banner area for the given column heights. A banner may use one or more neighboring columns.',
    },
    objective:
      'Find each height’s widest valid span with a monotonic stack and keep the greatest area.',
    priorKnowledge: [
      'Rectangle area is height multiplied by width.',
      'A shorter column ends the rightward span of taller earlier columns.',
      'A stack can keep unresolved increasing heights and their start indices.',
    ],
    recognitionCue:
      'Each bar needs the first smaller boundary on both sides to know its maximum usable width.',
    misconception:
      'Using only neighboring bars misses rectangles that stretch across many columns of adequate height.',
    keyRule:
      'When a shorter height arrives, pop taller bars, score each from its saved start to the current index, and carry the earliest popped start to the new height.',
    algorithmSteps: [
      {
        id: 'open-area-stack',
        instruction: 'Create best = 0 and an empty stack of start-height pairs.',
      },
      {
        id: 'append-sentinel',
        instruction: 'Scan all heights followed by a final zero-height sentinel.',
      },
      {
        id: 'begin-current-start',
        instruction: 'Set the current height’s possible start to its own index.',
      },
      {
        id: 'score-taller-bars',
        instruction:
          'While the stack top is taller, pop it, score height × (current index - saved start), and carry its start.',
      },
      {
        id: 'push-current-bar',
        instruction: 'Push the carried start with the current height.',
      },
      {
        id: 'return-best-area',
        instruction: 'Return the greatest area scored.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(n)',
      explanation:
        'Each column pair is pushed and popped at most once. Increasing heights can all remain on the stack until the sentinel.',
    },
    explanationVisuals: {
      diagram: { kind: 'stack', items: ['start 0:h2', 'start 1:h4', 'start 2:h5'] },
    },
    workedExample: {
      prompt:
        'For [2, 1, 4, 5, 1, 3], height 1 at index 4 ends the spans of 5 and 4. Height 4 reaches back to index 2, giving width 2 and area 8.',
      code: [
        'stack before index 4: [(0,1), (2,4), (3,5)]',
        'pop (3,5) -> area 5 * 1 = 5',
        'pop (2,4) -> area 4 * 2 = 8',
        'carry start 2 for the new height 1',
        'best remains 8 after the final flush',
      ],
      currentLineIndex: 2,
      walkthrough: [
        'The shorter column at index 4 is the first right boundary for heights 5 and 4.',
        'Height 5 spans only index 3.',
        'Height 4 spans indices 2 and 3, making area 8.',
        'The saved start lets the shorter bar represent the full open region.',
      ],
      diagram: { kind: 'stack', items: ['start 0:h1', 'start 2:h4', 'start 3:h5'] },
      diagramSequence: [
        { kind: 'stack', items: ['start 0:h2'] },
        { kind: 'stack', items: ['start 0:h1'] },
        { kind: 'stack', items: ['start 0:h1', 'start 2:h4', 'start 3:h5'] },
        { kind: 'stack', items: ['start 0:h1', 'start 2:h1'] },
      ],
    },
    patternCheck: {
      prompt:
        'A shorter column arrives after an increasing run. Which stored detail is needed to score each ended rectangle?',
      options: [
        {
          id: 'height-and-start',
          label: 'Store each unresolved height with its earliest valid start index.',
        },
        {
          id: 'height-only',
          label: 'Store only heights and guess every width as one.',
        },
        {
          id: 'sorted-columns',
          label: 'Sort columns by height before measuring widths.',
        },
        {
          id: 'global-shortest',
          label: 'Use the shortest column across the entire wall for every banner.',
        },
      ],
      correctOptionId: 'height-and-start',
      diagram: { kind: 'stack', items: ['start 2:h4', 'start 3:h5'] },
    },
    retrievalCheck: {
      prompt:
        'After popping a pair (start, height) at current index i, what area is scored?',
      acceptedAnswers: [
        'height * (i - start)',
        'height times (current index minus start)',
        'h * (i - start)',
        'height * (i-start)',
        'height*(i-start)',
        'h*(i-start)',
        'height x (i - start)',
        '(i - start) * height',
      ],
      placeholder: 'Type the area formula',
      diagram: { kind: 'stack', items: ['start 2:h4'] },
    },
    reconstructionCheck: {
      prompt:
        'Reassemble the banner scan from stack setup and sentinel through popping, start carrying, pushing, and returning best.',
      diagram: { kind: 'stack', items: ['start 0:h2', 'start 2:h4'] },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read data["heights"] and return the largest rectangle area under consecutive columns.',
      starterCode: `def solve(data):
    heights = data["heights"]
    stack = []
    best = 0

    for index, height in enumerate(heights + [0]):
        start = index
        # Score ended heights, carry their earliest start, then push.
        pass

    return best`,
      cases: {
        visibleExample: {
          input: { heights: [2, 1, 4, 5, 1, 3] },
          expected: 8,
        },
        hiddenBoundary: {
          input: { heights: [] },
          expected: 0,
        },
        hiddenAdversarial: {
          input: { heights: [2, 2, 2, 2] },
          expected: 8,
        },
      },
      diagram: { kind: 'stack', items: ['start 2:h4', 'start 3:h5'] },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  largestRectangleInHistogramMissionSeed,
)

export default problemLesson
