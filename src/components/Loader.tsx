import './Loader.css'

export function Loader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
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
