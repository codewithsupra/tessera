import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import {
  createInvite,
  deleteWorkspace,
  emailInvite,
  fetchInvites,
  fetchMembers,
  inviteUrl,
  isPending,
  removeMember,
  revokeInvite,
  setMemberRole,
  type Invite,
  type Member,
  type WorkspaceInfo,
} from '../data/workspaces'
import { initials, colorFor } from '../sync/identity'
import { refreshWorkspaces } from '../sync/workspaceActions'
import { Modal } from './Modal'
import { toast } from './toastStore'
import { track } from '../lib/telemetry'
import { fieldCls, primaryBtn, quietBtn } from './ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function MembersDialog({ open, onClose, workspace }: { open: boolean; onClose: () => void; workspace: WorkspaceInfo }) {
  const { user } = useAuth()
  const isOwner = workspace.role === 'owner'
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)

  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const m = await fetchMembers(workspace.id)
        const inv = isOwner ? (await fetchInvites(workspace.id)).filter((i) => isPending(i)) : []
        if (cancelled) return
        setMembers(m)
        setInvites(inv)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, workspace.id, isOwner, version])

  async function act(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${workspace.name} members`} width={560}>
      {isOwner && <InviteForm workspace={workspace} onInvited={reload} />}

      <ul className="mt-5 divide-y divide-line" aria-label="Members">
        {members === null && <li className="py-3 text-sm text-ink-faint">Loading members…</li>}
        {members?.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: colorFor(m.userId) }} aria-hidden="true">
              {initials(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.name}
                {m.userId === user?.id && <span className="text-ink-faint"> (you)</span>}
              </span>
              <span className="block truncate text-xs text-ink-faint">{m.email}</span>
            </span>
            {m.role === 'owner' || !isOwner ? (
              <span className="text-sm text-ink-soft">{m.role === 'owner' ? 'Owner' : m.role === 'editor' ? 'Can edit' : 'Can view'}</span>
            ) : (
              <>
                <select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  onChange={(e) => act(() => setMemberRole(workspace.id, m.userId, e.target.value as 'editor' | 'viewer'))}
                  className="rounded-md border border-line bg-plaster px-2 py-1 text-sm"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button onClick={() => act(() => removeMember(workspace.id, m.userId))} className="rounded-md p-1.5 text-ink-faint hover:bg-plaster-deep hover:text-danger" aria-label={`Remove ${m.name}`} title="Remove from workspace">
                  <X size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {isOwner && invites.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium text-ink-soft">Pending invites</h3>
          <ul className="mt-1 divide-y divide-line" aria-label="Pending invites">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <span className="text-ink-faint">{i.role === 'editor' ? 'Can edit' : 'Can view'} · expires {new Date(i.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <button onClick={() => act(() => revokeInvite(i.id))} className="rounded-md px-2 py-1 text-ink-soft hover:bg-plaster-deep hover:text-danger">
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      {isOwner && <DangerZone workspace={workspace} onDeleted={onClose} />}
    </Modal>
  )
}

function InviteForm({ workspace, onInvited }: { workspace: WorkspaceInfo; onInvited: () => void }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ link: string; email: string; emailed: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const to = email.trim().toLowerCase()
    if (!EMAIL.test(to)) return setError('Enter the email address to invite.')
    if (to === user?.email.toLowerCase()) return setError('You’re already in this workspace.')
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const token = await createInvite(workspace.id, to, role)
      track('invite_created', { role })
      const link = inviteUrl(token)
      const emailed = await emailInvite(to, workspace.name, user?.name ?? user?.email ?? 'A teammate', link)
      setResult({ link, email: to, emailed })
      setEmail('')
      onInvited()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      toast.success('Invite link copied')
    } catch {
      setError('Couldn’t copy automatically — select the link and copy it.')
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap gap-2" noValidate>
        <input className={`${fieldCls} min-w-0 flex-[1_1_200px]`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email to invite" />
        <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} aria-label="Role" className="rounded-md border border-line bg-plaster px-2 text-sm">
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Inviting…' : 'Invite'}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      {result && (
        <div className="mt-3 rounded-lg border border-line bg-plaster p-3 text-sm" role="status">
          <p className="text-ink-soft">
            {result.emailed ? `We emailed ${result.email} an invite. You can also share this link:` : `Send this link to ${result.email}. It works once, for that email, for 7 days:`}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={result.link} onFocus={(e) => e.target.select()} className={`${fieldCls} font-mono text-xs`} aria-label="Invite link" />
            <button onClick={copy} className={`${quietBtn} flex shrink-0 items-center gap-1.5`}>
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DangerZone({ workspace, onDeleted }: { workspace: WorkspaceInfo; onDeleted: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    try {
      await deleteWorkspace(workspace.id)
      await refreshWorkspaces(user!.id)
      onDeleted()
      await navigate({ to: '/app' })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="text-sm font-medium text-danger hover:underline">
          Delete workspace…
        </button>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-ink-soft">
            This permanently deletes <strong>{workspace.name}</strong> and every page in it for everyone. Type the name to confirm.
          </p>
          <input className={fieldCls} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Workspace name to confirm" />
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirming(false)} className={quietBtn}>Cancel</button>
            <button onClick={remove} disabled={typed !== workspace.name} className="rounded-md bg-danger px-4 py-2 font-medium text-plaster disabled:opacity-40">
              Delete forever
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
