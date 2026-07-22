import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const longestPalindromicSubstringMissionSeed = buildRealm5Mission({
  slug: 'longest-palindromic-substring',
  estimatedMinutes: 25,
  mission: {
    title: 'The Mirror-Signal Decoder',
    context:
      'A deep-space receiver marks a stable signal when a continuous block reads the same from left to right and right to left.',
    prompt:
      'Return the longest stable block in the received string. If several have the same maximum length, return the one that starts earliest.',
  },
  objective:
    'Find the longest palindromic span by expanding around every odd and even center.',
  priorKnowledge: [
    'A palindrome has matching characters at equal distances from its center.',
    'A center may be one character or the gap between two characters.',
  ],
  recognitionCue:
    'The target is one contiguous mirror-symmetric span, so each possible center can grow outward.',
  misconception:
    'Checking only character centers misses even-length mirrors whose center lies between characters.',
  algorithmSteps: [
    {
      id: 'start-empty-best',
      instruction: 'Initialize the earliest best span as empty.',
    },
    {
      id: 'visit-centers',
      instruction: 'Visit every character position from left to right.',
    },
    {
      id: 'expand-odd-even',
      instruction:
        'Expand once from the character pair (i, i) and once from the gap pair (i, i + 1).',
    },
    {
      id: 'record-longer-span',
      instruction: 'When an expansion is strictly longer, record its start and length.',
    },
    {
      id: 'return-best-slice',
      instruction: 'Return the recorded contiguous slice.',
    },
  ],
  complexity: {
    time: 'O(n^2)',
    space: 'O(1)',
    explanation:
      'There are O(n) centers and an expansion may cross O(n) characters, while only indices are stored.',
  },
  diagram: {
    kind: 'grid',
    variant: 'grid',
    cells: [
      ['t', 'a', 'c', 'o', 'c', 'a', 't'],
      ['↔', '↔', '↔', 'center', '↔', '↔', '↔'],
    ],
    rowLabels: ['signal', 'mirror'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6'],
    highlightedCells: [
      { row: 0, column: 0, label: 'left' },
      { row: 0, column: 3, label: 'center' },
      { row: 0, column: 6, label: 'right' },
    ],
  },
  workedExample: {
    prompt:
      'In signal "tacocatx", expansion around the fourth character matches c/c, a/a, then t/t. It stops before x, leaving "tacocat".',
    code: [
      'left = right = 3',
      'while left >= 0 and right < len(signal) and signal[left] == signal[right]:',
      '    left -= 1',
      '    right += 1',
      'mirror = signal[left + 1:right]',
    ],
    currentLineIndex: 1,
    walkthrough: [
      'The center o matches itself, so the span starts with length 1.',
      'The next pair is c and c, extending the span to length 3.',
      'Then a/a and t/t extend it to length 7.',
      'The next comparison leaves the string, so the stable block is "tacocat".',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan finds both odd-length and even-length mirror blocks without storing every substring?',
    correct:
      'Expand matching left and right pointers from every character and every gap.',
    distractors: [
      'Compare each character only with its immediate neighbors.',
      'Remember only the longest matching prefix and suffix of the whole signal.',
      'Create every substring and reverse each one.',
    ],
    hint: 'The center of "noon" is a gap, while the center of "radar" is a character.',
  },
  retrievalCheck: {
    prompt:
      'What two starting pointer pairs must be expanded for a center index i?',
    acceptedAnswers: [
      '(i, i) and (i, i + 1)',
      '(i,i) and (i,i+1)',
      '(i, i) and (i, i+1)',
      'i,i and i,i+1',
      'i, i and i, i + 1',
      'character center and gap center',
      'the character center and the gap center',
    ],
    placeholder: 'Type both center pairs',
    hint: 'One pair begins together; the other begins on neighboring positions.',
  },
  reconstructionPrompt:
    'Put the mirror scan in order from best-span setup through odd/even expansion and slicing.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains signal, a string. Return its longest contiguous palindrome, choosing the earliest start when lengths tie.',
    starterCode: `def solve(data):
    signal = data["signal"]
    best_start, best_len = 0, 0

    for center in range(len(signal)):
        for left, right in ((center, center), (center, center + 1)):
            while left >= 0 and right < len(signal) and signal[left] == signal[right]:
                left -= 1
                right += 1
            length = right - left - 1
            if length > best_len:
                # Save this strictly longer span.
                pass

    return signal[best_start:best_start + best_len]`,
    cases: {
      visibleExample: { input: { signal: 'tacocatx' }, expected: 'tacocat' },
      hiddenBoundary: { input: { signal: '' }, expected: '' },
      hiddenAdversarial: {
        input: { signal: 'abaxyzzyxf' },
        expected: 'xyzzyx',
      },
    },
    hints: [
      'After expansion stops, the matched span begins at left + 1.',
      'Its length is right - left - 1.',
      'Update only for a strictly longer span to keep the earliest tie.',
    ],
  },
})

export const problemLesson = createProblemMission(
  longestPalindromicSubstringMissionSeed,
)

export default problemLesson
