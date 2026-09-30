/**
 * Guest accounts are ordinary accounts with a reserved email shape and a random password,
 * remembered on this device so a reload returns to the same guest workspace.
 * The server recognizes the same shape (public.is_guest_email) for claims and cleanup.
 */
export const GUEST_DOMAIN = 'guest.tessera-notes.app'
const KEY = 'tessera:guest'
const GUEST_RE = /^guest-[0-9a-f-]{36}@guest\.tessera-notes\.app$/

export type GuestCredentials = { email: string; password: string }

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && GUEST_RE.test(email.toLowerCase())
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newGuestCredentials(): GuestCredentials {
  return { email: `guest-${crypto.randomUUID()}@${GUEST_DOMAIN}`, password: `G-${randomHex(24)}` }
}

export function readGuest(): GuestCredentials | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as Partial<GuestCredentials>
    return typeof g.email === 'string' && typeof g.password === 'string' && isGuestEmail(g.email) ? { email: g.email, password: g.password } : null
  } catch {
    return null
  }
}

export function writeGuest(g: GuestCredentials | null): void {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g))
    else localStorage.removeItem(KEY)
  } catch {
    // Without storage a guest simply can't come back after closing the tab.
  }
}

/** Removes a saved-or-abandoned guest's on-device databases. */
export async function deleteGuestLocalData(guestId: string): Promise<void> {
  const names = [`tessera-${guestId}`]
  try {
    const all = (await indexedDB.databases?.()) ?? []
    for (const d of all) if (d.name?.startsWith(`tessera-doc-${guestId}-`)) names.push(d.name)
  } catch {
    // databases() unsupported: the main DB is still removed
  }
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        }),
    ),
  )
}
