// Builds prototipo/video/private/data.json from the private fixtures. Usage: tsx tools/video-data.ts <kimi.osr> <shiori.osr> [R0 seconds]
import { readFileSync, writeFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { resolveSlider } from "../src/beatmap/sliderEvents.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate, radiusFor } from "../src/sim/replaySim.js";

const [kimiPath, shioriPath, r0Arg] = process.argv.slice(2);
const R0 = Number(r0Arg ?? 36), R1 = R0 + 8;
const map = parseBeatmap(readFileSync("fixtures/private/erisu-insane.osu", "utf8"));
const rep = parseReplay(new Uint8Array(readFileSync("fixtures/private/erisu-insane.osr")));
const sim = simulate(map, rep);
const res = new Map(sim.perObject.map((o) => [o.index, o]));

// Combo numbering and colour index (new combo resets the number and advances the colour).
let num = 0, colorIdx = -1;
const meta = map.hitObjects.map((o, i) => {
  if (o.newCombo || i === 0) { num = 0; colorIdx += 1; }
  num += 1;
  return { num: o.kind === "spinner" ? 0 : num, color: colorIdx };
});

function downsample(pts: { x: number; y: number }[], step: number) {
  const out: [number, number][] = [];
  let last = pts[0]!;
  out.push([+last.x.toFixed(1), +last.y.toFixed(1)]);
  for (const p of pts) {
    if (Math.hypot(p.x - last.x, p.y - last.y) >= step) { out.push([+p.x.toFixed(1), +p.y.toFixed(1)]); last = p; }
  }
  const e = pts[pts.length - 1]!;
  if (out[out.length - 1]![0] !== +e.x.toFixed(1)) out.push([+e.x.toFixed(1), +e.y.toFixed(1)]);
  return out;
}

const objects = [];
for (let i = 0; i < map.hitObjects.length; i++) {
  const o = map.hitObjects[i]!;
  if (o.kind === "spinner") continue;
  const r = res.get(i);
  const end = o.kind === "slider" ? resolveSlider(map, o).endTime : o.time;
  if (end < R0 * 1000 - 1500 || o.time > R1 * 1000 + 1500) continue;
  const base: Record<string, unknown> = {
    i, kind: o.kind, x: o.x, y: o.y, time: o.time, end, num: meta[i]!.num, color: meta[i]!.color,
    judge: r?.judgement ?? 0, hitTime: o.time + (r?.pressDelta ?? 0), comboAfter: r?.comboAfter ?? 0, scoreAfter: r?.scoreAfter ?? 0,
  };
  if (o.kind === "slider") {
    const s = resolveSlider(map, o);
    base.slides = o.slides;
    base.path = downsample(s.path.points, 5);
    base.events = s.events.filter((e) => e.type !== "head").map((e) => ({ type: e.type, time: e.time, x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1) }));
    base.spanDuration = s.spanDuration;
  }
  objects.push(base);
}

const win = (f: { time: number }) => f.time >= (R0 - 2) * 1000 && f.time <= (R1 + 1) * 1000;
const deneb = {
  R0, R1, cs: map.difficulty.cs, ar: map.difficulty.ar, od: map.difficulty.od, radius: radiusFor(map.difficulty.cs),
  title: `${map.metadata.artist} - ${map.metadata.title} [${map.metadata.version}]`,
  objects,
  frames: rep.frames.filter(win).map((f) => [f.time, +f.x.toFixed(1), +f.y.toFixed(1), f.keys & 15]),
};

function ghost(path: string, label: string) {
  const r = parseReplay(new Uint8Array(readFileSync(path)));
  const n = r.n300 + r.n100 + r.n50 + r.miss;
  return {
    label, player: r.player, score: r.score, maxCombo: r.maxCombo, n300: r.n300, n100: r.n100, n50: r.n50, miss: r.miss,
    acc: (300 * r.n300 + 100 * r.n100 + 50 * r.n50) / (300 * n) * 100, objects: n,
    frames: r.frames.map((f) => [f.time, Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10, f.keys & 15]),
  };
}
const kimi = ghost(kimiPath!, "the peggies - Kimi no Sei (TV Size) [NiNos Insane]");
const shiori = ghost(shioriPath!, "ClariS - SHIORI vs. Hitorigoto [Insane]");
const out = { deneb, kimi, shiori, denebResult: { player: rep.player, score: rep.score, maxCombo: rep.maxCombo, n300: rep.n300, n100: rep.n100, n50: rep.n50, miss: rep.miss } };
writeFileSync("prototipo/video/private/data.json", JSON.stringify(out));
console.log("objects in window", objects.length, "frames", deneb.frames.length, "kimi frames", kimi.frames.length, "shiori", shiori.frames.length);
const first = objects.find((o) => (o.time as number) >= R0 * 1000)!;
console.log("first object in window", first.time, "scoreAfter", first.scoreAfter, "combo", first.comboAfter);
