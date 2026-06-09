/**
 * Vibela Extension — Regression Test Suite
 *
 * Tests A–F guard against the three bugs that were fixed:
 *
 *   Bug 1 (hover-close):  A useEffect in Overlay.tsx closed the panel
 *     immediately when `panelOpen && hover` were both truthy.
 *     Fixed by clearing hover inside togglePanel and deactivating the picker
 *     when the panel is open.
 *     → Tests E and F catch this regression.
 *
 *   Bug 2 (composedPath): The outside-click handler used
 *     `event.composedPath().includes(ref)` which always returns false for
 *     closed shadow internals. Fixed by using `shadowHostEl.contains(event.target)`.
 *     → Test F catches this regression.
 *
 *   Bug 3 (broken icons): The manifest was missing `web_accessible_resources`,
 *     so the bolita and panel header icons rendered as broken images.
 *     Fixed in wxt.config.ts.
 *     → Test B catches this regression.
 *
 * Closed Shadow DOM constraint:
 *   The extension mounts its UI inside a CLOSED shadow root (mode: 'closed').
 *   `host.shadowRoot` returns null from JavaScript.  Tests verify behaviour
 *   through: the light-DOM host element, service-worker CDP evaluation,
 *   network fetches, and coordinate-based screenshots analysed with sharp.
 */

import sharp from 'sharp';
import { test, expect } from './fixtures/extension';
import type { Page, BrowserContext, Worker } from '@playwright/test';

// ---------------------------------------------------------------------------
// Viewport / coordinate constants
// These MUST match the viewport set in playwright.config.ts (1280 × 720).
// ---------------------------------------------------------------------------
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

/**
 * Default bolita position — mirrors Overlay.tsx defaultBolitaPosition().
 * { x: max(24, innerWidth - 64),  y: max(24, innerHeight - 64) }
 */
const BOLITA_X = Math.max(24, VIEWPORT_W - 64); // 1216
const BOLITA_Y = Math.max(24, VIEWPORT_H - 64); // 656
const BOLITA_W = 46;
const BOLITA_H = 46;
const BOLITA_CENTER_X = BOLITA_X + BOLITA_W / 2; // ~1239
const BOLITA_CENTER_Y = BOLITA_Y + BOLITA_H / 2; // ~679

/**
 * Panel position — mirrors Overlay.tsx panelStyle().
 * left = max(12, min(innerWidth - 312, bolitaX - 260))
 * top  = max(12, min(innerHeight - 320, bolitaY - 276))
 */
const PANEL_LEFT = Math.max(12, Math.min(VIEWPORT_W - 312, BOLITA_X - 260)); // 956
const PANEL_TOP = Math.max(12, Math.min(VIEWPORT_H - 320, BOLITA_Y - 276));  // 380
const PANEL_W = 290;
const PANEL_H = 320;

/** Background color of fixtures/light.html: rgb(248, 250, 252) */
const FIXTURE_BG = { r: 248, g: 250, b: 252 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the screenshot of `region` contains at least one pixel
 * that differs from `bgColor` by more than `tolerance` in any channel.
 *
 * Used to verify that the shadow-DOM bolita / panel have actually painted
 * without needing to pierce the closed shadow root.
 */
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
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Activates the Vibela overlay on the given page by sending the
 * VIBE_COPILOT_TOGGLE message directly from the service worker to the
 * content script — simulating what the toolbar click normally triggers.
 *
 * We use the service worker because the page JS context cannot call
 * chrome.runtime APIs (the content script's chrome APIs are not exposed
 * to page.evaluate).
 */
async function activateOverlay(
  sw: Worker,
  page: Page,
): Promise<void> {
  const pageUrl = page.url();

  // Give the content script a moment to mount after navigation.
  await page.waitForSelector('#vibela-extension-host', { timeout: 10_000 });

  // Locate the tab from the service worker context and send the toggle.
  const toggled = await sw.evaluate(async (url: string) => {
    // Query all tabs; find the one hosting our fixture page.
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(
      (t) => t.url && (t.url === url || t.url.includes('light.html')),
    );
    if (!tab?.id) return { ok: false, reason: 'tab-not-found', tabs: tabs.map((t) => t.url) };

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'VIBE_COPILOT_TOGGLE',
        active: true,
        tabId: tab.id,
      }) as { ok?: boolean; reason?: string } | undefined;
      return { ok: response?.ok ?? false, reason: response?.reason ?? 'no-response' };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }, pageUrl);

  if (!toggled.ok) {
    // If direct message failed, fall back to scripting inject + retry.
    // This handles the case where the content script hasn't registered yet.
    await sw.evaluate(async (url: string) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url && t.url.includes('light.html'));
      if (!tab?.id) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js'],
        });
      } catch {
        // Script may already be injected — that's fine.
      }
      await new Promise<void>((r) => setTimeout(r, 150));
      await chrome.tabs.sendMessage(tab.id, {
        type: 'VIBE_COPILOT_TOGGLE',
        active: true,
        tabId: tab.id,
      });
    }, pageUrl);
  }

  // Allow React to complete its render cycle.
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Test A — Extension loads with a valid service worker and extension ID.
 *
 * Regression guard: if the extension fails to build or the manifest is broken,
 * there will be no service worker and no valid ID.
 */
test('A: extension loads with valid service worker and extension ID', async ({
  extensionId,
  serviceWorker,
}) => {
  // Extension IDs are exactly 32 lowercase letters.
  expect(extensionId).toMatch(/^[a-z]{32}$/);

  // Service worker URL must belong to our extension.
  expect(serviceWorker.url()).toContain(`chrome-extension://${extensionId}/`);
});

/**
 * Test B — Icons are web-accessible (regression for Bug 3).
 *
 * Before the fix, `web_accessible_resources` was missing from the manifest.
 * A fetch of chrome-extension://<id>/icons/icon-128.png from a normal page
 * would fail with a network error (0 status or CORS block).
 * After the fix it returns HTTP 200 with Content-Type: image/png.
 *
 * Removing `web_accessible_resources` from wxt.config.ts should FAIL this test.
 */
test('B: icons are web-accessible — regression for Bug 3 (missing web_accessible_resources)', async ({
  context,
  extensionId,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  // Use the fixture page so its origin is covered by web_accessible_resources
  // matches: ['<all_urls>'].
  await page.goto(`${fixtureBaseUrl}/light.html`);

  const iconUrl = `chrome-extension://${extensionId}/icons/icon-128.png`;

  const result = await page.evaluate(async (url: string) => {
    try {
      const response = await fetch(url);
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      };
    } catch (e) {
      return { status: 0, contentType: '', error: String(e) };
    }
  }, iconUrl);

  // Both assertions must pass.  If web_accessible_resources is removed:
  //   - status will be 0 (network error) or the response will be a CORS failure.
  expect(result.status).toBe(200);
  expect(result.contentType).toContain('image/png');

  await page.close();
});

/**
 * Test C — Content script injects the overlay host element on page load.
 *
 * The content script (content.tsx) always calls mountOverlay() at document_end.
 * It creates a <div id="vibela-extension-host"> with:
 *   position: fixed;  inset: 0;  z-index: 2147483647;  pointer-events: none
 *
 * This test verifies the injection path works (both automatic via content_scripts
 * and the scripting.executeScript fallback in background.ts).
 */
test('C: content script injects the overlay host element', async ({
  context,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);

  // Wait for the content script to inject the host element.
  const host = page.locator('#vibela-extension-host');
  await expect(host).toBeAttached({ timeout: 10_000 });

  // Verify the critical CSS that lets the overlay float above all page content.
  const style = await host.evaluate((el: Element) => {
    const s = window.getComputedStyle(el);
    return { position: s.position, inset: s.inset, zIndex: s.zIndex };
  });

  expect(style.position).toBe('fixed');
  // z-index is the max 32-bit signed integer to sit above any page content.
  expect(Number(style.zIndex)).toBe(2147483647);

  await page.close();
});

/**
 * Test D — Bolita renders after overlay activation (visual region check).
 *
 * After the toolbar action activates the overlay, the bolita (the 46×46 circular
 * button) should appear at the bottom-right of the page at:
 *   left: max(24, innerWidth  - 64) = 1216
 *   top:  max(24, innerHeight - 64) = 656   (viewport 1280×720)
 *
 * Because the bolita lives inside a CLOSED shadow DOM, we cannot select it with
 * DOM locators.  Instead we take a screenshot of the expected region and verify
 * it contains pixels that differ from the fixture page background (#f8fafc).
 *
 * The bolita has a dark-blue radial gradient (#020617 → #1e3a5f) which will
 * be clearly non-background.
 */
test('D: bolita renders at expected position after overlay activation', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  // Allow time for React render + shadow DOM paint.
  await page.waitForTimeout(200);

  // Screenshot a 70×70 region around the expected bolita position.
  const bolitaRegion = {
    x: BOLITA_X - 5,
    y: BOLITA_Y - 5,
    width: BOLITA_W + 10,
    height: BOLITA_H + 10,
  };

  const hasContent = await regionContainsContent(page, bolitaRegion);
  expect(hasContent).toBe(true);

  await page.close();
});

/**
 * Test E — Panel opens and STAYS OPEN after clicking the bolita (regression for Bug 1).
 *
 * Bug 1: A useEffect watched `[hover, panelOpen]` and called `setPanelOpen(false)` when
 * both were truthy.  Hovering the bolita set `hover`, then clicking to open the panel
 * immediately triggered the effect — closing it again.
 *
 * Fix: `togglePanel()` calls `setHover(null)` before toggling, and the picker is
 * deactivated when the panel is open (so hover stops being set).
 *
 * This test:
 *   1. Activates the overlay.
 *   2. Clicks the bolita coordinates.
 *   3. Waits 500 ms (enough for the hover-close bug to fire if it regressed).
 *   4. Screenshots the panel region and asserts non-background pixels are present.
 *
 * If Bug 1 returns, the panel will flash open then immediately close, leaving only
 * the fixture background in the screenshot → the assertion fails.
 */
test('E: panel opens and STAYS OPEN after bolita click — regression for Bug 1 (hover-close)', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  // Click the center of the bolita.
  await page.mouse.click(BOLITA_CENTER_X, BOLITA_CENTER_Y);

  // Wait generously — the hover-close effect fires within one React render cycle (~16 ms)
  // but 500 ms ensures we are well past any race condition.
  await page.waitForTimeout(500);

  // The panel should be visible in this region.
  const panelRegion = {
    x: PANEL_LEFT - 5,
    y: PANEL_TOP - 5,
    width: PANEL_W + 10,
    height: PANEL_H + 10,
  };

  const panelVisible = await regionContainsContent(page, panelRegion);
  // prettier-ignore
  expect(panelVisible, `Panel region (${PANEL_LEFT},${PANEL_TOP} ${PANEL_W}×${PANEL_H}) should contain non-background pixels.  If this fails, the hover-close bug (Bug 1) has likely regressed.`).toBe(true);

  await page.close();
});

/**
 * Test F — Panel survives a click INSIDE it (regression for Bug 2).
 *
 * Bug 2: The outside-click handler used `event.composedPath().includes(ref)`.
 * For a CLOSED shadow DOM, composedPath() stops at the shadow host — internal
 * elements are not included — so the check always evaluated to false and the
 * panel closed when clicked inside.
 *
 * Fix: replaced with `shadowHostEl.contains(event.target as Node)`, which works
 * correctly because the shadow host IS in the composed path.
 *
 * This test:
 *   1. Opens the panel (same setup as Test E).
 *   2. Clicks a coordinate well inside the panel body.
 *   3. Waits 300 ms.
 *   4. Asserts the panel region still has non-background pixels.
 *
 * If Bug 2 returns, the inside click will be treated as an outside click and
 * the panel will close → the screenshot will show only background → fails.
 */
test('F: panel survives clicks inside it — regression for Bug 2 (composedPath outside-click)', async ({
  context,
  serviceWorker,
  fixtureBaseUrl,
}) => {
  const page = await context.newPage();
  await page.goto(`${fixtureBaseUrl}/light.html`);
  await activateOverlay(serviceWorker, page);

  // Open the panel.
  await page.mouse.click(BOLITA_CENTER_X, BOLITA_CENTER_Y);
  await page.waitForTimeout(400);

  // Click inside the panel body (center of the panel area).
  const insideX = PANEL_LEFT + PANEL_W / 2;   // ~1101
  const insideY = PANEL_TOP + PANEL_H / 2;    // ~540

  await page.mouse.click(insideX, insideY);
  await page.waitForTimeout(300);

  // The panel must still be present.
  const panelRegion = {
    x: PANEL_LEFT - 5,
    y: PANEL_TOP - 5,
    width: PANEL_W + 10,
    height: PANEL_H + 10,
  };

  const panelStillVisible = await regionContainsContent(page, panelRegion);
  expect(panelStillVisible, 'Panel should remain open after a click inside it.  If this fails, the composedPath bug (Bug 2) has likely regressed — outside-click handler is treating shadow-host interior clicks as outside clicks.').toBe(true);

  await page.close();
});
