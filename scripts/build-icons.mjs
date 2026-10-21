// Renders the SVG logo into every raster size the app needs.
// Source of truth: src/assets/logo-mark.svg. Run: npm run icons
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src/assets/logo-mark.svg");
const svg = await readFile(src);

const outputs = [
  ["assets/icon.png", 512],        // window icon + electron-builder (needs >= 256)
  ["assets/tray.png", 16],         // tray @1x
  ["assets/tray@2x.png", 32],      // tray @2x (Electron picks this on HiDPI)
  ["public/favicon.png", 64],
];

await mkdir(path.join(root, "assets"), { recursive: true });
await mkdir(path.join(root, "public"), { recursive: true });

for (const [rel, size] of outputs) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(root, rel));
  console.log(`  ${rel} (${size}px)`);
}
await writeFile(path.join(root, "public/favicon.svg"), svg);
console.log("  public/favicon.svg");

// Windows icon (.ico) with every size the shell uses: desktop, taskbar, Start, Alt+Tab.
// Stamped into JOI.exe by electron-builder, so shortcuts show JOI's logo, not Electron's.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(
  icoSizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  const s = icoSizes[i];
  e.writeUInt8(s >= 256 ? 0 : s, 0); // width (0 means 256)
  e.writeUInt8(s >= 256 ? 0 : s, 1); // height
  e.writeUInt8(0, 2); // palette colours
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
await writeFile(path.join(root, "assets/icon.ico"), Buffer.concat([header, ...entries, ...pngs]));
console.log(`  assets/icon.ico (${icoSizes.join(", ")}px)`);
