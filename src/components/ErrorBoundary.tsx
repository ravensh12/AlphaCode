import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

type Props = { children: ReactNode }
type State = { hasError: boolean; message?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected error',
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[AlphaCode] render error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-mark" aria-hidden="true">
            <span>&gt;_</span>
          </div>
          <h1>Something broke</h1>
          <p>The app hit an unexpected error. Reloading usually fixes it.</p>
          <button className="error-reload" onClick={() => window.location.assign('/')}>
            Reload AlphaCode
          </button>
        </div>
      </div>
    )
  }
}
