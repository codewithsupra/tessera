import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { EditorContent, useEditor } from '@tiptap/react'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { RotateCcw, Wifi, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { contentExtensions, contentSchema } from '../editor/extensions'
import { track } from '../lib/telemetry'
import { toB64 } from '../sync/base64'
import { DocSync } from '../sync/DocSync'
import { FakeServer, type FakeClient } from '../sync/fakeTransport'

/**
 * The real sync engine (DocSync), running in the visitor's browser against an in-memory
 * server. Two devices edit one document; either can go offline; reconnecting merges.
 */
type DeviceSpec = { id: 'ada' | 'leo'; name: string; label: string; color: string }
const DEVICES: DeviceSpec[] = [
  { id: 'ada', name: 'Ada', label: 'Ada’s laptop', color: '#2F6FDB' },
  { id: 'leo', name: 'Leo', label: 'Leo’s phone', color: '#C2410C' },
]
const PAGE = 'demo'

type Device = DeviceSpec & { doc: Y.Doc; sync: DocSync; client: FakeClient }
type World = { server: FakeServer; devices: Device[] }

function makeWorld(): World {
  const server = new FakeServer()
  server.pages.add(PAGE)
  const seed = new Y.Doc()
  prosemirrorJSONToYXmlFragment(
    contentSchema(),
    {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Ada and Leo are both editing this note. Turn one of them offline, type on both sides, then reconnect.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Launch checklist: ' }] },
      ],
    },
    seed.getXmlFragment('content'),
  )
  server.append(PAGE, toB64(Y.encodeStateAsUpdate(seed)))
  const devices = DEVICES.map((spec) => {
    const doc = new Y.Doc()
    const client = server.client(spec.id)
    const sync = new DocSync({ transport: client, pageId: PAGE, doc, flushDelayMs: 80 })
    sync.awareness.setLocalStateField('user', { name: spec.name, color: spec.color, id: spec.id })
    void sync.start()
    return { ...spec, doc, sync, client }
  })
  return { server, devices }
}

function DeviceCard({ device, online, pending, onToggle, onInteract }: { device: Device; online: boolean; pending: number; onToggle: () => void; onInteract: () => void }) {
  const editor = useEditor({
    extensions: [
      ...contentExtensions,
      Collaboration.configure({ document: device.doc, field: 'content' }),
      CollaborationCaret.configure({ provider: device.sync, user: { name: device.name, color: device.color } }),
    ],
    editorProps: { attributes: { class: 'tessera-prose demo-prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': `${device.label} — editable demo note` } },
  })

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: device.color }} aria-hidden="true" />
        <span className="font-medium text-ink">{device.label}</span>
        <span className={`ml-auto text-xs ${online ? 'text-ink-faint' : 'text-warn'}`} role="status">
          {online ? 'Synced' : pending ? `Offline · ${pending} ${pending === 1 ? 'edit' : 'edits'} waiting` : 'Offline'}
        </span>
        <button
          onClick={onToggle}
          aria-pressed={!online}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${online ? 'border-line text-ink-soft hover:text-ink' : 'border-warn text-warn'}`}
        >
          {online ? <WifiOff size={13} aria-hidden="true" /> : <Wifi size={13} aria-hidden="true" />}
          {online ? 'Go offline' : 'Reconnect'}
        </button>
      </div>
      <div className="min-h-[170px] px-4 py-3 text-[15px]" onKeyDown={onInteract} onPointerDown={onInteract}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

export function CrdtDemo() {
  const [world, setWorld] = useState<World>(() => makeWorld())
  const [online, setOnline] = useState<Record<string, boolean>>({ ada: true, leo: true })
  const [pending, setPending] = useState<Record<string, number>>({ ada: 0, leo: 0 })
  const [lag, setLag] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const interacted = useRef(false)

  const note = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 5)), [])
  const onInteract = useCallback(() => {
    if (interacted.current) return
    interacted.current = true
    track('demo_interacted')
  }, [])

  // Count edits made while a device is offline.
  useEffect(() => {
    const offs = world.devices.map((d) => {
      const onUpdate = (_u: Uint8Array, origin: unknown) => {
        if (origin !== d.sync && !d.client.online) setPending((p) => ({ ...p, [d.id]: p[d.id] + 1 }))
      }
      d.doc.on('update', onUpdate)
      return () => d.doc.off('update', onUpdate)
    })
    return () => offs.forEach((off) => off())
  }, [world])

  useEffect(() => {
    world.server.setLatency(lag)
  }, [world, lag])

  useEffect(() => () => world.devices.forEach((d) => void d.sync.destroy()), [world])

  async function toggle(d: Device) {
    onInteract()
    if (d.client.online) {
      d.client.setOnline(false)
      setOnline((o) => ({ ...o, [d.id]: false }))
      note(`${d.label} went offline — its edits stay on the device.`)
      return
    }
    d.client.setOnline(true)
    setOnline((o) => ({ ...o, [d.id]: true }))
    const edits = pending[d.id]
    await d.sync.resync()
    // The other device reloads too, in case it missed broadcasts while this one was away.
    await Promise.all(world.devices.filter((o) => o !== d && o.client.online).map((o) => o.sync.resync()))
    setPending((p) => ({ ...p, [d.id]: 0 }))
    note(edits ? `${d.label} reconnected and merged ${edits} ${edits === 1 ? 'edit' : 'edits'} — no conflicts.` : `${d.label} is back online.`)
  }

  function reset() {
    world.devices.forEach((d) => void d.sync.destroy())
    setWorld(makeWorld())
    setOnline({ ada: true, leo: true })
    setPending({ ada: 0, leo: 0 })
    setLog([])
  }

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row">
        {world.devices.map((d) => (
          <DeviceCard key={d.doc.guid} device={d} online={online[d.id]} pending={pending[d.id]} onToggle={() => void toggle(d)} onInteract={onInteract} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-soft">
        <label className="flex items-center gap-3">
          Network lag
          <input type="range" min={0} max={1500} step={100} value={lag} onChange={(e) => setLag(Number(e.target.value))} className="w-36 accent-[var(--lapis)]" aria-valuetext={`${lag} milliseconds`} />
          <span className="w-16 tabular-nums text-ink">{lag} ms</span>
        </label>
        <button onClick={reset} className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-plaster-deep hover:text-ink">
          <RotateCcw size={14} aria-hidden="true" /> Reset demo
        </button>
      </div>
      <ul className="mt-4 min-h-[5.5rem] space-y-1 text-sm" aria-live="polite" aria-label="What just happened">
        {log.length === 0 ? (
          <li className="text-ink-faint">Try it: take Leo offline, type in both notes, then reconnect.</li>
        ) : (
          log.map((line, i) => (
            <li key={`${i}-${line}`} className={i === 0 ? 'text-ink' : 'text-ink-faint'}>
              {line}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
