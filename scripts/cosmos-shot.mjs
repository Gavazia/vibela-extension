import { chromium } from "@playwright/test";
import * as path from "path";
const OUT = path.resolve(process.cwd(), ".output");
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(OUT,"cosmos-hero.png") });
// scroll to features
await p.evaluate(() => window.scrollTo({ top: window.innerHeight*2.2, behavior:'instant' }));
await p.waitForTimeout(1400);
await p.screenshot({ path: path.join(OUT,"cosmos-features.png") });
console.log("saved");
await b.close();
