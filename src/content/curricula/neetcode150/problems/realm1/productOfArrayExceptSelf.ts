import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const productOfArrayExceptSelfMissionSeed = {
  slug: 'product-of-array-except-self',
  estimatedMinutes: 23,
  mission: {
    title: 'The Gear Ring Calibration',
    context:
      'A ring of calibration gears has an integer multiplier at each station. For every station, engineers need the product of all the other multipliers.',
    prompt:
      'Return one product per station without division, using a left sweep and a right sweep.',
  },
  objective:
    'Combine prefix and suffix products to exclude each position in linear time.',
  priorKnowledge: [
    'A prefix product summarizes values to the left.',
    'A suffix product summarizes values to the right.',
    'Multiplying by 1 leaves a product unchanged.',
  ],
  recognitionCue:
    'Every output needs all values except its own, and division is forbidden or unsafe around zero.',
  misconception:
    'Dividing the total product fails when one or more multipliers are zero.',
  algorithmSteps: [
    { id: 'open-output', instruction: 'Create an output list of ones with the same length as the input.' },
    { id: 'start-prefix', instruction: 'Set prefix to 1 and sweep from left to right.' },
    { id: 'store-prefix', instruction: 'Store prefix at each index, then multiply prefix by that input value.' },
    { id: 'start-suffix', instruction: 'Set suffix to 1 and sweep from right to left.' },
    { id: 'combine-suffix', instruction: 'Multiply each output by suffix, then update suffix with that input value.' },
    { id: 'return-products', instruction: 'Return the completed output list.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1) extra',
    explanation:
      'Two linear sweeps visit n stations; aside from the required output, only prefix and suffix variables are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [2, 3, 4, 5],
      highlight: 2,
      pointers: [
        { index: 2, label: 'prefix 6' },
        { index: 3, label: 'suffix 1' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For multipliers [2, 3, 4], the left sweep stores [1, 2, 6]. The right sweep multiplies by suffixes [12, 4, 1], producing [12, 8, 6].',
    code: [
      'def calibrate(values):',
      '    output = [1] * len(values)',
      '    prefix = 1',
      '    for i in range(len(values)):',
      '        output[i] = prefix',
      '        prefix *= values[i]',
      '    suffix = 1',
      '    for i in range(len(values) - 1, -1, -1):',
      '        output[i] *= suffix',
      '        suffix *= values[i]',
      '    return output',
    ],
    currentLineIndex: 8,
    walkthrough: [
      'At index 1, stored prefix 2 represents everything left of 3.',
      'On the return sweep, suffix 4 represents everything right of 3.',
      'Their product 2 × 4 = 8 excludes the value at index 1.',
    ],
    diagram: { kind: 'array', values: [12, 8, 6], highlight: 1, pointers: [{ index: 1, label: '2 × 4' }] },
  },
  patternCheck: {
    prompt:
      'What should output[i] contain just before the right-to-left sweep reaches i?',
    options: [
      { id: 'left-product', label: 'The product of values strictly to the left of i.' },
      { id: 'full-product', label: 'The product of every input value, including values[i].' },
      { id: 'right-product', label: 'The product of values strictly to the right of i.' },
      { id: 'current-value', label: 'Only values[i].' },
    ],
    correctOptionId: 'left-product',
    feedback: {
      correct: 'Yes. The second sweep multiplies that left product by the matching right product.',
      incorrect: 'The first sweep has only visited the left side and must exclude the current value.',
      secondIncorrect: 'Before moving right, store prefix; only afterward include values[i] in prefix.',
    },
    hints: ['The current value is multiplied into prefix after storage.', 'The right side is added on the return sweep.'],
    diagram: { kind: 'array', values: [1, 2, 6, 24], highlight: 2, pointers: [{ index: 2, label: 'left only' }] },
  },
  retrievalCheck: {
    prompt:
      'Name the two running products combined at each position.',
    acceptedAnswers: [
      'prefix and suffix',
      'prefix product and suffix product',
      'left product and right product',
      'left and right products',
      'prefix and suffix products',
      'the prefix and the suffix',
      'left and right product',
      'prefix product and suffix',
    ],
    placeholder: 'Type both products',
    feedback: {
      correct: 'Correct. Neither running product includes the current position.',
      incorrect: 'Name one summary from the left sweep and one from the right sweep.',
      secondIncorrect: 'Answer “prefix and suffix.”',
    },
    hints: ['One grows left to right.', 'The other grows right to left.'],
  },
  reconstructionCheck: {
    prompt:
      'Put both gear sweeps back in order, including when each running product updates.',
    feedback: {
      correct: 'Calibration sequence restored. Store first, update second, so the current gear stays excluded.',
      incorrect: 'If a running product updates too early, it includes the current station.',
      secondIncorrect: 'Initialize output; store then update prefix; reset suffix; combine then update suffix; return.',
    },
    hints: ['Both running products begin at 1.', 'On each sweep, use the running value before multiplying the current input.'],
    diagram: { kind: 'array', values: [2, 3, 4], highlight: 1, pointers: [{ index: 1, label: 'exclude' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["multipliers"] and return each station’s product of all other multipliers. Do not divide.',
    starterCode: `def solve(data):
    values = data["multipliers"]
    output = [1] * len(values)
    prefix = 1

    # Fill left products, then combine a right-to-left suffix.
    return output`,
    cases: {
      visibleExample: { input: { multipliers: [2, 3, 4, 5] }, expected: [60, 40, 30, 24] },
      hiddenBoundary: { input: { multipliers: [7, 9] }, expected: [9, 7] },
      hiddenAdversarial: { input: { multipliers: [-1, 0, 3, 4] }, expected: [0, -12, 0, 0] },
    },
    feedback: {
      correct: 'Gear ring calibrated! Prefix and suffix sweeps handle zero and negative multipliers.',
      incorrect: 'One station includes itself or misses a side. Recheck update order in both sweeps.',
      secondIncorrect: 'Store prefix before values[i]; multiply output by suffix before updating suffix.',
    },
    hints: [
      'Use two range loops in opposite directions.',
      'The first sweep writes output[i] = prefix.',
      'The second sweep uses output[i] *= suffix.',
    ],
    diagram: { kind: 'array', values: [2, 3, 4, 5], highlight: 1, pointers: [{ index: 1, label: 'left 2 × right 20' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(productOfArrayExceptSelfMissionSeed)
export default problemLesson
