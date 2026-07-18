import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.META_ADS_CAMPAIGN_DEMO_FRONTEND_PORT ?? '5174';
const backendPort = process.env.META_ADS_CAMPAIGN_DEMO_BACKEND_PORT ?? '8082';
const baseURL = `http://127.0.0.1:${frontendPort}`;
const backendURL = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './e2e/meta-ads',
  testMatch: 'meta-ads-campaign-studio-demo.spec.ts',
  timeout: 30 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    headless: process.env.META_ADS_CAMPAIGN_DEMO_HEADLESS === '1',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: {
      slowMo: Number(process.env.META_ADS_CAMPAIGN_DEMO_SLOW_MO ?? 140),
    },
  },
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../backend',
      url: `${backendURL}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: backendPort,
        RUN_WORKER: 'false',
        META_SANDBOX_ALLOW_ANY_DEV_USER: 'true',
        META_AUTHORING_MODE: 'sandbox_only',
        META_AUTHORING_FAKE_META: 'true',
        META_AUTHORING_FAKE_GEMINI: 'true',
        META_AUTHORING_LAUNCH_ENABLED: 'true',
      },
    },
    {
      command: `pnpm exec vite --force --host 127.0.0.1 --port ${frontendPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_URL: backendURL,
        VITE_AGENTATION_ENABLED: 'false',
      },
    },
  ],
  projects: [{ name: 'campaign-studio-demo', use: { ...devices['Desktop Chrome'] } }],
});
