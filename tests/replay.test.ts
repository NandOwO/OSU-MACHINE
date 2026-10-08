import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate } from "../src/sim/replaySim.js";

// Private fixtures (not committed): see fixtures/README.md.
const OSU = "fixtures/private/erisu-insane.osu";
const OSR = "fixtures/private/erisu-insane.osr";
const have = existsSync(OSU) && existsSync(OSR);

describe.skipIf(!have)("replay validation: Deneb to Spica [Erisu's Insane]", () => {
  const map = parseBeatmap(readFileSync(OSU, "utf8"));
  const replay = parseReplay(new Uint8Array(readFileSync(OSR)));
  const sim = simulate(map, replay);

  it("reads the replay header", () => {
    expect(replay.beatmapMd5).toBe("58a613f1f28b2b9388413b4ef5a30dd3");
    expect(replay.mods).toBe(0);
    expect(replay.score).toBe(1_587_776);
  });
  it("reproduces the judgement counts exactly", () => {
    expect([sim.n300, sim.n100, sim.n50, sim.miss]).toEqual([replay.n300, replay.n100, replay.n50, replay.miss]);
  });
  it("reproduces the max combo exactly", () => {
    expect(sim.maxCombo).toBe(replay.maxCombo);
  });
  it("uses the ScoreV1 difficulty multiplier D = 4", () => {
    expect(sim.difficultyMultiplier).toBe(4);
  });
  // Spinner rotation points are not modelled yet, so a small gap remains (1,234 pts, 0.08%).
  it("gets within 0.1% of the real score", () => {
    expect(Math.abs(sim.score - replay.score) / replay.score).toBeLessThan(0.001);
  });
});
