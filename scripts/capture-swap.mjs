/** Retry the swap capture only — HN rows need querySelectorAll indexing. */
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

async function nthRect(page, selector, index) {
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [selector, index]);
}

async function main() {
  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-infobars",
    ],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(1500);

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

  // panel → swap mode (button 3) → close panel
  const bolita = await shadowFind(page, ".vc-bolita");
  if (!bolita) throw new Error("no bolita");
  await page.mouse.click(bolita.x, bolita.y);
  await sleep(600);
  const mode = await shadowFind(page, ".vc-modes button:nth-of-type(3)");
  await page.mouse.click(mode.x, mode.y);
  await sleep(400);
  await page.mouse.click(8, 8);
  await sleep(400);

  const first = await nthRect(page, ".titleline > a", 0);
  const second = await nthRect(page, ".titleline > a", 2);
  if (!first || !second) throw new Error("titles not found");

  await page.mouse.click(first.x, first.y); await sleep(700);
  await page.mouse.move(second.x, second.y); await sleep(300);
  await page.mouse.click(second.x, second.y); await sleep(900);

  if (await shadowFind(page, ".vc-annotate-popup")) {
    await page.screenshot({ path: path.join(OUT_DIR, "07-swap-popup.png") });
    console.log("saved 07-swap-popup.png");
  } else {
    console.log("swap popup NOT found");
  }

  await context.close();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
