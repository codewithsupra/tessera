import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { insforge } from '../lib/insforge'
import { AuthContext, type AuthUser, type OAuthProvider } from './context'

type SdkUser = { id: string; email: string; profile?: { name?: string } | null } | null | undefined

function toUser(u: SdkUser): AuthUser | null {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.profile?.name ?? undefined }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    insforge.auth.getCurrentUser().then(({ data, error }) => {
      if (cancelled) return
      setUser(error ? null : toUser(data?.user as SdkUser))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    setUser(toUser(data?.user as SdkUser))
    return { error: null }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await insforge.auth.signUp({ email, password, name })
    if (error) return { error: error.message }
    if (!data?.accessToken) return { error: 'Check your email to confirm your account, then sign in.' }
    setUser(toUser(data.user as SdkUser))
    return { error: null }
  }, [])

  const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
    const { error } = await insforge.auth.signInWithOAuth(provider, {
      redirectTo: `${window.location.origin}/app`,
    })
    return { error: error ? error.message : null }
  }, [])

  const signOut = useCallback(async () => {
    await insforge.auth.signOut()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithOAuth, signOut }),
    [user, loading, signIn, signUp, signInWithOAuth, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
