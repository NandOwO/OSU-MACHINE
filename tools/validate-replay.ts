import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate, type SimOptions } from "../src/sim/replaySim.js";

const map = parseBeatmap(readFileSync(process.argv[2]!, "utf8"));
const replay = parseReplay(new Uint8Array(readFileSync(process.argv[3]!)));
console.log("EXPECTED", { n300: replay.n300, n100: replay.n100, n50: replay.n50, miss: replay.miss, maxCombo: replay.maxCombo, score: replay.score });

// First, find the time offset between replay frames and the map clock.
const base = simulate(map, replay, {});
console.log("BASE", { ...base, perObject: undefined });
const variants: Partial<SimOptions>[] = [
  {}, { finalBeforeTail: true }, { strictWindows: true }, { followMultiplier: 3 }, { followMultiplier: 1 },
];
for (const v of variants) {
  const r = simulate(map, replay, v);
  console.log(JSON.stringify(v), { n300: r.n300, n100: r.n100, n50: r.n50, miss: r.miss, maxCombo: r.maxCombo, score: r.score, judged: r.judged });
}
