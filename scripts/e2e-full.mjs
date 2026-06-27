/**
 * Comprehensive functional E2E for the Vibela extension against the live landing.
 * Exercises EVERY feature and asserts the real effect (state/storage/DOM), using
 * reliable signals (overlay status, chrome.storage, chrome.downloads via the SW).
 *
 * Run from apps/extension:  node scripts/e2e-full.mjs
 * Requires: landing dev server on :4321, build/chrome-mv3 present, Helium installed.
 */
import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const DOWNLOAD_DIR = path.resolve(process.cwd(), ".output", "e2e-downloads");
const LANDING_URL = "http://localhost:4321/";
const VP_W = 1440, VP_H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}
function section(t) { console.log(`\n═══ ${t} ═══`); }

let page, sw;

async function shadow(sel, attrs = []) {
  return page.evaluate(({ sel, attrs }) => {
    const root = document.getElementById("vibela-extension-host")?.shadowRoot;
    if (!root) return null;
    const el = root.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const o = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      cls: el.className, text: (el.textContent || "").trim().slice(0, 50) };
    for (const a of attrs) o[a] = el.getAttribute(a);
    return o;
  }, { sel, attrs });
}
async function exists(sel) { return !!(await shadow(sel)); }
async function clickSel(sel) { const e = await shadow(sel); if (!e) return false; await page.mouse.click(e.x, e.y); return true; }
async function pageRect(sel) {
  return page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
}
async function panelOpen() { return exists(".vc-panel"); }
async function ensurePanel() { if (await panelOpen()) return; await clickSel(".vc-bolita"); await sleep(550); }
async function closePanel() { if (await panelOpen()) { await page.mouse.click(8, 8); await sleep(350); } }
async function selectMode(i) { await ensurePanel(); await clickSel(`.vc-modes button:nth-of-type(${i})`); await sleep(450); } // closes panel, picker on
async function storeNotes() {
  return sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const key = Object.keys(all).find((k) => k.startsWith("annotations:"));
    const list = (key ? all[key] : null)?.annotations || [];
    const byType = {};
    for (const a of list) byType[a.type] = (byType[a.type] || 0) + 1;
    return { count: list.length, byType };
  });
}
async function badge() { return (await shadow(".vc-count strong"))?.text; }
async function resetAll() { // Reiniciar button = 3rd action button
  await ensurePanel(); await clickSel(".vc-actions button:nth-of-type(3)"); await sleep(300); await closePanel();
}

async function annotateOn(sel, text) {
  await selectMode(1);
  const el = await pageRect(sel); if (!el) return false;
  await page.mouse.move(el.x, el.y); await sleep(300);
  await page.mouse.click(el.x, el.y); await sleep(700);
  if (!(await exists(".vc-annotate-popup"))) return false;
  await clickSel(".vc-annotate-popup textarea");
  await page.keyboard.type(text); await sleep(150);
  await page.keyboard.press("Control+Enter"); await sleep(800);
  return true;
}

async function main() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log("🧪 Vibela FULL E2E against the landing\n");

  const ctx = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH, headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, "--no-first-run", "--disable-infobars"],
    viewport: { width: VP_W, height: VP_H }, acceptDownloads: true, downloadsPath: DOWNLOAD_DIR,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(LANDING_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1000);

  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (id) => {
    try { return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content-scripts/content.js"] });
      await new Promise((r) => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }); }
  }, tabId);
  await sleep(1200);

  // 1. ACTIVATION + BOLITA
  section("1. ACTIVATION & BOLITA");
  const b0 = await shadow(".vc-bolita", ["aria-label"]);
  check("overlay activates", !!b0);
  if (!b0) { await ctx.close(); return report(); }
  check("bolita inside viewport + bottom-right",
    b0.left >= 0 && b0.bottom <= VP_H && b0.x > VP_W * 0.5 && b0.y > VP_H * 0.5);
  check("bolita aria-label = Vibela", /vibela/i.test(b0["aria-label"] || ""), b0["aria-label"]);

  // 2. BOLITA DRAG + clamp + persist
  section("2. BOLITA DRAG / CLAMP / PERSIST");
  await page.mouse.move(b0.x, b0.y); await page.mouse.down();
  await page.mouse.move(b0.x - 300, b0.y - 250, { steps: 10 }); await page.mouse.up();
  await sleep(500);
  const b1 = await shadow(".vc-bolita");
  check("bolita moved on drag", Math.abs(b1.x - b0.x) > 100, `from x=${Math.round(b0.x)} to x=${Math.round(b1.x)}`);
  check("bolita still inside viewport after drag", b1.left >= 0 && b1.top >= 0 && b1.right <= VP_W && b1.bottom <= VP_H);
  // try to drag off-screen (top-left) → clamp
  await page.mouse.move(b1.x, b1.y); await page.mouse.down();
  await page.mouse.move(-500, -500, { steps: 8 }); await page.mouse.up(); await sleep(400);
  const b2 = await shadow(".vc-bolita");
  check("bolita clamps when dragged off-screen", b2.left >= -1 && b2.top >= -1, `left=${Math.round(b2.left)} top=${Math.round(b2.top)}`);
  const prefPos = await sw.evaluate(async () => (await chrome.storage.sync.get("prefs")).prefs?.bolitaPosition);
  check("bolita position persisted to chrome.storage.sync", !!prefPos, JSON.stringify(prefPos));

  // 3. PANEL open/close
  section("3. PANEL OPEN / CLOSE");
  await clickSel(".vc-bolita"); await sleep(500);
  check("panel opens", await panelOpen());
  const p = await shadow(".vc-panel");
  if (p) check("panel inside viewport", p.left >= 0 && p.top >= 0 && p.right <= VP_W + 1 && p.bottom <= VP_H + 1);
  await page.mouse.click(8, 8); await sleep(400);
  check("panel closes on outside click", !(await panelOpen()));

  // 4. MODE CORRESPONDENCE
  section("4. MODE BUTTONS");
  const modes = [["Anotar", "annotate"], ["Reposicionar", "transform"], ["Intercambiar", "swap"], ["Editar texto", "text-edit"]];
  for (let i = 0; i < modes.length; i++) {
    await ensurePanel();
    const btn = await shadow(`.vc-modes button:nth-of-type(${i + 1})`);
    await page.mouse.click(btn.x, btn.y); await sleep(400);
    const dm = await page.evaluate(() => document.getElementById("vibela-extension-host").shadowRoot.querySelector(".vc-bolita").getAttribute("data-mode"));
    check(`"${modes[i][0]}" → ${modes[i][1]}`, dm === modes[i][1] && btn.text.includes(modes[i][0]), `data-mode=${dm}`);
  }

  // 5. PICKER TOGGLE
  section("5. PICKER TOGGLE");
  await ensurePanel();
  const pickerBtn = await shadow(".vc-actions button:nth-of-type(1)");
  check("picker button present", /picker/i.test(pickerBtn?.text || ""), pickerBtn?.text);
  await page.mouse.click(pickerBtn.x, pickerBtn.y); await sleep(400); // pausar → closes panel
  await ensurePanel();
  const pickerBtn2 = await shadow(".vc-actions button:nth-of-type(1)");
  check("picker toggles label (pausar/activar)", pickerBtn2?.text !== pickerBtn?.text, `"${pickerBtn?.text}" → "${pickerBtn2?.text}"`);
  // re-enable picker
  await page.mouse.click(pickerBtn2.x, pickerBtn2.y); await sleep(400);

  // 6. ANNOTATE + double-save check
  section("6. ANNOTATE");
  await resetAll();
  await sw.evaluate(async () => { const all = await chrome.storage.local.get(null);
    for (const k of Object.keys(all)) if (k.startsWith("annotations:")) await chrome.storage.local.remove(k); });
  // reload annotations state by toggling? simplest: just measure delta
  const before = (await storeNotes()).count;
  const okA = await annotateOn("h1", "E2E: bolder headline");
  check("annotate: popup + save flow completes", okA);
  const afterA = await storeNotes();
  check("annotate creates an 'annotate' record", (afterA.byType.annotate || 0) >= 1, JSON.stringify(afterA.byType));
  check("annotate does NOT double-save (1 click = 1 note)",
    afterA.count - before === 1, `delta=${afterA.count - before} (expected 1)`);

  // 7. TRANSFORM
  section("7. TRANSFORM");
  await selectMode(2);
  const t = await pageRect(".hero-lead") || await pageRect("p");
  await page.mouse.move(t.x, t.y); await sleep(300);
  await page.mouse.click(t.x, t.y); await sleep(700);
  check("transform box appears on element", await exists(".vc-transform-box"));
  check("transform resize handles present", await exists(".vc-transform-handle") || await exists(".vc-nw"));
  const drag = await shadow(".vc-transform-drag");
  if (drag) { await page.mouse.move(drag.x, drag.y); await page.mouse.down();
    await page.mouse.move(drag.x + 40, drag.y + 30, { steps: 6 }); await page.mouse.up(); await sleep(600); }
  check("transform form appears after move", await exists(".vc-transform-form"));
  const tBefore = (await storeNotes()).count;
  if (await exists(".vc-transform-form textarea")) { await clickSel(".vc-transform-form textarea"); await page.keyboard.type("E2E transform"); }
  await page.keyboard.press("Control+Enter"); await sleep(1200);
  const afterT = await storeNotes();
  check("transform saves a 'transform' record", (afterT.byType.transform || 0) >= 1, JSON.stringify(afterT.byType));

  // 8. SWAP
  section("8. SWAP");
  await selectMode(3);
  const s1 = await pageRect("h1"); const s2 = await pageRect(".hero-lead") || await pageRect("p");
  await page.mouse.move(s1.x, s1.y); await sleep(250); await page.mouse.click(s1.x, s1.y); await sleep(500);
  check("swap source selected", await exists(".vc-swap-source") || await exists(".vc-selected"));
  await page.mouse.move(s2.x, s2.y); await sleep(250); await page.mouse.click(s2.x, s2.y); await sleep(600);
  check("swap popup appears (source→dest)", await exists(".vc-annotate-popup"));
  await page.keyboard.press("Control+Enter"); await sleep(900);
  const afterS = await storeNotes();
  check("swap saves a 'swap' record", (afterS.byType.swap || 0) >= 1, JSON.stringify(afterS.byType));

  // 9. TEXT-EDIT
  section("9. TEXT-EDIT");
  await page.keyboard.press("Escape"); await sleep(300);  // clear any lingering swap/popup state
  await resetAll();
  await selectMode(4);
  await sleep(200);
  const te = await pageRect(".hero-lead") || await pageRect("p");
  await page.mouse.move(te.x, te.y); await sleep(250);
  await page.mouse.dblclick(te.x, te.y); await sleep(700);
  check("text-edit popup appears on dblclick", await exists(".vc-annotate-popup"));
  if (await exists(".vc-annotate-popup textarea")) { await clickSel(".vc-annotate-popup textarea"); await page.keyboard.type("New copy"); }
  await page.keyboard.press("Control+Enter"); await sleep(900);
  const afterTE = await storeNotes();
  check("text-edit saves a 'text-edit' record", (afterTE.byType["text-edit"] || 0) >= 1, JSON.stringify(afterTE.byType));

  // 10. UNDO
  section("10. UNDO");
  const beforeUndo = (await storeNotes()).count;
  await page.keyboard.press("Control+z"); await sleep(700);
  const afterUndo = (await storeNotes()).count;
  check("Ctrl+Z removes last annotation", afterUndo === beforeUndo - 1, `${beforeUndo} → ${afterUndo}`);

  // 11. EXPORT (multi-type prompt)
  section("11. EXPORT");
  await ensurePanel();
  const expBtn = await shadow(".vc-actions button:nth-of-type(2)");
  check("export button = Exportar", /export/i.test(expBtn?.text || ""), expBtn?.text);
  await page.mouse.click(expBtn.x, expBtn.y); await sleep(3500);
  const status = (await shadow(".vc-status"))?.text || "";
  check("export status = success", /copiad|descargad/i.test(status) && !/fall|error/i.test(status), `"${status}"`);
  await page.bringToFront();
  const clip = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch { return ""; } });
  check("prompt has VIBELA header", clip.includes("VIBELA"), `${clip.length} chars`);
  check("prompt includes change blocks", /CAMBIO/i.test(clip));
  const dl = await sw.evaluate(async () => { try { const it = await chrome.downloads.search({ limit: 30 });
    return it.filter((i) => /vibela-.*\.png$/i.test(i.filename || "")).length; } catch { return -1; } });
  check("export reports screenshots downloaded (downloadIds)", /descargad/i.test(status), `chrome.downloads found ${dl}`);

  // 12. PERSISTENCE ACROSS RELOAD
  section("12. PERSISTENCE ACROSS RELOAD");
  const persisted = (await storeNotes()).count;
  await page.reload({ waitUntil: "networkidle" }); await sleep(1000);
  const tabId2 = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (id) => { try { return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content-scripts/content.js"] });
      await new Promise((r) => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }); } }, tabId2);
  await sleep(1200);
  await ensurePanel();
  const restored = await badge();
  check("annotations restored after reload", String(restored) === String(persisted), `badge="${restored}" expected="${persisted}"`);

  await sleep(800);
  await ctx.close();
  report();
}

function report() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`\n🏁 FULL E2E: ${pass}/${results.length} passed.`);
  if (fail.length) { console.log("❌ FAILURES:"); fail.forEach((f) => console.log(`   - ${f.name}${f.detail ? " — " + f.detail : ""}`)); }
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error("FATAL:", e.stack || e.message); process.exit(2); });
