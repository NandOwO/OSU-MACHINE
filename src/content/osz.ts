import { unzipSync } from "fflate";
import { parseBeatmap } from "../beatmap/parser.js";
import type { Beatmap } from "../beatmap/types.js";

/** Limits that keep a hostile or broken archive from exhausting memory. */
export const ZIP_LIMITS = { maxFiles: 6000, maxTotalBytes: 400 * 1024 * 1024, maxEntryBytes: 150 * 1024 * 1024 };

const ALLOWED = /\.(osu|osb|ini|png|jpg|jpeg|mp3|ogg|wav)$/i;

/** Reads a zip into memory, keeping only the file types the game can use. Throws if limits are exceeded. */
export function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  let count = 0;
  let total = 0;
  const raw = unzipSync(bytes, {
    filter: (f) => {
      count += 1;
      total += f.originalSize;
      if (count > ZIP_LIMITS.maxFiles) throw new Error("El archivo tiene demasiados ficheros");
      if (f.originalSize > ZIP_LIMITS.maxEntryBytes) throw new Error(`Fichero demasiado grande: ${f.name}`);
      if (total > ZIP_LIMITS.maxTotalBytes) throw new Error("El archivo descomprimido es demasiado grande");
      const name = f.name.replace(/\\/g, "/");
      if (name.startsWith("/") || name.split("/").includes("..")) return false;
      return ALLOWED.test(name);
    },
  });
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(raw)) files[name.replace(/\\/g, "/")] = data;
  return files;
}

export interface BeatmapEntry {
  /** Stable id: pack id + file name. */
  id: string;
  file: string;
  beatmap: Beatmap;
}

export interface Pack {
  id: string;
  name: string;
  files: Record<string, Uint8Array>;
  /** Only osu!standard difficulties, sorted by object count. */
  beatmaps: BeatmapEntry[];
  /** True when the archive contains a `skin.ini` (a skin, alone or next to maps). */
  hasSkin: boolean;
  /** Difficulties that were skipped (other modes, parse errors). */
  skipped: string[];
}

const lower = (files: Record<string, Uint8Array>) => {
  const m = new Map<string, string>();
  for (const k of Object.keys(files)) m.set(k.toLowerCase(), k);
  return m;
};

/** Case-insensitive file lookup (osu! skins and maps mix cases freely). */
export function findFile(files: Record<string, Uint8Array>, name: string): Uint8Array | undefined {
  const exact = files[name];
  if (exact) return exact;
  const key = lower(files).get(name.replace(/\\/g, "/").toLowerCase());
  return key ? files[key] : undefined;
}

/** Loads a `.osz` / `.osk` archive. Archives may hold maps, a skin, or both. */
export function loadPack(id: string, name: string, bytes: Uint8Array): Pack {
  const files = readZip(bytes);
  const beatmaps: BeatmapEntry[] = [];
  const skipped: string[] = [];
  for (const [file, data] of Object.entries(files)) {
    if (!file.toLowerCase().endsWith(".osu")) continue;
    try {
      const beatmap = parseBeatmap(new TextDecoder("utf-8").decode(data));
      beatmaps.push({ id: `${id}/${file}`, file, beatmap });
    } catch (e) {
      skipped.push(`${file}: ${(e as Error).message}`);
    }
  }
  beatmaps.sort((a, b) => a.beatmap.hitObjects.length - b.beatmap.hitObjects.length);
  const hasSkin = [...lower(files).keys()].some((k) => k === "skin.ini" || k.endsWith("/skin.ini"));
  return { id, name, files, beatmaps, hasSkin, skipped };
}
