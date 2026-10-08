// Option B in the browser: the machine with a simulated osu! (no osu! installed).
// Usage: node tools/e2e-osu-mock.mjs <map.osz>
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const [osz] = process.argv.slice(2);
const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
const srv = createServer((q, r) => {
  const p = join("dist", decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!existsSync(p)) { r.writeHead(404).end(); return; }
  r.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
await page.goto(`http://localhost:${port}/?source=mock&fresh=1&nofactory=1`);
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.waitForFunction(() => window.__poipiu && window.__osu, null, { timeout: 8000 }).catch((e) => { console.log(problems, e.message); });
await page.evaluate(async (bytes) => { await window.__poipiu.library.add("t.osz", new Uint8Array(bytes), false); }, [...readFileSync(osz)]);
await page.keyboard.press("KeyT"); await page.waitForTimeout(300);
await page.click("#start"); await page.waitForTimeout(300);
check(await page.locator(".osu-step").count() === 3, "tutorial in osu mode is text with 3 steps");
await page.click("#tut-next"); await page.waitForTimeout(300);
await page.getByText("CONFIRMAR").click(); await page.waitForTimeout(400);
check(await page.locator("#mock-complete").count() === 1, "waiting screen shows the simulation panel");
const plays = () => page.evaluate(() => window.__poipiu.machine.playsLeft);
check(await plays() === 3, "3 plays before");
await page.screenshot({ path: "/tmp/osu-wait.png" });
await page.click("#mock-complete"); await page.waitForFunction(() => window.__poipiu.machine.screen === "results", null, { timeout: 60000 });
check(await plays() === 2, "a completed play costs one play");
check((await page.evaluate(() => window.__poipiu.machine.results.tickets)) > 0, "tickets paid");
await page.screenshot({ path: "/tmp/osu-results.png" });
await page.evaluate(() => { const m = window.__poipiu.machine; m.continueFromResults(); if (m.screen === "name") m.submitName("AAA"); });
await page.waitForTimeout(300);
await page.evaluate(() => { const m = window.__poipiu.machine; for (let i = 0; i < 6 && !["map", "playing"].includes(m.screen); i++) { try { m.continueFromResults(); } catch {} m.nextStep?.(); } });
console.log("screen:", await page.evaluate(() => window.__poipiu.machine.screen));
await b.close(); srv.close();
console.log(problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nALL OK");
process.exit(problems.length ? 1 : 0);
