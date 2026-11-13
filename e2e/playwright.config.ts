import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3310;
/** API output is captured here and scanned for personal data after the run (plan §4). */
const API_LOG = new URL('./logs/api.log', import.meta.url).pathname;
const WEB_PORT = 4173;
const adminUrl = new URL(
  process.env.E2E_DATABASE_ADMIN_URL ??
    'postgres://scoresphere:scoresphere@localhost:55432/postgres',
);
adminUrl.pathname = '/scoresphere_e2e';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Phones are the primary target (plan §1).
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      command: `mkdir -p "$(dirname '${API_LOG}')" && node dist/main.js > '${API_LOG}' 2>&1`,
      cwd: '../apps/api',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: adminUrl.toString(),
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
        RATE_LIMIT_ENABLED: 'false',
        LOG_LEVEL: 'info',
        STORAGE_DIR: '.storage-e2e',
        PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      cwd: '../apps/client',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
