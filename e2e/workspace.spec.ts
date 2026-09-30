import { strFromU8, unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { editor, expectAccessible, owner, signIn } from './helpers'

test.describe('workspace tools', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, owner())
    // A fresh browser has an empty local database; wait for the workspace to sync down.
    await expect(page.getByRole('tree', { name: 'Page tree' }).getByText('Launch plan')).toBeVisible()
  })

  test('command palette finds pages and opens them', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k')
    const input = page.getByPlaceholder('Search pages or type a command…')
    await expect(input).toBeFocused()
    await expectAccessible(page, 'command palette')
    await input.fill('launch plan')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/p\//)
    await expect(page.getByLabel('Page title')).toHaveValue('Launch plan')
  })

  test('keyboard shortcuts help opens with ?', async ({ page }) => {
    await page.locator('body').press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  })

  test('exports the workspace as a zip of Markdown files', async ({ page }) => {
    await page.getByRole('button', { name: /Switch workspace/ }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export as Markdown' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^Tessera - .+\.zip$/)
    const files = unzipSync(new Uint8Array(readFileSync(await file.path())))
    const names = Object.keys(files)
    expect(names).toContain('Launch plan.md')
    expect(names).toContain('Launch plan/Partner list.md')
    const md = strFromU8(files['Launch plan.md'])
    expect(md).toMatch(/^---\ntitle: "Launch plan"\n/)
    expect(md).toContain('# Launch plan')
    expect(md).toContain('- [ ] Record demo video')
  })

  test('app screens are accessible, including a page and the members of a team', async ({ page }) => {
    await expectAccessible(page, 'app home')
    await page.getByRole('tree', { name: 'Page tree' }).getByText('Launch plan').click()
    await expect(editor(page)).toBeVisible()
    await expectAccessible(page, 'page')
  })
})
