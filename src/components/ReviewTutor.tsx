import { useState } from 'react'
import { AiTutorPanel } from './final/AiTutorPanel'
import type { TutorContext } from '../lib/aiTutor'
import './ReviewTutor.css'

export type ReviewTutorItem = {
  /** Short label shown in the question picker, e.g. "Q3 · Hash Maps". */
  label: string
  context: TutorContext
}

/**
 * A review-mode "Ask Bit" helper. Shows the Socratic AI tutor (in answered/review
 * mode, so it may fully explain) with a picker to choose WHICH question you want
 * help with. Mounted on every quiz/test review surface.
 */
export function ReviewTutor({
  items,
  heading = 'Ask Bit about your answers',
}: {
  items: ReviewTutorItem[]
  heading?: string
}) {
  const [idx, setIdx] = useState(0)
  if (items.length === 0) return null
  const safe = Math.min(idx, items.length - 1)

  return (
    <div className="review-tutor">
      <div className="review-tutor-head">
        <h3 className="review-tutor-title">{heading}</h3>
        {items.length > 1 && (
          <label className="review-tutor-pick">
            <span>Question</span>
            <select
              value={safe}
              onChange={(e) => setIdx(Number(e.target.value))}
              aria-label="Pick which question to ask Bit about"
            >
              {items.map((it, i) => (
                <option key={i} value={i}>
                  {it.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <AiTutorPanel context={items[safe].context} />
    </div>
  )
}
