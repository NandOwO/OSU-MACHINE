import type { Beatmap } from "../beatmap/types.js";

export type Judgement = 300 | 100 | 50 | 0;

/** Flat bonus points of slider elements in ScoreV1 (not multiplied by combo). */
export const SLIDER_HEAD_POINTS = 30;
export const SLIDER_TICK_POINTS = 10;
export const SLIDER_REPEAT_POINTS = 30;
export const SLIDER_TAIL_POINTS = 30;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Seconds of play time between the first and last object, minus breaks. */
export function drainTimeSeconds(
  firstStart: number,
  lastEnd: number,
  breaks: { start: number; end: number }[],
): number {
  const breakMs = breaks.reduce((acc, b) => acc + Math.max(0, b.end - b.start), 0);
  return Math.max(0, (lastEnd - firstStart - breakMs) / 1000);
}

/** ScoreV1 difficulty multiplier. Uses the map's original HP, CS and OD. */
export function difficultyMultiplier(
  d: { hp: number; cs: number; od: number },
  objectCount: number,
  drainSeconds: number,
): number {
  const density = drainSeconds > 0 ? clamp((objectCount / drainSeconds) * 8, 0, 16) : 16;
  return Math.round(((d.hp + d.cs + d.od + density) / 38) * 5);
}

export function difficultyMultiplierForMap(map: Beatmap, lastEnd: number): number {
  const first = map.hitObjects[0]?.time ?? 0;
  return difficultyMultiplier(
    map.difficulty,
    map.hitObjects.length,
    drainTimeSeconds(first, lastEnd, map.breaks),
  );
}

/** Points for one judged hit: V + V * (max(combo - 1, 0) * D * M) / 25. */
export function hitScore(value: number, comboBefore: number, d: number, m = 1): number {
  const c = Math.max(comboBefore - 1, 0);
  return Math.floor(value + (value * (c * d * m)) / 25);
}

/** Highest possible score for a circles-only map of `n` objects. */
export function maxScoreCircles(n: number, d: number): number {
  return 300 * n + 6 * d * (n - 1) * (n - 2);
}

export function accuracy(n300: number, n100: number, n50: number, nMiss: number): number {
  const total = n300 + n100 + n50 + nMiss;
  if (total === 0) return 1;
  return (300 * n300 + 100 * n100 + 50 * n50) / (300 * total);
}
