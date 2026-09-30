import base from './playwright.config'
import { defineConfig } from '@playwright/test'

/** README screenshots: `npx playwright test -c playwright.shots.config.ts` (not part of the test suite). */
export default defineConfig({
  ...base,
  testDir: 'scripts/shots',
  retries: 0,
  use: { ...base.use, viewport: { width: 1360, height: 820 }, deviceScaleFactor: 2 },
})
