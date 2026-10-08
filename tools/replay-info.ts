import { readFileSync } from "node:fs";
import { parseReplay } from "../src/replay/osr.js";
for (const p of process.argv.slice(2)) {
  const r = parseReplay(new Uint8Array(readFileSync(p)));
  let prev = 0, presses = 0;
  for (const f of r.frames) { const k = f.keys & 15; if (k & ~prev) presses++; prev = k; }
  const n = r.n300 + r.n100 + r.n50 + r.miss;
  console.log(p.split("/").pop(), { player: r.player, md5: r.beatmapMd5, mods: r.mods, score: r.score, n300: r.n300, n100: r.n100, n50: r.n50, miss: r.miss, maxCombo: r.maxCombo, objects: n, acc: ((300*r.n300+100*r.n100+50*r.n50)/(300*n)*100).toFixed(2), frames: r.frames.length, first: r.frames[0]?.time, last: r.frames[r.frames.length-1]?.time, presses, version: r.gameVersion });
}
