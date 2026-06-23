import type { DragEvent } from 'react'
import type { LessonStep } from '../../types/lesson'

export function VariableBoxes({
  step,
  boxValues,
  activeVar,
  errorVars,
  locked,
  onSetActive,
  onSetBox,
}: {
  step: LessonStep
  boxValues: Record<string, string>
  activeVar: string | null
  errorVars: string[]
  locked: boolean
  onSetActive: (v: string) => void
  onSetBox: (v: string, value: string) => void
}) {
  function handleDrop(e: DragEvent<HTMLDivElement>, varName: string) {
    e.preventDefault()
    if (locked) return
    const value = e.dataTransfer.getData('text/plain')
    if (value) onSetBox(varName, value)
  }

  return (
    <div className="var-boxes">
      {step.variables.map((v) => {
        const isTarget = step.targetVariables.includes(v)
        const error = errorVars.includes(v)
        const active = activeVar === v && isTarget && !locked

        if (!isTarget) {
          const given = String(step.expectedState[v] ?? '')
          return (
            <div className="var-box-wrap" key={v}>
              <span className="var-name">{v}</span>
              <div className="var-box given" aria-label={`${v} is ${given}`}>
                {given}
              </div>
              <span className="var-tag">given</span>
            </div>
          )
        }

        return (
          <div className="var-box-wrap" key={v}>
            <span className="var-name">{v}</span>
            <div
              className={`var-box target ${active ? 'active' : ''} ${
                error ? 'error' : ''
              } ${locked ? 'solved' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, v)}
            >
              <input
                className="var-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`value for ${v}`}
                placeholder="?"
                value={boxValues[v] ?? ''}
                disabled={locked}
                onFocus={() => onSetActive(v)}
                onChange={(e) =>
                  onSetBox(v, e.target.value.replace(/[^\d-]/g, ''))
                }
              />
            </div>
            <span className="var-tag">{locked ? 'set' : 'solve'}</span>
          </div>
        )
      })}
    </div>
  )
}
