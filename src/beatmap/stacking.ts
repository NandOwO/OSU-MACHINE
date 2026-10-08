import type { Beatmap, HitObject } from "./types.js";
import { resolveSlider } from "./sliderEvents.js";

/** Approach time (ms) for an AR value. */
export function preemptFor(ar: number): number {
  if (ar < 5) return 1200 + (600 * (5 - ar)) / 5;
  if (ar === 5) return 1200;
  return 1200 - (750 * (ar - 5)) / 5;
}

const STACK_DISTANCE = 3;

/**
 * Computes the stack height of every object, following the osu!stable/lazer algorithm
 * (format v6+). Objects that overlap in time and space are shifted up-left so they stay visible.
 */
export function computeStackHeights(map: Beatmap): number[] {
  const objs = map.hitObjects;
  const n = objs.length;
  const heights = new Array<number>(n).fill(0);
  const threshold = preemptFor(map.difficulty.ar) * map.stackLeniency;
  const endPos = objs.map((o) => endPosition(map, o));
  const endTime = objs.map((o) => endTimeOf(map, o));
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  for (let i = n - 1; i > 0; i--) {
    let idx = i;
    const oi = objs[i]!;
    if (heights[i] !== 0 || oi.kind === "spinner") continue;

    if (oi.kind === "circle") {
      let cur = i;
      for (let k = i - 1; k >= 0; k--) {
        const on = objs[k]!;
        if (on.kind === "spinner") continue;
        if (objs[cur]!.time - endTime[k]! > threshold) break;
        if (on.kind === "slider" && dist(endPos[k]!, objs[cur]!) < STACK_DISTANCE) {
          const offset = heights[cur]! - heights[k]! + 1;
          for (let j = k + 1; j <= cur; j++) {
            if (dist(endPos[k]!, objs[j]!) < STACK_DISTANCE) heights[j]! -= offset;
          }
          break;
        }
        if (dist(on, objs[cur]!) < STACK_DISTANCE) {
          heights[k] = heights[cur]! + 1;
          cur = k;
        }
      }
      idx = cur;
    } else {
      let cur = i;
      for (let k = i - 1; k >= 0; k--) {
        const on = objs[k]!;
        if (on.kind === "spinner") continue;
        if (objs[cur]!.time - endTime[k]! > threshold) break;
        if (dist(endPos[k]!, objs[cur]!) < STACK_DISTANCE) {
          heights[k] = heights[cur]! + 1;
          cur = k;
        }
      }
      idx = cur;
    }
    void idx;
  }
  return heights;
}

function endTimeOf(map: Beatmap, o: HitObject): number {
  if (o.kind === "spinner") return o.endTime;
  if (o.kind === "slider") return resolveSlider(map, o).endTime;
  return o.time;
}
function endPosition(map: Beatmap, o: HitObject): { x: number; y: number } {
  if (o.kind !== "slider") return { x: o.x, y: o.y };
  const s = resolveSlider(map, o);
  const last = s.path.points[s.path.points.length - 1]!;
  const first = s.path.points[0]!;
  return o.slides % 2 === 1 ? last : first;
}

/** Pixel offset (in osu pixels) applied to an object with the given stack height. */
export function stackOffset(cs: number, height: number): number {
  const scale = (1 - (0.7 * (cs - 5)) / 5) / 2;
  return height * scale * -6.4;
}

/** Returns a copy of the beatmap with stacking applied to object positions and slider control points. */
export function applyStacking(map: Beatmap): Beatmap {
  const heights = computeStackHeights(map);
  const hitObjects = map.hitObjects.map((o, i) => {
    const off = stackOffset(map.difficulty.cs, heights[i]!);
    if (off === 0) return o;
    if (o.kind === "slider") {
      return { ...o, x: o.x + off, y: o.y + off, points: o.points.map((p) => ({ x: p.x + off, y: p.y + off })) };
    }
    return { ...o, x: o.x + off, y: o.y + off };
  });
  return { ...map, hitObjects };
}
