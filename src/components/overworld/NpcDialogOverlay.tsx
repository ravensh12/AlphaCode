import {
  ARCADE_QUESTION_SECONDS,
  NPC_STREAK_BONUS_XP,
  type QuizChainQuestion,
  type QuizChainState,
  type QuizConceptResult,
} from './quizChain'
import { useModalOverlay } from './useModalOverlay'
import { useQuizChain } from './useQuizChain'
import './NpcDialogOverlay.css'

/* ============================================================================
   District NPC dialog — a 3-question chat chain from districtQuestions.

   Same contract as the arcade: pure view over the quiz-chain reducer, streak
   bonus on consecutive correct answers, and every reward leaves through the
   injected onAnswer / onXp callbacks. Questions without a legacy concept are
   XP-only — the reducer simply emits no concept result for them.
   ========================================================================== */

export interface NpcDialogOverlayProps {
  npcName: string
  districtTitle: string
  /** The 3-question chain (districtQuestionChain(trackId)). */
  questions: readonly QuizChainQuestion[]
  onAnswer: (result: QuizConceptResult) => void
  onXp: (xp: number) => void
  onClose: () => void
  /** Soft timer override (seconds); defaults to the shared constant. */
  questionSeconds?: number
  /** Resume/test seam — start mid-chain instead of at question one. */
  initialChain?: QuizChainState
}

export function NpcDialogOverlay(props: NpcDialogOverlayProps) {
  const { questions } = props
  const { chain, secondsLeft, question, choose, next } = useQuizChain({
    questions,
    rules: { streakBonusXp: NPC_STREAK_BONUS_XP },
    questionSeconds: props.questionSeconds ?? ARCADE_QUESTION_SECONDS,
    onAnswer: props.onAnswer,
    onXp: props.onXp,
    initialState: props.initialChain,
  })
  const modal = useModalOverlay(props.onClose)

  if (chain.done || questions.length === 0) {
    const aced = chain.correctCount === questions.length && questions.length > 0
    return (
      <div
        className="npc-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={props.npcName}
        onKeyDown={modal.onKeyDown}
      >
        <div className="npc-card" ref={modal.cardRef} tabIndex={-1}>
          <span className="npc-eyebrow">
            {props.districtTitle} · {props.npcName}
          </span>
          <h2>
            {chain.correctCount} / {questions.length}
            {aced ? ' — perfect chain!' : ' answered'}
          </h2>
          <p className="npc-soft-copy">
            {aced
              ? `“Sharp as the skyline,” ${props.npcName} grins. Streaks pay bonus XP — come back tomorrow for a fresh chat.`
              : `“Good talk,” ${props.npcName} nods. Missed ones circle back — that’s how the city keeps you sharp.`}
          </p>
          <div className="npc-meta">
            <span className="npc-chip npc-chip-xp">+{chain.xp} XP</span>
            <span className="npc-chip">Best streak ×{chain.bestStreak}</span>
          </div>
          <button type="button" className="npc-btn" onClick={props.onClose}>
            Wave goodbye
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = question!
  const revealed = chain.revealed
  const streakBonus = Math.max(0, chain.streak - 1) * NPC_STREAK_BONUS_XP
  return (
    <div
      className="npc-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={props.npcName}
      onKeyDown={modal.onKeyDown}
    >
      <div className="npc-card" ref={modal.cardRef} tabIndex={-1}>
        <div className="npc-head">
          <span className="npc-eyebrow">
            {props.districtTitle} · {props.npcName}
          </span>
          <span
            className={`npc-timer ${secondsLeft <= 5 && !revealed ? 'is-low' : ''}`}
            aria-label={`${secondsLeft} seconds left`}
          >
            {secondsLeft}s
          </span>
        </div>

        <div
          className="npc-dots"
          aria-label={`Question ${chain.index + 1} of ${questions.length}`}
        >
          {questions.map((_, dot) => (
            <span
              key={dot}
              className={`npc-dot ${
                dot < chain.index ? 'is-done' : dot === chain.index ? 'is-now' : ''
              }`}
            />
          ))}
        </div>

        <div className="npc-streak" aria-label={`Streak ${chain.streak}`}>
          <span className={`npc-chip ${chain.streak >= 2 ? 'npc-chip-streak' : ''}`}>
            Streak ×{chain.streak}
          </span>
          {chain.streak >= 2 && (
            <span className="npc-streak-bonus">+{streakBonus} bonus XP flowing</span>
          )}
        </div>

        <h2 className="npc-q">{currentQuestion.prompt}</h2>
        <div className="npc-choices">
          {currentQuestion.choices.map((choice, index) => {
            const isAnswer = index === currentQuestion.answerIndex
            const isPicked = index === chain.picked
            const revealClass = revealed
              ? isAnswer
                ? 'is-right'
                : isPicked
                  ? 'is-wrong'
                  : 'is-dim'
              : ''
            return (
              <button
                key={index}
                type="button"
                className={`npc-choice ${revealClass}`}
                disabled={revealed}
                onClick={() => choose(index)}
              >
                {choice}
              </button>
            )
          })}
        </div>

        <div className="npc-meta">
          <span className="npc-chip npc-chip-xp">+{chain.xp} XP</span>
        </div>

        {revealed && (
          <div className="npc-feedback">
            <p
              className={
                chain.picked === currentQuestion.answerIndex ? 'is-right' : 'is-wrong'
              }
            >
              {chain.timedOut
                ? `Time drifts by… “${currentQuestion.choices[currentQuestion.answerIndex]}” was the one. No rush — ask me again sometime.`
                : chain.picked === currentQuestion.answerIndex
                  ? 'Exactly right — the district approves.'
                  : `Close! It’s “${currentQuestion.choices[currentQuestion.answerIndex]}.” You’ll nail it next pass.`}
            </p>
            <button type="button" className="npc-btn" onClick={next}>
              {chain.index + 1 >= questions.length ? 'Finish chat' : 'Keep talking'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
