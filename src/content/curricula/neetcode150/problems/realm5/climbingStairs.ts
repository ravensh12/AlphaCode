import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const climbingStairsMissionSeed = buildRealm5Mission({
  slug: 'climbing-stairs',
  estimatedMinutes: 18,
  mission: {
    title: 'The Observatory Ladder Routes',
    context:
      'A hilltop observatory has a narrow ladder with numbered levels. A maintenance robot can rise either one level or two levels with each move.',
    prompt:
      'Given the number of levels above the floor, return how many different move sequences take the robot exactly to the platform.',
  },
  objective:
    'Count routes with a one-dimensional recurrence whose state stores the number of ways to reach each level.',
  priorKnowledge: [
    'A final move can come from one level below or two levels below.',
    'Different move orders count as different routes.',
  ],
  recognitionCue:
    'The total for a position is the sum of a small fixed set of earlier positions.',
  misconception:
    'Adding the level number instead of the two previous route counts does not represent how routes arrive.',
  algorithmSteps: [
    { id: 'set-base-routes', instruction: 'Set ways(0) = 1 and ways(1) = 1.' },
    {
      id: 'scan-levels',
      instruction: 'Process levels from 2 through the requested level.',
    },
    {
      id: 'combine-predecessors',
      instruction: 'Set ways(level) to ways(level - 1) + ways(level - 2).',
    },
    {
      id: 'shift-memory',
      instruction: 'Keep only the newest two route counts for the next level.',
    },
    {
      id: 'return-top-count',
      instruction: 'Return the route count stored for the platform level.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each level is filled once, and two rolling counts replace a full table.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [[1, 1, 2, 3, 5, 8, 13]],
    rowLabels: ['ways'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6'],
    highlightedCells: [{ row: 0, column: 6, label: 'platform' }],
    dependencyCells: [
      { row: 0, column: 4 },
      { row: 0, column: 5 },
    ],
  },
  workedExample: {
    prompt:
      'Trace a six-level ladder. The last move reaches level 6 from level 5 or level 4, so its count is 8 + 5 = 13.',
    code: [
      'two_back, one_back = 1, 1',
      'for level in range(2, 7):',
      '    current = one_back + two_back',
      '    two_back, one_back = one_back, current',
      'return one_back',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'Levels 0 and 1 each begin with one route.',
      'Levels 2, 3, and 4 receive 2, 3, and 5 routes.',
      'Level 5 receives 8 routes.',
      'Level 6 combines 8 and 5, giving 13 routes.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan counts every route without listing every sequence of one-step and two-step moves?',
    correct:
      'Store the two previous route counts and add them to form the next count.',
    distractors: [
      'Double the count at every level, even when a two-level move would pass the platform.',
      'Keep only the previous level number and forget its route count.',
      'Generate every move sequence and reject the ones that overshoot.',
    ],
    hint: 'Classify routes by the size of their final move.',
  },
  retrievalCheck: {
    prompt: 'Complete the transition: ways(i) = ______.',
    acceptedAnswers: [
      'ways(i - 1) + ways(i - 2)',
      'ways(i-1) + ways(i-2)',
      'ways(i-1)+ways(i-2)',
      'ways(i - 1) plus ways(i - 2)',
      'ways(i-1) plus ways(i-2)',
      'ways[i - 1] + ways[i - 2]',
      'ways[i-1] + ways[i-2]',
      'ways[i-1]+ways[i-2]',
      'one_back + two_back',
      'one_back+two_back',
      'two_back + one_back',
      'two_back+one_back',
      'the previous two route counts added together',
      'the sum of the previous two route counts',
      'the sum of the two previous counts',
    ],
    placeholder: 'Type the recurrence',
    hint: 'A route arrives with either a one-level move or a two-level move.',
  },
  reconstructionPrompt:
    'Put the rolling route-count algorithm in dependency-safe order.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains levels, a nonnegative integer. Return the number of one-level and two-level move sequences that land exactly on that level.',
    starterCode: `def solve(data):
    levels = data["levels"]
    if levels <= 1:
        return 1

    two_back, one_back = 1, 1
    for level in range(2, levels + 1):
        # Combine the two states, then shift them.
        pass

    return one_back`,
    cases: {
      visibleExample: { input: { levels: 6 }, expected: 13 },
      hiddenBoundary: { input: { levels: 1 }, expected: 1 },
      hiddenAdversarial: { input: { levels: 8 }, expected: 34 },
    },
    hints: [
      'Initialize the route counts for levels 0 and 1 to 1.',
      'Inside the loop, compute current = one_back + two_back.',
      'Shift with two_back, one_back = one_back, current.',
    ],
  },
})

export const problemLesson = createProblemMission(climbingStairsMissionSeed)

export default problemLesson
