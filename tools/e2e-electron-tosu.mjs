// The real kiosk (page loaded from file://) must connect to a tosu-like server that refuses file:// origins.
// Run under a virtual display:  xvfb-run -a npx tsx tools/e2e-electron-tosu.mjs
import { _electron as electron } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockTosuServer } from "../src/osu/mockServer.ts";
import { emptySnapshot } from "../src/osu/types.ts";

const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
execSync("npx vite build", { stdio: "ignore" });
const srv = new MockTosuServer(true);
await srv.listen(24050);
const app = await electron.launch({
  executablePath: "node_modules/electron/dist/electron",
  args: ["electron/main.mjs", "--windowed", "--no-sandbox", "--disable-gpu", "--source=tosu"],
  env: { ...process.env, POIPIU_DATA_DIR: mkdtempSync(join(tmpdir(), "poipiu-kiosk-")) },
});
const page = await app.firstWindow();
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
await page.waitForFunction(() => window.__osu, null, { timeout: 20000 });
await page.waitForFunction(() => window.__osu.feed.connected, null, { polling: 100, timeout: 10000 }).catch(() => {});
check(await page.evaluate(() => window.__osu.feed.connected), "the kiosk connects to a tosu that refuses file:// origins");
check(srv.origins.length > 0 && srv.origins.every((o) => o.startsWith("http://127.0.0.1")), `the handshake carries a local origin (${srv.origins.at(-1)})`);
srv.send({ ...emptySnapshot("songSelect"), title: "T", version: "V" });
await page.waitForFunction(() => window.__osu.feed.lastRaw, null, { polling: 100, timeout: 5000 }).catch(() => {});
check(await page.evaluate(() => window.__osu.feed.lastRaw?.state?.name) === "selectSong", "a message from tosu reaches the page");
await page.keyboard.press("Control+Shift+KeyD"); await page.waitForTimeout(700);
check((await page.locator("#osu-diag").inputValue()).includes("CONECTADO"), "the diagnostic panel says CONECTADO");
await app.close(); await srv.close();
console.log(problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nALL OK");
process.exit(problems.length ? 1 : 0);
