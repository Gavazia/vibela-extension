/** Resize the verified design/captures set into the landing's public/images. */
import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";

const SRC = path.resolve(process.cwd(), "..", "..", "design", "captures");
const OUT = path.resolve(process.cwd(), "..", "landing", "public", "images");

const MAP = [
  ["03-annotate-popup.png",   "vibela-feature-annotate.png"],
  ["05-transform-resize.png", "vibela-feature-transform.png"],
  ["06-swap-popup.png",       "vibela-feature-swap.png"],
  ["07-text-edit-popup.png",  "vibela-feature-text-edit.png"],
  ["02-panel-open.png",       "vibela-panel-open.png"],
  ["04-annotate-saved.png",   "vibela-final-state.png"],
];

for (const [from, to] of MAP) {
  const input = path.join(SRC, from);
  const output = path.join(OUT, to);
  if (!fs.existsSync(input)) { console.log(`MISSING ${from}`); continue; }
  const img = sharp(input).resize({ width: 1600 }).png({ compressionLevel: 9, palette: false });
  await img.toFile(output);
  const meta = await sharp(output).metadata();
  const kb = Math.round(fs.statSync(output).size / 1024);
  console.log(`${to}  ${meta.width}x${meta.height}  ${kb}KB`);
}
