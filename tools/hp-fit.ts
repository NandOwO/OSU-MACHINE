import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { runReplay } from "../src/engine/replayRunner.js";

const sets = [["erisu-insane", "Deneb"], ["kimi", "Kimi"], ["shiori", "Shiori"]] as const;
for (const [f, name] of sets) {
  const map = applyStacking(parseBeatmap(readFileSync(`fixtures/private/${f}.osu`, "utf8")));
  const rep = parseReplay(new Uint8Array(readFileSync(`fixtures/private/${f}.osr`)));
  const e = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
  const res = e.results.slice().sort((a, b) => a.time - b.time);
  const last = rep.frames[rep.frames.length - 1]!.time;
  console.log(`== ${name}: replay ends at ${(last / 1000).toFixed(1)}s, ${res.length}/${map.hitObjects.length} objects judged, HP drain ${map.difficulty.hp}, OD ${map.difficulty.od}`);
  const tail = res.slice(-30).map((r) => `${(r.time / 1000).toFixed(1)}:${r.judgement === 0 ? "X" : r.judgement === 300 ? "." : r.judgement === 100 ? "o" : "5"}`);
  console.log("  last 30:", tail.join(" "));
  const misses = res.filter((r) => r.judgement === 0).map((r) => (r.time / 1000).toFixed(1));
  console.log("  misses at:", misses.join(" "));
}
