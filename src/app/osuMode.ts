import { OsuBridge, type BridgeEvent } from "../osu/bridge.js";
import { scenarioSnapshots, type Scenario } from "../osu/mock.js";
import { ManualFeed, TosuFeed, normalizeTosu } from "../osu/tosu.js";
import type { OsuSnapshot } from "../osu/types.js";
import type { KioskApp } from "./kiosk.js";
import { getHost } from "./host.js";
import type { LibEntry } from "./library.js";

const base = (p?: string) => (p ?? "").split(/[\\/]/).pop()!.toLowerCase();

/** Finds the library map osu! is playing: by .osu file name, then by title + difficulty. */
export function resolveEntry(app: KioskApp, s: OsuSnapshot): LibEntry | null {
  const entries = app.library.entries;
  const f = base(s.osuFile);
  return (f && entries.find((e) => base(e.entry.file) === f))
    || entries.find((e) => !!s.title && e.entry.beatmap.metadata.title === s.title && e.entry.beatmap.metadata.version === s.version)
    || null;
}

/** Switches the shell to option B: `tosu` = real osu! through tosu, `mock` = scripted games. */
export function installOsuMode(app: KioskApp, source: "tosu" | "mock"): void {
  const feed = source === "tosu" ? new TosuFeed() : new ManualFeed();
  if (feed instanceof TosuFeed) installDiagnostics(app, feed);
  const state = { source, status: source === "tosu" ? "ESPERANDO A OSU!" : "SIMULACION", push: (s: OsuSnapshot) => (feed as ManualFeed).emit(s) };
  app.osu = state;
  const host = source === "tosu" ? getHost() : null;
  let playStart = Date.now();
  const bridge = new OsuBridge(app.machine, {
    findReplay: host ? () => host.osuFindReplay(playStart - 2000) : undefined,
    resolve: (s) => { const e = resolveEntry(app, s); return e ? { mapKey: e.mapKey, map: e.entry.beatmap, maxScore: e.maxScore } : null; },
    // Verification needs the .osr; in the simulation there is none, so it only logs.
    verify: source === "tosu" ? (({ strict: "strict", log: "log", off: "off" } as const)[new URLSearchParams(location.search).get("verify") ?? ""] ?? "strict") : "log",
    onEvent: (ev: BridgeEvent) => {
      if (ev.type === "start") playStart = Date.now();
      if (ev.type === "violation") void host?.osuStop();
      state.status = ev.type === "start" ? "PARTIDA EN CURSO" : ev.type === "finish" ? "PARTIDA TERMINADA" : ev.type === "abandon" ? `ABANDONO: ${ev.reason}` : `AVISO: ${ev.reason}`;
      app.showScreen();
    },
  });
  bridge.attach(feed);
  // The shell prepares osu! when the skin is chosen and closes it when the session ends.
  if (host) {
    let prev = app.machine.screen;
    app.machine.subscribe(() => {
      const now = app.machine.screen;
      if (prev === "skin" && now === "map") {
        state.status = "PREPARANDO OSU!...";
        const skin = app.library.skins[app.skinIdx];
        void host.osuPrepare(skin?.file ?? null).then(() => { state.status = "ESPERANDO A OSU!"; app.showScreen(); });
      } else if (now === "idle" && prev !== "idle") void host.osuStop();
      prev = now;
    });
  }
  (window as unknown as { __osu: unknown }).__osu = { bridge, feed, state };
}

/** Plays a scripted game in the simulation, paced like real time (compressed). */
export function runMock(app: KioskApp, mapKey: string, kind: string): void {
  const e = app.library.entries.find((x) => x.mapKey === mapKey);
  if (!e || !app.osu) return;
  const info = { osuFile: e.entry.file, title: e.entry.beatmap.metadata.title, version: e.entry.beatmap.metadata.version };
  const snaps = scenarioSnapshots(e.entry.beatmap, info, kind as Scenario);
  let i = 0;
  const step = () => { const s = snaps[i++]; if (!s) return; app.osu!.push(s); if (i < snaps.length) setTimeout(step, 25); };
  step();
}

/** Ctrl+Shift+D: shows what tosu is sending and how POIPIU reads it, to fix field names on a real machine. */
export function installDiagnostics(app: KioskApp, feed: TosuFeed): void {
  let box: HTMLTextAreaElement | null = null, timer = 0;
  const text = () => {
    const raw = feed.lastRaw as Record<string, unknown> | null;
    const head = `tosu: ${feed.connected ? "CONECTADO" : "SIN CONEXION"}   ultimo mensaje: ${feed.lastAt ? Math.round((Date.now() - feed.lastAt) / 1000) + " s" : "nunca"}   estado kiosco: ${app.machine.screen}\n`;
    if (!raw) return head + "\n(sin datos todavia)";
    const n = normalizeTosu(raw as never);
    return head + "\nLEIDO POR POIPIU:\n" + JSON.stringify(n, null, 1) + "\n\nMENSAJE DE TOSU (recortado):\n" + JSON.stringify(raw, null, 1).slice(0, 6000);
  };
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey && e.shiftKey && e.code === "KeyD")) return;
    e.preventDefault();
    if (box) { box.remove(); box = null; clearInterval(timer); return; }
    box = document.createElement("textarea");
    box.readOnly = true; box.id = "osu-diag";
    box.style.cssText = "position:fixed;inset:4vh 3vw;z-index:50;background:#07061aee;color:#9ff;border:3px solid #0ff;border-radius:8px;padding:12px;font:12px/1.4 monospace;resize:none";
    document.body.append(box);
    const upd = () => { if (box) box.value = text(); };
    upd(); timer = window.setInterval(upd, 500);
  });
}
