export interface Vec2 {
  x: number;
  y: number;
}

export interface TimingPoint {
  time: number;
  /** Uninherited: ms per beat. Inherited: negative, -100 / sliderVelocityMultiplier. */
  beatLength: number;
  uninherited: boolean;
}

export interface Difficulty {
  hp: number;
  cs: number;
  od: number;
  ar: number;
  sliderMultiplier: number;
  sliderTickRate: number;
}

export interface Metadata {
  title: string;
  artist: string;
  creator: string;
  version: string;
  beatmapId: number;
  beatmapSetId: number;
}

export interface BreakPeriod {
  start: number;
  end: number;
}

export type CurveType = "B" | "L" | "P" | "C";

export interface CircleObject {
  kind: "circle";
  x: number;
  y: number;
  time: number;
  newCombo: boolean;
}

export interface SliderObject {
  kind: "slider";
  x: number;
  y: number;
  time: number;
  newCombo: boolean;
  curveType: CurveType;
  /** Control points after the head position (head position is x,y). */
  points: Vec2[];
  slides: number;
  length: number;
}

export interface SpinnerObject {
  kind: "spinner";
  x: number;
  y: number;
  time: number;
  endTime: number;
  newCombo: boolean;
}

export type HitObject = CircleObject | SliderObject | SpinnerObject;

export interface Beatmap {
  formatVersion: number;
  mode: number;
  audioFilename: string;
  /** Background image file name from [Events], if any. */
  backgroundFile?: string;
  previewTime: number;
  stackLeniency: number;
  metadata: Metadata;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  breaks: BreakPeriod[];
  hitObjects: HitObject[];
}
