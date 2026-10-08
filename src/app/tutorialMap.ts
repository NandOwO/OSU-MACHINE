import { parseBeatmap } from "../beatmap/parser.js";
import type { Beatmap } from "../beatmap/types.js";

const HEADER = `osu file format v14
[General]
Mode: 0
[Metadata]
Title:Tutorial
Artist:POIPIU
Version:Practica
[Difficulty]
HPDrainRate:3
CircleSize:3.5
OverallDifficulty:4
ApproachRate:5
SliderMultiplier:1.4
SliderTickRate:1
[TimingPoints]
0,600,4,2,1,50,1,0
[HitObjects]
`;

/** Tiny hand-made maps for the tutorial steps (timing, sliders, combo). */
export function tutorialMap(step: 1 | 2 | 3): Beatmap {
  const c = (x: number, y: number, t: number, nc = false) => `${x},${y},${t},${nc ? 5 : 1},0,0:0:0:0:`;
  const s = (x: number, y: number, t: number, tx: number, ty: number, len: number) => `${x},${y},${t},2,0,L|${tx}:${ty},1,${len},0|0,0:0|0:0,0:0:0:0:`;
  let objs: string[];
  if (step === 1) objs = [c(256, 192, 2000, true), c(256, 192, 3800, true), c(256, 192, 5600, true)];
  else if (step === 2) objs = [s(120, 192, 2000, 392, 192, 272), s(392, 100, 4800, 130, 100, 262)];
  else objs = [c(100, 100, 2000, true), c(200, 160, 2600), c(300, 220, 3200), c(400, 160, 3800), c(300, 100, 4400), c(200, 200, 5000), c(120, 280, 5600)];
  return parseBeatmap(HEADER + objs.join("\n") + "\n");
}
