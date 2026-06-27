/**
 * FULL E2E REGRESSION TEST — open-design.ai
 * Tests all 4 modes, export, icons, downloads, storage.
 * Agentic loop: fix bugs until everything passes.
 */
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELIUM = 'C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe';
const EXT = path.resolve(__dirname, '..', 'build', 'chrome-mv3');
const SHOTS = path.resolve(__dirname, '..', '.output', 'screenshots');

const W = 1440;
const H = 900;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Results collector ──
const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

// ── Shadow helpers ──
async function $(page: any, sel: string) {
  return page.evaluate((s: string) => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    if (!host) return null;
    const el = ((host as any).shadowRoot as ShadowRoot | null)?.querySelector(s) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
      tag: el.tagName, cls: el.className, txt: (el.textContent || '').trim().slice(0, 80) };
  }, sel);
}
async function shadowExists(page: any, sel: string) { return !!(await $(page, sel)); }
async function clickShadow(page: any, sel: string, label = '') {
  const el = await $(page, sel);
  if (!el) { return false; }
  console.log(`    Click "${label || sel}" at (${Math.round(el.x)}, ${Math.round(el.y)})`);
  await page.mouse.click(el.x, el.y);
  return true;
}
async function clickPage(page: any, x: number, y: number, label = '') {
  console.log(`    Click page at (${x}, ${y}) ${label}`);
  await page.mouse.click(x, y);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let screenshotIdx = 0;
  const shot = async (page: any, name: string) => {
    const idx = ++screenshotIdx;
    const fname = `${String(idx).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, fname) });
    console.log(`  📸 ${fname}`);
  };

  console.log('══════════════════════════════════════════');
  console.log('Vibela FULL E2E — open-design.ai');
  console.log('══════════════════════════════════════════\n');

  // ── LAUNCH ──
  console.log('🚀 Launching Helium...');
  const ctx = await chromium.launchPersistentContext('', {
    executablePath: HELIUM, headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
    viewport: { width: W, height: H }, acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);

  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log(`✅ Extension ID: ${extId}\n`);

  const page = ctx.pages()[0] || await ctx.newPage();

  // ── NAVIGATE ──
  console.log('🌐 open-design.ai...');
  try {
    await page.goto('https://open-design.ai', { waitUntil: 'load', timeout: 60000 });
  } catch {
    console.log('  ⚠️ Load timeout, continuing with domcontentloaded...');
    await page.goto('https://open-design.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await sleep(5000);
  await shot(page, 'page-loaded');

  // ── ACTIVATE ──
  console.log('\n── Activation ──');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  if (!tabId) { console.error('No tab!'); await ctx.close(); return; }

  await sw.evaluate(async (args: { tabId: number }) => {
    try { return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: args.tabId }, files: ['content-scripts/content.js'] });
      await new Promise(r => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId });
    }
  }, { tabId });
  await sleep(1500);
  await shot(page, 'overlay-active');

  // ── SANITY CHECKS ──
  console.log('\n── Sanity ──');
  const hostExists = await page.evaluate(() => !!document.getElementById('vibela-extension-host'));
  check('Host element injected', hostExists);

  const bolita = await $(page, '.vc-bolita');
  check('Bolita exists', !!bolita);
  if (bolita) {
    check('Bolita size 46×46', Math.abs(bolita.w - 46) < 3 && Math.abs(bolita.h - 46) < 3,
      `${Math.round(bolita.w)}×${Math.round(bolita.h)}`);
    const bolitaImg = await $(page, '.vc-bolita img');
    check('Bolita icon exists', !!bolitaImg);
    if (bolitaImg) {
      check('Bolita icon ~46×46', Math.abs(bolitaImg.w - 46) < 5 && Math.abs(bolitaImg.h - 46) < 5,
        `${Math.round(bolitaImg.w)}×${Math.round(bolitaImg.h)}`);
    }
  }

  // Icon web accessible
  const iconFetch = await page.evaluate(async (eid: string) => {
    const r = await fetch(`chrome-extension://${eid}/icons/icon-128.png`);
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type'), size: (await r.blob()).size };
  }, extId);
  check('Icon 128 accessible (200)', iconFetch.ok && iconFetch.type === 'image/png',
    `${iconFetch.status} ${iconFetch.type} ${iconFetch.size}B`);

  // ── Find page elements ──
  console.log('\n── Page elements ──');
  const pageEls: { tag: string; text: string; x: number; y: number; w: number; h: number }[] =
    await page.evaluate(() => {
      const host = document.getElementById('vibela-extension-host');
      const all = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,div,section,li,label,input,textarea'));
      return all.filter(el => {
        if (host?.contains(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 15 && r.top > 0 && r.left > 0;
      }).slice(0, 20).map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 60),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
          w: Math.round(r.width), h: Math.round(r.height) };
      });
    });
  for (const el of pageEls.slice(0, 12)) console.log(`    ${el.tag} "${el.text}" (${el.x},${el.y}) ${el.w}×${el.h}`);
  check('Page has interactive elements', pageEls.length > 3, `${pageEls.length} found`);

  // ── TEST 1: OPEN PANEL ──
  console.log('\n═══ TEST 1: Open panel ═══');
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(800);
  await shot(page, 'panel-open');
  const panel = await $(page, '.vc-panel');
  check('Panel visible', !!panel, panel ? `${Math.round(panel.w)}×${Math.round(panel.h)}` : '');

  // Panel header
  const panelHeader = await $(page, '.vc-panel-header strong');
  check('Panel title "Vibela"', panelHeader?.txt === 'Vibela', panelHeader?.txt || '');
  const panelBadge = await $(page, '.vc-badge');
  check('Panel badge "BETA"', panelBadge?.txt === 'BETA', panelBadge?.txt || '');

  // Mode buttons
  const modeBtns = {
    annotate: await $(page, '.vc-modes button:nth-child(1)'),
    transform: await $(page, '.vc-modes button:nth-child(2)'),
    swap: await $(page, '.vc-modes button:nth-child(3)'),
    textEdit: await $(page, '.vc-modes button:nth-child(4)'),
  };
  check('Annotate button exists', !!modeBtns.annotate);
  check('Transform button exists', !!modeBtns.transform);
  check('Swap button exists', !!modeBtns.swap);
  check('Text-edit button exists', !!modeBtns.textEdit);

  // Pause/Export buttons
  const actionBtns = {
    pause: await $(page, '.vc-actions button:first-child'),
    export: await $(page, '.vc-actions button:last-child'),
  };
  check('Pause picker button exists', !!actionBtns.pause);
  check('Export button exists', !!actionBtns.export);

  const annotationCount = await $(page, '.vc-count strong');
  check('Annotation count shows 0', annotationCount?.txt === '0', annotationCount?.txt || '');

  // ── Close panel ──
  console.log('\n── Closing panel ──');
  await page.mouse.click(5, 5); // click corner to close
  await sleep(500);
  const panelClosed = !(await $(page, '.vc-panel'));
  check('Panel closes on outside click', panelClosed);

  // ── TEST 2: ANNOTATE MODE ──
  console.log('\n═══ TEST 2: Annotate mode ═══');

  // Find best elements
  const h1El = pageEls.find(e => e.tag === 'H1' && e.text.length > 3);
  const pEl = pageEls.find(e => e.tag === 'P' && e.text.length > 10 && e !== h1El);
  const target1 = h1El || pageEls[0];
  const target2 = pEl || pageEls[1] || pageEls[0];

  // Annotate element #1
  if (target1) {
    await sleep(300);
    await page.mouse.move(target1.x, target1.y);
    await sleep(400);
    await page.mouse.click(target1.x, target1.y);
    await sleep(800);
    const popup = await $(page, '.vc-annotate-popup');
    check('Annotate popup appears #1', !!popup);
    await shot(page, 'annotate-popup1');

    if (popup) {
      await clickShadow(page, '.vc-annotate-popup textarea', 'popup1 textarea');
      await sleep(300);
      await page.keyboard.type('Change heading to match brand style');
      await sleep(300);
      await shot(page, 'annotate-typed1');
      
      // Dispatch CustomEvent bridge (shared between worlds)
      console.log('    Dispatching vibe:test-cmd...');
      await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('vibe:test-cmd', { detail: { cmd: 'save-annotate' } }));
      });
      await sleep(800);
      
      const statusText = await $(page, '.vc-status');
      console.log(`    Status after bridge save: "${statusText?.txt || '(none)'}"`);
      
      const popupGone = !(await $(page, '.vc-annotate-popup'));
      check('Annotate popup closes after save #1', popupGone);
    }
  }

  // Annotate element #2
  if (target2) {
    await sleep(300);
    await page.mouse.move(target2.x, target2.y);
    await sleep(400);
    await page.mouse.click(target2.x, target2.y);
    await sleep(800);
    const popup = await $(page, '.vc-annotate-popup');
    check('Annotate popup appears #2', !!popup);
    await shot(page, 'annotate-popup2');

    if (popup) {
      await clickShadow(page, '.vc-annotate-popup textarea', 'popup2 textarea');
      await sleep(300);
      await page.keyboard.type('Make paragraph more concise');
      await sleep(300);
      await page.keyboard.press('Control+Enter');
      await sleep(600);
    }
  }

  // ── Check annotation count in panel ──
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(600);
  await shot(page, 'panel-with-annotations');
  const count = await $(page, '.vc-count strong');
  check('Annotation count > 0 in panel', Number(count?.txt) > 0, count?.txt || '');
  const summaryItems = await page.evaluate(() => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    const ol = ((host as any).shadowRoot as ShadowRoot | null)?.querySelector('.vc-summary');
    return ol ? Array.from(ol.querySelectorAll('li')).map((li: any) => li.textContent) : [];
  });
  check('Summary list shows annotations', summaryItems.length > 0, `${summaryItems.length} items`);

  // Close panel
  await page.mouse.click(5, 5);
  await sleep(500);

  // ── TEST 3: TRANSFORM MODE ──
  console.log('\n═══ TEST 3: Transform mode ═══');
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(500);

  // Click Transform button
  const transformBtn = await $(page, '.vc-modes button:nth-child(2)');
  if (transformBtn) {
    await page.mouse.click(transformBtn.x, transformBtn.y);
    await sleep(400);
    console.log('    Transform mode selected');
    // Click page element to transform
    if (target1) {
      await page.mouse.click(target1.x, target1.y);
      await sleep(800);
      const transformBox = await $(page, '.vc-transform-box');
      check('Transform box appears', !!transformBox);
      await shot(page, 'transform-selected');

      const transformForm = await $(page, '.vc-transform-form');
      check('Transform form appears', !!transformForm);
      await shot(page, 'transform-form');

      // Cancel transform
      await page.keyboard.press('Escape');
      await sleep(500);
    }
  }

  // ── TEST 4: SWAP MODE ──  
  console.log('\n═══ TEST 4: Swap mode ═══');
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(500);

  const swapBtn = await $(page, '.vc-modes button:nth-child(3)');
  if (swapBtn) {
    await page.mouse.click(swapBtn.x, swapBtn.y);
    await sleep(400);
    console.log('    Swap mode selected');

    // Select source
    if (target1) {
      await page.mouse.click(target1.x, target1.y);
      await sleep(600);
      await shot(page, 'swap-source-selected');

      // Select target
      if (target2) {
        await page.mouse.click(target2.x, target2.y);
        await sleep(600);
        const swapPopup = await $(page, '.vc-annotate-popup'); // uses same popup class
        check('Swap popup appears', !!swapPopup);
        await shot(page, 'swap-popup');

        if (swapPopup) {
          await page.keyboard.press('Escape'); // cancel
          await sleep(400);
        }
      }
    }
  }

  // ── TEST 5: TEXT-EDIT MODE ──
  console.log('\n═══ TEST 5: Text-edit mode ═══');
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(500);

  const textEditBtn = await $(page, '.vc-modes button:nth-child(4)');
  if (textEditBtn) {
    await page.mouse.click(textEditBtn.x, textEditBtn.y);
    await sleep(400);
    console.log('    Text-edit mode selected');

    // Double-click a text element
    if (target1) {
      await page.mouse.dblclick(target1.x, target1.y);
      await sleep(800);
      const textEditPopup = await $(page, '.vc-annotate-popup');
      check('Text-edit popup appears', !!textEditPopup);
      await shot(page, 'textedit-popup');

      if (textEditPopup) {
        await page.keyboard.press('Escape');
        await sleep(400);
      }
    }
  }

  // ── TEST 6: EXPORT ──
  console.log('\n═══ TEST 6: Export ═══');
  await clickShadow(page, '.vc-bolita', 'bolita');
  await sleep(600);

  // Setup download capture
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

  // Click Export
  const exportBtn = await $(page, '.vc-actions button:last-child');
  if (exportBtn) {
    console.log(`    Clicking Export at (${Math.round(exportBtn.x)}, ${Math.round(exportBtn.y)})`);
    await page.mouse.click(exportBtn.x, exportBtn.y);
    await sleep(2500);
    await shot(page, 'after-export');
  }

  // Check download via chrome.downloads API in service worker
  const swDownloads = await sw.evaluate(async () => {
    try {
      return await chrome.downloads.search({});
    } catch {
      return [];
    }
  });

  console.log(`    chrome.downloads.search found ${swDownloads.length} item(s)`);
  const exportDl = swDownloads.find(dl => dl.filename.includes('vibela-') || dl.url.startsWith('data:image/png'));
  if (exportDl) {
    check('PNG download exists', true, `${exportDl.filename.split(/[\\/]/).pop()} (${exportDl.state})`);
  } else {
    check('PNG download exists', false, 'no download found via chrome.downloads API');
  }

  // Check clipboard
  const clipStart = Date.now();
  let clipboardText = '';
  for (let i = 0; i < 5; i++) {
    clipboardText = await page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return ''; }
    });
    if (clipboardText.length > 100) break;
    await sleep(500);
  }
  const clipTime = Date.now() - clipStart;
  check('Clipboard has prompt', clipboardText.length > 100, `${clipboardText.length} chars in ${clipTime}ms`);
  check('Prompt has VIBELA header', clipboardText.includes('VIBELA'));
  check('Prompt has CAMBIO 1', clipboardText.includes('CAMBIO 1'));
  if (clipboardText.includes('CAMBIO 2')) check('Prompt has CAMBIO 2', true);
  if (clipboardText.includes('CAMBIO 3')) check('Prompt has CAMBIO 3', true);

  // Verify file references in prompt
  const hasScreenshotRef = clipboardText.includes('vibela-') || clipboardText.includes('PNG');
  check('Prompt references PNG screenshots', hasScreenshotRef);

  // ── TEST 7: STORAGE ──
  console.log('\n═══ TEST 7: Storage ═══');
  const storage = await sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all);
    return { keys, total: keys.length };
  });
  check('Storage has data', storage.total > 0, `${storage.total} entries`);

  // Verify annotation structure
  if (storage.total > 0) {
    const sample = await sw.evaluate(async () => {
      const all: any = await chrome.storage.local.get(null);
      for (const k of Object.keys(all)) {
        if (k.startsWith('annotations:')) {
          const v = all[k];
          return { key: k, version: v.version, annotationCount: v.annotations?.length, hasAnnotations: !!v.annotations };
        }
      }
      return null;
    });
    if (sample) {
      check('Storage has annotation drafts', sample.hasAnnotations, `${sample.annotationCount} annotations`);
    }
  }

  // ── TEST 8: ICONS AND VISUAL ──
  console.log('\n═══ TEST 8: Visual checks ═══');
  const bolitaCheck2 = await $(page, '.vc-bolita');
  if (bolitaCheck2) {
    const bolitaImg = await $(page, '.vc-bolita img');
    if (bolitaImg) {
      check('Bolita icon rendered (w>10)', bolitaImg.w > 10, `${Math.round(bolitaImg.w)}×${Math.round(bolitaImg.h)}`);
    }
  }

  const panelIcon = await $(page, '.vc-panel-header img');
  if (panelIcon) {
    check('Panel header icon rendered (w>10)', panelIcon.w > 10, `${Math.round(panelIcon.w)}×${Math.round(panelIcon.h)}`);
  }

  // ── RESULTS ──
  console.log('\n══════════════════════════════════════════');
  console.log('RESULTS SUMMARY');
  console.log('══════════════════════════════════════════');
  let passCount = 0;
  for (const r of results) {
    if (r.pass) passCount++;
    console.log(`${r.pass ? '✅' : '❌'} ${r.name} ${r.detail}`);
  }
  console.log(`\n${passCount}/${results.length} passed`);
  console.log('══════════════════════════════════════════\n');

  // Write results file for agentic loop
  const resultsFile = path.join(SHOTS, '..', 'test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({ passCount, total: results.length, results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`Results saved to ${resultsFile}`);

  console.log('Browser stays open 10s for review...');
  await sleep(10000);
  await ctx.close();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
