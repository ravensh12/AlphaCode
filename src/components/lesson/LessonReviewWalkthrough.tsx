import { useEffect, useState } from 'react'
import type { LessonStep } from '../../types/lesson'
import { CodePanel } from './CodePanel'
import { VisualDiagram } from './VisualDiagram'
import { IconArrowLeft, IconArrowRight } from '../icons'
import './LessonReviewWalkthrough.css'

/**
 * Read-only walkthrough of a lesson's teaching slides, shown when a learner
 * asks to review (per-miss) or is forced to retake after 3 consecutive misses.
 * It intentionally records NO progress or evidence — it only re-presents the
 * teaching content, then hands control back so the quiz can resume (review) or
 * restart from the top (retake). Grading and persistence stay entirely in the
 * quiz LessonRound the caller re-mounts afterwards.
 */
export function LessonReviewWalkthrough({
  steps,
  title,
  mode,
  onDone,
}: {
  steps: LessonStep[]
  title: string
  mode: 'review' | 'retake'
  onDone: () => void
}) {
  const [index, setIndex] = useState(0)

  // Nothing to review (e.g. a retention-only mission) — hand control straight
  // back instead of showing an empty screen.
  useEffect(() => {
    if (steps.length === 0) onDone()
  }, [steps.length, onDone])

  if (steps.length === 0) return null

  const safeIndex = Math.min(index, steps.length - 1)
  const step = steps[safeIndex]
  const isFirst = safeIndex === 0
  const isLast = safeIndex >= steps.length - 1
  const diagram = step.diagram ?? step.diagramSequence?.[0]

  const finishLabel =
    mode === 'retake' ? 'Start the quiz again' : 'Back to the quiz'

  function handleNext() {
    if (isLast) {
      onDone()
      return
    }
    setIndex((value) => Math.min(value + 1, steps.length - 1))
  }

  return (
    <div className="lesson-review-walkthrough">
      <div
        className={`lesson-review-head ${
          mode === 'retake' ? 'is-retake' : 'is-review'
        }`}
        role="status"
      >
        <span className="lesson-review-eyebrow">
          {mode === 'retake' ? 'Lesson retake' : 'Lesson review'}
        </span>
        <p className="lesson-review-head-copy">
          {mode === 'retake'
            ? "Let's walk back through the lesson, then take the quiz again."
            : 'Review the lesson, then head back to pick up where you left off.'}
        </p>
      </div>

      <div className="lesson-review-slide" key={step.id}>
        {step.phaseLabel && (
          <span className="lesson-review-phase">
            {step.phaseLabel}
            <span className="lesson-review-count">
              {' '}
              · {safeIndex + 1}/{steps.length}
            </span>
          </span>
        )}
        <h2 className="lesson-review-title">{step.hook ?? title}</h2>
        {diagram && (
          <div className="lesson-review-diagram">
            <VisualDiagram diagram={diagram} animated />
          </div>
        )}
        {step.code.length > 0 && (
          <CodePanel
            code={step.code}
            currentLineIndex={step.currentLineIndex}
            animated
          />
        )}
        {step.prompt && <p className="lesson-review-prompt-text">{step.prompt}</p>}
        {step.bullets && step.bullets.length > 0 && (
          <ul className="lesson-review-bullets">
            {step.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
        {step.callout && (
          <div className="lesson-review-callout" role="note">
            {step.callout}
          </div>
        )}
      </div>

      <div className="lesson-review-nav">
        <button
          type="button"
          className="btn ghost lg"
          disabled={isFirst}
          onClick={() => setIndex((value) => Math.max(value - 1, 0))}
        >
          <IconArrowLeft size={18} />
          Previous
        </button>
        <button
          type="button"
          className="btn lg lesson-review-next"
          onClick={handleNext}
        >
          {isLast ? finishLabel : 'Next'}
          {!isLast && <IconArrowRight size={18} />}
        </button>
      </div>
    </div>
  )
}
