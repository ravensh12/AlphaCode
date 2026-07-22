import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const powxNMissionSeed = {
  slug: 'powx-n',
  estimatedMinutes: 22,
  mission: {
    title: 'The Doubling Lens Dial',
    context:
      'A planetarium lens applies the same zoom factor many times. Its controller must also support negative dial values, which mean reciprocal zoom.',
    prompt:
      'Return base raised to the integer exponent using repeated squaring instead of multiplying once per exponent step.',
  },
  objective:
    'Use the binary digits of an exponent to multiply selected squared powers.',
  priorKnowledge: [
    'A negative exponent means taking the reciprocal.',
    'An even exponent can be halved after squaring the base.',
    'An odd binary digit means the current power belongs in the result.',
  ],
  recognitionCue:
    'The same value is multiplied a huge number of times, and the exponent can be halved.',
  misconception:
    'Negating a negative exponent without inverting the base computes the wrong direction of zoom.',
  algorithmSteps: [
    {
      id: 'prepare-negative',
      instruction:
        'If the exponent is negative, invert the base and make the exponent positive.',
    },
    {
      id: 'start-result',
      instruction: 'Set result to 1.',
    },
    {
      id: 'use-odd-power',
      instruction:
        'While exponent remains, multiply result by base when exponent is odd.',
    },
    {
      id: 'square-and-halve',
      instruction: 'Square the base and halve the exponent with integer division.',
    },
    {
      id: 'return-power',
      instruction: 'Return the accumulated result.',
    },
  ],
  complexity: {
    time: 'O(log |n|)',
    space: 'O(1)',
    explanation:
      'Each loop halves the exponent, and only a few numeric variables are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['exponent', 'current power', 'use it?'],
        [10, 2, 'no'],
        [5, 4, 'yes'],
        [2, 16, 'no'],
        [1, 256, 'yes'],
      ],
      highlightedCells: [
        { row: 2, column: 2, label: 'odd' },
        { row: 4, column: 2, label: 'odd' },
      ],
    },
  },
  workedExample: {
    prompt:
      'For base 2 and exponent 10, binary halving visits exponents 10, 5, 2, and 1. Multiply powers 4 and 256 to get 1024.',
    code: [
      'result=1, base=2, exponent=10',
      'even: square base=4, exponent=5',
      'odd: result=4; square base=16, exponent=2',
      'even: square base=256, exponent=1',
      'odd: result=1024; exponent=0',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Exponent 10 has no ones bit at the current place, so result stays 1.',
      'Exponent 5 is odd, so current power 4 is selected.',
      'After another square and halve, exponent 1 selects power 256.',
      'The selected powers multiply to 1024.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['selected powers', 4, 256],
        ['product', 1024, ''],
      ],
      highlightedCells: [{ row: 1, column: 1, label: 'answer' }],
    },
  },
  patternCheck: {
    prompt:
      'What should happen when the remaining exponent is odd?',
    options: [
      {
        id: 'multiply-current',
        label: 'Multiply the result by the current squared base.',
      },
      {
        id: 'discard-base',
        label: 'Discard the current base without using it.',
      },
      {
        id: 'restart-result',
        label: 'Reset the result to 1.',
      },
    ],
    correctOptionId: 'multiply-current',
    feedback: {
      correct: 'Yes. An odd remainder exposes a 1 bit, so that power contributes.',
      incorrect: 'That loses a power represented by a 1 bit in the exponent.',
      secondIncorrect:
        'When exponent % 2 == 1, do result *= base before the next square.',
    },
    hints: [
      'Odd means the current binary digit is 1.',
      'Selected powers accumulate in result.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['binary exponent', '1', '0', '1'],
        ['powers selected', 'x⁴', 'skip x²', 'x¹'],
      ],
      highlightedCells: [
        { row: 1, column: 1, label: 'use' },
        { row: 1, column: 3, label: 'use' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the two changes needed before processing a negative exponent.',
    acceptedAnswers: [
      'invert the base and negate the exponent',
      'use the reciprocal base and make the exponent positive',
      'base = 1 / base and exponent = -exponent',
      'base = 1/base and exponent = -exponent',
      'take the reciprocal of the base and negate the exponent',
      'invert the base and make the exponent positive',
    ],
    placeholder: 'change base and exponent',
    feedback: {
      correct: 'Correct. The reciprocal converts the task to a positive exponent.',
      incorrect: 'Your answer must change both the base and the exponent.',
      secondIncorrect: 'Invert the base, then make the exponent positive.',
    },
    hints: [
      'x⁻³ equals (1/x)³.',
      'The main loop should only handle a nonnegative exponent.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Restore the fast lens-power routine from its shuffled actions.',
    feedback: {
      correct: 'The controller now handles huge and negative exponents by halving.',
      incorrect: 'Negative preparation comes before the positive-exponent loop.',
      secondIncorrect:
        'Prepare reciprocal, start result, use odd powers, square and halve, then return.',
    },
    hints: [
      'Result starts at the multiplicative identity.',
      'Every loop iteration squares and halves.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies numeric data["base"] and integer data["exponent"]. Return the power as a JSON number using binary exponentiation.',
    starterCode: `def solve(data):
    base = data["base"]
    exponent = data["exponent"]
    result = 1

    if exponent < 0:
        # TODO: convert to a positive-exponent reciprocal problem.
        pass

    while exponent > 0:
        # TODO: use odd powers, square base, and halve exponent.
        break

    return result`,
    cases: {
      visibleExample: {
        input: { base: 2, exponent: 10 },
        expected: 1024,
      },
      hiddenBoundary: {
        input: { base: -7, exponent: 0 },
        expected: 1,
      },
      hiddenAdversarial: {
        input: { base: 2, exponent: -3 },
        expected: 0.125,
      },
    },
    feedback: {
      correct: 'The lens controller reaches the power in logarithmically many turns.',
      incorrect:
        'A power is wrong. Recheck exponent zero, reciprocal setup, and odd-bit multiplication.',
      secondIncorrect:
        'For negative n use base=1/base and n=-n; loop with n%2, base*=base, n//=2.',
    },
    hints: [
      'The result for every base to exponent 0 is 1.',
      'Multiply result only when exponent % 2 == 1.',
      'Always square base and use exponent //= 2.',
    ],
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        ['input', 2, -3],
        ['converted', 0.5, 3],
        ['answer', 0.125, ''],
      ],
      highlightedCells: [{ row: 1, column: 1, label: 'reciprocal' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(powxNMissionSeed)

export default problemLesson
