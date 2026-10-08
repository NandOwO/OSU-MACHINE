import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { OsuSupervisor, findCfg, findReplay, readOsuConfig, setSkinInCfg, skinFolderFor, syncContent } from "../electron/osuHost.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "poipiu-osu-"));
const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe("osu! folder helpers", () => {
  it("sets the Skin line, keeping the rest and the line endings", () => {
    const d = tmp();
    writeFileSync(join(d, "osu!.player.cfg"), "Volume = 1\r\nSkin = Default\r\nFullscreen = 1\r\n");
    expect(findCfg(d)).toMatch(/osu!\.player\.cfg$/);
    expect(setSkinInCfg(d, "WhiteCat")).toBe(true);
    expect(readFileSync(join(d, "osu!.player.cfg"), "utf8")).toBe("Volume = 1\r\nSkin = WhiteCat\r\nFullscreen = 1\r\n");
  });
  it("adds the Skin line when missing, and reports no config", () => {
    const d = tmp();
    expect(setSkinInCfg(d, "X")).toBe(false);
    writeFileSync(join(d, "osu!.a.cfg"), "Volume = 1");
    setSkinInCfg(d, "X");
    expect(readFileSync(join(d, "osu!.a.cfg"), "utf8")).toBe("Volume = 1\nSkin = X\n");
  });
  it("installs maps into Songs and skins into Skins once, and ignores unsafe paths", () => {
    const osu = tmp(), content = tmp();
    writeFileSync(join(content, "Kimi.osz"), zip({ "a.osu": "x", "audio.mp3": "y", "../evil.txt": "no" }));
    writeFileSync(join(content, "WhiteCat.osk"), zip({ "skin.ini": "[General]\nName: W" }));
    expect(syncContent(osu, content)).toEqual({ maps: ["Kimi.osz"], skins: ["WhiteCat.osk"] });
    expect(existsSync(join(osu, "Songs", "Kimi", "a.osu"))).toBe(true);
    expect(existsSync(join(osu, "Skins", "WhiteCat", "skin.ini"))).toBe(true);
    expect(existsSync(join(osu, "Songs", "evil.txt"))).toBe(false);
    expect(syncContent(osu, content)).toEqual({ maps: [], skins: [] });
  });
  it("skin folder names", () => { expect(skinFolderFor("WhiteCat.osk")).toBe("WhiteCat"); expect(skinFolderFor(undefined)).toBeNull(); expect(skinFolderFor("m.osz")).toBeNull(); });
  it("finds the newest replay written after a time, and gives up", async () => {
    const d = tmp(); mkdirSync(join(d, "Replays"));
    const old = join(d, "Replays", "old.osr"), fresh = join(d, "Replays", "fresh.osr");
    writeFileSync(old, "old"); writeFileSync(fresh, "fresh");
    const t = Date.now() / 1000;
    utimesSync(old, t - 100, t - 100); utimesSync(fresh, t, t);
    expect(new TextDecoder().decode((await findReplay(d, Date.now() - 5000, { timeoutMs: 200 }))!)).toBe("fresh");
    expect(await findReplay(d, Date.now() + 60000, { timeoutMs: 300, pollMs: 50 })).toBeNull();
  });
  it("reads osu.json; absent or without osuDir means option B is off", () => {
    const d = tmp();
    expect(readOsuConfig(join(d, "osu.json"))).toBeNull();
    writeFileSync(join(d, "osu.json"), JSON.stringify({ osuDir: "C:\\osu!", tosuExe: "C:\\tosu\\tosu.exe" }));
    expect(readOsuConfig(join(d, "osu.json"))).toMatchObject({ osuDir: "C:\\osu!", osuExe: "osu!.exe", launch: true });
    writeFileSync(join(d, "osu.json"), "{}");
    expect(readOsuConfig(join(d, "osu.json"))).toBeNull();
  });
});

describe("OsuSupervisor (fake programs)", () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cfg = (osuDir: string, script: string) => ({ osuDir, osuExe: process.execPath, osuArgs: ["-e", script], tosuExe: null, tosuArgs: [], launch: true });
  it("restarts osu! when it dies, and stops for good on stopOsu", async () => {
    const d = tmp();
    const sup = new OsuSupervisor(cfg(d, "setTimeout(() => process.exit(1), 60)"), tmp(), { restartDelay: 30 });
    sup.prepare(null);
    await wait(500);
    expect(sup.status().osuRestarts).toBeGreaterThanOrEqual(2);
    sup.stopOsu();
    const n = sup.status().osuRestarts;
    await wait(300);
    expect(sup.status().osuRestarts).toBe(n);
    expect(sup.status().osu).toBe(false);
  });
  it("prepare installs content, sets the skin and starts osu!", async () => {
    const d = tmp(), content = tmp();
    writeFileSync(join(d, "osu!.u.cfg"), "Skin = Default\n");
    writeFileSync(join(content, "WhiteCat.osk"), zip({ "skin.ini": "x" }));
    const sup = new OsuSupervisor(cfg(d, "setInterval(() => {}, 1000)"), content);
    const r = sup.prepare("WhiteCat.osk");
    expect(r).toEqual({ synced: { maps: [], skins: ["WhiteCat.osk"] }, skinSet: true });
    expect(readFileSync(join(d, "osu!.u.cfg"), "utf8")).toBe("Skin = WhiteCat\n");
    await wait(200);
    expect(sup.status().osu).toBe(true);
    sup.stopAll();
  });
});
