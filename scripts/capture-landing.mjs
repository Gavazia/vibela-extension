/**
 * Capture real Vibela overlay screenshots against the live landing
 * (http://localhost:4321) and write them into the landing's image gallery.
 *
 * Run from apps/extension:  node scripts/capture-landing.mjs
 * Requires: landing dev server up on :4321, build/chrome-mv3 present, Helium installed.
 *
 * Each step is independent and wrapped in try/catch: a failing capture is
 * skipped (the existing placeholder is left untouched) so a partial run still
 * produces whatever worked.
 */
import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const HELIUM_PATH =
  "C:\\Users\\Andy Gavaz\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const EXTENSION_PATH = path.resolve(process.cwd(), "build", "chrome-mv3");
const OUT_DIR = path.resolve(process.cwd(), "..", "landing", "public", "images");
const LANDING_URL = "http://localhost:4321/";

const VP_W = 1440;
const VP_H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = [];
const skipped = [];

async function shadowFind(page, selector) {
  return page.evaluate((sel) => {
    const host = document.getElementById("vibela-extension-host");
    const root = host && host.shadowRoot;
    if (!root) return null;
    const el = root.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
             left: r.left, top: r.top };
  }, selector);
}

async function shadowClick(page, selector) {
  const i = await shadowFind(page, selector);
  if (!i) return false;
  await page.mouse.click(i.x, i.y);
  return true;
}

async function pageRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, selector);
}

async function capture(page, name, opts = {}) {
  const target = path.join(OUT_DIR, name);
  try {
    await page.screenshot({ path: target, ...opts });
    saved.push(name);
    console.log(`  ✅ saved ${name}`);
  } catch (e) {
    skipped.push(name);
    console.log(`  ⚠️ skipped ${name}: ${e.message}`);
  }
}

/** Open the panel, click a mode button (1..4), then close the panel. */
async function setMode(page, idx) {
  // ensure panel open
  if (!(await shadowFind(page, ".vc-panel"))) {
    await shadowClick(page, ".vc-bolita");
    await sleep(600);
  }
  const ok = await shadowClick(page, `.vc-modes button:nth-of-type(${idx})`);
  await sleep(400);
  // close panel so the picker becomes active
  await page.mouse.click(8, 8);
  await sleep(400);
  return ok;
}

/** Bolita-centered clip for a tight orb shot. */
async function orbClip(page) {
  const b = await shadowFind(page, ".vc-bolita");
  if (!b) return null;
  const pad = 70;
  return {
    x: Math.max(0, b.left - pad),
    y: Math.max(0, b.top - pad),
    width: Math.min(VP_W, b.w + pad * 2),
    height: Math.min(VP_H, b.h + pad * 2),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("🚀 Launching Helium + Vibela against the landing");

  const context = await chromium.launchPersistentContext("", {
    executablePath: HELIUM_PATH,
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-infobars",
    ],
    viewport: { width: VP_W, height: VP_H },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  console.log(`✅ Extension sw: ${sw.url().split("/")[2]}`);

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(LANDING_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1200);

  // Activate overlay
  const tabId = await sw.evaluate(
    async () => (await chrome.tabs.query({ active: true }))[0]?.id,
  );
  await sw.evaluate(async (id) => {
    try {
      return await chrome.tabs.sendMessage(id, {
        type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id,
      });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: id }, files: ["content-scripts/content.js"],
      });
      await new Promise((r) => setTimeout(r, 500));
      return await chrome.tabs.sendMessage(id, {
        type: "VIBE_COPILOT_TOGGLE", active: true, tabId: id,
      });
    }
  }, tabId);
  await sleep(1200);

  const bolita = await shadowFind(page, ".vc-bolita");
  console.log(`🔵 Bolita: ${bolita ? "found" : "NOT FOUND — overlay inactive"}`);
  if (!bolita) {
    await context.close();
    throw new Error("Overlay did not activate; aborting.");
  }

  // ── Orb / page states ──────────────────────────────────────────────
  console.log("\n═══ ORB / PAGE ═══");
  await capture(page, "vibela-hero-bg.png");                 // page + bolita
  const clip0 = await orbClip(page);
  if (clip0) await capture(page, "vibela-orb-initial.png", { clip: clip0 });

  await page.mouse.move(bolita.x, bolita.y);                 // hover
  await sleep(400);
  const clipH = await orbClip(page);
  if (clipH) await capture(page, "vibela-orb-hover.png", { clip: clipH });

  await shadowClick(page, ".vc-bolita");                     // open panel
  await sleep(700);
  await capture(page, "vibela-panel-open.png");

  // ── Mode captures ──────────────────────────────────────────────────
  const h1 = (await pageRect(page, "h1")) || (await pageRect(page, ".hero-lead"));
  const lead = (await pageRect(page, ".hero-lead")) || h1;

  // Annotate (mode 1) — select element, fill comment, save (counts toward final-state)
  console.log("\n═══ ANNOTATE ═══");
  await setMode(page, 1);
  if (h1) {
    await page.mouse.move(h1.x, h1.y); await sleep(300);
    await page.mouse.click(h1.x, h1.y); await sleep(700);
  }
  if (await shadowFind(page, ".vc-annotate-popup")) {
    await shadowClick(page, ".vc-annotate-popup textarea"); await sleep(200);
    await page.keyboard.type("Make this headline bolder and tighten the line height");
    await sleep(300);
    await capture(page, "vibela-feature-annotate.png");
    await page.keyboard.press("Control+Enter");             // save -> annotation #1
    await sleep(600);
  } else {
    console.log("  ⚠️ annotate popup not found");
    skipped.push("vibela-feature-annotate.png");
  }

  // Transform (mode 2) — select element, show transform box
  console.log("\n═══ TRANSFORM ═══");
  await setMode(page, 2);
  if (lead) {
    await page.mouse.move(lead.x, lead.y); await sleep(300);
    await page.mouse.click(lead.x, lead.y); await sleep(700);
  }
  await capture(page, "vibela-feature-transform.png");
  await page.keyboard.press("Escape"); await sleep(400);

  // Swap (mode 3) — pick source element
  console.log("\n═══ SWAP ═══");
  await setMode(page, 3);
  if (h1) {
    await page.mouse.move(h1.x, h1.y); await sleep(300);
    await page.mouse.click(h1.x, h1.y); await sleep(700);
  }
  await capture(page, "vibela-feature-swap.png");
  await page.keyboard.press("Escape"); await sleep(400);

  // Text edit (mode 4) — double-click a text node
  console.log("\n═══ TEXT EDIT ═══");
  await setMode(page, 4);
  if (lead) {
    await page.mouse.move(lead.x, lead.y); await sleep(300);
    await page.mouse.dblclick(lead.x, lead.y); await sleep(700);
  }
  await capture(page, "vibela-feature-text-edit.png");
  await page.keyboard.press("Escape"); await sleep(400);

  // Final state — open panel showing annotation count
  console.log("\n═══ FINAL STATE ═══");
  if (!(await shadowFind(page, ".vc-panel"))) {
    await shadowClick(page, ".vc-bolita"); await sleep(600);
  }
  await capture(page, "vibela-final-state.png");

  console.log(`\n🏁 DONE. saved=${saved.length} skipped=${skipped.length}`);
  if (skipped.length) console.log("   skipped: " + skipped.join(", "));
  await sleep(1500);
  await context.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
