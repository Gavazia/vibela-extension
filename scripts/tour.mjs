import { chromium } from "@playwright/test";
import * as path from "path";
const O = (n) => path.resolve(process.cwd(),".output",n);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.waitForTimeout(900);
async function shot(sel, name){ try{ await p.locator(sel).first().scrollIntoViewIfNeeded({timeout:4000});}catch{} await p.waitForTimeout(1300); await p.screenshot({path:O(name)}); }
await shot("#export", "t-export.png");
await shot("#cta", "t-cta.png");
console.log("done");
await b.close();
