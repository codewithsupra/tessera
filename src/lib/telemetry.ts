import { insforge } from './insforge'

/**
 * First-party product analytics and error reports. No third-party trackers.
 * Events are batched and sent best-effort; if the network is down they are dropped
 * (analytics must never compete with the user's own data for bandwidth or storage).
 */
export type EventName =
  | 'signed_up'
  | 'signed_in'
  | 'guest_started'
  | 'guest_saved'
  | 'page_created'
  | 'workspace_created'
  | 'invite_created'
  | 'invite_accepted'
  | 'export_downloaded'
  | 'demo_interacted'
  | 'landing_viewed'

type Props = Record<string, string | number | boolean | null>
type Sender = {
  events: (rows: { name: EventName; props: Props }[]) => Promise<unknown>
  error: (row: { message: string; stack: string | null; url: string | null; user_agent: string | null }) => Promise<unknown>
}

const defaultSender: Sender = {
  events: async (rows) => {
    await insforge.database.from('app_events').insert(rows)
  },
  error: async (row) => {
    await insforge.database.from('client_errors').insert([row])
  },
}

let sender: Sender = defaultSender
/** Tests swap in a fake sender. */
export function setTelemetrySender(s: Sender | null) {
  sender = s ?? defaultSender
}

const queue: { name: EventName; props: Props }[] = []
let timer: ReturnType<typeof setTimeout> | null = null
const FLUSH_MS = 2000
const MAX_QUEUE = 50

export function track(name: EventName, props: Props = {}): void {
  if (queue.length >= MAX_QUEUE) return
  queue.push({ name, props })
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS)
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!queue.length) return
  const batch = queue.splice(0, queue.length)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  try {
    await sender.events(batch)
  } catch {
    // best effort
  }
}

// ---- Errors -----------------------------------------------------------------

const MAX_ERRORS_PER_SESSION = 10
const seen = new Set<string>()
let reported = 0

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null)

/** Reports an error once per distinct message+location, at most 10 per session. */
export function reportError(err: unknown, context?: string): void {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err) ?? 'Unknown error')
  const message = (context ? `[${context}] ` : '') + (e.message || e.name || 'Error')
  const where = e.stack?.split('\n').slice(0, 2).join('|') ?? ''
  const key = `${message}::${where}`
  if (seen.has(key) || reported >= MAX_ERRORS_PER_SESSION) return
  seen.add(key)
  reported++
  void sender
    .error({
      message: clip(message, 1000)!,
      stack: clip(e.stack, 4000),
      url: typeof location === 'undefined' ? null : clip(location.pathname, 500),
      user_agent: typeof navigator === 'undefined' ? null : clip(navigator.userAgent, 300),
    })
    .catch(() => {})
}

/** Catch what nothing else catches. Call once at startup. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window'))
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'promise'))
  window.addEventListener('pagehide', () => void flush())
}

/** Test helper. */
export function resetTelemetry() {
  queue.length = 0
  seen.clear()
  reported = 0
  if (timer) clearTimeout(timer)
  timer = null
}
