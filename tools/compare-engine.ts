import { readFileSync } from "node:fs";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { applyStacking } from "../src/beatmap/stacking.js";
import { parseReplay } from "../src/replay/osr.js";
import { runReplay } from "../src/engine/replayRunner.js";
import { simulate } from "../src/sim/replaySim.js";

const pairs = [["erisu-insane", "Deneb"], ["kimi", "Kimi"], ["shiori", "Shiori"]];
for (const [f, name] of pairs) {
  const map = applyStacking(parseBeatmap(readFileSync(`fixtures/private/${f}.osu`, "utf8")));
  const rep = parseReplay(new Uint8Array(readFileSync(`fixtures/private/${f}.osr`)));
  const sim = simulate(map, rep);
  const eng = runReplay(map, rep, { spinner: { judgement: 100, flatPoints: 0 } });
  const row = (n: string, a: number[]) => console.log(`  ${n.padEnd(8)}`, a.join(" / "));
  console.log(`== ${name}`);
  row("replay", [rep.n300, rep.n100, rep.n50, rep.miss, rep.maxCombo, rep.score]);
  row("sim", [sim.n300, sim.n100, sim.n50, sim.miss, sim.maxCombo, sim.score]);
  row("engine", [eng.n300, eng.n100, eng.n50, eng.miss, eng.maxCombo, eng.score]);
  // first object where the two disagree
  const a = sim.perObject, b = eng.results.slice().sort((x, y) => x.index - y.index);
  const n = Math.min(a.length, b.length);
  let shown = 0;
  for (let i = 0; i < n && shown < 5; i++) {
    const x = a[i]!, y = b[i]!;
    if (x.index !== y.index || x.judgement !== y.judgement || x.scoreAfter !== y.scoreAfter || x.comboAfter !== y.comboAfter) {
      console.log("  first diff at result", i, "sim", x.index, x.kind, x.judgement, x.comboAfter, x.scoreAfter, "| engine", y.index, y.kind, y.judgement, y.comboAfter, y.scoreAfter);
      shown++; break;
    }
  }
  console.log("  results", a.length, "vs", b.length);
}
