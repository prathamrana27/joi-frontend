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
