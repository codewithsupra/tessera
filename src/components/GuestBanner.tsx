import { Link } from '@tanstack/react-router'
import { useAuth } from '../auth/context'

/** Shown to guests: what a guest workspace is, and the way to keep it. */
export function GuestBanner() {
  const { isGuest } = useAuth()
  if (!isGuest) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-lapis-soft px-4 py-2 text-center text-sm text-ink" role="region" aria-label="Guest workspace">
      <span>You’re exploring as a guest. This workspace is deleted after 7 days unless you save it.</span>
      <Link to="/save" className="rounded-md bg-ink px-3 py-1 text-xs font-semibold text-plaster hover:opacity-90">
        Save my workspace
      </Link>
    </div>
  )
}
