import type { Lesson } from '../../types/lesson'
import { randInt, sample } from '../../lib/random'

/**
 * Variables Are Boxes — assignment & reassignment.
 * Generates fresh numbers (and a fresh review program) every time.
 */
export function generateVariablesAreBoxes(): Lesson {
  const a = randInt(2, 7) // x = a
  const b = randInt(2, 6) // y = x + b
  const y = a + b
  const c = randInt(1, y - 1) // x = y - c  (keep result >= 1)
  const xFinal = y - c

  const code = [`x = ${a}`, `y = x + ${b}`, `x = y - ${c}`]

  // Review program uses two fresh variable names + numbers, same idea.
  const [p, q] = sample(['a', 'b', 'm', 'n', 'p', 'q', 's', 't'], 2)
  const d = randInt(2, 6)
  const e = randInt(2, 6)
  const qVal = d + e
  const f = randInt(1, 4)
  const pVal = qVal + f
  const reviewCode = [`${p} = ${d}`, `${q} = ${p} + ${e}`, `${p} = ${q} + ${f}`]

  return {
    id: 'variables-are-boxes',
    title: 'Variables Are Boxes',
    description:
      'Variables hold values, code runs line by line, and reassignment replaces what a variable holds.',
    estimatedMinutes: 6,
    conceptTags: ['variables', 'assignment', 'reassignment'],
    unlockRequirements: {},
    steps: [
      {
        id: 'intro',
        type: 'intro',
        prompt:
          'A variable is like a box with a name. When Python runs a line like x = 4, it stores the value on the right inside the box on the left.',
        code,
        variables: [],
        targetVariables: [],
        expectedState: {},
        feedback: { correct: '', incorrect: '' },
        conceptTags: ['variables'],
      },
      {
        id: 'step-1-first-assignment',
        type: 'traceVariables',
        prompt: 'Python runs this line. What value is now inside x?',
        code: [code[0]],
        currentLineIndex: 0,
        variables: ['x'],
        targetVariables: ['x'],
        expectedState: { x: a },
        feedback: {
          correct: `Correct. The line x = ${a} stores the value ${a} inside x.`,
          incorrect:
            'Not quite. Look at the right side of the equals sign — that value gets stored inside x.',
          secondIncorrect: `The value on the right of = goes into the box on the left. Here the right side is ${a}, so x becomes ${a}.`,
        },
        conceptTags: ['variables', 'assignment'],
      },
      {
        id: 'step-2-use-existing',
        type: 'traceVariables',
        prompt: `x is currently ${a}. What value is stored inside y after this line?`,
        code: [code[0], code[1]],
        currentLineIndex: 1,
        variables: ['x', 'y'],
        targetVariables: ['y'],
        expectedState: { x: a, y },
        feedback: {
          correct: `Yes. Python uses the current value of x, which is ${a}. So y = x + ${b} becomes ${a} + ${b} = ${y}.`,
          incorrect:
            'Not quite. Before solving y, first replace x with its current value.',
          secondIncorrect: `x is ${a} right now. Substitute it in: y = ${a} + ${b} = ${y}.`,
        },
        conceptTags: ['variables', 'assignment'],
      },
      {
        id: 'step-3-reassignment',
        type: 'traceVariables',
        prompt: 'Now Python updates x. What value does x store after this line?',
        code,
        currentLineIndex: 2,
        variables: ['x', 'y'],
        targetVariables: ['x'],
        expectedState: { x: xFinal, y },
        feedback: {
          correct: `Correct. y is ${y}, so y - ${c} is ${xFinal}. The old value of x is replaced with ${xFinal}.`,
          incorrect:
            'Remember, reassignment replaces the old value. x does not stay the same once a later line assigns it a new value.',
          secondIncorrect: `y is ${y}, so y - ${c} = ${xFinal}. That new value overwrites the old x.`,
        },
        conceptTags: ['variables', 'reassignment'],
      },
      {
        id: 'step-4-final-state',
        type: 'finalState',
        prompt:
          'The full program has finished running. What are the final values of each variable?',
        code,
        variables: ['x', 'y'],
        targetVariables: ['x', 'y'],
        expectedState: { x: xFinal, y },
        feedback: {
          correct: `Nice. You traced the whole program correctly. Final values: x = ${xFinal}, y = ${y}.`,
          incorrect:
            'Trace one line at a time. y was created using the old value of x, then x changed later.',
          secondIncorrect: `Line 1: x = ${a}. Line 2: y = ${a} + ${b} = ${y}. Line 3: x = ${y} - ${c} = ${xFinal}.`,
        },
        conceptTags: ['variables', 'assignment', 'reassignment'],
      },
      {
        id: 'step-5-review-puzzle',
        type: 'reviewPuzzle',
        prompt:
          'New program, same idea. After it finishes, what are the final values of each variable?',
        code: reviewCode,
        variables: [p, q],
        targetVariables: [p, q],
        expectedState: { [p]: pVal, [q]: qVal },
        feedback: {
          correct: `Great — you transferred the idea to a new program. ${p} = ${pVal}, ${q} = ${qVal}.`,
          incorrect: 'Work line by line, and remember the last line reassigns a variable.',
          secondIncorrect: `${p} = ${d}, then ${q} = ${d} + ${e} = ${qVal}, then ${p} = ${qVal} + ${f} = ${pVal}.`,
        },
        conceptTags: ['variables', 'assignment', 'reassignment'],
      },
    ],
  }
}
