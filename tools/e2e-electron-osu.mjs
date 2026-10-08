// Option B in the real kiosk with a FAKE osu! (a node process): content is installed, the skin is set, osu! starts and stops with the session.
// Run under a virtual display:  xvfb-run -a node tools/e2e-electron-osu.mjs
import { _electron as electron } from "playwright-core";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
execSync("npx vite build", { stdio: "ignore" });
const userData = mkdtempSync(join(tmpdir(), "poipiu-kiosk-")), osuDir = mkdtempSync(join(tmpdir(), "fake-osu-"));
writeFileSync(join(osuDir, "osu!.player.cfg"), "Volume = 1\nSkin = Default\n");
writeFileSync(join(userData, "osu.json"), JSON.stringify({ osuDir, osuExe: process.execPath, osuArgs: ["-e", "setInterval(() => {}, 1000)"] }));
mkdirSync(join(userData, "content"), { recursive: true });
const app = await electron.launch({
  executablePath: "node_modules/electron/dist/electron",
  args: ["electron/main.mjs", "--windowed", "--no-sandbox", "--disable-gpu", "--source=tosu"],
  env: { ...process.env, POIPIU_DATA_DIR: userData },
});
const page = await app.firstWindow();
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
await page.waitForFunction(() => window.__poipiu?.app && window.__osu);
check(await page.evaluate(() => window.poipiuHost.osuEnabled()), "option B is enabled by osu.json");
check(await page.evaluate(() => window.__poipiu.library.skins.length) > 1, "factory skins are installed in the shell");
const status = () => page.evaluate(() => window.poipiuHost.osuStatus());
check((await status()).osu === false, "osu! is not running while the machine is idle");
await page.keyboard.press("KeyT"); await page.waitForTimeout(300);
await page.click("#start"); await page.waitForTimeout(300);
await page.click("#tut-skip"); await page.waitForTimeout(500);
const idx = await page.evaluate(() => window.__poipiu.library.skins.findIndex((s) => /WhiteCat/.test(s.file ?? "")));
if (idx > 0) await page.evaluate((i) => { window.__poipiu.app.skinIdx = i; }, idx);
await page.click("#skin-ok");
await page.waitForFunction(() => window.poipiuHost.osuStatus().then((s) => s.osu), null, { polling: 100, timeout: 15000 });
check((await status()).osu === true, "osu! is started when the skin is confirmed");
check(idx > 0 && /Skin = WhiteCat/.test(readFileSync(join(osuDir, "osu!.player.cfg"), "utf8")), "the chosen skin is written to osu!'s config");
check(existsSync(join(osuDir, "Songs")) && existsSync(join(osuDir, "Skins", "WhiteCat")), "maps and skins were copied into osu!'s folders");
await page.evaluate(() => window.__poipiu.machine.endSession());
await page.waitForFunction(() => window.poipiuHost.osuStatus().then((s) => !s.osu), null, { polling: 100, timeout: 10000 });
check((await status()).osu === false, "osu! is closed when the session ends");
await app.close();
console.log(problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nALL OK");
process.exit(problems.length ? 1 : 0);
