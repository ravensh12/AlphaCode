import type { DragEvent } from 'react'

export function AnswerTiles({
  tiles,
  disabled,
  onPick,
}: {
  tiles: number[]
  disabled: boolean
  onPick: (value: string) => void
}) {
  function handleDragStart(e: DragEvent<HTMLButtonElement>, value: number) {
    e.dataTransfer.setData('text/plain', String(value))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="answer-tiles" aria-label="Number tiles">
      {tiles.map((value, i) => (
        <button
          key={`${value}-${i}`}
          type="button"
          className="answer-tile"
          draggable={!disabled}
          disabled={disabled}
          onDragStart={(e) => handleDragStart(e, value)}
          onClick={() => onPick(String(value))}
        >
          {value}
        </button>
      ))}
    </div>
  )
}
