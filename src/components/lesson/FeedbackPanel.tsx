import type { Feedback } from '../../hooks/useLessonEngine'
import { IconCheck } from '../icons'

export function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  const correct = feedback.kind === 'correct'
  return (
    <div className={`feedback ${correct ? 'correct' : 'incorrect'}`} role="status">
      <span className="feedback-icon" aria-hidden="true">
        {correct ? <IconCheck size={18} /> : '!'}
      </span>
      <p className="feedback-text">{feedback.text}</p>
    </div>
  )
}
