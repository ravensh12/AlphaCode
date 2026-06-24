import type { DragEvent } from 'react'

export function AnswerTiles({
  tiles,
  disabled,
  selectedValue,
  selectedValues,
  onPick,
}: {
  tiles: (number | string)[]
  disabled: boolean
  /** Highlight the tile matching this value (single-choice). */
  selectedValue?: string | null
  /** Highlight tiles matching any of these values (multi-fill). */
  selectedValues?: string[]
  onPick: (value: string) => void
}) {
  function handleDragStart(e: DragEvent<HTMLButtonElement>, value: string) {
    e.dataTransfer.setData('text/plain', value)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const isText = tiles.some((t) => typeof t === 'string' && String(t).length > 2)
  const picked = selectedValue?.trim() ?? ''
  const pickedSet = new Set(
    (selectedValues ?? []).map((v) => v.trim()).filter(Boolean),
  )

  return (
    <div className="answer-tiles" aria-label="Answer tiles">
      {tiles.map((value, i) => {
        const str = String(value)
        const isSelected =
          (picked.length > 0 && picked === str) ||
          (pickedSet.size > 0 && pickedSet.has(str))
        return (
          <button
            key={`${value}-${i}`}
            type="button"
            className={`answer-tile ${isText ? 'text-tile' : ''} ${isSelected ? 'selected' : ''}`}
            draggable={!disabled}
            disabled={disabled}
            aria-pressed={isSelected}
            onDragStart={(e) => handleDragStart(e, str)}
            onClick={() => onPick(str)}
          >
            {value}
          </button>
        )
      })}
    </div>
  )
}

export function AnswerChoiceSlot({ value }: { value: string }) {
  const filled = value.trim().length > 0
  return (
    <div
      className={`answer-choice-slot ${filled ? 'filled' : 'empty'}`}
      aria-live="polite"
      aria-label={filled ? `Your answer: ${value}` : 'No answer selected yet'}
    >
      <span className="answer-choice-label">Your answer</span>
      <span className="answer-choice-value">{filled ? value : 'Tap a choice below'}</span>
    </div>
  )
}
