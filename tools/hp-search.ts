import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { runReplay } from "../src/engine/replayRunner.js";

interface Series { name: string; hp: number; start: number; ev: { t: number; j: number }[]; failAt: number | null; end: number }
const load = (f: string, name: string, failAt: number | null): Series => {
  const map = applyStacking(parseBeatmap(readFileSync(`fixtures/private/${f}.osu`, "utf8")));
  const rep = parseReplay(new Uint8Array(readFileSync(`fixtures/private/${f}.osr`)));
  const e = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
  const ev = e.results.slice().sort((a, b) => a.time - b.time).map((r) => ({ t: r.time, j: r.judgement }));
  return { name, hp: map.difficulty.hp, start: map.hitObjects[0]!.time, ev, failAt, end: rep.frames[rep.frames.length - 1]!.time };
};
const S = [load("erisu-insane", "Deneb", 72350), load("kimi", "Kimi", 81300), load("shiori", "Shiori", null)];

import { GAIN_300, HealthTracker, maxSafeDrain, type HealthParams } from "../src/engine/health.js";
const objTimes = (f: string) => { const m = parseBeatmap(readFileSync(`fixtures/private/${f}.osu`, "utf8")); return { times: m.hitObjects.map((o) => o.time), breaks: m.breaks }; };
const maps = [objTimes("erisu-insane"), objTimes("kimi"), objTimes("shiori")];
const safe = maps.map((m) => maxSafeDrain(m.times, m.breaks));
console.log("max safe drain per second:", safe.map((d) => (d * 1000).toFixed(4)).join(" / "));
function run(i: number, p: HealthParams): { failT: number | null; min: number } {
  const s = S[i]!, h = new HealthTracker(maps[i]!.times, maps[i]!.breaks, s.hp, p, (p.a + p.b * s.hp) * safe[i]!);
  let min = 1;
  for (const e of s.ev) { if (h.judge(e.j as 300 | 100 | 50 | 0, e.t)) return { failT: h.failedAt, min: 0 }; min = Math.min(min, h.hp); }
  return { failT: null, min };
}
void GAIN_300;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ok: HealthParams[] = [];
let tried = 0;
for (let i = 0; i < (process.env.FAST ? 0 : 600000); i++) {
  const p: HealthParams = { a: rnd(0.3, 0.97), b: rnd(0, 0.06), r100: rnd(0.2, 0.7), r50: rnd(0, 0.3), m0: rnd(1.5, 8), m1: rnd(0, 0.8) };
  if (p.a + 10 * p.b > 1) continue;
  tried++;
  const d = run(0, p), k = run(1, p), sh = run(2, p);
  if (d.failT === null || d.failT < 72300 || d.failT > 72450) continue;
  if (k.failT === null || k.failT < 81200 || k.failT > 81450) continue;
  if (sh.failT !== null || sh.min < 0.1) continue;
  ok.push(p);
}
console.log("tried", tried, "feasible", ok.length);
if (ok.length) {
  const med = (f: (p: HealthParams) => number) => { const v = ok.map(f).sort((x, y) => x - y); return [v[0]!, v[v.length >> 1]!, v[v.length - 1]!].map((x) => +x.toFixed(3)); };
  for (const k of ["a", "b", "r100", "r50", "m0", "m1"] as const) console.log(k.padEnd(5), "min/median/max", med((p) => p[k]));
}
const chosen: HealthParams = { a: 0.7, b: 0.02, r100: 0.45, r50: 0.15, m0: 3.3, m1: 0.4 };
for (let i = 0; i < 3; i++) { const r = run(i, chosen); console.log("chosen params", S[i]!.name, r.failT ? `fails at ${(r.failT / 1000).toFixed(2)}s` : `survives, min HP ${r.min.toFixed(2)}`, `(replay ended ${(S[i]!.end / 1000).toFixed(2)}s)`); }
