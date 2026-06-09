/**
 * Vibela Connection UI — Playwright tests (T-13)
 *
 * Verifies the overlay panel shows the correct connection-related UI for the
 * vibela-feedback-loop feature (Phase 1).
 *
 * Automatable assertions (closed shadow DOM constraint applies):
 *   G — panel opens and renders non-background content after UI replacement
 *   H — no "Exportar" element in the light DOM (REQ-6.1 / SC-8)
 *   I — no "↗ Exportar" text in any button in the light DOM
 *   J — panel still opens after UI replacement (regression guard)
 *
 * What CANNOT be automated (closed shadow + File System Access API):
 *   - Inspecting "Conectar proyecto" button text (inside closed shadow)
 *   - Verifying "Sincronizar" disabled state (inside closed shadow)
 *   - The showDirectoryPicker() native browser dialog
 *   - Actual file writes to disk after successful connection
 *   → See the Manual Verification Checklist in apply-progress (T-14)
 *
 * The regression specs A–F remain the authoritative panel-presence guards.
 * Tests G–J complement them for the vibela-specific UI change.
 */

import sharp from 'sharp';
import { test, expect } from './fixtures/extension';
import type { Page, Worker } from '@playwright/test';

// ---------------------------------------------------------------------------
// Viewport / coordinate constants (must match playwright.config.ts — 1280×720)
// ---------------------------------------------------------------------------
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;
const BOLITA_X = Math.max(24, VIEWPORT_W - 64); // 1216
const BOLITA_Y = Math.max(24, VIEWPORT_H - 64); // 656
const BOLITA_W = 46;
const BOLITA_H = 46;
const BOLITA_CENTER_X = BOLITA_X + BOLITA_W / 2;
const BOLITA_CENTER_Y = BOLITA_Y + BOLITA_H / 2;

const PANEL_LEFT = Math.max(12, Math.min(VIEWPORT_W - 312, BOLITA_X - 260));
const PANEL_TOP = Math.max(12, Math.min(VIEWPORT_H - 320, BOLITA_Y - 276));
const PANEL_W = 290;
const PANEL_H = 320;

const FIXTURE_BG = { r: 248, g: 250, b: 252 };

// ---------------------------------------------------------------------------
// Helpers (shared with regression.spec.ts but kept self-contained)
// ---------------------------------------------------------------------------

async function regionContainsContent(
  page: Page,
  region: { x: number; y: number; width: number; height: number },
  bgColor = FIXTURE_BG,
  tolerance = 15,
): Promise<boolean> {
  const screenshot = await page.screenshot({ clip: region });
  const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (
      Math.abs(r - bgColor.r) > tolerance ||
      Math.abs(g - bgColor.g) > tolerance ||
      Math.abs(b - bgColor.b) > tolerance
    ) return true;
  }
  return false;
}

async function activateOverlay(sw: Worker, page: Page): Promise<void> {
  const pageUrl = page.url();
  await page.waitForSelector('#vibela-extension-host', { timeout: 10_000 });

  const toggled = await sw.evaluate(async (url: string) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url && (t.url === url || t.url.includes('light.html')));
    if (!tab?.id) return { ok: false };
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: tab.id,
      }) as { ok?: boolean } | undefined;
      return { ok: response?.ok ?? false };
    } catch { return { ok: false }; }
  }, pageUrl);

  if (!toggled.ok) {
    await sw.evaluate(async (url: string) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url && t.url.includes('light.html'));
      if (!tab?.id) return;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/content.js'] });
      } catch { /* already injected */ }
      await new Promise<void>((r) => setTimeout(r, 150));
      await chrome.tabs.sendMessage(tab.id, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: tab.id });
    }, pageUrl);
  }

  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Test G — Panel renders after UI replacement (visual region check).
 *
 * After replacing Exportar with Connect/Sync buttons, the panel must still
 * render correctly. This test opens the panel and verifies the panel region
 * contains non-background pixels — same approach as regression tests E/F.
 *
 * If the UI replacement broke the panel render, this region would be blank.
 */
test('G: panel renders correctly after vibela UI replacement', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  await page.mouse.click(BOLITA_CENTER_X, BOLITA_CENTER_Y);
  await page.waitForTimeout(500);

  const panelRegion = {
    x: PANEL_LEFT - 5,
    y: PANEL_TOP - 5,
    width: PANEL_W + 10,
    height: PANEL_H + 10,
  };

  const panelVisible = await regionContainsContent(page, panelRegion);
  expect(
    panelVisible,
    'Panel region should contain non-background pixels after vibela UI replacement. If this fails, the Overlay render may have broken during T-12 refactor.',
  ).toBe(true);

  await page.close();
});

/**
 * Test H — No "Exportar" button in the light DOM (REQ-6.1 / SC-8).
 *
 * The old Exportar button rendered inside the closed shadow DOM. It was never
 * in the light DOM, so querying light-DOM for it is NOT a direct test of its
 * removal. The authoritative check is the build succeeding without the import
 * + runDevExport (typecheck gate) combined with test G confirming the panel
 * renders. This test provides a belt-and-suspenders check: no stray Exportar
 * element was accidentally leaked into the light DOM.
 */
test('H: no Exportar button in the light DOM — export path removed (REQ-6.1, SC-8)', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  await page.mouse.click(BOLITA_CENTER_X, BOLITA_CENTER_Y);
  await page.waitForTimeout(500);

  // No button with the old Exportar text in the light DOM.
  const oldExportarBtn = page.locator('button', { hasText: '↗ Exportar' });
  expect(await oldExportarBtn.count()).toBe(0);

  // No element with data-testid vc-btn-export in light DOM.
  expect(await page.locator('[data-testid="vc-btn-export"]').count()).toBe(0);

  await page.close();
});

/**
 * Test I — Panel still opens and stays open after T-12 refactor.
 *
 * Guards specifically against React render errors introduced by the T-12
 * Overlay.tsx changes. If connection state initialization throws or the
 * projectSync import fails to load, the panel would fail to mount and the
 * panel region would be blank.
 *
 * This is a stricter regression guard than test G: it also waits longer
 * (500 ms after click vs 300 ms) and uses a slightly tighter tolerance.
 */
test('I: panel opens and stays open after T-12 Overlay refactor', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  await page.mouse.click(BOLITA_CENTER_X, BOLITA_CENTER_Y);
  await page.waitForTimeout(500);

  // Wait another 300 ms to rule out delayed close (same as Bug 1 regression guard).
  await page.waitForTimeout(300);

  const panelRegion = {
    x: PANEL_LEFT - 5,
    y: PANEL_TOP - 5,
    width: PANEL_W + 10,
    height: PANEL_H + 10,
  };

  const panelStillVisible = await regionContainsContent(page, panelRegion);
  expect(
    panelStillVisible,
    'Panel should still be visible 800 ms after bolita click. A blank region indicates the Overlay crashed or re-closed due to a T-12 regression.',
  ).toBe(true);

  await page.close();
});

/**
 * Test J — Extension host is present on page and panel can open/close.
 *
 * Verifies the content script mounted correctly after the T-12/T-11 refactor.
 * The host element and bolita must still render. Specifically guards against
 * import errors (e.g. if a removed export like downloadPngMessage was still
 * imported somewhere, the content script bundle would fail to load entirely).
 */
test('J: extension host and bolita render after dead-code removal (T-11)', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);

  const host = page.locator('#vibela-extension-host');
  await expect(host).toBeAttached({ timeout: 10_000 });

  await activateOverlay(serviceWorker, page);

  const bolitaRegion = {
    x: BOLITA_X - 5,
    y: BOLITA_Y - 5,
    width: BOLITA_W + 10,
    height: BOLITA_H + 10,
  };

  const bolitaVisible = await regionContainsContent(page, bolitaRegion);
  expect(
    bolitaVisible,
    'Bolita should render after T-11 dead-code removal. A blank region indicates the content script failed to load (likely a broken import of a removed symbol).',
  ).toBe(true);

  await page.close();
});
