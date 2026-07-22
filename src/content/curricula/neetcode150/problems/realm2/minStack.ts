import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const minStackMissionSeed = createRealm2MissionSeed({
  slug: 'min-stack',
  estimatedMinutes: 22,
  mission: {
    title: 'The Crystal Crate Tower',
    context:
      'Miners stack crystal crates in one narrow lift. The safety panel must instantly show both the top crate and the lightest crate still in the tower, even after removals.',
    prompt:
      'Process a log of push, pop, top, and min commands. Return the answers from top and min commands in their original order.',
  },
  objective:
    'Support stack updates, top lookup, and minimum lookup in O(1) time by storing an extra minimum with each level.',
  priorKnowledge: [
    'A stack changes only at its top.',
    'The minimum of a one-item stack is that item.',
    'Removing the top restores the exact state below it.',
  ],
  recognitionCue:
    'A stack query asks for an aggregate of everything below the top after every update.',
  misconception:
    'Keeping one global minimum fails when the only copy of that minimum is popped and an older minimum must return.',
  keyRule:
    'Each pushed level stores the smaller of its value and the minimum recorded by the level below it.',
  algorithmSteps: [
    {
      id: 'open-augmented-stack',
      instruction: 'Create an empty stack whose entries hold value and minimum.',
    },
    {
      id: 'read-operation',
      instruction: 'Read each operation in order.',
    },
    {
      id: 'push-with-minimum',
      instruction:
        'On push, store the value with the minimum of that value and the previous top minimum.',
    },
    {
      id: 'apply-pop',
      instruction: 'On pop, remove the top augmented entry.',
    },
    {
      id: 'answer-query',
      instruction:
        'On top or min, append the matching field from the top entry.',
    },
    {
      id: 'return-answers',
      instruction: 'Return all query answers in order.',
    },
  ],
  complexity: {
    time: 'O(m)',
    space: 'O(n)',
    explanation:
      'Each of m commands takes constant time. At most n pushed entries, each with two numbers, remain stored.',
  },
  explanationVisuals: {
    diagram: { kind: 'stack', items: ['5|min 5', '2|min 2', '4|min 2'] },
  },
  workedExample: {
    prompt:
      'Crates 5, 2, and 4 create minimum labels 5, 2, and 2. Removing 4 exposes the earlier level, whose label still says 2.',
    code: [
      'push(5)  # store (5, 5)',
      'push(2)  # store (2, 2)',
      'push(4)  # store (4, 2)',
      'min()    # read 2',
      'pop()',
      'top()    # read 2',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The first level records 5 as both value and minimum.',
      'Crate 2 lowers the stored minimum to 2.',
      'Crate 4 keeps 2 as its minimum label.',
      'Both before and after popping 4, the top label supplies the right minimum.',
    ],
    diagram: { kind: 'stack', items: ['5|min 5', '2|min 2', '4|min 2'] },
    diagramSequence: [
      { kind: 'stack', items: ['5|min 5'] },
      { kind: 'stack', items: ['5|min 5', '2|min 2'] },
      { kind: 'stack', items: ['5|min 5', '2|min 2', '4|min 2'] },
      { kind: 'stack', items: ['5|min 5', '2|min 2'] },
    ],
  },
  patternCheck: {
    prompt:
      'The panel must answer min immediately after any pop. Which stored state makes that possible?',
    options: [
      {
        id: 'minimum-per-level',
        label: 'Store the minimum-so-far beside every pushed value.',
      },
      {
        id: 'single-minimum',
        label: 'Store one minimum variable and erase it whenever it is popped.',
      },
      {
        id: 'sort-after-command',
        label: 'Sort all remaining crates after every command.',
      },
      {
        id: 'scan-on-min',
        label: 'Scan the full tower whenever a min command arrives.',
      },
    ],
    correctOptionId: 'minimum-per-level',
    diagram: { kind: 'stack', items: ['5|min 5', '2|min 2', '4|min 2'] },
  },
  retrievalCheck: {
    prompt:
      'When pushing value x, what minimum should its new stack entry record?',
    acceptedAnswers: [
      'min(x, previous minimum)',
      'the smaller of x and the previous minimum',
      'minimum of x and the old top minimum',
      'the minimum of x and the previous minimum',
      'min(x, previous min)',
      'min(x, old minimum)',
      'smaller of x and the previous minimum',
    ],
    placeholder: 'Type the minimum update',
    diagram: { kind: 'stack', items: ['5|min 5', '2|min 2'] },
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the command processor so pushes record history before later pops and queries read the current top entry.',
    diagram: { kind: 'stack', items: ['8|min 8', '3|min 3'] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["operations"] is an array such as ["push", 5], ["pop"], ["top"], or ["min"]. Push and pop produce no output. Return an array containing only top and min answers.',
    starterCode: `def solve(data):
    operations = data["operations"]
    stack = []
    answers = []

    for operation in operations:
        command = operation[0]
        # Update an augmented stack or record a query answer.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          operations: [
            ['push', 5],
            ['push', 2],
            ['min'],
            ['push', 1],
            ['min'],
            ['pop'],
            ['min'],
            ['top'],
          ],
        },
        expected: [2, 1, 2, 2],
      },
      hiddenBoundary: {
        input: { operations: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          operations: [
            ['push', -2],
            ['push', -2],
            ['min'],
            ['pop'],
            ['min'],
            ['push', -9],
            ['top'],
            ['min'],
          ],
        },
        expected: [-2, -2, -9, -9],
      },
    },
    diagram: { kind: 'stack', items: ['5|min 5', '2|min 2'] },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(minStackMissionSeed)

export default problemLesson
