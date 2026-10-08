import { findFile, loadPack, type BeatmapEntry, type Pack } from "../content/osz.js";
import { loadSkinFromPack, createDefaultSkin, type Skin } from "../content/skin.js";
import { maxScoreV1 } from "../scoring/maxScore.js";

export interface LibEntry {
  /** Stable key: SHA-256 of the .osu file, first 16 hex digits. Used for rankings. */
  mapKey: string;
  pack: Pack;
  entry: BeatmapEntry;
  /** Object URL of the background image, if any. */
  coverUrl: string | null;
  maxScore: number;
}

async function sha(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Raw archives kept in IndexedDB so the library survives reloads and restarts. */
export class ContentStore {
  private db: Promise<IDBDatabase>;
  constructor(name = "poipiu-content") {
    this.db = new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("packs", { keyPath: "name" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((res, rej) => { const r = fn(db.transaction("packs", mode).objectStore("packs")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async put(name: string, bytes: Uint8Array): Promise<void> { await this.tx("readwrite", (s) => s.put({ name, bytes, addedAt: Date.now() })); }
  async remove(name: string): Promise<void> { await this.tx("readwrite", (s) => s.delete(name)); }
  async all(): Promise<{ name: string; bytes: Uint8Array }[]> { return this.tx("readonly", (s) => s.getAll()); }
}

/** Everything the player can choose from: maps (with stable keys) and skins. */
export class Library {
  readonly entries: LibEntry[] = [];
  readonly skins: Skin[] = [createDefaultSkin()];
  readonly packs: Pack[] = [];
  private n = 0;
  constructor(private readonly store: ContentStore | null = null) {}

  /** Loads everything saved in the content store. */
  async restore(): Promise<void> {
    if (!this.store) return;
    for (const r of await this.store.all()) await this.add(r.name, r.bytes, false).catch(() => undefined);
  }

  async add(fileName: string, bytes: Uint8Array, persist = true): Promise<Pack> {
    if (this.packs.some((p) => p.name === fileName)) await this.remove(fileName);
    const pack = loadPack(`p${this.n++}`, fileName, bytes);
    this.packs.push(pack);
    for (const entry of pack.beatmaps) {
      const bg = entry.beatmap.backgroundFile ? findFile(pack.files, entry.beatmap.backgroundFile) : undefined;
      this.entries.push({
        mapKey: await sha(pack.files[entry.file]!), pack, entry, maxScore: maxScoreV1(entry.beatmap),
        coverUrl: bg ? URL.createObjectURL(new Blob([bg as BlobPart])) : null,
      });
    }
    const skin = await loadSkinFromPack(pack);
    if (skin) this.skins.push({ ...skin, name: skin.name || fileName });
    if (persist) await this.store?.put(fileName, bytes);
    return pack;
  }

  async remove(fileName: string): Promise<void> {
    const pack = this.packs.find((p) => p.name === fileName);
    if (!pack) return;
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]!.pack === pack) { const u = this.entries[i]!.coverUrl; if (u) URL.revokeObjectURL(u); this.entries.splice(i, 1); }
    const si = this.skins.findIndex((s) => s.id === pack.id);
    if (si > 0) this.skins.splice(si, 1);
    this.packs.splice(this.packs.indexOf(pack), 1);
    await this.store?.remove(fileName);
  }

  /** One group per archive, difficulties from easiest to hardest. */
  groups(): { pack: Pack; entries: LibEntry[] }[] {
    return this.packs.filter((p) => p.beatmaps.length).map((pack) => ({ pack, entries: this.entries.filter((e) => e.pack === pack) }));
  }
}
