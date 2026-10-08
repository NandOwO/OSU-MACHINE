import type { Beatmap } from "../beatmap/types.js";
import { autoplay } from "../engine/autoplay.js";
import { GameEngine } from "../engine/GameEngine.js";
import { emptySnapshot, type OsuSnapshot } from "./types.js";

export type Scenario = "complete" | "sloppy" | "fail" | "abandon" | "retry" | "mods";

export interface MockInfo { osuFile: string; md5?: string; title?: string; artist?: string; version?: string }

/** Plays `map` with the bot and returns what a real osu! would have reported every ~100 ms. */
function playSnapshots(map: Beatmap, info: MockInfo, opts: { timingOffset?: number; stopAt?: number; mods?: string[]; health?: boolean } = {}): OsuSnapshot[] {
  const samples = autoplay(map, { timingOffset: opts.timingOffset ?? 0 });
  const e = new GameEngine(map, { health: opts.health ?? true });
  const out: OsuSnapshot[] = [];
  const base = { osuFile: info.osuFile, md5: info.md5, title: info.title, artist: info.artist, version: info.version };
  const snap = (state: "play" | "result", t: number): OsuSnapshot => ({
    ...emptySnapshot(state), ...base, mods: opts.mods ?? [], score: e.score, combo: e.combo, maxCombo: e.maxCombo,
    n300: e.n300, n100: e.n100, n50: e.n50, miss: e.miss, accuracy: e.accuracy, hp: e.hp, timeMs: t,
  });
  let next = 0;
  for (const smp of samples) {
    if (opts.stopAt !== undefined && smp.t > opts.stopAt) break;
    e.input(smp.t, smp.x, smp.y, smp.mask);
    if (smp.t >= next) { out.push(snap("play", smp.t)); next = smp.t + 100; }
    if (e.failed) break;
  }
  const end = samples[samples.length - 1]?.t ?? 0;
  if (opts.stopAt === undefined && !e.failed) e.flush(end + 1000);
  out.push(snap("play", e.failed ? (e.failTime ?? end) : (opts.stopAt ?? end)));
  if (opts.stopAt === undefined && !e.failed) out.push(snap("result", end));
  return out;
}

/** A scripted sequence of snapshots for one scenario, ending back at song select (like osu! after a fail or a quit). */
export function scenarioSnapshots(map: Beatmap, info: MockInfo, kind: Scenario): OsuSnapshot[] {
  const back = emptySnapshot("songSelect");
  const last = (map.hitObjects[map.hitObjects.length - 1]?.time ?? 0);
  switch (kind) {
    case "complete": return [...playSnapshots(map, info), back];
    case "sloppy": return [...playSnapshots(map, info, { timingOffset: 40, health: false }), back];
    case "mods": return [...playSnapshots(map, info, { mods: ["HD", "DT"] }), back];
    case "fail": return [...playSnapshots(map, info, { timingOffset: 450 }), back];
    case "abandon": return [...playSnapshots(map, info, { stopAt: last * 0.4 }), back];
    case "retry": return [...playSnapshots(map, info, { stopAt: last * 0.3 }), ...playSnapshots(map, info), back];
  }
}
