/**
 * Capture Vibela overlay screenshots on RECOGNIZABLE product pages:
 *   panel  -> claude.com
 *   annotate -> chatgpt.com
 *   transform -> gemini.google.com
 *   swap -> stripe.com
 *   text-edit -> apple.com
 *
 * Run from apps/extension:  node scripts/capture-functions2.mjs
 */
import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const OUT_DIR = path.resolve(process.cwd(), "..", "..", "design", "captures");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = [];

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

/** First visible element among candidate selectors; scrolls it to center. */
async function findTarget(page, selectors) {
  return page.evaluate((sels) => {
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 14 && r.width < window.innerWidth * 0.95) {
          el.scrollIntoView({ block: "center" });
          const rr = el.getBoundingClientRect();
          return { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2, sel };
        }
      }
    }
    return null;
  }, selectors);
}

/** Best-effort consent/cookie banner dismissal. */
async function dismissConsent(page) {
  try {
    await page.evaluate(() => {
      const labels = ["accept all", "aceptar todo", "i agree", "accept", "aceptar", "got it", "agree", "reject all", "rechazar todo"];
      const candidates = [...document.querySelectorAll("button, [role='button']")];
      for (const b of candidates) {
        const t = (b.textContent || "").trim().toLowerCase();
        if (labels.some((l) => t === l || (t.length < 30 && t.includes(l)))) { b.click(); return; }
      }
    });
    await sleep(800);
  } catch { /* none found */ }
}

async function activateOverlay(sw) {
  const tabId = await sw.evaluate(
    async () => (await chrome.tabs.query({ active: true }))[0]?.id,
  );
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

async function ensureOverlay(page, sw) {
  if (!(await shadowFind(page, ".vc-bolita"))) await activateOverlay(sw);
  return Boolean(await shadowFind(page, ".vc-bolita"));
}

async function setMode(page, idx) {
  if (!(await shadowFind(page, ".vc-panel"))) {
    await shadowClick(page, ".vc-bolita");
    await sleep(700);
  }
  const ok = await shadowClick(page, `.vc-modes button:nth-of-type(${idx})`);
  await sleep(400);
  await page.mouse.click(8, 8);
  await sleep(400);
  return ok;
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  saved.push(name);
  console.log(`  saved ${name}`);
}

async function gotoSite(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  await dismissConsent(page);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-infobars",
      "--lang=en-US",
    ],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "en-US",
  });

  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = context.pages()[0] || (await context.newPage());

  // ── 1. Bolita + panel — claude.com ───────────────────────────────────
  console.log("\n=== PANEL — claude.com ===");
  try {
    await gotoSite(page, "https://claude.com/");
    if (!(await ensureOverlay(page, sw))) throw new Error("overlay inactive");
    await capture(page, "01-orb-on-page.png");
    await shadowClick(page, ".vc-bolita");
    await sleep(800);
    await capture(page, "02-panel-open.png");
    await page.mouse.click(8, 8);
    await sleep(400);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // ── 2. Annotate — chatgpt.com ────────────────────────────────────────
  console.log("\n=== ANNOTATE — chatgpt.com ===");
  try {
    await gotoSite(page, "https://chatgpt.com/");
    if (!(await ensureOverlay(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 1);
    const t = await findTarget(page, ["#prompt-textarea", "form textarea", "main h1", "h1", "main p"]);
    if (!t) throw new Error("no target");
    await page.mouse.move(t.x, t.y); await sleep(400);
    await page.mouse.click(t.x, t.y); await sleep(900);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(200);
      await page.keyboard.type("Add a subtle glow to the prompt box on focus");
      await sleep(400);
      await capture(page, "03-annotate-popup.png");
      await page.keyboard.press("Control+Enter");
      await sleep(900);
      await capture(page, "04-annotate-saved.png");
    } else { console.log("  popup not found"); }
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // ── 3. Transform — gemini.google.com ─────────────────────────────────
  console.log("\n=== TRANSFORM — gemini.google.com ===");
  try {
    await gotoSite(page, "https://gemini.google.com/");
    if (!(await ensureOverlay(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 2);
    const t = await findTarget(page, ["rich-textarea", "main h1", "h1", "main section", "main div[role='button']", "main p"]);
    if (!t) throw new Error("no target");
    await page.mouse.move(t.x, t.y); await sleep(300);
    await page.mouse.click(t.x, t.y); await sleep(900);
    const handle = await shadowFind(page, ".vc-se");
    if (handle) {
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x + 80, handle.y + 45, { steps: 10 });
      await sleep(300);
      await capture(page, "05-transform-resize.png");
      await page.mouse.up();
      await sleep(300);
    } else {
      await capture(page, "05-transform-resize.png");
    }
    await page.keyboard.press("Escape"); await sleep(300);
    await page.keyboard.press("Escape"); await sleep(300);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // ── 4. Swap — stripe.com ─────────────────────────────────────────────
  console.log("\n=== SWAP — stripe.com ===");
  try {
    await gotoSite(page, "https://stripe.com/");
    if (!(await ensureOverlay(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 3);
    const a = await findTarget(page, ["h1"]);
    const b = await findTarget(page, ["main a.Button", "a[data-analytics-label]", "main p", "h2"]);
    if (!a || !b || (Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4)) throw new Error("targets not found");
    await page.mouse.click(a.x, a.y); await sleep(700);
    await page.mouse.move(b.x, b.y); await sleep(300);
    await page.mouse.click(b.x, b.y); await sleep(900);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await capture(page, "06-swap-popup.png");
      await page.keyboard.press("Escape"); await sleep(300);
      await page.keyboard.press("Escape"); await sleep(300);
    } else { console.log("  swap popup not found"); }
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // ── 5. Text edit — apple.com ─────────────────────────────────────────
  console.log("\n=== TEXT EDIT — apple.com ===");
  try {
    await gotoSite(page, "https://www.apple.com/");
    if (!(await ensureOverlay(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 4);
    const t = await findTarget(page, [".unit-copy h2", "main h2", "h2", "main h1"]);
    if (!t) throw new Error("no headline");
    await page.mouse.move(t.x, t.y); await sleep(300);
    await page.mouse.dblclick(t.x, t.y); await sleep(1000);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(200);
      await page.keyboard.type("Try a shorter, punchier headline here");
      await sleep(400);
      await capture(page, "07-text-edit-popup.png");
      await page.keyboard.press("Escape"); await sleep(300);
    } else { console.log("  popup not found"); }
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // ── 6. Connection panel (on apple.com backdrop) ──────────────────────
  console.log("\n=== CONNECTION PANEL ===");
  try {
    if (!(await shadowFind(page, ".vc-panel"))) {
      await shadowClick(page, ".vc-bolita");
      await sleep(800);
    }
    await capture(page, "08-panel-connect-sync.png");
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  await context.close();
  console.log(`\nDone. saved=${saved.length}: ${saved.join(", ")}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
