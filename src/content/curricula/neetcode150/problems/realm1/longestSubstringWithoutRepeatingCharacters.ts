import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const longestSubstringWithoutRepeatingCharactersMissionSeed = {
  slug: 'longest-substring-without-repeating-characters',
  estimatedMinutes: 21,
  mission: {
    title: 'The No-Echo Star Route',
    context:
      'A navigation route is written as one string of checkpoint symbols. A clean route segment cannot visit the same symbol twice.',
    prompt:
      'Return the length of the longest contiguous segment with no repeated symbol.',
  },
  objective:
    'Maintain a variable window whose set contains exactly its distinct characters.',
  priorKnowledge: [
    'A set can test whether a character is already inside a window.',
    'A substring uses consecutive positions.',
    'A left pointer can shrink a window while a right pointer grows it.',
  ],
  recognitionCue:
    'You need the longest contiguous region satisfying a rule that breaks when a duplicate enters.',
  misconception:
    'Clearing the whole window on a duplicate throws away a valid suffix that could keep growing.',
  algorithmSteps: [
    { id: 'open-window', instruction: 'Create an empty set, set left to 0, and start best at 0.' },
    { id: 'scan-right', instruction: 'Move right through each route symbol.' },
    { id: 'shrink-duplicate', instruction: 'While the right symbol is already present, remove route[left] and advance left.' },
    { id: 'add-right', instruction: 'Add the right symbol after the duplicate is gone.' },
    { id: 'measure-window', instruction: 'Update best with right - left + 1.' },
    { id: 'return-best', instruction: 'Return best after the right scan ends.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(k)',
    explanation:
      'Each of n symbols enters and leaves the set at most once; the set holds at most k distinct symbols.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: 'abcaef',
      pointers: [
        { index: 1, label: 'left' },
        { index: 5, label: 'right' },
      ],
      visited: [0],
    },
  },
  workedExample: {
    prompt:
      'In route “abcaef”, the second a repeats the first. Shrinking removes only the old a, leaving “bca”; then e and f grow the clean segment to “bcaef” of length 5.',
    code: [
      'def clean_span(route):',
      '    inside = set()',
      '    left = best = 0',
      '    for right, symbol in enumerate(route):',
      '        while symbol in inside:',
      '            inside.remove(route[left])',
      '            left += 1',
      '        inside.add(symbol)',
      '        best = max(best, right - left + 1)',
      '    return best',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The first window grows through abc.',
      'At the next a, remove the old a and advance left to index 1.',
      'The valid suffix bca remains and grows through e and f, reaching length 5.',
    ],
    diagram: { kind: 'string', chars: 'abcaef', pointers: [{ index: 1, label: 'left after shrink' }, { index: 5, label: 'right' }], visited: [0] },
  },
  patternCheck: {
    prompt:
      'A duplicate enters the right edge. When should shrinking stop?',
    options: [
      { id: 'duplicate-gone', label: 'As soon as the incoming symbol is no longer in the window set.' },
      { id: 'window-empty', label: 'Only after every earlier symbol has been removed.' },
      { id: 'one-removal', label: 'Always after exactly one removal, even if the duplicate remains.' },
      { id: 'never-shrink', label: 'Keep both copies and continue measuring.' },
    ],
    correctOptionId: 'duplicate-gone',
    feedback: {
      correct: 'Exactly. That preserves the largest valid suffix ending before the new symbol.',
      incorrect: 'That either discards useful symbols or leaves the window invalid.',
      secondIncorrect: 'Remove from the left until the repeated incoming symbol is gone.',
    },
    hints: ['The set must contain each symbol once.', 'Preserve as much of the suffix as possible.'],
    diagram: { kind: 'string', chars: 'cabca', pointers: [{ index: 1, label: 'new left' }, { index: 4, label: 'repeat a' }] },
  },
  retrievalCheck: {
    prompt:
      'Write the length formula for an inclusive window from left through right.',
    acceptedAnswers: [
      'right - left + 1',
      'right-left+1',
      'r - l + 1',
      'r-l+1',
      'right minus left plus 1',
      'right minus left plus one',
      'right - left +1',
      'right-left + 1',
    ],
    placeholder: 'window length = ...',
    feedback: {
      correct: 'Right. The +1 counts both boundary positions.',
      incorrect: 'Use the two inclusive indices and remember both ends count.',
      secondIncorrect: 'The formula is right - left + 1.',
    },
    hints: ['Indices 2 through 2 have length 1.', 'Subtract, then add one.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the no-echo window from empty state through final best length.',
    feedback: {
      correct: 'Route scanner restored. The set and window boundaries stay synchronized.',
      incorrect: 'Shrink away duplicates before adding the incoming symbol.',
      secondIncorrect: 'Open window, scan right, shrink duplicates, add right, measure, return.',
    },
    hints: ['The right symbol is added only once.', 'Measure only a valid window.'],
    diagram: { kind: 'string', chars: 'abcaefbg', pointers: [{ index: 2, label: 'left' }, { index: 7, label: 'right' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["route"] and return the longest contiguous span containing no repeated character.',
    starterCode: `def solve(data):
    route = data["route"]
    inside = set()
    left = 0
    best = 0

    for right, symbol in enumerate(route):
        # Shrink until symbol is new, add it, then measure.
        pass

    return best`,
    cases: {
      visibleExample: { input: { route: 'abcaefbg' }, expected: 6 },
      hiddenBoundary: { input: { route: '' }, expected: 0 },
      hiddenAdversarial: { input: { route: 'bbbbc' }, expected: 2 },
    },
    feedback: {
      correct: 'Route cleared! Your variable window preserves the longest valid suffix.',
      incorrect: 'The span is wrong. Recheck repeated-symbol shrinking and inclusive length.',
      secondIncorrect: 'While symbol in inside, remove route[left] and increment left; then add and measure.',
    },
    hints: [
      'Use a while loop, not a single if.',
      'Remove the exact symbol leaving at left.',
      'Update best after the incoming symbol is added.',
    ],
    diagram: { kind: 'string', chars: 'abcaefbg', pointers: [{ index: 2, label: 'left' }, { index: 7, label: 'right; length 6' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(longestSubstringWithoutRepeatingCharactersMissionSeed)
export default problemLesson
