/**
 * Capture Vibela overlay screenshots exercising EVERY function against real
 * public pages (one page per function). Output goes to design/captures/ as a
 * staging area for the landing image swap.
 *
 * Run from apps/extension:  node scripts/capture-functions.mjs
 * Requires: build/chrome-mv3 present, Helium installed.
 */
import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const OUT_DIR = path.resolve(process.cwd(), "..", "..", "design", "captures");

const VP_W = 1440;
const VP_H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = [];
const skipped = [];

async function shadowFind(page, selector) {
  return page.evaluate((sel) => {
    const host = document.getElementById("vibela-extension-host");
    const root = host && host.shadowRoot;
    if (!root) return null;
    const el = root.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  }, selector);
}

async function shadowClick(page, selector) {
  const i = await shadowFind(page, selector);
  if (!i) return false;
  await page.mouse.click(i.x, i.y);
  return true;
}

async function pageRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, selector);
}

async function capture(page, name, opts = {}) {
  const target = path.join(OUT_DIR, name);
  try {
    await page.screenshot({ path: target, ...opts });
    saved.push(name);
    console.log(`  saved ${name}`);
  } catch (e) {
    skipped.push(name);
    console.log(`  skipped ${name}: ${e.message}`);
  }
}

/** Open the panel if closed, click a mode button (1..4), close the panel. */
async function setMode(page, idx) {
  if (!(await shadowFind(page, ".vc-panel"))) {
    await shadowClick(page, ".vc-bolita");
    await sleep(600);
  }
  const ok = await shadowClick(page, `.vc-modes button:nth-of-type(${idx})`);
  await sleep(400);
  await page.mouse.click(8, 8);
  await sleep(400);
  return ok;
}

async function activateOverlay(sw, tabIdHolder) {
  const tabId = await sw.evaluate(
    async () => (await chrome.tabs.query({ active: true }))[0]?.id,
  );
  tabIdHolder.id = tabId;
  await sw.evaluate(async (id) => {
    try {
      return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content-scripts/content.js"] });
      await new Promise((r) => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id });
    }
  }, tabId);
  await sleep(1000);
}

async function gotoSite(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(2000); // settle: fonts, late layout, overlay remount via GET_STATE
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Launching Helium + Vibela (today's build)");

  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-infobars",
    ],
    viewport: { width: VP_W, height: VP_H },
    deviceScaleFactor: 2,
  });

  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  console.log(`Extension sw: ${sw.url().split("/")[2]}`);

  const page = context.pages()[0] || (await context.newPage());
  const tab = { id: null };

  // ── 1. Bolita + panel — Wikipedia main page ─────────────────────────
  console.log("\n=== PANEL / ORB — wikipedia.org ===");
  try {
    await gotoSite(page, "https://en.wikipedia.org/wiki/Main_Page");
    await activateOverlay(sw, tab);
    const bolita = await shadowFind(page, ".vc-bolita");
    if (!bolita) throw new Error("bolita not found");
    await capture(page, "01-orb-on-page.png");
    await shadowClick(page, ".vc-bolita");
    await sleep(700);
    await capture(page, "02-panel-open.png");
    await page.mouse.click(8, 8); // close panel
    await sleep(400);
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  // ── 2. Annotate — MDN hero ──────────────────────────────────────────
  console.log("\n=== ANNOTATE — developer.mozilla.org ===");
  try {
    await gotoSite(page, "https://developer.mozilla.org/en-US/");
    if (!(await shadowFind(page, ".vc-bolita"))) await activateOverlay(sw, tab);
    await setMode(page, 1);
    const h1 = (await pageRect(page, "h1")) || (await pageRect(page, "main h2"));
    if (!h1) throw new Error("no headline found");
    await page.mouse.move(h1.x, h1.y); await sleep(400);
    await capture(page, "03-annotate-hover.png");
    await page.mouse.click(h1.x, h1.y); await sleep(800);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(200);
      await page.keyboard.type("Make this headline pop more on dark mode");
      await sleep(400);
      await capture(page, "04-annotate-popup.png");
      await page.keyboard.press("Control+Enter");
      await sleep(900);
      await capture(page, "05-annotate-saved.png");
    } else {
      skipped.push("04-annotate-popup.png");
    }
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  // ── 3. Transform — DuckDuckGo search box ───────────────────────────
  console.log("\n=== TRANSFORM — duckduckgo.com ===");
  try {
    await gotoSite(page, "https://duckduckgo.com/");
    if (!(await shadowFind(page, ".vc-bolita"))) await activateOverlay(sw, tab);
    await setMode(page, 2);
    const box = (await pageRect(page, "form[role='search']")) ||
                (await pageRect(page, "input[type='text']")) ||
                (await pageRect(page, "main"));
    if (!box) throw new Error("no target found");
    await page.mouse.move(box.x, box.y); await sleep(300);
    await page.mouse.click(box.x, box.y); await sleep(800);
    const handle = await shadowFind(page, ".vc-se");
    if (handle) {
      // Drag the SE handle to visibly resize the element mid-shot.
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x + 70, handle.y + 40, { steps: 8 });
      await sleep(300);
      await capture(page, "06-transform-resize.png");
      await page.mouse.up();
      await sleep(400);
    } else {
      await capture(page, "06-transform-resize.png");
    }
    await page.keyboard.press("Escape"); await sleep(300);
    await page.keyboard.press("Escape"); await sleep(300);
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  // ── 4. Swap — Hacker News story titles ─────────────────────────────
  console.log("\n=== SWAP — news.ycombinator.com ===");
  try {
    await gotoSite(page, "https://news.ycombinator.com/");
    if (!(await shadowFind(page, ".vc-bolita"))) await activateOverlay(sw, tab);
    await setMode(page, 3);
    const first = await pageRect(page, ".athing:nth-of-type(1) .titleline");
    const second = await pageRect(page, ".athing:nth-of-type(3) .titleline");
    if (!first || !second) throw new Error("story rows not found");
    await page.mouse.click(first.x, first.y); await sleep(600);
    await page.mouse.move(second.x, second.y); await sleep(300);
    await page.mouse.click(second.x, second.y); await sleep(800);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await capture(page, "07-swap-popup.png");
      await page.keyboard.press("Escape"); await sleep(300);
      await page.keyboard.press("Escape"); await sleep(300);
    } else {
      skipped.push("07-swap-popup.png");
    }
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  // ── 5. Text edit — Wikipedia article paragraph ──────────────────────
  console.log("\n=== TEXT EDIT — wikipedia article ===");
  try {
    await gotoSite(page, "https://en.wikipedia.org/wiki/Open_source");
    if (!(await shadowFind(page, ".vc-bolita"))) await activateOverlay(sw, tab);
    await setMode(page, 4);
    const p = await pageRect(page, "#mw-content-text p:nth-of-type(2)");
    if (!p) throw new Error("paragraph not found");
    await page.mouse.move(p.x, p.y); await sleep(300);
    await page.mouse.dblclick(p.x, p.y); await sleep(900);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(200);
      await page.keyboard.type("Shorter intro: open source means the source is public.");
      await sleep(400);
      await capture(page, "08-text-edit-popup.png");
      await page.keyboard.press("Escape"); await sleep(400);
    } else {
      skipped.push("08-text-edit-popup.png");
    }
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  // ── 6. Connection panel — back on first page, panel with sync UI ────
  console.log("\n=== CONNECTION PANEL ===");
  try {
    if (!(await shadowFind(page, ".vc-panel"))) {
      await shadowClick(page, ".vc-bolita");
      await sleep(700);
    }
    await capture(page, "09-panel-connect-sync.png");
  } catch (e) {
    console.log(`  step failed: ${e.message}`);
  }

  await context.close();

  console.log(`\nDone. saved=${saved.length} skipped=${skipped.length}`);
  console.log("saved:", saved.join(", "));
  if (skipped.length) console.log("skipped:", skipped.join(", "));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
