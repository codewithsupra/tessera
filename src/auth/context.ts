import { createContext, useContext } from 'react'

export type AuthUser = { id: string; email: string; name?: string }
export type OAuthProvider = 'google' | 'github'
export type AuthResult = { error: string | null }

export type AuthValue = {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>
  signInWithOAuth: (provider: OAuthProvider) => Promise<AuthResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
