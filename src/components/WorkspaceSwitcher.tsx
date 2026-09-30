import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Download, LogOut, Plus, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { createWorkspace, removeMember, type Role } from '../data/workspaces'
import { runWorkspaceExport } from '../export/actions'
import { useSyncStore } from '../sync/syncStore'
import { useUiStore } from '../data/uiStore'
import { refreshWorkspaces, switchWorkspace } from '../sync/workspaceActions'
import { MembersDialog } from './MembersDialog'
import { Modal } from './Modal'
import { toast } from './toastStore'
import { track } from '../lib/telemetry'
import { fieldCls, primaryBtn, quietBtn } from './ui'

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' }

export function WorkspaceSwitcher() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const workspaces = useSyncStore((s) => s.workspaces)
  const activeId = useSyncStore((s) => s.workspaceId)
  const role = useSyncStore((s) => s.role)
  const active = workspaces.find((w) => w.id === activeId)
  const [open, setOpen] = useState(false)
  const dialog = useUiStore((s) => s.dialog)
  const setDialog = useUiStore((s) => s.setDialog)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (!user) return null

  function choose(id: string) {
    setOpen(false)
    if (id !== activeId) {
      switchWorkspace(user!.id, id)
      void navigate({ to: '/app' })
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${active?.name ?? 'Personal'}. Switch workspace`}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-line/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{active?.name ?? 'Personal'}</span>
          <span className="block truncate text-xs text-ink-faint">{active?.isPersonal === false ? ROLE_LABEL[role] : 'Just you'}</span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-ink-faint" aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_rgba(29,43,69,0.16)]">
          <p className="px-2.5 pb-1 pt-1.5 text-xs text-ink-faint">Workspaces</p>
          {workspaces.map((w) => (
            <button key={w.id} role="menuitemradio" aria-checked={w.id === activeId} onClick={() => choose(w.id)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-plaster-deep">
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === activeId && <Check size={14} className="text-lapis" aria-hidden="true" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          {active && !active.isPersonal && (
            <button role="menuitem" onClick={() => (setOpen(false), setDialog('members'))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-plaster-deep">
              <Users size={14} aria-hidden="true" /> {role === 'owner' ? 'Members & invites' : 'Members'}
            </button>
          )}
          {active && (
            <button role="menuitem" onClick={() => (setOpen(false), void runWorkspaceExport(active.id, active.name))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-plaster-deep">
              <Download size={14} aria-hidden="true" /> Export as Markdown
            </button>
          )}
          <button role="menuitem" onClick={() => (setOpen(false), setDialog('create'))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-plaster-deep">
            <Plus size={14} aria-hidden="true" /> New team workspace
          </button>
          {active && !active.isPersonal && role !== 'owner' && (
            <button role="menuitem" onClick={() => (setOpen(false), setDialog('leave'))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-danger hover:bg-plaster-deep">
              <LogOut size={14} aria-hidden="true" /> Leave workspace
            </button>
          )}
        </div>
      )}

      <CreateWorkspaceDialog open={dialog === 'create'} onClose={() => setDialog(null)} onCreated={(id) => choose(id)} />
      {active && !active.isPersonal && <MembersDialog open={dialog === 'members'} onClose={() => setDialog(null)} workspace={active} />}
      {active && !active.isPersonal && (
        <LeaveDialog open={dialog === 'leave'} onClose={() => setDialog(null)} workspaceId={active.id} name={active.name} />
      )}
    </div>
  )
}

function CreateWorkspaceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Give the workspace a name.')
    setBusy(true)
    setError(null)
    try {
      const id = await createWorkspace(name)
      track('workspace_created')
      toast.success(`Created ${name.trim()}`)
      await refreshWorkspaces(user!.id)
      setName('')
      onClose()
      onCreated(id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New team workspace">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink-soft">A shared space for pages you write with other people. You can invite them next.</p>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Name
          <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Design team" data-autofocus />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={quietBtn}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Creating…' : 'Create workspace'}</button>
        </div>
      </form>
    </Modal>
  )
}

function LeaveDialog({ open, onClose, workspaceId, name }: { open: boolean; onClose: () => void; workspaceId: string; name: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await removeMember(workspaceId, user!.id)
      toast.info(`You left ${name}`)
      await refreshWorkspaces(user!.id) // falls back to Personal
      onClose()
      await navigate({ to: '/app' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Leave ${name}?`}>
      <p className="text-sm text-ink-soft">You’ll lose access to its pages. The owner can invite you again later.</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={quietBtn}>Stay</button>
        <button onClick={leave} disabled={busy} className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-plaster hover:opacity-90 disabled:opacity-60">
          {busy ? 'Leaving…' : 'Leave workspace'}
        </button>
      </div>
    </Modal>
  )
}
