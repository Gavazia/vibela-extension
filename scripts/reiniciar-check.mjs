/** Test "Reiniciar" = two-tap wipe-all (start from zero), with Ctrl+Z recovery. */
import { chromium } from "@playwright/test";
import * as path from "path";
const HELIUM = "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXT = path.resolve(process.cwd(), "build", "chrome-mv3");
const URL = "http://localhost:4321/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, sw;
const results = [];
const check = (n, ok, d = "") => { results.push({ ok: !!ok }); console.log(`  ${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };
async function sh(s) { return page.evaluate((x) => { const r = document.getElementById("vibela-extension-host")?.shadowRoot;
  const e = r?.querySelector(x); if (!e) return null; const b = e.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, text: (e.textContent || "").trim() }; }, s); }
async function notes() { return sw.evaluate(async () => { const a = await chrome.storage.local.get(null);
  const k = Object.keys(a).find((x) => x.startsWith("annotations:")); return ((k ? a[k] : null)?.annotations || []).length; }); }
async function badge() { return (await sh(".vc-count strong"))?.text; }
async function resetBtn() { return sh(".vc-actions button:nth-of-type(3)"); }
async function annotate(sel, text) {
  const el = await page.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await page.mouse.move(el.x, el.y); await sleep(250); await page.mouse.click(el.x, el.y); await sleep(700);
  await page.mouse.click((await sh(".vc-annotate-popup textarea")).x, (await sh(".vc-annotate-popup textarea")).y);
  await page.keyboard.type(text); await page.keyboard.press("Control+Enter"); await sleep(700);
}

async function main() {
  const ctx = await chromium.launchPersistentContext("", { executablePath: HELIUM, headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"], viewport: { width: 1440, height: 900 } });
  sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(URL, { waitUntil: "networkidle" }); await sleep(900);
  const id = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (i) => chrome.tabs.sendMessage(i, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: i }), id);
  await sleep(1200);
  await sw.evaluate(async () => { const a = await chrome.storage.local.get(null); for (const k of Object.keys(a)) if (k.startsWith("annotations:")) await chrome.storage.local.remove(k); });

  // make 2 annotations
  await page.mouse.click((await sh(".vc-bolita")).x, (await sh(".vc-bolita")).y); await sleep(500);
  await page.mouse.click((await sh(".vc-modes button:nth-of-type(1)")).x, (await sh(".vc-modes button:nth-of-type(1)")).y); await sleep(450);
  await annotate("h1", "note one");
  await annotate(".hero-lead", "note two");
  await page.mouse.click((await sh(".vc-bolita")).x, (await sh(".vc-bolita")).y); await sleep(600); // open panel
  check("setup: two annotations exist", (await notes()) === 2, `notes=${await notes()}, badge=${await badge()}`);

  // FIRST tap → arms, does NOT delete
  await page.mouse.click((await resetBtn()).x, (await resetBtn()).y); await sleep(400);
  const armed = await resetBtn();
  check("1st tap arms (label changes, nothing deleted yet)",
    /borrar todo/i.test(armed?.text || "") && (await notes()) === 2, `label="${armed?.text}", notes=${await notes()}`);

  // SECOND tap → wipes everything
  await page.mouse.click((await resetBtn()).x, (await resetBtn()).y); await sleep(500);
  check("2nd tap wipes ALL annotations (storage)", (await notes()) === 0, `notes=${await notes()}`);
  check("count badge resets to 0", (await badge()) === "0", `badge="${await badge()}"`);
  const after = await resetBtn();
  check("button label returns to Reiniciar", /^↺ Reiniciar$/.test(after?.text || ""), `label="${after?.text}"`);

  // Ctrl+Z safety net → restores
  await page.keyboard.press("Control+z"); await sleep(700);
  check("Ctrl+Z recovers the wiped annotations", (await notes()) === 2, `notes=${await notes()}`);

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n🏁 REINICIAR (wipe-all): ${pass}/${results.length} passed.`);
  await sleep(500); await ctx.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(2); });
