import { OsuBridge, type BridgeEvent } from "../osu/bridge.js";
import { scenarioSnapshots, type Scenario } from "../osu/mock.js";
import { ManualFeed, TosuFeed } from "../osu/tosu.js";
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
  const state = { source, status: source === "tosu" ? "ESPERANDO A OSU!" : "SIMULACION", push: (s: OsuSnapshot) => (feed as ManualFeed).emit(s) };
  app.osu = state;
  const host = source === "tosu" ? getHost() : null;
  let playStart = Date.now();
  const bridge = new OsuBridge(app.machine, {
    findReplay: host ? () => host.osuFindReplay(playStart - 2000) : undefined,
    resolve: (s) => { const e = resolveEntry(app, s); return e ? { mapKey: e.mapKey, map: e.entry.beatmap, maxScore: e.maxScore } : null; },
    // Verification needs the .osr; in the simulation there is none, so it only logs.
    verify: source === "tosu" ? "strict" : "log",
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
