// The real kiosk in Electron: data survives restarts, the page has no Node access, the operator can quit.
// Run under a virtual display:  xvfb-run -a node tools/e2e-electron.mjs <map.osz>
import { _electron as electron } from "playwright-core";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [osz] = process.argv.slice(2);
const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
console.log("building the web app...");
execSync("npx vite build", { stdio: "ignore" });
const userData = mkdtempSync(join(tmpdir(), "poipiu-kiosk-"));
const launch = () => electron.launch({
  executablePath: "node_modules/electron/dist/electron",
  args: ["electron/main.mjs", "--windowed", "--no-sandbox", "--disable-gpu"],
  env: { ...process.env, POIPIU_DATA_DIR: userData },
});
const ready = async (app) => { const p = await app.firstWindow(); p.on("pageerror", (e) => problems.push("pageerror: " + e.message)); await p.waitForFunction(() => window.__poipiu?.app); return p; };

// ---- first run: install content, use the machine
let app = await launch();
let page = await ready(app);
check(await page.evaluate(() => window.poipiuHost?.isKiosk === true), "page runs inside the kiosk and sees the host bridge");
check(await page.evaluate(() => typeof window.require === "undefined" && typeof window.process === "undefined"), "the page has no access to Node");
await page.keyboard.press("Control+Shift+KeyO");
await page.setInputFiles("#files", [osz]);
await page.waitForFunction(() => window.__poipiu.library.entries.length > 0, null, { timeout: 30000 });
await page.click("#op-close");
check(existsSync(join(userData, "content")) && readdirSync(join(userData, "content")).length === 1, "map copied into the content folder");
await page.keyboard.press("KeyT");
await page.evaluate(() => {
  const m = window.__poipiu.machine, lib = window.__poipiu.library;
  m.cards.adjust("A3F2", 777, "test");
  m.setConfig({ credits: { playsPerDeposit: 5 } });
  m.boards.insert(lib.entries[0].mapKey, { name: "POIPIU", score: 123456, at: Date.now() });
});
check(readdirSync(join(userData, "data")).includes("cards.json"), "card balance written to disk");
// Native input events go through the same filter as a real keyboard (used below to quit).
const nativeKey = (keyCode, modifiers = []) => app.evaluate(({ BrowserWindow }, a) => {
  const wc = BrowserWindow.getAllWindows()[0].webContents;
  wc.sendInputEvent({ type: "keyDown", keyCode: a.keyCode, modifiers: a.modifiers });
  wc.sendInputEvent({ type: "keyUp", keyCode: a.keyCode, modifiers: a.modifiers });
}, { keyCode, modifiers });
const shot1 = join(userData, "kiosk.png");
await page.screenshot({ path: shot1 });
await app.close();

// ---- second run: everything is still there
app = await launch();
page = await ready(app);
await page.waitForFunction(() => window.__poipiu.library.entries.length > 0, null, { timeout: 30000 });
const s = await page.evaluate(() => {
  const m = window.__poipiu.machine, lib = window.__poipiu.library;
  return { maps: lib.entries.length, balance: m.cards.get("A3F2")?.tickets, plays: m.cfg.credits.playsPerDeposit, top: m.boards.list(lib.entries[0].mapKey)[0]?.name, screen: m.screen };
});
console.log("after restart:", JSON.stringify(s));
check(s.maps > 0, "maps restored after restart");
check(s.balance === 777, "card balance survived the restart (777)");
check(s.plays === 5, "operator rules survived the restart");
check(s.top === "POIPIU", "ranking survived the restart");
check(s.screen === "idle", "starts in the idle screen");
await page.screenshot({ path: join(userData, "kiosk-2.png") });

// ---- the operator can leave with Ctrl+Shift+Q
const closed = new Promise((res) => app.process().once("exit", res));
await nativeKey("Q", ["control", "shift"]);
const exited = await Promise.race([closed.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]);
check(exited, "Ctrl+Shift+Q quits the kiosk");
console.log("screenshots in", userData);
if (problems.length) { console.log("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("\nALL OK");
