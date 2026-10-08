import type { Beatmap } from "../beatmap/types.js";
import { runReplay } from "../engine/replayRunner.js";
import { parseReplay } from "../replay/osr.js";
import { checkMods, modsFromFlags } from "./mods.js";

export interface VerifyResult { ok: boolean; reason?: string; simScore?: number }

/**
 * Cross-checks a play with the .osr that osu! saved: the replay is run through our own simulator
 * (validated on real replays: within ~1.6% of osu!'s score) and the score osu! reported must be close.
 * It also rejects replays with forbidden mods, which catches a spoofed mod list.
 */
export function verifyReplay(map: Beatmap, osr: Uint8Array, claimedScore: number, opts: { tolerance?: number; allowedMods?: string[] } = {}): VerifyResult {
  const tolerance = opts.tolerance ?? 0.03;
  let replay;
  try { replay = parseReplay(osr); } catch { return { ok: false, reason: "REPLAY ILEGIBLE" }; }
  if (replay.mode !== 0) return { ok: false, reason: "NO ES OSU!STANDARD" };
  const mods = checkMods(modsFromFlags(replay.mods), opts.allowedMods);
  if (!mods.ok) return { ok: false, reason: mods.reason };
  const sim = runReplay(map, replay, { health: false }).score;
  const diff = Math.abs(sim - claimedScore) / Math.max(1, claimedScore);
  if (diff > tolerance) return { ok: false, reason: "EL PUNTAJE NO COINCIDE CON EL REPLAY", simScore: sim };
  return { ok: true, simScore: sim };
}
