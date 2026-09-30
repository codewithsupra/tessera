/** Where to go after signing in: an in-app path from ?next=, never another origin. */
export function safeNext(search: string = typeof window === 'undefined' ? '' : window.location.search, fallback = '/app'): string {
  const next = new URLSearchParams(search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    const url = new URL(next, 'https://tessera.invalid')
    if (url.origin !== 'https://tessera.invalid') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

export const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(next)}`

const PENDING = 'tessera:after-oauth'

/** OAuth always returns to /app (the allow-listed redirect); remember where to continue. */
export function rememberNext(next: string) {
  try {
    if (next !== '/app') sessionStorage.setItem(PENDING, next)
  } catch {
    // storage unavailable: the user lands on /app instead
  }
}

/** The remembered destination (validated again), consumed once. */
export function takeRememberedNext(): string | null {
  try {
    const next = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    if (!next) return null
    const safe = safeNext(`?next=${encodeURIComponent(next)}`, '')
    return safe || null
  } catch {
    return null
  }
}
