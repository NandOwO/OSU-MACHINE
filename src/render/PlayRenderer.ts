import { resolveSlider, type ResolvedSlider } from "../beatmap/sliderEvents.js";
import { preemptFor } from "../beatmap/stacking.js";
import type { Beatmap, Vec2 } from "../beatmap/types.js";
import type { EngineEvent, Judgement } from "../engine/GameEngine.js";
import { radiusFor } from "../engine/geometry.js";
import type { RGB, Skin, SkinImage } from "../content/skin.js";

export const LOGICAL_W = 1920;
export const LOGICAL_H = 1080;
/** Screen pixels per osu pixel, and the playfield origin on the 1920x1080 canvas. */
export const FIELD = { scale: 2.0, x: (LOGICAL_W - 512 * 2.0) / 2, y: 170 };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const outCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

interface RObject {
  index: number;
  kind: "circle" | "slider" | "spinner";
  x: number; y: number; time: number; end: number;
  num: number; color: number; newCombo: boolean;
  slider?: { resolved: ResolvedSlider; pts: [number, number][]; cum: number[]; total: number; slides: number };
}
interface Visual { judge: Judgement | null; hitTime: number; endTime: number }
interface TrailPoint { t: number; x: number; y: number }

export const toScreen = (p: Vec2): Vec2 => ({ x: p.x * FIELD.scale + FIELD.x, y: p.y * FIELD.scale + FIELD.y });
export const toOsu = (sx: number, sy: number): Vec2 => ({ x: (sx - FIELD.x) / FIELD.scale, y: (sy - FIELD.y) / FIELD.scale });

const tintCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();
function tinted(img: SkinImage, rgb: RGB): CanvasImageSource {
  let m = tintCache.get(img.source);
  if (!m) { m = new Map(); tintCache.set(img.source, m); }
  const key = rgb.join(",");
  let c = m.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.w; c.height = img.h;
    const g = c.getContext("2d")!;
    g.drawImage(img.source, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    g.fillRect(0, 0, img.w, img.h);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(img.source, 0, 0);
    m.set(key, c);
  }
  return c;
}

/** Draws the playfield of a map: objects, sliders, follow points, judgements and cursor. */
export class PlayRenderer {
  private readonly objs: RObject[] = [];
  private readonly visual = new Map<number, Visual>();
  private trail: TrailPoint[] = [];
  readonly preempt: number;
  readonly radiusPx: number;
  private u: number;

  constructor(private readonly map: Beatmap, private skin: Skin) {
    this.preempt = preemptFor(map.difficulty.ar);
    this.radiusPx = radiusFor(map.difficulty.cs) * FIELD.scale;
    this.u = this.unitFor(skin);
    let num = 0, color = -1;
    map.hitObjects.forEach((o, index) => {
      if (o.newCombo || index === 0) { num = 0; color += 1; }
      num += 1;
      const s = toScreen(o);
      const r: RObject = { index, kind: o.kind, x: s.x, y: s.y, time: o.time, end: o.kind === "spinner" ? o.endTime : o.time, num: o.kind === "spinner" ? 0 : num, color, newCombo: o.newCombo || index === 0 };
      if (o.kind === "slider") {
        const resolved = resolveSlider(map, o);
        const pts = downsample(resolved.path.points.map(toScreen), 5);
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
        r.end = resolved.endTime;
        r.slider = { resolved, pts, cum, total: cum[cum.length - 1]!, slides: o.slides };
      }
      this.objs.push(r);
    });
  }

  setSkin(skin: Skin): void { this.skin = skin; this.u = this.unitFor(skin); }
  private unitFor(skin: Skin): number { const hc = skin.images.hitcircle!; return (2 * this.radiusPx) / (hc.w / hc.scale); }

  /** Feeds judgement events so hits fade out and judgement popups appear. */
  onEvents(events: EngineEvent[]): void {
    for (const e of events) {
      const v = this.visual.get(e.index) ?? { judge: null, hitTime: -Infinity, endTime: -Infinity };
      if (e.type === "hit") { v.hitTime = e.time; if (!e.head) { v.judge = e.judgement; v.endTime = e.time; } }
      else if (e.type === "miss") { v.hitTime = e.time; if (!e.head) { v.judge = 0; v.endTime = e.time; } }
      else if (e.type === "sliderEnd") { v.judge = e.judgement; v.endTime = e.time; }
      else if (e.type === "spinner") { v.judge = e.judgement; v.hitTime = e.time; v.endTime = e.time; }
      this.visual.set(e.index, v);
    }
  }

  pushCursor(t: number, osuX: number, osuY: number): void {
    const s = toScreen({ x: osuX, y: osuY });
    this.trail.push({ t, x: s.x, y: s.y });
    while (this.trail.length > 24 || (this.trail.length && t - this.trail[0]!.t > 260)) this.trail.shift();
  }

  // ------------------------------------------------------------------ drawing helpers

  private comboRGB(idx: number): RGB { const c = this.skin.colors; return c[((idx % c.length) + c.length) % c.length]!; }
  private blit(g: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, x: number, y: number, alpha = 1, rot = 0): void {
    g.save(); g.globalAlpha *= alpha; g.translate(x, y); if (rot) g.rotate(rot); g.drawImage(src, -w / 2, -h / 2, w, h); g.restore();
  }
  private fw = (f: SkinImage, u = this.u) => (f.w / f.scale) * u;
  private fh = (f: SkinImage, u = this.u) => (f.h / f.scale) * u;
  private visible = (f: SkinImage | undefined): f is SkinImage => !!f && !f.hidden;

  private circle(g: CanvasRenderingContext2D, x: number, y: number, num: number, colorIdx: number, alpha: number, scale = 1, opts: { head?: boolean; noNumber?: boolean } = {}): void {
    const im = this.skin.images, u = this.u * scale, rgb = this.comboRGB(colorIdx);
    const useStart = opts.head && this.visible(im.sliderstartcircle);
    const base = (useStart ? im.sliderstartcircle : im.hitcircle)!;
    this.blit(g, tinted(base, rgb), this.fw(base, u), this.fh(base, u), x, y, alpha);
    const ov = useStart ? im.sliderstartcircleoverlay : im.hitcircleoverlay;
    if (this.visible(ov)) this.blit(g, ov.source, this.fw(ov, u), this.fh(ov, u), x, y, alpha);
    if (num && !opts.noNumber) {
      const ds = String(num).split("").map((d) => im["digit" + d]);
      if (ds.every(Boolean)) {
        const dsc = u * 0.8, overlap = this.skin.overlap;
        const total = ds.reduce((a, d) => a + (d!.w / d!.scale - overlap) * dsc, 0) + overlap * dsc;
        let cx = x - total / 2;
        for (const d of ds as SkinImage[]) { this.blit(g, d.source, this.fw(d, dsc), this.fh(d, dsc), cx + (d.w / d.scale * dsc) / 2, y, alpha); cx += (d.w / d.scale - overlap) * dsc; }
      }
    }
  }
  private approach(g: CanvasRenderingContext2D, x: number, y: number, k: number, colorIdx: number, alpha: number): void {
    const ap = this.skin.images.approachcircle;
    if (!ap) return;
    const u = this.u * (1 + 3 * k);
    this.blit(g, tinted(ap, this.comboRGB(colorIdx)), this.fw(ap, u), this.fh(ap, u), x, y, alpha);
  }
  private judgeImage(g: CanvasRenderingContext2D, j: Judgement, x: number, y: number, p: number): void {
    const f = this.skin.images["hit" + j];
    if (!this.visible(f)) return;
    const u = this.u * 0.9, sc = 0.8 + 0.3 * outCubic(p * 3);
    this.blit(g, f.source, this.fw(f, u) * sc, this.fh(f, u) * sc, x, y + this.radiusPx * 0.15 * p, 1 - clamp((p - 0.55) / 0.45));
  }
  private sliderPos(s: NonNullable<RObject["slider"]>, frac: number): { x: number; y: number } {
    const d = clamp(frac) * s.total;
    let lo = 0, hi = s.cum.length - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (s.cum[m]! <= d) lo = m; else hi = m; }
    const a = s.pts[lo]!, b = s.pts[hi]!, f = (d - s.cum[lo]!) / Math.max(1e-6, s.cum[hi]! - s.cum[lo]!);
    return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f) };
  }
  private endPoint(o: RObject): { x: number; y: number } {
    return o.slider ? this.sliderPos(o.slider, o.slider.slides % 2 === 1 ? 1 : 0) : { x: o.x, y: o.y };
  }

  private followPoints(g: CanvasRenderingContext2D, ms: number): void {
    const fp = this.skin.images.followpoint, R = this.radiusPx;
    for (let n = 1; n < this.objs.length; n++) {
      const cur = this.objs[n]!, prev = this.objs[n - 1]!;
      if (cur.newCombo || cur.kind === "spinner" || prev.kind === "spinner" || ms < cur.time - this.preempt || ms > cur.time + 100) continue;
      const a = this.endPoint(prev), dx = cur.x - a.x, dy = cur.y - a.y, len = Math.hypot(dx, dy);
      if (len < R * 2.4) continue;
      const ang = Math.atan2(dy, dx), count = Math.floor((len - R * 2) / 64);
      const p = clamp((ms - (cur.time - this.preempt)) / this.preempt);
      for (let k = 0; k < count; k++) {
        const f = (R + (k + 0.5) * ((len - R * 2) / count)) / len;
        const alpha = clamp((p * 1.4 - k / Math.max(1, count)) * 3) * (1 - clamp((ms - cur.time + 40) / 140)) * 0.85;
        if (alpha <= 0) continue;
        const x = a.x + dx * f, y = a.y + dy * f;
        if (this.visible(fp)) this.blit(g, fp.source, this.fw(fp), this.fh(fp), x, y, alpha, ang);
        else { g.save(); g.globalAlpha = alpha; g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.restore(); }
      }
    }
  }

  private sliderBody(g: CanvasRenderingContext2D, o: RObject, ms: number, alpha: number): void {
    const s = o.slider!, im = this.skin.images, R = this.radiusPx, rgb = this.comboRGB(o.color);
    g.save(); g.globalAlpha *= alpha; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    const b = this.skin.sliderBorder;
    g.strokeStyle = `rgb(${b[0]},${b[1]},${b[2]})`; g.lineWidth = R * 2 * 0.98; g.stroke();
    const tr = this.skin.sliderTrack ?? [rgb[0] * 0.28, rgb[1] * 0.28, rgb[2] * 0.28];
    g.strokeStyle = `rgb(${tr[0] | 0},${tr[1] | 0},${tr[2] | 0})`; g.lineWidth = R * 2 * 0.84; g.stroke();
    g.restore();
    const ep = this.endPoint(o), ec = im.sliderendcircle;
    if (this.visible(ec)) {
      this.blit(g, tinted(ec, rgb), this.fw(ec), this.fh(ec), ep.x, ep.y, alpha);
      const eo = im.sliderendcircleoverlay; if (this.visible(eo)) this.blit(g, eo.source, this.fw(eo), this.fh(eo), ep.x, ep.y, alpha);
    } else if (!ec) this.circle(g, ep.x, ep.y, 0, o.color, alpha, 1, { noNumber: true });
    const ra = im.reversearrow;
    if (s.slides > 1 && this.visible(ra) && ms < o.end - 100) {
      const from = this.sliderPos(s, s.slides % 2 === 1 ? 0.97 : 0.03);
      this.blit(g, ra.source, this.fw(ra), this.fh(ra), ep.x, ep.y, alpha * 0.9, Math.atan2(ep.y - from.y, ep.x - from.x));
    }
    const sp = im.sliderscorepoint;
    for (const e of s.resolved.events) {
      if (e.type !== "tick" || ms > e.time) continue;
      const p = toScreen(e.position);
      if (this.visible(sp)) this.blit(g, sp.source, this.fw(sp), this.fh(sp), p.x, p.y, alpha);
      else { g.save(); g.globalAlpha *= alpha; g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, R * 0.12, 0, 7); g.fill(); g.restore(); }
    }
  }
  private sliderBall(g: CanvasRenderingContext2D, o: RObject, ms: number): void {
    const s = o.slider!;
    if (ms < o.time || ms > o.end) return;
    const sd = s.resolved.spanDuration, u0 = (ms - o.time) / sd, k = Math.min(Math.floor(u0), s.slides - 1);
    let f = u0 - k; if (k % 2 === 1) f = 1 - f;
    const p = this.sliderPos(s, f), im = this.skin.images, fc = im.sliderfollowcircle, sb = im.sliderb;
    if (this.visible(fc)) this.blit(g, fc.source, this.fw(fc), this.fh(fc), p.x, p.y, 0.9);
    if (this.visible(sb)) this.blit(g, sb.source, this.fw(sb), this.fh(sb), p.x, p.y);
    else { g.save(); g.fillStyle = "rgba(255,255,255,0.92)"; g.shadowColor = "#fff"; g.shadowBlur = 14; g.beginPath(); g.arc(p.x, p.y, this.radiusPx * 0.55, 0, 7); g.fill(); g.restore(); }
  }

  /** Draws all visible objects at song time `ms` (osu! draws later objects underneath earlier ones). */
  draw(g: CanvasRenderingContext2D, ms: number, cursor: Vec2, drawCursor = true): void {
    this.followPoints(g, ms);
    let first = 0;
    while (first < this.objs.length && this.objs[first]!.end + 800 < ms) first++;
    let last = first;
    while (last < this.objs.length && this.objs[last]!.time - this.preempt <= ms) last++;
    for (let n = last - 1; n >= first; n--) {
      const o = this.objs[n]!;
      if (o.kind === "spinner") { this.spinner(g, o, ms); continue; }
      const v = this.visual.get(o.index);
      const alpha = clamp((ms - (o.time - this.preempt)) / 400);
      const headDone = v && v.hitTime <= ms;
      if (o.slider) this.sliderBody(g, o, ms, alpha * (1 - clamp((ms - o.end) / 160)));
      if (!headDone) {
        this.circle(g, o.x, o.y, o.num, o.color, alpha, 1, { head: !!o.slider });
        this.approach(g, o.x, o.y, clamp((o.time - ms) / this.preempt), o.color, alpha);
      } else {
        const p = (ms - v!.hitTime) / 260;
        if (p < 1) this.circle(g, o.x, o.y, 0, o.color, 1 - p, 1 + 0.25 * outCubic(p), { noNumber: true, head: !!o.slider });
      }
      if (o.slider) this.sliderBall(g, o, ms);
      if (v && v.judge !== null) {
        const p = (ms - v.endTime) / 650;
        if (p >= 0 && p < 1) { const e = this.endPoint(o); this.judgeImage(g, v.judge, e.x, e.y, p); }
      }
    }
    if (drawCursor) this.cursor(g, cursor);
  }

  private spinner(g: CanvasRenderingContext2D, o: RObject, ms: number): void {
    if (ms < o.time - 200 || ms > o.end + 300) return;
    const a = clamp((ms - (o.time - 200)) / 200) * (1 - clamp((ms - o.end) / 300));
    const cx = FIELD.x + 256 * FIELD.scale, cy = FIELD.y + 192 * FIELD.scale, r = 150 + 60 * (1 - clamp((ms - o.time) / (o.end - o.time)));
    g.save(); g.globalAlpha = a; g.strokeStyle = "#ff2e88"; g.lineWidth = 8; g.shadowColor = "#ff2e88"; g.shadowBlur = 20;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#00e5ff"; g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.stroke(); g.restore();
    const v = this.visual.get(o.index);
    if (v && v.judge !== null && ms - v.endTime < 650) this.judgeImage(g, v.judge, cx, cy + 200, (ms - v.endTime) / 650);
  }

  private cursor(g: CanvasRenderingContext2D, cursor: Vec2): void {
    const im = this.skin.images, tr = im.cursortrail, cur = im.cursor;
    const now = this.trail.length ? this.trail[this.trail.length - 1]!.t : 0;
    for (const p of this.trail) {
      const a = clamp(1 - (now - p.t) / 260);
      if (this.visible(tr)) this.blit(g, tr.source, this.fw(tr, 0.5) * (0.5 + a * 0.5), this.fh(tr, 0.5) * (0.5 + a * 0.5), p.x, p.y, a * 0.55);
      else { g.save(); g.globalAlpha = a * 0.4; g.fillStyle = "#e6fdff"; g.beginPath(); g.arc(p.x, p.y, 9 * a + 2, 0, Math.PI * 2); g.fill(); g.restore(); }
    }
    const s = toScreen(cursor);
    if (cur) { const k = 96 / (cur.w / cur.scale); this.blit(g, cur.source, this.fw(cur, k), this.fh(cur, k), s.x, s.y); }
  }
}

function downsample(pts: Vec2[], step: number): [number, number][] {
  const out: [number, number][] = [[pts[0]!.x, pts[0]!.y]];
  let last = pts[0]!;
  for (const p of pts) if (Math.hypot(p.x - last.x, p.y - last.y) >= step) { out.push([p.x, p.y]); last = p; }
  const e = pts[pts.length - 1]!;
  if (out[out.length - 1]![0] !== e.x || out[out.length - 1]![1] !== e.y) out.push([e.x, e.y]);
  return out;
}
