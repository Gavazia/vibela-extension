/**
 * Playwright configuration for Vibela extension E2E regression tests.
 *
 * Key constraints:
 * - headless: false  — Chrome extensions cannot run in headless mode
 * - workers: 1       — persistent extension contexts don't parallelize safely
 * - single chromium-extension project  — only Chromium supports Chrome extensions
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  // Keep retries off in regression suites to surface failures clearly.
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    // Extensions REQUIRE non-headless Chromium.
    headless: false,
    // Fixed viewport so coordinate-based clicks (bolita, panel) are deterministic.
    viewport: { width: 1280, height: 720 },
    // Capture screenshots and traces on failure for easier debugging.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
