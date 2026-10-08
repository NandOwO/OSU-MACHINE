import { AudioEngine, ManualClock, type SongClock } from "../audio/AudioEngine.js";
import { findFile, loadPack, type BeatmapEntry, type Pack } from "../content/osz.js";
import { createDefaultSkin, loadSkinFromPack, type Skin } from "../content/skin.js";
import { LOGICAL_H, LOGICAL_W } from "../render/PlayRenderer.js";
import { PlayScene, type PlayResult } from "./PlayScene.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLDivElement;
const g = canvas.getContext("2d")!;
const params = new URLSearchParams(location.search);
const MANUAL = params.has("manual"); // tests: the page does not run on its own, a script sets the time

const packs: Pack[] = [];
const skins: Skin[] = [createDefaultSkin()];
let skinIdx = 0;
let selected: BeatmapEntry | null = null;
let selectedPack: Pack | null = null;
let audio: AudioEngine | null = null;
let scene: PlayScene | null = null;
let stopSong: (() => void) | null = null;
let raf = 0;
const manualClock = new ManualClock(0);
const debug = { manualClock, scene: () => scene, packs, skins, play: (opts?: { auto?: boolean }) => startPlay(opts?.auto ?? false), draw: (t: number) => { manualClock.time = t; scene?.frame(g, drawBackground); } };
(window as unknown as { __poipiu: typeof debug }).__poipiu = debug;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// ---------------------------------------------------------------- library screen

async function addFiles(files: FileList | File[]): Promise<void> {
  for (const f of Array.from(files)) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pack = loadPack(`${packs.length}:${f.name}`, f.name.replace(/\.(osz|osk)$/i, ""), bytes);
      packs.push(pack);
      const skin = await loadSkinFromPack(pack);
      if (skin) skins.push(skin);
      if (!selected && pack.beatmaps[0]) { selected = pack.beatmaps[pack.beatmaps.length - 1]!; selectedPack = pack; }
    } catch (e) {
      status(`No se pudo leer ${f.name}: ${(e as Error).message}`, true);
    }
  }
  renderLibrary();
}
let statusEl: HTMLElement | null = null;
function status(msg: string, bad = false): void { if (statusEl) { statusEl.textContent = msg; statusEl.className = bad ? "err" : "dim"; } }

function renderLibrary(): void {
  ui.replaceChildren();
  const panel = el("div", "panel");
  panel.append(el("h1", "", "POIPIU"));
  const drop = el("div", "drop", "Suelta aquí tus archivos .osz (mapas) y .osk (skins), o elige archivos");
  const input = el("input"); input.type = "file"; input.multiple = true; input.accept = ".osz,.osk,.zip"; input.id = "files";
  input.addEventListener("change", () => input.files && addFiles(input.files));
  drop.append(el("br"), input);
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => { if ((e as DragEvent).dataTransfer?.files) addFiles((e as DragEvent).dataTransfer!.files); });
  panel.append(drop);
  statusEl = el("div", "dim", packs.length ? `${packs.length} paquete(s) cargado(s)` : "Aún no hay mapas.");
  panel.append(statusEl);

  panel.append(el("h2", "", "SKIN"));
  const sel = el("select"); sel.id = "skin";
  skins.forEach((s, i) => { const o = el("option", "", s.name); o.value = String(i); if (i === skinIdx) o.selected = true; sel.append(o); });
  sel.addEventListener("change", () => { skinIdx = Number(sel.value); });
  panel.append(sel);

  panel.append(el("h2", "", "MAPAS"));
  const list = el("div", "list");
  for (const p of packs) for (const b of p.beatmaps) {
    const m = b.beatmap, row = el("div", "map" + (selected?.id === b.id ? " sel" : ""));
    const info = el("div"); info.append(el("b", "", `${m.metadata.artist} - ${m.metadata.title}`), el("small", "", `[${m.metadata.version}]  ${m.hitObjects.length} objetos  AR ${m.difficulty.ar}  CS ${m.difficulty.cs}  OD ${m.difficulty.od}`));
    const pick = el("button", "", "ELEGIR"); pick.addEventListener("click", () => { selected = b; selectedPack = p; renderLibrary(); });
    row.append(info, pick); list.append(row);
  }
  panel.append(list);
  const actions = el("div", "row");
  const play = el("button", "primary", "JUGAR"); play.id = "play"; play.disabled = !selected;
  play.addEventListener("click", () => startPlay(false));
  const demo = el("button", "", "DEMO (AUTOPLAY)"); demo.id = "demo"; demo.disabled = !selected;
  demo.addEventListener("click", () => startPlay(true));
  actions.append(play, demo);
  panel.append(actions);
  ui.append(panel);
}

// ---------------------------------------------------------------- play

function drawBackground(c: CanvasRenderingContext2D): void {
  c.fillStyle = "#07061a"; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  if (bgImage) {
    const r = Math.max(LOGICAL_W / bgImage.width, LOGICAL_H / bgImage.height);
    c.globalAlpha = 0.35;
    c.drawImage(bgImage, (LOGICAL_W - bgImage.width * r) / 2, (LOGICAL_H - bgImage.height * r) / 2, bgImage.width * r, bgImage.height * r);
    c.globalAlpha = 1;
  }
  c.strokeStyle = "rgba(0,229,255,0.18)"; c.lineWidth = 3; c.strokeRect(448 - 6, 170 - 6, 1036, 780);
}
let bgImage: ImageBitmap | null = null;

async function startPlay(auto: boolean): Promise<void> {
  if (!selected || !selectedPack) return;
  stopPlay();
  ui.replaceChildren();
  const pack = selectedPack, map = selected.beatmap;
  bgImage = null;
  if (map.backgroundFile) { const b = findFile(pack.files, map.backgroundFile); if (b) bgImage = await createImageBitmap(new Blob([b as BlobPart])).catch(() => null); }
  const lead = Math.max(1500, 2500 - (map.hitObjects[0]?.time ?? 0));
  let clock: SongClock;
  if (MANUAL) {
    clock = manualClock; manualClock.time = -lead;
  } else {
    audio ??= new AudioEngine();
    await audio.resume();
    const sound = ["normal-hitnormal.wav", "soft-hitnormal.wav"].map((n) => findFile(pack.files, n)).find(Boolean)
      ?? Object.entries(pack.files).find(([k]) => /hitnormal/i.test(k))?.[1];
    await audio.setHitSound(sound);
    const song = findFile(pack.files, map.audioFilename);
    if (song) {
      const playing = audio.playSong(await audio.decode(song), lead);
      clock = playing; stopSong = () => playing.stop();
    } else {
      const t0 = performance.now(); clock = { now: () => performance.now() - t0 - lead, fromPerf: (p) => p - t0 - lead };
    }
  }
  scene = new PlayScene(canvas, map, skins[skinIdx]!, clock, MANUAL ? null : audio, {
    auto, onFinish: (r) => showResult(r),
  });
  if (!MANUAL) loop();
}

function loop(): void {
  raf = requestAnimationFrame(loop);
  scene?.frame(g, drawBackground);
}

function stopPlay(): void {
  cancelAnimationFrame(raf);
  stopSong?.(); stopSong = null;
  scene?.dispose(); scene = null;
}

function showResult(r: PlayResult): void {
  const panel = el("div", "panel");
  panel.append(el("h1", "", "COMPLETADO"));
  panel.append(el("div", "", `Puntaje ${Math.round(r.score).toLocaleString("es")}   Combo ${r.maxCombo}x   Precisión ${(r.accuracy * 100).toFixed(2)} %`));
  panel.append(el("div", "dim", `300: ${r.n300}   100: ${r.n100}   50: ${r.n50}   Fallos: ${r.miss}`));
  const back = el("button", "primary", "VOLVER"); back.id = "back"; back.addEventListener("click", () => { stopPlay(); renderLibrary(); });
  panel.append(back);
  ui.replaceChildren(panel);
}

window.addEventListener("keydown", (e) => { if (e.key === "Escape" && scene) { stopPlay(); renderLibrary(); } });
g.fillStyle = "#07061a"; g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
renderLibrary();
