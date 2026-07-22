import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const palindromicSubstringsMissionSeed = buildRealm5Mission({
  slug: 'palindromic-substrings',
  estimatedMinutes: 22,
  mission: {
    title: 'The Archive Mirror Counter',
    context:
      'An archive scanner awards one seal for every continuous text span that reads identically in both directions. Equal-looking spans at different positions earn separate seals.',
    prompt:
      'Return the total number of mirror spans in the supplied string, including every single character.',
  },
  objective:
    'Count every palindromic span exactly once by expanding around all odd and even centers.',
  priorKnowledge: [
    'Each palindrome has one unique center.',
    'Single characters are palindromes of length one.',
  ],
  recognitionCue:
    'The task asks for all contiguous mirror spans rather than only the longest one.',
  misconception:
    'Putting palindrome text in a set undercounts equal spans that occur at different locations.',
  algorithmSteps: [
    { id: 'start-zero-count', instruction: 'Initialize the mirror-span count to zero.' },
    {
      id: 'visit-every-center',
      instruction: 'Visit each character as the left side of two possible centers.',
    },
    {
      id: 'open-odd-even',
      instruction: 'Start one expansion at (i, i) and another at (i, i + 1).',
    },
    {
      id: 'count-each-match',
      instruction: 'For every matching expansion layer, add one and move outward.',
    },
    {
      id: 'return-total-count',
      instruction: 'Return the count after all centers stop expanding.',
    },
  ],
  complexity: {
    time: 'O(n^2)',
    space: 'O(1)',
    explanation:
      'O(n) centers can each expand O(n) positions, and the scan stores only pointers and a counter.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['P', '.', '.', '.', 'P'],
      ['-', 'P', '.', 'P', '.'],
      ['-', '-', 'P', '.', '.'],
      ['-', '-', '-', 'P', '.'],
      ['-', '-', '-', '-', 'P'],
    ],
    rowLabels: ['start 0', 'start 1', 'start 2', 'start 3', 'start 4'],
    columnLabels: ['end 0', 'end 1', 'end 2', 'end 3', 'end 4'],
    highlightedCells: [
      { row: 0, column: 4, label: 'level' },
      { row: 1, column: 3, label: 'eve' },
    ],
    dependencyCells: [{ row: 2, column: 2 }],
  },
  workedExample: {
    prompt:
      'For "levelup", seven one-character spans count first. Expanding at v also finds "eve" and "level", raising the total to 9.',
    code: [
      'count = 0',
      'for center in range(len(text)):',
      '    for left, right in ((center, center), (center, center + 1)):',
      '        while left >= 0 and right < len(text) and text[left] == text[right]:',
      '            count += 1',
      '            left, right = left - 1, right + 1',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Each of the seven positions supplies one odd span of length 1.',
      'At center v, the next layer e/e creates "eve".',
      'The following layer l/l creates "level".',
      'No other center expands past one character, so the total is 9.',
    ],
  },
  patternCheck: {
    prompt:
      'Which counting plan gives separate credit to equal-looking spans at different positions?',
    correct:
      'Expand from every odd and even center and count each successful layer.',
    distractors: [
      'Count only matching neighboring character pairs.',
      'Store palindrome text in a set and return the set size.',
      'Generate and reverse every possible substring.',
    ],
    hint: 'One successful expansion corresponds to one start/end pair.',
  },
  retrievalCheck: {
    prompt:
      'During one center expansion, when should the counter increase?',
    acceptedAnswers: [
      'each time the left and right characters match',
      'every time the left and right characters match',
      'whenever the left and right characters match',
      'when the left and right characters match',
      'when text[left] == text[right]',
      'when signal[left] == signal[right]',
      'on every successful matching expansion',
      'before moving outward after a match',
    ],
    placeholder: 'Type the counting rule',
    hint: 'The current matching endpoints define one new span.',
  },
  reconstructionPrompt:
    'Restore the center-expansion counter from initialization to its final total.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains signal, a string. Return the number of contiguous palindromic spans, counting positions separately.',
    starterCode: `def solve(data):
    signal = data["signal"]
    count = 0

    for center in range(len(signal)):
        for left, right in ((center, center), (center, center + 1)):
            while left >= 0 and right < len(signal) and signal[left] == signal[right]:
                # Count this span.
                pass
                left -= 1
                right += 1

    return count`,
    cases: {
      visibleExample: { input: { signal: 'levelup' }, expected: 9 },
      hiddenBoundary: { input: { signal: '' }, expected: 0 },
      hiddenAdversarial: { input: { signal: 'aaaa' }, expected: 10 },
    },
    hints: [
      'Use both (center, center) and (center, center + 1).',
      'Increment count once inside each successful while-loop iteration.',
      'Move both pointers outward after counting.',
    ],
  },
})

export const problemLesson = createProblemMission(
  palindromicSubstringsMissionSeed,
)

export default problemLesson
