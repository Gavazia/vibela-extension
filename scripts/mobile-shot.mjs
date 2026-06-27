import { chromium } from "@playwright/test";
import * as path from "path";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 })).newPage();
await p.goto("http://localhost:4321/", { waitUntil: "networkidle" });
await p.waitForTimeout(1300);
await p.screenshot({ path: path.resolve(process.cwd(),".output","mobile.png") });
console.log("saved");
await b.close();
