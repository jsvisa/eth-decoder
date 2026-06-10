import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start dev server only when not in CI (CI starts prod server separately)
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
        reuseExistingServer: true,
      },
});
