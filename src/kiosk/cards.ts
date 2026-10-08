import type { Store } from "./store.js";

export interface Card { uid: string; tickets: number; createdAt: number; lastSeen: number }
export interface LedgerEntry { at: number; uid: string; delta: number; reason: string }

const MAX_LEDGER = 500;

/** Registered cards with their persistent ticket balance, plus a short ledger of movements. */
export class Cards {
  constructor(private readonly store: Store, private readonly now: () => number = Date.now) {}
  private all(): Record<string, Card> { return this.store.get<Record<string, Card>>("cards") ?? {}; }
  private save(c: Record<string, Card>): void { this.store.set("cards", c); }

  get(uid: string): Card | null { return this.all()[uid] ?? null; }
  list(): Card[] { return Object.values(this.all()); }

  /** Registers the card the first time it is seen. Returns the card and whether it is new. */
  touch(uid: string): { card: Card; isNew: boolean } {
    const all = this.all();
    const t = this.now();
    const existing = all[uid];
    const card: Card = existing ?? { uid, tickets: 0, createdAt: t, lastSeen: t };
    card.lastSeen = t;
    all[uid] = card;
    this.save(all);
    return { card, isNew: !existing };
  }

  /** Adds (or removes, when negative) tickets. Never goes below zero; returns the new balance. */
  adjust(uid: string, delta: number, reason: string): number {
    const all = this.all();
    const card = all[uid];
    if (!card) throw new Error(`Tarjeta desconocida: ${uid}`);
    const before = card.tickets;
    const after = Math.max(0, before + delta);
    card.tickets = after;
    this.save(all);
    const ledger = this.store.get<LedgerEntry[]>("ledger") ?? [];
    ledger.push({ at: this.now(), uid, delta: after - before, reason });
    this.store.set("ledger", ledger.slice(-MAX_LEDGER));
    return after;
  }

  ledger(): LedgerEntry[] { return this.store.get<LedgerEntry[]>("ledger") ?? []; }
}
