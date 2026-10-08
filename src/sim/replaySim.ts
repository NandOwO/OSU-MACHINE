import { resolveSlider, ballPositionAt, type ResolvedSlider } from "../beatmap/sliderEvents.js";
import type { Beatmap, Vec2 } from "../beatmap/types.js";
import type { Replay, ReplayFrame } from "../replay/osr.js";
import {
  SLIDER_HEAD_POINTS,
  SLIDER_REPEAT_POINTS,
  SLIDER_TAIL_POINTS,
  SLIDER_TICK_POINTS,
  difficultyMultiplierForMap,
  hitScore,
} from "../scoring/scoreV1.js";

export interface SimOptions {
  /** Added to every replay frame time (ms). */
  timeOffset: number;
  /** Follow circle radius as a multiple of the circle radius. */
  followMultiplier: number;
  /** When true, hit windows use `<` instead of `<=`. */
  strictWindows: boolean;
  /** Use combo before the tail element when scoring the slider's final judgement. */
  finalBeforeTail: boolean;
  /** Presses this far before an object (ms), inside the circle, count as a miss for it. */
  earlyMissWindow: number;
  /** Override for the difficulty multiplier. */
  difficultyMultiplier?: number;
  /** Radius multiplier for the head/circle hit test. */
  hitRadiusMultiplier: number;
  /** Judgement given to spinners (rotation is not simulated yet). */
  spinnerJudgement: 300 | 100 | 50 | 0;
  /** Extra flat points awarded by the spinner (spins and bonus spins). */
  spinnerFlatPoints: number;
}

export const DEFAULT_OPTIONS: SimOptions = {
  timeOffset: 0,
  followMultiplier: 2.4,
  strictWindows: true,
  finalBeforeTail: false,
  earlyMissWindow: 400,
  hitRadiusMultiplier: 1,
  spinnerJudgement: 100,
  spinnerFlatPoints: 0,
};

export interface SimResult {
  n300: number;
  n100: number;
  n50: number;
  miss: number;
  maxCombo: number;
  score: number;
  judged: number;
  difficultyMultiplier: number;
  perObject: ObjectResult[];
}

export interface ObjectResult {
  index: number;
  time: number;
  kind: string;
  judgement: 300 | 100 | 50 | 0;
  pressDelta: number | null;
  elementsHit: number;
  elementsTotal: number;
  comboAfter: number;
  scoreAfter: number;
}

function windows(od: number) {
  return { w300: 80 - 6 * od, w100: 140 - 8 * od, w50: 200 - 10 * od };
}

export function radiusFor(cs: number) {
  return 54.4 - 4.48 * cs;
}

export function simulate(map: Beatmap, replay: Replay, options: Partial<SimOptions> = {}): SimResult {
  const opt: SimOptions = { ...DEFAULT_OPTIONS, ...options };
  const frames: ReplayFrame[] = replay.frames.map((f) => ({ ...f, time: f.time + opt.timeOffset }));
  const lastFrameTime = frames[frames.length - 1]!.time;
  const R = radiusFor(map.difficulty.cs);
  const { w300, w100, w50 } = windows(map.difficulty.od);
  const within = (delta: number, w: number) => (opt.strictWindows ? delta < w : delta <= w);

  const resolved: (ResolvedSlider | null)[] = map.hitObjects.map((o) => (o.kind === "slider" ? resolveSlider(map, o) : null));
  const lastObj = map.hitObjects[map.hitObjects.length - 1]!;
  const lastRes = resolved[resolved.length - 1];
  const lastEnd = lastRes ? lastRes.endTime : lastObj.kind === "spinner" ? lastObj.endTime : lastObj.time;
  const D = opt.difficultyMultiplier ?? difficultyMultiplierForMap(map, lastEnd);

  // Press events: rising edge of any key.
  interface Press { time: number; x: number; y: number; used: boolean }
  const presses: Press[] = [];
  let prev = 0;
  for (const f of frames) {
    const k = f.keys & 15;
    if (k & ~prev) presses.push({ time: f.time, x: f.x, y: f.y, used: false });
    prev = k;
  }

  const frameIndexAt = (t: number) => {
    let lo = 0, hi = frames.length - 1;
    if (t <= frames[0]!.time) return 0;
    if (t >= frames[hi]!.time) return hi;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.time <= t) lo = mid; else hi = mid;
    }
    return lo;
  };
  const heldAt = (t: number) => (frames[frameIndexAt(t)]!.keys & 15) !== 0;
  const cursorAt = (t: number): Vec2 => {
    const i = frameIndexAt(t);
    const a = frames[i]!;
    const b = frames[i + 1];
    if (!b || b.time === a.time) return { x: a.x, y: a.y };
    const f = Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time)));
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };

  let combo = 0, maxCombo = 0, score = 0;
  let n300 = 0, n100 = 0, n50 = 0, miss = 0;
  let unlock = -Infinity;
  const perObject: ObjectResult[] = [];
  const bump = () => { combo += 1; if (combo > maxCombo) maxCombo = combo; };

  for (let i = 0; i < map.hitObjects.length; i++) {
    const obj = map.hitObjects[i]!;
    if (obj.kind === "spinner") {
      if (obj.endTime > lastFrameTime) break;
      const j = opt.spinnerJudgement;
      score += opt.spinnerFlatPoints;
      if (j) score += hitScore(j, combo, D);
      if (j === 300) n300++; else if (j === 100) n100++; else if (j === 50) n50++; else miss++;
      if (j) bump(); else combo = 0;
      perObject.push({ index: i, time: obj.time, kind: "spinner", judgement: j, pressDelta: null, elementsHit: j ? 1 : 0, elementsTotal: 1, comboAfter: combo, scoreAfter: score });
      continue;
    }
    // Stop once the replay no longer covers the end of this object's hit window.
    if (obj.time - w50 > lastFrameTime) break;

    let headHit = false;
    let headJudge: 300 | 100 | 50 | 0 = 0;
    let pressDelta: number | null = null;
    let consumedTime = obj.time + w50;

    for (const p of presses) {
      if (p.used || p.time < unlock) continue;
      if (p.time < obj.time - opt.earlyMissWindow) continue;
      if (p.time > obj.time + w50) break;
      const d = Math.hypot(p.x - obj.x, p.y - obj.y);
      if (d > R * opt.hitRadiusMultiplier) continue;
      const delta = p.time - obj.time;
      const abs = Math.abs(delta);
      p.used = true;
      pressDelta = delta;
      consumedTime = p.time;
      if (delta < 0 && !within(abs, w50)) {
        headHit = false; // pressed too early: miss
        break;
      }
      headHit = true;
      headJudge = within(abs, w300) ? 300 : within(abs, w100) ? 100 : 50;
      break;
    }
    unlock = consumedTime;

    if (obj.kind === "circle") {
      if (!headHit) { miss++; combo = 0; }
      else {
        score += hitScore(headJudge, combo, D);
        if (headJudge === 300) n300++; else if (headJudge === 100) n100++; else n50++;
        bump();
      }
      perObject.push({ index: i, time: obj.time, kind: "circle", judgement: headHit ? headJudge : 0, pressDelta, elementsHit: headHit ? 1 : 0, elementsTotal: 1, comboAfter: combo, scoreAfter: score });
      continue;
    }

    // Slider
    const s = resolved[i]!;
    const followR = R * opt.followMultiplier;
    let hit = 0;
    const total = s.events.length;
    for (let e = 0; e < s.events.length; e++) {
      const ev = s.events[e]!;
      let ok: boolean;
      if (ev.type === "head") ok = headHit;
      else {
        const pos = ev.type === "tail" ? ballPositionAt(s, ev.time) : ev.position;
        const c = cursorAt(ev.time);
        ok = heldAt(ev.time) && Math.hypot(c.x - pos.x, c.y - pos.y) <= followR;
      }
      const isTail = ev.type === "tail";
      if (ok) {
        hit++;
        score += ev.type === "head" ? SLIDER_HEAD_POINTS : ev.type === "tick" ? SLIDER_TICK_POINTS : ev.type === "repeat" ? SLIDER_REPEAT_POINTS : SLIDER_TAIL_POINTS;
        if (isTail) {
          const ratio = hit / total;
          const j: 300 | 100 | 50 | 0 = ratio === 1 ? 300 : ratio >= 0.5 ? 100 : ratio > 0 ? 50 : 0;
          const comboForFinal = opt.finalBeforeTail ? combo : combo + 1;
          if (j) score += hitScore(j, comboForFinal, D);
        }
        bump();
      } else {
        // A missed slider tail does not break the combo; every other element does.
        if (!isTail) combo = 0;
        if (isTail) {
          const ratio = hit / total;
          const j: 300 | 100 | 50 | 0 = ratio >= 0.5 ? 100 : ratio > 0 ? 50 : 0;
          if (j) score += hitScore(j, combo, D);
        }
      }
    }
    const ratio = hit / total;
    const j: 300 | 100 | 50 | 0 = ratio === 1 ? 300 : ratio >= 0.5 ? 100 : ratio > 0 ? 50 : 0;
    if (j === 300) n300++; else if (j === 100) n100++; else if (j === 50) n50++; else miss++;
    perObject.push({ index: i, time: obj.time, kind: "slider", judgement: j, pressDelta, elementsHit: hit, elementsTotal: total, comboAfter: combo, scoreAfter: score });
  }

  return { n300, n100, n50, miss, maxCombo, score, judged: n300 + n100 + n50 + miss, difficultyMultiplier: D, perObject };
}
