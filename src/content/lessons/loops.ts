import type { Lesson } from '../../types/lesson'
import { randInt } from '../../lib/random'

/**
 * Loops — trace a value as it changes round after round.
 * Randomizes the loop count and step each time.
 */
export function generateLoops(): Lesson {
  const n = randInt(3, 5) // range(n)
  const k = randInt(2, 4) // total = total + k
  const afterOne = k
  const total = n * k

  const code = [`total = 0`, `for i in range(${n}):`, `    total = total + ${k}`, `print(total)`]

  // Review: a doubling loop.
  const m = randInt(2, 4)
  const result = 2 ** m
  const reviewCode = [`result = 1`, `for i in range(${m}):`, `    result = result * 2`, `print(result)`]

  return {
    id: 'loops',
    title: 'Loops',
    description:
      'A for-loop repeats the same lines several times. Trace the value as it changes each round.',
    estimatedMinutes: 6,
    conceptTags: ['variables', 'loops'],
    unlockRequirements: { previousLessonId: 'if-statements', minimumMastery: 75 },
    steps: [
      {
        id: 'intro',
        type: 'intro',
        prompt: `range(${n}) makes the indented line run ${n} times. Each round it updates total. Trace it one round at a time.`,
        code,
        variables: [],
        targetVariables: [],
        expectedState: {},
        feedback: { correct: '', incorrect: '' },
        conceptTags: ['loops'],
      },
      {
        id: 'step-first-round',
        type: 'traceVariables',
        prompt: 'total starts at 0. After the loop body runs once, what is total?',
        code,
        currentLineIndex: 2,
        variables: ['total'],
        targetVariables: ['total'],
        expectedState: { total: afterOne },
        feedback: {
          correct: `Right. 0 + ${k} = ${afterOne} after the first round.`,
          incorrect: `Start from total = 0 and add ${k} once.`,
          secondIncorrect: `0 + ${k} = ${afterOne}.`,
        },
        conceptTags: ['loops'],
      },
      {
        id: 'step-final',
        type: 'finalState',
        prompt: `The loop runs ${n} times in total. What is total when the loop finishes?`,
        code,
        currentLineIndex: 3,
        variables: ['total'],
        targetVariables: ['total'],
        expectedState: { total },
        feedback: {
          correct: `Yes. Adding ${k} a total of ${n} times gives ${n} × ${k} = ${total}.`,
          incorrect: `Add ${k} once per round, for ${n} rounds.`,
          secondIncorrect: `${n} rounds × ${k} each = ${total}.`,
        },
        conceptTags: ['loops'],
      },
      {
        id: 'step-review',
        type: 'reviewPuzzle',
        prompt: 'New loop. result starts at 1 and doubles each round. What is the final result?',
        code: reviewCode,
        currentLineIndex: 3,
        variables: ['result'],
        targetVariables: ['result'],
        expectedState: { result },
        feedback: {
          correct: `Nice. Doubling 1 a total of ${m} times gives ${result}.`,
          incorrect: 'Double the value each round: 1, 2, 4, 8, ...',
          secondIncorrect: `Doubling ${m} times: 1 → ${result}.`,
        },
        conceptTags: ['loops'],
      },
    ],
  }
}
