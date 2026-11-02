import { defineConfig, devices } from '@playwright/test'

// The journey runs against a production build of the app. Each step mocks or
// reaches the API as it says; from v1 the journey runs against the real server.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    cwd: '../frontend',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    // Sign-in is mocked at the API: build without Clerk even if a local key is set.
    env: { VITE_CLERK_PUBLISHABLE_KEY: '' },
    timeout: 120_000,
  },
})
