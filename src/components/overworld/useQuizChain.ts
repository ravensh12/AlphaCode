import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ARCADE_QUESTION_SECONDS,
  DEFAULT_QUIZ_RULES,
  advanceQuizChain,
  answerQuizChain,
  startQuizChain,
  timeoutQuizChain,
  type QuizChainEvent,
  type QuizChainQuestion,
  type QuizChainRules,
  type QuizChainState,
  type QuizConceptResult,
} from './quizChain'

/* ============================================================================
   React binding for the quiz-chain reducer: owns the soft per-question timer
   and forwards reducer events through the host's callbacks. The overlays stay
   pure views; this hook is the only stateful piece, and even it never touches
   a progress API — everything reward-shaped leaves through onAnswer/onXp.
   ========================================================================== */

export interface UseQuizChainOptions {
  questions: readonly QuizChainQuestion[]
  rules?: QuizChainRules
  /** Soft timer per question (seconds); timeout = gentle wrong + reveal. */
  questionSeconds?: number
  onAnswer?: (result: QuizConceptResult) => void
  onXp?: (xp: number) => void
  /** Resume/test seam — start from a mid-chain state instead of fresh. */
  initialState?: QuizChainState
}

export interface QuizChainBinding {
  chain: QuizChainState
  secondsLeft: number
  question: QuizChainQuestion | undefined
  choose: (choiceIndex: number) => void
  next: () => void
}

export function useQuizChain(options: UseQuizChainOptions): QuizChainBinding {
  const {
    questions,
    rules = DEFAULT_QUIZ_RULES,
    questionSeconds = ARCADE_QUESTION_SECONDS,
    onAnswer,
    onXp,
  } = options

  const [chain, setChain] = useState<QuizChainState>(
    () => options.initialState ?? startQuizChain(),
  )
  const [secondsLeft, setSecondsLeft] = useState(questionSeconds)

  // Refs keep the interval callback honest without re-arming it every second.
  const chainRef = useRef(chain)
  chainRef.current = chain
  const questionsRef = useRef(questions)
  questionsRef.current = questions
  const rulesRef = useRef(rules)
  rulesRef.current = rules
  const questionStartedAtRef = useRef(Date.now())

  const emitRef = useRef((event: QuizChainEvent) => event)
  emitRef.current = (event: QuizChainEvent) => {
    if (event.xp > 0) onXp?.(event.xp)
    if (event.conceptResult) onAnswer?.(event.conceptResult)
    return event
  }

  const applyTimeout = useCallback(() => {
    const { state: next, event } = timeoutQuizChain(
      chainRef.current,
      questionsRef.current,
    )
    if (next === chainRef.current) return
    chainRef.current = next
    setChain(next)
    emitRef.current(event)
  }, [])

  // Arm the soft timer for each fresh (unrevealed) question.
  useEffect(() => {
    if (chain.done || chain.revealed || questions.length === 0) return
    questionStartedAtRef.current = Date.now()
    setSecondsLeft(questionSeconds)
    const interval = setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          clearInterval(interval)
          applyTimeout()
          return 0
        }
        return seconds - 1
      })
    }, 1_000)
    return () => clearInterval(interval)
  }, [
    chain.index,
    chain.revealed,
    chain.done,
    questions.length,
    questionSeconds,
    applyTimeout,
  ])

  const choose = useCallback((choiceIndex: number) => {
    const responseMs = Date.now() - questionStartedAtRef.current
    const { state: next, event } = answerQuizChain(
      chainRef.current,
      questionsRef.current,
      choiceIndex,
      responseMs,
      rulesRef.current,
    )
    if (next === chainRef.current) return
    chainRef.current = next
    setChain(next)
    emitRef.current(event)
  }, [])

  const next = useCallback(() => {
    const advanced = advanceQuizChain(
      chainRef.current,
      questionsRef.current.length,
    )
    if (advanced === chainRef.current) return
    chainRef.current = advanced
    setChain(advanced)
  }, [])

  return {
    chain,
    secondsLeft,
    question: questions[chain.index],
    choose,
    next,
  }
}
