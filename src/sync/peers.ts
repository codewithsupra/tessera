export type Peer = { key: string; name: string; color: string }

/** Other people on this page, one entry per user (a user may have several tabs open). */
export function peersFrom(states: Map<number, Record<string, unknown>>, selfClientId: number, selfUserId?: string): Peer[] {
  const byUser = new Map<string, Peer>()
  for (const [clientId, state] of states) {
    const user = state.user as { name?: string; color?: string; id?: string } | undefined
    if (clientId === selfClientId || !user?.name) continue
    const key = user.id ?? `client-${clientId}`
    if (key === selfUserId) continue
    if (!byUser.has(key)) byUser.set(key, { key, name: user.name, color: user.color ?? '#737d8f' })
  }
  return [...byUser.values()]
}
