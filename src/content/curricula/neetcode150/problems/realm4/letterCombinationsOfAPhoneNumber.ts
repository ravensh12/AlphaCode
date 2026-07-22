import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const letterCombinationsOfAPhoneNumberMissionSeed =
  createRealm4MissionSeed({
    slug: 'letter-combinations-of-a-phone-number',
    estimatedMinutes: 22,
    mission: {
      title: 'The Signal-Key Decoder',
      context:
        'A rescue radio uses number keys that each stand for a small group of letters. Cadets receive a digit signal and must list every text code it could represent.',
      prompt:
        'For each digit from left to right, try its mapped letters in keypad order. Return only codes with one letter chosen for every digit.',
    },
    objective:
      'Generate a Cartesian product with one recursive level per digit and one choice per mapped letter.',
    priorKnowledge: [
      'A dictionary can map each digit to its allowed letters.',
      'A recursive index can mark the next digit to decode.',
      'Backtracking removes the latest letter after a child returns.',
    ],
    recognitionCue:
      'Each input position offers a small independent set of choices, and every output picks exactly one choice per position.',
    misconception:
      'Looping over one key’s letters without recursing to the next digit builds a single level and loses cross-digit combinations.',
    keyRule:
      'At digit index i, append each mapped letter in order, recurse to i + 1, then pop; save only when i equals the digit count.',
    algorithmSteps: [
      {
        id: 'handle-empty-signal',
        instruction: 'Return an empty list when the digit signal is empty.',
      },
      {
        id: 'open-code-path',
        instruction: 'Create an empty output list and current letter path.',
      },
      {
        id: 'save-full-code',
        instruction: 'When the index reaches the digit count, join and save the path.',
      },
      {
        id: 'read-key-letters',
        instruction: 'Look up the letters mapped to the current digit.',
      },
      {
        id: 'choose-letter',
        instruction: 'Append each mapped letter in keypad order.',
      },
      {
        id: 'advance-digit',
        instruction: 'Recurse to the next digit position.',
      },
      {
        id: 'undo-letter',
        instruction: 'Pop the letter before trying its sibling.',
      },
      {
        id: 'return-codes',
        instruction: 'Return all decoded text codes.',
      },
    ],
    complexity: {
      time: 'O(n · 4^n)',
      space: 'O(n) auxiliary',
      explanation:
        'A digit has at most four letters, so there can be 4^n codes and joining each costs n; the active path has length n.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'recursion',
        frames: [
          { id: 'd0', label: 'digit 2: abc', arguments: { index: 0 }, state: 'returned' },
          { id: 'd1', label: 'digit 7: pqrs', arguments: { path: 'a' }, state: 'active' },
          { id: 'done', label: 'save ap', arguments: { index: 2 }, state: 'pending' },
        ],
        activeFrameId: 'd1',
      },
    },
    workedExample: {
      prompt:
        'For signal 27, choose a from key 2, then pair it with p, q, r, and s from key 7. Backtrack and repeat those four choices after b and c.',
      code: [
        'index 0, digit 2 -> choose a',
        'index 1, digit 7 -> save ap, aq, ar, as',
        'pop a; choose b',
        'save bp, bq, br, bs',
        'pop b; choose c -> save cp, cq, cr, cs',
      ],
      currentLineIndex: 1,
      walkthrough: [
        'Each branch chooses exactly one letter for the first digit.',
        'The second level explores all four letters mapped from 7.',
        'Popping restores the path to length zero before choosing b or c.',
        'Three first-letter choices times four second-letter choices produce twelve codes.',
      ],
      diagram: {
        kind: 'recursion',
        frames: [
          { id: 'root', label: '2 → abc', state: 'returned' },
          { id: 'a', label: 'a + (7 → pqrs)', state: 'active' },
          { id: 'ap', label: 'ap', result: 'saved', state: 'pending' },
        ],
        activeFrameId: 'a',
      },
    },
    patternCheck: {
      prompt:
        'A two-digit signal uses keys with three and four letters. Which search creates all twelve codes?',
      options: [
        {
          id: 'one-level-per-digit',
          label:
            'Use one recursive level per digit and branch once for each mapped letter.',
        },
        {
          id: 'zip-letters',
          label: 'Pair only letters at matching positions in the two mappings.',
        },
        {
          id: 'choose-one-key',
          label: 'Decode all letters from the first key before reading the second.',
        },
        {
          id: 'save-prefixes',
          label: 'Save paths after any single letter, even with digits left.',
        },
      ],
      correctOptionId: 'one-level-per-digit',
      diagram: {
        kind: 'recursion',
        frames: [
          { id: 'first', label: '3 branches', state: 'active' },
          { id: 'second', label: '4 branches each', state: 'pending' },
        ],
        activeFrameId: 'first',
      },
    },
    retrievalCheck: {
      prompt:
        'What base case tells the decoder to join and save the current letters?',
      acceptedAnswers: [
        'when the index equals the number of digits',
        'after one letter has been chosen for every digit',
        'when i == len(digits)',
        'when the index reaches the digit count',
        'when the index equals the digit count',
        'when index == len(digits)',
        'i == len(digits)',
        'when i equals len(digits)',
        'when the index reaches the number of digits',
      ],
      placeholder: 'State the complete-code condition',
      diagram: {
        kind: 'recursion',
        frames: [
          {
            id: 'done',
            label: 'all digits used',
            arguments: { index: 2, digitCount: 2 },
            result: 'save',
            state: 'active',
          },
        ],
        activeFrameId: 'done',
      },
    },
    reconstructionCheck: {
      prompt:
        'Restore the signal decoder: empty check, setup, completion check, lookup, choose, advance, undo, and return.',
      diagram: {
        kind: 'recursion',
        frames: [
          { id: 'frame', label: 'decode digit i', state: 'active' },
        ],
        activeFrameId: 'frame',
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read data["signal"], containing only digits 2 through 9, and return all text codes in ordinary keypad letter order.',
      starterCode: `def solve(data):
    digits = data["signal"]
    keypad = {
        "2": "abc", "3": "def", "4": "ghi", "5": "jkl",
        "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz",
    }
    codes = []
    path = []

    def decode(index):
        # Save complete codes; otherwise branch over this key.
        pass

    if digits:
        decode(0)
    return codes`,
      cases: {
        visibleExample: {
          input: { signal: '27' },
          expected: [
            'ap',
            'aq',
            'ar',
            'as',
            'bp',
            'bq',
            'br',
            'bs',
            'cp',
            'cq',
            'cr',
            'cs',
          ],
        },
        hiddenBoundary: {
          input: { signal: '' },
          expected: [],
        },
        hiddenAdversarial: {
          input: { signal: '9' },
          expected: ['w', 'x', 'y', 'z'],
        },
      },
      comparator: { kind: 'unordered', recursive: false },
      diagram: {
        kind: 'recursion',
        frames: [
          { id: 'key2', label: '2 → abc', state: 'returned' },
          { id: 'key7', label: '7 → pqrs', state: 'active' },
        ],
        activeFrameId: 'key7',
      },
    },
  } as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  letterCombinationsOfAPhoneNumberMissionSeed,
)

export default problemLesson
