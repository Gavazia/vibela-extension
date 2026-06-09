/**
 * Playwright fixture for the Vibela Chrome MV3 extension.
 *
 * Design notes:
 * - Serves fixture HTML files via a local HTTP server to avoid file:// access
 *   restrictions that can prevent content scripts from injecting on file:// pages.
 * - Launches a persistent Chromium context that loads the built extension from
 *   ./build/chrome-mv3 (the WXT build output — NOT .output/).
 * - Exposes `context`, `extensionId`, `serviceWorker`, and `fixtureBaseUrl`.
 *
 * Closed Shadow DOM constraint:
 *   `host.shadowRoot` returns null from JavaScript. Tests must work through
 *   the light-DOM host element, CDP service worker evaluation, and screenshots.
 */
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import type { Worker } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Resolve against cwd (project root) — avoids __dirname ESM/CJS ambiguity.
const EXTENSION_PATH = path.join(process.cwd(), 'build', 'chrome-mv3');
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures');

// ---------------------------------------------------------------------------
// Tiny static HTTP server for the fixtures/ directory.
// Needed because Chrome restricts extension content-script injection on
// file:// pages unless "Allow access to file URLs" is explicitly enabled.
// ---------------------------------------------------------------------------
interface FixtureServer {
  url: string;
  close: () => void;
}

function startFixtureServer(): Promise<FixtureServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const safeUrl = (req.url || '/').split('?')[0];
      const filePath = path.join(FIXTURES_DIR, safeUrl === '/' ? 'light.html' : safeUrl);
      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': contentTypes[ext] ?? 'application/octet-stream' });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.on('error', reject);

    // Port 0 → OS picks a free port.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Unexpected server address type'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------
type ExtensionFixtures = {
  /** Persistent browser context with the extension loaded. */
  context: BrowserContext;
  /** Chrome extension ID, extracted from the service worker URL. */
  extensionId: string;
  /** The MV3 service worker worker object. */
  serviceWorker: Worker;
  /** Base URL of the local fixture HTTP server (e.g. http://127.0.0.1:PORT). */
  fixtureBaseUrl: string;
};

// ---------------------------------------------------------------------------
// Extended test object
// ---------------------------------------------------------------------------
export const test = base.extend<ExtensionFixtures>({
  // Scoped to 'test' so the server restarts between tests (isolation).
  // If performance becomes a concern, bump to 'worker' scope.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      // Fixed viewport keeps coordinate-based assertions deterministic.
      viewport: { width: 1280, height: 720 },
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Suppress the Chrome automation infobar to avoid viewport shifts.
        '--disable-infobars',
        // Silence extension update nag dialogs.
        '--no-default-browser-check',
      ],
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    // The service worker may already be running when we reach this fixture.
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    // Service worker URL: chrome-extension://<id>/background.js
    const id = serviceWorker.url().split('/')[2];
    await use(id);
  },

  fixtureBaseUrl: async ({}, use) => {
    const server = await startFixtureServer();
    await use(server.url);
    server.close();
  },
});

export { expect } from '@playwright/test';
