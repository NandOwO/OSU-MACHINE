// Compares the simulator against real replays. Usage: tsx tools/compare.ts <map.osu> <replay.osr> [...pairs]
import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { simulate, type SimOptions } from "../src/sim/replaySim.js";

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const raw = parseBeatmap(readFileSync(args[i]!, "utf8"));
  const rep = parseReplay(new Uint8Array(readFileSync(args[i + 1]!)));
  console.log(`== ${args[i]} (stack leniency ${raw.stackLeniency})`);
  console.log("  expected      ", rep.n300, rep.n100, rep.n50, rep.miss, "combo", rep.maxCombo, "score", rep.score);
  const variants: [string, Partial<SimOptions>, boolean][] = [["no stacking", {}, false], ["with stacking", {}, true]];
  for (const [name, opt, stack] of variants) {
    const map = stack ? applyStacking(raw) : raw;
    const r = simulate(map, rep, opt);
    const diff = r.score - rep.score;
    console.log(`  ${name.padEnd(14)}`, r.n300, r.n100, r.n50, r.miss, "combo", r.maxCombo, "score", r.score, `(${diff >= 0 ? "+" : ""}${diff}, ${(diff / rep.score * 100).toFixed(3)}%)`);
  }
}
