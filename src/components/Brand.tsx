import { Link } from 'react-router-dom'
import './Brand.css'

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Code Tracer home">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-caret">&gt;_</span>
      </span>
      <span className="brand-word">
        Code<span className="brand-word-accent">Tracer</span>
      </span>
    </Link>
  )
}
