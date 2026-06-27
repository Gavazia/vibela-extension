import { chromium } from "@playwright/test";
import * as path from "path";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.waitForTimeout(900);
await p.mouse.move(720, 475);
// sustained fast scroll to build velocity
for (let i=0;i<5;i++){ await p.mouse.wheel(0, 1400); await p.waitForTimeout(28); }
await p.waitForTimeout(70);
await p.screenshot({ path: path.resolve(process.cwd(),".output","warp.png") });
console.log("saved warp");
await b.close();
