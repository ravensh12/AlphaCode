import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const twoSumIiInputArrayIsSortedMissionSeed = {
  slug: 'two-sum-ii-input-array-is-sorted',
  estimatedMinutes: 20,
  mission: {
    title: 'The Ordered Beacon Pair',
    context:
      'Beacon strengths are stored from smallest to largest. The control panel needs two different strengths that total an exact tuning value and labels slots starting at 1.',
    prompt:
      'Return the two one-based slot numbers. Every log has exactly one valid pair.',
  },
  objective:
    'Use sorted order to find a target pair with inward-moving boundary pointers.',
  priorKnowledge: [
    'Moving right in sorted data never decreases a value.',
    'Moving left from the right end never increases a value.',
    'A pair sum can be compared with a target.',
  ],
  recognitionCue:
    'The values are sorted and you need one pair with an exact target sum.',
  misconception:
    'When the sum is too small, moving the right pointer left makes the sum no larger and cannot help.',
  algorithmSteps: [
    { id: 'place-boundaries', instruction: 'Place left at index 0 and right at the final index.' },
    { id: 'measure-sum', instruction: 'Add the values at left and right.' },
    { id: 'return-match', instruction: 'If the sum equals the target, return both indices plus 1.' },
    { id: 'raise-small-sum', instruction: 'If the sum is too small, move left one step right.' },
    { id: 'lower-large-sum', instruction: 'If the sum is too large, move right one step left.' },
    { id: 'repeat-inward', instruction: 'Repeat while left remains before right.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each pointer moves inward at most n times, and only two indices and one sum are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [1, 4, 6, 10, 13],
      pointers: [
        { index: 2, label: 'left' },
        { index: 3, label: 'right' },
      ],
      visited: [0, 4],
    },
  },
  workedExample: {
    prompt:
      'For strengths [1, 4, 6, 10, 13] and target 16, 1+13 is small, 4+13 is large, and 4+10 is small. Then 6+10 matches.',
    code: [
      'def tune(values, target):',
      '    left, right = 0, len(values) - 1',
      '    while left < right:',
      '        total = values[left] + values[right]',
      '        if total == target: return [left + 1, right + 1]',
      '        if total < target:',
      '            left += 1',
      '        else:',
      '            right -= 1',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The smallest and largest values total 14, so discard the smallest.',
      '4 + 13 is 17, so discard the largest.',
      'After one more safe move, 6 + 10 gives 16 at slots [3, 4].',
    ],
    diagram: { kind: 'array', values: [1, 4, 6, 10, 13], highlight: 2, pointers: [{ index: 2, label: '6' }, { index: 3, label: '10' }] },
  },
  patternCheck: {
    prompt:
      'The boundary sum is below the target. Which move can increase it?',
    options: [
      { id: 'move-left-right', label: 'Move the left pointer right to a value that is at least as large.' },
      { id: 'move-right-left', label: 'Move the right pointer left to a value no larger than before.' },
      { id: 'move-both-out', label: 'Move both pointers away from the array.' },
      { id: 'keep-pointers', label: 'Keep both pointers fixed and recompute the same sum.' },
    ],
    correctOptionId: 'move-left-right',
    feedback: {
      correct: 'Correct. Sorted order guarantees this is the only boundary move that can raise the sum.',
      incorrect: 'That move cannot raise an already-small sum.',
      secondIncorrect: 'Discard the smaller boundary by moving left one step right.',
    },
    hints: ['You need a larger total.', 'Which boundary can be replaced by a larger value?'],
    diagram: { kind: 'array', values: [2, 5, 9, 14], pointers: [{ index: 0, label: 'left' }, { index: 3, label: 'right' }] },
  },
  retrievalCheck: {
    prompt:
      'Complete the rule: if the boundary sum is too large, ______.',
    acceptedAnswers: [
      'move right left',
      'decrement right',
      'right -= 1',
      'move the right pointer left',
      'lower the right pointer',
      'right-=1',
      'move right pointer left',
      'move the right pointer one step left',
      'move right one step left',
      'decrease right',
      'move right inward',
    ],
    placeholder: 'Type the pointer move',
    feedback: {
      correct: 'Right. Replacing the larger boundary can lower the sum.',
      incorrect: 'Name the move made to the pointer at the large-value end.',
      secondIncorrect: 'Move the right pointer one step left.',
    },
    hints: ['The list grows from left to right.', 'Discard the current largest candidate.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the ordered beacon search from boundary setup through repeated safe moves.',
    feedback: {
      correct: 'Tuning search restored. Each comparison discards a boundary that cannot join a valid pair.',
      incorrect: 'Measure the sum before deciding which pointer can move.',
      secondIncorrect: 'Place pointers, measure, return match, raise small sums, lower large sums, repeat.',
    },
    hints: ['Equality returns before any move.', 'Only one pointer moves per nonmatching sum.'],
    diagram: { kind: 'array', values: [2, 5, 8, 12, 19], pointers: [{ index: 2, label: '8' }, { index: 3, label: '12' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read sorted data["strengths"] and data["target"]. Return the unique matching pair as one-based slot numbers.',
    starterCode: `def solve(data):
    values = data["strengths"]
    target = data["target"]
    left, right = 0, len(values) - 1

    while left < right:
        total = values[left] + values[right]
        # Return a match or move the boundary that makes progress.
        pass`,
    cases: {
      visibleExample: { input: { strengths: [2, 5, 8, 12, 19], target: 20 }, expected: [3, 4] },
      hiddenBoundary: { input: { strengths: [1, 9], target: 10 }, expected: [1, 2] },
      hiddenAdversarial: { input: { strengths: [-8, -3, 0, 4, 11, 15], target: 7 }, expected: [1, 6] },
    },
    feedback: {
      correct: 'Beacons tuned! The boundary invariant handles negative and edge-position pairs.',
      incorrect: 'The slots or pointer move is wrong. Recheck sum comparisons and one-based output.',
      secondIncorrect: 'Equal: return [left+1,right+1]; small: left+=1; large: right-=1.',
    },
    hints: [
      'The input is already sorted.',
      'Move left for a small total and right for a large total.',
      'Convert both zero-based indices when returning.',
    ],
    diagram: { kind: 'array', values: [2, 5, 8, 12, 19], pointers: [{ index: 2, label: '8' }, { index: 3, label: '12' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(twoSumIiInputArrayIsSortedMissionSeed)
export default problemLesson
