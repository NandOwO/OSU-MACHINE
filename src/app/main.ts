import { KioskMachine } from "../kiosk/machine.js";
import { LocalStorageStore, MemoryStore } from "../kiosk/store.js";
import { ContentStore, Library } from "./library.js";
import { KioskApp } from "./kiosk.js";
import { getHost, HostContent, HostStore } from "./host.js";

const params = new URLSearchParams(location.search);
const manual = params.has("manual"); // tests: time is driven by a script
const root = document.getElementById("ui") as HTMLDivElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;

/** Web build: maps and skins published next to the page (content/manifest.json) are installed at start. */
async function preloadFactory(library: Library): Promise<void> {
  if (params.has("nofactory") || getHost()) return;
  const inline = document.getElementById("factory-content");
  if (inline?.textContent) {
    // Single-file build: the archives travel inside the page as base64.
    const packs = JSON.parse(inline.textContent) as Record<string, string>;
    for (const [n, b64] of Object.entries(packs)) {
      if (library.packs.some((p) => p.name === n)) continue;
      try { await library.add(n, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), false); } catch { /* skip a broken archive */ }
    }
    return;
  }
  try {
    const res = await fetch("content/manifest.json", { cache: "no-cache" });
    if (!res.ok) return;
    const names = (await res.json()) as string[];
    for (const n of names.filter((n) => !library.packs.some((p) => p.name === n))) {
      try {
        const r = await fetch("content/" + encodeURIComponent(n));
        if (r.ok) await library.add(n, new Uint8Array(await r.arrayBuffer()), false);
      } catch { /* one missing file must not stop the machine */ }
    }
  } catch { /* no factory content published: the player imports their own */ }
}

async function boot(): Promise<void> {
  const persistent = !params.has("fresh");
  const host = getHost();
  const store = !persistent ? new MemoryStore() : host ? new HostStore(host) : new LocalStorageStore();
  const library = new Library(!persistent ? null : host ? new HostContent(host) : new ContentStore());
  await library.restore().catch(() => undefined);
  await preloadFactory(library);
  const machine = new KioskMachine(store);
  const app = new KioskApp({ root, canvas, machine, library, manual });
  // Option B: osu! plays the maps. ?source=tosu (real osu! + tosu) or ?source=mock (simulation).
  const source = params.get("source");
  if (source === "tosu" || source === "mock") (await import("./osuMode.js")).installOsuMode(app, source);
  app.start();
  // End a session that nobody is touching.
  if (!manual) setInterval(() => machine.checkInactivity(machine.cfg.session.inactivitySeconds * 1000), 5000);
  (window as unknown as { __poipiu: unknown }).__poipiu = { app, machine, library };
}
void boot();
