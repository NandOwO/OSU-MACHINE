import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { runReplay } from "../src/engine/replayRunner.js";
for (const f of ["erisu-insane", "kimi", "shiori"]) {
  const map = applyStacking(parseBeatmap(readFileSync(`fixtures/private/${f}.osu`, "utf8")));
  const rep = parseReplay(new Uint8Array(readFileSync(`fixtures/private/${f}.osr`)));
  const e = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
  console.log(f.padEnd(13), "failed", e.failed, "failTime", e.failTime && (e.failTime / 1000).toFixed(2), "| replay ended", (rep.frames[rep.frames.length - 1]!.time / 1000).toFixed(2), "| hp now", e.hp.toFixed(2), "| judged", e.judged);
}
