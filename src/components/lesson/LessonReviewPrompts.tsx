import { IconArrowLeft, IconCap } from '../icons'
import { FORCE_RETAKE_MESSAGE } from '../../hooks/useLessonEngine'
import './LessonReviewPrompts.css'

/**
 * Shown alongside the "incorrect" feedback after every miss on a normal quiz
 * question. Lets the learner revisit the lesson's teaching content and return
 * to retry the same question without losing their place or other answers.
 */
export function ReviewLessonPrompt({
  onReview,
}: {
  onReview: () => void
}) {
  return (
    <div className="lesson-review-prompt" role="note">
      <div className="lesson-review-prompt-copy">
        <span className="lesson-review-prompt-title">Stuck on this one?</span>
        <span className="lesson-review-prompt-sub">
          Revisit the lesson, then come back and try again — your other answers
          are saved.
        </span>
      </div>
      <button
        type="button"
        className="btn ghost sm lesson-review-prompt-btn"
        onClick={onReview}
      >
        <IconArrowLeft size={15} />
        Go back and review lesson
      </button>
    </div>
  )
}

/**
 * Replaces the answer controls after 3 consecutive misses on one question. The
 * learner must walk back through the lesson before the quiz can continue.
 */
export function ForcedRetakePrompt({
  onRetake,
}: {
  onRetake: () => void
}) {
  return (
    <div className="lesson-retake-prompt" role="alert">
      <span className="lesson-retake-prompt-title">Time to review</span>
      <p className="lesson-retake-prompt-text">{FORCE_RETAKE_MESSAGE}</p>
      <button
        type="button"
        className="btn lg lesson-retake-prompt-btn"
        onClick={onRetake}
      >
        <IconCap size={17} />
        Review the lesson
      </button>
    </div>
  )
}
