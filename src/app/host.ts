import type { ContentBackend } from "./library.js";
import type { Store } from "../kiosk/store.js";

/** The bridge the Electron kiosk exposes in `preload.cjs`. Absent in a normal browser. */
export interface PoipiuHost {
  isKiosk: boolean;
  storeGet(key: string): string | null;
  storeSet(key: string, json: string): boolean;
  storeRemove(key: string): boolean;
  contentList(): Promise<{ name: string; size: number }[]>;
  contentRead(name: string): Promise<Uint8Array | null>;
  contentAdd(name: string, bytes: Uint8Array): Promise<string>;
  contentRemove(name: string): Promise<boolean>;
  osuEnabled(): Promise<boolean>;
  osuPrepare(skinFile?: string | null): Promise<{ synced: { maps: string[]; skins: string[] }; skinSet: boolean } | null>;
  osuStop(): Promise<boolean>;
  osuFindReplay(sinceMs: number): Promise<Uint8Array | null>;
  osuStatus(): Promise<{ osu: boolean; tosu: boolean; osuRestarts: number } | null>;
  quit(): void;
}

export const getHost = (): PoipiuHost | null => (window as unknown as { poipiuHost?: PoipiuHost }).poipiuHost ?? null;

/** Machine data (cards, rankings, config) kept as files by the kiosk. */
export class HostStore implements Store {
  constructor(private readonly host: PoipiuHost) {}
  get<T>(key: string): T | null {
    const v = this.host.storeGet(key);
    if (v === null) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  set<T>(key: string, value: T): void { this.host.storeSet(key, JSON.stringify(value)); }
  remove(key: string): void { this.host.storeRemove(key); }
}

/** Installed maps and skins kept in the kiosk's content folder. */
export class HostContent implements ContentBackend {
  constructor(private readonly host: PoipiuHost) {}
  async put(name: string, bytes: Uint8Array): Promise<void> { await this.host.contentAdd(name, bytes); }
  async remove(name: string): Promise<void> { await this.host.contentRemove(name); }
  async all(): Promise<{ name: string; bytes: Uint8Array }[]> {
    const out: { name: string; bytes: Uint8Array }[] = [];
    for (const f of await this.host.contentList()) { const bytes = await this.host.contentRead(f.name); if (bytes) out.push({ name: f.name, bytes }); }
    return out;
  }
}
