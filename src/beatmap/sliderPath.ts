import type { SliderObject, Vec2 } from "./types.js";

/** A slider body resolved to a polyline with cumulative arc length. */
export interface SliderPath {
  points: Vec2[];
  /** cumulative[i] is the distance from points[0] to points[i]. */
  cumulative: number[];
  length: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function bezierPoint(ctrl: Vec2[], t: number): Vec2 {
  const tmp = ctrl.map((p) => ({ ...p }));
  for (let n = tmp.length - 1; n > 0; n--) {
    for (let i = 0; i < n; i++) {
      tmp[i] = {
        x: tmp[i]!.x + (tmp[i + 1]!.x - tmp[i]!.x) * t,
        y: tmp[i]!.y + (tmp[i + 1]!.y - tmp[i]!.y) * t,
      };
    }
  }
  return tmp[0]!;
}

function sampleBezier(ctrl: Vec2[]): Vec2[] {
  if (ctrl.length < 2) return ctrl.slice();
  let approx = 0;
  for (let i = 1; i < ctrl.length; i++) approx += dist(ctrl[i - 1]!, ctrl[i]!);
  const steps = Math.min(600, Math.max(16, Math.ceil(approx / 1.5)));
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) out.push(bezierPoint(ctrl, i / steps));
  return out;
}

/** Bezier curves are split at repeated control points ("red anchors"). */
function buildBezier(ctrl: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  let start = 0;
  for (let i = 1; i < ctrl.length; i++) {
    const same = ctrl[i]!.x === ctrl[i - 1]!.x && ctrl[i]!.y === ctrl[i - 1]!.y;
    if (same || i === ctrl.length - 1) {
      const end = same ? i : i + 1;
      const seg = ctrl.slice(start, end);
      const sampled = sampleBezier(seg);
      if (out.length > 0) sampled.shift();
      out.push(...sampled);
      start = i;
    }
  }
  return out.length ? out : ctrl.slice();
}

function buildLinear(ctrl: Vec2[]): Vec2[] {
  return ctrl.slice();
}

function buildCircle(a: Vec2, b: Vec2, c: Vec2): Vec2[] | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const aSq = a.x * a.x + a.y * a.y;
  const bSq = b.x * b.x + b.y * b.y;
  const cSq = c.x * c.x + c.y * c.y;
  const cx = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d;
  const cy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);

  const thetaStart = Math.atan2(a.y - cy, a.x - cx);
  let thetaEnd = Math.atan2(c.y - cy, c.x - cx);
  if (thetaEnd < thetaStart) thetaEnd += 2 * Math.PI;

  let dir = 1;
  let range = thetaEnd - thetaStart;
  const ortho = { x: c.y - a.y, y: -(c.x - a.x) };
  if (ortho.x * (b.x - a.x) + ortho.y * (b.y - a.y) < 0) {
    dir = -1;
    range = 2 * Math.PI - range;
  }

  const steps = Math.max(2, Math.ceil(range * r / 2));
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = thetaStart + (dir * (i / steps) * range);
    out.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
  }
  return out;
}

function catmullPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

function buildCatmull(ctrl: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(i + 2, ctrl.length - 1)]!;
    for (let s = 0; s < 50; s++) out.push(catmullPoint(p0, p1, p2, p3, s / 50));
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

/** Builds the slider body and trims or extends it to the declared pixel length. */
export function buildSliderPath(slider: SliderObject): SliderPath {
  const ctrl: Vec2[] = [{ x: slider.x, y: slider.y }, ...slider.points];
  let pts: Vec2[];
  switch (slider.curveType) {
    case "L":
      pts = buildLinear(ctrl);
      break;
    case "P": {
      const circle = ctrl.length === 3 ? buildCircle(ctrl[0]!, ctrl[1]!, ctrl[2]!) : null;
      pts = circle ?? buildBezier(ctrl);
      break;
    }
    case "C":
      pts = buildCatmull(ctrl);
      break;
    default:
      pts = buildBezier(ctrl);
  }

  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  let total = cumulative[cumulative.length - 1]!;
  const want = slider.length;

  if (want > 0 && total > want) {
    // Trim to the declared length.
    let i = cumulative.length - 1;
    while (i > 0 && cumulative[i - 1]! >= want) i--;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const segLen = cumulative[i]! - cumulative[i - 1]!;
    const f = segLen === 0 ? 0 : (want - cumulative[i - 1]!) / segLen;
    const cut = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    pts = [...pts.slice(0, i), cut];
    cumulative.length = i;
    cumulative.push(want);
    total = want;
  } else if (want > total && pts.length >= 2) {
    // Extend the last segment along its direction.
    const a = pts[pts.length - 2]!;
    const b = pts[pts.length - 1]!;
    const segLen = dist(a, b);
    if (segLen > 0) {
      const f = (want - total) / segLen;
      pts.push({ x: b.x + (b.x - a.x) * f, y: b.y + (b.y - a.y) * f });
      cumulative.push(want);
      total = want;
    }
  }
  return { points: pts, cumulative, length: total };
}

/** Position at arc distance `d` from the head, clamped to the body. */
export function positionAtDistance(path: SliderPath, d: number): Vec2 {
  const { points, cumulative } = path;
  if (d <= 0) return points[0]!;
  if (d >= path.length) return points[points.length - 1]!;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const seg = cumulative[hi]! - cumulative[lo]!;
  const f = seg === 0 ? 0 : (d - cumulative[lo]!) / seg;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
