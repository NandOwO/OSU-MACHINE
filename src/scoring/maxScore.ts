import { resolveSlider } from "../beatmap/sliderEvents.js";
import type { Beatmap } from "../beatmap/types.js";
import {
  SLIDER_HEAD_POINTS,
  SLIDER_REPEAT_POINTS,
  SLIDER_TAIL_POINTS,
  SLIDER_TICK_POINTS,
  difficultyMultiplierForMap,
  hitScore,
} from "./scoreV1.js";

/**
 * Highest ScoreV1 for a map: every object 300, every slider element hit, combo never broken.
 * Spinners are counted as one 300 (their spin points are not modelled).
 */
export function maxScoreV1(map: Beatmap): number {
  const objs = map.hitObjects;
  const last = objs[objs.length - 1]!;
  const lastEnd =
    last.kind === "slider" ? resolveSlider(map, last).endTime : last.kind === "spinner" ? last.endTime : last.time;
  const d = difficultyMultiplierForMap(map, lastEnd);
  let combo = 0;
  let score = 0;
  for (const o of objs) {
    if (o.kind === "circle" || o.kind === "spinner") {
      score += hitScore(300, combo, d);
      combo += 1;
      continue;
    }
    const s = resolveSlider(map, o);
    for (const ev of s.events) {
      if (ev.type === "head") score += SLIDER_HEAD_POINTS;
      else if (ev.type === "tick") score += SLIDER_TICK_POINTS;
      else if (ev.type === "repeat") score += SLIDER_REPEAT_POINTS;
      else {
        score += SLIDER_TAIL_POINTS;
        score += hitScore(300, combo + 1, d); // final judgement counts the tail in the combo
      }
      combo += 1;
    }
  }
  return score;
}

/** Tickets for one play: round(maxPerPlay * (score / mapMax) ^ exponent). See DISEÑO.md §4.1. */
export function ticketsFor(score: number, mapMax: number, maxPerPlay = 100, exponent = 2): number {
  const r = Math.min(1, Math.max(0, score / mapMax));
  return Math.round(maxPerPlay * Math.pow(r, exponent));
}
