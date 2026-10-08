import { readFileSync } from "node:fs";
import { parseReplay } from "../src/replay/osr.js";
const replay = parseReplay(new Uint8Array(readFileSync(process.argv[2]!)));
const [t0, t1] = [11016, 12099];
const fr = replay.frames.filter((f) => f.time >= t0 - 20 && f.time <= t1 + 20);
let total = 0, abs = 0, prev: number | null = null;
for (const f of fr) {
  const a = Math.atan2(f.y - 192, f.x - 256);
  if (prev !== null) {
    let d = a - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d; abs += Math.abs(d);
  }
  prev = a;
}
console.log("frames", fr.length, "net rotations", (total / (2 * Math.PI)).toFixed(2), "abs rotations", (abs / (2 * Math.PI)).toFixed(2));
console.log("OD8 spins/s required (lazer 3.25) * 1.083s =", (3.25 * 1.083).toFixed(2));
