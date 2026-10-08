import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate } from "../src/sim/replaySim.js";
const map = parseBeatmap(readFileSync("fixtures/private/erisu-insane.osu", "utf8"));
const rep = parseReplay(new Uint8Array(readFileSync("fixtures/private/erisu-insane.osr")));
const sim = simulate(map, rep);
const rows: string[] = [];
for (let r0 = 8; r0 <= 62; r0 += 1) {
  const t0 = r0 * 1000, t1 = t0 + 8000;
  const objs = sim.perObject.filter((o) => o.time >= t0 && o.time < t1);
  const sl = objs.filter((o) => o.kind === "slider").length;
  const bad = objs.filter((o) => o.judgement !== 300).length;
  const miss = objs.filter((o) => o.judgement === 0).length;
  const spin = map.hitObjects.some((o) => o.kind === "spinner" && o.time < t1 && o.endTime > t0);
  rows.push(`${r0}s n=${objs.length} sliders=${sl} not300=${bad} miss=${miss} spinner=${spin}`);
}
console.log(rows.join("\n"));
