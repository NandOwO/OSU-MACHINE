import type { Beatmap } from "../beatmap/types.js";
import type { KioskMachine, PlayOutcome } from "../kiosk/machine.js";
import { checkMods } from "./mods.js";
import type { OsuSnapshot, SnapshotFeed } from "./types.js";
import { verifyReplay } from "./verify.js";

export interface MapRef { mapKey: string; map: Beatmap; maxScore: number }

export type BridgeEvent =
  | { type: "start"; mapKey: string | null }
  | { type: "finish"; outcome: PlayOutcome }
  | { type: "abandon"; reason: string }
  /** osu! is being played when the machine does not allow it (no plays left, wrong screen). The watchdog should close it. */
  | { type: "violation"; reason: string };

export interface BridgeOptions {
  /** Finds the map osu! is playing among the maps of the machine. null = not one of ours: it does not pay. */
  resolve: (s: OsuSnapshot) => MapRef | null;
  /** Returns the .osr osu! saved for this play (poll for it if needed), or null. */
  findReplay?: (s: OsuSnapshot, ref: MapRef) => Promise<Uint8Array | null>;
  /** Mods that may be used. Default none (NoMod only). */
  allowedMods?: string[];
  /** strict: a play without a matching replay is not paid. log: only reported. off: no check. */
  verify?: "strict" | "log" | "off";
  tolerance?: number;
  /** osu! may report the result screen before its numbers are filled in: wait this long for the best snapshot (ms). Default 1200; 0 = use the first. */
  settleMs?: number;
  onEvent?: (e: BridgeEvent) => void;
}

interface Active { ref: MapRef | null; last: OsuSnapshot; counted: boolean }

/** Turns what osu! reports into plays of the kiosk machine: start, finish, fail, abandon, retry. */
export class OsuBridge {
  private active: Active | null = null;
  private rogue = false;
  private chain: Promise<void> = Promise.resolve();
  private off: (() => void) | null = null;
  /** The best result-screen snapshot seen so far for the play that just ended, and the timer that closes it. */
  private best: OsuSnapshot | null = null;
  private settle: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly machine: KioskMachine, private readonly opt: BridgeOptions) {}

  attach(feed: SnapshotFeed): void { this.off?.(); this.off = feed.subscribe((s) => this.push(s)); }
  detach(): void { this.off?.(); this.off = null; }
  push(s: OsuSnapshot): void { this.chain = this.chain.then(() => this.handle(s)).catch(() => undefined); }
  /** Resolves when everything pushed so far was processed. */
  idle(): Promise<void> { return this.chain; }

  private emit(e: BridgeEvent): void { this.opt.onEvent?.(e); }

  private async handle(s: OsuSnapshot): Promise<void> {
    if (s.state === "play") {
      if (this.rogue) return;
      if (this.best) await this.closeResult(); // a new play started before the result timer fired
      if (this.active && s.timeMs < this.active.last.timeMs - 1500) await this.end(null, "REINTENTO"); // restarted: the old play is lost
      if (!this.active) {
        const ref = this.opt.resolve(s);
        const counted = this.machine.startPlay();
        if (!counted) { this.rogue = true; this.emit({ type: "violation", reason: "JUGANDO SIN JUGADAS" }); return; }
        this.active = { ref, last: s, counted };
        this.emit({ type: "start", mapKey: ref?.mapKey ?? null });
      }
      this.active.last = s;
    } else if (s.state === "result") {
      this.rogue = false;
      if (!this.active) return;
      if (!this.best || s.score >= this.best.score) this.best = s;
      const wait = this.opt.settleMs ?? 1200;
      if (wait <= 0) await this.closeResult();
      else if (!this.settle) this.settle = setTimeout(() => { this.chain = this.chain.then(() => this.closeResult()).catch(() => undefined); }, wait);
    } else if (s.state === "songSelect" || s.state === "menu") {
      this.rogue = false;
      if (this.best) await this.closeResult();
      else if (this.active) await this.end(null, "SALIO DE LA PARTIDA");
    }
  }

  /** Ends the play with the best snapshot: the result screen's, or the last one of the play if osu! left the numbers empty. */
  private async closeResult(): Promise<void> {
    if (this.settle) { clearTimeout(this.settle); this.settle = null; }
    const r = this.best; this.best = null;
    if (!this.active || !r) return;
    const last = this.active.last;
    await this.end(last.score > r.score ? { ...last, state: "result" } : r);
  }

  /** Closes the current play. `final` = the result screen snapshot; null = it ended without one (fail or quit). */
  private async end(final: OsuSnapshot | null, why = ""): Promise<void> {
    const a = this.active!; this.active = null;
    const s = final ?? a.last;
    const ref = a.ref;
    const failed = !final && why === "SALIO DE LA PARTIDA" && a.last.hp <= 0.001;
    if (!final && !failed) { this.machine.abandonPlay(); this.emit({ type: "abandon", reason: why }); return; }
    if (!ref) { this.machine.abandonPlay(); this.emit({ type: "abandon", reason: "MAPA DESCONOCIDO" }); return; }

    const outcome: PlayOutcome = {
      mapKey: ref.mapKey, objects: ref.map.hitObjects.length, score: s.score, maxScore: ref.maxScore, accuracy: s.accuracy,
      maxCombo: s.maxCombo, n300: s.n300, n100: s.n100, n50: s.n50, miss: s.miss, failed,
    };
    if (!failed) {
      const allMods = [...new Set([...a.last.mods, ...s.mods])];
      const mods = checkMods(allMods, this.opt.allowedMods ?? []);
      if (!mods.ok) outcome.invalid = mods.reason;
      else if ((this.opt.verify ?? "strict") !== "off") {
        const strict = (this.opt.verify ?? "strict") === "strict";
        const osr = this.opt.findReplay ? await this.opt.findReplay(s, ref).catch(() => null) : null;
        if (!osr) { if (strict) outcome.invalid = "NO SE PUDO VERIFICAR LA PARTIDA"; }
        else {
          const v = verifyReplay(ref.map, osr, s.score, { tolerance: this.opt.tolerance, allowedMods: this.opt.allowedMods });
          if (!v.ok && strict) outcome.invalid = v.reason;
        }
      }
    }
    this.machine.finishPlay(outcome);
    this.emit({ type: "finish", outcome });
  }
}
