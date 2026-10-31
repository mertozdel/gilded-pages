/**
 * Draws a latte in code — no image assets. The cup is seen from above on its saucer, drawn on
 * an offscreen canvas at 4× (2× while the pattern grows live) and stepped down to the output
 * canvas, so every curve is smooth. What it looks like comes from a LatteVisual (visuals.ts).
 */
import type { PatternDef, Prim, Pt, Tone } from './patterns';
import type { LatteVisual } from './visuals';

export interface CupScene {
  /** The pattern being poured (null: none yet). */
  pattern: PatternDef | null;
  visual: LatteVisual;
  /** While pouring: how far the pattern has grown (1 = its outline guide). Omitted: the finished cup. */
  growth?: number;
  /** The faint outline the pour aims for. */
  guide?: boolean;
  /** 0..1 how much crema is in the cup (the shot running); 0 is an empty cup. */
  crema: number;
  seed: number;
  /** The real pour: each shape as it came out, in pour order; shapes past the list aren't poured. */
  poured?: Poured[];
}

/**
 * One shape of a real pour. `scale`: its size (1 = its outline; 0 = never poured), about its
 * own middle; `shift`: nudged sideways (a tap off the beat); `length`: how far along a line
 * was drawn (past 1 it overshoots).
 */
export interface Poured {
  scale: number;
  shift: number;
  length: number;
}

/** Output size in CSS px. */
export const CUP_SIZE = 320;
const works = new Map<number, HTMLCanvasElement>();

function work(size: number): HTMLCanvasElement {
  let cv = works.get(size);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = size;
    works.set(size, cv);
  }
  return cv;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth curve through points (Catmull-Rom as Béziers). */
function smooth(c: CanvasRenderingContext2D, pts: Pt[], closed: boolean): void {
  const n = pts.length;
  if (n < 2) return;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  c.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) c.closePath();
}

const cremaColor = (v: LatteVisual, dl = 0, a = 1) => `hsla(${v.cremaHue}, 58%, ${Math.max(6, v.cremaLight + dl)}%, ${a})`;

function toneFill(c: CanvasRenderingContext2D, tone: Tone | undefined, v: LatteVisual): string | CanvasGradient {
  if (tone === 'matcha') return '#86B85A';
  if (tone === 'crema') return cremaColor(v, -4);
  const g = c.createRadialGradient(-0.2, -0.25, 0.05, 0, 0, 1.1);
  const stiff = v.stiff;
  g.addColorStop(0, stiff > 0.4 ? '#F8F0E2' : '#FFFBF3');
  g.addColorStop(1, stiff > 0.4 ? '#EADCC4' : '#F3E3C7');
  return g;
}

/** Points of a shape after the pour's errors: size, lopsidedness, wobble, spreading into a blob. */
function shapePts(pts: Pt[], v: LatteVisual, scale: number, seed: number, blobby: boolean): Pt[] {
  const lop = 1 - v.symmetry;
  let out: Pt[] = pts.map(([x, y]) => {
    let X = x * scale;
    let Y = y * scale;
    if (X > 0) {
      X *= 1 + lop * 0.55;
      Y += lop * 0.18 * X;
    }
    X += v.wobble * 0.07 * Math.sin(Y * 9 + seed);
    Y += v.wobble * 0.07 * Math.cos(X * 8 + seed * 1.3);
    return [X, Y];
  });
  if (blobby && v.blob > 0) {
    const cx = out.reduce((s, p) => s + p[0], 0) / out.length;
    const cy = out.reduce((s, p) => s + p[1], 0) / out.length;
    const r = out.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / out.length;
    const k = v.blob * 0.85;
    out = out.map(([x, y]) => {
      const a = Math.atan2(y - cy, x - cx);
      const R = r * (1 + 0.45 * v.blob) * (1 + 0.08 * Math.sin(a * 3 + seed));
      return [x + (cx + Math.cos(a) * R - x) * k, y + (cy + Math.sin(a) * R - y) * k];
    });
  }
  return out;
}

/** A line cut `f` of the way along (past 1: the last stretch carried on). */
function along(pts: Pt[], f: number): Pt[] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = f * seg.reduce((a, b) => a + b, 0);
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < seg.length; i++) {
    const last = i === seg.length - 1;
    if (left <= seg[i] || last) {
      const k = seg[i] ? left / seg[i] : 0;
      out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]);
      return out;
    }
    out.push(pts[i + 1]);
    left -= seg[i];
  }
  return out;
}

/** A shape's points as it was poured: sized about its middle, nudged sideways. */
function asPoured(pts: Pt[], q: Poured | undefined): Pt[] {
  if (!q) return pts;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [mx + (x - mx) * q.scale + q.shift, my + (y - my) * q.scale]);
}

function drawPrims(c: CanvasRenderingContext2D, prims: Prim[], v: LatteVisual, scale: number, seed: number, poured?: Poured[]): void {
  for (const [i, p] of prims.entries()) {
    const q = poured?.[i];
    if (q && (q.scale <= 0 || q.length <= 0)) continue;
    c.beginPath();
    if (p.k === 'blob') {
      smooth(c, shapePts(asPoured(p.pts, q), v, scale, seed, true), true);
      c.fillStyle = toneFill(c, p.tone, v);
      c.fill();
    } else if (p.k === 'stroke') {
      const drawn = q ? along(p.pts, q.length).map(([x, y]): Pt => [x + q.shift, y]) : p.pts;
      if (drawn.length < 2) continue;
      let pts = shapePts(drawn, v, scale, seed, false);
      if (p.cut && pts.length >= 3) {
        // A crooked cut-through bends sideways in the middle.
        const bend = (1 - v.cutStraight) * 0.22 * (seed % 2 ? 1 : -1);
        pts = pts.map(([x, y], i) => [x + (i === Math.floor(pts.length / 2) ? bend : 0), y]);
      }
      smooth(c, pts, false);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = p.w * (p.cut ? 1 : scale);
      c.strokeStyle = p.tone === 'crema' ? cremaColor(v, -6, 0.9) : toneFill(c, p.tone, v);
      c.stroke();
    } else {
      const [[x, y]] = shapePts([[p.x + (q?.shift ?? 0), p.y]], v, scale, seed, false);
      c.arc(x, y, p.r * scale * (q?.scale ?? 1), 0, Math.PI * 2);
      c.fillStyle = toneFill(c, p.tone, v);
      c.fill();
      if (p.tone === 'matcha') {
        // The green light's glow.
        c.beginPath();
        c.arc(x, y, p.r * scale * 1.8, 0, Math.PI * 2);
        c.fillStyle = 'rgba(160,220,110,0.25)';
        c.fill();
      }
    }
  }
}

/** Base layers by key (the saucer, the cup and its crema don't change while the pattern grows). */
const bases = new Map<string, HTMLCanvasElement>();
const BASES_KEPT = 6;

/** Geometry of the cup on a W×W canvas. */
function geometry(W: number) {
  return { cx: W / 2, cy: W / 2, saucerR: W * 0.475, cupR: W * 0.395, cremaR: W * 0.335 };
}

/** The saucer, any spill, the cup and the crema in it — everything under the milk. */
function baseLayer(W: number, scene: CupScene): HTMLCanvasElement {
  const v = scene.visual;
  const key = [W, scene.seed, v.cremaHue.toFixed(2), v.cremaLight.toFixed(2), v.cremaThin.toFixed(3), v.bitterRim.toFixed(3), v.spill.toFixed(3), Math.min(1, scene.crema).toFixed(3)].join('|');
  const hit = bases.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const c = cv.getContext('2d')!;
  const rnd = mulberry32(scene.seed);
  const { cx, cy, saucerR, cupR, cremaR } = geometry(W);

  // The saucer.
  c.save();
  c.shadowColor = 'rgba(40,24,12,0.35)';
  c.shadowBlur = W * 0.03;
  c.shadowOffsetY = W * 0.012;
  const sg = c.createRadialGradient(cx - W * 0.08, cy - W * 0.1, W * 0.05, cx, cy, saucerR);
  sg.addColorStop(0, '#FFFFFF');
  sg.addColorStop(1, '#E6DDD0');
  c.fillStyle = sg;
  c.beginPath();
  c.arc(cx, cy, saucerR, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(160,140,120,0.35)';
  c.lineWidth = W * 0.004;
  c.beginPath();
  c.arc(cx, cy, saucerR * 0.9, 0, Math.PI * 2);
  c.stroke();

  // Spilled on the saucer (a late pour).
  if (v.spill > 0) {
    const a = 0.75;
    const d = cupR + (saucerR - cupR) * 0.5;
    const r = (saucerR - cupR) * (0.35 + 0.9 * v.spill);
    const pts: Pt[] = Array.from({ length: 14 }, (_, i) => {
      const t = (i / 14) * Math.PI * 2;
      const rr = r * (0.75 + 0.35 * rnd()) * (1 + 0.6 * Math.max(0, Math.cos(t - a)));
      return [cx + Math.cos(a) * d + Math.cos(t) * rr * 1.4, cy + Math.sin(a) * d + Math.sin(t) * rr];
    });
    c.beginPath();
    smooth(c, pts, true);
    c.fillStyle = cremaColor(v, 8, 0.85);
    c.fill();
  }

  // The handle and the cup.
  c.fillStyle = '#F7F2EA';
  c.strokeStyle = 'rgba(150,130,110,0.5)';
  c.lineWidth = W * 0.004;
  c.beginPath();
  c.roundRect(cx + cupR - W * 0.02, cy - W * 0.045, W * 0.1, W * 0.09, W * 0.035);
  c.fill();
  c.stroke();
  const cg = c.createRadialGradient(cx - W * 0.1, cy - W * 0.12, W * 0.02, cx, cy, cupR);
  cg.addColorStop(0, '#FFFFFF');
  cg.addColorStop(1, '#E9E1D5');
  c.fillStyle = cg;
  c.beginPath();
  c.arc(cx, cy, cupR, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // The inside wall.
  const wall = c.createRadialGradient(cx, cy, cremaR * 0.98, cx, cy, cupR * 0.95);
  wall.addColorStop(0, '#D9CFC2');
  wall.addColorStop(1, '#FBF8F2');
  c.fillStyle = wall;
  c.beginPath();
  c.arc(cx, cy, cupR * 0.95, 0, Math.PI * 2);
  c.fill();

  if (scene.crema > 0) {
    c.save();
    c.translate(cx, cy);
    c.scale(cremaR, cremaR);
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.clip();
    c.globalAlpha = Math.min(1, scene.crema);
    const g = c.createRadialGradient(-0.15, -0.15, 0.05, 0, 0, 1);
    g.addColorStop(0, cremaColor(v, 12));
    g.addColorStop(0.75, cremaColor(v, 0));
    g.addColorStop(1, cremaColor(v, -10));
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    // A thin shot: pale patches where the crema didn't form.
    for (let i = 0; i < Math.round(v.cremaThin * 14); i++) {
      c.beginPath();
      c.arc(rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8, 0.06 + rnd() * 0.12, 0, Math.PI * 2);
      c.fillStyle = cremaColor(v, 18, 0.35 * v.cremaThin);
      c.fill();
    }
    // A late shot: a dark, bitter ring at the rim.
    if (v.bitterRim > 0) {
      c.beginPath();
      c.arc(0, 0, 0.94, 0, Math.PI * 2);
      c.lineWidth = 0.12 * v.bitterRim + 0.02;
      c.strokeStyle = cremaColor(v, -22, 0.85);
      c.stroke();
    }
    c.restore();
  }
  bases.set(key, cv);
  if (bases.size > BASES_KEPT) bases.delete(bases.keys().next().value!);
  return cv;
}

/**
 * Renders the cup into `out` (sized by the caller, e.g. 320 × devicePixelRatio). While the
 * pattern grows (`growth` set) the layers under the milk come from a cache and the pattern is
 * drawn without blur, so a frame costs little; the finished cup is drawn in full.
 */
export function renderCup(out: HTMLCanvasElement, scene: CupScene, supersample = 4): void {
  const W = CUP_SIZE * supersample;
  const cv = work(W);
  const c = cv.getContext('2d')!;
  const v = scene.visual;
  const live = scene.growth !== undefined;
  // The milk has its own random stream, so the cached base never changes what it draws.
  const rnd = mulberry32(scene.seed ^ 0x9e3779b9);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, W);
  c.filter = 'none';
  c.drawImage(baseLayer(W, scene), 0, 0);
  const { cx, cy, cupR, cremaR } = geometry(W);

  const p = scene.pattern;
  if (scene.crema > 0 && p) {
    // Everything in the cup is drawn in units of the crema radius, clipped to it.
    c.save();
    c.translate(cx, cy);
    c.scale(cremaR, cremaR);
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.clip();
    const prims = p.shapes();
    const scale = live ? Math.min(1.7, Math.max(0.02, scene.growth!)) : v.scale;
    if (scene.guide) {
      // The faint outline the pour aims for.
      c.save();
      c.setLineDash([0.04, 0.035]);
      c.lineWidth = 0.014;
      c.strokeStyle = 'rgba(255,248,236,0.5)';
      for (const q of prims) {
        c.beginPath();
        if (q.k === 'blob') smooth(c, q.pts, true);
        else if (q.k === 'stroke' && !q.cut) smooth(c, q.pts, false);
        else if (q.k === 'dot') c.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }
    let keep = prims.length;
    if (live) keep = Math.max(1, Math.ceil(prims.length * Math.min(1, scene.growth! * 1.05)));
    else keep = Math.max(1, Math.ceil(prims.length * (1 - 0.7 * v.unfinished)));
    if (scene.poured) keep = Math.min(prims.length, scene.poured.length);
    let shown = prims.slice(0, keep);
    if (!scene.poured && !live && v.unfinished > 0.45) shown = shown.filter((q) => !(q.k === 'stroke' && q.cut));
    // Canvas blur lengths are canvas px, whatever the transform. Only the finished cup is blurred.
    if (!live) c.filter = `blur(${v.blur * supersample}px)`;
    // Overpoured: it all runs together into one round puddle first.
    if (!live && v.blob > 0.2) {
      c.beginPath();
      const puddle: Pt[] = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r = 0.45 * v.scale * v.blob * (0.9 + 0.2 * Math.sin(a * 3 + scene.seed));
        return [Math.cos(a) * r * 1.1, 0.08 + Math.sin(a) * r];
      });
      smooth(c, puddle, true);
      c.fillStyle = toneFill(c, 'foam', v);
      c.fill();
    }
    drawPrims(c, shown, v, scale, scene.seed % 97, scene.poured);
    c.filter = 'none';
    // Scalded milk: stiff lumps of foam.
    for (let i = 0; i < Math.round(v.stiff * 22); i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.6 * scale;
      c.beginPath();
      c.arc(Math.cos(a) * r, Math.sin(a) * r, 0.025 + rnd() * 0.035, 0, Math.PI * 2);
      c.fillStyle = 'rgba(250,242,228,0.8)';
      c.fill();
    }
    // Bubbles: big ones from under-steamed milk, little ones from scalded.
    for (let i = 0; i < v.bubbleCount; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.92;
      const br = (v.bubbleSize / 100) * (0.6 + rnd() * 0.9);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      c.beginPath();
      c.arc(x, y, br, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,250,240,0.28)';
      c.fill();
      c.lineWidth = br * 0.25;
      c.strokeStyle = 'rgba(70,40,20,0.35)';
      c.stroke();
      c.beginPath();
      c.arc(x - br * 0.35, y - br * 0.35, br * 0.22, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill();
    }
    // The glossy highlight of a well-made cup.
    if (v.gloss > 0) {
      c.beginPath();
      c.ellipse(-0.42, -0.5, 0.32, 0.1, -0.7, 0, Math.PI * 2);
      c.fillStyle = `rgba(255,255,255,${0.32 * v.gloss})`;
      c.fill();
    }
    c.restore();
  }

  // The rim's shine, and the glints of a perfect cup.
  c.beginPath();
  c.arc(cx, cy, cupR * 0.97, Math.PI * 1.05, Math.PI * 1.55);
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = W * 0.008;
  c.stroke();
  if (v.sparkle && !live) {
    for (const [a, s] of [
      [-2.2, 1],
      [-0.5, 0.7],
      [2.6, 0.8],
    ] as const) {
      const x = cx + Math.cos(a) * cupR * 1.02;
      const y = cy + Math.sin(a) * cupR * 1.02;
      const r = W * 0.035 * s;
      c.beginPath();
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.quadraticCurveTo(x, y, x, y + r);
      c.quadraticCurveTo(x, y, x - r, y);
      c.quadraticCurveTo(x, y, x, y - r);
      c.fillStyle = '#FFF4C8';
      c.fill();
    }
  }

  // Step down by halves to the output size (smooth, no aliasing).
  let src = cv;
  let size = W;
  while (size / 2 >= out.width * 1.01) {
    const next = work(size / 2);
    const n = next.getContext('2d')!;
    n.setTransform(1, 0, 0, 1, 0, 0);
    n.clearRect(0, 0, size / 2, size / 2);
    n.imageSmoothingQuality = 'high';
    n.drawImage(src, 0, 0, size / 2, size / 2);
    src = next;
    size /= 2;
  }
  const o = out.getContext('2d')!;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, out.width, out.height);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(src, 0, 0, out.width, out.height);
}
