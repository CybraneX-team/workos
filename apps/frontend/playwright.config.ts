import { defineConfig, devices } from '@playwright/test';

const frontendHost = process.env.E2E_HOST ?? '127.0.0.1';
const frontendPort = process.env.E2E_PORT ?? '5173';
const backendPort = process.env.E2E_BACKEND_PORT ?? '8080';

const baseURL = process.env.E2E_BASE_URL ?? `http://${frontendHost}:${frontendPort}`;
const backendURL = process.env.E2E_BACKEND_URL ?? `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../backend',
      url: `${backendURL}/healthz`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(backendPort),
        RUN_WORKER: process.env.RUN_WORKER ?? 'false',
        ...(process.env.META_ADS_AUTHORING_E2E === '1' ? {
          META_AUTHORING_MODE: 'sandbox_only',
          META_AUTHORING_FAKE_META: 'true',
          META_AUTHORING_FAKE_GEMINI: 'true',
          META_AUTHORING_LAUNCH_ENABLED: 'true',
        } : {}),
      },
    },
    {
      command: `pnpm exec vite --force --host ${frontendHost} --port ${frontendPort}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_URL: backendURL,
        VITE_AGENTATION_ENABLED: 'false',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
