// End-to-end smoke test in headless Chromium.
// Usage: node tools/e2e-smoke.mjs <map.osz> [skin.osk] [outDir]
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const [osz, osk, outDir = "/tmp/poipiu-e2e"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: "error" });
await server.listen();
const url = `http://localhost:${server.config.server.port}/?manual=1`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
await page.goto(url);
await page.setInputFiles("#files", [osz, ...(osk ? [osk] : [])]);
await page.waitForSelector(".map");
const maps = await page.$$eval(".map b", (n) => n.map((x) => x.textContent));
const skins = await page.$$eval("#skin option", (n) => n.map((x) => x.textContent));
console.log("maps:", maps.length, "| skins:", skins);
if (osk) await page.selectOption("#skin", { index: skins.length - 1 });
await page.screenshot({ path: `${outDir}/1-library.png` });
await page.click("#demo");
await page.waitForFunction(() => window.__poipiu.scene());
const check = await page.evaluate(() => {
  const s = window.__poipiu.scene();
  return { objects: s.map.hitObjects.length, first: s.map.hitObjects[0].time };
});
console.log("playing:", check);
for (const t of [check.first - 300, check.first + 3000, check.first + 9000]) {
  await page.evaluate((x) => { const p = window.__poipiu; for (let k = Math.max(-2000, x - 600); k <= x; k += 16) p.draw(k); }, t);
  await page.screenshot({ path: `${outDir}/t${t}.png` });
}
const end = await page.evaluate(() => {
  const p = window.__poipiu, s = p.scene(), objs = s.map.hitObjects, last = objs[objs.length - 1];
  p.draw((last.endTime ?? last.time) + 4000);
  const e = s.engine;
  return { n300: e.n300, n100: e.n100, n50: e.n50, miss: e.miss, combo: e.maxCombo, score: Math.round(e.score), objects: objs.length, finished: e.finished };
});
console.log("autoplay result:", end);
await page.waitForSelector("text=COMPLETADO", { timeout: 3000 }).catch(() => problems.push("result screen did not appear"));
await page.screenshot({ path: `${outDir}/9-result.png` });
if (end.miss !== 0 || end.n300 !== end.objects) problems.push(`autoplay was not perfect: ${JSON.stringify(end)}`);
await browser.close();
await server.close();
if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("OK");
