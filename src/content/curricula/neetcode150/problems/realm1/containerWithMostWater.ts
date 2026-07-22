import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const containerWithMostWaterMissionSeed = {
  slug: 'container-with-most-water',
  estimatedMinutes: 21,
  mission: {
    title: 'The Widest Solar Sail',
    context:
      'Vertical masts stand at equal spacing along a skyship deck. Choosing two masts stretches a rectangular sail whose usable height is limited by the shorter mast.',
    prompt:
      'Return the greatest sail area, computed as distance times the shorter boundary height.',
  },
  objective:
    'Maximize a boundary area by moving the shorter of two inward pointers.',
  priorKnowledge: [
    'The distance between indices is right minus left.',
    'The shorter boundary limits a shared height.',
    'Moving inward always reduces width.',
  ],
  recognitionCue:
    'A score uses two boundaries, their distance, and the smaller boundary value.',
  misconception:
    'Moving the taller mast is not helpful: it loses width while the unchanged shorter mast still limits height.',
  algorithmSteps: [
    { id: 'place-masts', instruction: 'Place left and right at the outermost masts.' },
    { id: 'start-best', instruction: 'Initialize the best sail area to 0.' },
    { id: 'measure-area', instruction: 'Compute (right - left) times the shorter mast.' },
    { id: 'update-best', instruction: 'Keep the larger of this area and the best area.' },
    { id: 'move-shorter', instruction: 'Move the pointer at the shorter mast inward; on a tie, move either one.' },
    { id: 'return-best', instruction: 'Return the best area when the pointers meet.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'One pointer moves inward on each step, so at most n pairs are measured with constant storage.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [4, 2, 7, 3, 6],
      pointers: [
        { index: 0, label: 'left h=4' },
        { index: 4, label: 'right h=6' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For mast heights [4, 2, 7, 3, 6], the outer pair has width 4 and height 4, giving area 16. The shorter left mast moves inward.',
    code: [
      'def largest_sail(heights):',
      '    left, right = 0, len(heights) - 1',
      '    best = 0',
      '    while left < right:',
      '        area = (right - left) * min(heights[left], heights[right])',
      '        best = max(best, area)',
      '        if heights[left] <= heights[right]:',
      '            left += 1',
      '        else:',
      '            right -= 1',
      '    return best',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'The outer masts create area 4 × 4 = 16.',
      'Moving the taller right mast could only reduce width while height stays capped at 4.',
      'Moving the shorter left mast is the only chance to raise the cap; later pairs do not beat 16.',
    ],
    diagram: { kind: 'array', values: [4, 2, 7, 3, 6], highlight: 0, pointers: [{ index: 0, label: 'move this side' }, { index: 4, label: 'keep' }] },
  },
  patternCheck: {
    prompt:
      'The left mast is height 3 and the right mast is height 8. Which boundary should move?',
    options: [
      { id: 'move-left', label: 'Move left inward, because height 3 limits the current sail.' },
      { id: 'move-right', label: 'Move right inward, because height 8 is taller.' },
      { id: 'move-both', label: 'Move both inward and skip the next boundary pair.' },
      { id: 'stop-now', label: 'Stop because the two mast heights differ.' },
    ],
    correctOptionId: 'move-left',
    feedback: {
      correct: 'Yes. Only replacing the limiting mast can possibly offset the lost width.',
      incorrect: 'That move cannot improve the current height bottleneck.',
      secondIncorrect: 'Discard the shorter boundary, which is the left mast here.',
    },
    hints: ['Width will shrink no matter what.', 'Which move might increase the minimum height?'],
    diagram: { kind: 'array', values: [3, 5, 4, 8], pointers: [{ index: 0, label: 'shorter' }, { index: 3, label: 'taller' }] },
  },
  retrievalCheck: {
    prompt:
      'Complete the greedy rule: after measuring an area, move the pointer at the ______ boundary.',
    acceptedAnswers: [
      'shorter',
      'smaller',
      'lower mast',
      'shorter mast',
      'minimum height',
      'lower',
      'smaller mast',
      'shortest',
      'shorter one',
      'minimum',
    ],
    placeholder: 'Type the boundary choice',
    feedback: {
      correct: 'Correct. That boundary is the current height bottleneck.',
      incorrect: 'Name the boundary that limits min(left height, right height).',
      secondIncorrect: 'Move the shorter boundary.',
    },
    hints: ['The area uses the minimum height.', 'Replacing the taller side leaves the same cap.'],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the sail scan from outer boundaries to the final maximum.',
    feedback: {
      correct: 'Sail scan restored. Every move safely discards a limiting boundary.',
      incorrect: 'Measure and save the current area before moving a pointer.',
      secondIncorrect: 'Place masts, start best, measure, update, move shorter, return.',
    },
    hints: ['The widest pair is examined first.', 'Only one boundary moves each round.'],
    diagram: { kind: 'array', values: [3, 9, 2, 7, 4, 8], pointers: [{ index: 1, label: '9' }, { index: 5, label: '8' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read nonnegative data["masts"] and return the maximum sail area between two positions.',
    starterCode: `def solve(data):
    heights = data["masts"]
    left, right = 0, len(heights) - 1
    best = 0

    while left < right:
        # Measure this pair, save the best, and move the shorter mast.
        pass

    return best`,
    cases: {
      visibleExample: { input: { masts: [3, 9, 2, 7, 4, 8] }, expected: 32 },
      hiddenBoundary: { input: { masts: [5, 5] }, expected: 5 },
      hiddenAdversarial: { input: { masts: [10, 1, 1, 1, 10] }, expected: 40 },
    },
    feedback: {
      correct: 'Sail optimized! Your greedy boundary move preserves every chance to improve.',
      incorrect: 'The area or moved side is wrong. Recheck width, minimum height, and bottleneck.',
      secondIncorrect: 'area=(right-left)*min(...); update best; move left if heights[left]<=heights[right], else move right.',
    },
    hints: [
      'Use index distance, not number of masts between them.',
      'The usable height is min(heights[left], heights[right]).',
      'On equal heights, either pointer may move.',
    ],
    diagram: { kind: 'array', values: [3, 9, 2, 7, 4, 8], pointers: [{ index: 1, label: '9' }, { index: 5, label: '8; area 32' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(containerWithMostWaterMissionSeed)
export default problemLesson
