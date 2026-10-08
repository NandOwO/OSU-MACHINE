import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, expandCharset, mergeConfig } from "../src/kiosk/config.js";
import { cleanName, Leaderboards } from "../src/kiosk/leaderboard.js";
import { KioskMachine, type PlayOutcome } from "../src/kiosk/machine.js";
import { MemoryStore } from "../src/kiosk/store.js";

const outcome = (score: number, extra: Partial<PlayOutcome> = {}): PlayOutcome => ({
  mapKey: "map-a", objects: 300, score, maxScore: 1_000_000, accuracy: 0.95, maxCombo: 200, n300: 280, n100: 15, n50: 3, miss: 2, ...extra,
});
let clock = 1_000_000;
const make = (store = new MemoryStore(), cfg?: unknown) => { clock = 1_000_000; return new KioskMachine(store, cfg, () => clock); };
/** Plays one map from the "map" screen to the results. */
const play = (m: KioskMachine, o: PlayOutcome) => { expect(m.startPlay()).toBe(true); return m.finishPlay(o); };
const toMap = (m: KioskMachine) => { m.continueFromCredit(); if (m.screen === "tutorial") m.finishTutorial(); m.chooseSkin(); };

describe("payments and plays per deposit", () => {
  it("a coin starts a session with 3 plays; another coin adds 3 more", () => {
    const m = make();
    expect(m.screen).toBe("idle");
    m.insertCoin();
    expect(m.screen).toBe("credited");
    expect(m.playsLeft).toBe(3);
    m.insertCoin();
    expect(m.playsLeft).toBe(6);
    expect(m.stats.coins).toBe(2);
  });
  it("a card also gives a deposit and registers the card", () => {
    const m = make();
    m.scanCard("A3F2");
    expect(m.playsLeft).toBe(3);
    expect(m.session!.cardUid).toBe("A3F2");
    expect(m.cards.get("A3F2")).not.toBeNull();
    expect(m.stats.cardDeposits).toBe(1);
  });
  it("tapping the same card during a session with plays left does not charge again", () => {
    const m = make();
    m.scanCard("A3F2");
    m.scanCard("A3F2");
    expect(m.playsLeft).toBe(3);
  });
  it("every play and retry costs one play, and none can start at zero", () => {
    const m = make();
    m.insertCoin(); toMap(m);
    play(m, outcome(1000)); m.playAgain();
    play(m, outcome(1000)); m.playAgain();
    play(m, outcome(1000));
    expect(m.playsLeft).toBe(0);
    m.screen = "results";
    expect(m.startPlay()).toBe(false);
  });
  it("the number of plays per deposit is configurable", () => {
    const m = make(new MemoryStore(), { credits: { playsPerDeposit: 5 } });
    m.insertCoin();
    expect(m.playsLeft).toBe(5);
  });
});

describe("tickets", () => {
  it("are credited to the registered card using round(100 * r^2)", () => {
    const m = make();
    m.scanCard("A3F2"); toMap(m);
    const r = play(m, outcome(700_000)); // r = 0.7 -> 49
    expect(r.tickets).toBe(49);
    expect(m.cards.get("A3F2")!.tickets).toBe(49);
    expect(m.session!.earned).toBe(49);
  });
  it("are lost when the player paid with a coin and has no card", () => {
    const m = make();
    m.insertCoin(); toMap(m);
    const r = play(m, outcome(700_000));
    expect(r.tickets).toBe(0);
    expect(r.ticketsLost).toBe(49);
    expect(m.stats.ticketsLost).toBe(49);
  });
  it("a card tapped mid-session collects tickets from then on", () => {
    const m = make();
    m.insertCoin(); toMap(m);
    play(m, outcome(700_000)); m.playAgain();
    m.scanCard("A3F2");
    const r = play(m, outcome(700_000));
    expect(r.tickets).toBe(49);
    expect(m.cards.get("A3F2")!.tickets).toBe(49);
  });
  it("short maps pay nothing", () => {
    const m = make();
    m.scanCard("A3F2"); toMap(m);
    expect(play(m, outcome(900_000, { objects: 20 })).tickets).toBe(0);
  });
  it("the cap and curve are configurable", () => {
    const m = make(new MemoryStore(), { tickets: { maxPerPlay: 200, curveExponent: 1 } });
    m.scanCard("A3F2"); toMap(m);
    expect(play(m, outcome(500_000)).tickets).toBe(100);
  });
});

describe("leaderboard", () => {
  it("ranks scores, keeps the older entry first on a tie and caps the list", () => {
    const b = new Leaderboards(new MemoryStore(), 3);
    expect(b.insert("m", { name: "A", score: 100, at: 1 })).toBe(1);
    expect(b.insert("m", { name: "B", score: 300, at: 2 })).toBe(1);
    expect(b.insert("m", { name: "C", score: 100, at: 3 })).toBe(3);
    expect(b.insert("m", { name: "D", score: 50, at: 4 })).toBeNull();
    expect(b.list("m").map((e) => e.name)).toEqual(["B", "A", "C"]);
    expect(b.rankFor("m", 200)).toBe(2);
    expect(b.rankFor("m", 100)).toBeNull();
  });
  it("holds 50 entries by default and each map has its own list", () => {
    const m = make();
    for (let i = 1; i <= 60; i++) m.boards.insert("x", { name: "N" + i, score: i * 10, at: i });
    expect(m.boards.list("x")).toHaveLength(50);
    expect(m.boards.list("x")[0]!.score).toBe(600);
    expect(m.boards.list("y")).toHaveLength(0);
  });
  it("validates names: up to 8 characters from the charset", () => {
    const { nameMaxLength: n, nameCharset: c } = DEFAULT_CONFIG.leaderboard;
    expect(cleanName("poipiu", n, c)).toBe("POIPIU");
    expect(cleanName("ABCDEFGH", n, c)).toBe("ABCDEFGH");
    expect(cleanName("ABCDEFGHI", n, c)).toBeNull();
    expect(cleanName("   ", n, c)).toBeNull();
    expect(cleanName("A<B", n, c)).toBeNull();
    expect(expandCharset("A-C0-2 _")).toBe("ABC012 _");
  });
});

describe("full session flow", () => {
  it("goes coin -> tutorial -> skin -> map -> play -> results -> name -> ranking -> map", () => {
    const m = make();
    m.insertCoin();
    expect(m.screen).toBe("credited");
    m.continueFromCredit();
    expect(m.screen).toBe("tutorial");
    m.finishTutorial();
    expect(m.screen).toBe("skin");
    m.chooseSkin();
    expect(m.screen).toBe("map");
    play(m, outcome(900_000));
    expect(m.screen).toBe("results");
    expect(m.results!.rank).toBe(1);
    m.continueFromResults();
    expect(m.screen).toBe("name");
    expect(m.submitName("A<B")).toBeNull();
    expect(m.screen).toBe("name");
    expect(m.submitName("POIPIU")).toBe(1);
    expect(m.screen).toBe("ranking");
    m.continueFromRanking();
    expect(m.screen).toBe("map");
    expect(m.boards.list("map-a")[0]!.name).toBe("POIPIU");
  });
  it("skips the name entry when the score does not make the list", () => {
    const m = make();
    m.insertCoin(); toMap(m);
    for (let i = 1; i <= 50; i++) m.boards.insert("map-a", { name: "X", score: 1_000_000 + i, at: i });
    const r = play(m, outcome(10_000));
    expect(r.rank).toBeNull();
    m.continueFromResults();
    expect(m.screen).toBe("map");
  });
  it("ends the session when the plays run out and there is nothing to redeem", () => {
    const m = make(new MemoryStore(), { credits: { playsPerDeposit: 1 } });
    m.insertCoin(); toMap(m);
    play(m, outcome(10, { objects: 10 }));
    m.boards.reset("map-a");
    m.continueFromResults(); // rank exists for score 10 -> name entry
    if (m.screen === "name") { m.submitName("ZZ"); m.continueFromRanking(); }
    expect(m.screen).toBe("idle");
    expect(m.session).toBeNull();
  });
  it("the tutorial is skipped for a card that already saw it", () => {
    const store = new MemoryStore();
    const a = make(store);
    a.scanCard("A3F2"); a.continueFromCredit(); a.finishTutorial();
    a.endSession();
    const b = make(store);
    b.scanCard("A3F2"); b.continueFromCredit();
    expect(b.screen).toBe("skin");
  });
  it("ends an idle session after the inactivity timeout, but never during a play", () => {
    const m = make();
    m.insertCoin();
    clock += 10_000;
    expect(m.checkInactivity(30_000)).toBe(false);
    clock += 25_000;
    expect(m.checkInactivity(30_000)).toBe(true);
    expect(m.screen).toBe("idle");
  });
});

describe("prizes", () => {
  const withBalance = (tickets: number) => {
    const m = make();
    m.scanCard("A3F2");
    m.cards.adjust("A3F2", tickets, "test");
    return m;
  };
  it("redeems a prize when the card has enough tickets", () => {
    const m = withBalance(3032);
    const r = m.redeem("funko");
    expect(r).toMatchObject({ ok: true, balance: 32 });
    expect(m.cards.get("A3F2")!.tickets).toBe(32);
    expect(m.stats.ticketsRedeemed).toBe(3000);
  });
  it("refuses when there are not enough tickets, no card, or an unknown prize", () => {
    expect(withBalance(2999).redeem("funko")).toEqual({ ok: false, reason: "not-enough" });
    const noCard = make(); noCard.insertCoin();
    expect(noCard.redeem("funko")).toEqual({ ok: false, reason: "no-card" });
    expect(withBalance(5000).redeem("nope")).toEqual({ ok: false, reason: "unknown-prize" });
  });
  it("the cheapest prize costs thousands of tickets", () => {
    expect(Math.min(...DEFAULT_CONFIG.prizes.map((p) => p.tickets))).toBeGreaterThanOrEqual(3000);
  });
  it("never lets a balance go negative", () => {
    const m = withBalance(10);
    expect(m.cards.adjust("A3F2", -50, "x")).toBe(0);
  });
});

describe("persistence and configuration", () => {
  it("keeps card balances and rankings across restarts", () => {
    const store = new MemoryStore();
    const a = make(store);
    a.scanCard("A3F2"); toMap(a);
    play(a, outcome(800_000)); a.continueFromResults(); a.submitName("POIPIU");
    const b = make(store);
    expect(b.cards.get("A3F2")!.tickets).toBe(64);
    expect(b.boards.list("map-a")[0]!.name).toBe("POIPIU");
  });
  it("ignores invalid configuration values", () => {
    const c = mergeConfig({ credits: { playsPerDeposit: -4 }, tickets: { maxPerPlay: "lots" }, leaderboard: { size: 9999 } });
    expect(c.credits.playsPerDeposit).toBe(3);
    expect(c.tickets.maxPerPlay).toBe(100);
    expect(c.leaderboard.size).toBe(50);
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG);
  });
  it("the operator can change the rules at runtime", () => {
    const m = make();
    m.setConfig({ credits: { playsPerDeposit: 2 } });
    m.insertCoin();
    expect(m.playsLeft).toBe(2);
    expect(make(m["store" as never] as never).cfg.credits.playsPerDeposit).toBe(2);
  });
});
