import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { insforge } from '../lib/insforge'
import { AuthContext, type AuthUser, type OAuthProvider } from './context'
import { setDataScope } from '../data/scope'
import { track } from '../lib/telemetry'
import { isGuestEmail, newGuestCredentials, readGuest, writeGuest } from './guest'
import { rememberNext } from './next'
import { isUnreachable, readCachedUser, resolveSession, writeCachedUser } from './session'

type SdkUser = { id: string; email: string; profile?: { name?: string } | null } | null | undefined

function toUser(u: SdkUser): AuthUser | null {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.profile?.name ?? undefined }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Storage is scoped before the user's data can render.
  const showUser = useCallback((u: AuthUser | null) => {
    if (u) setDataScope(u.id)
    setUserState(u)
  }, [])

  const setUser = useCallback(
    (u: AuthUser | null) => {
      writeCachedUser(u)
      showUser(u)
    },
    [showUser],
  )

  useEffect(() => {
    let cancelled = false
    insforge.auth.getCurrentUser().then(async ({ data, error }) => {
      if (cancelled) return
      const next = resolveSession({ user: toUser(data?.user as SdkUser), error }, readCachedUser())
      // Offline fallback keeps the cache; only a definitive server answer rewrites it.
      if (isUnreachable(error) && !data?.user) {
        showUser(next)
      } else if (!next && readGuest()) {
        // A guest's session lapsed: quietly sign back in to the same guest workspace.
        const g = readGuest()!
        const res = await insforge.auth.signInWithPassword(g)
        if (cancelled) return
        setUser(res.error ? null : toUser(res.data?.user as SdkUser))
        if (res.error) writeGuest(null)
      } else {
        setUser(next)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [setUser, showUser])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    setUser(toUser(data?.user as SdkUser))
    track('signed_in', { method: 'password' })
    return { error: null }
  }, [setUser])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await insforge.auth.signUp({ email, password, name })
    if (error) return { error: error.message }
    if (!data?.accessToken) return { error: 'Check your email to confirm your account, then sign in.' }
    setUser(toUser(data.user as SdkUser))
    track('signed_up', { method: 'password' })
    return { error: null }
  }, [setUser])

  const signInWithOAuth = useCallback(async (provider: OAuthProvider, next = '/app') => {
    rememberNext(next)
    const { error } = await insforge.auth.signInWithOAuth(provider, {
      redirectTo: `${window.location.origin}/app`,
    })
    return { error: error ? error.message : null }
  }, [])

  const startGuest = useCallback(async () => {
    const existing = readGuest()
    if (existing) {
      const res = await insforge.auth.signInWithPassword(existing)
      if (!res.error) {
        setUser(toUser(res.data?.user as SdkUser))
        return { error: null }
      }
      writeGuest(null) // expired and cleaned up; start a fresh guest
    }
    const g = newGuestCredentials()
    const { data, error } = await insforge.auth.signUp({ ...g, name: 'Guest' })
    if (error) return { error: error.message }
    if (!data?.accessToken) return { error: 'Guest workspaces are unavailable right now. Please sign up instead.' }
    writeGuest(g)
    setUser(toUser(data.user as SdkUser))
    track('guest_started')
    return { error: null }
  }, [setUser])

  const signOut = useCallback(async () => {
    await insforge.auth.signOut()
    setUser(null)
  }, [setUser])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithOAuth, signOut, isGuest: isGuestEmail(user?.email), startGuest }),
    [user, loading, signIn, signUp, signInWithOAuth, signOut, startGuest],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
