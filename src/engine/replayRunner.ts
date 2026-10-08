import type { Beatmap } from "../beatmap/types.js";
import type { Replay } from "../replay/osr.js";
import { GameEngine, type EngineOptions } from "./GameEngine.js";

/** Plays a recorded replay through the real-time engine (used for tests and demos). */
export function runReplay(map: Beatmap, replay: Replay, options: Partial<EngineOptions> = {}): GameEngine {
  const engine = new GameEngine(map, options);
  for (const f of replay.frames) engine.input(f.time, f.x, f.y, f.keys & 15);
  const last = replay.frames[replay.frames.length - 1];
  if (last) engine.flush(last.time);
  return engine;
}
