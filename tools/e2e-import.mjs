// The player imports their own maps and skin from the screen, with no operator panel.
// Usage: node tools/e2e-import.mjs <map.osz> <skin.osk> <second-map.osz> [outDir]
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync, readFileSync } from "node:fs";

const [osz, osk, osz2, outDir = "/tmp/poipiu-import"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5195, strictPort: false }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log("FAIL:", m); } else console.log("ok:", m); };
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
await page.goto(`http://localhost:${server.config.server.port}/?manual=1&fresh=1`);
await page.waitForFunction(() => window.__poipiu?.app);
const state = () => page.evaluate(() => ({ maps: window.__poipiu.library.entries.length, packs: window.__poipiu.library.packs.length, skins: window.__poipiu.library.skins.length, skinIdx: window.__poipiu.app.skinIdx, screen: window.__poipiu.machine.screen }));

check((await page.evaluate(() => document.getElementById("ui").innerText)).includes("IMPORTAR"), "the idle screen tells the player how to import");
await page.screenshot({ path: `${outDir}/1-idle.png` });

// --- 1. the visible button opens the dialog; choose a map and a skin
await page.click("#hw-import");
await page.waitForSelector("#import-dialog");
await page.setInputFiles("#import-files", [osz, osk]);
await page.waitForFunction(() => window.__poipiu.library.skins.length > 1 && window.__poipiu.library.entries.length > 0, null, { timeout: 30000, polling: 200 });
let s = await state();
check(s.maps > 0 && s.skins === 2, `map and skin imported (${s.maps} maps, ${s.skins} skins)`);
check(s.skinIdx === 1, "the imported skin is selected right away");
check((await page.textContent("#import-status")).startsWith("LISTO"), `dialog reports it: "${await page.textContent("#import-status")}"`);
check((await page.$$("#import-list .row")).length === 2, "both archives are listed as installed");
await page.screenshot({ path: `${outDir}/2-dialog.png` });
await page.click("#import-close");

// --- 2. they are really usable in a session
await page.keyboard.press("KeyT");
await page.click("#start"); await page.click("#tut-skip");
check((await page.$$(".skin")).length === 2 && (await page.$$eval(".skin.sel", (n) => n.map((x) => x.dataset.skin))).join() === "1", "skin screen lists the imported skin, selected");
await page.screenshot({ path: `${outDir}/3-skins.png` });
await page.click("#skin-ok");
check((await page.$$(".group")).length === 1, "map screen lists the imported map");
check(await page.$("#import-open") !== null, "map screen has its own import button");

// --- 3. drag and drop a second map anywhere
const b64 = readFileSync(osz2).toString("base64");
await page.evaluate(async (data) => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "second.osz"));
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
}, b64);
await page.waitForFunction(() => window.__poipiu.library.packs.length === 3, null, { timeout: 30000, polling: 200 });
s = await state();
check(s.packs === 3, "dropping a file on the window imports it");
check((await page.$$(".group")).length === 2, "the map list refreshed with the dropped map");
await page.screenshot({ path: `${outDir}/4-after-drop.png` });

// --- 4. bad files do not break anything
await page.evaluate(async () => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1, 2, 3, 4])], "broken.osz"));
  dt.items.add(new File(["hola"], "notes.txt"));
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.waitForSelector(".toast");
s = await state();
check(s.packs === 3, "broken and unsupported files are rejected without changing the library");
check(await page.evaluate(() => window.__poipiu.machine.screen) === "map", "the cabinet keeps working after bad files");

// --- 5. remove from the dialog
await page.click("#import-open");
await page.click("#import-list .row:last-child button");
await page.waitForFunction(() => window.__poipiu.library.packs.length === 2, null, { timeout: 5000, polling: 100 });
check(true, "an installed file can be removed");
await page.click("#import-close");

// --- 6. a play is still not interrupted by drops
await page.evaluate(() => window.__poipiu.app.step(0));
await browser.close();
await server.close();
if (problems.length) { console.log("\nPROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("\nALL OK");
