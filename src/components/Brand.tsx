import { Link } from 'react-router-dom'
import './Brand.css'

export function Brand({
  to = '/',
  onNavigate,
}: {
  to?: string
  onNavigate?: () => void
}) {
  return (
    <Link
      to={to}
      className="brand"
      aria-label="AlphaCode intro"
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault()
          onNavigate()
        }
      }}
    >
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-caret">&gt;_</span>
      </span>
      <span className="brand-word">
        Alpha<span className="brand-word-accent">Code</span>
      </span>
    </Link>
  )
}
