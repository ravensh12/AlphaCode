import { buildBracketTrace } from './traces'
import { stackGrowFromEmpty, stackPushPopSequence } from '../../lib/diagramSequences'
import {
  buildBracketDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

export function generateStacks() {
  return lessonShell(
    'stacks',
    'Stacks',
    'Last in, first out — track open brackets and undo-style operations.',
    'Push / pop from the top',
    ['stacks'],
    [
      exploreStep(
        'explore-lifo',
        'A stack is last-in, first-out — like a stack of plates. You only touch the top.',
        'Push adds to the top; pop removes the most recent item. Undo buttons use the same idea.',
        ['stacks'],
        { kind: 'stack', items: ['('] },
        undefined,
        stackGrowFromEmpty(['(']),
      ),
      exploreStep(
        'explore-push',
        'Reading "(", "[", "{" left to right: each opener gets pushed onto the stack.',
        'After three pushes, "{" sits on top — it was added last.',
        ['stacks'],
        { kind: 'stack', items: ['(', '[', '{'] },
        undefined,
        stackGrowFromEmpty(['(', '[', '{']),
      ),
      exploreStep(
        'explore-match',
        'When a closer arrives, pop the top opener and check if they pair correctly.',
        'If "(", "[", then "]" — pop "[" and verify ] matches [.',
        ['stacks'],
        { kind: 'stack', items: ['(', '['] },
        undefined,
        stackPushPopSequence(['(', '['], 1),
      ),
      conceptStep(
        'concept',
        'Valid parentheses is a classic stack problem — match each closer to the most recent opener.',
        'Watch push and pop on each character — the stack diagram updates every step.',
        ['stacks'],
        { kind: 'stack', items: [] },
        stackGrowFromEmpty(['(', '[']),
      ),
      ...buildBracketDemo('()'),
      thinkPatternCheck(
        'check-lifo',
        'What everyday feature behaves like a stack?',
        'Undo button',
        'Last action undone first — that is LIFO, same as push/pop.',
        ['stacks'],
      ),

      quizIntroStep(
        'Trace bracket matching on a new string — push openers, pop and compare on closers.',
        'Watch the stack top every step.',
        ['stacks'],
      ),
      buildBracketTrace('(]', 'quiz-brackets-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'Why use a stack for valid parentheses?',
        'Match each closer to the most recent opener',
        ['Sort the brackets first', 'Compare only first and last', 'Never pop'],
        {
          correct: 'Exactly — LIFO means the last unmatched opener must pair with the next closer.',
          incorrect: 'Stack top = most recent opener still waiting for a partner.',
          secondIncorrect: 'Push openers, pop on closers — classic stack pattern.',
        },
        ['stacks'],
      ),
    ],
    { previousLessonId: 'two-pointers', minimumMastery: 75 },
  )
}
