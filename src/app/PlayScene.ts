import { applyStacking } from "../beatmap/stacking.js";
import type { Beatmap } from "../beatmap/types.js";
import type { AudioEngine, SongClock } from "../audio/AudioEngine.js";
import type { Skin } from "../content/skin.js";
import { autoplay, type InputSample } from "../engine/autoplay.js";
import { GameEngine, type EngineEvent, type EngineOptions } from "../engine/GameEngine.js";
import { FIELD, LOGICAL_H, LOGICAL_W, PlayRenderer, toOsu } from "../render/PlayRenderer.js";

export interface PlayResult {
  score: number; maxCombo: number; accuracy: number;
  n300: number; n100: number; n50: number; miss: number; objects: number;
  failed: boolean;
}

export interface PlaySceneOptions {
  /** The bot plays instead of the player (attract mode, demos). */
  auto?: boolean;
  /** Extra time before the first object (ms of silence at the start). */
  leadInMs?: number;
  engine?: Partial<EngineOptions>;
  /** Draw score, combo and bars (default true). Attract mode turns it off. */
  hud?: boolean;
  /** Seconds-based countdown shown while the song time is negative (default true). */
  countdown?: boolean;
  onFinish?: (r: PlayResult) => void;
  /** Called once when the health bar empties. */
  onFail?: () => void;
  onEvents?: (events: EngineEvent[]) => void;
}

const KEYS: Record<string, number> = { KeyZ: 4, KeyX: 8 };

/** One play of one map: input -> engine -> renderer, on a clock (audio or manual). */
export class PlayScene {
  readonly engine: GameEngine;
  readonly renderer: PlayRenderer;
  readonly map: Beatmap;
  private mask = 0;
  private cursor = { x: 256, y: 192 };
  private autoSamples: InputSample[] = [];
  private autoPtr = 0;
  private finished = false;
  private failNotified = false;
  private disposers: (() => void)[] = [];
  private lastEnd: number;
  /** Rolling record of the latest hit offsets, for the hit error bar. */
  readonly hitOffsets: number[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    map: Beatmap,
    skin: Skin,
    private readonly clock: SongClock,
    private readonly audio: AudioEngine | null,
    private readonly options: PlaySceneOptions = {},
  ) {
    this.map = applyStacking(map);
    this.engine = new GameEngine(this.map, options.engine);
    this.renderer = new PlayRenderer(this.map, skin);
    const objs = this.map.hitObjects;
    const last = objs[objs.length - 1]!;
    this.lastEnd = last.kind === "spinner" ? last.endTime : last.time;
    if (options.auto) this.autoSamples = autoplay(this.map);
    else this.bindInput();
  }

  /** Current song time in ms. */
  time(): number { return this.clock.now(); }

  dispose(): void { for (const d of this.disposers) d(); this.disposers = []; }

  // ------------------------------------------------------------------ input

  private toOsu(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * LOGICAL_W, sy = ((clientY - r.top) / r.height) * LOGICAL_H;
    return toOsu(sx, sy);
  }
  private bindInput(): void {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K | string, fn: (e: never) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener));
    };
    const feed = (perf: number) => this.engine.input(this.clock.fromPerf(perf), this.cursor.x, this.cursor.y, this.mask);
    on(this.canvas, "pointermove", (e: PointerEvent) => {
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ce of events.length ? events : [e]) { this.cursor = this.toOsu(ce.clientX, ce.clientY); feed(ce.timeStamp); }
    });
    on(this.canvas, "pointerdown", (e: PointerEvent) => { this.cursor = this.toOsu(e.clientX, e.clientY); this.mask |= e.button === 2 ? 2 : 1; feed(e.timeStamp); e.preventDefault(); });
    on(window, "pointerup", (e: PointerEvent) => { this.mask &= ~(e.button === 2 ? 2 : 1); feed(e.timeStamp); });
    on(this.canvas, "contextmenu", (e: Event) => e.preventDefault());
    on(window, "keydown", (e: KeyboardEvent) => { const b = KEYS[e.code]; if (b && !e.repeat) { this.mask |= b; feed(e.timeStamp); } });
    on(window, "keyup", (e: KeyboardEvent) => { const b = KEYS[e.code]; if (b) { this.mask &= ~b; feed(e.timeStamp); } });
  }

  // ------------------------------------------------------------------ frame

  /** Advances the game to the clock's current time and draws one frame. Returns the song time used. */
  frame(g: CanvasRenderingContext2D, drawBackground?: (g: CanvasRenderingContext2D) => void): number {
    const now = this.clock.now();
    if (this.options.auto) {
      while (this.autoPtr < this.autoSamples.length && this.autoSamples[this.autoPtr]!.t <= now) {
        const s = this.autoSamples[this.autoPtr++]!;
        this.cursor = { x: s.x, y: s.y };
        this.engine.input(s.t, s.x, s.y, s.mask);
      }
    }
    this.engine.tick(now);
    const events = this.engine.drainEvents();
    if (events.length) {
      this.renderer.onEvents(events);
      for (const e of events) {
        if (e.type === "hit") { this.audio?.playHit(0.45); const o = this.map.hitObjects[e.index]!; this.hitOffsets.push(e.time - o.time); if (this.hitOffsets.length > 30) this.hitOffsets.shift(); }
        if (e.type === "sliderElement" && e.hit) this.audio?.playHit(0.18);
      }
      this.options.onEvents?.(events);
    }
    this.renderer.pushCursor(now, this.cursor.x, this.cursor.y);

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (drawBackground) drawBackground(g);
    this.renderer.draw(g, now, this.cursor);
    g.restore();
    if (this.options.hud !== false) this.drawHud(g, now);
    if (this.options.countdown !== false && now < 0 && !this.options.auto) this.drawCountdown(g, now);

    if (this.engine.failed && !this.failNotified) { this.failNotified = true; this.options.onFail?.(); }
    const failDone = this.engine.failed && this.engine.failTime !== null && now > this.engine.failTime + 2200;
    if (!this.finished && (failDone || (now > this.lastEnd + 1500 && this.engine.finished))) {
      this.finished = true;
      this.options.onFinish?.(this.result());
    }
    return now;
  }

  result(): PlayResult {
    const e = this.engine;
    return { score: e.score, maxCombo: e.maxCombo, accuracy: e.accuracy, n300: e.n300, n100: e.n100, n50: e.n50, miss: e.miss, objects: this.map.hitObjects.length, failed: e.failed };
  }

  // ------------------------------------------------------------------ HUD

  private drawCountdown(g: CanvasRenderingContext2D, now: number): void {
    const n = Math.ceil(-now / 1000);
    if (n < 1 || n > 3) return;
    const p = 1 - ((-now / 1000) - (n - 1)); // 0 -> 1 within each second
    g.save();
    g.translate(LOGICAL_W / 2, FIELD.y + 384);
    g.scale(1.5 - 0.5 * p, 1.5 - 0.5 * p);
    g.globalAlpha = 1 - Math.max(0, (p - 0.7) / 0.3);
    g.font = "220px 'Press Start 2P', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ffd23f"; g.shadowColor = "#ffd23f"; g.shadowBlur = 60; g.fillText(String(n), 0, 0);
    g.restore();
  }

  private drawHud(g: CanvasRenderingContext2D, now: number): void {
    const e = this.engine;
    const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") => {
      g.save(); g.font = `${size}px 'Press Start 2P', monospace`; g.textAlign = align; g.textBaseline = "middle";
      g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 10; g.fillText(s, x, y); g.restore();
    };
    text("SCORE", LOGICAL_W - 60, 110, 18, "#8c88b8", "right");
    text(String(Math.round(e.score)).padStart(8, "0"), LOGICAL_W - 60, 160, 38, "#ffd23f", "right");
    text("PRECISION", LOGICAL_W - 60, 250, 18, "#8c88b8", "right");
    text((e.accuracy * 100).toFixed(2) + "%", LOGICAL_W - 60, 300, 38, "#7cff4f", "right");
    text("COMBO", 60, LOGICAL_H - 170, 18, "#8c88b8");
    text("x" + e.combo, 60, LOGICAL_H - 110, 72, "#00e5ff");
    // health bar
    const hp = e.hp, hx = FIELD.x, hy = 100;
    g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(hx, hy, 1024, 14);
    g.fillStyle = hp > 0.5 ? "#7cff4f" : hp > 0.25 ? "#ffd23f" : "#ff3b3b";
    g.shadowColor = g.fillStyle; g.shadowBlur = hp < 0.25 ? 18 : 6; g.fillRect(hx, hy, 1024 * hp, 14); g.shadowBlur = 0;
    if (e.failed) {
      const ft = e.failTime ?? now, k = Math.min(1, (now - ft) / 400);
      g.fillStyle = `rgba(120,0,20,${0.5 * k})`; g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      text("FALLASTE", LOGICAL_W / 2, LOGICAL_H / 2, 90, "#ff3b3b", "center");
    }
    // progress
    const first = this.map.hitObjects[0]!.time, p = Math.min(1, Math.max(0, (now - first) / Math.max(1, this.lastEnd - first)));
    g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(FIELD.x, LOGICAL_H - 40, 1024, 8);
    g.fillStyle = "#ff2e88"; g.fillRect(FIELD.x, LOGICAL_H - 40, 1024 * p, 8);
    // hit error bar
    const bx = LOGICAL_W / 2, by = LOGICAL_H - 70;
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(bx - 150, by - 2, 300, 4);
    g.fillStyle = "#fff"; g.fillRect(bx - 1, by - 10, 2, 20);
    this.hitOffsets.forEach((o, i) => { g.fillStyle = `rgba(255,210,63,${0.25 + 0.75 * (i / this.hitOffsets.length)})`; g.fillRect(bx + Math.max(-150, Math.min(150, o * 1.25)) - 1, by - 7, 2, 14); });
  }
}
