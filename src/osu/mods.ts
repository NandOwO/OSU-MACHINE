/** Mods that never pay, whatever the allowed list says: they play for the player or change the rules of the score. */
export const ALWAYS_FORBIDDEN = ["AT", "RX", "AP", "CN", "NF", "SO", "DT", "NC", "HT", "DC", "TD", "SV2", "V2", "RD", "TP"];

export interface ModVerdict { ok: boolean; reason?: string }

/** `allowed` is the operator's list of permitted mods (default empty = NoMod only). */
export function checkMods(mods: string[], allowed: string[] = []): ModVerdict {
  const bad = mods.filter((m) => ALWAYS_FORBIDDEN.includes(m) || !allowed.includes(m));
  return bad.length ? { ok: false, reason: `MOD NO PERMITIDO: ${bad.join("+")}` } : { ok: true };
}

/** Bit flags in a .osr file -> two-letter codes (only the standard mods that matter here). */
const FLAGS: [number, string][] = [[1, "NF"], [2, "EZ"], [4, "TD"], [8, "HD"], [16, "HR"], [32, "SD"], [64, "DT"], [128, "RX"], [256, "HT"], [512, "NC"], [1024, "FL"], [2048, "AT"], [4096, "SO"], [8192, "AP"], [16384, "PF"], [536870912, "V2"]];
export function modsFromFlags(flags: number): string[] {
  return FLAGS.filter(([bit]) => (flags & bit) !== 0).map(([, n]) => n);
}
