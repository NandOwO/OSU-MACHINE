import { ballPositionAt, resolveSlider, type ResolvedSlider } from "../beatmap/sliderEvents.js";
import type { Beatmap, Vec2 } from "../beatmap/types.js";
import {
  SLIDER_HEAD_POINTS,
  SLIDER_REPEAT_POINTS,
  SLIDER_TAIL_POINTS,
  SLIDER_TICK_POINTS,
  difficultyMultiplierForMap,
  hitScore,
} from "../scoring/scoreV1.js";
import { hitWindows, radiusFor, spinnerRotationsPerSecond } from "./geometry.js";
import { DEFAULT_HEALTH, HealthTracker, type HealthParams } from "./health.js";

export type Judgement = 300 | 100 | 50 | 0;

export interface EngineOptions {
  /** Follow circle radius as a multiple of the circle radius. */
  followMultiplier: number;
  /** Presses this far before an object (ms), inside the circle, count as an early miss. */
  earlyMissWindow: number;
  /** "rotation": judge spinners from the cursor's rotation. Otherwise a fixed result (used to compare with replays). */
  spinner: "rotation" | { judgement: Judgement; flatPoints: number };
  /** Health bar: `true` uses the default model, `false` turns it off (nobody can fail). */
  health: boolean | HealthParams;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  followMultiplier: 2.4,
  earlyMissWindow: 400,
  spinner: "rotation",
  health: true,
};

/** Key mask bits: 1=M1, 2=M2, 4=K1, 8=K2 (same as .osr). Only the low 4 bits count. */
export const KEY_MASK = 15;

export type EngineEvent =
  | { type: "hit"; index: number; judgement: 300 | 100 | 50; time: number; x: number; y: number; head: boolean }
  | { type: "miss"; index: number; time: number; x: number; y: number; head: boolean }
  | { type: "sliderElement"; index: number; element: "tick" | "repeat" | "tail"; hit: boolean; time: number; x: number; y: number }
  | { type: "sliderEnd"; index: number; judgement: Judgement; time: number; x: number; y: number }
  | { type: "spinner"; index: number; judgement: Judgement; rotations: number; time: number }
  | { type: "spin"; index: number; rotations: number; time: number }
  | { type: "fail"; time: number };

export interface ObjectResult {
  index: number;
  time: number;
  kind: "circle" | "slider" | "spinner";
  judgement: Judgement;
  /** Press time minus object time (ms) for the head, or null if it was never pressed. */
  pressDelta: number | null;
  elementsHit: number;
  elementsTotal: number;
  comboAfter: number;
  scoreAfter: number;
}

interface Sample { t: number; x: number; y: number; mask: number }

interface ObjState {
  index: number;
  headResolved: boolean;
  headHit: boolean;
  headJudge: Judgement;
  pressDelta: number | null;
  slider: ResolvedSlider | null;
  nextEvent: number;
  hit: number;
  done: boolean;
  // spinner
  rotations: number;
  lastAngle: number | null;
}

/**
 * Real-time osu!standard judging engine (ScoreV1).
 *
 * Feed it input samples with `input(t, x, y, mask)` (t in ms on the song clock, x/y in osu pixels)
 * and read judgements from `drainEvents()`. Fed with a replay it reproduces the replay simulator.
 */
export class GameEngine {
  readonly options: EngineOptions;
  readonly radius: number;
  readonly followRadius: number;
  readonly d: number;
  private readonly w: { w300: number; w100: number; w50: number };
  private readonly objs: ObjState[];
  private readonly spinnerIdx: number[];
  private readonly healthTracker: HealthTracker | null;

  score = 0;
  combo = 0;
  maxCombo = 0;
  n300 = 0;
  n100 = 0;
  n50 = 0;
  miss = 0;
  readonly results: ObjectResult[] = [];

  private samples: Sample[] = [];
  private prevMask = 0;
  private headPtr = 0;
  private events: EngineEvent[] = [];
  private lastT = -Infinity;

  constructor(readonly map: Beatmap, options: Partial<EngineOptions> = {}) {
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options };
    this.radius = radiusFor(map.difficulty.cs);
    this.followRadius = this.radius * this.options.followMultiplier;
    this.w = hitWindows(map.difficulty.od);
    const last = map.hitObjects[map.hitObjects.length - 1]!;
    const lastEnd = last.kind === "slider" ? resolveSlider(map, last).endTime : last.kind === "spinner" ? last.endTime : last.time;
    this.d = difficultyMultiplierForMap(map, lastEnd);
    this.objs = map.hitObjects.map((o, index) => ({
      index,
      headResolved: o.kind === "spinner",
      headHit: false,
      headJudge: 0,
      pressDelta: null,
      slider: o.kind === "slider" ? resolveSlider(map, o) : null,
      nextEvent: 0,
      hit: 0,
      done: false,
      rotations: 0,
      lastAngle: null,
    }));
    this.healthTracker = this.options.health === false ? null
      : new HealthTracker(map.hitObjects.map((o) => o.time), map.breaks, map.difficulty.hp, this.options.health === true ? DEFAULT_HEALTH : this.options.health, undefined, lastEnd);
    this.spinnerIdx = map.hitObjects.flatMap((o, i) => (o.kind === "spinner" ? [i] : []));
    this.advanceHeadPtr();
  }

  get judged(): number { return this.n300 + this.n100 + this.n50 + this.miss; }
  get accuracy(): number {
    const n = this.judged;
    return n === 0 ? 1 : (300 * this.n300 + 100 * this.n100 + 50 * this.n50) / (300 * n);
  }
  get finished(): boolean { return this.failed || this.objs.every((o) => o.done); }
  /** Health bar in 0..1 (1 when health is off). */
  get hp(): number { return this.healthTracker?.hp ?? 1; }
  get failed(): boolean { return this.healthTracker?.failed ?? false; }
  /** Song time (ms) at which the player ran out of health, or null. */
  get failTime(): number | null { return this.healthTracker?.failedAt ?? null; }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): EngineEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /**
   * One input sample. `mask` holds the pressed keys/buttons; a bit turning on is a press.
   * Times must not go backwards (they are clamped if they do).
   */
  input(t: number, x: number, y: number, mask: number): void {
    if (this.failed) return;
    if (t < this.lastT) t = this.lastT;
    this.lastT = t;
    this.samples.push({ t, x, y, mask: mask & KEY_MASK });
    this.updateSpinners(t, x, y, mask);
    this.advance(t);
    const m = mask & KEY_MASK;
    if (m & ~this.prevMask) this.press(t, x, y);
    this.prevMask = m;
    if (this.samples.length > 4000) this.samples = this.samples.slice(-2000);
  }

  /** Advances time without a new input: repeats the last known input state. */
  tick(t: number): void {
    const s = this.samples[this.samples.length - 1];
    // A player who never touches the mouse produces no input at all, but time must still run.
    if (!s) { this.input(t, 256, 192, 0); return; }
    if (t > s.t) this.input(t, s.x, s.y, s.mask);
  }

  /**
   * Resolves everything that is still pending as of time `t`, like the end of a replay
   * (objects whose hit window has started count as missed). Used when a play ends early.
   */
  flush(t: number): void {
    this.advance(t);
    for (const o of this.objs) {
      const obj = this.map.hitObjects[o.index]!;
      if (obj.kind === "spinner" || o.headResolved) continue;
      if (obj.time - this.w.w50 > t) break;
      this.resolveHeadMiss(o, obj.time + this.w.w50);
    }
    this.advance(t);
    // Sliders whose head was resolved are finished with the last known input state.
    for (const o of this.objs) {
      if (o.done || !o.slider || !o.headResolved) continue;
      while (o.nextEvent < o.slider.events.length) this.runSliderElement(o, o.slider.events[o.nextEvent]!.time);
    }
  }

  // ---------------------------------------------------------------- input helpers

  private sampleIndexAt(t: number): number {
    const s = this.samples;
    let lo = 0;
    let hi = s.length - 1;
    if (hi < 0) return -1;
    if (t <= s[0]!.t) return 0;
    if (t >= s[hi]!.t) return hi;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.t <= t) lo = mid; else hi = mid;
    }
    return lo;
  }
  private heldAt(t: number): boolean {
    const i = this.sampleIndexAt(t);
    return i >= 0 && (this.samples[i]!.mask & KEY_MASK) !== 0;
  }
  private cursorAt(t: number): Vec2 {
    const i = this.sampleIndexAt(t);
    const a = this.samples[i]!;
    const b = this.samples[i + 1];
    if (!b || b.t === a.t) return { x: a.x, y: a.y };
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  // ---------------------------------------------------------------- scoring primitives

  private bump(): void {
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }
  private count(j: Judgement, at: number): void {
    if (j === 300) this.n300++; else if (j === 100) this.n100++; else if (j === 50) this.n50++; else this.miss++;
    if (this.healthTracker && !this.healthTracker.failed && this.healthTracker.judge(j, at)) this.events.push({ type: "fail", time: this.healthTracker.failedAt ?? at });
  }
  private record(o: ObjState, judgement: Judgement, kind: ObjectResult["kind"], total: number): void {
    const obj = this.map.hitObjects[o.index]!;
    this.results.push({
      index: o.index, time: obj.time, kind, judgement, pressDelta: o.pressDelta,
      elementsHit: kind === "slider" ? o.hit : judgement ? 1 : 0, elementsTotal: total,
      comboAfter: this.combo, scoreAfter: this.score,
    });
  }

  // ---------------------------------------------------------------- time advance

  private advanceHeadPtr(): void {
    while (this.headPtr < this.objs.length && this.objs[this.headPtr]!.headResolved) this.headPtr++;
  }

  /** Runs every timed action (head misses, slider elements, spinner ends) due by time `t`, in order. */
  private advance(t: number): void {
    for (;;) {
      if (this.failed) return;
      let best: { time: number; run: () => void } | null = null;
      for (let i = this.headPtr; i < this.objs.length; i++) {
        const o = this.objs[i]!;
        const obj = this.map.hitObjects[i]!;
        if (obj.time - 1500 > t && o.headResolved === false) break; // too far ahead
        if (o.done) continue;
        let time = Infinity;
        let run: (() => void) | null = null;
        if (obj.kind === "spinner") {
          time = obj.endTime;
          run = () => this.endSpinner(o, obj.endTime);
        } else if (!o.headResolved) {
          time = obj.time + this.w.w50;
          if (time < t) run = () => this.resolveHeadMiss(o, time);
          else time = Infinity;
        } else if (o.slider) {
          const ev = o.slider.events[o.nextEvent];
          if (ev) { time = ev.time; run = () => this.runSliderElement(o, ev.time); }
        }
        if (run && time <= t && (!best || time < best.time)) best = { time, run };
      }
      // Slider/spinner elements of objects before the head pointer still need processing.
      for (let i = 0; i < this.headPtr; i++) {
        const o = this.objs[i]!;
        if (o.done) continue;
        const obj = this.map.hitObjects[i]!;
        if (obj.kind === "slider" && o.slider) {
          const ev = o.slider.events[o.nextEvent];
          if (ev && ev.time <= t && (!best || ev.time < best.time)) best = { time: ev.time, run: () => this.runSliderElement(o, ev.time) };
        } else if (obj.kind === "spinner" && obj.endTime <= t && (!best || obj.endTime < best.time)) {
          best = { time: obj.endTime, run: () => this.endSpinner(o, obj.endTime) };
        }
      }
      if (!best) { this.drainHealth(t); return; }
      best.run();
    }
  }

  private drainHealth(t: number): void {
    const h = this.healthTracker;
    if (!h || h.failed) return;
    h.drainTo(t);
    if (h.failed) this.events.push({ type: "fail", time: h.failedAt ?? t });
  }

  // ---------------------------------------------------------------- circles and slider heads

  private press(t: number, x: number, y: number): void {
    this.advanceHeadPtr();
    const o = this.objs[this.headPtr];
    if (!o) return;
    const obj = this.map.hitObjects[o.index]!;
    if (obj.kind === "spinner") return;
    if (t < obj.time - this.options.earlyMissWindow) return;
    if (t > obj.time + this.w.w50) return;
    if (Math.hypot(x - obj.x, y - obj.y) > this.radius) return;
    const delta = t - obj.time;
    const abs = Math.abs(delta);
    o.pressDelta = delta;
    if (delta < 0 && !(abs < this.w.w50)) {
      this.resolveHeadMiss(o, t, true);
      return;
    }
    const j: 300 | 100 | 50 = abs < this.w.w300 ? 300 : abs < this.w.w100 ? 100 : 50;
    o.headResolved = true;
    o.headHit = true;
    o.headJudge = j;
    this.advanceHeadPtr();
    if (obj.kind === "circle") {
      this.score += hitScore(j, this.combo, this.d);
      this.count(j, t);
      this.bump();
      o.done = true;
      this.events.push({ type: "hit", index: o.index, judgement: j, time: t, x: obj.x, y: obj.y, head: false });
      this.record(o, j, "circle", 1);
    } else {
      this.events.push({ type: "hit", index: o.index, judgement: j, time: t, x: obj.x, y: obj.y, head: true });
    }
  }

  private resolveHeadMiss(o: ObjState, at: number, early = false): void {
    const obj = this.map.hitObjects[o.index]!;
    if (obj.kind === "spinner") return;
    o.headResolved = true;
    o.headHit = false;
    if (early && o.pressDelta === null) o.pressDelta = at - obj.time;
    this.advanceHeadPtr();
    if (obj.kind === "circle") {
      this.count(0, at);
      this.combo = 0;
      o.done = true;
      this.events.push({ type: "miss", index: o.index, time: at, x: obj.x, y: obj.y, head: false });
      this.record(o, 0, "circle", 1);
    } else {
      this.events.push({ type: "miss", index: o.index, time: at, x: obj.x, y: obj.y, head: true });
    }
  }

  // ---------------------------------------------------------------- sliders

  private runSliderElement(o: ObjState, _time: number): void {
    const s = o.slider!;
    const ev = s.events[o.nextEvent]!;
    o.nextEvent++;
    const total = s.events.length;
    let ok: boolean;
    if (ev.type === "head") {
      ok = o.headHit;
    } else {
      const pos = ev.type === "tail" ? ballPositionAt(s, ev.time) : ev.position;
      const c = this.cursorAt(ev.time);
      ok = this.heldAt(ev.time) && Math.hypot(c.x - pos.x, c.y - pos.y) <= this.followRadius;
    }
    const isTail = ev.type === "tail";
    if (ok) {
      o.hit++;
      this.score += ev.type === "head" ? SLIDER_HEAD_POINTS : ev.type === "tick" ? SLIDER_TICK_POINTS : ev.type === "repeat" ? SLIDER_REPEAT_POINTS : SLIDER_TAIL_POINTS;
      if (isTail) {
        const j = this.sliderJudgement(o.hit, total);
        if (j) this.score += hitScore(j, this.combo + 1, this.d); // the final judgement counts the tail in the combo
      }
      this.bump();
    } else {
      // A missed tail does not break the combo; every other element does.
      if (!isTail) this.combo = 0;
      if (isTail) {
        const j = this.sliderJudgement(o.hit, total) || 0;
        const adj: Judgement = j === 300 ? 100 : j; // a missed tail can never leave a 300
        if (adj) this.score += hitScore(adj, this.combo, this.d);
      }
    }
    if (ev.type !== "head") {
      this.events.push({ type: "sliderElement", index: o.index, element: ev.type, hit: ok, time: ev.time, x: ev.position.x, y: ev.position.y });
    }
    if (isTail) {
      const j = this.sliderJudgement(o.hit, total);
      this.count(j, ev.time);
      o.done = true;
      this.events.push({ type: "sliderEnd", index: o.index, judgement: j, time: ev.time, x: ev.position.x, y: ev.position.y });
      this.record(o, j, "slider", total);
    }
  }

  private sliderJudgement(hit: number, total: number): Judgement {
    const ratio = hit / total;
    return ratio === 1 ? 300 : ratio >= 0.5 ? 100 : ratio > 0 ? 50 : 0;
  }

  // ---------------------------------------------------------------- spinners

  private updateSpinners(t: number, x: number, y: number, mask: number): void {
    if (this.options.spinner !== "rotation") return;
    if ((mask & KEY_MASK) === 0) {
      for (const o of this.objs) o.lastAngle = null;
      return;
    }
    for (const i of this.spinnerIdx) {
      const obj = this.map.hitObjects[i]!;
      if (obj.kind !== "spinner" || obj.time > t) continue;
      const o = this.objs[i]!;
      if (o.done || t > obj.endTime) continue;
      const a = Math.atan2(y - 192, x - 256);
      if (o.lastAngle !== null) {
        let d = a - o.lastAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const before = Math.floor(o.rotations);
        o.rotations += Math.abs(d) / (2 * Math.PI);
        if (Math.floor(o.rotations) > before) {
          this.score += 100;
          this.events.push({ type: "spin", index: i, rotations: o.rotations, time: t });
        }
      }
      o.lastAngle = a;
    }
  }

  private endSpinner(o: ObjState, at: number): void {
    const obj = this.map.hitObjects[o.index]!;
    if (obj.kind !== "spinner") return;
    o.done = true;
    let j: Judgement;
    const sp = this.options.spinner;
    if (sp === "rotation") {
      const required = Math.max(1, Math.floor(((obj.endTime - obj.time) / 1000) * spinnerRotationsPerSecond(this.map.difficulty.od)));
      const progress = o.rotations / required;
      j = progress >= 1 ? 300 : progress > 0.9 ? 100 : progress > 0.75 ? 50 : 0;
      const bonusSpins = Math.max(0, Math.floor(o.rotations) - required);
      this.score += bonusSpins * 1000;
    } else {
      j = sp.judgement;
      this.score += sp.flatPoints;
    }
    if (j) this.score += hitScore(j, this.combo, this.d);
    this.count(j, at);
    if (j) this.bump(); else this.combo = 0;
    this.events.push({ type: "spinner", index: o.index, judgement: j, rotations: o.rotations, time: at });
    this.record(o, j, "spinner", 1);
  }
}
