import { ARCADE_SESSIONS_PER_DAY } from '../../lib/cityLife'
import {
  ARCADE_QUESTION_SECONDS,
  type QuizChainQuestion,
  type QuizChainState,
  type QuizConceptResult,
} from './quizChain'
import { useModalOverlay } from './useModalOverlay'
import { useQuizChain } from './useQuizChain'
import './ArcadeOverlay.css'

/* ============================================================================
   Pattern Arcade overlay — a timed 6-question spaced-retrieval mini-session.

   The overlay is a pure view: the host builds the session (buildWarmupSession
   over the learner model), enforces the daily cap (cityLife arcade counters),
   and passes callbacks. Everything reward-shaped leaves through onAnswer /
   onXp — this component calls NO progress APIs itself.
   ========================================================================== */

export interface ArcadeDuePointer {
  id: string
  label: string
}

export interface ArcadeOverlayProps {
  /** Interleaved retrieval questions; empty → the friendly empty state. */
  session: readonly QuizChainQuestion[]
  /** Arcade plays left today AFTER this one started (cap 3/day). */
  sessionsRemainingToday: number
  /** What's due for review — shown when there's no session to play. */
  duePointers?: readonly ArcadeDuePointer[]
  onAnswer: (result: QuizConceptResult) => void
  onXp: (xp: number) => void
  onClose: () => void
  /** Navigate to a due-review pointer (wired by the host page). */
  onPointerSelect?: (id: string) => void
  /** Soft timer override (seconds); defaults to the cityLife constant. */
  questionSeconds?: number
  /** Resume/test seam — start mid-chain instead of at question one. */
  initialChain?: QuizChainState
}

export function ArcadeOverlay(props: ArcadeOverlayProps) {
  const { session, sessionsRemainingToday, duePointers = [] } = props
  const { chain, secondsLeft, question, choose, next } = useQuizChain({
    questions: session,
    questionSeconds: props.questionSeconds ?? ARCADE_QUESTION_SECONDS,
    onAnswer: props.onAnswer,
    onXp: props.onXp,
    initialState: props.initialChain,
  })
  const modal = useModalOverlay(props.onClose)

  if (session.length === 0) {
    const capped = sessionsRemainingToday <= 0
    return (
      <div
        className="arcade-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Pattern Arcade"
        onKeyDown={modal.onKeyDown}
      >
        <div className="arcade-card" ref={modal.cardRef} tabIndex={-1}>
          <span className="arcade-eyebrow">Pattern Arcade</span>
          {capped ? (
            <>
              <h2>All played out for today</h2>
              <p className="arcade-soft-copy">
                You’ve used all {ARCADE_SESSIONS_PER_DAY} arcade runs for
                today. The machines recharge overnight — missions never close.
              </p>
            </>
          ) : (
            <>
              <h2>Nothing to replay yet</h2>
              <p className="arcade-soft-copy">
                The arcade remixes concepts you’ve already practiced. Clear a
                mission first and the reels fill up on their own.
              </p>
            </>
          )}
          {duePointers.length > 0 && (
            <div className="arcade-due">
              <span className="arcade-due-title">Worth reviewing now</span>
              <ul className="arcade-due-list">
                {duePointers.map((pointer) => (
                  <li key={pointer.id}>
                    <button
                      type="button"
                      className="arcade-due-link"
                      onClick={() => props.onPointerSelect?.(pointer.id)}
                    >
                      {pointer.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="arcade-btn" onClick={props.onClose}>
            Back to the city
          </button>
        </div>
      </div>
    )
  }

  if (chain.done) {
    return (
      <div
        className="arcade-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Pattern Arcade"
        onKeyDown={modal.onKeyDown}
      >
        <div className="arcade-card" ref={modal.cardRef} tabIndex={-1}>
          <span className="arcade-eyebrow">Pattern Arcade · results</span>
          <h2>
            {chain.correctCount} / {session.length} recalled
          </h2>
          <p className="arcade-soft-copy">
            Every answer just rescheduled its concept — hits come back later,
            misses come back soon. That spacing is the whole trick.
          </p>
          <div className="arcade-meta">
            <span className="arcade-chip arcade-chip-xp">+{chain.xp} XP</span>
            <span className="arcade-chip">
              {sessionsRemainingToday} session
              {sessionsRemainingToday === 1 ? '' : 's'} left today
            </span>
          </div>
          <button type="button" className="arcade-btn" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const revealed = chain.revealed
  const currentQuestion = question!
  return (
    <div
      className="arcade-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pattern Arcade"
      onKeyDown={modal.onKeyDown}
    >
      <div className="arcade-card" ref={modal.cardRef} tabIndex={-1}>
        <div className="arcade-head">
          <span className="arcade-eyebrow">
            Pattern Arcade · {chain.index + 1}/{session.length}
          </span>
          <span
            className={`arcade-timer ${secondsLeft <= 5 && !revealed ? 'is-low' : ''}`}
            aria-label={`${secondsLeft} seconds left`}
          >
            {secondsLeft}s
          </span>
        </div>

        <div
          className="arcade-dots"
          aria-label={`Question ${chain.index + 1} of ${session.length}`}
        >
          {session.map((_, dot) => (
            <span
              key={dot}
              className={`arcade-dot ${
                dot < chain.index
                  ? 'is-done'
                  : dot === chain.index
                    ? 'is-now'
                    : ''
              }`}
            />
          ))}
        </div>

        <h2 className="arcade-q">{currentQuestion.prompt}</h2>
        <div className="arcade-choices">
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
                className={`arcade-choice ${revealClass}`}
                disabled={revealed}
                onClick={() => choose(index)}
              >
                {choice}
              </button>
            )
          })}
        </div>

        <div className="arcade-meta">
          <span className="arcade-chip arcade-chip-xp">+{chain.xp} XP</span>
          <span className="arcade-chip">
            {sessionsRemainingToday} session
            {sessionsRemainingToday === 1 ? '' : 's'} left today
          </span>
        </div>

        {revealed && (
          <div className="arcade-feedback">
            <p
              className={
                chain.picked === currentQuestion.answerIndex
                  ? 'is-right'
                  : 'is-wrong'
              }
            >
              {chain.timedOut
                ? `Time! The answer is “${currentQuestion.choices[currentQuestion.answerIndex]}.” No rush — it’ll come back around.`
                : chain.picked === currentQuestion.answerIndex
                  ? 'Clean recall — that pattern just got stickier.'
                  : `The answer is “${currentQuestion.choices[currentQuestion.answerIndex]}.” No sweat — you’ll see it again soon.`}
            </p>
            <button type="button" className="arcade-btn" onClick={next}>
              {chain.index + 1 >= session.length ? 'Finish' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
