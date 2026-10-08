import { ballPositionAt, resolveSlider } from "../beatmap/sliderEvents.js";
import type { Beatmap, Vec2 } from "../beatmap/types.js";

export interface InputSample { t: number; x: number; y: number; mask: number }

export interface AutoplayOptions {
  /** Sampling interval in ms. */
  step: number;
  /** Constant offset added to every press (ms): 0 = perfect timing. */
  timingOffset: number;
  /** Rotations per second while spinning. */
  spinRps: number;
}

const DEFAULTS: AutoplayOptions = { step: 8, timingOffset: 0, spinRps: 7 };

/**
 * Generates the input of a perfect player: taps every circle on time, holds and follows every slider,
 * spins every spinner. Used for demos (attract mode) and for tests.
 */
export function autoplay(map: Beatmap, options: Partial<AutoplayOptions> = {}): InputSample[] {
  const opt = { ...DEFAULTS, ...options };
  type Seg = { start: number; end: number; pos: (t: number) => Vec2; hold: boolean; press: boolean };
  const segs: Seg[] = [];
  for (const o of map.hitObjects) {
    if (o.kind === "circle") {
      const p = { x: o.x, y: o.y };
      segs.push({ start: o.time + opt.timingOffset, end: o.time + opt.timingOffset + 24, pos: () => p, hold: true, press: true });
    } else if (o.kind === "slider") {
      const s = resolveSlider(map, o);
      segs.push({ start: o.time + opt.timingOffset, end: s.endTime, pos: (t) => ballPositionAt(s, t), hold: true, press: true });
    } else {
      const spin = (t: number) => {
        const a = ((t - o.time) / 1000) * opt.spinRps * Math.PI * 2;
        return { x: 256 + 70 * Math.cos(a), y: 192 + 70 * Math.sin(a) };
      };
      segs.push({ start: o.time, end: o.endTime, pos: spin, hold: true, press: false });
    }
  }
  segs.sort((a, b) => a.start - b.start);

  const out: InputSample[] = [];
  const first = segs[0];
  if (!first) return out;
  let prevPos: Vec2 = { x: 256, y: 400 };
  let tStart = Math.max(0, first.start - 1200);
  let si = 0;
  let lastEnd = tStart;
  for (const seg of segs) {
    // travel from the previous position to the segment start
    const from = prevPos;
    const target = seg.pos(seg.start);
    const travelStart = Math.max(lastEnd, seg.start - 280);
    for (let t = Math.max(tStart, lastEnd); t < seg.start; t += opt.step) {
      const k = Math.min(1, Math.max(0, (t - travelStart) / Math.max(1, seg.start - travelStart)));
      const e = k * k * (3 - 2 * k);
      out.push({ t, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, mask: 0 });
    }
    // the segment itself
    for (let t = seg.start; t <= seg.end; t += opt.step) {
      const p = seg.pos(t);
      out.push({ t, x: p.x, y: p.y, mask: seg.hold ? 1 : 0 });
    }
    prevPos = seg.pos(seg.end);
    lastEnd = seg.end + opt.step;
    si++;
  }
  void si;
  // Release after the last segment.
  const last = out[out.length - 1]!;
  out.push({ t: last.t + opt.step, x: last.x, y: last.y, mask: 0 });
  // Make sure each press is a rising edge: insert a release sample between back-to-back segments.
  const fixed: InputSample[] = [];
  for (let i = 0; i < out.length; i++) {
    const s = out[i]!;
    const prev = out[i - 1];
    if (prev && prev.mask !== 0 && s.mask !== 0 && s.t - prev.t > opt.step * 1.5) fixed.push({ ...prev, t: prev.t + opt.step / 2, mask: 0 });
    fixed.push(s);
  }
  return fixed;
}
