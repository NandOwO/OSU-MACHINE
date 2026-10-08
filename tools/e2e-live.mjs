// Real-time test: no manual clock. A real (simulated) mouse plays a tiny map, then the bot plays a real map with audio.
// Usage: node tools/e2e-live.mjs <map.osz>
import { chromium } from "playwright-core";
import { createServer } from "vite";

const [osz] = process.argv.slice(2);
const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };

// --- 1. live mouse on a hand-made map
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  await page.goto(`http://localhost:${server.config.server.port}/?fresh`);
  await page.waitForFunction(() => window.__poipiu?.app);
  await page.evaluate(() => window.__poipiu.app.debugPlay(1));
  const circles = await page.evaluate(() => window.__poipiu.app.scene.map.hitObjects.map((o) => ({ x: o.x, y: o.y, t: o.time })));
  const box = await page.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const toClient = (x, y) => ({ cx: box.l + ((448 + x * 2) / 1920) * box.w, cy: box.t + ((170 + y * 2) / 1080) * box.h });
  for (const c of circles) {
    const { cx, cy } = toClient(c.x, c.y);
    await page.mouse.move(cx - 40, cy + 10);
    await page.mouse.move(cx, cy);
    for (;;) { const now = await page.evaluate(() => window.__poipiu.app.scene.time()); if (now >= c.t - 25) break; await page.waitForTimeout(4); }
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  }
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const e = window.__poipiu.app.scene.engine; return { n300: e.n300, n100: e.n100, n50: e.n50, miss: e.miss, offsets: window.__poipiu.app.scene.hitOffsets.slice() }; });
  console.log("live mouse:", JSON.stringify(r));
  check(r.miss === 0 && r.n300 + r.n100 + r.n50 === circles.length, "a real mouse hits every circle (coordinates and clock are right)");
  check(r.offsets.length === circles.length && r.offsets.every((o) => Math.abs(o) < 120), `hit offsets are small: ${r.offsets.map(Math.round)}`);
  await page.close();
}

// --- 2. bot on a real map with the audio clock
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  await page.goto(`http://localhost:${server.config.server.port}/?fresh&bot`);
  await page.waitForFunction(() => window.__poipiu?.app);
  await page.keyboard.press("Control+Shift+KeyO");
  await page.setInputFiles("#files", [osz]);
  await page.waitForFunction(() => window.__poipiu.library.entries.length > 0, null, { timeout: 20000 });
  await page.click("#op-close");
  await page.keyboard.press("KeyT");
  await page.click("#start"); await page.click("#tut-skip"); await page.click("#skin-ok");
  await page.click("#play");
  await page.waitForFunction(() => window.__poipiu.machine.screen === "playing");
  await page.waitForFunction(() => window.__poipiu.app.scene && window.__poipiu.app.scene.time() > 20000, null, { timeout: 60000, polling: 500 });
  const st = await page.evaluate(() => { const s = window.__poipiu.app.scene, e = s.engine; return { t: Math.round(s.time()), n300: e.n300, miss: e.miss, combo: e.combo, ctx: window.__poipiu.app.audio?.ctx.state }; });
  console.log("bot with audio clock:", JSON.stringify(st));
  check(st.ctx === "running", "AudioContext is running");
  check(st.n300 > 10 && st.miss === 0, `bot is perfect after ${st.t} ms of real time (${st.n300} hits)`);
  await page.close();
}
await browser.close(); await server.close();
if (problems.length) { console.log("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("\nALL OK");
