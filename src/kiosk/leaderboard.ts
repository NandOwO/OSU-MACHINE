import { expandCharset } from "./config.js";
import type { Store } from "./store.js";

export interface ScoreEntry { name: string; score: number; at: number; skin?: string }

/** Top-N ranking per map, persisted. Ties keep the older entry ahead. */
export class Leaderboards {
  constructor(private readonly store: Store, private size: number) {}
  setSize(size: number): void { this.size = size; }

  private key(mapKey: string): string { return `lb:${mapKey}`; }
  list(mapKey: string): ScoreEntry[] { return this.store.get<ScoreEntry[]>(this.key(mapKey)) ?? []; }

  /** 1-based position the score would take, or null when it does not make the list. */
  rankFor(mapKey: string, score: number): number | null {
    if (!(score > 0)) return null;
    const list = this.list(mapKey);
    let pos = list.findIndex((e) => score > e.score);
    if (pos < 0) pos = list.length;
    return pos < this.size ? pos + 1 : null;
  }

  /** Inserts an entry and returns its 1-based rank, or null if it does not qualify. */
  insert(mapKey: string, entry: ScoreEntry): number | null {
    const rank = this.rankFor(mapKey, entry.score);
    if (rank === null) return null;
    const list = this.list(mapKey);
    list.splice(rank - 1, 0, entry);
    this.store.set(this.key(mapKey), list.slice(0, this.size));
    return rank;
  }

  reset(mapKey: string): void { this.store.remove(this.key(mapKey)); }
}

/** Normalises a typed name; returns null when it is empty or has characters outside the charset. */
export function cleanName(raw: string, maxLength: number, charsetSpec: string): string | null {
  const allowed = expandCharset(charsetSpec);
  const name = raw.toUpperCase().replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (name.length === 0 || name.length > maxLength) return null;
  for (const ch of name) if (!allowed.includes(ch)) return null;
  return name;
}
