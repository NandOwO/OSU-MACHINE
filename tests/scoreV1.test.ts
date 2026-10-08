import { describe, expect, it } from "vitest";
import {
  accuracy,
  difficultyMultiplier,
  drainTimeSeconds,
  hitScore,
  maxScoreCircles,
} from "../src/scoring/scoreV1.js";

// Test vectors from DISEÑO.md §5 (D = 5).
function circlesAllGreat(n: number, d: number) {
  let combo = 0;
  let score = 0;
  for (let i = 0; i < n; i++) {
    score += hitScore(300, combo, d);
    combo++;
  }
  return score;
}

describe("ScoreV1 hit score", () => {
  it("gives no combo bonus to the first two hits", () => {
    expect(hitScore(300, 0, 5)).toBe(300);
    expect(hitScore(300, 1, 5)).toBe(300);
  });
  it("adds V*(C*D)/25 from the third hit", () => {
    expect(hitScore(300, 2, 5)).toBe(360);
  });
  it("matches the document's vectors", () => {
    expect(circlesAllGreat(1, 5)).toBe(300);
    expect(circlesAllGreat(2, 5)).toBe(600);
    expect(circlesAllGreat(3, 5)).toBe(960);
    expect(circlesAllGreat(1000, 5)).toBe(30_210_060);
  });
  it("closed form agrees with the brute-force sum", () => {
    for (const n of [3, 10, 194, 1000]) expect(maxScoreCircles(n, 5)).toBe(circlesAllGreat(n, 5));
  });
});

describe("difficulty multiplier", () => {
  it("uses (HP+CS+OD+density)/38*5 rounded, density clamped to 0..16", () => {
    // Erisu's Insane: HP6 CS3.8 OD8, 355 objects over ~89 s -> density 31.9 -> clamped to 16.
    expect(difficultyMultiplier({ hp: 6, cs: 3.8, od: 8 }, 355, 88.999)).toBe(4);
    expect(difficultyMultiplier({ hp: 7, cs: 4, od: 8 }, 432, 88.999)).toBe(5);
  });
  it("subtracts breaks from the drain time", () => {
    expect(drainTimeSeconds(1000, 61000, [{ start: 10000, end: 20000 }])).toBe(50);
  });
});

describe("accuracy", () => {
  it("matches the real score screen of the replay: 236/39/1/7 -> 88.04%", () => {
    expect(accuracy(236, 39, 1, 7) * 100).toBeCloseTo(88.04, 2);
  });
  it("matches the screenshot: 188/6/0/0 -> 97.93% (truncated)", () => {
    const acc = accuracy(188, 6, 0, 0) * 100;
    expect(acc).toBeCloseTo(97.938, 3);
    expect(Math.floor(acc * 100) / 100).toBe(97.93);
  });
});

import { parseBeatmap } from "../src/beatmap/parser.js";
import { maxScoreV1, ticketsFor } from "../src/scoring/maxScore.js";

describe("maxScoreV1 and tickets", () => {
  // 5 circles over 4 s: density clamps to 16, D = round((5+4+8+16)/38*5) = 4.
  const circles = ["100,100,1000", "200,100,2000", "300,100,3000", "400,100,4000", "300,200,5000"]
    .map((c) => `${c},1,0,0:0:0:0:`)
    .join("\n");
  const map = parseBeatmap(
    `osu file format v14\n[General]\nMode: 0\n[Difficulty]\nHPDrainRate:5\nCircleSize:4\nOverallDifficulty:8\nApproachRate:9\nSliderMultiplier:1.8\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n${circles}\n`,
  );
  it("equals the circles-only closed form", () => {
    expect(maxScoreV1(map)).toBe(300 * 5 + 6 * 4 * 4 * 3);
  });
  it("gives 100 tickets for a perfect play and scales with the square", () => {
    expect(ticketsFor(1000, 1000)).toBe(100);
    expect(ticketsFor(500, 1000)).toBe(25);
    expect(ticketsFor(2000, 1000)).toBe(100);
  });
});
