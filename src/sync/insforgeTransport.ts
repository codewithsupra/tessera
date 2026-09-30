import { insforge } from '../lib/insforge'
import { channels } from './realtimeChannels'
import { TransportError, classifyError, isChannel, type DbError, type DocEvents, type DocState, type DocTransport, type StoredUpdate } from './transport'

function raise(error: DbError, op: 'read' | 'append'): never {
  throw new TransportError(error?.message ?? 'request failed', classifyError(error, op))
}

const PAGE_SIZE = 1000

export const insforgeTransport: DocTransport = {
  async load(pageId): Promise<DocState> {
    const snap = await insforge.database.from('doc_snapshots').select('data, version').eq('page_id', pageId).maybeSingle()
    if (snap.error) raise(snap.error, 'read')
    const updates: StoredUpdate[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = await insforge.database
        .from('doc_updates')
        .select('id, data')
        .eq('page_id', pageId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (page.error) raise(page.error, 'read')
      updates.push(...(page.data as StoredUpdate[]))
      if (page.data.length < PAGE_SIZE) break
    }
    return { snapshot: (snap.data as DocState['snapshot']) ?? null, updates }
  },

  async fetchUpdate(pageId, id) {
    const r = await insforge.database.from('doc_updates').select('id, data').eq('page_id', pageId).eq('id', id).maybeSingle()
    if (r.error) raise(r.error, 'read')
    return (r.data as StoredUpdate | null) ?? null
  },

  async append(pageId, data) {
    const r = await insforge.database.from('doc_updates').insert([{ page_id: pageId, data }]).select('id').single()
    if (r.error) raise(r.error, 'append')
    return { id: (r.data as { id: number }).id }
  },

  async subscribe(pageId, events: DocEvents) {
    const channel = `doc:${pageId}`
    const mine = (m: { meta?: { channel?: string } }) => isChannel(m.meta, channel)
    const onUpdate = (m: { meta?: { channel?: string }; id: number; u: string }) => mine(m) && events.onUpdate({ id: m.id, data: m.u })
    const onFetch = (m: { meta?: { channel?: string }; id: number }) => mine(m) && events.onUpdate({ id: m.id })
    const onAwareness = (m: { meta?: { channel?: string }; a: string }) => mine(m) && events.onAwareness(m.a)
    const onLeave = (m: { meta?: { channel?: string }; member?: { type?: string; presenceId?: string } }) => {
      if (mine(m) && m.member?.type === 'user' && m.member.presenceId) events.onPeerLeft?.(m.member.presenceId)
    }
    let wasDisconnected = false
    const onDisconnect = () => {
      wasDisconnected = true
    }
    // The SDK resubscribes channels itself; we only need to reload what we missed.
    const onConnect = () => {
      if (wasDisconnected) {
        wasDisconnected = false
        events.onReconnect?.()
      }
    }

    insforge.realtime.on('y-update', onUpdate)
    insforge.realtime.on('y-fetch', onFetch)
    insforge.realtime.on('y-awareness', onAwareness)
    insforge.realtime.on('presence:leave', onLeave)
    insforge.realtime.on('disconnect', onDisconnect)
    insforge.realtime.on('connect', onConnect)
    const cleanup = () => {
      insforge.realtime.off('y-update', onUpdate)
      insforge.realtime.off('y-fetch', onFetch)
      insforge.realtime.off('y-awareness', onAwareness)
      insforge.realtime.off('presence:leave', onLeave)
      insforge.realtime.off('disconnect', onDisconnect)
      insforge.realtime.off('connect', onConnect)
      release?.()
    }

    const res = await channels.join(channel)
    const release = res.release
    if (!res.ok) {
      cleanup()
      const code = res.error?.code ?? ''
      throw new TransportError(res.error?.message ?? 'subscribe failed', /authori/i.test(res.error?.message ?? '') ? 'missing-page' : code ? 'offline' : 'unknown')
    }
    return cleanup
  },

  async publishAwareness(pageId, data) {
    await insforge.realtime.publish(`doc:${pageId}`, 'y-awareness', { a: data })
  },

  requestCompaction(pageId) {
    void insforge.functions.invoke('compact-doc', { body: { pageId } }).catch(() => {})
  },
}
