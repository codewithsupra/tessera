import { insforge } from '../lib/insforge'
import { channels } from './realtimeChannels'
import type { PagesApi, RemotePage } from './pagesSync'
import { isChannel } from './transport'

const PAGE_SIZE = 500
const COLUMNS = 'id, workspace_id, parent_id, title, icon, kind, sort_order, properties, created_at, updated_at, deleted_at, server_updated_at'

export const insforgePagesApi: PagesApi = {
  async pull(workspaceId, since) {
    const out: RemotePage[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      let q = insforge.database.from('pages').select(COLUMNS).eq('workspace_id', workspaceId)
      if (since) q = q.gte('server_updated_at', since)
      const { data, error } = await q.order('server_updated_at', { ascending: true }).range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      out.push(...(data as RemotePage[]))
      if (data.length < PAGE_SIZE) break
    }
    return out
  },

  async push(rows) {
    // Stale rows (older updated_at) are dropped server-side by the LWW trigger.
    const { error } = await insforge.database.from('pages').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  },

  async subscribe(workspaceId, onPage, onReconnect) {
    const channel = `ws:${workspaceId}`
    const handler = (m: RemotePage & { meta?: { channel?: string } }) => {
      if (!isChannel(m.meta, channel)) return
      const { meta: _meta, ...row } = m
      onPage(row as RemotePage)
    }
    let dropped = false
    const onDisconnect = () => {
      dropped = true
    }
    const onConnect = () => {
      if (!dropped) return
      dropped = false
      onReconnect()
    }
    insforge.realtime.on('page', handler)
    insforge.realtime.on('disconnect', onDisconnect)
    insforge.realtime.on('connect', onConnect)
    const cleanup = () => {
      insforge.realtime.off('page', handler)
      insforge.realtime.off('disconnect', onDisconnect)
      insforge.realtime.off('connect', onConnect)
      release?.()
    }
    const res = await channels.join(channel)
    const release = res.release
    if (!res.ok) {
      cleanup()
      throw new Error(res.error?.message ?? 'subscribe failed')
    }
    return cleanup
  },
}
