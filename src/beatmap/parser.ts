import type {
  Beatmap,
  BreakPeriod,
  CurveType,
  Difficulty,
  HitObject,
  Metadata,
  TimingPoint,
  Vec2,
} from "./types.js";

type Section = Record<string, string>;

function splitKeyValue(line: string): [string, string] | null {
  const i = line.indexOf(":");
  if (i < 0) return null;
  return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parses the text of a `.osu` file. Throws on files that are not osu!standard. */
export function parseBeatmap(text: string): Beatmap {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const kv: Record<string, Section> = {};
  const raw: Record<string, string[]> = {};
  let section = "";
  let formatVersion = 14;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    const header = /^osu file format v(\d+)/.exec(line);
    if (header) {
      formatVersion = Number(header[1]);
      continue;
    }
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!;
      kv[section] = kv[section] ?? {};
      raw[section] = raw[section] ?? [];
      continue;
    }
    if (!section) continue;
    raw[section]!.push(line);
    const pair = splitKeyValue(line);
    if (pair) kv[section]![pair[0]] = pair[1];
  }

  const general = kv.General ?? {};
  const mode = num(general.Mode, 0);
  if (mode !== 0) throw new Error(`Unsupported mode ${mode}: only osu!standard (0) is supported`);

  const m = kv.Metadata ?? {};
  const metadata: Metadata = {
    title: m.Title ?? "",
    artist: m.Artist ?? "",
    creator: m.Creator ?? "",
    version: m.Version ?? "",
    beatmapId: num(m.BeatmapID, 0),
    beatmapSetId: num(m.BeatmapSetID, 0),
  };

  const d = kv.Difficulty ?? {};
  const od = num(d.OverallDifficulty, 5);
  const cs = num(d.CircleSize, 5);
  const hp = num(d.HPDrainRate, 5);
  const difficulty: Difficulty = {
    hp,
    cs,
    od,
    // Old maps without AR use OD as AR.
    ar: num(d.ApproachRate, od),
    sliderMultiplier: num(d.SliderMultiplier, 1.4),
    sliderTickRate: num(d.SliderTickRate, 1),
  };

  const timingPoints: TimingPoint[] = (raw.TimingPoints ?? []).map((l) => {
    const p = l.split(",");
    const beatLength = num(p[1], 500);
    const uninherited = p.length > 6 ? p[6] === "1" : beatLength > 0;
    return { time: num(p[0], 0), beatLength, uninherited };
  });
  // Stable sort keeps file order for points that share a time.
  timingPoints.sort((a, b) => a.time - b.time);

  const breaks: BreakPeriod[] = [];
  let backgroundFile: string | undefined;
  for (const l of raw.Events ?? []) {
    const p = l.split(",");
    if ((p[0] === "0" || p[0] === "Background") && p[2]) backgroundFile ??= p[2].replace(/^"|"$/g, "");
    if (p[0] === "2" || p[0] === "Break") breaks.push({ start: num(p[1], 0), end: num(p[2], 0) });
  }

  const hitObjects: HitObject[] = (raw.HitObjects ?? []).map(parseHitObject);

  return {
    formatVersion,
    mode,
    audioFilename: general.AudioFilename ?? "",
    backgroundFile,
    previewTime: num(general.PreviewTime, -1),
    stackLeniency: num(general.StackLeniency, 0.7),
    metadata,
    difficulty,
    timingPoints,
    breaks,
    hitObjects,
  };
}

function parseHitObject(line: string): HitObject {
  const p = line.split(",");
  const x = num(p[0], 0);
  const y = num(p[1], 0);
  const time = num(p[2], 0);
  const type = num(p[3], 0);
  const newCombo = (type & 4) !== 0;

  if (type & 1) return { kind: "circle", x, y, time, newCombo };

  if (type & 2) {
    const curve = (p[5] ?? "").split("|");
    const curveType = (curve[0] || "B") as CurveType;
    const points: Vec2[] = [];
    for (const c of curve.slice(1)) {
      const [px, py] = c.split(":");
      points.push({ x: num(px, 0), y: num(py, 0) });
    }
    return {
      kind: "slider",
      x,
      y,
      time,
      newCombo,
      curveType,
      points,
      slides: Math.max(1, num(p[6], 1)),
      length: num(p[7], 0),
    };
  }

  if (type & 8) return { kind: "spinner", x, y, time, newCombo, endTime: num(p[5], time) };

  throw new Error(`Unknown hit object type ${type}: ${line}`);
}
