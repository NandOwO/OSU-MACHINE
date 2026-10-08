import type { Beatmap, TimingPoint } from "./types.js";

export interface ControlAt {
  beatLength: number;
  /** Slider velocity multiplier, clamped to [0.1, 10]. */
  svMultiplier: number;
}

/**
 * Beat length and slider-velocity multiplier in effect at `time`.
 * An uninherited point resets the multiplier to 1; later inherited points override it.
 */
export function controlAt(points: TimingPoint[], time: number): ControlAt {
  let beatLength = 500;
  let sv = 1;
  let seenUninherited = false;
  for (const p of points) {
    if (p.time > time && seenUninherited) break;
    if (p.uninherited) {
      beatLength = p.beatLength;
      sv = 1;
      seenUninherited = true;
    } else if (p.time <= time || !seenUninherited) {
      sv = Math.min(10, Math.max(0.1, p.beatLength < 0 ? -100 / p.beatLength : 1));
    }
  }
  return { beatLength, svMultiplier: sv };
}

export function controlAtMap(map: Beatmap, time: number): ControlAt {
  return controlAt(map.timingPoints, time);
}
