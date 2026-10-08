import type { BreakPeriod } from "../beatmap/types.js";

/** Fraction of the bar a 300 restores. Everything else is relative to it. */
export const GAIN_300 = 0.02;

/**
 * Health model parameters. They were fitted so that the three real replays behave like the real game
 * (two of them ended in a fail, one was completed); see `tools/hp-search.ts`. The data do not pin a single
 * value: many nearby sets reproduce the same three results.
 */
export interface HealthParams {
  /** Drain as a fraction of the maximum drain a perfect play survives: a + b * HP. */
  a: number;
  b: number;
  /** Gain of a 100 / a 50 relative to a 300. */
  r100: number;
  r50: number;
  /** Loss of a miss, in units of a 300's gain: m0 + m1 * HP. */
  m0: number;
  m1: number;
}

export const DEFAULT_HEALTH: HealthParams = { a: 0.7, b: 0.02, r100: 0.45, r50: 0.15, m0: 3.3, m1: 0.4 };

export function judgementDelta(j: 300 | 100 | 50 | 0, hpRating: number, p: HealthParams): number {
  if (j === 300) return GAIN_300;
  if (j === 100) return GAIN_300 * p.r100;
  if (j === 50) return GAIN_300 * p.r50;
  return -GAIN_300 * (p.m0 + p.m1 * hpRating);
}

/** Length of `[from, to]` that is not inside a break, in ms. */
export function activeMs(from: number, to: number, breaks: BreakPeriod[]): number {
  let ms = Math.max(0, to - from);
  for (const b of breaks) ms -= Math.max(0, Math.min(to, b.end) - Math.max(from, b.start));
  return Math.max(0, ms);
}

/**
 * The largest drain (fraction of the bar per ms) that a perfect play survives, found by simulating the whole map.
 * The real game does the same so that hard-to-drain maps and calm sections do not kill a perfect player.
 */
export function maxSafeDrain(objectTimes: number[], breaks: BreakPeriod[]): number {
  if (objectTimes.length < 2) return 0;
  const start = objectTimes[0]!;
  const survives = (d: number): boolean => {
    let hp = 1, t = start;
    for (const ot of objectTimes) {
      hp -= d * activeMs(t, ot, breaks);
      if (hp <= 0) return false;
      hp = Math.min(1, hp + GAIN_300);
      t = ot;
    }
    return true;
  };
  let lo = 0, hi = 0.01;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (survives(mid)) lo = mid; else hi = mid; }
  return lo;
}

/** Tracks the player's health while a map is played. */
export class HealthTracker {
  hp = 1;
  failedAt: number | null = null;
  private t: number;
  private readonly drain: number;

  constructor(
    private readonly objectTimes: number[],
    private readonly breaks: BreakPeriod[],
    private readonly hpRating: number,
    private readonly params: HealthParams = DEFAULT_HEALTH,
    drainOverride?: number,
    /** Drain stops here (the end of the last object): nothing is left to lose after the map. */
    private readonly endTime: number = Infinity,
  ) {
    this.t = objectTimes[0] ?? 0;
    this.drain = drainOverride ?? (this.params.a + this.params.b * hpRating) * maxSafeDrain(objectTimes, breaks);
  }

  get failed(): boolean { return this.failedAt !== null; }

  /** Applies the continuous drain up to time `t`. */
  drainTo(t: number): void {
    if (this.failed) return;
    t = Math.min(t, this.endTime);
    if (t <= this.t) return;
    const ms = activeMs(this.t, t, this.breaks);
    if (this.drain > 0 && this.hp - this.drain * ms <= 0) {
      // fell to zero somewhere in this interval: find when
      const need = this.hp / this.drain;
      let acc = 0, at = this.t;
      const step = 5;
      while (at < t && acc < need) { const next = Math.min(t, at + step); acc += activeMs(at, next, this.breaks); at = next; }
      this.hp = 0; this.failedAt = at; this.t = t;
      return;
    }
    this.hp -= this.drain * ms;
    this.t = t;
  }

  /** A judged object. Returns true if it made the player fail. */
  judge(j: 300 | 100 | 50 | 0, t: number): boolean {
    this.drainTo(t);
    if (this.failed) return true;
    this.hp = Math.min(1, this.hp + judgementDelta(j, this.hpRating, this.params));
    if (this.hp <= 0) { this.hp = 0; this.failedAt = t; return true; }
    return false;
  }
}
