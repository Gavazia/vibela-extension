/**
 * Full E2E test for Vibela extension.
 * Finds elements on the page dynamically, annotates them, exports, and verifies.
 * Uses Shadow DOM OPEN mode (mode: 'open' in content.tsx).
 */
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELIUM_PATH = 'C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe';
const EXTENSION_PATH = path.resolve(__dirname, '..', 'build', 'chrome-mv3');
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', '.output', 'screenshots');

const VP_W = 1280;
const VP_H = 720;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Query shadow DOM of Vibela host */
async function shadowFind(page: any, selector: string) {
  return page.evaluate((sel: string) => {
    const host = document.getElementById('vibela-extension-host');
    if (!host) return null;
    const el = ((host as any).shadowRoot as ShadowRoot | null)?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: el.tagName, cls: (el as any).className, text: (el.textContent || '').slice(0, 50) };
  }, selector);
}

async function shadowClickAt(page: any, selector: string) {
  const info = await shadowFind(page, selector);
  if (!info) { console.log(`  ⚠️ Shadow selector not found: ${selector}`); return false; }
  console.log(`  Click shadow "${selector}" at (${Math.round(info.x)}, ${Math.round(info.y)})`);
  await page.mouse.click(info.x, info.y);
  return true;
}

/** Find page elements (not inside Vibela host) with their positions */
async function findPageElements(page: any) {
  return page.evaluate(() => {
    const host = document.getElementById('vibela-extension-host');
    const els = Array.from(document.querySelectorAll('h1, h2, h3, p, a, button, span, div'));
    return els.filter(el => {
      if (host?.contains(el)) return false; // skip our own elements
      const r = el.getBoundingClientRect();
      return r.width > 30 && r.height > 15 && r.top > 0 && r.left > 0;
    }).slice(0, 15).map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.textContent || '').trim().slice(0, 60),
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  });
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  console.log('🚀 Launching Helium + Vibela (Shadow DOM OPEN)');
  const context = await chromium.launchPersistentContext('', {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
    ],
    viewport: { width: VP_W, height: VP_H },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];
  console.log(`✅ Extension: ${extensionId}`);

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-page.png') });

  // Activate
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  if (!tabId) { console.error('No tab'); return; }

  console.log('🔄 Activating overlay...');
  await sw.evaluate(async (args: { tabId: number }) => {
    try { return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: args.tabId }, files: ['content-scripts/content.js'] });
      await new Promise(r => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId });
    }
  }, { tabId });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-overlay.png') });

  // Check bolita
  const bolita = await shadowFind(page, '.vc-bolita');
  console.log(`🔵 Bolita: ${bolita ? `${Math.round(bolita.w)}×${Math.round(bolita.h)} at (${Math.round(bolita.x)}, ${Math.round(bolita.y)})` : 'NOT FOUND'}`);

  // Find page content elements
  const pageEls = await findPageElements(page);
  console.log('\n📄 Page elements:');
  for (const el of pageEls.slice(0, 8)) console.log(`  ${el.tag} "${el.text}" at (${el.x},${el.y}) ${el.w}×${el.h}`);

  if (pageEls.length < 1) { console.log('❌ No page elements found'); await context.close(); return; }

  // ── STEP 1: Open panel, verify it renders ──
  console.log('\n═══ PANEL ═══');
  await shadowClickAt(page, '.vc-bolita');
  await sleep(800);
  const panel = await shadowFind(page, '.vc-panel');
  console.log(`📋 Panel: ${panel ? `✅ ${Math.round(panel.w)}×${Math.round(panel.h)}` : '❌ NOT FOUND'}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-panel.png') });

  // ── STEP 2: Close panel & annotate element #1 ──
  console.log('\n═══ ANNOTATE #1 ═══');
  const el1 = pageEls.find((e: { tag: string; text: string }) => e.tag === 'H1' && e.text) || pageEls[0];
  console.log(`  Target: ${el1.tag} "${el1.text}" at (${el1.x}, ${el1.y})`);

  // Click outside to close panel
  await page.mouse.click(5, 5);
  await sleep(400);

  // Hover then click element
  await page.mouse.move(el1.x, el1.y);
  await sleep(400);
  await page.mouse.click(el1.x, el1.y);
  await sleep(800);

  // Check for annotate popup
  const popup1 = await shadowFind(page, '.vc-annotate-popup');
  console.log(`  Popup: ${popup1 ? '✅ VISIBLE' : '❌ NOT FOUND'}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-annotate-popup.png') });

  if (popup1) {
    await shadowClickAt(page, '.vc-annotate-popup textarea');
    await sleep(300);
    await page.keyboard.type('Cambiar el titulo a algo mas descriptivo');
    await sleep(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-comment.png') });
    await page.keyboard.press('Control+Enter');
    await sleep(600);
    console.log('  ✅ Annotation #1 saved');
  }

  // ── STEP 3: Annotate element #2 ──
  console.log('\n═══ ANNOTATE #2 ═══');
  const el2 = pageEls.find((e: { tag: string; text: string }) => e !== el1 && (e.tag === 'P' || e.tag === 'A') && e.text) || pageEls[1] || pageEls[0];
  if (el2 && el2 !== el1) {
    console.log(`  Target: ${el2.tag} "${el2.text}" at (${el2.x}, ${el2.y})`);
    await page.mouse.move(el2.x, el2.y);
    await sleep(300);
    await page.mouse.click(el2.x, el2.y);
    await sleep(800);
    const popup2 = await shadowFind(page, '.vc-annotate-popup');
    console.log(`  Popup: ${popup2 ? '✅ VISIBLE' : '❌ NOT FOUND'}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-annotate-popup2.png') });
    if (popup2) {
      await shadowClickAt(page, '.vc-annotate-popup textarea');
      await sleep(300);
      await page.keyboard.type('Hacer este parrafo mas visible');
      await sleep(200);
      await page.keyboard.press('Control+Enter');
      await sleep(600);
      console.log('  ✅ Annotation #2 saved');
    }
  }

  // ── STEP 4: Open panel & check annotation count ──
  console.log('\n═══ CHECK ANNOTATIONS ═══');
  await shadowClickAt(page, '.vc-bolita');
  await sleep(600);
  const count = await shadowFind(page, '.vc-count strong');
  console.log(`  Annotation count: ${count?.text || 'unknown'}`);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-panel-count.png') });

  // ── STEP 5: Export ──
  console.log('\n═══ EXPORT ═══');
  const exportBtn = await shadowFind(page, '.vc-actions button:last-child');
  if (exportBtn) {
    console.log(`  Export button at (${Math.round(exportBtn.x)}, ${Math.round(exportBtn.y)})`);
    await page.mouse.click(exportBtn.x, exportBtn.y);
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-export.png') });
  }

  // ── VERIFY ──
  console.log('\n═══ VERIFY ═══');
  const clip = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  });
  console.log(`📋 Clipboard: ${clip.length} chars`);
  if (clip.length > 100) console.log(clip.substring(0, 400) + '...');
  console.log(`  Has 'VIBELA': ${clip.includes('VIBELA') ? '✅' : '❌'}`);
  console.log(`  Has CAMBIO 1: ${clip.includes('CAMBIO 1') ? '✅' : '❌'}`);
  console.log(`  Has annotation text: ${clip.includes('titulo') || clip.includes('descriptivo') ? '✅' : '❌'}`);

  const storage = await sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return { keyCount: Object.keys(all).length };
  });
  console.log(`💾 Storage entries: ${storage.keyCount}`);

  const iconCheck = await page.evaluate(async (extId: string) => {
    const r = await fetch(`chrome-extension://${extId}/icons/icon-128.png`);
    return { status: r.status, type: r.headers.get('content-type') };
  }, extensionId);
  console.log(`🖼️ Icons: ${iconCheck.status === 200 ? '✅' : '❌'} (${iconCheck.type})`);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '99-final.png') });
  console.log('\n🏁 DONE — review screenshots in .output/screenshots/');
  await sleep(10000);
  await context.close();
}

main().catch(console.error);
