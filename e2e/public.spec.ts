import { expect, test } from '@playwright/test'
import { expectAccessible } from './helpers'

test.describe('public pages', () => {
  test('landing page is accessible and explains the product', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your notes stay yours/)
    await expect(page.getByRole('button', { name: 'Try it now — no sign-up' })).toBeVisible()
    await expectAccessible(page, 'landing')
  })

  test('the CRDT demo merges edits made while a device was offline', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { name: /Cut the network/ }).scrollIntoViewIfNeeded()
    const ada = page.getByLabel('Ada’s laptop — editable demo note')
    const leo = page.getByLabel('Leo’s phone — editable demo note')
    await expect(ada).toContainText('Launch checklist')
    await expect(leo).toContainText('Launch checklist')

    // Leo goes offline and both keep typing.
    await page.getByRole('button', { name: 'Go offline' }).nth(1).click()
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible()
    await leo.locator('p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' book venue')
    await ada.locator('p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' send invites')
    await expect(ada).not.toContainText('book venue')
    await expect(leo).not.toContainText('send invites')

    // Reconnect: both sides end up identical and contain both edits.
    await page.getByRole('button', { name: 'Reconnect' }).click()
    await expect(page.getByText(/reconnected and merged/)).toBeVisible()
    for (const side of [ada, leo]) {
      await expect(side).toContainText('book venue')
      await expect(side).toContainText('send invites')
    }
    expect(await ada.innerText()).toBe(await leo.innerText())
    await expectAccessible(page, 'landing with demo')
  })

  test('engineering write-up is accessible', async ({ page }) => {
    await page.goto('/engineering')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How Tessera stays fast, offline and in sync/)
    await expect(page.getByRole('img', { name: 'Tessera architecture' })).toBeVisible()
    await expectAccessible(page, 'engineering')
  })

  test('unknown URLs show a helpful 404', async ({ page }) => {
    await page.goto('/this/does/not/exist')
    await expect(page.getByRole('heading', { name: 'This page doesn’t exist' })).toBeVisible()
    await expectAccessible(page, '404')
  })

  test('sign-in page is accessible and validates input', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.')
    await expectAccessible(page, 'signin')
  })
})
