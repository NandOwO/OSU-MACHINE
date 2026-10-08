/** Circle radius in osu pixels for a given CS. */
export function radiusFor(cs: number): number {
  return 54.4 - 4.48 * cs;
}

/** Hit windows (ms) for a given OD: 300 / 100 / 50. */
export function hitWindows(od: number): { w300: number; w100: number; w50: number } {
  return { w300: 80 - 6 * od, w100: 140 - 8 * od, w50: 200 - 10 * od };
}

/** Rotations per second a spinner must reach, by OD (lazer's difficulty range 1.5 / 2.5 / 3.75). */
export function spinnerRotationsPerSecond(od: number): number {
  return od > 5 ? 2.5 + ((3.75 - 2.5) * (od - 5)) / 5 : od < 5 ? 2.5 - ((2.5 - 1.5) * (5 - od)) / 5 : 2.5;
}
