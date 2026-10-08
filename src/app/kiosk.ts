import { AudioEngine, ManualClock, type SongClock } from "../audio/AudioEngine.js";
import { findFile } from "../content/osz.js";
import { KioskMachine, type MachineEvent, type Screen } from "../kiosk/machine.js";
import { LOGICAL_H, LOGICAL_W } from "../render/PlayRenderer.js";
import { SimulatedHardware, TEST_CARDS } from "./hardware.js";
import { button, countUp, el, fmt, playDots } from "./ui.js";
import { Library, type LibEntry } from "./library.js";
import { PlayScene } from "./PlayScene.js";
import { openOperator } from "./operator.js";
import { SCREENS } from "./screens.js";
import logoUrl from "../../prototipo/logo/poipiu-logo.svg?url";

/** A wall-clock song clock that starts at `startMs` (used for the attract demo and the tutorial). */
export class LoopClock implements SongClock {
  private t0 = performance.now();
  constructor(private readonly startMs: number) {}
  now(): number { return this.startMs + (performance.now() - this.t0); }
  fromPerf(p: number): number { return this.startMs + (p - this.t0); }
}

export interface KioskOptions { root: HTMLElement; canvas: HTMLCanvasElement; machine: KioskMachine; library: Library; manual?: boolean }

const LABELS: Record<Screen, string> = {
  idle: "POIPIU", credited: "BIENVENIDO", tutorial: "TUTORIAL", skin: "ELIGE TU SKIN", map: "ELIGE TU MAPA",
  playing: "JUGANDO", results: "RESULTADO", name: "NUEVO RECORD", ranking: "TOP 50", prizes: "PREMIOS",
};

export class KioskApp {
  readonly machine: KioskMachine;
  readonly library: Library;
  readonly manual: boolean;
  readonly manualClock = new ManualClock(0);
  readonly hardware: SimulatedHardware;
  private readonly g: CanvasRenderingContext2D;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private screenEl: HTMLElement | null = null;
  private marquee!: HTMLElement;
  private bottom!: HTMLElement;
  private cleanup: (() => void)[] = [];

  audio: AudioEngine | null = null;
  scene: PlayScene | null = null;
  ambient: PlayScene | null = null;
  private ambientEnds = 0;
  private stopSong: (() => void) | null = null;
  private bg: { url: string; img: HTMLImageElement } | null = null;
  private raf = 0;
  private audioCache = new Map<string, AudioBuffer>();
  private stopPreview: (() => void) | null = null;

  skinIdx = 0;
  selected: LibEntry | null = null;
  tutorialStep: 1 | 2 | 3 = 1;
  private shownTickets = 0;
  private cancelTickets: (() => void) | null = null;

  constructor(o: KioskOptions) {
    this.machine = o.machine; this.library = o.library; this.manual = !!o.manual;
    this.root = o.root; this.canvas = o.canvas; this.g = o.canvas.getContext("2d")!;
    this.hardware = new SimulatedHardware({ onCoin: () => this.coin(), onCard: (uid) => this.card(uid) });
    this.buildFrame();
    this.machine.subscribe((e) => this.onMachine(e));
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === "KeyO") { e.preventDefault(); openOperator(this); }
      if (e.key === "Escape" && this.machine.screen === "playing") this.abandon();
    });
  }

  start(): void {
    this.showScreen();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
    if (!this.manual) loop();
  }
  /** Manual stepping for tests and offline rendering. */
  step(timeMs: number): void { this.manualClock.time = timeMs; this.frame(); }

  // ------------------------------------------------------------------ hardware

  async ensureAudio(): Promise<AudioEngine | null> {
    if (this.manual) return null;
    this.audio ??= new AudioEngine();
    await this.audio.resume().catch(() => undefined);
    return this.audio;
  }
  coin(): void { void this.ensureAudio(); this.machine.insertCoin(); }
  card(uid: string): void { void this.ensureAudio(); this.machine.scanCard(uid); }

  // ------------------------------------------------------------------ frame and screens

  private buildFrame(): void {
    this.root.replaceChildren();
    this.marquee = el("div", "marquee");
    this.bottom = el("div", "bottombar");
    this.root.append(this.marquee, this.bottom);
    this.updateMeters(true);
    const hw = el("div", "hw");
    hw.append(button("MONEDA [C]", () => this.coin(), "", "hw-coin"), button("TARJETA [T]", () => this.card(this.hardware.currentCard), "", "hw-card"));
    this.bottom.append(el("span", "", "P1"), hw, el("span", "", "CTRL+SHIFT+O OPERADOR"));
  }

  /** Redraws the marquee (label, plays, ticket counter). */
  updateMeters(initial = false): void {
    const s = this.machine.screen, m = this.machine;
    const label = el("span", "label", LABELS[s]);
    const logo = el("img"); logo.src = logoUrl; logo.alt = "POIPIU";
    const meters = el("div", "meters");
    const plays = el("span", "", "JUGADAS"); plays.append(playDots(m.playsLeft, Math.max(3, m.cfg.credits.playsPerDeposit)));
    meters.append(plays);
    if (m.session?.cardUid) {
      const t = el("span", "", "TICKETS"), b = el("b", "", fmt(initial ? 0 : this.shownTickets)); b.id = "tickets";
      t.append(b); meters.append(t);
      const target = m.balance;
      if (!initial && target !== this.shownTickets) {
        this.cancelTickets?.();
        this.cancelTickets = countUp(b, target, 900, this.shownTickets);
        this.shownTickets = target;
      } else { b.textContent = fmt(target); this.shownTickets = target; }
    } else this.shownTickets = 0;
    this.marquee.replaceChildren(logo, label, meters);
  }

  private onMachine(e?: MachineEvent): void {
    if (e?.type === "redeem") this.toast(`CANJEADO: ${e.prize.name.toUpperCase()}`);
    if (this.machine.screen === "playing") { this.updateMeters(); return; }
    this.showScreen();
    this.updateMeters();
  }

  showScreen(): void {
    this.cleanup.forEach((c) => c()); this.cleanup = [];
    this.stopPreview?.(); this.stopPreview = null;
    this.screenEl?.remove();
    const s = this.machine.screen;
    if (s === "idle") this.startAttract(); else if (s !== "tutorial") this.stopAmbient();
    if (s === "playing") { this.screenEl = null; return; }
    const next = SCREENS[s](this);
    this.screenEl = next;
    this.root.append(next);
    this.updateMeters();
    if (this.manual && !this.scene) this.frame(); // keep the canvas in sync with the screen when time is stepped by hand
  }
  screenHost(): HTMLElement { return this.root; }
  onCleanup(fn: () => void): void { this.cleanup.push(fn); }
  toast(msg: string): void { const t = el("div", "toast", msg); this.root.append(t); setTimeout(() => t.remove(), 2600); }

  // ------------------------------------------------------------------ canvas

  private frame(): void {
    const g = this.g;
    if (this.scene) { this.scene.frame(g, (c) => this.drawBg(c, 0.62)); return; }
    if (this.ambient) {
      this.ambient.frame(g, (c) => this.drawBg(c, 0.8));
      g.fillStyle = "rgba(7,6,26,0.5)"; g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      if (!this.manual && this.ambient.engine.finished && this.ambient.engine.judged > 0 && this.ambient.engine.score >= 0 && performance.now() > this.ambientEnds) this.restartAmbient();
      return;
    }
    this.drawBg(g, 0.8);
  }

  setCover(url: string | null): void {
    if (!url) { this.bg = null; return; }
    if (this.bg?.url === url) return;
    const img = new Image(); img.src = url;
    this.bg = { url, img };
  }
  private drawBg(c: CanvasRenderingContext2D, dim: number): void {
    c.setTransform(1, 0, 0, 1, 0, 0);
    const grad = c.createLinearGradient(0, 0, 0, LOGICAL_H); grad.addColorStop(0, "#07061a"); grad.addColorStop(1, "#12102e");
    c.fillStyle = grad; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const img = this.bg?.img;
    if (img?.complete && img.naturalWidth) {
      const r = Math.max(LOGICAL_W / img.naturalWidth, LOGICAL_H / img.naturalHeight);
      c.save(); c.filter = "blur(10px)"; c.drawImage(img, (LOGICAL_W - img.naturalWidth * r) / 2, (LOGICAL_H - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r); c.restore();
    }
    c.fillStyle = `rgba(7,6,26,${dim})`; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // retro grid floor
    c.save(); c.strokeStyle = "rgba(255,46,136,0.2)"; c.lineWidth = 2;
    const t = (this.manual ? this.manualClock.time : performance.now()) / 1000;
    for (let i = -20; i <= 20; i++) { c.beginPath(); c.moveTo(LOGICAL_W / 2 + i * 40, 700); c.lineTo(LOGICAL_W / 2 + i * 260, LOGICAL_H); c.stroke(); }
    for (let k = 0; k < 12; k++) { const p = (k + ((t * 0.6) % 1)) / 12, y = 700 + Math.pow(p, 2.2) * (LOGICAL_H - 700); c.globalAlpha = 0.15 + p * 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(LOGICAL_W, y); c.stroke(); }
    c.restore();
  }

  // ------------------------------------------------------------------ ambient demos (attract and tutorial)

  stopAmbient(): void { this.ambient?.dispose(); this.ambient = null; }

  /** Starts a silent autoplay of some map in the background. `entry` defaults to the hardest map. */
  startAmbient(entry: LibEntry | null, startMs: number, durationMs = 22000): void {
    this.stopAmbient();
    if (!entry) return;
    this.setCover(entry.coverUrl);
    const clock: SongClock = this.manual ? this.manualClock : new LoopClock(startMs);
    this.ambient = new PlayScene(this.canvas, entry.entry.beatmap, this.library.skins[this.skinIdx] ?? this.library.skins[0]!, clock, null, { auto: true, hud: false, countdown: false });
    this.ambientEnds = performance.now() + durationMs;
    this.ambientEntry = entry; this.ambientStart = startMs;
  }
  private ambientEntry: LibEntry | null = null;
  private ambientStart = 0;
  private restartAmbient(): void {
    if (this.machine.screen === "tutorial") { this.startTutorialDemo(); return; }
    this.startAttract();
  }
  startAttract(): void {
    const entries = this.library.entries;
    if (!entries.length) { this.stopAmbient(); this.setCover(null); return; }
    const e = entries[Math.floor(Math.random() * entries.length)]!;
    const objs = e.entry.beatmap.hitObjects, span = objs[objs.length - 1]!.time - objs[0]!.time;
    this.startAmbient(e, objs[0]!.time + span * (0.15 + Math.random() * 0.4));
  }
  startTutorialDemo(): void {
    // The tutorial runs on tiny hand-made maps drawn with the chosen skin.
    void import("./tutorialMap.js").then(({ tutorialMap }) => {
      this.stopAmbient();
      const map = tutorialMap(this.tutorialStep);
      const clock: SongClock = this.manual ? this.manualClock : new LoopClock(-800);
      this.ambient = new PlayScene(this.canvas, map, this.library.skins[this.skinIdx] ?? this.library.skins[0]!, clock, null, { auto: true, hud: false, countdown: false });
      this.ambientEnds = performance.now() + 8500;
      this.setCover(null);
    });
  }

  // ------------------------------------------------------------------ audio helpers

  async audioFor(e: LibEntry): Promise<AudioBuffer | null> {
    if (this.manual) return null;
    const hit = this.audioCache.get(e.mapKey);
    if (hit) return hit;
    const bytes = findFile(e.pack.files, e.entry.beatmap.audioFilename);
    const audio = await this.ensureAudio();
    if (!bytes || !audio) return null;
    try {
      const buf = await audio.decode(bytes);
      this.audioCache.set(e.mapKey, buf);
      if (this.audioCache.size > 6) this.audioCache.delete(this.audioCache.keys().next().value as string);
      return buf;
    } catch { return null; }
  }
  async previewMap(e: LibEntry): Promise<void> {
    this.stopPreview?.(); this.stopPreview = null;
    const buf = await this.audioFor(e);
    if (!buf || !this.audio || this.machine.screen !== "map") return;
    const at = e.entry.beatmap.previewTime > 0 ? e.entry.beatmap.previewTime : (e.entry.beatmap.hitObjects[0]?.time ?? 0);
    this.stopPreview = this.audio.playPreview(buf, at);
  }

  // ------------------------------------------------------------------ playing

  /** Starts the selected map. Uses one of the plays of the deposit. */
  async startSelectedPlay(): Promise<boolean> {
    const e = this.selected;
    if (!e || !this.machine.startPlay()) return false;
    this.stopAmbient(); this.stopPreview?.(); this.stopPreview = null;
    this.setCover(e.coverUrl);
    const map = e.entry.beatmap;
    const lead = Math.max(3000, 3000 - (map.hitObjects[0]?.time ?? 0));
    let clock: SongClock;
    const audio = await this.ensureAudio();
    if (this.manual || !audio) { clock = this.manual ? this.manualClock : new LoopClock(-lead); if (this.manual) this.manualClock.time = -lead; }
    else {
      const sound = ["normal-hitnormal.wav", "soft-hitnormal.wav"].map((n) => findFile(e.pack.files, n)).find(Boolean)
        ?? Object.entries(e.pack.files).find(([k]) => /hitnormal/i.test(k))?.[1];
      await audio.setHitSound(sound);
      const buf = await this.audioFor(e);
      if (buf) { const p = audio.playSong(buf, lead); clock = p; this.stopSong = () => p.stop(); }
      else clock = new LoopClock(-lead);
    }
    const skin = this.library.skins[this.skinIdx] ?? this.library.skins[0]!;
    this.scene = new PlayScene(this.canvas, map, skin, clock, this.manual ? null : audio, {
      auto: new URLSearchParams(location.search).has("bot"),
      engine: { health: this.machine.cfg.health.enabled },
      onFail: () => { this.stopSong?.(); this.stopSong = null; this.audio?.playFail(); },
      onFinish: (r) => this.onPlayFinished(e, skin.name, r),
    });
    this.showScreen();
    return true;
  }

  private onPlayFinished(e: LibEntry, skinName: string, r: ReturnType<PlayScene["result"]>): void {
    this.stopSong?.(); this.stopSong = null;
    this.scene?.dispose(); this.scene = null;
    this.machine.finishPlay({ mapKey: e.mapKey, objects: r.objects, score: r.score, maxScore: e.maxScore, accuracy: r.accuracy, maxCombo: r.maxCombo, n300: r.n300, n100: r.n100, n50: r.n50, miss: r.miss, skin: skinName, failed: r.failed });
  }

  /** Test hook: plays a tutorial map directly (no deposit, no audio) on a real-time clock. */
  async debugPlay(step: 1 | 2 | 3 = 1): Promise<PlayScene> {
    const { tutorialMap } = await import("./tutorialMap.js");
    this.stopAmbient(); this.scene?.dispose();
    this.screenEl?.remove(); this.screenEl = null;
    this.scene = new PlayScene(this.canvas, tutorialMap(step), this.library.skins[0]!, new LoopClock(-1500), null, { countdown: false });
    return this.scene;
  }

  /** Leaves a play in progress; the play is not refunded. */
  abandon(): void {
    this.stopSong?.(); this.stopSong = null;
    this.scene?.dispose(); this.scene = null;
    this.machine.abandonPlay();
  }

  get cards(): string[] { return TEST_CARDS; }
}
