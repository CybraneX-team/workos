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
      command: 'npm run dev',
      cwd: '../startup_digital_twin_backend',
      url: `${backendURL}/healthz`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(backendPort),
        RUN_WORKER: process.env.RUN_WORKER ?? 'false',
      },
    },
    {
      command: `npm run dev -- --host ${frontendHost} --port ${frontendPort}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_URL: backendURL,
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
