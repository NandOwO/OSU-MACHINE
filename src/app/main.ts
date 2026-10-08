import { KioskMachine } from "../kiosk/machine.js";
import { LocalStorageStore, MemoryStore } from "../kiosk/store.js";
import { ContentStore, Library } from "./library.js";
import { KioskApp } from "./kiosk.js";

const params = new URLSearchParams(location.search);
const manual = params.has("manual"); // tests: time is driven by a script
const root = document.getElementById("ui") as HTMLDivElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;

async function boot(): Promise<void> {
  const persistent = !params.has("fresh");
  const store = persistent ? new LocalStorageStore() : new MemoryStore();
  const library = new Library(persistent ? new ContentStore() : null);
  await library.restore().catch(() => undefined);
  const machine = new KioskMachine(store);
  const app = new KioskApp({ root, canvas, machine, library, manual });
  app.start();
  // End a session that nobody is touching.
  if (!manual) setInterval(() => machine.checkInactivity(120_000), 5000);
  (window as unknown as { __poipiu: unknown }).__poipiu = { app, machine, library };
}
void boot();
