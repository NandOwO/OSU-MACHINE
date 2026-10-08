import { controlAtMap } from "./timing.js";
import { buildSliderPath, positionAtDistance, type SliderPath } from "./sliderPath.js";
import type { Beatmap, SliderObject, Vec2 } from "./types.js";

export type SliderEventType = "head" | "tick" | "repeat" | "tail";

export interface SliderEvent {
  type: SliderEventType;
  /** Time at which the element is checked. */
  time: number;
  /** Position of the slider ball at that element. */
  position: Vec2;
}

export interface ResolvedSlider {
  object: SliderObject;
  path: SliderPath;
  startTime: number;
  endTime: number;
  spanDuration: number;
  /** ms from the declared end at which stable/lazer evaluate the final tracking check. */
  events: SliderEvent[];
}

/** Stable checks the slider end this many ms before the visual end. */
export const LEGACY_LAST_TICK_OFFSET = 36;

/** Minimum distance (as time, in ms) between the last tick and the end. */
const MIN_TICK_TIME_FROM_END = 10;

export function resolveSlider(map: Beatmap, slider: SliderObject): ResolvedSlider {
  const path = buildSliderPath(slider);
  const { beatLength, svMultiplier } = controlAtMap(map, slider.time);
  const scoringDistance = 100 * map.difficulty.sliderMultiplier * svMultiplier;
  const velocity = scoringDistance / beatLength;
  const tickDistance = scoringDistance / map.difficulty.sliderTickRate;
  const length = slider.length;
  const spanDuration = length / velocity;
  const endTime = slider.time + spanDuration * slider.slides;
  const minDistanceFromEnd = velocity * MIN_TICK_TIME_FROM_END;

  const events: SliderEvent[] = [
    { type: "head", time: slider.time, position: positionAtDistance(path, 0) },
  ];

  for (let span = 0; span < slider.slides; span++) {
    const spanStart = slider.time + span * spanDuration;
    const reversed = span % 2 === 1;
    const spanTicks: SliderEvent[] = [];
    for (let d = tickDistance; d <= length; d += tickDistance) {
      if (d >= length - minDistanceFromEnd) break;
      const progress = d / length;
      const timeProgress = reversed ? 1 - progress : progress;
      spanTicks.push({
        type: "tick",
        time: spanStart + timeProgress * spanDuration,
        position: positionAtDistance(path, d),
      });
    }
    if (reversed) spanTicks.reverse();
    events.push(...spanTicks);

    if (span < slider.slides - 1) {
      const atHead = reversed;
      events.push({
        type: "repeat",
        time: spanStart + spanDuration,
        position: positionAtDistance(path, atHead ? 0 : length),
      });
    }
  }

  const finalOnTail = slider.slides % 2 === 1;
  const tailTime = Math.max(slider.time + (endTime - slider.time) / 2, endTime - LEGACY_LAST_TICK_OFFSET);
  events.push({
    type: "tail",
    time: tailTime,
    position: positionAtDistance(path, finalOnTail ? length : 0),
  });

  return { object: slider, path, startTime: slider.time, endTime, spanDuration, events };
}

/** Ball position at `time`, following the slider back and forth across its repeats. */
export function ballPositionAt(s: ResolvedSlider, time: number): Vec2 {
  const t = Math.min(Math.max(time - s.startTime, 0), s.endTime - s.startTime);
  const span = Math.min(Math.floor(t / s.spanDuration), s.object.slides - 1);
  let p = (t - span * s.spanDuration) / s.spanDuration;
  if (span % 2 === 1) p = 1 - p;
  return positionAtDistance(s.path, p * s.path.length);
}

/** Total combo contributed by a slider (head + ticks + repeats + tail). */
export function sliderComboCount(s: ResolvedSlider): number {
  return s.events.length;
}
