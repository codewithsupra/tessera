import { Check, CloudOff, Download, Loader2, TriangleAlert } from 'lucide-react'
import { runPageExport } from '../export/actions'
import { useEffect, useState } from 'react'
import type { DocSync } from '../sync/DocSync'
import { initials } from '../sync/identity'
import { peersFrom, type Peer } from '../sync/peers'
import { summarizeStatus, useSyncStore } from '../sync/syncStore'

const LABEL = {
  synced: { text: 'Saved', icon: Check, cls: 'text-ink-faint' },
  saving: { text: 'Saving…', icon: Loader2, cls: 'text-ink-faint' },
  offline: { text: 'Offline · saved on this device', icon: CloudOff, cls: 'text-warn' },
  error: { text: 'Can’t sync this page', icon: TriangleAlert, cls: 'text-danger' },
} as const

export function PageStatusBar({ pageId, sync, selfId, readOnly }: { pageId: string; sync: DocSync; selfId?: string; readOnly?: boolean }) {
  const online = useSyncStore((s) => s.online)
  const pages = useSyncStore((s) => s.pages)
  const doc = useSyncStore((s) => s.docs[pageId])
  const status = summarizeStatus(online, pages, doc)
  const { text, icon: Icon, cls } = LABEL[status]

  const [peers, setPeers] = useState<Peer[]>([])
  useEffect(() => {
    const aw = sync.awareness
    const update = () => setPeers(peersFrom(aw.getStates(), aw.clientID, selfId))
    update()
    aw.on('change', update)
    return () => aw.off('change', update)
  }, [sync, selfId])

  return (
    <div className="flex h-8 items-center justify-end gap-3 text-xs">
      {peers.length > 0 && (
        <ul className="flex -space-x-1.5" aria-label={`Also here: ${peers.map((p) => p.name).join(', ')}`}>
          {peers.slice(0, 5).map((p) => (
            <li
              key={p.key}
              title={p.name}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-plaster"
              style={{ background: p.color }}
            >
              {initials(p.name)}
            </li>
          ))}
          {peers.length > 5 && <li className="flex h-6 items-center pl-2.5 text-ink-faint">+{peers.length - 5}</li>}
        </ul>
      )}
      {readOnly && <span className="rounded-full border border-line px-2 py-0.5 text-ink-soft">View only</span>}
      <button onClick={() => void runPageExport(pageId)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-faint hover:bg-plaster-deep hover:text-ink" title="Download this page as Markdown">
        <Download size={13} aria-hidden="true" /> Export
      </button>
      <span className={`flex items-center gap-1 ${cls}`} role="status" aria-live="polite">
        <Icon size={13} className={status === 'saving' ? 'animate-spin' : ''} aria-hidden="true" />
        {text}
      </span>
    </div>
  )
}
