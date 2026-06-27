/** v4: chatgpt annotate (JS-typed comment, dodge focus steal) + gemini transform (dismiss consent). */
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

/** Set the popup textarea value via the native setter so React state updates,
 *  bypassing real keyboard input that hostile pages (ChatGPT) steal. */
async function setPopupComment(page, text) {
  return page.evaluate((value) => {
    const host = document.getElementById("vibela-extension-host");
    const ta = host?.shadowRoot?.querySelector(".vc-annotate-popup textarea");
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, text);
}

async function dismissConsent(page) {
  try {
    const clicked = await page.evaluate(() => {
      const exact = ["accept all", "reject all", "aceptar todo", "rechazar todo", "reject non-essential", "accept", "i agree"];
      for (const b of document.querySelectorAll("button, [role='button']")) {
        const t = (b.textContent || "").trim().toLowerCase();
        if (exact.some((l) => t === l)) { b.click(); return t; }
      }
      return null;
    });
    if (clicked) { console.log(`  consent dismissed: "${clicked}"`); await sleep(1500); }
  } catch { /* ignore */ }
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

async function rectOf(page, selector, index = 0) {
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, [selector, index]);
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

  // ANNOTATE — chatgpt.com
  console.log("=== ANNOTATE — chatgpt.com ===");
  try {
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2500);
    await dismissConsent(page);
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 1);
    const h = (await rectOf(page, "main h1")) || (await rectOf(page, "h1"));
    if (!h) throw new Error("h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(400);
    await page.mouse.click(h.x, h.y); await sleep(900);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("popup not open");
    if (!(await setPopupComment(page, "Make this greeting larger and friendlier"))) throw new Error("comment not set");
    await sleep(400);
    await shot(page, "03-annotate-popup.png");
    // Save via the popup button (avoids page-level keyboard interception).
    await shadowClick(page, "#vc-btn-save-annotate");
    await sleep(1000);
    await shot(page, "04-annotate-saved.png");
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // TRANSFORM — gemini.google.com
  console.log("=== TRANSFORM — gemini.google.com ===");
  try {
    await page.goto("https://gemini.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2500);
    await dismissConsent(page);
    await sleep(1000);
    await dismissConsent(page); // second layer if any
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 2);
    let h = null;
    for (let i = 0; i < 4 && !h; i++) {
      const cand = await rectOf(page, "h1", i);
      if (cand && cand.w > 250) h = cand;
    }
    if (!h) throw new Error("hero h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(300);
    await page.mouse.click(h.x, h.y); await sleep(900);
    const handle = await shadowFind(page, ".vc-se");
    if (!handle) throw new Error("transform box not shown");
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 90, handle.y + 50, { steps: 10 });
    await sleep(350);
    await shot(page, "05-transform-resize.png");
    await page.mouse.up();
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  await context.close();
  console.log("Done.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
