/**
 * Functional audit of the Vibela extension against the live landing.
 * Verifies: overlay activation, bolita/panel positioning (clamped, on-screen),
 * mode buttons correspond to their tool + bolita dot, annotations persist,
 * and export produces the structured prompt + downloads.
 *
 * Real behavior accounted for:
 *  - Selecting a mode (setMode) intentionally CLOSES the panel and enables the
 *    picker; the bolita data-mode reflects the active tool only while picking
 *    (selecting === active && pickerOn && !panelOpen && !popup...).
 *
 * Run from apps/extension:  node scripts/audit-landing.mjs
 */
import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const DOWNLOAD_DIR = path.resolve(process.cwd(), ".output", "audit-downloads");
const LANDING_URL = "http://localhost:4321/";
const VP_W = 1440;
const VP_H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function shadow(page, selector, attrs = []) {
  return page.evaluate(
    ({ sel, attrs }) => {
      const host = document.getElementById("vibela-extension-host");
      const root = host && host.shadowRoot;
      if (!root) return null;
      const el = root.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const out = {
        x: r.x + r.width / 2, y: r.y + r.height / 2,
        w: r.width, h: r.height, left: r.left, top: r.top,
        right: r.right, bottom: r.bottom,
        cls: el.className, text: (el.textContent || "").trim().slice(0, 40),
      };
      for (const a of attrs) out[a] = el.getAttribute(a);
      return out;
    },
    { sel: selector, attrs },
  );
}

async function clickSel(page, sel) {
  const el = await shadow(page, sel);
  if (!el) { console.log(`  ⚠️ click target missing: ${sel}`); return false; }
  await page.mouse.click(el.x, el.y);
  return true;
}

async function ensurePanelOpen(page) {
  if (await shadow(page, ".vc-panel")) return true;
  await clickSel(page, ".vc-bolita");
  await sleep(550);
  return !!(await shadow(page, ".vc-panel"));
}

async function bolitaAttr(page, attr) {
  return page.evaluate((a) => {
    const r = document.getElementById("vibela-extension-host")?.shadowRoot;
    return r?.querySelector(".vc-bolita")?.getAttribute(a) ?? null;
  }, attr);
}

async function main() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log("🔎 Vibela functional audit against the landing\n");

  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run", "--disable-infobars",
    ],
    viewport: { width: VP_W, height: VP_H },
    acceptDownloads: true,
    downloadsPath: DOWNLOAD_DIR,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const sw = context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const page = context.pages()[0] || (await context.newPage());
  const downloads = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));

  await page.goto(LANDING_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1000);

  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0]?.id);
  await sw.evaluate(async (id) => {
    try { return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content-scripts/content.js"] });
      await new Promise((r) => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(id, { type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id });
    }
  }, tabId);
  await sleep(1200);

  // ── 1. Activation + bolita positioning ──
  console.log("═══ 1. ACTIVATION & BOLITA POSITION ═══");
  const bolita = await shadow(page, ".vc-bolita", ["aria-label"]);
  check("overlay activates (bolita present)", !!bolita);
  if (!bolita) { await context.close(); return report(); }
  check("bolita inside viewport",
    bolita.left >= 0 && bolita.top >= 0 && bolita.right <= VP_W && bolita.bottom <= VP_H,
    `rect ${Math.round(bolita.left)},${Math.round(bolita.top)} ${Math.round(bolita.w)}×${Math.round(bolita.h)}`);
  check("bolita in bottom-right quadrant (default)",
    bolita.x > VP_W * 0.5 && bolita.y > VP_H * 0.5);
  check("bolita aria-label rebranded to Vibela",
    /vibela/i.test(bolita["aria-label"] || ""), bolita["aria-label"]);

  // ── 2. Panel opens, positioned on-screen ──
  console.log("\n═══ 2. PANEL ═══");
  await ensurePanelOpen(page);
  const panel = await shadow(page, ".vc-panel");
  check("panel opens on bolita click", !!panel);
  if (panel) {
    check("panel fully inside viewport (not clipped)",
      panel.left >= 0 && panel.top >= 0 && panel.right <= VP_W + 1 && panel.bottom <= VP_H + 1,
      `rect ${Math.round(panel.left)},${Math.round(panel.top)} → ${Math.round(panel.right)},${Math.round(panel.bottom)}`);
    check("panel does not overlap bolita",
      panel.right <= bolita.left + 4 || panel.bottom <= bolita.top + 4 || panel.left >= bolita.right - 4);
  }
  check("panel header says 'Vibela'", /vibela/i.test((await shadow(page, ".vc-panel-header strong"))?.text || ""));

  // ── 3. Mode buttons correspond (selecting a mode closes panel + picks) ──
  console.log("\n═══ 3. MODE BUTTONS CORRESPONDENCE ═══");
  const expected = [
    { i: 1, mode: "annotate", label: "Anotar" },
    { i: 2, mode: "transform", label: "Reposicionar" },
    { i: 3, mode: "swap", label: "Intercambiar" },
    { i: 4, mode: "text-edit", label: "Editar texto" },
  ];
  for (const e of expected) {
    await ensurePanelOpen(page);
    const btn = await shadow(page, `.vc-modes button:nth-of-type(${e.i})`);
    if (!btn) { check(`mode ${e.i} (${e.label}) present`, false); continue; }
    const labelOk = btn.text.includes(e.label);
    await page.mouse.click(btn.x, btn.y);   // closes panel + enables picker
    await sleep(450);
    const dm = await bolitaAttr(page, "data-mode");
    check(`"${e.label}" → tool ${e.mode}, bolita dot corresponds`,
      dm === e.mode && labelOk, `label="${btn.text}", data-mode=${dm}`);
  }
  // active mode is highlighted inside the panel
  await ensurePanelOpen(page);
  const activeBtn = await page.evaluate(() => {
    const r = document.getElementById("vibela-extension-host").shadowRoot;
    const b = r.querySelector(".vc-modes button.is-on");
    return b ? b.textContent.trim() : null;
  });
  check("active mode highlighted (is-on) in panel", !!activeBtn, `active="${activeBtn}"`);

  // ── 4. Notes (create ONE, check no double-save, check persistence) ──
  console.log("\n═══ 4. NOTES / ANNOTATIONS ═══");
  await ensurePanelOpen(page);
  await clickSel(page, ".vc-modes button:nth-of-type(1)");  // annotate; panel closes, picker on
  await sleep(450);
  const h1 = await page.evaluate(() => {
    const el = document.querySelector("h1"); const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(h1.x, h1.y); await sleep(350);
  check("hover highlights page element", !!(await shadow(page, ".vc-highlight")));
  await page.mouse.click(h1.x, h1.y); await sleep(700);
  check("click opens annotate popup", !!(await shadow(page, ".vc-annotate-popup")));
  await clickSel(page, ".vc-annotate-popup textarea");
  await page.keyboard.type("Audit note: make the hero headline bolder");
  await sleep(200);
  await page.keyboard.press("Control+Enter");           // ONE save action
  await sleep(900);

  await ensurePanelOpen(page);
  const badge = (await shadow(page, ".vc-count strong"))?.text;
  check("ONE annotation → exactly ONE note (no double-save)",
    badge === "1", `badge="${badge}" (expected "1")`);

  const dump = await sw.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const key = Object.keys(all).find((k) => k.startsWith("annotations:"));
    const list = (key ? all[key] : null)?.annotations || [];
    return { keys: Object.keys(all), count: list.length, last: list[list.length - 1] || null };
  });
  check("annotation persisted to chrome.storage.local",
    dump.count >= 1, `keys=[${dump.keys.join(", ")}] notes=${dump.count}`);
  check("persisted note has comment + elementInfo",
    !!dump.last && /bolder/.test(dump.last.comment || "") && !!dump.last.elementInfo,
    dump.last ? `tag=${dump.last.elementInfo?.tag}` : "none");

  // ── 5. Export (reliable signals: overlay status + chrome.downloads) ──
  console.log("\n═══ 5. EXPORT ═══");
  // NOTE: .vc-actions has THREE buttons (picker | Exportar | Reiniciar).
  // The export button is the 2nd, NOT :last-child (that's Reiniciar).
  const exportInfo = await shadow(page, ".vc-actions button:nth-of-type(2)");
  check("export button present (Exportar)", /export/i.test(exportInfo?.text || ""), `btn="${exportInfo?.text}"`);
  await clickSel(page, ".vc-actions button:nth-of-type(2)");
  await sleep(3500);
  const exportStatus =
    (await shadow(page, ".vc-status"))?.text ||
    (await shadow(page, ".vc-panel-footer span:last-child"))?.text || "";
  check("export reports success (overlay status, not error)",
    /copiad|descargad/i.test(exportStatus) && !/fall|failed|error/i.test(exportStatus),
    `status="${exportStatus}"`);
  const dl = await sw.evaluate(async () => {
    try {
      const items = await chrome.downloads.search({ limit: 25 });
      const png = items.filter((i) => /vibela-.*\.png$/i.test(i.filename || ""));
      return { vibela: png.length, names: png.slice(0, 6).map((i) => (i.filename || "").split(/[\\/]/).pop()) };
    } catch (e) { return { error: e.message }; }
  });
  check("export downloaded screenshot PNG(s) via chrome.downloads",
    (dl.vibela || 0) >= 1, dl.error ? `err=${dl.error}` : `${dl.vibela}: ${(dl.names || []).join(", ")}`);
  // secondary: clipboard (needs focus — bring page to front first)
  await page.bringToFront();
  const clip = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch { return ""; } });
  check("prompt readable from clipboard (secondary)", clip.includes("VIBELA"), `${clip.length} chars`);
  if (clip) console.log("\n📋 clipboard preview:\n  " + clip.slice(0, 500).replace(/\n/g, "\n  "));
  await sleep(1000);
  await context.close();
  report();
}

function report() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`\n🏁 AUDIT: ${pass}/${results.length} passed.`);
  if (fail.length) { console.log("❌ FAILURES:"); fail.forEach((f) => console.log(`   - ${f.name} ${f.detail}`)); }
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(2); });
