import type { Lesson } from '../../types/lesson'
import { randInt } from '../../lib/random'

/**
 * If Statements — follow the branch the computer actually takes.
 * Randomizes the value so the condition is true on one playthrough and false
 * on another.
 */
export function generateIfStatements(): Lesson {
  const x = randInt(1, 12)
  const t = randInt(3, 9)
  const pThen = randInt(2, 9) // y when condition true
  const qElse = randInt(2, 9) // y when condition false
  const taken = x > t
  const y = taken ? pThen : qElse

  const code = [
    `x = ${x}`,
    `if x > ${t}:`,
    `    y = ${pThen}`,
    `else:`,
    `    y = ${qElse}`,
    `print(y)`,
  ]

  // Review forces the opposite branch from the first scenario.
  const t2 = randInt(3, 9)
  const x2 = taken ? randInt(0, t2) : t2 + randInt(1, 4) // flip outcome
  const p2 = randInt(2, 9)
  const q2 = randInt(2, 9)
  const taken2 = x2 > t2
  const y2 = taken2 ? p2 : q2
  const reviewCode = [
    `x = ${x2}`,
    `if x > ${t2}:`,
    `    y = ${p2}`,
    `else:`,
    `    y = ${q2}`,
    `print(y)`,
  ]

  return {
    id: 'if-statements',
    title: 'If Statements',
    description:
      'An if/else picks exactly one branch based on whether its condition is true.',
    estimatedMinutes: 6,
    conceptTags: ['variables', 'conditionals'],
    unlockRequirements: { previousLessonId: 'predict-the-output', minimumMastery: 75 },
    steps: [
      {
        id: 'intro',
        type: 'intro',
        prompt:
          'Python checks the if condition. If it is true, it runs the indented if-block and skips the else. If it is false, it skips to the else-block.',
        code,
        variables: [],
        targetVariables: [],
        expectedState: {},
        feedback: { correct: '', incorrect: '' },
        conceptTags: ['conditionals'],
      },
      {
        id: 'step-assign',
        type: 'traceVariables',
        prompt: 'First line runs. What value is in x?',
        code: [code[0]],
        currentLineIndex: 0,
        variables: ['x'],
        targetVariables: ['x'],
        expectedState: { x },
        feedback: {
          correct: `Yes, x = ${x}.`,
          incorrect: 'The value on the right of = is stored in x.',
          secondIncorrect: `x = ${x}.`,
        },
        conceptTags: ['variables'],
      },
      {
        id: 'step-branch',
        type: 'traceVariables',
        prompt: `Is x > ${t}? Follow the branch Python takes. What value does y get?`,
        code,
        currentLineIndex: 1,
        variables: ['x', 'y'],
        targetVariables: ['y'],
        expectedState: { x, y },
        feedback: {
          correct: taken
            ? `Correct. ${x} > ${t} is true, so Python runs the if-block: y = ${pThen}.`
            : `Correct. ${x} > ${t} is false, so Python skips to else: y = ${qElse}.`,
          incorrect: `Check the condition first: is ${x} greater than ${t}? That decides which line sets y.`,
          secondIncorrect: taken
            ? `${x} > ${t} is true → the if-block runs → y = ${pThen}.`
            : `${x} > ${t} is false → the else-block runs → y = ${qElse}.`,
        },
        conceptTags: ['conditionals'],
      },
      {
        id: 'step-final',
        type: 'finalState',
        prompt: 'After the whole program runs, what are the final values?',
        code,
        variables: ['x', 'y'],
        targetVariables: ['x', 'y'],
        expectedState: { x, y },
        feedback: {
          correct: `Nice. x = ${x}, y = ${y}.`,
          incorrect: 'Only one branch runs, so y has just one value.',
          secondIncorrect: `x = ${x}, and the ${taken ? 'if' : 'else'} branch set y = ${y}.`,
        },
        conceptTags: ['conditionals'],
      },
      {
        id: 'step-review',
        type: 'reviewPuzzle',
        prompt: 'New condition. Which branch runs, and what is y at the end?',
        code: reviewCode,
        currentLineIndex: 1,
        variables: ['x', 'y'],
        targetVariables: ['x', 'y'],
        expectedState: { x: x2, y: y2 },
        feedback: {
          correct: taken2
            ? `Yes — ${x2} > ${t2} is true, so y = ${p2}.`
            : `Yes — ${x2} > ${t2} is false, so y = ${q2}.`,
          incorrect: `Test the condition: is ${x2} > ${t2}?`,
          secondIncorrect: `${x2} > ${t2} is ${taken2}, so y = ${y2}.`,
        },
        conceptTags: ['conditionals'],
      },
    ],
  }
}
