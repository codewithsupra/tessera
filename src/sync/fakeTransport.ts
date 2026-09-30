import * as Y from 'yjs'
import { fromB64, toB64 } from './base64'
import { TransportError, type DocEvents, type DocState, type DocTransport, type StoredUpdate } from './transport'

/**
 * In-memory backend with the same contract as InsForge: durable append, then broadcast.
 * Knobs let tests go offline, drop broadcasts, and send updates by id only.
 */
export class FakeServer {
  pages = new Set<string>()
  updates = new Map<string, StoredUpdate[]>()
  snapshots = new Map<string, { data: string; version: number }>()
  private subs = new Map<string, Set<{ client: FakeClient; events: DocEvents }>>()
  private nextId = 1
  appendCount = 0
  /** Per-client count of broadcasts to drop, simulating lost realtime messages. */
  dropFor = new Map<string, number>()
  /** Announce updates by id only (like y-fetch for large payloads). */
  announceByIdOnly = false

  client(name: string): FakeClient {
    return new FakeClient(this, name)
  }

  load(pageId: string): DocState {
    return { snapshot: this.snapshots.get(pageId) ?? null, updates: [...(this.updates.get(pageId) ?? [])] }
  }

  append(pageId: string, data: string): { id: number } {
    if (!this.pages.has(pageId)) throw new TransportError('page not found', 'missing-page')
    const row = { id: this.nextId++, data }
    this.updates.set(pageId, [...(this.updates.get(pageId) ?? []), row])
    this.appendCount++
    for (const s of this.subs.get(pageId) ?? []) {
      if (!s.client.online) continue
      const drops = this.dropFor.get(s.client.name) ?? 0
      if (drops > 0) {
        this.dropFor.set(s.client.name, drops - 1)
        continue
      }
      const msg = this.announceByIdOnly ? { id: row.id } : row
      queueMicrotask(() => s.events.onUpdate(msg))
    }
    return { id: row.id }
  }

  subscribe(pageId: string, client: FakeClient, events: DocEvents) {
    const set = this.subs.get(pageId) ?? new Set()
    const entry = { client, events }
    set.add(entry)
    this.subs.set(pageId, set)
    return () => set.delete(entry)
  }

  broadcastAwareness(pageId: string, from: FakeClient, data: string) {
    for (const s of this.subs.get(pageId) ?? []) {
      if (s.client !== from && s.client.online) queueMicrotask(() => s.events.onAwareness(data))
    }
  }

  compact(pageId: string) {
    const { snapshot, updates } = this.load(pageId)
    const parts = [...(snapshot ? [fromB64(snapshot.data)] : []), ...updates.map((u) => fromB64(u.data))]
    if (!parts.length) return
    const merged = toB64(Y.mergeUpdates(parts))
    this.snapshots.set(pageId, { data: merged, version: (snapshot?.version ?? 0) + 1 })
    const ids = new Set(updates.map((u) => u.id))
    this.updates.set(pageId, (this.updates.get(pageId) ?? []).filter((u) => !ids.has(u.id)))
  }
}

export class FakeClient implements DocTransport {
  online = true
  compactionRequests = 0
  private readonly server: FakeServer
  readonly name: string

  constructor(server: FakeServer, name: string) {
    this.server = server
    this.name = name
  }

  private guard() {
    if (!this.online) throw new TransportError('offline', 'offline')
  }

  async load(pageId: string) {
    this.guard()
    return this.server.load(pageId)
  }
  async fetchUpdate(pageId: string, id: number) {
    this.guard()
    return this.server.updates.get(pageId)?.find((u) => u.id === id) ?? null
  }
  async append(pageId: string, data: string) {
    this.guard()
    return this.server.append(pageId, data)
  }
  async subscribe(pageId: string, events: DocEvents) {
    this.guard()
    return this.server.subscribe(pageId, this, events)
  }
  async publishAwareness(pageId: string, data: string) {
    this.guard()
    this.server.broadcastAwareness(pageId, this, data)
  }
  requestCompaction() {
    this.compactionRequests++
  }
}
