import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const decodeWaysMissionSeed = buildRealm5Mission({
  slug: 'decode-ways',
  estimatedMinutes: 24,
  mission: {
    title: 'The Numbered Beacon Alphabet',
    context:
      'A rescue beacon writes letters as numbers: 1 means A, 2 means B, and so on through 26. A zero cannot stand alone.',
    prompt:
      'Given one uninterrupted digit string, return how many valid letter messages it could represent.',
  },
  objective:
    'Count prefix decodings by adding valid one-digit and two-digit predecessor states.',
  priorKnowledge: [
    'A valid final letter uses either one digit from 1–9 or two digits from 10–26.',
    'The empty prefix contributes one completed way to extend.',
  ],
  recognitionCue:
    'A sequence can be split into valid one- or two-symbol pieces, and the question asks for the number of splits.',
  misconception:
    'Treating zero as a letter creates invalid messages; zero works only inside 10 or 20.',
  algorithmSteps: [
    {
      id: 'seed-empty-prefix',
      instruction: 'Set the empty-prefix count to one and the first-digit count by its validity.',
    },
    {
      id: 'scan-prefix-ends',
      instruction: 'Process each later prefix endpoint from left to right.',
    },
    {
      id: 'add-single-source',
      instruction: 'If the final digit is 1–9, add the count before that digit.',
    },
    {
      id: 'add-pair-source',
      instruction: 'If the final two digits form 10–26, add the count before that pair.',
    },
    {
      id: 'return-full-prefix',
      instruction: 'Return the count for the complete digit string.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Each prefix checks at most two endings, and the table stores one count per prefix.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['∅', '1', '2', '1', '3'],
      [1, 1, 2, 3, 5],
    ],
    rowLabels: ['new symbol', 'prefix ways'],
    columnLabels: ['0', '1', '2', '3', '4'],
    highlightedCells: [{ row: 1, column: 4, label: '5 messages' }],
    dependencyCells: [
      { row: 1, column: 2 },
      { row: 1, column: 3 },
    ],
  },
  workedExample: {
    prompt:
      'For code "1213", prefix counts are 1, 1, 2, 3, and 5. At the end, digit 3 and pair 13 are both valid, so 3 + 2 gives 5 messages.',
    code: [
      'ways = [1, 1, 0, 0, 0]',
      'for i in range(2, 5):',
      '    if code[i - 1] != "0": ways[i] += ways[i - 1]',
      '    if 10 <= int(code[i - 2:i]) <= 26: ways[i] += ways[i - 2]',
      'return ways[4]',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Prefix "1" has one reading.',
      'Prefix "12" can end as 2 or 12, giving two readings.',
      'Prefix "121" receives two one-digit endings and one two-digit ending.',
      'Prefix "1213" receives 3 ways through digit 3 and 2 ways through pair 13.',
    ],
  },
  patternCheck: {
    prompt:
      'Which state avoids both missing valid messages and accepting a zero by itself?',
    correct:
      'For each prefix, add only the predecessor counts whose one- or two-digit ending is valid.',
    distractors: [
      'Multiply the count by two for every digit, including zero.',
      'Remember only whether the previous digit was nonzero.',
      'Generate every split of the digit string before validating its pieces.',
    ],
    hint: 'A prefix can inherit from one position back, two positions back, or neither.',
  },
  retrievalCheck: {
    prompt:
      'What two validity checks can contribute to ways[i]?',
    acceptedAnswers: [
      'last digit is 1-9 and last two digits are 10-26',
      'the last digit is 1-9 and the last two digits are 10-26',
      'last digit 1-9 and last two digits 10-26',
      'last digit is 1 to 9 and last two digits are 10 to 26',
      'last digit 1 to 9 and last two digits 10 to 26',
      'last digit is 1 through 9 and last two digits are 10 through 26',
      'the last digit is not 0 and the last two digits are 10-26',
      'the last digit is nonzero and the last two digits are 10-26',
      'final digit is 1-9 and final pair is 10-26',
      'code[i-1] is nonzero and code[i-2:i] is between 10 and 26',
      'valid one digit and valid two digit ending',
      'a valid one-digit ending and a valid two-digit ending',
      'a valid one digit ending and a valid two digit ending',
    ],
    placeholder: 'Type both checks',
    hint: 'Ask whether the final letter consumes one digit or two.',
  },
  reconstructionPrompt:
    'Rebuild the prefix-decoding count from the empty base through both ending checks.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains code, a nonempty digit string. Return the number of full decodings under the 1-through-26 alphabet rule.',
    starterCode: `def solve(data):
    code = data["code"]
    if not code:
        return 0

    ways = [0] * (len(code) + 1)
    ways[0] = 1
    ways[1] = 0 if code[0] == "0" else 1

    for i in range(2, len(code) + 1):
        # Add valid one-digit and two-digit predecessor counts.
        pass

    return ways[len(code)]`,
    cases: {
      visibleExample: { input: { code: '1213' }, expected: 5 },
      hiddenBoundary: { input: { code: '0' }, expected: 0 },
      hiddenAdversarial: { input: { code: '1011' }, expected: 2 },
    },
    hints: [
      'A final digit contributes ways[i - 1] only when it is not "0".',
      'A final pair contributes ways[i - 2] only when its value is 10 through 26.',
      'Both checks may contribute to the same prefix.',
    ],
  },
})

export const problemLesson = createProblemMission(decodeWaysMissionSeed)

export default problemLesson
