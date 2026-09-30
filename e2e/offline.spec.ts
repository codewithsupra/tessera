import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { api, editor, owner, signIn } from './helpers'

/** A laptop goes offline, both devices keep writing, and everything merges on reconnect. */
test('offline edits merge after reconnecting', async ({ browser }) => {
  const c = await api(owner())
  const ws = (await c.database.rpc('ensure_personal_workspace')).data as unknown as string
  const pageId = randomUUID()
  await c.database.from('pages').insert([{ id: pageId, workspace_id: ws, title: 'Offline test' }])

  const laptopCtx = await browser.newContext()
  const phoneCtx = await browser.newContext()
  try {
    const laptop = await laptopCtx.newPage()
    const phone = await phoneCtx.newPage()
    await signIn(laptop, owner(), `/app/p/${pageId}`)
    await signIn(phone, owner(), `/app/p/${pageId}`)
    await expect(laptop.getByLabel('Page title')).toHaveValue('Offline test')
    await expect(phone.getByLabel('Page title')).toHaveValue('Offline test')

    await laptopCtx.setOffline(true)
    await expect(laptop.getByRole('status').filter({ hasText: /Offline/ })).toBeVisible()
    await editor(laptop).click()
    await laptop.keyboard.type('Written on the train. ')
    await editor(phone).click()
    await phone.keyboard.type('Written on the phone. ')
    await expect(editor(phone)).not.toContainText('train')

    // The laptop reloads while still offline: the app and the edit are still there.
    await laptop.reload()
    await expect(editor(laptop)).toContainText('Written on the train.')

    await laptopCtx.setOffline(false)
    for (const p of [laptop, phone]) {
      await expect(editor(p)).toContainText('Written on the train.', { timeout: 30_000 })
      await expect(editor(p)).toContainText('Written on the phone.', { timeout: 30_000 })
    }
    // Same document on both (compare paragraphs: the editor also shows the other device's live cursor label).
    const paragraphs = (p: typeof laptop) =>
      editor(p).evaluate((root) => {
        const copy = root.cloneNode(true) as HTMLElement
        copy.querySelectorAll('.collaboration-carets__caret').forEach((c) => c.remove())
        return [...copy.querySelectorAll('p')].map((el) => el.textContent)
      })
    expect(await paragraphs(laptop)).toEqual(await paragraphs(phone))
  } finally {
    await laptopCtx.close()
    await phoneCtx.close()
    await c.database.from('pages').update({ deleted_at: new Date().toISOString(), updated_at: new Date(Date.now() + 60_000).toISOString() }).eq('id', pageId)
  }
})
