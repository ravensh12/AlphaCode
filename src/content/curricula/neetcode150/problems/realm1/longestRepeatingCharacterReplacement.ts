import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const longestRepeatingCharacterReplacementMissionSeed = {
  slug: 'longest-repeating-character-replacement',
  estimatedMinutes: 23,
  mission: {
    title: 'The Unison Chorus Patch',
    context:
      'A robot chorus sings a string of note symbols. Engineers may retune at most k notes inside one contiguous passage so every note in that passage becomes the same.',
    prompt:
      'Return the greatest passage length that can be made uniform with at most k retunes.',
  },
  objective:
    'Keep the largest window whose nonmajority character count is at most k.',
  priorKnowledge: [
    'A frequency map counts symbols inside a window.',
    'The most common symbol is cheapest to keep.',
    'A left pointer can shrink an invalid window.',
  ],
  recognitionCue:
    'You may change up to k items in a contiguous region to match one dominant item.',
  misconception:
    'The number of changes is not the count of different symbols; it is window length minus the largest symbol frequency.',
  algorithmSteps: [
    { id: 'open-window', instruction: 'Create an empty count map, set left to 0, and start best and max_count at 0.' },
    { id: 'add-right', instruction: 'Scan right and increment the incoming note count.' },
    { id: 'raise-max-count', instruction: 'Update max_count with the largest frequency seen in the current expansion.' },
    { id: 'test-retunes', instruction: 'Compute window length minus max_count as the needed retunes.' },
    { id: 'shrink-invalid', instruction: 'While needed retunes exceed k, decrement the left note and advance left.' },
    { id: 'measure-best', instruction: 'Update best with the resulting window length.' },
    { id: 'return-best', instruction: 'Return best after the scan.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(a)',
    explanation:
      'Each of n notes enters once and leaves at most once; the map stores at most a alphabet symbols.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: 'ABBBC',
      pointers: [
        { index: 0, label: 'left' },
        { index: 3, label: 'right' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For chorus “ABBBC” with k = 1, window “ABBB” has length 4 and max count 3. One retune changes A to B, so length 4 is valid.',
    code: [
      'def unison(notes, k):',
      '    counts = {}',
      '    left = best = max_count = 0',
      '    for right, note in enumerate(notes):',
      '        counts[note] = counts.get(note, 0) + 1',
      '        max_count = max(max_count, counts[note])',
      '        while right - left + 1 - max_count > k:',
      '            counts[notes[left]] -= 1',
      '            left += 1',
      '        best = max(best, right - left + 1)',
      '    return best',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'In ABBB, B appears three times.',
      'Length 4 minus frequency 3 means one note needs retuning.',
      'That fits k = 1, so best becomes 4.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'A', value: 1 },
        { key: 'B', value: 3 },
      ],
      lookup: 'B',
    },
  },
  patternCheck: {
    prompt:
      'A window has length 7 and its most common note appears 5 times. How many retunes make it uniform?',
    options: [
      { id: 'two-retunes', label: '2, because only the two nonmajority notes must change.' },
      { id: 'five-retunes', label: '5, because every majority note must change.' },
      { id: 'seven-retunes', label: '7, because the whole window must be rewritten.' },
      { id: 'one-retune', label: '1, because there is one majority symbol.' },
    ],
    correctOptionId: 'two-retunes',
    feedback: {
      correct: 'Exactly. Keep all five majority notes and retune the other two.',
      incorrect: 'Keep the largest existing group; only notes outside it need changes.',
      secondIncorrect: 'Use window length - max frequency = 7 - 5.',
    },
    hints: ['Do not change notes already matching the target.', 'Subtract the majority count from the window size.'],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'R', value: 5 },
        { key: 'S', value: 1 },
        { key: 'T', value: 1 },
      ],
      lookup: 'R',
    },
  },
  retrievalCheck: {
    prompt:
      'Write the formula for retunes needed by the current window.',
    acceptedAnswers: [
      'window length - max_count',
      'length - max_count',
      'window length - max count',
      'length - max count',
      'window size minus max frequency',
      'length - maximum frequency',
      'right - left + 1 - max_count',
      'window size - max frequency',
      'window length minus max count',
      'length minus max count',
      'window length - max frequency',
      'window length minus max frequency',
      'right-left+1-max_count',
      'length-max_count',
    ],
    placeholder: 'needed = ...',
    feedback: {
      correct: 'Right. Everything outside the largest same-note group must change.',
      incorrect: 'Subtract the dominant note count from the inclusive window length.',
      secondIncorrect: 'Use right - left + 1 - max_count.',
    },
    hints: ['Keep the majority unchanged.', 'The rest of the window uses retunes.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the chorus window so it shrinks only when the retune budget is exceeded.',
    feedback: {
      correct: 'Chorus window restored. Counts measure exactly how expensive each passage is.',
      incorrect: 'Update the incoming count and max_count before checking the budget.',
      secondIncorrect: 'Open, add right, raise max, test, shrink, measure, return.',
    },
    hints: ['The window may need several left removals.', 'Measure only after it fits the budget.'],
    diagram: { kind: 'string', chars: 'ABBCBDAA', pointers: [{ index: 0, label: 'left' }, { index: 4, label: 'right' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["chorus"] and nonnegative data["k"]. Return the longest contiguous passage that can become one repeated character with at most k changes.',
    starterCode: `def solve(data):
    notes = data["chorus"]
    k = data["k"]
    counts = {}
    left = best = max_count = 0

    for right, note in enumerate(notes):
        # Add note, update max_count, shrink if over budget, then measure.
        pass

    return best`,
    cases: {
      visibleExample: { input: { chorus: 'ABBCBDAA', k: 2 }, expected: 5 },
      hiddenBoundary: { input: { chorus: '', k: 3 }, expected: 0 },
      hiddenAdversarial: { input: { chorus: 'BAAAACD', k: 0 }, expected: 4 },
    },
    feedback: {
      correct: 'Chorus synchronized! Your frequency window respects both empty and zero-budget passages.',
      incorrect: 'The passage length is wrong. Recheck the retune formula and shrinking loop.',
      secondIncorrect: 'needed=right-left+1-max_count; while needed>k, decrement notes[left] and move left.',
    },
    hints: [
      'max_count tracks the largest useful frequency reached during expansion.',
      'Use while, because one removal may not restore the budget.',
      'Update best after shrinking.',
    ],
    diagram: { kind: 'string', chars: 'ABBCBDAA', pointers: [{ index: 0, label: 'left' }, { index: 4, label: 'right; 3 B + 2 edits' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(longestRepeatingCharacterReplacementMissionSeed)
export default problemLesson
