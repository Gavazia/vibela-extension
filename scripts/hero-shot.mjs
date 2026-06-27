import { chromium } from "@playwright/test";
import * as path from "path";
const OUT = path.resolve(process.cwd(), ".output", "hero.png");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
try { await p.locator("a.btn-glass").first().hover({ timeout: 2000 }); } catch {}
await p.waitForTimeout(700);
await p.screenshot({ path: OUT });
console.log("saved", OUT);
await b.close();
