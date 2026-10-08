import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { KioskMachine } from "../src/kiosk/machine.js";
import { MemoryStore } from "../src/kiosk/store.js";
import { maxScoreV1 } from "../src/scoring/maxScore.js";
import { OsuBridge, type BridgeEvent, type BridgeOptions } from "../src/osu/bridge.js";
import { checkMods, modsFromFlags } from "../src/osu/mods.js";
import { scenarioSnapshots, type Scenario } from "../src/osu/mock.js";
import { ManualFeed, normalizeTosu } from "../src/osu/tosu.js";
import { emptySnapshot } from "../src/osu/types.js";
import { verifyReplay } from "../src/osu/verify.js";

// 80 circles on a zig-zag, 400 ms apart: enough objects to pay tickets.
const objs = Array.from({ length: 80 }, (_, i) => `${100 + (i % 6) * 60},${100 + (i % 4) * 50},${1000 + i * 400},1,0,0:0:0:0:`).join("\n");
const map = parseBeatmap(`osu file format v14\n[General]\nMode: 0\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.8\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n${objs}\n`);
const ref = { mapKey: "mock-map", map, maxScore: maxScoreV1(map) };
const info = { osuFile: "C:/osu!/Songs/x/map.osu", title: "Mock", artist: "POIPIU", version: "Test" };

let clock = 1_000_000;
function setup(opt: Partial<BridgeOptions> = {}, card = true) {
  clock = 1_000_000;
  const m = new KioskMachine(new MemoryStore(), undefined, () => clock);
  if (card) m.scanCard("A3F2"); else m.insertCoin();
  m.continueFromCredit(); if (m.screen === "tutorial") m.finishTutorial(); m.chooseSkin();
  const events: BridgeEvent[] = [];
  const bridge = new OsuBridge(m, { resolve: () => ref, verify: "off", onEvent: (e) => events.push(e), ...opt });
  const feed = new ManualFeed(); bridge.attach(feed);
  const run = async (kind: Scenario) => { for (const s of scenarioSnapshots(map, info, kind)) feed.emit(s); await bridge.idle(); };
  return { m, bridge, feed, events, run };
}

describe("OsuBridge: a real osu! play becomes a play of the machine", () => {
  it("a perfect play pays tickets and costs one play", async () => {
    const { m, run } = setup();
    await run("complete");
    expect(m.screen).toBe("results");
    expect(m.playsLeft).toBe(2);
    expect(m.results!.outcome.score).toBe(ref.maxScore);
    expect(m.results!.tickets).toBe(100);
    expect(m.cards.get("A3F2")!.tickets).toBe(100);
  });
  it("a sloppy play pays fewer tickets", async () => {
    const { m, run } = setup();
    await run("sloppy");
    expect(m.results!.tickets).toBeGreaterThan(0);
    expect(m.results!.tickets).toBeLessThan(100);
  });
  it("losing all health costs a play and pays nothing", async () => {
    const { m, run } = setup();
    await run("fail");
    expect(m.screen).toBe("results");
    expect(m.results!.outcome.failed).toBe(true);
    expect(m.results!.tickets).toBe(0);
    expect(m.results!.rank).toBeNull();
    expect(m.playsLeft).toBe(2);
  });
  it("quitting in the middle costs a play and goes back to the map screen", async () => {
    const { m, run, events } = setup();
    await run("abandon");
    expect(m.screen).toBe("map");
    expect(m.playsLeft).toBe(2);
    expect(events.some((e) => e.type === "abandon")).toBe(true);
  });
  it("a retry costs two plays (the abandoned one and the new one)", async () => {
    const { m, run } = setup();
    await run("retry");
    expect(m.playsLeft).toBe(1);
    expect(m.screen).toBe("results");
    expect(m.results!.tickets).toBe(100);
  });
  it("forbidden mods: no tickets, no ranking, the play is still spent", async () => {
    const { m, run } = setup();
    await run("mods");
    expect(m.results!.outcome.invalid).toMatch(/MOD NO PERMITIDO/);
    expect(m.results!.tickets).toBe(0);
    expect(m.results!.rank).toBeNull();
    expect(m.playsLeft).toBe(2);
  });
  it("an allowed mod is accepted when the operator permits it", async () => {
    const { m, run } = setup({ allowedMods: ["HD"] });
    // HD alone, not the HD+DT of the scenario
    const snaps = scenarioSnapshots(map, info, "complete").map((s) => ({ ...s, mods: s.state === "songSelect" ? [] : ["HD"] }));
    const feed = new ManualFeed(); const events: BridgeEvent[] = [];
    const b = new OsuBridge(m, { resolve: () => ref, verify: "off", allowedMods: ["HD"], onEvent: (e) => events.push(e) }); b.attach(feed);
    for (const s of snaps) feed.emit(s);
    await b.idle();
    expect(m.results!.outcome.invalid).toBeUndefined();
    void run;
  });
  it("without a card the tickets are lost, as in the rest of the machine", async () => {
    const { m, run } = setup({}, false);
    await run("complete");
    expect(m.results!.tickets).toBe(0);
    expect(m.results!.ticketsLost).toBe(100);
  });
  it("playing with no plays left is reported as a violation", async () => {
    const { m, run, events, feed, bridge } = setup();
    while (m.playsLeft > 0 && m.screen === "map") { expect(m.startPlay()).toBe(true); m.abandonPlay(); }
    expect(m.screen).toBe("idle");
    for (const s of scenarioSnapshots(map, info, "complete").slice(0, 3)) feed.emit(s);
    await bridge.idle();
    expect(events.some((e) => e.type === "violation")).toBe(true);
  });
  it("an unknown map is not paid", async () => {
    const { m, run } = setup({ resolve: () => null });
    await run("complete");
    expect(m.screen).toBe("map");
    expect(m.playsLeft).toBe(2);
  });
  it("strict verification: a play without a replay is not paid", async () => {
    const { m, run } = setup({ verify: "strict", findReplay: async () => null });
    await run("complete");
    expect(m.results!.outcome.invalid).toMatch(/VERIFICAR/);
    expect(m.results!.tickets).toBe(0);
  });
  it("log-only verification pays even without a replay", async () => {
    const { m, run } = setup({ verify: "log", findReplay: async () => null });
    await run("complete");
    expect(m.results!.tickets).toBe(100);
  });
});

describe("mods", () => {
  it("NoMod passes, anything else needs the operator's permission", () => {
    expect(checkMods([]).ok).toBe(true);
    expect(checkMods(["HD"]).ok).toBe(false);
    expect(checkMods(["HD"], ["HD"]).ok).toBe(true);
    expect(checkMods(["AT"], ["AT"]).ok).toBe(false); // autoplay can never be allowed
    expect(checkMods(["DT"], ["DT"]).ok).toBe(false);
  });
  it("reads the mod flags of a replay", () => { expect(modsFromFlags(8 | 64)).toEqual(["HD", "DT"]); expect(modsFromFlags(0)).toEqual([]); });
});

describe("tosu adapter", () => {
  it("normalizes a v2-style message", () => {
    const s = normalizeTosu({
      state: { name: "play" },
      beatmap: { title: "T", artist: "A", version: "V", checksum: "abc", time: { live: 12345 } },
      files: { beatmap: "map.osu" },
      play: { score: 5000, accuracy: 97.5, combo: { current: 10, max: 33 }, hits: { "300": 20, "100": 2, "50": 1, "0": 3 }, mods: { name: "HDDT" }, healthBar: { normal: 100 } },
    });
    expect(s).toMatchObject({ state: "play", score: 5000, maxCombo: 33, n300: 20, n100: 2, n50: 1, miss: 3, md5: "abc", osuFile: "map.osu", timeMs: 12345 });
    expect(s.mods).toEqual(["HD", "DT"]);
    expect(s.accuracy).toBeCloseTo(0.975);
    expect(s.hp).toBeCloseTo(0.5);
  });
  it("maps state names and survives missing fields", () => {
    expect(normalizeTosu({ state: { name: "resultScreen" } }).state).toBe("result");
    expect(normalizeTosu({ state: { name: "selectSong" } }).state).toBe("songSelect");
    expect(normalizeTosu({}).state).toBe("other");
  });
});

const OSU = "fixtures/private/kimi.osu", OSR = "fixtures/private/kimi.osr";
describe.skipIf(!(existsSync(OSU) && existsSync(OSR)))("replay verification on a real replay", () => {
  if (!(existsSync(OSU) && existsSync(OSR))) return;
  const real = applyStacking(parseBeatmap(readFileSync(OSU, "utf8")));
  const osr = new Uint8Array(readFileSync(OSR));
  it("accepts the real score and rejects an inflated one", () => {
    const ok = verifyReplay(real, osr, 0);
    expect(ok.simScore).toBeGreaterThan(0);
    expect(verifyReplay(real, osr, ok.simScore!).ok).toBe(true);
    expect(verifyReplay(real, osr, Math.round(ok.simScore! * 0.985)).ok).toBe(true);
    expect(verifyReplay(real, osr, Math.round(ok.simScore! * 1.4)).ok).toBe(false);
  });
});
void vi; void emptySnapshot;

import { MockTosuServer } from "../src/osu/mockServer.js";
import { TosuFeed, toTosuMessage } from "../src/osu/tosu.js";

describe("tosu over a real WebSocket (mock server)", () => {
  it("round trip: normalize(toTosuMessage(s)) keeps what the machine uses", () => {
    for (const s of scenarioSnapshots(map, info, "sloppy").filter((_, i) => i % 7 === 0)) {
      const back = normalizeTosu(toTosuMessage(s));
      expect(back).toMatchObject({ state: s.state, score: s.score, maxCombo: s.maxCombo, n300: s.n300, n100: s.n100, n50: s.n50, miss: s.miss, osuFile: s.osuFile, timeMs: s.timeMs, mods: s.mods });
      expect(back.accuracy).toBeCloseTo(s.accuracy, 6);
      expect(back.hp).toBeCloseTo(s.hp, 6);
    }
  });
  it("a play streamed through WebSocket -> TosuFeed -> bridge pays like the in-process one", async () => {
    const srv = new MockTosuServer(); await srv.listen();
    const feed = new TosuFeed(srv.url);
    for (let i = 0; i < 100 && srv.clientCount === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(srv.clientCount).toBe(1);
    clock = 1_000_000;
    const m = new KioskMachine(new MemoryStore(), undefined, () => clock);
    m.scanCard("A3F2"); m.continueFromCredit(); if (m.screen === "tutorial") m.finishTutorial(); m.chooseSkin();
    const bridge = new OsuBridge(m, { resolve: () => ref, verify: "off" }); bridge.attach(feed);
    await srv.play(scenarioSnapshots(map, info, "complete"), 1);
    for (let i = 0; i < 100 && m.screen !== "results"; i++) await new Promise((r) => setTimeout(r, 20));
    await bridge.idle();
    expect(m.screen).toBe("results");
    expect(m.results!.tickets).toBe(100);
    feed.dispose(); await srv.close();
  });
});
