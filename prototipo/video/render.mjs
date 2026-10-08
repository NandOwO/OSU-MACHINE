// Renders promo.html frame by frame. Usage: node render.mjs <startFrame> <endFrame> <outDir> [fps]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [start, end, outDir, fpsArg] = process.argv.slice(2);
const fps = Number(fpsArg ?? 30);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--allow-file-access-from-files", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(resolve("promo.html")).href);
await page.evaluate(() => window.ready);
for (let f = Number(start); f < Number(end); f++) {
  await page.evaluate((t) => window.renderAt(t), f / fps);
  await page.screenshot({ path: `${outDir}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
}
await browser.close();
