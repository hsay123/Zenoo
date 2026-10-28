/**
 * Pixel-diff two screenshot folders produced by capture.mjs.
 *
 *   node e2e/screenshots/compare.mjs e2e/screenshots/baseline e2e/screenshots/current
 *
 * For each page prints the number of changed pixels and the changed row range,
 * so an intended text change ("MON" → "USDC") can be told apart from an
 * unintended layout shift. Exits 1 if any page changed size.
 */
import { readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";

const [baseDir = "e2e/screenshots/baseline", currentDir = "e2e/screenshots/current"] =
  process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage();
let sizeChanged = false;

for (const file of readdirSync(baseDir).filter((name) => name.endsWith(".png")).sort()) {
  const a = readFileSync(`${baseDir}/${file}`).toString("base64");
  let b;
  try {
    b = readFileSync(`${currentDir}/${file}`).toString("base64");
  } catch {
    console.log(`${file.padEnd(18)} missing in ${currentDir}`);
    continue;
  }
  const result = await page.evaluate(async ([pa, pb]) => {
    const load = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = `data:image/png;base64,${src}`;
      });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { size: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
    }
    const pixels = (img) => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const da = pixels(ia);
    const db = pixels(ib);
    let changed = 0;
    let minY = Infinity;
    let maxY = -1;
    for (let i = 0; i < da.length; i += 4) {
      const delta =
        Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (delta > 30) {
        changed++;
        const y = Math.floor(i / 4 / ia.width);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { changed, rows: changed ? `${minY}-${maxY}` : null };
  }, [a, b]);

  if (result.size) sizeChanged = true;
  console.log(
    `${file.padEnd(18)} ${
      result.size
        ? `SIZE CHANGED ${result.size}`
        : result.changed
          ? `${result.changed} px changed, rows ${result.rows}`
          : "identical"
    }`,
  );
}

await browser.close();
process.exit(sizeChanged ? 1 : 0);
