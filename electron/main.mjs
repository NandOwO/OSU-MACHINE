import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentFolder, FileStore } from "./store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(1));
const DEV = args.has("--dev");
const WINDOWED = DEV || args.has("--windowed");
const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice(6);

// A fixed name gives a predictable data folder (%APPDATA%\POIPIU on Windows).
app.setName("POIPIU");
// Tests can point the data folder somewhere else.
if (process.env.POIPIU_DATA_DIR) app.setPath("userData", process.env.POIPIU_DATA_DIR);
if (process.argv.includes("--no-sandbox")) app.commandLine.appendSwitch("no-sandbox");
// Music must start without a click: the cabinet has no keyboard.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-pinch");

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let store, content;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, backgroundColor: "#07061a", show: false, title: "POIPIU", icon: join(here, "..", "build", "icon.png"),
    fullscreen: !WINDOWED, kiosk: !WINDOWED, frame: WINDOWED, autoHideMenuBar: true,
    webPreferences: { preload: join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: DEV, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());
  const wc = win.webContents;
  wc.setVisualZoomLevelLimits(1, 1);
  wc.on("will-navigate", (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("context-menu", (e) => e.preventDefault());
  // Operators leave with Ctrl+Shift+Q; players cannot reload, zoom or close the page.
  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = (input.key || "").toLowerCase(), code = input.code || "";
    const is = (k, c) => key === k || code === c;
    if (input.control && input.shift && is("q", "KeyQ")) { app.quit(); return; }
    if (DEV) return;
    const blocked = is("f5", "F5") || is("f11", "F11") || is("f12", "F12")
      || (input.control && (is("r", "KeyR") || is("w", "KeyW") || is("=", "Equal") || is("+", "Equal") || is("-", "Minus") || is("0", "Digit0")))
      || (input.alt && is("f4", "F4"));
    if (blocked) event.preventDefault();
  });
  // If the page dies, bring it back.
  wc.on("render-process-gone", () => setTimeout(() => wc.reload(), 1000));
  win.on("unresponsive", () => setTimeout(() => wc.reload(), 5000));
  if (urlArg) win.loadURL(urlArg); else win.loadFile(join(here, "..", "dist", "index.html"));
  if (DEV) wc.openDevTools({ mode: "detach" });
}

function registerIpc() {
  const data = join(app.getPath("userData"), "data");
  store = new FileStore(data);
  content = new ContentFolder(join(app.getPath("userData"), "content"));
  ipcMain.on("store:get", (e, key) => { e.returnValue = store.get(key); });
  ipcMain.on("store:set", (e, key, json) => { try { store.set(key, json); e.returnValue = true; } catch { e.returnValue = false; } });
  ipcMain.on("store:remove", (e, key) => { store.remove(key); e.returnValue = true; });
  ipcMain.handle("content:list", () => content.list());
  ipcMain.handle("content:read", (_e, name) => { const b = content.read(name); return b ? new Uint8Array(b) : null; });
  ipcMain.handle("content:add", (_e, name, bytes) => content.add(name, bytes));
  ipcMain.handle("content:remove", (_e, name) => { content.remove(name); return true; });
  ipcMain.on("app:quit", () => app.quit());
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
app.whenReady().then(() => { registerIpc(); createWindow(); });
