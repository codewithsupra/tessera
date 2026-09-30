import { Link } from '@tanstack/react-router'
import { Logo } from '../components/Logo'

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link to="/" aria-label="Tessera home">
        <Logo />
      </Link>
      <main className="mt-20 max-w-md text-center">
        <p className="font-display text-6xl font-medium text-ink-faint" aria-hidden="true">404</p>
        <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">This page doesn’t exist</h1>
        <p className="mt-3 text-ink-soft">The link may be mistyped, or the page was moved.</p>
        <div className="mt-7 flex justify-center gap-3">
          <Link to="/app" className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-plaster hover:opacity-90">
            Go to my workspace
          </Link>
          <Link to="/" className="rounded-md border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface">
            Home
          </Link>
        </div>
      </main>
    </div>
  )
}
