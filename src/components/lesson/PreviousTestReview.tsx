import { useState } from 'react'
import { useProgress } from '../../context/ProgressContext'
import { ReviewTutor, type ReviewTutorItem } from '../ReviewTutor'
import { ReviewBreakdown, stepToReview } from './ReviewBreakdown'
import './PreviousTestReview.css'

/**
 * "Review last test with Bit" — available on every lesson page. If the learner
 * has taken this lesson's quiz before, this opens a panel showing their last
 * run's questions plus the Socratic AI tutor (in review mode, so it can explain)
 * so they can revisit what they missed before diving back in.
 */
export function PreviousTestReview({
  lessonId,
  lessonTitle,
}: {
  lessonId: string
  lessonTitle: string
}) {
  const { getLessonProgress } = useProgress()
  const [open, setOpen] = useState(false)

  const review = getLessonProgress(lessonId)?.lastReview
  if (!review || review.steps.length === 0) return null

  const missed = new Set(review.missedStepIds)
  const reviews = review.steps.map((s) => stepToReview(s, missed.has(s.id)))

  const tutorItems: ReviewTutorItem[] = review.steps
    .filter(
      (s) =>
        (s.targetVariables && s.targetVariables.length > 0) || !!s.assessment,
    )
    .map((s) => ({ s, missed: missed.has(s.id) }))
    .sort((a, b) => Number(b.missed) - Number(a.missed))
    .map(({ s, missed: m }, i) => ({
      label: `Q${i + 1}${m ? ' · missed' : ''}`,
      context: {
        prompt: s.prompt,
        code: s.code,
        concept: s.conceptTags?.join(' · ') || lessonTitle,
        hint: s.hints?.[0] ?? s.feedback?.incorrect ?? '',
        answered: true,
      },
    }))

  return (
    <>
      <button
        type="button"
        className="btn ghost sm lp-review-prev"
        onClick={() => setOpen(true)}
      >
        Review last test
      </button>

      {open && (
        <div
          className="prevtest-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Review your last test on ${lessonTitle}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="prevtest-modal">
            <div className="prevtest-head">
              <h2 className="prevtest-title">Last test · {lessonTitle}</h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="prevtest-sub">
              Here&rsquo;s your last run. Ask Bit anything about a question — it can
              explain the answer now that the test is done.
            </p>
            {tutorItems.length > 0 ? (
              <div className="review-grid">
                <ReviewBreakdown reviews={reviews} />
                <ReviewTutor items={tutorItems} />
              </div>
            ) : (
              <ReviewBreakdown reviews={reviews} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
