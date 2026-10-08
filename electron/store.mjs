import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";

/** Replaces anything that is not a plain file-name character so a key can never escape the folder. */
export const safeName = (s) => String(s).replace(/[^\w.-]/g, "_").slice(0, 120);

/** Writes a file so that a power cut leaves either the old or the new content, never a half-written one. */
export function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

/** Key-value store kept as one JSON file per key. Reads are served from memory, writes go to disk first. */
export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.mem = new Map();
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".tmp")) { try { unlinkSync(join(dir, f)); } catch { /* leftover of an interrupted write */ } continue; }
      if (!f.endsWith(".json")) continue;
      try { this.mem.set(f.slice(0, -5), readFileSync(join(dir, f), "utf8")); } catch { /* unreadable file: ignore */ }
    }
  }
  get(key) { return this.mem.get(safeName(key)) ?? null; }
  set(key, json) {
    const k = safeName(key);
    if (typeof json !== "string" || json.length > 8_000_000) throw new Error("valor invalido");
    writeAtomic(join(this.dir, `${k}.json`), json);
    this.mem.set(k, json);
  }
  remove(key) {
    const k = safeName(key);
    this.mem.delete(k);
    rmSync(join(this.dir, `${k}.json`), { force: true });
  }
}

const CONTENT_RE = /\.(osz|osk)$/i;
const MAX_CONTENT = 400 * 1024 * 1024;

/** The folder with the installed maps and skins. */
export class ContentFolder {
  constructor(dir) { this.dir = dir; mkdirSync(dir, { recursive: true }); }
  list() { return readdirSync(this.dir).filter((f) => CONTENT_RE.test(f)).map((f) => ({ name: f, size: statSync(join(this.dir, f)).size })); }
  read(name) {
    const n = safeName(name);
    if (!CONTENT_RE.test(n) || !existsSync(join(this.dir, n))) return null;
    return readFileSync(join(this.dir, n));
  }
  add(name, bytes) {
    const n = safeName(name);
    if (!CONTENT_RE.test(n)) throw new Error("solo .osz y .osk");
    if (bytes.byteLength > MAX_CONTENT) throw new Error("archivo demasiado grande");
    writeAtomic(join(this.dir, n), Buffer.from(bytes));
    return n;
  }
  remove(name) { rmSync(join(this.dir, safeName(name)), { force: true }); }
}
