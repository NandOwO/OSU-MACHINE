import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { resolveSlider } from "../src/beatmap/sliderEvents.js";
import { difficultyMultiplierForMap, drainTimeSeconds } from "../src/scoring/scoreV1.js";
import { parseReplay } from "../src/replay/osr.js";

const osuPath = process.argv[2]!;
const osrPath = process.argv[3];
const text = readFileSync(osuPath, "utf8");
console.log("md5", createHash("md5").update(readFileSync(osuPath)).digest("hex"));
const map = parseBeatmap(text);
console.log(map.metadata.title, "[" + map.metadata.version + "]", map.difficulty);
let combo = 0, circles = 0, sliders = 0, spinners = 0;
const perObjectCombo: number[] = [];
for (const o of map.hitObjects) {
  if (o.kind === "circle") { circles++; combo += 1; perObjectCombo.push(1); }
  else if (o.kind === "slider") { sliders++; const s = resolveSlider(map, o); combo += s.events.length; perObjectCombo.push(s.events.length); }
  else { spinners++; perObjectCombo.push(0); }
}
const last = map.hitObjects[map.hitObjects.length - 1]!;
const lastEnd = last.kind === "slider" ? resolveSlider(map, last).endTime : last.kind === "spinner" ? last.endTime : last.time;
console.log({ objects: map.hitObjects.length, circles, sliders, spinners, fullCombo: combo, lastEnd });
console.log("drain s", drainTimeSeconds(map.hitObjects[0]!.time, lastEnd, map.breaks), "D", difficultyMultiplierForMap(map, lastEnd));
if (osrPath) {
  const r = parseReplay(new Uint8Array(readFileSync(osrPath)));
  console.log({ md5: r.beatmapMd5, score: r.score, n300: r.n300, n100: r.n100, n50: r.n50, miss: r.miss, maxCombo: r.maxCombo, mods: r.mods, frames: r.frames.length, firstT: r.frames[0]?.time, lastT: r.frames[r.frames.length - 1]?.time });
  let cum = 0; const judged = r.n300 + r.n100 + r.n50 + r.miss;
  for (let i = 0; i < judged; i++) cum += perObjectCombo[i]!;
  console.log("objects judged", judged, "cumulative combo elements through that many objects", cum, "time of object", map.hitObjects[judged - 1]!.time, "next", map.hitObjects[judged]?.time);
}
