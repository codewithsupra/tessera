import { insforge } from '../lib/insforge'

export type Role = 'owner' | 'editor' | 'viewer'
export type WorkspaceInfo = { id: string; name: string; isPersonal: boolean; role: Role }
export type Member = { userId: string; role: Role; name: string; email: string }
export type Invite = { id: string; email: string; role: Exclude<Role, 'owner'>; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }

export const canEdit = (role: Role | undefined) => role === 'owner' || role === 'editor'

/** Personal first, then teams alphabetically. */
export function sortWorkspaces(list: WorkspaceInfo[]): WorkspaceInfo[] {
  return [...list].sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name))
}

/** Workspaces the signed-in user belongs to, with their role in each. */
export async function fetchMyWorkspaces(): Promise<WorkspaceInfo[]> {
  const [ws, access] = await Promise.all([
    insforge.database.from('workspaces').select('id, name, is_personal'),
    insforge.database.from('workspace_access').select('workspace_id, role'),
  ])
  if (ws.error) throw new Error(ws.error.message)
  if (access.error) throw new Error(access.error.message)
  const roles = new Map((access.data as { workspace_id: string; role: Role }[]).map((a) => [a.workspace_id, a.role]))
  return sortWorkspaces(
    (ws.data as { id: string; name: string; is_personal: boolean }[])
      .filter((w) => roles.has(w.id))
      .map((w) => ({ id: w.id, name: w.name, isPersonal: w.is_personal, role: roles.get(w.id)! })),
  )
}

export async function createWorkspace(name: string): Promise<string> {
  const { data, error } = await insforge.database.rpc('create_workspace', { p_name: name })
  if (error) throw new Error(error.message)
  return data as unknown as string
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const { error } = await insforge.database.from('workspaces').update({ name: name.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await insforge.database.from('workspaces').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchMembers(workspaceId: string): Promise<Member[]> {
  const { data, error } = await insforge.database
    .from('workspace_members')
    .select('user_id, role, display_name, email')
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  const order: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 }
  return (data as { user_id: string; role: Role; display_name: string; email: string }[])
    .map((m) => ({ userId: m.user_id, role: m.role, name: m.display_name || m.email, email: m.email }))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name))
}

export async function setMemberRole(workspaceId: string, userId: string, role: Exclude<Role, 'owner'>): Promise<void> {
  const { data, error } = await insforge.database.from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', userId).select('role')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Only the owner can change roles.')
}

/** Removes a member (owner) or leaves (self). */
export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const { data, error } = await insforge.database.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId).select('user_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('That member can’t be removed.')
}

export async function fetchInvites(workspaceId: string): Promise<Invite[]> {
  const { data, error } = await insforge.database
    .from('workspace_invites')
    .select('id, email, role, expires_at, accepted_at, revoked_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as { id: string; email: string; role: Invite['role']; expires_at: string; accepted_at: string | null; revoked_at: string | null }[]).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expires_at,
    acceptedAt: i.accepted_at,
    revokedAt: i.revoked_at,
  }))
}

export function isPending(i: Invite, now = Date.now()): boolean {
  return !i.acceptedAt && !i.revokedAt && Date.parse(i.expiresAt) > now
}

/** 256-bit random token, URL-safe. Only its SHA-256 is stored; the link is shown once. */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const inviteUrl = (token: string, origin = window.location.origin) => `${origin}/invite/${token}`

export async function createInvite(workspaceId: string, email: string, role: Invite['role']): Promise<string> {
  const token = newInviteToken()
  const { error } = await insforge.database
    .from('workspace_invites')
    .insert([{ workspace_id: workspaceId, email: email.trim().toLowerCase(), role, token_hash: await sha256Hex(token) }])
  if (error) throw new Error(error.message)
  return token
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await insforge.database.from('workspace_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await insforge.database.rpc('accept_invite', { p_token: token })
  if (error) throw new Error(error.message)
  return data as unknown as string
}

/** Emails the link if the backend plan allows custom email. Returns false (never throws) otherwise. */
export async function emailInvite(to: string, workspaceName: string, inviterName: string, link: string): Promise<boolean> {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  try {
    const { error } = await insforge.emails.send({
      to,
      subject: `${inviterName} invited you to ${workspaceName} on Tessera`,
      from: 'Tessera',
      html: `<p>${esc(inviterName)} invited you to the <strong>${esc(workspaceName)}</strong> workspace on Tessera.</p><p><a href="${esc(link)}">Join ${esc(workspaceName)}</a></p><p>The link works once and expires in 7 days. Sign in with ${esc(to)} to accept.</p>`,
    })
    return !error
  } catch {
    return false
  }
}
