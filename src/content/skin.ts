import { findFile, type Pack } from "./osz.js";

export interface SkinImage {
  source: CanvasImageSource;
  /** Pixel size of the stored image. */
  w: number;
  h: number;
  /** 2 for `@2x` images, 1 otherwise. Sizes in skin units are w / scale. */
  scale: number;
  /** True for the 1x1 placeholder images skins use to hide an element. */
  hidden: boolean;
}

export type RGB = [number, number, number];

export interface Skin {
  /** Archive the skin came from (.osk or .osz), when it was installed from one. */
  file?: string;
  id: string;
  name: string;
  author: string;
  colors: RGB[];
  /** HitCircleOverlap: pixels the digits of a combo number overlap. */
  overlap: number;
  sliderBorder: RGB;
  sliderTrack: RGB | null;
  images: Record<string, SkinImage | undefined>;
}

const DEFAULT_COLORS: RGB[] = [[255, 46, 136], [0, 229, 255], [255, 210, 63], [124, 255, 79]];

interface Ini { general: Record<string, string>; colours: Record<string, string>; fonts: Record<string, string> }

export function parseSkinIni(text: string): Ini {
  const ini: Ini = { general: {}, colours: {}, fonts: {} };
  let section = "general"; // some skins start with key/value lines before any [Section]
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.split("//")[0]!.trim();
    if (!line) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { section = m[1]!.toLowerCase(); continue; }
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    const target = section === "general" ? ini.general : section === "colours" ? ini.colours : section === "fonts" ? ini.fonts : null;
    if (target && !(k in target)) target[k] = v;
  }
  return ini;
}

const rgb = (v: string | undefined): RGB | null => {
  if (!v) return null;
  const p = v.split(",").map((x) => Number(x.trim()));
  return p.length >= 3 && p.slice(0, 3).every(Number.isFinite) ? [p[0]!, p[1]!, p[2]!] : null;
};

async function decode(bytes: Uint8Array, name: string): Promise<SkinImage | undefined> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    return { source: bmp, w: bmp.width, h: bmp.height, scale: /@2x\./i.test(name) ? 2 : 1, hidden: bmp.width <= 2 && bmp.height <= 2 };
  } catch {
    return undefined;
  }
}

/** Loads a skin from the files of an `.osk`/`.osz`. Returns null when there is no `skin.ini`. */
export async function loadSkin(id: string, files: Record<string, Uint8Array>): Promise<Skin | null> {
  const iniBytes = findFile(files, "skin.ini");
  if (!iniBytes) return null;
  const ini = parseSkinIni(new TextDecoder().decode(iniBytes));
  const prefix = (ini.fonts.HitCirclePrefix ?? "default").replace(/\\/g, "/");
  const images: Record<string, SkinImage | undefined> = {};

  const grab = async (key: string, candidates: string[]) => {
    for (const c of candidates) {
      const bytes = findFile(files, c);
      if (!bytes) continue;
      const img = await decode(bytes, c);
      if (img) { images[key] = img; return true; }
    }
    return false;
  };
  const two = (base: string) => [`${base}@2x.png`, `${base}.png`];
  for (const base of ["hitcircle", "hitcircleoverlay", "approachcircle", "sliderfollowcircle", "cursor", "cursortrail", "sliderendcircle",
    "sliderendcircleoverlay", "sliderstartcircle", "sliderstartcircleoverlay", "sliderscorepoint", "reversearrow"]) {
    await grab(base, two(base));
  }
  await grab("sliderb", ["sliderb0@2x.png", "sliderb0.png", "sliderb@2x.png", "sliderb.png"]);
  for (const j of ["300", "100", "50", "0"]) await grab("hit" + j, [`hit${j}-0@2x.png`, `hit${j}-0.png`, `hit${j}@2x.png`, `hit${j}.png`]);
  for (let d = 0; d < 10; d++) await grab("digit" + d, two(`${prefix}-${d}`));
  // follow points: first animation frame that is visible
  if (!(await grab("followpoint", two("followpoint"))) || images.followpoint?.hidden) {
    delete images.followpoint;
    for (let n = 0; n < 80; n++) {
      if (await grab("followpoint", two(`followpoint-${n}`)) && !images.followpoint!.hidden) break;
      delete images.followpoint;
    }
  }
  if (!images.hitcircle) return null;

  const colors: RGB[] = [];
  for (let i = 1; i <= 8; i++) { const c = rgb(ini.colours["Combo" + i]); if (c) colors.push(c); }
  return {
    id,
    name: ini.general.Name ?? id,
    author: ini.general.Author ?? "",
    colors: colors.length ? colors : DEFAULT_COLORS,
    overlap: Math.round(Number(ini.fonts.HitCircleOverlap ?? 0)) || 0,
    sliderBorder: rgb(ini.colours.SliderBorder) ?? [255, 255, 255],
    sliderTrack: rgb(ini.colours.SliderTrackOverride),
    images,
  };
}

export async function loadSkinFromPack(pack: Pack): Promise<Skin | null> {
  return pack.hasSkin ? loadSkin(pack.id, pack.files) : null;
}

/**
 * A procedural neon skin, so the game works with no files installed.
 * Images are drawn once on canvases; digits use the arcade font.
 */
export function createDefaultSkin(): Skin {
  const make = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): SkinImage => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d")!);
    return { source: c, w, h, scale: 1, hidden: false };
  };
  const S = 128;
  const images: Record<string, SkinImage | undefined> = {};
  images.hitcircle = make(S, S, (g) => {
    g.fillStyle = "#fff"; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over"; g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); g.fill();
  });
  images.hitcircleoverlay = make(S, S, (g) => { g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); g.stroke(); });
  images.approachcircle = make(S, S, (g) => { g.strokeStyle = "#fff"; g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.stroke(); });
  images.cursor = make(S, S, (g) => { const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); r.addColorStop(0, "#fff"); r.addColorStop(0.35, "#bff6ff"); r.addColorStop(1, "rgba(0,229,255,0)"); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  images.sliderfollowcircle = make(256, 256, (g) => { g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke(); });
  images.sliderscorepoint = make(24, 24, (g) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(12, 12, 6, 0, Math.PI * 2); g.fill(); });
  images.reversearrow = make(S, S, (g) => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(88, 64); g.lineTo(48, 36); g.lineTo(48, 92); g.fill(); });
  for (let d = 0; d < 10; d++) {
    images["digit" + d] = make(48, 64, (g) => { g.fillStyle = "#fff"; g.font = "bold 52px 'Press Start 2P', monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(d), 24, 34); });
  }
  const judge = (txt: string, color: string) => make(160, 80, (g) => { g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 12; g.font = "bold 44px 'Press Start 2P', monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 80, 42); });
  images.hit300 = { ...judge("300", "#7cff4f"), hidden: true };
  images.hit100 = judge("100", "#4fc3f7");
  images.hit50 = judge("50", "#ffb74d");
  images.hit0 = judge("X", "#ff3b3b");
  return {
    id: "default", name: "POIPIU Neon", author: "POIPIU", colors: DEFAULT_COLORS, overlap: 0,
    sliderBorder: [255, 255, 255], sliderTrack: [10, 8, 30], images,
  };
}
