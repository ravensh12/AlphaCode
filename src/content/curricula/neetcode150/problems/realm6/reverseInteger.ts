import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const reverseIntegerMissionSeed = {
  slug: 'reverse-integer',
  estimatedMinutes: 22,
  mission: {
    title: 'The Backward Cargo Dial',
    context:
      'A spaceport cargo dial shows a signed decimal value inside a fixed-width register. Its inspection mode reads the magnitude’s digits from right to left while keeping the original sign.',
    prompt:
      'Return the digit-reversed signed integer. Drop leading zeroes created by reversal, and return 0 if the result cannot fit the declared signed bit width.',
  },
  objective:
    'Pop decimal digits and check the signed limit before each multiply-and-append step.',
  priorKnowledge: [
    'divmod(value, 10) separates the final decimal digit.',
    'A signed width w ranges from -2^(w-1) through 2^(w-1)-1.',
    'Checking before multiplication avoids building an out-of-range register value.',
  ],
  recognitionCue:
    'Decimal digits must reverse, but a fixed signed range can reject the result.',
  misconception:
    'Reversing a string and converting back ignores the intended arithmetic process and can hide where overflow should be detected.',
  algorithmSteps: [
    {
      id: 'separate-sign',
      instruction: 'Save the sign and work with the nonnegative magnitude.',
    },
    {
      id: 'choose-limit',
      instruction:
        'Choose the allowed positive magnitude limit for that sign and bit width.',
    },
    {
      id: 'pop-digit',
      instruction: 'Pop the next decimal digit with divmod(magnitude, 10).',
    },
    {
      id: 'guard-append',
      instruction:
        'Before appending, return 0 if reversed would exceed (limit - digit) // 10.',
    },
    {
      id: 'restore-sign',
      instruction: 'Append the digit, then restore the saved sign at the end.',
    },
  ],
  complexity: {
    time: 'O(log₁₀ |x|)',
    space: 'O(1)',
    explanation:
      'The loop handles one decimal digit per iteration and stores a fixed number of integers.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'bits',
      rows: [
        {
          id: 'signed-max',
          bits: '01111111111111111111111111111111',
          label: '32-bit maximum 2147483647',
        },
        {
          id: 'signed-min',
          bits: '10000000000000000000000000000000',
          label: '32-bit minimum -2147483648',
        },
      ],
      operation: 'reversed decimal result must stay between these signed bounds',
      highlightedBitIndices: [0],
    },
  },
  workedExample: {
    prompt:
      'For -120, save a negative sign and process magnitude 120. Popped digits are 0, 2, and 1, building magnitude 21; restoring the sign gives -21.',
    code: [
      'sign = -1; magnitude = 120',
      'pop 0: reversed = 0',
      'pop 2: reversed = 2',
      'pop 1: reversed = 21',
      'return -21',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The trailing zero becomes a leading reversed zero, so it contributes no magnitude.',
      'Digit 2 becomes the first visible digit.',
      'Digit 1 appends to produce 21.',
      'The original negative sign is restored only after all safety checks.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['remaining', 'popped digit', 'reversed'],
        [120, 0, 0],
        [12, 2, 2],
        [1, 1, 21],
      ],
      highlightedCells: [{ row: 3, column: 2, label: 'magnitude 21' }],
    },
  },
  patternCheck: {
    prompt:
      'When should overflow be checked during arithmetic digit reversal?',
    options: [
      {
        id: 'before-append',
        label: 'Before multiplying the current reversed value by 10 and adding a digit.',
      },
      {
        id: 'after-sign-only',
        label: 'Only after converting the result to a string.',
      },
      {
        id: 'never-check',
        label: 'Never, because every reversed value fits its original width.',
      },
    ],
    correctOptionId: 'before-append',
    feedback: {
      correct: 'Yes. Compare against the limit while the current value is still safe.',
      incorrect: 'Digit reversal can exceed the signed register even when the input fits.',
      secondIncorrect:
        'Guard reversed > (limit - digit) // 10 before reversed * 10 + digit.',
    },
    hints: [
      'The dangerous operation grows the current result by a decimal place.',
      'Check whether that next operation would cross the limit.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        {
          id: 'safe-bound',
          bits: '01111111111111111111111111111111',
          label: 'largest safe positive pattern',
        },
        {
          id: 'overflow-pattern',
          bits: '10000000000000000000000000000000',
          label: 'next sign-changing pattern',
        },
      ],
      operation: 'guard before crossing the sign bit',
      highlightedBitIndices: [0],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the inclusive range of a signed w-bit integer.',
    acceptedAnswers: [
      '-2^(w-1) to 2^(w-1)-1',
      '[-2^(w-1), 2^(w-1)-1]',
      '-(1 << (w-1)) through (1 << (w-1)) - 1',
      '-2^(w-1) through 2^(w-1)-1',
      '-2^(w-1) to 2^(w-1) - 1',
      '-2**(w-1) to 2**(w-1)-1',
      '-2**(w-1) to 2**(w-1) - 1',
      '-2**(w-1) through 2**(w-1)-1',
      'from -2^(w-1) to 2^(w-1)-1',
      '-(2^(w-1)) to 2^(w-1)-1',
    ],
    placeholder: 'minimum through maximum',
    feedback: {
      correct: 'Correct. The negative side has one extra magnitude.',
      incorrect: 'Use powers of two and remember the positive maximum is one smaller.',
      secondIncorrect: 'Use -2^(w-1) through 2^(w-1)-1.',
    },
    hints: [
      'One bit is the sign position.',
      'For 8 bits, the range is -128 through 127.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the cargo dial’s overflow-safe reversal.',
    feedback: {
      correct: 'The dial now reverses decimal magnitude and rejects out-of-range results.',
      incorrect: 'The sign-specific limit must be known before any digit is appended.',
      secondIncorrect:
        'Separate sign, choose limit, pop digit, guard append, then restore sign.',
    },
    hints: [
      'The loop works only with a nonnegative magnitude.',
      'The sign returns after the digit loop.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies signed integer data["value"], data["bitWidth"], and data["signed"] = true. Reverse decimal digits arithmetically and return 0 on width overflow.',
    starterCode: `def solve(data):
    value = data["value"]
    width = data["bitWidth"]
    signed = data["signed"]
    sign = -1 if value < 0 else 1
    magnitude = abs(value)
    limit = (1 << (width - 1)) if sign < 0 else (1 << (width - 1)) - 1
    reversed_value = 0

    while magnitude:
        magnitude, digit = divmod(magnitude, 10)
        # TODO: guard against overflow, then append digit.
        pass

    return sign * reversed_value`,
    cases: {
      visibleExample: {
        input: { value: -120, bitWidth: 32, signed: true },
        expected: -21,
      },
      hiddenBoundary: {
        input: { value: 0, bitWidth: 32, signed: true },
        expected: 0,
      },
      hiddenAdversarial: {
        input: { value: 1534236469, bitWidth: 32, signed: true },
        expected: 0,
      },
    },
    feedback: {
      correct: 'The cargo dial reverses safely and refuses any value outside its signed register.',
      incorrect:
        'A dial value failed. Recheck trailing zeroes, sign restoration, and pre-append overflow.',
      secondIncorrect:
        'If reversed_value > (limit - digit) // 10 return 0; otherwise set reversed_value = reversed_value * 10 + digit.',
    },
    hints: [
      'Use divmod on the nonnegative magnitude.',
      'The negative limit magnitude is 2^(width-1); the positive one is one less.',
      'Check before multiplying reversed_value by 10.',
    ],
    diagram: {
      kind: 'bits',
      rows: [
        {
          id: 'overflow-input',
          bits: '01011011011100101001011100110101',
          label: '1534236469 fits',
        },
        {
          id: 'positive-limit',
          bits: '01111111111111111111111111111111',
          label: 'reversal would exceed this',
        },
      ],
      operation: 'return 0 before overflow',
      highlightedBitIndices: [0],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(reverseIntegerMissionSeed)

export default problemLesson
