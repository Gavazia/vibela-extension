/** Focused, isolated check of text-edit mode. */
import { chromium } from "@playwright/test";
import * as path from "path";

const HELIUM = "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXT = path.resolve(process.cwd(), "build", "chrome-mv3");
const URL = "http://localhost:4321/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, sw;
async function shadow(sel) {
  return page.evaluate((s) => { const r = document.getElementById("vibela-extension-host")?.shadowRoot;
    const el = r?.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, text: (el.textContent || "").trim().slice(0, 60) }; }, sel);
}

async function main() {
  const ctx = await chromium.launchPersistentContext("", { executablePath: HELIUM, headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    viewport: { width: 1440, height: 900 } });
  sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(URL, { waitUntil: "networkidle" }); await sleep(1000);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (id) => chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }), tabId);
  await sleep(1200);
  // clear storage
  await sw.evaluate(async () => { const all = await chrome.storage.local.get(null);
    for (const k of Object.keys(all)) if (k.startsWith("annotations:")) await chrome.storage.local.remove(k); });

  // open panel, select text-edit (button 4)
  await page.mouse.click((await shadow(".vc-bolita")).x, (await shadow(".vc-bolita")).y); await sleep(550);
  await page.mouse.click((await shadow(".vc-modes button:nth-of-type(4)")).x, (await shadow(".vc-modes button:nth-of-type(4)")).y);
  await sleep(500);
  const dm = await page.evaluate(() => document.getElementById("vibela-extension-host").shadowRoot.querySelector(".vc-bolita").getAttribute("data-mode"));
  console.log("data-mode after selecting text-edit:", dm);

  // dblclick a text node
  const t = await page.evaluate(() => { const el = document.querySelector(".hero-lead") || document.querySelector("p");
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName }; });
  console.log("dblclick target:", t.tag);
  await page.mouse.move(t.x, t.y); await sleep(300);
  await page.mouse.dblclick(t.x, t.y); await sleep(800);

  // identify popup
  const strong = await shadow(".vc-annotate-popup strong");
  const taCount = await page.evaluate(() => { const r = document.getElementById("vibela-extension-host").shadowRoot;
    return r.querySelectorAll(".vc-annotate-popup textarea").length; });
  console.log("popup title:", strong?.text, "| textareas:", taCount);

  // try single-click fallback if no popup
  if (!strong) {
    console.log("no popup on dblclick — trying single click");
    await page.mouse.click(t.x, t.y); await sleep(800);
    const s2 = await shadow(".vc-annotate-popup strong");
    console.log("after single click, popup title:", s2?.text);
  }

  // fill + save
  if (await shadow(".vc-annotate-popup textarea")) {
    const ta = await shadow(".vc-annotate-popup textarea");
    await page.mouse.click(ta.x, ta.y); await page.keyboard.type("Nuevo texto E2E"); await sleep(200);
    await page.keyboard.press("Control+Enter"); await sleep(1000);
  }
  const types = await sw.evaluate(async () => { const all = await chrome.storage.local.get(null);
    const k = Object.keys(all).find((x) => x.startsWith("annotations:")); const list = (k ? all[k] : null)?.annotations || [];
    return list.map((a) => a.type); });
  console.log("RESULT — saved record types:", JSON.stringify(types));
  await sleep(800); await ctx.close();
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
