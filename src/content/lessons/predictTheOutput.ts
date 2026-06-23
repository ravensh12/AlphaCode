import type { Lesson } from '../../types/lesson'
import { randInt } from '../../lib/random'

/**
 * Predict the Output — run a short program in your head and call the result.
 * Generates fresh arithmetic every time.
 */
export function generatePredictTheOutput(): Lesson {
  const a = randInt(2, 9)
  const b = randInt(2, 6)
  const c = a * b
  const e = randInt(1, c - 1)
  const d = c - e

  const code = [`a = ${a}`, `b = ${b}`, `c = a * b`, `d = c - ${e}`, `print(d)`]

  // Review program: build a value with addition then multiply.
  const x = randInt(2, 5)
  const y = randInt(2, 5)
  const sum = x + y
  const z = x * sum
  const reviewCode = [`x = ${x}`, `y = x + ${y}`, `z = x * y`, `print(z)`]

  return {
    id: 'predict-the-output',
    title: 'Predict the Output',
    description:
      'Run a program in your head, one line at a time, and predict exactly what it prints.',
    estimatedMinutes: 6,
    conceptTags: ['variables', 'arithmetic', 'output'],
    unlockRequirements: { previousLessonId: 'variables-are-boxes', minimumMastery: 75 },
    steps: [
      {
        id: 'intro',
        type: 'intro',
        prompt:
          'print(...) shows a value on the screen. To predict the output, trace the program line by line until you reach the print.',
        code,
        variables: [],
        targetVariables: [],
        expectedState: {},
        feedback: { correct: '', incorrect: '' },
        conceptTags: ['output'],
      },
      {
        id: 'step-multiply',
        type: 'traceVariables',
        prompt: `a is ${a} and b is ${b}. What value is stored in c?`,
        code: [code[0], code[1], code[2]],
        currentLineIndex: 2,
        variables: ['a', 'b', 'c'],
        targetVariables: ['c'],
        expectedState: { a, b, c },
        feedback: {
          correct: `Right. c = a * b = ${a} * ${b} = ${c}.`,
          incorrect: 'The * means multiply. Multiply the current values of a and b.',
          secondIncorrect: `Multiply: ${a} * ${b} = ${c}.`,
        },
        conceptTags: ['arithmetic'],
      },
      {
        id: 'step-subtract',
        type: 'traceVariables',
        prompt: `c is ${c}. What value is stored in d?`,
        code: [code[0], code[1], code[2], code[3]],
        currentLineIndex: 3,
        variables: ['c', 'd'],
        targetVariables: ['d'],
        expectedState: { c, d },
        feedback: {
          correct: `Yes. d = c - ${e} = ${c} - ${e} = ${d}.`,
          incorrect: 'Use the current value of c, then subtract.',
          secondIncorrect: `${c} - ${e} = ${d}.`,
        },
        conceptTags: ['arithmetic'],
      },
      {
        id: 'step-output',
        type: 'finalState',
        prompt: 'The last line prints d. What does this program print?',
        code,
        currentLineIndex: 4,
        variables: ['d'],
        targetVariables: ['d'],
        expectedState: { d },
        feedback: {
          correct: `Correct — the program prints ${d}.`,
          incorrect: 'print(d) shows the current value of d. What is d right now?',
          secondIncorrect: `d is ${d}, so print(d) shows ${d}.`,
        },
        conceptTags: ['output'],
      },
      {
        id: 'step-review',
        type: 'reviewPuzzle',
        prompt: 'New program. Trace it to the end — what does it print?',
        code: reviewCode,
        currentLineIndex: 3,
        variables: ['z'],
        targetVariables: ['z'],
        expectedState: { z },
        feedback: {
          correct: `Nice. x = ${x}, y = ${x} + ${y} = ${sum}, z = x * y = ${x} * ${sum} = ${z}.`,
          incorrect: 'Trace each line in order, then multiply x by y at the end.',
          secondIncorrect: `x = ${x}, y = ${sum}, z = ${x} * ${sum} = ${z}.`,
        },
        conceptTags: ['arithmetic', 'output'],
      },
    ],
  }
}
