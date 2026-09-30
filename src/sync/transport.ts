/**
 * The narrow surface DocSync needs from the backend. The real implementation wraps
 * InsForge (insforgeTransport.ts); tests use an in-memory fake with failure injection.
 */
export type StoredUpdate = { id: number; data: string }

export type DocState = {
  snapshot: { data: string; version: number } | null
  updates: StoredUpdate[]
}

export type DocEvents = {
  /** A stored update, delivered inline (small) or by id only (large: fetch it). */
  onUpdate: (u: { id: number; data?: string }) => void
  onAwareness: (data: string) => void
  /** The realtime connection dropped and came back; anything may have been missed. */
  onReconnect?: () => void
  /** A user's last connection left the channel (tab closed, crashed, lost network). */
  onPeerLeft?: (userId: string) => void
}

export interface DocTransport {
  /** Snapshot plus every remaining update for the page, ascending by id. */
  load(pageId: string): Promise<DocState>
  fetchUpdate(pageId: string, id: number): Promise<StoredUpdate | null>
  /** Durably stores an update; the backend then broadcasts it to subscribers. */
  append(pageId: string, data: string): Promise<{ id: number }>
  subscribe(pageId: string, events: DocEvents): Promise<() => void>
  publishAwareness(pageId: string, data: string): Promise<void>
  /** Ask the backend to fold old updates into the snapshot. Best effort. */
  requestCompaction(pageId: string): void
}

/** 'offline' = retry later; 'missing-page' = page row not on the server yet; 'forbidden' = stop. */
export type TransportErrorKind = 'offline' | 'missing-page' | 'forbidden' | 'unknown'

export class TransportError extends Error {
  readonly kind: TransportErrorKind
  constructor(message: string, kind: TransportErrorKind) {
    super(message)
    this.kind = kind
  }
}

export type DbError = { code?: string; message?: string; statusCode?: number } | null

/** Maps PostgREST / network failures onto what DocSync should do next. */
export function classifyError(error: DbError, op: 'read' | 'append'): TransportErrorKind {
  if (!error) return 'unknown'
  const msg = (error.message ?? '').toLowerCase()
  if (!error.code && (error.statusCode === 0 || msg.includes('fetch') || msg.includes('network'))) return 'offline'
  // Appending to a page whose row hasn't been pushed yet fails the RLS check (the page is
  // unknown, so the caller "can't edit" it) or the FK. Both resolve once metadata syncs.
  if (op === 'append' && (error.code === '42501' || error.code === '23503')) return 'missing-page'
  if (error.code === '42501') return 'forbidden'
  if (error.code?.startsWith('08') || (error.statusCode ?? 0) >= 500) return 'offline'
  return 'unknown'
}

/**
 * Realtime messages report their channel as "realtime:<name>" (the docs show "<name>").
 * Compare through this so either form matches.
 */
export function isChannel(meta: { channel?: string } | undefined, channel: string): boolean {
  const c = meta?.channel
  return c === channel || c === `realtime:${channel}`
}
