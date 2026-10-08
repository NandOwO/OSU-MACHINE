/** What the kiosk needs to know about a real osu! game, whatever program reports it. */
export type OsuState = "menu" | "songSelect" | "play" | "result" | "other";

export interface OsuSnapshot {
  state: OsuState;
  /** The .osu file being played (absolute path or just the file name) and/or its metadata. */
  osuFile?: string;
  md5?: string;
  title?: string;
  artist?: string;
  version?: string;
  /** Two-letter mod codes ("HD", "DT", ...). Empty = NoMod. */
  mods: string[];
  score: number;
  combo: number;
  maxCombo: number;
  n300: number; n100: number; n50: number; miss: number;
  /** 0..1, same unit as the rest of the kiosk. */
  accuracy: number;
  /** Health 0..1. */
  hp: number;
  /** Position in the song, ms. It jumps back when the player restarts. */
  timeMs: number;
  /** Replay file written by osu! for this play, when known. */
  replayFile?: string;
}

export const emptySnapshot = (state: OsuState = "menu"): OsuSnapshot => ({
  state, mods: [], score: 0, combo: 0, maxCombo: 0, n300: 0, n100: 0, n50: 0, miss: 0, accuracy: 1, hp: 1, timeMs: 0,
});

/** A source of snapshots: the real tosu WebSocket, a mock, or a test script. */
export interface SnapshotFeed {
  subscribe(cb: (s: OsuSnapshot) => void): () => void;
}
