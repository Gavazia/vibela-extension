/** Capture the landing at desktop (scrolled, animations played) and mobile widths. */
import { chromium } from "@playwright/test";
import * as path from "path";
const OUT = path.resolve(process.cwd(), ".output");
const URL = "http://localhost:4321/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = 300;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 70));
    }
    window.scrollTo(0, 0);
  });
}

async function main() {
  const b = await chromium.launch();

  // Desktop — JS on, scroll to trigger every reveal, then shoot full page.
  const d = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await d.newPage();
  await dp.goto(URL, { waitUntil: "networkidle" });
  await scrollThrough(dp);
  await sleep(1600);
  await dp.screenshot({ path: path.join(OUT, "landing-desktop.png"), fullPage: true });
  console.log("saved landing-desktop.png");

  // Mobile — JS off so the <noscript> fallback shows the full layout cleanly
  // (best way to audit responsive structure without animation state).
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const mp = await m.newPage();
  await mp.goto(URL, { waitUntil: "networkidle" });
  await sleep(400);
  await mp.screenshot({ path: path.join(OUT, "landing-mobile.png"), fullPage: true });
  console.log("saved landing-mobile.png");

  await b.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
