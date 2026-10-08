// Option B, Electron side: keeps osu! and tosu running, installs maps/skins into osu!, sets the skin, finds the .osr.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import { safeName } from "./store.mjs";

/** `osu.json` in the data folder; absent = option B is off. */
export function readOsuConfig(file) {
  try {
    const c = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")); // PowerShell 5 writes a BOM
    if (!c.osuDir) return null;
    return { osuDir: c.osuDir, osuExe: c.osuExe ?? "osu!.exe", osuArgs: c.osuArgs ?? [], tosuExe: c.tosuExe ?? null, tosuArgs: c.tosuArgs ?? [], launch: c.launch !== false };
  } catch { return null; }
}

/** osu! keeps its options in `osu!.<windows user>.cfg`. */
export function findCfg(osuDir) {
  if (!existsSync(osuDir)) return null;
  const f = readdirSync(osuDir).filter((n) => /^osu!\..*\.cfg$/i.test(n));
  return f.length ? join(osuDir, f[0]) : null;
}

/** Sets `Skin = name` (the file keeps its line endings). Returns false when osu! has no config yet. */
export function setSkinInCfg(osuDir, skinFolder) {
  const cfg = findCfg(osuDir);
  if (!cfg) return false;
  const text = readFileSync(cfg, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const line = `Skin = ${skinFolder}`;
  const out = /^Skin\s*=.*$/m.test(text) ? text.replace(/^Skin\s*=.*$/m, line) : text + (text.endsWith("\n") || !text ? "" : eol) + line + eol;
  writeFileSync(cfg, out);
  return true;
}

/** Extracts an archive into `dest`, refusing paths that escape it. Returns the file count. */
export function extractInto(bytes, dest) {
  const files = unzipSync(new Uint8Array(bytes));
  let n = 0;
  const root = normalize(dest) + sep;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const target = normalize(join(dest, name));
    if (!target.startsWith(root)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    n++;
  }
  return n;
}

const folderOf = (file) => safeName(basename(file).replace(/\.(osz|osk)$/i, ""));

/**
 * Copies the machine's maps (.osz -> Songs/<name>/) and skins (.osk -> Skins/<name>/) into osu! when missing.
 * osu! picks up new Songs folders when it starts. Returns what was installed.
 */
export function syncContent(osuDir, contentDir) {
  const out = { maps: [], skins: [] };
  if (!existsSync(contentDir)) return out;
  for (const f of readdirSync(contentDir)) {
    const m = /\.(osz|osk)$/i.exec(f);
    if (!m) continue;
    const dest = join(osuDir, m[1].toLowerCase() === "osz" ? "Songs" : "Skins", folderOf(f));
    if (existsSync(dest)) continue;
    try { extractInto(readFileSync(join(contentDir, f)), dest); (m[1].toLowerCase() === "osz" ? out.maps : out.skins).push(f); } catch { /* a broken archive must not stop the rest */ }
  }
  return out;
}

/** Name of the skin folder osu! should use for a skin file; null = osu!'s own default skin. */
export const skinFolderFor = (file) => (file && /\.osk$/i.test(file) ? folderOf(file) : null);

/** Newest .osr in Replays/ written since `sinceMs`; polls because osu! writes it a moment after the result screen. */
export async function findReplay(osuDir, sinceMs, { timeoutMs = 6000, pollMs = 250 } = {}) {
  const dir = join(osuDir, "Replays");
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(dir)) {
      const c = readdirSync(dir).filter((n) => /\.osr$/i.test(n)).map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs })).filter((x) => x.t >= sinceMs).sort((a, b) => b.t - a.t);
      if (c.length) return new Uint8Array(readFileSync(join(dir, c[0].n)));
    }
    if (Date.now() >= end) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Starts a program and starts it again if it dies, until `stop()`. */
class Watched {
  constructor(name, spawnFn, exe, args, cwd, restartDelay) { Object.assign(this, { name, spawnFn, exe, args, cwd, restartDelay }); this.child = null; this.wanted = false; this.restarts = 0; this.timer = null; }
  start() { this.wanted = true; this.spawnNow(); }
  spawnNow() {
    if (!this.wanted || this.child) return;
    try {
      const c = this.spawnFn(this.exe, this.args, { cwd: this.cwd, stdio: "ignore", windowsHide: false });
      this.child = c;
      c.on("error", () => { this.child = null; this.schedule(); });
      c.on("exit", () => { if (this.child === c) { this.child = null; this.schedule(); } });
    } catch { this.schedule(); }
  }
  schedule() { if (!this.wanted || this.timer) return; this.timer = setTimeout(() => { this.timer = null; this.restarts++; this.spawnNow(); }, this.restartDelay); }
  stop() { this.wanted = false; if (this.timer) { clearTimeout(this.timer); this.timer = null; } const c = this.child; this.child = null; try { c?.kill(); } catch { /* already gone */ } }
  get running() { return !!this.child; }
}

export class OsuSupervisor {
  constructor(cfg, contentDir, { spawnFn = spawn, restartDelay = 1500 } = {}) {
    this.cfg = cfg; this.contentDir = contentDir; this.spawnFn = spawnFn; this.restartDelay = restartDelay;
    const exe = (p) => (p.includes("/") || p.includes("\\") ? p : join(cfg.osuDir, p));
    this.osu = new Watched("osu", spawnFn, exe(cfg.osuExe), cfg.osuArgs, cfg.osuDir, restartDelay);
    this.tosu = cfg.tosuExe ? new Watched("tosu", spawnFn, cfg.tosuExe, cfg.tosuArgs, dirname(cfg.tosuExe), restartDelay) : null;
  }
  /** Start of a session: install what is missing, set the skin, (re)start osu! so it reads both. */
  prepare(skinFile) {
    const synced = syncContent(this.cfg.osuDir, this.contentDir);
    const folder = skinFolderFor(skinFile);
    const skinSet = folder ? setSkinInCfg(this.cfg.osuDir, folder) : false;
    this.osu.stop();
    if (this.cfg.launch) { this.tosu?.start(); this.osu.start(); }
    return { synced, skinSet };
  }
  /** End of a session or a violation: osu! is closed so nobody keeps playing. tosu stays. */
  stopOsu() { this.osu.stop(); }
  stopAll() { this.osu.stop(); this.tosu?.stop(); }
  findReplay(sinceMs, opts) { return findReplay(this.cfg.osuDir, sinceMs, opts); }
  readSongFile(dir, file) { return readSongFile(this.cfg.osuDir, dir, file); }
  status() { return { osu: this.osu.running, tosu: this.tosu?.running ?? false, osuRestarts: this.osu.restarts }; }
}

/** The folder osu! reads songs from: `BeatmapDirectory` in its config (relative to the osu! folder), default `Songs`. */
export function songsDir(osuDir) {
  const cfg = findCfg(osuDir);
  let dir = "Songs";
  if (cfg) { const m = /^BeatmapDirectory\s*=\s*(.+?)\s*$/m.exec(readFileSync(cfg, "utf8")); if (m && m[1]) dir = m[1]; }
  return resolve(osuDir, dir);
}

const inside = (base, target) => {
  const b = normalize(base) + sep, t = normalize(target);
  return process.platform === "win32" ? t.toLowerCase().startsWith(b.toLowerCase()) : t.startsWith(b);
};

/**
 * Reads a file of the song library (a .osu, its background...) for the page. `dir` and `file` come from tosu, so they are
 * only trusted when the result stays inside the songs folder and has an expected extension and size.
 */
export function readSongFile(osuDir, dir, file, { maxBytes = 20 * 1024 * 1024 } = {}) {
  try {
    if (typeof dir !== "string" || typeof file !== "string" || !file || file.includes("..")) return null;
    if (!/\.(osu|jpe?g|png|bmp|gif)$/i.test(file)) return null;
    const base = songsDir(osuDir);
    const target = resolve(isAbsolute(dir) ? dir : join(base, dir), file);
    if (!inside(base, target) || !existsSync(target)) return null;
    if (statSync(target).size > maxBytes) return null;
    return new Uint8Array(readFileSync(target));
  } catch { return null; }
}
