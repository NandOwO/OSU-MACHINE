/** Anything that tells the game where the song is, in ms (negative during the lead-in). */
export interface SongClock {
  /** Current song time in ms. */
  now(): number;
  /** Converts a `performance.now()`-style timestamp (input events) to song time in ms. */
  fromPerf(perfMs: number): number;
}

/** A clock driven by hand: used for tests, replays and offline rendering. */
export class ManualClock implements SongClock {
  constructor(public time = 0) {}
  now(): number { return this.time; }
  fromPerf(perfMs: number): number { return perfMs; }
}

export interface PlayingSong extends SongClock {
  stop(): void;
}

/** Thin wrapper over the Web Audio API: decoding, song playback with a precise clock, hit sounds, previews. */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private hitBuffer: AudioBuffer | null = null;

  constructor(ctx?: AudioContext) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number): void { this.master.gain.value = Math.min(1, Math.max(0, v)); }
  async resume(): Promise<void> { if (this.ctx.state !== "running") await this.ctx.resume(); }

  async decode(bytes: Uint8Array): Promise<AudioBuffer> {
    const copy = bytes.slice().buffer as ArrayBuffer; // decodeAudioData detaches its input
    return this.ctx.decodeAudioData(copy);
  }

  /** Sets the sound played on every hit. A short synthesized click is used when none is given. */
  async setHitSound(bytes?: Uint8Array): Promise<void> {
    if (bytes) { try { this.hitBuffer = await this.decode(bytes); return; } catch { /* fall through to the synthetic click */ } }
    const len = Math.floor(this.ctx.sampleRate * 0.08);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.sin((2 * Math.PI * 1500 * i) / this.ctx.sampleRate) * Math.exp(-i / (len / 7)) * 0.6;
    this.hitBuffer = b;
  }
  playHit(volume = 0.5): void {
    if (!this.hitBuffer) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.buffer = this.hitBuffer;
    src.connect(g).connect(this.master);
    src.start();
  }

  /**
   * Starts a song so that song time 0 happens `leadInMs` from now. Song time is derived from the
   * audio hardware clock, so it does not drift with frame rate.
   */
  playSong(buffer: AudioBuffer, leadInMs = 0, offsetMs = 0): PlayingSong {
    const ctx = this.ctx;
    const startCtx = ctx.currentTime + leadInMs / 1000;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.start(startCtx);
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
    const toSong = (ctxTime: number) => (ctxTime - startCtx) * 1000 - latency + offsetMs;
    return {
      now: () => toSong(ctx.currentTime),
      fromPerf: (perfMs: number) => {
        const ts = ctx.getOutputTimestamp();
        const ctxTime = (ts.contextTime ?? ctx.currentTime) + (perfMs - (ts.performanceTime ?? performance.now())) / 1000;
        return toSong(ctxTime);
      },
      stop: () => { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); },
    };
  }

  /** Plays a section of a song with fades (map select preview). Returns a stopper. */
  playPreview(buffer: AudioBuffer, startMs: number, durationMs = 15000): () => void {
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer;
    src.connect(g).connect(this.master);
    const t0 = ctx.currentTime, d = durationMs / 1000;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + 0.4);
    g.gain.setValueAtTime(1, t0 + d - 0.6);
    g.gain.linearRampToValueAtTime(0, t0 + d);
    src.start(t0, Math.max(0, startMs) / 1000, d);
    return () => { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); src.stop(ctx.currentTime + 0.2); } catch { /* ignore */ } };
  }
}
