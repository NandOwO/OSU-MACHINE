import { emptySnapshot, type OsuSnapshot, type OsuState, type SnapshotFeed } from "./types.js";

/**
 * tosu (https://github.com/KotRikD/tosu) streams the game state over a local WebSocket.
 * This is the ONLY place that knows its field names. They were written from the public v2 format and
 * must be checked against a real tosu on Windows; if they differ, only this function changes.
 */
const STATE_NAMES: Record<string, OsuState> = {
  play: "play", playing: "play",
  resultscreen: "result", result: "result",
  selectsong: "songSelect", songselect: "songSelect", selectplay: "songSelect", selectedit: "songSelect",
  menu: "menu", mainmenu: "menu", idle: "menu",
};

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeTosu(raw: Raw): OsuSnapshot {
  const name = String(raw.state?.name ?? raw.state ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const s = emptySnapshot(STATE_NAMES[name] ?? "other");
  const bm = raw.beatmap ?? {}, play = raw.play ?? {}, res = raw.resultsScreen ?? {};
  const src = s.state === "result" && res.score !== undefined ? res : play;
  s.osuFile = raw.files?.beatmap ?? bm.file ?? undefined;
  s.md5 = bm.checksum ?? bm.md5 ?? undefined;
  s.title = bm.title; s.artist = bm.artist; s.version = bm.version;
  const mods = src.mods?.name ?? play.mods?.name ?? "";
  s.mods = typeof mods === "string" ? (mods.match(/[A-Z]{2}/g) ?? []).filter((m: string) => m !== "NM") : [];
  s.score = Number(src.score ?? 0);
  s.combo = Number(src.combo?.current ?? src.combo ?? 0);
  s.maxCombo = Number(src.combo?.max ?? src.maxCombo ?? 0);
  const h = src.hits ?? {};
  s.n300 = Number(h["300"] ?? 0); s.n100 = Number(h["100"] ?? 0); s.n50 = Number(h["50"] ?? 0); s.miss = Number(h["0"] ?? 0);
  s.accuracy = Number(src.accuracy ?? 100) / 100;
  s.hp = Number(play.healthBar?.normal ?? 200) / 200;
  s.timeMs = Number(bm.time?.live ?? 0);
  s.replayFile = res.replayFile ?? undefined;
  return s;
}

/** Feed backed by the tosu WebSocket (`ws://127.0.0.1:24050/websocket/v2`). Reconnects by itself. */
export class TosuFeed implements SnapshotFeed {
  private subs = new Set<(s: OsuSnapshot) => void>();
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  constructor(private readonly url = "ws://127.0.0.1:24050/websocket/v2") { this.connect(); }
  subscribe(cb: (s: OsuSnapshot) => void): () => void { this.subs.add(cb); return () => this.subs.delete(cb); }
  private connect(): void {
    if (this.closed) return;
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onmessage = (ev) => {
        try { const snap = normalizeTosu(JSON.parse(String(ev.data))); for (const cb of this.subs) cb(snap); } catch { /* ignore a bad frame */ }
      };
      ws.onclose = () => { this.ws = null; this.timer = setTimeout(() => this.connect(), 1500); };
      ws.onerror = () => ws.close();
    } catch { this.timer = setTimeout(() => this.connect(), 1500); }
  }
  dispose(): void { this.closed = true; if (this.timer) clearTimeout(this.timer); this.ws?.close(); }
}

/** In-process feed for the mock and for tests. */
export class ManualFeed implements SnapshotFeed {
  private subs = new Set<(s: OsuSnapshot) => void>();
  subscribe(cb: (s: OsuSnapshot) => void): () => void { this.subs.add(cb); return () => this.subs.delete(cb); }
  emit(s: OsuSnapshot): void { for (const cb of [...this.subs]) cb(s); }
}

/** The inverse of `normalizeTosu`: what the mock server sends so `TosuFeed` is exercised end to end. */
export function toTosuMessage(s: OsuSnapshot): Raw {
  const name = { play: "play", result: "resultScreen", songSelect: "selectSong", menu: "menu", other: "other" }[s.state];
  const hits = { "300": s.n300, "100": s.n100, "50": s.n50, "0": s.miss };
  const play = { score: s.score, accuracy: s.accuracy * 100, combo: { current: s.combo, max: s.maxCombo }, hits, mods: { name: s.mods.join("") || "NM" }, healthBar: { normal: s.hp * 200 } };
  return {
    state: { name },
    beatmap: { title: s.title, artist: s.artist, version: s.version, checksum: s.md5, time: { live: s.timeMs } },
    files: { beatmap: s.osuFile },
    play,
    resultsScreen: s.state === "result" ? { ...play, replayFile: s.replayFile } : {},
  };
}
