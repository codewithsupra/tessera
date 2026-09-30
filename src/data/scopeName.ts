/**
 * Whose on-device data is active. Deliberately dependency-free: the auth layer sets it on
 * every page (including the landing page) without pulling in Dexie or Yjs; the storage
 * modules follow it when they load.
 */
let current: string | null = null
const listeners = new Set<(userId: string | null) => void>()

export function getScopeUser(): string | null {
  return current
}

export function setScopeUser(userId: string | null): void {
  if (current === userId) return
  current = userId
  listeners.forEach((fn) => fn(userId))
}

export function onScopeChange(fn: (userId: string | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
