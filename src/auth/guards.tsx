import { Navigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useAuth } from './context'

function Splash() {
  return <div className="min-h-dvh" aria-busy="true" />
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  return user ? <Navigate to="/app" /> : <>{children}</>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  return user ? <>{children}</> : <Navigate to="/signin" />
}
