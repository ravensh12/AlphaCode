import { describe, expect, it } from 'vitest'
import { answerXp } from '../../lib/playerLevel'
import {
  ARCADE_QUESTION_SECONDS,
  NPC_STREAK_BONUS_XP,
  advanceQuizChain,
  answerQuizChain,
  startQuizChain,
  timeoutQuizChain,
  type QuizChainQuestion,
} from './quizChain'

const CONCEPT_QUESTION: QuizChainQuestion = {
  concept: 'stacks',
  prompt: 'Push A, B, C. Which pops first?',
  choices: ['A', 'C', 'B'],
  answerIndex: 1,
}

const XP_ONLY_QUESTION: QuizChainQuestion = {
  prompt: 'A leaf node has how many children?',
  choices: ['0', '1', '2'],
  answerIndex: 0,
}

const CHAIN: QuizChainQuestion[] = [
  CONCEPT_QUESTION,
  XP_ONLY_QUESTION,
  { ...CONCEPT_QUESTION, prompt: 'Undo uses which structure?', answerIndex: 1 },
]

describe('quiz chain reducer', () => {
  it('starts clean and exposes the shared soft-timer constant', () => {
    expect(startQuizChain()).toEqual({
      index: 0,
      picked: null,
      timedOut: false,
      revealed: false,
      correctCount: 0,
      streak: 0,
      bestStreak: 0,
      xp: 0,
      done: false,
    })
    expect(ARCADE_QUESTION_SECONDS).toBe(20)
  })

  it('a correct answer pays answerXp and emits a first-try concept result', () => {
    const { state, event } = answerQuizChain(startQuizChain(), CHAIN, 1, 2_500)
    expect(event.correct).toBe(true)
    expect(event.xp).toBe(answerXp(true, true, 2_500))
    expect(event.conceptResult).toEqual({
      conceptIds: ['stacks'],
      firstTry: true,
      correct: true,
      responseMs: 2_500,
    })
    expect(state).toMatchObject({
      picked: 1,
      revealed: true,
      correctCount: 1,
      streak: 1,
      bestStreak: 1,
      xp: event.xp,
    })
  })

  it('a wrong answer pays nothing, resets the streak, and still reports it', () => {
    const first = answerQuizChain(startQuizChain(), CHAIN, 1, 2_000)
    const advanced = advanceQuizChain(first.state, CHAIN.length)
    const second = answerQuizChain(advanced, CHAIN, 2, 3_000)
    expect(second.event).toMatchObject({ correct: false, xp: 0 })
    // XP-only question → no concept result even on a miss.
    expect(second.event.conceptResult).toBeNull()
    expect(second.state.streak).toBe(0)
    expect(second.state.bestStreak).toBe(1)
    expect(second.state.correctCount).toBe(1)
  })

  it('concept-free questions never emit a concept result (XP only)', () => {
    const state = advanceQuizChain(
      answerQuizChain(startQuizChain(), CHAIN, 1, 1_000).state,
      CHAIN.length,
    )
    const { event } = answerQuizChain(state, CHAIN, 0, 1_000)
    expect(event.correct).toBe(true)
    expect(event.xp).toBeGreaterThan(0)
    expect(event.conceptResult).toBeNull()
  })

  it('pays the streak bonus per consecutive correct beyond the first', () => {
    const rules = { streakBonusXp: NPC_STREAK_BONUS_XP }
    let state = startQuizChain()
    const xps: number[] = []
    for (const answer of [1, 0, 1]) {
      const result = answerQuizChain(state, CHAIN, answer, 1_000, rules)
      xps.push(result.event.xp)
      state = advanceQuizChain(result.state, CHAIN.length)
    }
    const base = answerXp(true, true, 1_000)
    expect(xps).toEqual([
      base,
      base + NPC_STREAK_BONUS_XP,
      base + 2 * NPC_STREAK_BONUS_XP,
    ])
    expect(state.done).toBe(true)
    expect(state.bestStreak).toBe(3)
    expect(state.xp).toBe(xps[0] + xps[1] + xps[2])
  })

  it('timeout reveals gently: wrong, zero XP, streak reset, concept reported', () => {
    const first = answerQuizChain(startQuizChain(), CHAIN, 1, 1_000)
    const advanced = advanceQuizChain(first.state, CHAIN.length)
    const secondAdvance = advanceQuizChain(
      answerQuizChain(advanced, CHAIN, 0, 1_000).state,
      CHAIN.length,
    )
    const { state, event } = timeoutQuizChain(secondAdvance, CHAIN)
    expect(state).toMatchObject({
      picked: null,
      timedOut: true,
      revealed: true,
      streak: 0,
    })
    expect(event).toMatchObject({ correct: false, xp: 0 })
    expect(event.conceptResult).toEqual({
      conceptIds: ['stacks'],
      firstTry: true,
      correct: false,
    })
  })

  it('ignores double answers and timeouts after the reveal', () => {
    const first = answerQuizChain(startQuizChain(), CHAIN, 1, 1_000)
    const again = answerQuizChain(first.state, CHAIN, 0, 1_500)
    expect(again.state).toBe(first.state)
    expect(again.event.xp).toBe(0)
    const timedOut = timeoutQuizChain(first.state, CHAIN)
    expect(timedOut.state).toBe(first.state)
  })

  it('advance only moves past a revealed question and finishes the chain', () => {
    const fresh = startQuizChain()
    expect(advanceQuizChain(fresh, CHAIN.length)).toBe(fresh)

    let state = fresh
    for (let i = 0; i < CHAIN.length; i++) {
      state = answerQuizChain(state, CHAIN, CHAIN[i].answerIndex, 1_000).state
      state = advanceQuizChain(state, CHAIN.length)
    }
    expect(state.done).toBe(true)
    expect(state.correctCount).toBe(3)
    // Advancing a finished chain is a no-op.
    expect(advanceQuizChain(state, CHAIN.length)).toBe(state)
  })
})
