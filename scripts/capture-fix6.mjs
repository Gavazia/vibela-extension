/** v6 final: stripe swap (en-US, no cookie banner), claude text-edit (visible h1), chatgpt saved-state. */
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

async function visibleRect(page, selector, mustContain = null) {
  return page.evaluate(([sel, text]) => {
    for (const el of document.querySelectorAll(sel)) {
      if (text && !(el.textContent || "").toLowerCase().includes(text.toLowerCase())) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible =
        r.width > 100 && r.height > 24 &&
        style.visibility !== "hidden" && style.display !== "none" &&
        Number(style.opacity || 1) > 0.1 &&
        r.bottom > 0 && r.right > 0 &&
        r.left < window.innerWidth && r.top < window.innerHeight;
      if (!visible) continue;
      el.scrollIntoView({ block: "center" });
      const rr = el.getBoundingClientRect();
      return { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2, w: rr.width, h: rr.height };
    }
    return null;
  }, [selector, mustContain]);
}

async function setPopupText(page, text, which = 0) {
  return page.evaluate(([value, idx]) => {
    const host = document.getElementById("vibela-extension-host");
    const tas = host?.shadowRoot?.querySelectorAll(".vc-annotate-popup textarea");
    const ta = tas && tas[idx];
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, [text, which]);
}

async function dismissConsent(page) {
  try {
    const clicked = await page.evaluate(() => {
      const exact = ["accept all", "reject all", "reject non-essential", "tout accepter", "tout refuser",
                     "acceptal cookies", "accept all cookies", "rejectal cookies", "reject all cookies",
                     "aceptar todo", "rechazar todo"];
      for (const b of document.querySelectorAll("button, [role='button']")) {
        const t = (b.textContent || "").trim().toLowerCase().replace(/\s+/g, " ");
        if (exact.some((l) => t === l || t.startsWith(l))) { b.click(); return t; }
      }
      return null;
    });
    if (clicked) { console.log(`  consent: ${clicked}`); await sleep(1500); }
  } catch { /* none */ }
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
  if (await shadowFind(page, ".vc-panel")) {
    await shadowClick(page, ".vc-bolita");
    await sleep(400);
  }
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

  // 1. SWAP — stripe.com/en-us
  console.log("=== SWAP — stripe.com/en-us ===");
  try {
    await page.goto("https://stripe.com/en-us", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);
    await dismissConsent(page);
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 3);
    const a = await visibleRect(page, "h1");
    const b = await visibleRect(page, "main p");
    if (!a || !b || Math.abs(a.y - b.y) < 30) throw new Error("targets not found");
    await page.mouse.click(a.x, a.y); await sleep(800);
    await page.mouse.move(b.x, b.y); await sleep(300);
    await page.mouse.click(b.x, b.y); await sleep(1000);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("swap popup not open");
    await shot(page, "06-swap-popup.png");
    await page.keyboard.press("Escape"); await sleep(250);
    await page.keyboard.press("Escape"); await sleep(250);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // 2. TEXT EDIT — claude.com (visible hero h1, cookie banner dismissed)
  console.log("=== TEXT EDIT — claude.com ===");
  try {
    await page.goto("https://claude.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);
    await dismissConsent(page);
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 4);
    const h = (await visibleRect(page, "h1", "Think")) || (await visibleRect(page, "h1"));
    if (!h) throw new Error("visible h1 not found");
    await page.mouse.move(h.x, h.y); await sleep(300);
    await page.mouse.dblclick(h.x, h.y); await sleep(1000);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("popup not open");
    await setPopupText(page, "Think faster, build together", 0);
    await sleep(400);
    await shot(page, "07-text-edit-popup.png");
    await page.keyboard.press("Escape"); await sleep(400);

    // Connection panel on the clean claude backdrop.
    await shadowClick(page, ".vc-bolita"); await sleep(800);
    await shot(page, "08-panel-connect-sync.png");
    await shadowClick(page, ".vc-bolita"); await sleep(300);
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  // 3. ANNOTATE SAVED — chatgpt.com (fresh coords for the save click)
  console.log("=== ANNOTATE SAVED — chatgpt.com ===");
  try {
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);
    await dismissConsent(page);
    await sleep(1000);
    if (!(await ensure(page, sw))) throw new Error("overlay inactive");
    await setMode(page, 1);
    const t = (await visibleRect(page, "h1")) || (await visibleRect(page, "form"));
    if (!t) throw new Error("no target");
    await page.mouse.move(t.x, t.y); await sleep(300);
    await page.mouse.click(t.x, t.y); await sleep(900);
    if (!(await shadowFind(page, ".vc-annotate-popup"))) throw new Error("popup not open");
    await setPopupText(page, "Make this greeting larger and friendlier", 0);
    await sleep(300);
    // Fresh lookup right before the click — the page re-renders its greeting.
    await shadowClick(page, "#vc-btn-save-annotate");
    await sleep(600);
    if (await shadowFind(page, ".vc-annotate-popup")) {
      await page.keyboard.press("Control+Enter");
      await sleep(800);
    }
    if (await shadowFind(page, ".vc-annotate-popup")) throw new Error("popup did not close");
    await shot(page, "04-annotate-saved.png");
  } catch (e) { console.log(`  FAILED: ${e.message}`); }

  await context.close();
  console.log("Done.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
