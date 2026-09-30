import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// Locally, credentials come from the git-ignored env files; in CI, from repository secrets.
for (const f of ['.env.local', '.env.e2e.local']) if (existsSync(f)) process.loadEnvFile(f)

const PORT = 4190

export default defineConfig({
  testDir: 'e2e',
  // One live backend and shared test accounts: run serially for deterministic results.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
