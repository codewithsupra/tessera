import type { AuthUser } from './context'

/**
 * Local-first means the app must open offline. We remember the last signed-in user
 * (id/email/name only — never tokens) and fall back to it when the auth server is
 * unreachable. A definitive answer from the server (a user, or "no session") always wins.
 */
const KEY = 'tessera:last-user'

export type SessionCheck = {
  user: AuthUser | null
  error: { statusCode?: number } | null
}

export function isUnreachable(error: SessionCheck['error']): boolean {
  if (!error) return false
  const code = error.statusCode ?? 0
  return code === 0 || code === 408 || code >= 500
}

export function resolveSession(check: SessionCheck, cached: AuthUser | null): AuthUser | null {
  if (check.user) return check.user
  if (isUnreachable(check.error)) return cached
  return null
}

/**
 * True if someone is signed in on this device (the last known user, cleared on sign-out) or
 * we're returning from an OAuth provider. Everyone else skips the session check entirely:
 * no round-trip on the landing page and no 401 from a refresh that can't succeed.
 */
export function mightHaveSession(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return !!readCachedUser() || new URLSearchParams(search).has('insforge_code')
}

export function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const u = JSON.parse(raw) as Partial<AuthUser>
    return typeof u.id === 'string' && typeof u.email === 'string' ? { id: u.id, email: u.email, name: u.name } : null
  } catch {
    return null
  }
}

export function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify({ id: user.id, email: user.email, name: user.name }))
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable (private mode) — offline fallback just won't be available
  }
}
