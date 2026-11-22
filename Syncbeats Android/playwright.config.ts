import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 60_000, fullyParallel: false,
  use: { baseURL: 'http://localhost:8083', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run web -- --port 8083', url: 'http://localhost:8083', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
