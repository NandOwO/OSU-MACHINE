// The real kiosk against a tosu-like server: (1) it connects although the page is file:// and the server refuses that origin,
// (2) a map that is ONLY in osu!'s Songs folder (never imported into POIPIU) is read from disk and pays tickets.
// Run under a virtual display:  xvfb-run -a npx tsx tools/e2e-electron-tosu.mjs
import { _electron as electron } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBeatmap } from "../src/beatmap/parser.ts";
import { scenarioSnapshots } from "../src/osu/mock.ts";
import { MockTosuServer } from "../src/osu/mockServer.ts";
import { emptySnapshot } from "../src/osu/types.ts";

const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
execSync("npx vite build", { stdio: "ignore" });

// a map that exists only inside a fake osu! folder
const objs = Array.from({ length: 80 }, (_, i) => `${100 + (i % 6) * 60},${100 + (i % 4) * 50},${1000 + i * 400},1,0,0:0:0:0:`).join("\n");
const osuText = `osu file format v14\n[General]\nMode: 0\n[Metadata]\nTitle:Only In Osu\nArtist:Nobody\nVersion:Solo\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.8\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n${objs}\n`;
const osuDir = mkdtempSync(join(tmpdir(), "fake-osu-")), userData = mkdtempSync(join(tmpdir(), "poipiu-kiosk-"));
const songDir = join(osuDir, "Songs", "999 Nobody - Only In Osu");
mkdirSync(songDir, { recursive: true });
writeFileSync(join(songDir, "Nobody - Only In Osu [Solo].osu"), osuText);
writeFileSync(join(osuDir, "osu!.player.cfg"), "Skin = Default\n");
writeFileSync(join(userData, "osu.json"), JSON.stringify({ osuDir, osuExe: process.execPath, osuArgs: ["-e", "setInterval(() => {}, 1000)"], launch: false }));

const srv = new MockTosuServer(true);
await srv.listen(24050);
const app = await electron.launch({
  executablePath: "node_modules/electron/dist/electron",
  args: ["electron/main.mjs", "--windowed", "--no-sandbox", "--disable-gpu", "--source=tosu", "--verify=log"],
  env: { ...process.env, POIPIU_DATA_DIR: userData },
});
const page = await app.firstWindow();
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
await page.waitForFunction(() => window.__osu, null, { timeout: 20000 });
await page.waitForFunction(() => window.__osu.feed.connected, null, { polling: 100, timeout: 10000 }).catch(() => {});
check(await page.evaluate(() => window.__osu.feed.connected), "connects to a tosu that refuses file:// origins");
check(srv.origins.length > 0 && srv.origins.every((o) => o.startsWith("http://127.0.0.1")), `the handshake carries a local origin (${srv.origins.at(-1)})`);
srv.send({ ...emptySnapshot("songSelect"), title: "T", version: "V" });
await page.waitForFunction(() => window.__osu.feed.lastRaw, null, { polling: 100, timeout: 5000 }).catch(() => {});
check(await page.evaluate(() => window.__osu.feed.lastRaw?.state?.name) === "selectSong", "a message from tosu reaches the page");
await page.keyboard.press("Control+Shift+KeyD"); await page.waitForTimeout(700);
check((await page.locator("#osu-diag").inputValue()).includes("CONECTADO"), "the diagnostic panel says CONECTADO");
await page.keyboard.press("Control+Shift+KeyD");

// the song reader refuses anything outside the songs folder
const read = (d, f) => page.evaluate(([d2, f2]) => window.poipiuHost.osuReadSongFile(d2, f2).then((b) => b && b.length), [d, f]);
check((await read(songDir, "Nobody - Only In Osu [Solo].osu")) > 100, "the .osu is read from osu!'s songs folder");
check((await read(songDir, "../../osu!.player.cfg")) === null && (await read(osuDir, "osu!.player.cfg")) === null, "files outside the songs folder are refused");

// a play of that map, which POIPIU has never imported
await page.keyboard.press("KeyT"); await page.waitForTimeout(300);
await page.click("#start"); await page.waitForTimeout(300);
await page.click("#tut-skip"); await page.waitForTimeout(500);
await page.click("#skin-ok"); await page.waitForTimeout(500);
check(await page.evaluate(() => !window.__poipiu.library.entries.some((e) => e.entry.beatmap.metadata.title === "Only In Osu")), "the map is not in POIPIU's library");
const map = parseBeatmap(osuText);
const info = { osuFile: "Nobody - Only In Osu [Solo].osu", title: "Only In Osu", version: "Solo" };
const snaps = scenarioSnapshots(map, info, "complete").map((s) => ({ ...s, dir: songDir }));
await srv.play(snaps, 2);
await page.waitForFunction(() => window.__poipiu.machine.screen === "results", null, { polling: 200, timeout: 20000 }).catch(() => {});
const res = await page.evaluate(() => { const r = window.__poipiu.machine.results; return r && { tickets: r.tickets, score: r.outcome.score, max: r.outcome.maxScore, invalid: r.outcome.invalid ?? null }; });
check(!!res && res.tickets > 0 && res.score === res.max && !res.invalid, `a map only in osu! pays tickets (${JSON.stringify(res)})`);
await app.close(); await srv.close();
console.log(problems.length ? "\nPROBLEMS:\n" + problems.join("\n") : "\nALL OK");
process.exit(problems.length ? 1 : 0);
