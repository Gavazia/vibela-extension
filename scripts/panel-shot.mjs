/** Quick screenshot of the panel after one annotation, to verify UI. */
import { chromium } from "@playwright/test";
import * as path from "path";
const HELIUM = "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXT = path.resolve(process.cwd(), "build", "chrome-mv3");
const OUT = path.resolve(process.cwd(), ".output", "panel-after.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
async function sh(s) { return page.evaluate((x) => { const r = document.getElementById("vibela-extension-host")?.shadowRoot;
  const e = r?.querySelector(x); if (!e) return null; const b = e.getBoundingClientRect();
  return { x: b.x + b.width/2, y: b.y + b.height/2, left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }, s); }
async function main() {
  const ctx = await chromium.launchPersistentContext("", { executablePath: HELIUM, headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"], viewport: { width: 1440, height: 900 } });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("http://localhost:4321/", { waitUntil: "networkidle" }); await sleep(900);
  const id = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (i) => chrome.tabs.sendMessage(i, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: i }), id);
  await sleep(1200);
  await sw.evaluate(async () => { const a = await chrome.storage.local.get(null); for (const k of Object.keys(a)) if (k.startsWith("annotations:")) await chrome.storage.local.remove(k); });
  // one annotation
  await page.mouse.click((await sh(".vc-bolita")).x, (await sh(".vc-bolita")).y); await sleep(500);
  await page.mouse.click((await sh(".vc-modes button:nth-of-type(1)")).x, (await sh(".vc-modes button:nth-of-type(1)")).y); await sleep(450);
  const h1 = await page.evaluate(() => { const e = document.querySelector("h1"); const r = e.getBoundingClientRect(); return { x: r.x+r.width/2, y: r.y+r.height/2 }; });
  await page.mouse.click(h1.x, h1.y); await sleep(700);
  if (await sh(".vc-annotate-popup textarea")) { const t = await sh(".vc-annotate-popup textarea"); await page.mouse.click(t.x, t.y); await page.keyboard.type("Make headline bolder"); await page.keyboard.press("Control+Enter"); await sleep(700); }
  // open panel + clip
  await page.mouse.click((await sh(".vc-bolita")).x, (await sh(".vc-bolita")).y); await sleep(600);
  const p = await sh(".vc-panel"); const pad = 24;
  await page.screenshot({ path: OUT, clip: { x: Math.max(0, p.left-pad), y: Math.max(0, p.top-pad), width: (p.right-p.left)+pad*2, height: (p.bottom-p.top)+pad*2 } });
  console.log("saved", OUT);
  await sleep(500); await ctx.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
