import { ticketsFor } from "../scoring/maxScore.js";
import { Cards } from "./cards.js";
import { cleanName, Leaderboards, type ScoreEntry } from "./leaderboard.js";
import { mergeConfig, type KioskConfig, type Prize } from "./config.js";
import type { Store } from "./store.js";

export type Screen = "idle" | "credited" | "tutorial" | "skin" | "map" | "playing" | "results" | "name" | "ranking" | "prizes";

/** What the game reports when a play ends. */
export interface PlayOutcome {
  mapKey: string;
  objects: number;
  score: number;
  /** Maximum ScoreV1 of the map (see `maxScoreV1`). */
  maxScore: number;
  accuracy: number;
  maxCombo: number;
  n300: number; n100: number; n50: number; miss: number;
  skin?: string;
  /** The player ran out of health: no tickets and no ranking. */
  failed?: boolean;
  /** The play cannot be paid or ranked (forbidden mod, replay does not match, ...). The text is the reason shown to the player. */
  invalid?: string;
}

export interface Session {
  startedAt: number;
  plays: number;
  playsTaken: number;
  deposits: number;
  cardUid: string | null;
  earned: number;
  tutorialDone: boolean;
}

export interface ResultsInfo {
  outcome: PlayOutcome;
  tickets: number;
  /** Tickets that would have been paid but there was no card. */
  ticketsLost: number;
  rank: number | null;
}

export type MachineEvent =
  | { type: "coin" }
  | { type: "card"; uid: string; isNew: boolean }
  | { type: "deposit"; plays: number }
  | { type: "tickets"; amount: number; lost: boolean }
  | { type: "rank"; rank: number }
  | { type: "redeem"; prize: Prize }
  | { type: "sessionEnd" };

export interface Stats { coins: number; cardDeposits: number; plays: number; ticketsPaid: number; ticketsLost: number; ticketsRedeemed: number; redemptions: { at: number; uid: string; prize: string; tickets: number }[] }
const EMPTY_STATS: Stats = { coins: 0, cardDeposits: 0, plays: 0, ticketsPaid: 0, ticketsLost: 0, ticketsRedeemed: 0, redemptions: [] };

/**
 * The cabinet's business logic: payments, plays per deposit, tickets, rankings and prizes.
 * It has no UI and no game inside; the screens call its methods and render its state.
 */
export class KioskMachine {
  screen: Screen = "idle";
  session: Session | null = null;
  results: ResultsInfo | null = null;
  /** Rank just obtained in the ranking screen (for the highlight). */
  lastRank: number | null = null;
  readonly cards: Cards;
  readonly boards: Leaderboards;
  private config: KioskConfig;
  private listeners = new Set<(e?: MachineEvent) => void>();
  private lastActivity: number;

  constructor(private readonly store: Store, config?: unknown, private readonly now: () => number = Date.now) {
    this.config = mergeConfig(config ?? store.get("config"));
    this.cards = new Cards(store, now);
    this.boards = new Leaderboards(store, this.config.leaderboard.size);
    this.lastActivity = now();
  }

  get cfg(): KioskConfig { return this.config; }
  get stats(): Stats { return { ...EMPTY_STATS, ...(this.store.get<Stats>("stats") ?? {}) }; }
  private bumpStats(fn: (s: Stats) => void): void { const s = this.stats; fn(s); this.store.set("stats", s); }

  subscribe(fn: (e?: MachineEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(e?: MachineEvent): void { this.lastActivity = this.now(); for (const l of this.listeners) l(e); }

  /** The operator changes the rules. Invalid values are ignored. */
  setConfig(partial: unknown): void {
    this.config = mergeConfig(partial, this.config);
    this.store.set("config", this.config);
    this.boards.setSize(this.config.leaderboard.size);
    this.emit();
  }

  /** Balance of the card in the current session, 0 when there is none. */
  get balance(): number { const uid = this.session?.cardUid; return uid ? (this.cards.get(uid)?.tickets ?? 0) : 0; }
  get playsLeft(): number { return this.session?.plays ?? 0; }

  // ------------------------------------------------------------------ payments

  insertCoin(): void {
    this.bumpStats((s) => { s.coins += 1; });
    this.deposit();
    this.emit({ type: "coin" });
  }

  scanCard(uid: string): void {
    const { isNew } = this.cards.touch(uid);
    const s = this.session;
    if (!s) {
      if (this.config.credits.cardGivesDeposit) {
        this.bumpStats((st) => { st.cardDeposits += 1; });
        this.deposit(uid);
      } else {
        this.session = this.newSession(uid, 0);
        this.screen = "prizes";
      }
    } else if (s.cardUid === null) {
      s.cardUid = uid; // a card tapped in the middle of a session starts collecting tickets from now on
    } else if (s.cardUid === uid && s.plays === 0 && this.config.credits.cardGivesDeposit && this.screen !== "playing") {
      this.bumpStats((st) => { st.cardDeposits += 1; });
      s.plays += this.config.credits.playsPerDeposit;
      s.deposits += 1;
      this.emit({ type: "deposit", plays: this.config.credits.playsPerDeposit });
    }
    this.emit({ type: "card", uid, isNew });
  }

  private newSession(uid: string | null, plays: number): Session {
    const seen = uid ? this.store.get<boolean>(`tutorial:${uid}`) === true : false;
    return { startedAt: this.now(), plays, playsTaken: 0, deposits: plays > 0 ? 1 : 0, cardUid: uid, earned: 0, tutorialDone: seen };
  }

  private deposit(uid: string | null = null): void {
    const n = this.config.credits.playsPerDeposit;
    if (!this.session) {
      this.session = this.newSession(uid, n);
      this.screen = "credited";
    } else {
      this.session.plays += n;
      this.session.deposits += 1;
    }
    this.emit({ type: "deposit", plays: n });
  }

  // ------------------------------------------------------------------ flow

  /** After the "credited" screen: tutorial the first time, otherwise straight to the skin. */
  continueFromCredit(): void {
    if (this.screen !== "credited") return;
    const needTutorial = this.config.tutorial.enabledFirstSession && !this.session!.tutorialDone;
    this.screen = needTutorial ? "tutorial" : "skin";
    this.emit();
  }
  finishTutorial(): void {
    if (this.screen !== "tutorial" || !this.session) return;
    this.session.tutorialDone = true;
    if (this.session.cardUid) this.store.set(`tutorial:${this.session.cardUid}`, true);
    this.screen = "skin";
    this.emit();
  }
  chooseSkin(): void { if (this.screen === "skin" || this.screen === "results") { this.screen = "map"; this.emit(); } }
  backToSkin(): void { if (this.screen === "map") { this.screen = "skin"; this.emit(); } }

  /** Starts a play, which costs one of the plays of the deposit. Returns false when none are left. */
  startPlay(): boolean {
    const s = this.session;
    if (!s || s.plays <= 0 || (this.screen !== "map" && this.screen !== "results")) return false;
    s.plays -= 1;
    s.playsTaken += 1;
    this.bumpStats((st) => { st.plays += 1; });
    this.screen = "playing";
    this.results = null;
    this.emit();
    return true;
  }

  /** A play was abandoned (the player left) and the play is not refunded. */
  abandonPlay(): void {
    if (this.screen !== "playing") return;
    this.screen = this.session && this.session.plays > 0 ? "map" : "idle";
    if (this.screen === "idle") this.endSession();
    else this.emit();
  }

  finishPlay(o: PlayOutcome): ResultsInfo {
    const s = this.session;
    if (!s || this.screen !== "playing") throw new Error("No hay una partida en curso");
    const t = this.config.tickets;
    const earned = !o.failed && !o.invalid && o.objects >= t.minObjectsForTickets ? ticketsFor(o.score, o.maxScore, t.maxPerPlay, t.curveExponent) : 0;
    let tickets = 0, lost = 0;
    if (earned > 0) {
      if (s.cardUid) { this.cards.adjust(s.cardUid, earned, `partida ${o.mapKey.slice(0, 12)}`); tickets = earned; s.earned += earned; }
      else if (t.cardRequired) lost = earned;
      else tickets = earned;
    }
    this.bumpStats((st) => { st.ticketsPaid += tickets; st.ticketsLost += lost; });
    const info: ResultsInfo = { outcome: o, tickets, ticketsLost: lost, rank: o.failed || o.invalid ? null : this.boards.rankFor(o.mapKey, o.score) };
    this.results = info;
    this.screen = "results";
    this.emit({ type: "tickets", amount: earned, lost: lost > 0 });
    return info;
  }

  /** Leaves the results screen: name entry if the score made the list, otherwise on to what comes next. */
  continueFromResults(): void {
    if (this.screen !== "results" || !this.results) return;
    if (this.results.rank !== null) { this.screen = "name"; this.emit(); } else this.nextStep();
  }

  /** Validates and stores the name; returns the final rank or null if the name is not valid. */
  submitName(raw: string, skin?: string): number | null {
    if (this.screen !== "name" || !this.results) return null;
    const { nameMaxLength, nameCharset } = this.config.leaderboard;
    const name = cleanName(raw, nameMaxLength, nameCharset);
    if (!name) return null;
    const entry: ScoreEntry = { name, score: this.results.outcome.score, at: this.now(), skin };
    const rank = this.boards.insert(this.results.outcome.mapKey, entry);
    this.lastRank = rank;
    this.screen = "ranking";
    this.emit(rank ? { type: "rank", rank } : undefined);
    return rank;
  }

  continueFromRanking(): void { if (this.screen === "ranking") this.nextStep(); }

  /** After a play: keep playing if there are plays left, offer prizes if there is a card, otherwise end. */
  private nextStep(): void {
    const s = this.session;
    if (!s) { this.screen = "idle"; this.emit(); return; }
    if (s.plays > 0) this.screen = "map";
    else if (s.cardUid && this.canAffordAny()) this.screen = "prizes";
    else { this.endSession(); return; }
    this.emit();
  }

  /** Retry or pick another map from the results screen. Both cost a play. */
  playAgain(): void { if (this.screen === "results" && this.session && this.session.plays > 0) { this.screen = "map"; this.emit(); } }

  // ------------------------------------------------------------------ prizes

  canAffordAny(): boolean { return this.balance >= Math.min(...this.config.prizes.map((p) => p.tickets)); }
  openPrizes(): boolean {
    if (!this.session?.cardUid) return false;
    if (this.screen === "playing") return false;
    this.screen = "prizes"; this.emit(); return true;
  }
  /** Exchanges tickets from the card for a prize. */
  redeem(prizeId: string): { ok: true; prize: Prize; balance: number } | { ok: false; reason: "no-card" | "unknown-prize" | "not-enough" } {
    const uid = this.session?.cardUid;
    if (!uid) return { ok: false, reason: "no-card" };
    const prize = this.config.prizes.find((p) => p.id === prizeId);
    if (!prize) return { ok: false, reason: "unknown-prize" };
    if ((this.cards.get(uid)?.tickets ?? 0) < prize.tickets) return { ok: false, reason: "not-enough" };
    const balance = this.cards.adjust(uid, -prize.tickets, `canje ${prize.id}`);
    this.bumpStats((s) => { s.ticketsRedeemed += prize.tickets; s.redemptions.push({ at: this.now(), uid, prize: prize.id, tickets: prize.tickets }); s.redemptions = s.redemptions.slice(-200); });
    this.emit({ type: "redeem", prize });
    return { ok: true, prize, balance };
  }
  closePrizes(): void {
    if (this.screen !== "prizes") return;
    if (this.session && this.session.plays > 0) { this.screen = "map"; this.emit(); } else this.endSession();
  }

  // ------------------------------------------------------------------ end of session

  endSession(): void {
    this.session = null;
    this.results = null;
    this.lastRank = null;
    this.screen = "idle";
    this.emit({ type: "sessionEnd" });
  }

  /** Ends the session when nobody has touched the machine for `timeoutMs`. Call it periodically. */
  checkInactivity(timeoutMs: number): boolean {
    if (!this.session || this.screen === "playing") return false;
    if (this.now() - this.lastActivity < timeoutMs) return false;
    this.endSession();
    return true;
  }
}
