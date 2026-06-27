/** Surgical retry: annotate@chatgpt(h1), transform@gemini(h1), swap@stripe(h1+p), text-edit@claude(h1). */
import { chromium } from "@playwright/test";
import * as path from "path";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const OUT_DIR = path.resolve(process.cwd(), "..", "..", "design", "captures");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shadowFind(page, selector) {
  return page.evaluate((sel) => {
    const host = document.getElementById("vibela-extension-host");
    const root = host && host.shadowRoot;
    if (!root) return null;
    const el = root.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
}

async function shadowClick(page, selector) {
  const i = await shadowFind(page, selector);
  if (!i) return false;
  await page.mouse.click(i.x, i.y);
  return true;
}

async function rectOf(page, selector, index = 0) {
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, [selector, index]);
}

async function activate(sw) {
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
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

async function ensure(page, sw) {
  if (!(await shadowFind(page, ".vc-bolita"))) await activate(sw);
  return Boolean(await shadowFind(page, ".vc-bolita"));
}

async function setMode(page, idx) {
  if (!(await shadowFind(page, ".vc-panel"))) {
    await shadowClick(page, ".vc-bolita");
    await sleep(700);
  }
  await shadowClick(page, `.vc-modes button:nth-of-type(${idx})`);
  await sleep(400);
  await page.mouse.click(8, 8);
  await sleep(400);
}

async function go(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  console.log(`  saved ${name}`);
}

async function main() {
  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run", "--disable-infobars", "--lang=en-US",
    ],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "en-US",
  });
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = context.pages()[0] || (await context.newPage());

  // 1. ANNOTATE — chatgpt.com, target the central headline (NOT the textarea).
  console.log("=== ANNOTATE — chatgpt.com (h1) ===");
  try {
    await go(page, "https://chatgpt.com/");
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 1);
    const h = (await rectOf(page, "main h1")) || (await rectOf(page, "h1"));
    if (!h) throw new Error("h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(400);
    await page.mouse.click(h.x, h.y); await sleep(900);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("popup not open");
    await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(250);
    await page.keyboard.type("Make this greeting larger and friendlier");
    await sleep(400);
    await shot(page, "03-annotate-popup.png");
    await page.keyboard.press("Control+Enter"); await sleep(900);
    await shot(page, "04-annotate-saved.png");
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // 2. TRANSFORM — gemini.google.com, target the central hero headline.
  console.log("=== TRANSFORM — gemini.google.com (h1) ===");
  try {
    await go(page, "https://gemini.google.com/");
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 2);
    const h = (await rectOf(page, "main h1")) || (await rectOf(page, "h1"));
    if (!h || h.w < 200) throw new Error("hero h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(300);
    await page.mouse.click(h.x, h.y); await sleep(900);
    const handle = await shadowFind(page, ".vc-se");
    if (!handle) throw new Error("transform box not shown");
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 90, handle.y + 50, { steps: 10 });
    await sleep(350);
    await shot(page, "05-transform-resize.png");
    await page.mouse.up(); await sleep(300);
    await page.keyboard.press("Escape"); await sleep(250);
    await page.keyboard.press("Escape"); await sleep(250);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // 3. SWAP — stripe.com, h1 -> hero paragraph (both plain text, no links).
  console.log("=== SWAP — stripe.com (h1 -> p) ===");
  try {
    await go(page, "https://stripe.com/");
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 3);
    const a = await rectOf(page, "h1");
    let b = null;
    for (let i = 0; i < 6 && !b; i++) {
      const cand = await rectOf(page, "main p", i);
      if (cand && cand.w > 200 && Math.abs(cand.y - a.y) > 40) b = cand;
    }
    if (!a || !b) throw new Error("targets not found");
    await page.mouse.click(a.x, a.y); await sleep(800);
    await page.mouse.move(b.x, b.y); await sleep(300);
    await page.mouse.click(b.x, b.y); await sleep(1000);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("swap popup not open");
    await shot(page, "06-swap-popup.png");
    await page.keyboard.press("Escape"); await sleep(250);
    await page.keyboard.press("Escape"); await sleep(250);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // 4. TEXT EDIT — claude.com hero h1 (plain text, no link navigation).
  console.log("=== TEXT EDIT — claude.com (h1) ===");
  try {
    await go(page, "https://claude.com/");
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 4);
    const h = await rectOf(page, "h1");
    if (!h) throw new Error("h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(300);
    await page.mouse.dblclick(h.x, h.y); await sleep(1000);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("text-edit popup not open");
    await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(250);
    await page.keyboard.type("Think faster, build together");
    await sleep(400);
    await shot(page, "07-text-edit-popup.png");
    await page.keyboard.press("Escape"); await sleep(300);

    // Connection panel on the same pretty backdrop.
    await shadowClick(page, ".vc-bolita"); await sleep(800);
    await shot(page, "08-panel-connect-sync.png");
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  await context.close();
  console.log("Done.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
