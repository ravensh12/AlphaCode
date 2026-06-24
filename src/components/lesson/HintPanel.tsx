import { useState } from 'react'

export function HintPanel({
  hints,
  autoReveal = 0,
}: {
  hints: string[]
  /** Hints revealed automatically (e.g. hint 1 after first mistake). */
  autoReveal?: number
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
          disabled={revealed >= hints.length}
          onClick={() => setManualRevealed((n) => Math.min(n + 1, hints.length))}
        >
          {revealed >= hints.length
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
