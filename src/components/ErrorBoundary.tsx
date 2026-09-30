import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/telemetry'

type Props = { children: ReactNode; label?: string; fullPage?: boolean }
type State = { error: Error | null }

/** Catches render errors, reports them, and offers a way back instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, this.props.label ?? 'render')
    if (import.meta.env.DEV) console.error(error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className={`flex flex-col items-center justify-center px-6 text-center ${this.props.fullPage ? 'min-h-dvh' : 'py-24'}`}>
        <h1 className="font-display text-2xl font-medium">Something went wrong here</h1>
        <p className="mt-2 max-w-sm text-ink-soft">Your notes are safe — they’re saved on this device and synced separately. We’ve logged the problem.</p>
        <div className="mt-6 flex gap-3">
          <button onClick={this.reset} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-plaster hover:opacity-90">
            Try again
          </button>
          <button onClick={() => window.location.assign('/app')} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-surface">
            Go to my workspace
          </button>
        </div>
      </div>
    )
  }
}
