export interface RankInput { n300: number; n100: number; n50: number; miss: number; objects: number; accuracy: number }
export type Rank = "SS" | "S" | "A" | "B" | "C" | "D";

/** osu!standard letter rank. */
export function rankOf(r: RankInput): Rank {
  const n = Math.max(1, r.objects), p300 = r.n300 / n, p50 = r.n50 / n;
  if (r.accuracy >= 1) return "SS";
  if (p300 > 0.9 && p50 < 0.01 && r.miss === 0) return "S";
  if ((p300 > 0.8 && r.miss === 0) || p300 > 0.9) return "A";
  if ((p300 > 0.7 && r.miss === 0) || p300 > 0.8) return "B";
  if (p300 > 0.6) return "C";
  return "D";
}
