import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { autoplay } from "../src/engine/autoplay.js";
import { GameEngine } from "../src/engine/GameEngine.js";
import { activeMs, HealthTracker, maxSafeDrain } from "../src/engine/health.js";
import { runReplay } from "../src/engine/replayRunner.js";
import { DEFAULT_CONFIG, mergeConfig } from "../src/kiosk/config.js";
import { KioskMachine, type PlayOutcome } from "../src/kiosk/machine.js";
import { MemoryStore } from "../src/kiosk/store.js";

const times = (n: number, gap: number, start = 1000) => Array.from({ length: n }, (_, i) => start + i * gap);
const mapOf = (objs: string[], hp = 5) => parseBeatmap(
  `osu file format v14\n[General]\nMode: 0\n[Difficulty]\nHPDrainRate:${hp}\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.8\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n${objs.join("\n")}\n`,
);
const circles = (n: number, gap: number) => Array.from({ length: n }, (_, i) => `${100 + (i % 5) * 60},${100 + (i % 3) * 50},${1000 + i * gap},1,0,0:0:0:0:`);

describe("health model", () => {
  it("a perfect play never loses the bar, however sparse or dense the map is", () => {
    for (const gap of [150, 300, 600, 1500, 4000]) {
      const t = times(80, gap);
      const h = new HealthTracker(t, [], 10, undefined);
      for (const x of t) expect(h.judge(300, x)).toBe(false);
      expect(h.failed).toBe(false);
    }
  });
  it("the maximum safe drain is the edge: a bit more kills a perfect play", () => {
    const t = times(60, 400);
    const d = maxSafeDrain(t, []);
    const run = (drain: number) => { const h = new HealthTracker(t, [], 5, undefined, drain); return t.some((x) => h.judge(300, x)); };
    expect(run(d * 0.99)).toBe(false);
    expect(run(d * 1.05)).toBe(true);
  });
  it("misses hurt much more than 100s, and a run of misses fails", () => {
    const t = times(60, 400);
    const h = new HealthTracker(t, [], 5);
    for (const x of t.slice(0, 20)) h.judge(300, x);
    let failedAt = -1;
    for (let i = 20; i < 60; i++) if (h.judge(0, t[i]!)) { failedAt = i; break; }
    expect(failedAt).toBeGreaterThan(20);
    expect(failedAt).toBeLessThan(30);
  });
  it("does not drain during breaks", () => {
    expect(activeMs(0, 10000, [{ start: 2000, end: 7000 }])).toBe(5000);
    const t = [1000, 2000, 30000, 31000];
    const h = new HealthTracker(t, [{ start: 3000, end: 29000 }], 10);
    expect([300, 300, 300, 300].some((j, i) => h.judge(j as 300, t[i]!))).toBe(false);
  });
});

describe("engine with health", () => {
  it("a perfect bot never fails, and keeps margin at normal HP", () => {
    for (const [hp, minEnd] of [[5, 0.3], [10, 0]] as const) {
      const map = mapOf(circles(60, 300), hp);
      const e = new GameEngine(map);
      for (const s of autoplay(map)) e.input(s.t, s.x, s.y, s.mask);
      e.tick(60000);
      expect(e.failed).toBe(false);
      expect(e.hp).toBeGreaterThan(minEnd);
    }
  });
  it("the drain stops after the last object", () => {
    const map = mapOf(circles(20, 300), 10);
    const e = new GameEngine(map);
    for (const s of autoplay(map)) e.input(s.t, s.x, s.y, s.mask);
    e.tick(8000);
    const hp = e.hp;
    e.tick(120000);
    expect(e.hp).toBe(hp);
  });
  it("a player who never clicks loses, and the engine freezes after the fail", () => {
    const map = mapOf(circles(80, 300), 5);
    const e = new GameEngine(map);
    for (let t = 0; t < 40000; t += 16) e.input(t, 400, 300, 0);
    expect(e.failed).toBe(true);
    expect(e.failTime).not.toBeNull();
    expect(e.failTime!).toBeLessThan(15000);
    const judged = e.judged;
    e.input(41000, 400, 300, 0);
    expect(e.judged).toBe(judged);
    expect(e.drainEvents().some((x) => x.type === "fail")).toBe(true);
  });
  it("time runs even if the player never produces any input", () => {
    const map = mapOf(circles(80, 300), 5);
    const e = new GameEngine(map);
    for (let t = 0; t < 40000; t += 50) e.tick(t); // no input() call at all
    expect(e.failed).toBe(true);
  });
  it("health can be switched off", () => {
    const map = mapOf(circles(80, 300), 5);
    const e = new GameEngine(map, { health: false });
    for (let t = 0; t < 40000; t += 16) e.input(t, 400, 300, 0);
    expect(e.failed).toBe(false);
    expect(e.judged).toBe(80);
  });
});

// The health model was fitted on these three real replays; this keeps it honest (private fixtures, skipped when absent).
const REAL: [string, number | null, number | null][] = [["erisu-insane", 72300, 73000], ["kimi", 81200, 82000], ["shiori", null, null]];
for (const [f, lo, hi] of REAL) {
  const osu = `fixtures/private/${f}.osu`, osr = `fixtures/private/${f}.osr`;
  describe.skipIf(!(existsSync(osu) && existsSync(osr)))(`health on a real replay: ${f}`, () => {
    const map = applyStacking(parseBeatmap(readFileSync(osu, "utf8")));
    const rep = parseReplay(new Uint8Array(readFileSync(osr)));
    const e = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
    it(lo === null ? "a completed play does not fail" : "fails where the real game ended the play", () => {
      if (lo === null) expect(e.failed).toBe(false);
      else { expect(e.failed).toBe(true); expect(e.failTime!).toBeGreaterThanOrEqual(lo); expect(e.failTime!).toBeLessThanOrEqual(hi!); }
    });
  });
}

describe("failed plays in the machine", () => {
  const outcome = (extra: Partial<PlayOutcome> = {}): PlayOutcome => ({ mapKey: "m", objects: 300, score: 900_000, maxScore: 1_000_000, accuracy: 0.9, maxCombo: 100, n300: 250, n100: 30, n50: 5, miss: 15, ...extra });
  const start = () => { const m = new KioskMachine(new MemoryStore()); m.scanCard("A3F2"); m.continueFromCredit(); if (m.screen === "tutorial") m.finishTutorial(); m.chooseSkin(); m.startPlay(); return m; };
  it("pays no tickets and cannot enter the ranking, but still costs the play", () => {
    const m = start();
    const r = m.finishPlay(outcome({ failed: true }));
    expect(r.tickets).toBe(0);
    expect(r.rank).toBeNull();
    expect(m.playsLeft).toBe(2);
    expect(m.cards.get("A3F2")!.tickets).toBe(0);
    m.continueFromResults();
    expect(m.screen).toBe("map");
  });
  it("the same score without failing does pay and rank", () => {
    const m = start();
    const r = m.finishPlay(outcome());
    expect(r.tickets).toBeGreaterThan(0);
    expect(r.rank).toBe(1);
  });
  it("defaults: health on, 2 minutes of inactivity, both configurable", () => {
    expect(DEFAULT_CONFIG.health.enabled).toBe(true);
    expect(DEFAULT_CONFIG.session.inactivitySeconds).toBe(120);
    const c = mergeConfig({ health: { enabled: false }, session: { inactivitySeconds: 45 } });
    expect(c.health.enabled).toBe(false);
    expect(c.session.inactivitySeconds).toBe(45);
    expect(mergeConfig({ session: { inactivitySeconds: 1 } }).session.inactivitySeconds).toBe(120);
  });
});
