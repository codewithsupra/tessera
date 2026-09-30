import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { withNext } from '../auth/next'
import { Logo } from '../components/Logo'
import { acceptInvite } from '../data/workspaces'
import { track } from '../lib/telemetry'
import { refreshWorkspaces, switchWorkspace } from '../sync/workspaceActions'

const route = getRouteApi('/invite/$token')

export function InvitePage() {
  const { token } = route.useParams()
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const here = `/invite/${token}`

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const ws = await acceptInvite(token)
        track('invite_accepted')
        await refreshWorkspaces(user.id)
        if (cancelled) return
        switchWorkspace(user.id, ws)
        await navigate({ to: '/app', replace: true })
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user, token, navigate])

  async function switchAccount() {
    await signOut()
    window.location.assign(withNext('/signin', here))
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link to="/" aria-label="Tessera home">
        <Logo />
      </Link>
      <main className="mt-14 w-full max-w-[420px] text-center">
        {loading ? null : !user ? (
          <>
            <h1 className="font-display text-3xl font-medium tracking-tight">You’re invited to a workspace</h1>
            <p className="mt-3 text-ink-soft">Sign in with the email address the invite was sent to. New to Tessera? Create an account with that address.</p>
            <div className="mt-7 flex justify-center gap-3">
              <a href={withNext('/signup', here)} className="rounded-md bg-lapis px-4 py-2.5 text-[15px] font-medium text-plaster hover:opacity-90">
                Create account
              </a>
              <a href={withNext('/signin', here)} className="rounded-md border border-line px-4 py-2.5 text-[15px] font-medium hover:bg-surface">
                Sign in
              </a>
            </div>
          </>
        ) : error ? (
          <>
            <h1 className="font-display text-3xl font-medium tracking-tight">Couldn’t join</h1>
            <p role="alert" className="mt-3 text-ink-soft">{error}</p>
            <p className="mt-2 text-sm text-ink-faint">Signed in as {user.email}</p>
            <div className="mt-7 flex justify-center gap-3">
              <Link to="/app" className="rounded-md border border-line px-4 py-2.5 text-[15px] font-medium hover:bg-surface">
                Go to my workspace
              </Link>
              <button onClick={switchAccount} className="rounded-md px-4 py-2.5 text-[15px] font-medium text-lapis hover:underline">
                Use another account
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-medium tracking-tight">Joining the workspace…</h1>
            <p className="mt-3 text-ink-soft" aria-busy="true">One moment.</p>
          </>
        )}
      </main>
    </div>
  )
}
