import { expect, test, type Page } from '@playwright/test'
import { editor } from '../../e2e/helpers'

const out = (name: string) => `docs/screenshots/${name}.png`
const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))))

test('landing and live demo', async ({ page }) => {
  await page.goto('/')
  await settle(page)
  await page.screenshot({ path: out('landing') })
  const demo = page.locator('section[aria-labelledby="demo-heading"]')
  await demo.scrollIntoViewIfNeeded()
  await expect(demo.locator('.ProseMirror')).toHaveCount(2)
  // Show a real merge: Leo goes offline, both type, Leo reconnects.
  const [ada, leo] = [demo.locator('.ProseMirror').nth(0), demo.locator('.ProseMirror').nth(1)]
  await demo.getByRole('button', { name: /Go offline/ }).nth(1).click()
  await ada.locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type('ship the beta, ')
  await leo.locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type('record the demo video.')
  await demo.getByRole('button', { name: /Go online|Reconnect/ }).click()
  await expect(ada).toContainText('record the demo video.')
  await expect(leo).toContainText('ship the beta')
  await page.mouse.move(0, 0)
  await settle(page)
  await demo.screenshot({ path: out('crdt-demo') })
})

test('engineering write-up', async ({ page }) => {
  await page.goto('/engineering')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await settle(page)
  await page.screenshot({ path: out('engineering') })
})

// A fresh guest workspace shows exactly what a new visitor gets: the seeded sample pages.
// (Guests are removed by the daily janitor.)
test('editor (light and dark)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it now — no sign-up' }).click()
  await page.waitForURL('**/app')
  const tree = page.getByRole('tree', { name: 'Page tree' })
  await tree.getByText('Welcome to Tessera').click()
  await expect(editor(page)).toContainText('Try these')
  await expect(page.getByText('Synced', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.mouse.move(0, 0)
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await settle(page)
    await page.screenshot({ path: out(`editor-${theme}`) })
  }
})
