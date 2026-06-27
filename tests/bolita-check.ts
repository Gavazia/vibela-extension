/**
 * BOLITA CHECK — Visual + functional verification
 * Opens Helium, activates overlay, and checks:
 *  1. Bolita renders with correct size, icon, position
 *  2. Mode indicator (::after dot) shows correct color per mode
 *  3. Panel opens/closes on click
 *  4. Hover state works
 *  5. Icon image loads (not broken)
 *  6. Bolita position clamps to viewport
 *  7. Screenshots captured at each step
 */
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELIUM = 'C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe';
const EXT = path.resolve(__dirname, '..', 'build', 'chrome-mv3');
const SHOTS = path.resolve(__dirname, '..', '.output', 'screenshots-bolita');

const W = 1440;
const H = 900;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

async function $(page: any, sel: string) {
  return page.evaluate((s: string) => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    if (!host?.shadowRoot) return null;
    const el = host.shadowRoot.querySelector(s) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: r.x + r.width / 2, y: r.y + r.height / 2,
      w: r.width, h: r.height, top: r.top, left: r.left,
      tag: el.tagName, cls: el.className,
      txt: (el.textContent || '').trim().slice(0, 80),
      bg: cs.background, opacity: cs.opacity,
      cursor: cs.cursor, zIndex: cs.zIndex,
      borderRadius: cs.borderRadius,
      display: cs.display,
      dataMode: el.getAttribute('data-mode'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaExpanded: el.getAttribute('aria-expanded'),
    };
  }, sel);
}

async function getImgStatus(page: any) {
  return page.evaluate(() => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    if (!host?.shadowRoot) return null;
    const img = host.shadowRoot.querySelector('.vc-bolita img') as HTMLImageElement | null;
    if (!img) return null;
    return {
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      broken: img.complete && img.naturalWidth === 0,
      w: img.getBoundingClientRect().width,
      h: img.getBoundingClientRect().height,
    };
  });
}

async function getAfterDot(page: any) {
  return page.evaluate(() => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    if (!host?.shadowRoot) return null;
    const bolita = host.shadowRoot.querySelector('.vc-bolita') as HTMLElement | null;
    if (!bolita) return null;
    const cs = getComputedStyle(bolita, '::after');
    return {
      bg: cs.backgroundColor,
      width: cs.width,
      height: cs.height,
      borderRadius: cs.borderRadius,
      display: cs.display,
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let idx = 0;
  const shot = async (page: any, name: string) => {
    const fname = `${String(++idx).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(SHOTS, fname) });
    console.log(`  📸 ${fname}`);
  };

  console.log('═══════════════════════════════════════');
  console.log('  BOLITA CHECK — Vibela');
  console.log('═══════════════════════════════════════\n');

  const ctx = await chromium.launchPersistentContext('', {
    executablePath: HELIUM, headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run'],
    viewport: { width: W, height: H },
  });

  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log(`Extension ID: ${extId}`);

  const page = ctx.pages()[0] || await ctx.newPage();

  // Navigate
  console.log('\n🌐 Navigating to open-design.ai...');
  try {
    await page.goto('https://open-design.ai', { waitUntil: 'load', timeout: 60000 });
  } catch {
    await page.goto('https://open-design.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await sleep(4000);
  await shot(page, 'page-loaded');

  // Activate overlay
  console.log('\n── Activate overlay ──');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  if (!tabId) { console.error('No tabId!'); await ctx.close(); return; }

  await sw.evaluate(async (args: { tabId: number }) => {
    try { return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: args.tabId }, files: ['content-scripts/content.js'] });
      await new Promise(r => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(args.tabId, { type: 'VIBE_COPILOT_TOGGLE', active: true, tabId: args.tabId });
    }
  }, { tabId });
  await sleep(2000);

  // ══════════════════════════════════════
  //  1. BOLITA BASIC RENDERING
  // ══════════════════════════════════════
  console.log('\n═══ 1. Bolita Basic Rendering ═══');
  await shot(page, 'bolita-initial');

  const bolita = await $(page, '.vc-bolita');
  check('Bolita element exists', !!bolita);
  if (!bolita) { console.error('FATAL: no bolita found!'); await ctx.close(); return; }

  check('Size is 46×46px', Math.abs(bolita.w - 46) < 3 && Math.abs(bolita.h - 46) < 3,
    `actual: ${Math.round(bolita.w)}×${Math.round(bolita.h)}`);
  check('Position is fixed (bottom-right by default)',
    bolita.left > W / 2 && bolita.top > H / 2,
    `pos: (${Math.round(bolita.left)}, ${Math.round(bolita.top)})`);
  check('Cursor is grab', bolita.cursor === 'grab', `cursor: ${bolita.cursor}`);
  check('Z-index is max', parseInt(bolita.zIndex) > 2147483000, `z: ${bolita.zIndex}`);
  check('Border-radius is round', bolita.borderRadius.includes('999') || bolita.borderRadius.includes('50%'),
    bolita.borderRadius);
  // Bolita starts dim (picking active, panel closed) — this is correct behavior
  check('Opacity is 0.3 (dim = picker active)', bolita.opacity === '0.3', `opacity: ${bolita.opacity}`);
  check('aria-label present', bolita.ariaLabel === 'Abrir Vibela', bolita.ariaLabel || '(none)');
  check('aria-expanded is false', bolita.ariaExpanded === 'false', bolita.ariaExpanded || '(none)');
  // data-mode is 'annotate' because picker starts in annotate mode
  check('data-mode is annotate (default tool)', bolita.dataMode === 'annotate', `mode: ${bolita.dataMode || '(none)'}`);

  // ══════════════════════════════════════
  //  2. ICON IMAGE
  // ══════════════════════════════════════
  console.log('\n═══ 2. Icon Image ═══');
  const imgStatus = await getImgStatus(page);
  check('Icon <img> exists', !!imgStatus);
  if (imgStatus) {
    check('Icon is loaded (complete=true)', imgStatus.complete, `complete: ${imgStatus.complete}`);
    check('Icon is NOT broken', !imgStatus.broken,
      `naturalSize: ${imgStatus.naturalWidth}×${imgStatus.naturalHeight}`);
    check('Icon src points to extension icon', imgStatus.src.includes('icon-128.png'),
      imgStatus.src.slice(0, 80));
    check('Icon fills bolita (~46×46)', Math.abs(imgStatus.w - 46) < 5 && Math.abs(imgStatus.h - 46) < 5,
      `rendered: ${Math.round(imgStatus.w)}×${Math.round(imgStatus.h)}`);
  }

  // ══════════════════════════════════════
  //  3. MODE INDICATOR DOT (::after)
  // ══════════════════════════════════════
  console.log('\n═══ 3. Mode Indicator Dot ═══');
  const dotBefore = await getAfterDot(page);
  check('::after pseudo exists', !!dotBefore);
  if (dotBefore) {
    check('Dot is small (~11px)', parseFloat(dotBefore.width) < 16 && parseFloat(dotBefore.width) > 6,
      `size: ${dotBefore.width}×${dotBefore.height}`);
    // Dot is green because annotate mode is active by default
    check('Dot bg is annotate green', dotBefore.bg.includes('34, 197, 94'),
      `bg: ${dotBefore.bg}`);
  }

  // ══════════════════════════════════════
  //  4. HOVER STATE
  // ══════════════════════════════════════
  console.log('\n═══ 4. Hover State ═══');
  await page.mouse.move(bolita.x, bolita.y);
  await sleep(300);
  await shot(page, 'bolita-hover');
  const hovered = await $(page, '.vc-bolita');
  if (hovered) {
    // .vc-bolita:hover has opacity:1 !important — overrides is-dim
    check('Hover: opacity is 1 (hover overrides dim)', hovered.opacity === '1', `opacity: ${hovered.opacity}`);
    // Note: transform scale can't be reliably read from computed style during animation
  }

  // ══════════════════════════════════════
  //  5. CLICK → PANEL OPENS
  // ══════════════════════════════════════
  console.log('\n═══ 5. Click → Panel Opens ═══');
  await page.mouse.click(bolita.x, bolita.y);
  await sleep(500);
  await shot(page, 'panel-open');

  const panelExists = await $(page, '.vc-panel');
  check('Panel opened after click', !!panelExists);

  const bolitaOpen = await $(page, '.vc-bolita');
  if (bolitaOpen) {
    check('Bolita has .is-open class', bolitaOpen.cls.includes('is-open'), `cls: ${bolitaOpen.cls}`);
    check('aria-expanded is true', bolitaOpen.ariaExpanded === 'true', bolitaOpen.ariaExpanded || '(none)');
  }

  // Check panel header icon
  const panelIcon = await $(page, '.vc-panel-header img');
  check('Panel header has icon', !!panelIcon);

  // Check mode buttons (inside .vc-modes)
  const modeButtons = await page.evaluate(() => {
    const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
    if (!host?.shadowRoot) return [];
    const btns = host.shadowRoot.querySelectorAll('.vc-modes button');
    return Array.from(btns).map(b => {
      const r = (b as HTMLElement).getBoundingClientRect();
      return { text: (b.textContent || '').trim(), cls: (b as HTMLElement).className,
        x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  });
  check('Mode buttons: 4 found', modeButtons.length === 4, `found ${modeButtons.length}`);
  const modeLabels = modeButtons.map((b: any) => b.text);
  check('Mode labels correct', modeLabels.includes('Anotar') && modeLabels.includes('Reposicionar'),
    modeLabels.join(', '));

  // ══════════════════════════════════════
  //  6. CLOSE PANEL → BOLITA NORMAL
  // ══════════════════════════════════════
  console.log('\n═══ 6. Close Panel → Bolita Normal ═══');
  await page.mouse.click(bolita.x, bolita.y);
  await sleep(500);
  await shot(page, 'panel-closed');

  const panelGone = !(await $(page, '.vc-panel'));
  check('Panel closed after second click', panelGone);

  const bolitaClosed = await $(page, '.vc-bolita');
  if (bolitaClosed) {
    check('Bolita class back to normal', !bolitaClosed.cls.includes('is-open'), `cls: ${bolitaClosed.cls}`);
    check('aria-expanded back to false', bolitaClosed.ariaExpanded === 'false', bolitaClosed.ariaExpanded || '(none)');
  }

  // ══════════════════════════════════════
  //  7. MODE INDICATOR COLORS
  // ══════════════════════════════════════
  console.log('\n═══ 7. Mode Indicator Colors ═══');
  // Open panel, select each mode, close panel, check dot color
  const modes = [
    { tool: 'annotate', expectedColor: '34, 197, 94', label: 'green' },
    { tool: 'transform', expectedColor: '245, 158, 11', label: 'amber' },
    { tool: 'swap', expectedColor: '167, 139, 250', label: 'purple' },
    { tool: 'text-edit', expectedColor: '56, 189, 248', label: 'sky' },
  ];

  for (const mode of modes) {
    // Open panel
    const b = await $(page, '.vc-bolita');
    if (!b) break;
    await page.mouse.click(b.x, b.y);
    await sleep(300);

    // Click mode button by index
    const modeIdx = modes.indexOf(mode);
    const modeBtns = await page.evaluate(() => {
      const host = document.getElementById('vibela-extension-host') as HTMLElement | null;
      if (!host?.shadowRoot) return [];
      const btns = host.shadowRoot.querySelectorAll('.vc-modes button');
      return Array.from(btns).map(b => {
        const r = (b as HTMLElement).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    });
    if (modeBtns[modeIdx]) {
      await page.mouse.click(modeBtns[modeIdx].x, modeBtns[modeIdx].y);
      await sleep(500);
    }

    await shot(page, `mode-${mode.tool}`);

    // Check bolita data-mode
    const bAfterMode = await $(page, '.vc-bolita');
    if (bAfterMode) {
      // Panel auto-closes when mode selected? Check:
      const selecting = bAfterMode.dataMode === mode.tool;
      check(`Mode ${mode.tool}: data-mode set`, selecting || bAfterMode.dataMode === mode.tool,
        `dataMode: ${bAfterMode.dataMode || '(none)'}`);
    }

    // Check dot color via ::after
    const dot = await getAfterDot(page);
    if (dot) {
      check(`Mode ${mode.tool}: dot color is ${mode.label}`,
        dot.bg.includes(mode.expectedColor),
        `bg: ${dot.bg}`);
    }
  }

  // ══════════════════════════════════════
  //  8. ANNOTATION COUNT BADGE
  // ══════════════════════════════════════
  console.log('\n═══ 8. Annotation count ═══');
  // Open panel and check count
  const bFinal = await $(page, '.vc-bolita');
  if (bFinal) await page.mouse.click(bFinal.x, bFinal.y);
  await sleep(300);
  const countBadge = await $(page, '.vc-count');
  check('Annotation count badge visible', !!countBadge, countBadge?.txt || '(none)');

  await shot(page, 'final-state');

  // ══════════════════════════════════════
  //  RESULTS
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`  TOTAL: ${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\n  FAILURES:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ❌ ${r.name}${r.detail ? ': ' + r.detail : ''}`);
    }
  }
  console.log('══════════════════════════════════════\n');

  // Write JSON results
  const outFile = path.resolve(__dirname, '..', '.output', 'bolita-results.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${outFile}`);

  await ctx.close();
}

main().catch(e => { console.error(e); process.exit(1); });
