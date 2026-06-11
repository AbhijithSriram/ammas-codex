import { Component, type ReactNode } from 'react'

/* A last-resort guard so a single malformed row (e.g. an unexpected payload pulled from the
 * server) can never blank the whole app - it shows a recover prompt instead. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('App error boundary caught:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-frame">
          <div className="empty">
            <div className="empty-title disp">Something went sideways</div>
            <div className="empty-sub">A hiccup while rendering. Your data is safe on this device.</div>
            <button className="btn-primary" style={{ maxWidth: 220, marginTop: 8 }} onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
