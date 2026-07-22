import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const validParenthesisStringMissionSeed = buildRealm5Mission({
  slug: 'valid-parenthesis-string',
  estimatedMinutes: 22,
  mission: {
    title: 'The Flexible Gate Brackets',
    context:
      'A gate script contains opening brackets, closing brackets, and flexible question marks. Each question mark may become an opening bracket, a closing bracket, or nothing.',
    prompt:
      'Return whether some assignment of the flexible marks makes the entire script balanced.',
  },
  objective:
    'Greedily track the lowest and highest possible number of unmatched openings after every prefix.',
  priorKnowledge: [
    'A balanced prefix can never require a negative number of open brackets.',
    'The possible open counts can be summarized by an interval.',
  ],
  recognitionCue:
    'Wildcard symbols have three bracket meanings, and the task asks whether any assignment balances the sequence.',
  misconception:
    'Choosing one fixed meaning for each wildcard as soon as it appears can block a valid assignment needed later.',
  algorithmSteps: [
    {
      id: 'seed-open-range',
      instruction: 'Initialize minimum and maximum possible open counts to zero.',
    },
    {
      id: 'scan-script-symbols',
      instruction: 'Process the script from left to right.',
    },
    {
      id: 'update-range-by-symbol',
      instruction:
        'Raise both bounds for an opener, lower both for a closer, and widen them in opposite directions for a wildcard.',
    },
    {
      id: 'reject-negative-maximum',
      instruction: 'Return false if even the maximum possible opens becomes negative.',
    },
    {
      id: 'check-zero-possible',
      instruction: 'Clamp the minimum at zero and return whether it is zero at the end.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each symbol updates two integer bounds once.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['(', '?', '(', ')', ')'],
      [1, 0, 1, 0, 0],
      [1, 2, 3, 2, 1],
    ],
    rowLabels: ['symbol', 'minimum opens', 'maximum opens'],
    columnLabels: ['0', '1', '2', '3', '4'],
    highlightedCells: [{ row: 1, column: 4, label: 'zero is possible' }],
    dependencyCells: [
      { row: 1, column: 3 },
      { row: 2, column: 3 },
    ],
  },
  workedExample: {
    prompt:
      'For "(?())", the possible-open ranges evolve [1,1], [0,2], [1,3], [0,2], [0,1]. Since zero remains possible at the end, the script can balance.',
    code: [
      'low = high = 0',
      'for symbol in script:',
      '    if symbol == "(": low += 1; high += 1',
      '    elif symbol == ")": low -= 1; high -= 1',
      '    else: low -= 1; high += 1',
      '    if high < 0: return False',
      '    low = max(low, 0)',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The first opener forces one unmatched opening.',
      'The wildcard can close it, disappear, or add another opening, giving range 0 through 2.',
      'Later fixed brackets narrow and shift the range.',
      'The final range includes zero, so at least one assignment is balanced.',
    ],
  },
  patternCheck: {
    prompt:
      'Which summary keeps all wildcard choices alive without branching into three separate strings?',
    correct:
      'Track the minimum and maximum possible unmatched-open counts for each prefix.',
    distractors: [
      'Always treat every wildcard as a closing bracket.',
      'Remember only one guessed open count.',
      'Generate all three choices for every wildcard.',
    ],
    hint: 'The reachable open counts form a continuous range after each prefix.',
  },
  retrievalCheck: {
    prompt:
      'How does a wildcard update the possible-open bounds?',
    acceptedAnswers: [
      'low decreases by 1 and high increases by 1',
      'low -= 1; high += 1',
      'low -= 1 and high += 1',
      'low-=1; high+=1',
      'low-=1 and high+=1',
      'decrement low and increment high',
      'low goes down by one and high goes up by one',
      'widen the range down one and up one',
    ],
    placeholder: 'Type both bound changes',
    hint: 'The wildcard may close an opener or become a new opener.',
  },
  reconstructionPrompt:
    'Restore the wildcard-bound scan from zero range through prefix rejection and final balance.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains symbols, a string made of (, ), and ?. Return true when question marks can be replaced by (, ), or empty to make a balanced string.',
    starterCode: `def solve(data):
    symbols = data["symbols"]
    low = 0
    high = 0

    for symbol in symbols:
        if symbol == "(":
            low += 1
            high += 1
        elif symbol == ")":
            low -= 1
            high -= 1
        else:
            # Widen the possible-open interval.
            pass

        if high < 0:
            return False
        low = max(low, 0)

    return low == 0`,
    cases: {
      visibleExample: { input: { symbols: '(?())' }, expected: true },
      hiddenBoundary: { input: { symbols: '' }, expected: true },
      hiddenAdversarial: {
        input: { symbols: '(((((??))' },
        expected: false,
      },
    },
    hints: [
      'For ?, decrement low and increment high.',
      'If high becomes negative, every interpretation has too many closers.',
      'Clamp low at zero and require low == 0 after the scan.',
    ],
  },
})

export const problemLesson = createProblemMission(
  validParenthesisStringMissionSeed,
)

export default problemLesson
