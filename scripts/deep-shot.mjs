import { chromium } from "@playwright/test";
import * as path from "path";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
const cards = p.locator(".modes-grid").first();
try { await cards.scrollIntoViewIfNeeded({ timeout: 4000 }); } catch {}
await p.waitForTimeout(1600);
await p.screenshot({ path: path.resolve(process.cwd(),".output","cards.png") });
console.log("saved");
await b.close();
