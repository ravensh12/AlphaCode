import type { Lesson } from '../../types/lesson'
import { randInt } from '../../lib/random'

/**
 * Debug the Code — programs do exactly what's written, not what you intended.
 * Each generated program hides a reassignment that overwrites earlier work.
 */
export function generateDebugTheCode(): Lesson {
  const a = randInt(3, 9) // score
  const b = randInt(2, 6) // bonus
  const added = a + b // score after the intended addition
  // Bug: the next line overwrites score with bonus instead of keeping the sum.
  const buggyFinal = b

  const code = [
    `score = ${a}`,
    `bonus = ${b}`,
    `score = score + bonus`,
    `score = bonus`,
    `print(score)`,
  ]

  // Review: a "reset" trap — total keeps the work, count gets wiped to 0.
  const c = randInt(2, 7)
  const d = randInt(2, 7)
  const totalVal = c + d
  const reviewCode = [
    `count = ${c}`,
    `count = count + ${d}`,
    `total = count`,
    `count = 0`,
    `print(count)`,
  ]

  return {
    id: 'debug-the-code',
    title: 'Debug the Code',
    description:
      'The computer runs every line exactly as written. Trace what actually happens — including lines that overwrite earlier values.',
    estimatedMinutes: 6,
    conceptTags: ['variables', 'reassignment', 'debugging'],
    unlockRequirements: { previousLessonId: 'loops', minimumMastery: 75 },
    steps: [
      {
        id: 'intro',
        type: 'intro',
        prompt:
          'This program looks like it adds a bonus to a score — but read every line carefully. A later line may overwrite the work.',
        code,
        variables: [],
        targetVariables: [],
        expectedState: {},
        feedback: { correct: '', incorrect: '' },
        conceptTags: ['debugging'],
      },
      {
        id: 'step-add',
        type: 'traceVariables',
        prompt: `score is ${a} and bonus is ${b}. After this line, what is score?`,
        code: [code[0], code[1], code[2]],
        currentLineIndex: 2,
        variables: ['score', 'bonus'],
        targetVariables: ['score'],
        expectedState: { score: added, bonus: b },
        feedback: {
          correct: `Right so far. score = ${a} + ${b} = ${added}.`,
          incorrect: 'Add the current values of score and bonus.',
          secondIncorrect: `${a} + ${b} = ${added}.`,
        },
        conceptTags: ['reassignment'],
      },
      {
        id: 'step-bug',
        type: 'traceVariables',
        prompt: 'Watch this line closely. After it runs, what is score now?',
        code: [code[0], code[1], code[2], code[3]],
        currentLineIndex: 3,
        variables: ['score', 'bonus'],
        targetVariables: ['score'],
        expectedState: { score: buggyFinal, bonus: b },
        feedback: {
          correct: `Exactly — this is the bug. score = bonus throws away the ${added} and overwrites it with ${b}.`,
          incorrect: `This line is "score = bonus", not "score = score + bonus". It replaces score with bonus.`,
          secondIncorrect: `score = bonus makes score = ${b}. The earlier ${added} is gone.`,
        },
        conceptTags: ['debugging', 'reassignment'],
      },
      {
        id: 'step-output',
        type: 'finalState',
        prompt: 'So what does this program actually print?',
        code,
        currentLineIndex: 4,
        variables: ['score'],
        targetVariables: ['score'],
        expectedState: { score: buggyFinal },
        feedback: {
          correct: `Correct. Because of the overwrite, it prints ${buggyFinal}, not ${added}.`,
          incorrect: 'Use the value score holds after the last assignment.',
          secondIncorrect: `The last line that changed score set it to ${buggyFinal}.`,
        },
        conceptTags: ['debugging'],
      },
      {
        id: 'step-review',
        type: 'reviewPuzzle',
        prompt:
          'New program with a reset trap. What are the final values when it finishes?',
        code: reviewCode,
        variables: ['count', 'total'],
        targetVariables: ['count', 'total'],
        expectedState: { count: 0, total: totalVal },
        feedback: {
          correct: `Nice catch. total copied ${totalVal} before count was reset to 0.`,
          incorrect:
            'total takes a copy of count at that moment; the later reset only changes count.',
          secondIncorrect: `count becomes ${c} + ${d} = ${totalVal}, total copies ${totalVal}, then count = 0.`,
        },
        conceptTags: ['debugging', 'reassignment'],
      },
    ],
  }
}
