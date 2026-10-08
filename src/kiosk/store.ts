/** Minimal persistent key-value storage. The web build uses localStorage; the kiosk build can plug in SQLite. */
export interface Store {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export class MemoryStore implements Store {
  private data = new Map<string, string>();
  get<T>(key: string): T | null {
    const v = this.data.get(key);
    if (v === undefined) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  set<T>(key: string, value: T): void { this.data.set(key, JSON.stringify(value)); }
  remove(key: string): void { this.data.delete(key); }
}

export class LocalStorageStore implements Store {
  constructor(private readonly prefix = "poipiu:", private readonly storage: Storage = localStorage) {}
  get<T>(key: string): T | null {
    try {
      const v = this.storage.getItem(this.prefix + key);
      return v === null ? null : (JSON.parse(v) as T);
    } catch { return null; }
  }
  set<T>(key: string, value: T): void {
    try { this.storage.setItem(this.prefix + key, JSON.stringify(value)); } catch { /* storage full or blocked: keep running */ }
  }
  remove(key: string): void { try { this.storage.removeItem(this.prefix + key); } catch { /* ignore */ } }
}
