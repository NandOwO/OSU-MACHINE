import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate } from "../src/sim/replaySim.js";
const [mp, rp] = process.argv.slice(2);
const map = parseBeatmap(readFileSync(mp!, "utf8"));
const rep = parseReplay(new Uint8Array(readFileSync(rp!)));
console.log("expected", rep.n300, rep.n100, rep.n50, rep.miss, "combo", rep.maxCombo, "score", rep.score);
for (const off of [-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6]) {
  const r = simulate(map, rep, { timeOffset: off });
  const ok = r.n300 === rep.n300 && r.n100 === rep.n100 && r.n50 === rep.n50 && r.miss === rep.miss;
  console.log(`off ${String(off).padStart(2)}`, r.n300, r.n100, r.n50, r.miss, "combo", r.maxCombo, "score", r.score, ok ? "<== counts match" : "");
}
