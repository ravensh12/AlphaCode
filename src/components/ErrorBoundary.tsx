import { Component, type ErrorInfo, type ReactNode } from 'react'

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
    console.error('[CodeTracer] render error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 420, padding: 30 }}>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Something broke</h1>
          <p className="muted" style={{ marginBottom: 18, fontSize: 15 }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button className="btn" onClick={() => window.location.assign('/')}>
            Reload Code Tracer
          </button>
        </div>
      </div>
    )
  }
}
