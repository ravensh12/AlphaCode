import type { Feedback } from '../../hooks/useLessonEngine'
import { IconCheck, IconX } from '../icons'

export function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  const revealed = feedback.kind === 'revealed'
  const correct = feedback.kind === 'correct'
  const error = feedback.kind === 'error'
  const tone = revealed
    ? 'revealed'
    : correct
      ? 'correct'
      : error
        ? 'error'
        : 'incorrect'
  return (
    <div className={`feedback ${tone}`} role="status">
      <span className="feedback-icon" aria-hidden="true">
        {correct ? (
          <IconCheck size={18} />
        ) : revealed ? (
          <IconX size={18} />
        ) : (
          '!'
        )}
      </span>
      <p className="feedback-text">{feedback.text}</p>
    </div>
  )
}
