import { describe, expect, it } from "vitest";
import { parseBeatmap } from "../src/beatmap/parser.js";
import { resolveSlider } from "../src/beatmap/sliderEvents.js";

const MAP = `osu file format v14

[General]
AudioFilename: audio.mp3
PreviewTime: 54183
Mode: 0

[Metadata]
Title:Test
Artist:Someone
Creator:Me
Version:Easy
BeatmapID:1
BeatmapSetID:2

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.8
SliderTickRate:1

[Events]
2,10000,20000

[TimingPoints]
0,500,4,2,1,50,1,0
0,-100,4,2,1,50,0,0

[HitObjects]
100,100,1000,5,0,0:0:0:0:
50,50,2000,2,0,L|250:50,1,200,0|0,0:0|0:0,0:0:0:0:
256,192,3000,12,0,4000,0:0:0:0:
`;

describe("parseBeatmap", () => {
  const map = parseBeatmap(MAP);
  it("reads metadata, difficulty and breaks", () => {
    expect(map.metadata.title).toBe("Test");
    expect(map.difficulty.cs).toBe(4);
    expect(map.difficulty.sliderMultiplier).toBe(1.8);
    expect(map.previewTime).toBe(54183);
    expect(map.breaks).toEqual([{ start: 10000, end: 20000 }]);
  });
  it("reads circle, slider and spinner", () => {
    expect(map.hitObjects.map((o) => o.kind)).toEqual(["circle", "slider", "spinner"]);
    expect(map.hitObjects[0]!.newCombo).toBe(true);
  });
  it("rejects non-standard modes", () => {
    expect(() => parseBeatmap(MAP.replace("Mode: 0", "Mode: 3"))).toThrow(/Unsupported mode/);
  });
});

describe("resolveSlider", () => {
  const map = parseBeatmap(MAP);
  const s = resolveSlider(map, map.hitObjects[1] as never);
  it("computes duration from length and velocity", () => {
    // 200 px at 100*1.8 px per beat of 500 ms -> 555.56 ms
    expect(s.endTime - s.startTime).toBeCloseTo(555.56, 1);
  });
  it("places one tick (tick distance 180 px) between head and tail", () => {
    expect(s.events.map((e) => e.type)).toEqual(["head", "tick", "tail"]);
  });
});
