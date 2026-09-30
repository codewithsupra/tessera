import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { insforge } from '../lib/insforge'
import { AuthContext, type AuthUser, type OAuthProvider } from './context'
import { setDataScope } from '../data/scope'
import { track } from '../lib/telemetry'
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
    insforge.auth.getCurrentUser().then(({ data, error }) => {
      if (cancelled) return
      const next = resolveSession({ user: toUser(data?.user as SdkUser), error }, readCachedUser())
      // Offline fallback keeps the cache; only a definitive server answer rewrites it.
      if (isUnreachable(error) && !data?.user) showUser(next)
      else setUser(next)
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

  const signOut = useCallback(async () => {
    await insforge.auth.signOut()
    setUser(null)
  }, [setUser])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithOAuth, signOut }),
    [user, loading, signIn, signUp, signInWithOAuth, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
