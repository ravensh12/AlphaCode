import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const generateParenthesesMissionSeed = createRealm2MissionSeed({
  slug: 'generate-parentheses',
  estimatedMinutes: 24,
  mission: {
    title: 'The Balanced Tunnel Blueprints',
    context:
      'A tunnel robot uses "(" to enter a chamber and ")" to leave one. It needs every possible safe blueprint with exactly the requested number of chamber pairs.',
    prompt:
      'Generate all balanced symbol strings for the given pair count. Output order does not matter.',
  },
  objective:
    'Generate only valid balanced strings by backtracking over legal opening and closing choices.',
  priorKnowledge: [
    'Backtracking chooses, explores, and then undoes a choice.',
    'A prefix can be checked before a complete string exists.',
    'A closing symbol cannot outnumber open symbols in a valid prefix.',
  ],
  recognitionCue:
    'The task asks for every valid construction, and invalid prefixes can be rejected immediately.',
  misconception:
    'Generating all 2^(2n) strings and filtering later spends most work on prefixes that were already impossible.',
  keyRule:
    'Add "(" while opened < n, and add ")" only while closed < opened; record a path at length 2n.',
  algorithmSteps: [
    {
      id: 'open-results',
      instruction: 'Create an empty result list and an empty path stack.',
    },
    {
      id: 'start-search',
      instruction: 'Begin backtracking with zero opened and zero closed pairs.',
    },
    {
      id: 'record-complete',
      instruction: 'Record the path when it contains 2n symbols.',
    },
    {
      id: 'try-opener',
      instruction:
        'If fewer than n openers are used, append "(", recurse, and undo.',
    },
    {
      id: 'try-closer',
      instruction:
        'If closed is less than opened, append ")", recurse, and undo.',
    },
    {
      id: 'return-blueprints',
      instruction: 'Return the collected strings.',
    },
  ],
  complexity: {
    time: 'O(Cn · n)',
    space: 'O(n)',
    explanation:
      'There are Cn valid Catalan-number outputs and copying each length-2n string costs O(n); the active recursion path has length 2n.',
  },
  explanationVisuals: {
    diagram: { kind: 'stack', items: ['(', '(', ')'] },
  },
  workedExample: {
    prompt:
      'With two chamber pairs, opening-first search finishes (()) before backing up to build ()(). No prefix ever has more exits than entries.',
    code: [
      'build("", opened=0, closed=0)',
      'choose "(" -> build("(", 1, 0)',
      'choose "(" -> build("((", 2, 0)',
      'choose ")" twice -> record "(())"',
      'backtrack and later record "()()"',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The search may open while fewer than two openers have been used.',
      'It may close only after an unmatched opener exists.',
      'The deepest opening-first branch produces (()).',
      'Undoing choices reveals the separate safe branch ()().',
    ],
    diagram: { kind: 'stack', items: ['(', '(', ')', ')'] },
    diagramSequence: [
      { kind: 'stack', items: ['('] },
      { kind: 'stack', items: ['(', '('] },
      { kind: 'stack', items: ['(', '(', ')'] },
      { kind: 'stack', items: ['(', '(', ')', ')'] },
      { kind: 'stack', items: ['(', ')', '(', ')'] },
    ],
  },
  patternCheck: {
    prompt:
      'While building a blueprint prefix, which rule prevents an unsafe exit?',
    options: [
      {
        id: 'close-below-open',
        label: 'Add ")" only when closed is smaller than opened.',
      },
      {
        id: 'always-alternate',
        label: 'Always alternate "(" and ")" after the first symbol.',
      },
      {
        id: 'close-until-full',
        label: 'Add ")" whenever fewer than n closers have been used.',
      },
      {
        id: 'filter-at-end',
        label: 'Allow every prefix and test balance only after length 2n.',
      },
    ],
    correctOptionId: 'close-below-open',
    diagram: { kind: 'stack', items: ['(', '(', ')'] },
  },
  retrievalCheck: {
    prompt:
      'Complete the prefix invariant: at every point, closed must be ______ opened.',
    acceptedAnswers: [
      'less than or equal to',
      'at most',
      'no greater than',
      '<=',
      'less than or equal',
      'not greater than',
      'no more than',
      'at most equal to',
    ],
    placeholder: 'Type the comparison',
    diagram: { kind: 'stack', items: ['(', ')', '('] },
  },
  reconstructionCheck: {
    prompt:
      'Restore the opening-first backtracking routine from setup through recording, legal choices, undoing, and return.',
    diagram: { kind: 'stack', items: ['(', '(', ')'] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["pairs"] and return every balanced blueprint. Any output order is accepted.',
    starterCode: `def solve(data):
    pairs = data["pairs"]
    results = []
    path = []

    def build(opened, closed):
        # Record a complete path or explore each legal next symbol.
        pass

    build(0, 0)
    return results`,
    cases: {
      visibleExample: {
        input: { pairs: 2 },
        expected: ['(())', '()()'],
      },
      hiddenBoundary: {
        input: { pairs: 0 },
        expected: [''],
      },
      hiddenAdversarial: {
        input: { pairs: 4 },
        expected: [
          '(((())))',
          '((()()))',
          '((())())',
          '((()))()',
          '(()(()))',
          '(()()())',
          '(()())()',
          '(())(())',
          '(())()()',
          '()((()))',
          '()(()())',
          '()(())()',
          '()()(())',
          '()()()()',
        ],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    diagram: { kind: 'stack', items: ['(', ')', '(', ')'] },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(generateParenthesesMissionSeed)

export default problemLesson
