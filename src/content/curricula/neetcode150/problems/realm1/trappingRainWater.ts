import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const trappingRainWaterMissionSeed = {
  slug: 'trapping-rain-water',
  estimatedMinutes: 27,
  mission: {
    title: 'The Storm-Canyon Reservoir',
    context:
      'A row of rock columns forms a canyon floor. After a storm, water rests above low columns only where taller rock blocks escape on both sides.',
    prompt:
      'Return the total water units held by the elevation row using two inward pointers and running wall heights.',
  },
  objective:
    'Accumulate trapped water with left and right maxima while resolving the safely bounded side.',
  priorKnowledge: [
    'Water above a position is limited by the lower of its best left and right walls.',
    'A running maximum summarizes the tallest wall seen from one side.',
    'Two pointers can resolve one boundary at a time.',
  ],
  recognitionCue:
    'Each position needs support from both sides, but only the smaller side controls its water level.',
  misconception:
    'Using the tallest column anywhere as every position’s water line ignores open escape paths on the other side.',
  algorithmSteps: [
    { id: 'place-edges', instruction: 'Place left and right at the ends and set both running maxima to 0.' },
    { id: 'start-water', instruction: 'Initialize total trapped water to 0.' },
    { id: 'choose-lower-edge', instruction: 'Compare the current edge heights and resolve the lower side.' },
    { id: 'update-side-max', instruction: 'Raise that side’s running maximum if the current column is taller.' },
    { id: 'add-depth', instruction: 'Add running maximum minus current height for the resolved position.' },
    { id: 'move-inward', instruction: 'Move the resolved pointer inward and repeat.' },
    { id: 'return-water', instruction: 'Return the accumulated water when the pointers meet.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each of n columns is resolved once, using two pointers, two maxima, and one total.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [4, 1, 3, 1, 5],
      highlight: 1,
      pointers: [
        { index: 0, label: 'left max 4' },
        { index: 4, label: 'right wall 5' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For elevations [3, 0, 1, 4], the right edge is tall enough to seal the left side. Depths above 0 and 1 are 3 and 2, totaling 5.',
    code: [
      'def stored(elevations):',
      '    left, right = 0, len(elevations) - 1',
      '    left_max = right_max = water = 0',
      '    while left < right:',
      '        if elevations[left] <= elevations[right]:',
      '            left_max = max(left_max, elevations[left])',
      '            water += left_max - elevations[left]',
      '            left += 1',
      '        else:',
      '            right_max = max(right_max, elevations[right])',
      '            water += right_max - elevations[right]',
      '            right -= 1',
      '    return water',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'At height 3 versus 4, resolve the left edge and remember left_max = 3.',
      'The next column has height 0, so it stores 3 - 0 = 3.',
      'Height 1 stores 3 - 1 = 2; total water is 5.',
    ],
    diagram: { kind: 'array', values: [3, 0, 1, 4], highlight: 2, pointers: [{ index: 0, label: 'wall 3' }, { index: 3, label: 'wall 4' }] },
  },
  patternCheck: {
    prompt:
      'Why is the lower current edge safe to resolve first?',
    options: [
      { id: 'bounded-by-other', label: 'The opposite edge is already at least as high, so this side’s running maximum limits the depth.' },
      { id: 'lower-holds-none', label: 'A lower column can never hold any water.' },
      { id: 'ignore-opposite', label: 'Water needs a wall on only one side.' },
      { id: 'width-shrinks', label: 'The distance between pointers directly equals water depth.' },
    ],
    correctOptionId: 'bounded-by-other',
    feedback: {
      correct: 'Exactly. The known opposite edge seals this lower side, so its own maximum decides the level.',
      incorrect: 'Trapped depth needs two walls and is not the pointer distance.',
      secondIncorrect: 'The higher opposite edge guarantees the lower side is bounded.',
    },
    hints: ['Think about which side could let water escape.', 'The opposite boundary is no lower.'],
    diagram: { kind: 'array', values: [3, 1, 2, 5], pointers: [{ index: 0, label: 'resolve left' }, { index: 3, label: 'seal' }] },
  },
  retrievalCheck: {
    prompt:
      'Write the depth added when resolving the left position.',
    acceptedAnswers: [
      'left_max - elevations[left]',
      'left max minus current height',
      'leftMax - height[left]',
      'left maximum minus the current elevation',
      'left_max - heights[left]',
      'left_max-elevations[left]',
      'left_max-heights[left]',
      'left max - current height',
      'left max minus current elevation',
      'left maximum minus current height',
    ],
    placeholder: 'depth = ...',
    feedback: {
      correct: 'Correct. Updating left_max first makes this depth nonnegative.',
      incorrect: 'Subtract the current left column from the tallest wall seen on the left.',
      secondIncorrect: 'Use left_max - elevations[left].',
    },
    hints: ['Depth is waterline minus ground.', 'The side maximum is updated before subtraction.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the canyon scan from edge setup through the final water total.',
    feedback: {
      correct: 'Reservoir scan restored. Each side is measured only when its opposite seal is known.',
      incorrect: 'Choose a side before updating its maximum and adding depth.',
      secondIncorrect: 'Place edges, start total, choose lower, update max, add depth, move, return.',
    },
    hints: ['Exactly one pointer moves per round.', 'The total starts at zero.'],
    diagram: { kind: 'array', values: [5, 0, 2, 0, 5], highlight: 2, pointers: [{ index: 0, label: 'left wall' }, { index: 4, label: 'right wall' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read nonnegative data["elevations"] and return the total units of storm water trapped above the row.',
    starterCode: `def solve(data):
    heights = data["elevations"]
    left, right = 0, len(heights) - 1
    left_max = right_max = 0
    water = 0

    # Resolve the lower boundary, update its maximum, and add depth.
    return water`,
    cases: {
      visibleExample: { input: { elevations: [4, 1, 3, 1, 5] }, expected: 7 },
      hiddenBoundary: { input: { elevations: [] }, expected: 0 },
      hiddenAdversarial: { input: { elevations: [5, 0, 2, 0, 5] }, expected: 13 },
    },
    feedback: {
      correct: 'Reservoir measured! Two running walls capture valleys, flat edges, and empty terrain.',
      incorrect: 'The water total is off. Recheck which side is safe and when its maximum updates.',
      secondIncorrect: 'Compare edge heights; on the lower side update max, add max-current, then move inward.',
    },
    hints: [
      'An empty list naturally leaves right at -1 and returns zero.',
      'Use <= to resolve the left side on a tie.',
      'Never add a negative depth.',
    ],
    diagram: { kind: 'array', values: [4, 1, 3, 1, 5], highlight: 3, pointers: [{ index: 0, label: 'max 4' }, { index: 4, label: 'max 5' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(trappingRainWaterMissionSeed)
export default problemLesson
