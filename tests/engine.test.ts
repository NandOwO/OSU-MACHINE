import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { autoplay } from "../src/engine/autoplay.js";
import { GameEngine } from "../src/engine/GameEngine.js";
import { runReplay } from "../src/engine/replayRunner.js";
import { maxScoreV1 } from "../src/scoring/maxScore.js";
import { simulate } from "../src/sim/replaySim.js";

const MAP = (objects: string, extra = "") => parseBeatmap(
  `osu file format v14\n[General]\nMode: 0\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.8\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n${objects}\n${extra}`,
);
const CIRCLES = ["100,100,1000", "200,120,1500", "300,140,2000", "400,160,2500", "300,260,3000", "200,280,3500"].map((c) => `${c},1,0,0:0:0:0:`).join("\n");
const WITH_SLIDER = `${CIRCLES}\n50,50,4000,2,0,L|250:50,1,200,0|0,0:0|0:0,0:0:0:0:\n300,300,5000,1,0,0:0:0:0:`;

function play(map: ReturnType<typeof MAP>, samples: { t: number; x: number; y: number; mask: number }[]) {
  const e = new GameEngine(map);
  for (const s of samples) e.input(s.t, s.x, s.y, s.mask);
  e.tick((samples[samples.length - 1]?.t ?? 0) + 2000);
  return e;
}

describe("GameEngine with a perfect player", () => {
  it("scores the closed-form maximum on a circles-only map", () => {
    const map = MAP(CIRCLES);
    const e = play(map, autoplay(map));
    expect(e.n300).toBe(6);
    expect(e.miss).toBe(0);
    expect(e.score).toBe(maxScoreV1(map));
    expect(e.maxCombo).toBe(6);
  });
  it("scores the maximum on a map with a slider (head, tick, tail)", () => {
    const map = MAP(WITH_SLIDER);
    const e = play(map, autoplay(map));
    expect(e.n300).toBe(8);
    expect(e.miss).toBe(0);
    expect(e.score).toBe(maxScoreV1(map));
    expect(e.finished).toBe(true);
  });
});

describe("GameEngine judgements", () => {
  it("grades a press by its distance from the hit time", () => {
    const map = MAP("100,100,1000,1,0,0:0:0:0:");
    const at = (dt: number) => {
      const e = new GameEngine(map);
      e.input(1000 + dt - 10, 100, 100, 0);
      e.input(1000 + dt, 100, 100, 1);
      e.tick(3000);
      return [e.n300, e.n100, e.n50, e.miss];
    };
    expect(at(0)).toEqual([1, 0, 0, 0]);
    expect(at(31)).toEqual([1, 0, 0, 0]);   // OD 8: 300 window is 32 ms (strict)
    expect(at(50)).toEqual([0, 1, 0, 0]);
    expect(at(100)).toEqual([0, 0, 1, 0]);
    expect(at(-100)).toEqual([0, 0, 1, 0]);
  });
  it("misses when nothing is pressed or the press is off the circle", () => {
    const map = MAP("100,100,1000,1,0,0:0:0:0:");
    const e1 = new GameEngine(map);
    e1.tick(0); e1.input(0, 100, 100, 0); e1.input(2000, 100, 100, 0);
    expect(e1.miss).toBe(1);
    const e2 = new GameEngine(map);
    e2.input(990, 300, 300, 0); e2.input(1000, 300, 300, 1); e2.tick(3000);
    expect(e2.miss).toBe(1);
  });
  it("counts a very early press on the circle as a miss and breaks the combo", () => {
    const map = MAP("100,100,1000,1,0,0:0:0:0:\n200,100,1500,1,0,0:0:0:0:");
    const e = new GameEngine(map);
    e.input(500, 100, 100, 0);
    e.input(600, 100, 100, 1);
    e.input(700, 100, 100, 0);
    e.input(1500, 200, 100, 0);
    e.input(1500, 200, 100, 1);
    e.tick(3000);
    expect([e.n300, e.miss, e.combo]).toEqual([1, 1, 1]);
  });
  it("does not let a later circle be hit while an earlier one is still pending (note lock)", () => {
    const map = MAP("100,100,1000,1,0,0:0:0:0:\n300,100,1040,1,0,0:0:0:0:");
    const e = new GameEngine(map);
    e.input(1030, 300, 100, 0);
    e.input(1040, 300, 100, 1); // on the second circle, but the first is not resolved yet
    e.tick(3000);
    expect(e.miss).toBe(2);
  });
  it("breaks the combo on a lost slider tick but not on a lost tail", () => {
    const map = MAP("50,50,1000,2,0,L|250:50,2,200,0|0,0:0|0:0,0:0:0:0:");
    const e = new GameEngine(map);
    e.input(990, 50, 50, 0);
    e.input(1000, 50, 50, 1);
    e.input(1200, 50, 50, 0); // released early: loses the repeat and the tail
    e.tick(4000);
    expect(e.results[0]!.judgement).toBe(50);
  });
  it("judges spinners by rotation", () => {
    const map = MAP("256,192,1000,12,0,3000,0:0:0:0:");
    const bot = autoplay(map);
    const good = play(map, bot);
    expect(good.n300).toBe(1);
    const none = play(map, bot.map((s) => ({ ...s, mask: 0 })));
    expect(none.miss).toBe(1);
  });
});

// Equivalence with the replay simulator on real replays (private fixtures, skipped when absent).
for (const f of ["erisu-insane", "kimi", "shiori"]) {
  const osu = `fixtures/private/${f}.osu`, osr = `fixtures/private/${f}.osr`;
  describe.skipIf(!(existsSync(osu) && existsSync(osr)))(`engine equals simulator: ${f}`, () => {
    const map = applyStacking(parseBeatmap(readFileSync(osu, "utf8")));
    const rep = parseReplay(new Uint8Array(readFileSync(osr)));
    const sim = simulate(map, rep);
    const eng = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
    it("same judgements, combo and score", () => {
      expect([eng.n300, eng.n100, eng.n50, eng.miss, eng.maxCombo, eng.score]).toEqual([sim.n300, sim.n100, sim.n50, sim.miss, sim.maxCombo, sim.score]);
    });
  });
}
