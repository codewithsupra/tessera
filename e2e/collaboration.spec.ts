import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { api, editor, expectAccessible, owner, signIn, stranger } from './helpers'

/**
 * Two different people, two isolated browser contexts (separate cookies and storage):
 * invite link -> join -> live text + presence -> downgrade to viewer -> read-only editor.
 */
test('two people edit one page live, then the owner makes one a viewer', async ({ browser }) => {
  const ownerApi = await api(owner())
  const ownerId = (await ownerApi.auth.getCurrentUser()).data.user!.id
  const ws = (await ownerApi.database.rpc('create_workspace', { p_name: `E2E team ${Date.now()}` })).data as unknown as string
  const pageId = randomUUID()
  await ownerApi.database.from('pages').insert([{ id: pageId, workspace_id: ws, title: 'Shared plan' }])
  const token = randomBytes(32).toString('base64url')
  await ownerApi.database
    .from('workspace_invites')
    .insert([{ workspace_id: ws, email: stranger().email.toLowerCase(), role: 'editor', token_hash: createHash('sha256').update(token).digest('hex') }])

  const a = await browser.newContext()
  const b = await browser.newContext()
  try {
    const alice = await a.newPage()
    const bob = await b.newPage()

    // Bob opens the invite link while signed out, signs in, and lands in the workspace.
    await bob.goto(`/invite/${token}`)
    await expect(bob.getByRole('heading', { name: 'You’re invited to a workspace' })).toBeVisible()
    await expectAccessible(bob, 'invite (signed out)')
    await signIn(bob, stranger(), `/invite/${token}`)
    await bob.waitForURL('**/app')

    await signIn(alice, owner(), `/app/p/${pageId}`)
    await bob.goto(`/app/p/${pageId}`)
    await expect(alice.getByLabel('Page title')).toHaveValue('Shared plan')
    await expect(bob.getByLabel('Page title')).toHaveValue('Shared plan')

    // Live text both ways, with presence.
    await editor(alice).click()
    await alice.keyboard.type('Alice was here. ')
    await expect(editor(bob)).toContainText('Alice was here.')
    await editor(bob).click()
    await bob.keyboard.press('End')
    await bob.keyboard.type('Bob too.')
    await expect(editor(alice)).toContainText('Bob too.')
    await expect(alice.getByRole('list', { name: /Also here/ })).toBeVisible()
    await expectAccessible(alice, 'shared page')

    // The owner downgrades Bob; on his next load the editor is read-only.
    const bobId = (await (await api(stranger())).auth.getCurrentUser()).data.user!.id
    await ownerApi.database.from('workspace_members').update({ role: 'viewer' }).eq('workspace_id', ws).eq('user_id', bobId)
    await bob.reload()
    await expect(bob.getByText('View only')).toBeVisible()
    await expect(editor(bob)).toHaveAttribute('contenteditable', 'false')
    await expect(bob.getByLabel('Page title')).toHaveAttribute('readonly', '')
  } finally {
    await a.close()
    await b.close()
    await ownerApi.database.from('workspaces').delete().eq('id', ws).eq('owner_id', ownerId)
  }
})
