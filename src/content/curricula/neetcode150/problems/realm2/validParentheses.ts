import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const validParenthesesMissionSeed = createRealm2MissionSeed({
  slug: 'valid-parentheses',
  estimatedMinutes: 18,
  mission: {
    title: 'The Airlock Seal Reader',
    context:
      'A research ship writes each airlock command with round, square, or curly seals. A closing seal is safe only when it finishes the most recently opened unfinished seal.',
    prompt:
      'Given one string made only of seal symbols, report whether every opener is closed by the same kind in the correct nested order.',
  },
  objective:
    'Validate nested pairs in one scan by using a stack of unfinished opening seals.',
  priorKnowledge: [
    'A stack removes the most recently added item first.',
    'A string can be scanned one character at a time.',
    'Different opening symbols require matching closing symbols.',
  ],
  recognitionCue:
    'The newest unfinished opener must be the first one matched by a closer.',
  misconception:
    'Equal totals of each symbol do not prove correct nesting; ([)] has balanced counts but crosses its pairs.',
  keyRule:
    'On a closer, the stack top must be its matching opener; after the scan, the stack must be empty.',
  algorithmSteps: [
    { id: 'open-stack', instruction: 'Create an empty stack of open seals.' },
    {
      id: 'scan-symbol',
      instruction: 'Read each symbol from left to right.',
    },
    {
      id: 'push-opener',
      instruction: 'Push every opening symbol onto the stack.',
    },
    {
      id: 'match-closer',
      instruction:
        'For a closer, reject if the stack is empty or its top is not the matching opener; otherwise pop.',
    },
    {
      id: 'check-empty',
      instruction: 'Accept only if the stack is empty when the scan ends.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Each of n symbols is pushed or popped at most once, and a string of only openers can fill the stack.',
  },
  explanationVisuals: {
    diagram: { kind: 'stack', items: ['{', '[', '('] },
  },
  workedExample: {
    prompt:
      'Trace {[()]}. The three openers pile up. Each closer matches the current top, so the stack drains in reverse order.',
    code: [
      'stack = []',
      'for symbol in "{[()]}":',
      '    if symbol is an opener: push it',
      '    else: match and pop the top',
      'return stack is empty',
    ],
    currentLineIndex: 3,
    walkthrough: [
      '{, then [, then ( are pushed.',
      ') matches (, so ( leaves the top.',
      '] matches [, then } matches {.',
      'No unfinished seal remains, so the reading is safe.',
    ],
    diagram: { kind: 'stack', items: ['{', '[', '('] },
    diagramSequence: [
      { kind: 'stack', items: ['{'] },
      { kind: 'stack', items: ['{', '['] },
      { kind: 'stack', items: ['{', '[', '('] },
      { kind: 'stack', items: ['{', '['] },
      { kind: 'stack', items: [] },
    ],
  },
  patternCheck: {
    prompt:
      'A closer arrives after several nested openers. Which plan identifies the only opener it may finish?',
    options: [
      {
        id: 'inspect-stack-top',
        label: 'Compare the closer with the top of an opener stack.',
      },
      {
        id: 'count-symbols',
        label: 'Count each symbol and ignore the order in which it appears.',
      },
      {
        id: 'match-oldest',
        label: 'Match the closer with the earliest unfinished opener.',
      },
      {
        id: 'sort-seals',
        label: 'Sort all symbols so matching kinds sit together.',
      },
    ],
    correctOptionId: 'inspect-stack-top',
    diagram: { kind: 'stack', items: ['{', '[', '('] },
  },
  retrievalCheck: {
    prompt:
      'Complete the safety rule: when a closing seal arrives, compare it with ______.',
    acceptedAnswers: [
      'the top of the stack',
      'the most recent opener',
      'the latest unfinished opening seal',
      'top of the stack',
      'the stack top',
      'stack top',
      'the newest opener',
    ],
    placeholder: 'Type the missing stack location',
    diagram: { kind: 'stack', items: ['{', '['] },
  },
  reconstructionCheck: {
    prompt:
      'Restore the seal reader: arrange its setup, scan, push, match, and final check in a correct order.',
    diagram: { kind: 'stack', items: ['(', '['] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["brackets"] and return true only when its (), [], and {} seals are all correctly nested.',
    starterCode: `def solve(data):
    brackets = data["brackets"]
    stack = []

    for symbol in brackets:
        # Push an opener or safely match a closer.
        pass

    # Decide whether any opener is unfinished.
    return False`,
    cases: {
      visibleExample: {
        input: { brackets: '{[()]}' },
        expected: true,
      },
      hiddenBoundary: {
        input: { brackets: '' },
        expected: true,
      },
      hiddenAdversarial: {
        input: { brackets: '([)]' },
        expected: false,
      },
    },
    diagram: { kind: 'stack', items: ['{', '[', '('] },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(validParenthesesMissionSeed)

export default problemLesson
