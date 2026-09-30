import { setDataScope } from '../data/scope'
import { newInviteToken, sha256Hex } from '../data/workspaces'
import { functionErrorMessage } from '../lib/functionError'
import { insforge } from '../lib/insforge'
import { flush as flushTelemetry, reportError, track } from '../lib/telemetry'
import { flushPendingChanges } from '../sync/flushPending'
import { deleteGuestLocalData, writeGuest } from './guest'
import { writeCachedUser } from './session'

export type SaveStep = 'syncing' | 'creating' | 'moving' | 'done'
export type SaveResult = { ok: true } | { ok: false; error: string; retryToken?: string }

/** Step 4 alone, so a failed move can be retried without signing up again. */
export async function redeemClaim(token: string, guestId: string): Promise<SaveResult> {
  const r = await insforge.functions.invoke('claim-guest', { body: { token } })
  if (r.error || (r.data as { ok?: boolean })?.ok !== true) {
    return { ok: false, error: functionErrorMessage(r.error, 'Couldn’t move your guest workspace.'), retryToken: token }
  }
  writeGuest(null)
  setDataScope(null) // close the guest's databases so they can be deleted
  await deleteGuestLocalData(guestId)
  track('guest_saved')
  await flushTelemetry()
  return { ok: true }
}

/**
 * Turns the signed-in guest into a real account without losing anything:
 * 1. push local changes, 2. create a single-use claim as the guest, 3. sign up,
 * 4. the server moves the guest's workspaces to the new account and deletes the guest.
 */
export async function saveGuestWorkspace(
  guestId: string,
  form: { name: string; email: string; password: string },
  onStep: (s: SaveStep) => void,
): Promise<SaveResult> {
  onStep('syncing')
  const flushed = await flushPendingChanges()
  if (!flushed.ok) {
    reportError(new Error(flushed.reason), 'guest-save-flush')
    return { ok: false, error: 'Couldn’t sync your latest changes. Check your connection and try again.' }
  }

  const token = newInviteToken()
  const claim = await insforge.database.from('guest_claims').insert([{ token_hash: await sha256Hex(token) }])
  if (claim.error) return { ok: false, error: 'Couldn’t start saving your workspace. Please try again.' }

  onStep('creating')
  const up = await insforge.auth.signUp({ email: form.email.trim(), password: form.password, name: form.name.trim() })
  if (up.error) return { ok: false, error: up.error.message }
  if (!up.data?.accessToken) return { ok: false, error: 'Check your email to confirm your account, then sign in.' }
  const user = up.data.user as { id: string; email: string; profile?: { name?: string } }
  writeCachedUser({ id: user.id, email: user.email, name: user.profile?.name ?? form.name.trim() })
  track('signed_up', { method: 'guest_save' })

  onStep('moving')
  const moved = await redeemClaim(token, guestId)
  if (moved.ok) onStep('done')
  return moved
}
