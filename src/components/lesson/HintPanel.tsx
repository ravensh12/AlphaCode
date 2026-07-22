import { useState } from 'react'

export function HintPanel({
  hints,
  autoReveal = 0,
  disabled = false,
  disabledMessage = 'Hints unlock after your first attempt.',
  onReveal,
}: {
  hints: string[]
  /** Hints revealed automatically (e.g. hint 1 after first mistake). */
  autoReveal?: number
  disabled?: boolean
  disabledMessage?: string
  /** Called only when the learner manually reveals a new hint. */
  onReveal?: (hintIndex: number) => void
}) {
  const [manualRevealed, setManualRevealed] = useState(0)
  const revealed = Math.min(hints.length, Math.max(manualRevealed, autoReveal))

  if (!hints.length) return null

  return (
    <div className="hint-panel">
      <div className="hint-panel-head">
        <span className="hint-panel-title">Hints</span>
        <button
          type="button"
          className="hint-panel-btn"
          disabled={disabled || revealed >= hints.length}
          onClick={() => {
            const nextRevealed = Math.min(revealed + 1, hints.length)
            if (nextRevealed <= revealed) return
            setManualRevealed(nextRevealed)
            onReveal?.(nextRevealed - 1)
          }}
        >
          {disabled
            ? disabledMessage
            : revealed >= hints.length
            ? 'All hints shown'
            : `Show hint ${revealed + 1}`}
        </button>
      </div>
      {revealed > 0 && (
        <ul className="hint-list">
          {hints.slice(0, revealed).map((text, i) => (
            <li key={i} className="hint-item">
              <span className="hint-item-num">Hint {i + 1}:</span>
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
