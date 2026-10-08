// Builds prototipo/video/private/data.json (three maps played from real replays).
// Usage: tsx tools/video-data.ts [R0_deneb R0_kimi R0_shiori]   (seconds; omitted -> auto-picked)
import { readFileSync, writeFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { resolveSlider } from "../src/beatmap/sliderEvents.js";
import { applyStacking, preemptFor } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { maxScoreV1, ticketsFor } from "../src/scoring/maxScore.js";
import { radiusFor, simulate } from "../src/sim/replaySim.js";

const WINDOW = 12;
const MAPS = [
  { key: "deneb", osu: "fixtures/private/erisu-insane.osu", osr: "fixtures/private/erisu-insane.osr" },
  { key: "kimi", osu: "fixtures/private/kimi.osu", osr: "fixtures/private/kimi.osr" },
  { key: "shiori", osu: "fixtures/private/shiori.osu", osr: "fixtures/private/shiori.osr" },
];
const overrides = process.argv.slice(2).map(Number);

function downsample(pts: { x: number; y: number }[], step: number) {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const out: [number, number][] = [[r1(pts[0]!.x), r1(pts[0]!.y)]];
  let last = pts[0]!;
  for (const p of pts) if (Math.hypot(p.x - last.x, p.y - last.y) >= step) { out.push([r1(p.x), r1(p.y)]); last = p; }
  const e = pts[pts.length - 1]!;
  if (out[out.length - 1]![0] !== r1(e.x) || out[out.length - 1]![1] !== r1(e.y)) out.push([r1(e.x), r1(e.y)]);
  return out;
}

const result: Record<string, unknown> = {};
MAPS.forEach((m, mi) => {
  const raw = parseBeatmap(readFileSync(m.osu, "utf8"));
  const map = applyStacking(raw);
  const rep = parseReplay(new Uint8Array(readFileSync(m.osr)));
  const sim = simulate(map, rep);
  const byIdx = new Map(sim.perObject.map((o) => [o.index, o]));
  const lastFrame = rep.frames[rep.frames.length - 1]!.time;

  // numbering / colours / running accuracy
  let num = 0, colorIdx = -1, c300 = 0, c100 = 0, c50 = 0, judged = 0, prevCombo = 0;
  const objects: Record<string, unknown>[] = [];
  map.hitObjects.forEach((o, i) => {
    if (o.newCombo || i === 0) { num = 0; colorIdx += 1; }
    num += 1;
    if (o.kind === "spinner") return;
    const r = byIdx.get(i);
    if (!r) return;
    if (r.judgement === 300) c300++; else if (r.judgement === 100) c100++; else if (r.judgement === 50) c50++;
    judged++;
    const end = o.kind === "slider" ? resolveSlider(map, o).endTime : o.time;
    const obj: Record<string, unknown> = {
      i, kind: o.kind, x: +o.x.toFixed(1), y: +o.y.toFixed(1), time: o.time, end, num, color: colorIdx, nc: o.newCombo || i === 0,
      judge: r.judgement, hitTime: o.time + (r.pressDelta ?? 0),
      comboBefore: prevCombo, comboAfter: r.comboAfter, scoreAfter: r.scoreAfter,
      accAfter: (300 * c300 + 100 * c100 + 50 * c50) / (300 * judged),
    };
    prevCombo = r.comboAfter;
    if (o.kind === "slider") {
      const s = resolveSlider(map, o);
      obj.slides = o.slides;
      obj.spanDuration = s.spanDuration;
      obj.path = downsample(s.path.points, 6);
      obj.events = s.events.filter((e) => e.type !== "head").map((e) => ({ type: e.type, time: Math.round(e.time), x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1) }));
    }
    objects.push(obj);
  });

  // best 12 s window: few mistakes, many objects, no spinner
  let best = { r0: 0, pen: 1e9 };
  for (let r0 = 8; r0 + WINDOW < lastFrame / 1000 - 1; r0 += 0.5) {
    const t0 = r0 * 1000, t1 = t0 + WINDOW * 1000;
    const ws = (objects as { time: number; judge: number; kind: string }[]).filter((o) => o.time >= t0 && o.time < t1);
    if (ws.length < 15) continue;
    if (raw.hitObjects.some((o) => o.kind === "spinner" && o.time < t1 && o.endTime > t0)) continue;
    const pen = 4 * ws.filter((o) => o.judge === 0).length + ws.filter((o) => o.judge !== 300).length - 0.15 * ws.length - 0.1 * ws.filter((o) => o.kind === "slider").length;
    if (pen < best.pen) best = { r0, pen };
  }
  const r0 = Number.isFinite(overrides[mi]) ? overrides[mi]! : best.r0;
  const t0 = r0 * 1000, t1 = (r0 + WINDOW) * 1000;
  const hits = (objects as { time: number; judge: number; hitTime: number }[]).filter((o) => o.judge > 0 && o.hitTime >= t0 && o.hitTime < t1).map((o) => Math.round(o.hitTime));

  const n = rep.n300 + rep.n100 + rep.n50 + rep.miss;
  const mx = maxScoreV1(raw);
  const bpmPoint = map.timingPoints.find((p) => p.uninherited);
  result[m.key] = {
    title: raw.metadata.title, artist: raw.metadata.artist, version: raw.metadata.version, creator: raw.metadata.creator,
    cs: raw.difficulty.cs, ar: raw.difficulty.ar, od: raw.difficulty.od, hp: raw.difficulty.hp,
    radius: radiusFor(raw.difficulty.cs), preempt: preemptFor(raw.difficulty.ar),
    bpm: bpmPoint ? Math.round(60000 / bpmPoint.beatLength) : 0,
    beats: raw.timingPoints.filter((p) => p.uninherited).map((p) => [p.time, p.beatLength]),
    length: (raw.hitObjects[raw.hitObjects.length - 1]!.time - raw.hitObjects[0]!.time) / 1000,
    totalObjects: raw.hitObjects.length,
    play: { r0, hits },
    objects,
    frames: rep.frames.map((f) => [f.time, Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10, f.keys & 15]),
    result: { score: rep.score, maxCombo: rep.maxCombo, n300: rep.n300, n100: rep.n100, n50: rep.n50, miss: rep.miss, objects: n, acc: (300 * rep.n300 + 100 * rep.n100 + 50 * rep.n50) / (300 * n) * 100, maxScore: mx, tickets: ticketsFor(rep.score, mx) },
  };
  const w = (objects as { time: number }[]).filter((o) => o.time >= t0 && o.time < t1).length;
  console.log(`${m.key}: window ${r0}s (${w} objects), hits in window ${hits.length}, replay score ${rep.score} / max ${mx} -> ${ticketsFor(rep.score, mx)} tickets, bpm ${bpmPoint ? Math.round(60000 / bpmPoint.beatLength) : "?"}`);
});
writeFileSync("prototipo/video/private/data.json", JSON.stringify({ maps: result }));
console.log("written");
