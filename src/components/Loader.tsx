import './Loader.css'

export function Loader({
  label = 'Loading',
  night = true,
}: {
  label?: string
  /** Dark Code City UI (default). Pass `night={false}` for the light theme. */
  night?: boolean
}) {
  return (
    <div className={`loader${night ? ' loader--night' : ''}`} role="status" aria-live="polite">
      <div className="loader-mark" aria-hidden="true">
        <span className="loader-caret">&gt;_</span>
      </div>
      <div className="loader-bar" aria-hidden="true">
        <span className="loader-bar-fill" />
      </div>
      <span className="loader-label">{label}</span>
    </div>
  )
}
