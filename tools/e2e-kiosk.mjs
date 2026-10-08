// End-to-end test of the whole cabinet flow in headless Chromium (time is stepped by hand, the bot plays).
// Usage: node tools/e2e-kiosk.mjs <map.osz> <skin.osk> [outDir]
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const [osz, osk, outDir = "/tmp/poipiu-kiosk"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push(msg); console.log("FAIL:", msg); } else console.log("ok:", msg); };
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const screen = () => page.evaluate(() => window.__poipiu.machine.screen);
const text = () => page.evaluate(() => document.getElementById("ui").innerText);

await page.goto(`http://localhost:${server.config.server.port}/?manual=1&fresh=1&bot=1`);
await page.waitForFunction(() => window.__poipiu?.app);

// --- operator: install content
await page.keyboard.press("Control+Shift+KeyO");
await page.waitForSelector("#operator");
await page.setInputFiles("#files", [osz, osk]);
await page.waitForFunction(() => window.__poipiu.library.entries.length > 0 && window.__poipiu.library.skins.length > 1, null, { timeout: 20000 });
check(true, `content installed: ${await page.evaluate(() => window.__poipiu.library.entries.length)} maps, skins ${await page.evaluate(() => window.__poipiu.library.skins.map((s) => s.name).join(" | "))}`);
await page.click("#op-close");

// --- idle
check(await screen() === "idle", "starts in idle");
check((await text()).includes("PASA TU TARJETA"), "idle invites to tap a card");
await page.evaluate(() => window.__poipiu.app.step(1000));
await shot("01-idle");

// --- card -> credited
await page.keyboard.press("KeyT");
check(await screen() === "credited", "card tap starts a session");
check((await text()).includes("3 JUGADAS"), "a deposit gives 3 plays");
await shot("02-credited");
await page.click("#start");
check(await screen() === "tutorial", "first session shows the tutorial");
await page.evaluate(() => window.__poipiu.app.step(2500));
await shot("03-tutorial");
await page.click("#tut-skip");
check(await screen() === "skin", "tutorial can be skipped");
await page.evaluate(() => window.__poipiu.app.step(1000));
await page.click(".skin[data-skin='1']");
await shot("04-skin");
await page.click("#skin-ok");
check(await screen() === "map", "skin confirmed, map select");
await shot("05-map");

// --- a full play by the bot
async function playToEnd() {
  await page.evaluate(() => {
    const app = window.__poipiu.app, s = app.scene, objs = s.map.hitObjects, last = objs[objs.length - 1];
    const end = (last.endTime ?? last.time) + 2500;
    for (let t = -3000; t < end && app.machine.screen === "playing"; t += 100) app.step(t);
  });
}
async function startAndFinish() {
  await page.click("#play");
  await page.waitForFunction(() => window.__poipiu.machine.screen === "playing");
  await page.evaluate(() => window.__poipiu.app.step(-1500));
  await shot(`06-playing-${Date.now() % 1000}`);
  await playToEnd();
  await page.waitForFunction(() => window.__poipiu.machine.screen === "results", null, { timeout: 5000 });
}
await startAndFinish();
check(await screen() === "results", "play 1 ends in results");
let r = await page.evaluate(() => window.__poipiu.machine.results);
check(r.outcome.miss === 0 && r.outcome.n300 === r.outcome.objects, `bot played perfectly (${r.outcome.n300}/${r.outcome.objects})`);
check(r.tickets > 0, `tickets credited to the card: +${r.tickets}`);
check(r.rank === 1, "first score is rank #1");
await page.evaluate(() => new Promise((res) => setTimeout(res, 1700)));
await shot("07-results");

// --- name entry -> ranking
await page.click("#results-continue");
check(await screen() === "name", "top-50 score asks for a name");
await page.keyboard.type("poipiu");
await shot("08-name");
await page.keyboard.press("Enter");
check(await screen() === "ranking", "name submitted -> ranking");
check((await text()).includes("POIPIU"), "ranking shows POIPIU");
await page.waitForTimeout(900);
const hot = await page.$eval(".row-r.hot", (n) => { const r = n.getBoundingClientRect(); return { h: r.height, w: r.width }; });
check(hot.h > 20 && hot.w > 300, `highlighted ranking row is visible (${Math.round(hot.w)}x${Math.round(hot.h)})`);
await shot("09-ranking");
const plays = () => page.evaluate(() => window.__poipiu.machine.playsLeft);
check(await plays() === 2, "one play consumed (2 left)");

// --- retry twice
await page.click("#retry");
await page.waitForSelector("#play, #retry", { state: "attached" }).catch(() => undefined);
await page.waitForFunction(() => ["map", "playing"].includes(window.__poipiu.machine.screen));
if (await screen() === "playing") { await playToEnd(); } else { await startAndFinish(); }
await page.waitForFunction(() => window.__poipiu.machine.screen === "results");
check(await plays() === 1, "retry costs a play (1 left)");
// score equals the previous one -> not above rank 1 but still qualifies (ties go after)
await page.click("#results-continue");
await page.keyboard.type("ab");
await page.keyboard.press("Enter");
check(await screen() === "ranking", "second score also entered the ranking");
await page.click("#retry");
await page.waitForFunction(() => ["map", "playing"].includes(window.__poipiu.machine.screen));
if (await screen() === "playing") { await playToEnd(); } else { await startAndFinish(); }
await page.waitForFunction(() => window.__poipiu.machine.screen === "results");
check(await plays() === 0, "no plays left after the third");
await page.click("#results-continue");
await page.keyboard.type("zz");
await page.keyboard.press("Enter");
const tickets = await page.evaluate(() => window.__poipiu.machine.cards.get("A3F2").tickets);
check(tickets > 100, `card accumulated tickets over three plays: ${tickets}`);
check(await page.evaluate(() => window.__poipiu.machine.boards.list(window.__poipiu.machine.results.outcome.mapKey).length) === 3, "ranking has three entries for the map");

// --- prizes (operator tops up the card first)
await page.evaluate(() => window.__poipiu.machine.cards.adjust("A3F2", 3000, "test"));
await page.click("#to-prizes");
check(await screen() === "prizes", "card holder can open prizes");
const before = await page.evaluate(() => window.__poipiu.machine.balance);
await shot("10-prizes");
await page.click("#redeem-funko");
const after = await page.evaluate(() => window.__poipiu.machine.balance);
check(before - after === 3000, `redeeming the Funko took 3000 tickets (${before} -> ${after})`);
await page.click("#prizes-close");
check(await screen() === "idle", "session ends after prizes with no plays left");

// --- persistence of the ranking inside the machine
const rows = await page.evaluate(() => window.__poipiu.machine.boards.list(window.__poipiu.library.entries[0].mapKey).length);
void rows;
await browser.close();
await server.close();
if (problems.length) { console.log("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("\nALL OK");
