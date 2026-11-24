import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against a real dev server with fresh seed data.
 * The clock is pinned (APP_NOW = Fri 27 Nov 2026, 20:00 in Jakarta) so dates and
 * "nothing in the future" behave the same on every run. The tests share one database,
 * so they run one at a time.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:reset && npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DB_PATH: "data/e2e.db",
      APP_NOW: "2026-11-27T13:00:00Z",
    },
  },
});
