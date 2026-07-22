import {
  assessmentAnswerLabel,
  type StepReview,
} from '../../hooks/useLessonEngine'
import type { LessonStep } from '../../types/lesson'
import { IconCheck, IconX } from '../icons'

/** Build the display shape for a stored step + whether it was missed. */
// oxlint-disable-next-line react/only-export-components
export function stepToReview(step: LessonStep, missed: boolean): StepReview {
  return {
    id: step.id,
    prompt: step.prompt,
    code: step.code,
    currentLineIndex: step.currentLineIndex,
    targetVariables: step.targetVariables,
    expected: Object.fromEntries(
      step.targetVariables.map((t) => [t, step.expectedState[t]]),
    ),
    assessmentAnswerLabel: step.assessment
      ? assessmentAnswerLabel(step.assessment)
      : undefined,
    missed,
  }
}

export function ReviewBreakdown({
  reviews,
  title = 'Your answers',
}: {
  reviews: StepReview[]
  title?: string
}) {
  const missedCount = reviews.filter((s) => s.missed).length
  const correctCount = reviews.length - missedCount

  return (
    <div className="review">
      <div className="review-head">
        <p className="review-title">{title}</p>
        <span className="review-tally">
          <span className="review-tally-ok">{correctCount} correct</span>
          {missedCount > 0 && (
            <span className="review-tally-miss">{missedCount} missed</span>
          )}
        </span>
      </div>
      <ul className="review-list">
        {reviews.map((s, i) => {
          const line =
            s.currentLineIndex != null && s.code[s.currentLineIndex] != null
              ? s.code[s.currentLineIndex]
              : (s.code[s.code.length - 1] ?? s.prompt)
          const answer =
            s.assessmentAnswerLabel ??
            s.targetVariables
              .map((t) => `${t} = ${s.expected[t]}`)
              .join(', ')
          return (
            <li
              key={s.id}
              className={`review-item ${s.missed ? 'missed' : 'got'}`}
            >
              <span className="review-mark" aria-hidden="true">
                {s.missed ? <IconX size={15} /> : <IconCheck size={15} />}
              </span>
              <span className="review-step">{i + 1}</span>
              <code className="review-code">{line}</code>
              <span
                className={`review-ans ${
                  s.assessmentAnswerLabel ? 'assessment-answer' : ''
                }`}
              >
                {answer}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
