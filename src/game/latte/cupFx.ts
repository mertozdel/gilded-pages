/**
 * The coffee being made, drawn over the cup on its own canvas every frame: the espresso
 * running into the cup (with ripples where it lands), the milk pitcher steaming, the milk
 * poured from the tilted pitcher with the latte-art wiggle, and steam rising off a cup waiting
 * to be served. Everything is a function of time — no particle state to keep.
 */
export interface CupFxState {
  stage: 1 | 2 | 3;
  /** The button is held (the shot runs, the wand steams, the milk pours). */
  holding: boolean;
  /** Gauge fill, 0..1. */
  fill: number;
  /** 'cup': a finished (or waiting) cup, steaming. */
  mode: 'make' | 'cup' | 'none';
  reduced: boolean;
}

const TAU = Math.PI * 2;

/** Draws one frame; `w` is the canvas size in CSS px, `t` ms. */
export function drawCupFx(c: CanvasRenderingContext2D, w: number, t: number, s: CupFxState): void {
  c.clearRect(0, 0, w, w);
  if (s.mode === 'none') return;
  const cx = w / 2;
  const cy = w / 2;
  const crema = w * 0.335;
  if (s.mode === 'cup' || (s.stage === 1 && !s.holding)) {
    steam(c, cx, cy, crema, w, t, s.reduced, s.mode === 'cup' ? 1 : 0.5);
    if (s.mode === 'cup') return;
  }
  if (s.stage === 1) {
    portafilter(c, cx, w);
    if (s.holding) espresso(c, cx, cy, crema, w, t);
  } else if (s.stage === 2) {
    pitcher(c, w * 0.8, w * 0.22, w * 0.2, 0, s.holding ? s.fill : 0, t);
    if (s.holding) pitcherSteam(c, w * 0.8, w * 0.1, w, t, s.reduced);
  } else {
    const tilt = s.holding ? -0.75 : 0;
    pitcher(c, w * 0.8, w * 0.18, w * 0.2, tilt, 1, t);
    if (s.holding) pour(c, w, cx, cy, crema, t, s.fill);
  }
}

/** The group head of the machine at the top: the shot comes from here. */
function portafilter(c: CanvasRenderingContext2D, cx: number, w: number): void {
  c.fillStyle = '#2B2B30';
  c.beginPath();
  c.roundRect(cx - w * 0.07, -w * 0.02, w * 0.14, w * 0.06, 6);
  c.fill();
  c.fillStyle = '#4A4A52';
  c.fillRect(cx - w * 0.025, w * 0.035, w * 0.05, w * 0.02);
}

function espresso(c: CanvasRenderingContext2D, cx: number, cy: number, crema: number, w: number, t: number): void {
  const top = w * 0.055;
  const land = cy - crema * 0.1;
  // The stream, thin and wavering, darker at the top.
  const g = c.createLinearGradient(0, top, 0, land);
  g.addColorStop(0, '#2A140A');
  g.addColorStop(1, '#7A4524');
  c.strokeStyle = g;
  c.lineCap = 'round';
  for (const [dx, width] of [
    [-w * 0.012, w * 0.012],
    [w * 0.012, w * 0.01],
  ] as const) {
    c.lineWidth = width;
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const y = top + ((land - top) * i) / 16;
      const x = cx + dx + Math.sin(y * 0.08 + t * 0.02) * w * 0.004 * (i / 16);
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
  }
  // Drips running down the stream.
  c.fillStyle = '#5A3018';
  for (let k = 0; k < 4; k++) {
    const p = ((t / 420 + k / 4) % 1) * (land - top);
    c.beginPath();
    c.arc(cx + (k % 2 ? 1 : -1) * w * 0.012, top + p, w * 0.008, 0, TAU);
    c.fill();
  }
  // Ripples where it lands.
  for (let k = 0; k < 3; k++) {
    const life = ((t + k * 260) % 780) / 780;
    c.strokeStyle = `rgba(214,160,100,${0.55 * (1 - life)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(cx, land, crema * 0.08 + crema * 0.45 * life, (crema * 0.08 + crema * 0.45 * life) * 0.8, 0, 0, TAU);
    c.stroke();
  }
}

/** A steel milk pitcher seen from the side, its spout to the left; `tilt` pours. */
function pitcher(c: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number, foam: number, t: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  const h = size;
  const top = size * 0.62;
  const bottom = size * 0.8;
  const body = c.createLinearGradient(-bottom / 2, 0, bottom / 2, 0);
  body.addColorStop(0, '#8E949C');
  body.addColorStop(0.4, '#F2F4F7');
  body.addColorStop(1, '#6E747C');
  c.fillStyle = body;
  c.strokeStyle = '#4A4F57';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-top / 2 - size * 0.14, -h / 2 - size * 0.04); // the spout
  c.lineTo(-top / 2, -h / 2 + size * 0.05);
  c.lineTo(-bottom / 2, h / 2);
  c.lineTo(bottom / 2, h / 2);
  c.lineTo(top / 2, -h / 2);
  c.closePath();
  c.fill();
  c.stroke();
  // The handle.
  c.beginPath();
  c.arc(bottom / 2 + size * 0.06, 0, size * 0.18, -1.2, 1.2);
  c.lineWidth = size * 0.07;
  c.strokeStyle = '#5A5F67';
  c.stroke();
  // Milk at the rim, swirling as it steams.
  c.fillStyle = '#FFF8EC';
  c.beginPath();
  c.ellipse(0, -h / 2 + size * 0.06, top / 2 - 2, size * 0.06, 0, 0, TAU);
  c.fill();
  if (foam > 0) {
    c.strokeStyle = 'rgba(200,180,150,0.8)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(0, -h / 2 + size * 0.06, (top / 2 - 6) * (0.4 + 0.6 * foam), size * 0.03, 0, t * 0.012, t * 0.012 + 4);
    c.stroke();
  }
  c.restore();
}

function pitcherSteam(c: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, reduced: boolean): void {
  // The steam wand, and puffs rising off the milk.
  c.strokeStyle = '#3A3A42';
  c.lineWidth = w * 0.012;
  c.beginPath();
  c.moveTo(x + w * 0.02, -w * 0.02);
  c.lineTo(x - w * 0.005, y + w * 0.08);
  c.stroke();
  const puffs = reduced ? 3 : 6;
  for (let k = 0; k < puffs; k++) {
    const life = ((t + (k * 900) / puffs) % 900) / 900;
    const r = w * (0.02 + 0.05 * life);
    c.fillStyle = `rgba(255,255,255,${0.5 * (1 - life)})`;
    c.beginPath();
    c.arc(x + Math.sin(k * 2.1 + t * 0.004) * w * 0.04 - w * 0.03 * life, y - life * w * 0.12, r, 0, TAU);
    c.fill();
  }
}

function pour(c: CanvasRenderingContext2D, w: number, cx: number, cy: number, crema: number, t: number, fill: number): void {
  // From the tilted pitcher's spout to the pour point, wiggling side to side (the latte-art wiggle).
  const spout = { x: w * 0.66, y: w * 0.1 };
  const wiggle = Math.sin(t * 0.03) * crema * 0.12 * Math.min(1, fill * 1.6);
  const at = { x: cx + wiggle, y: cy + crema * 0.25 - crema * 0.4 * fill };
  c.strokeStyle = '#FFF8EC';
  c.lineCap = 'round';
  c.lineWidth = w * 0.016;
  c.beginPath();
  c.moveTo(spout.x, spout.y);
  c.quadraticCurveTo(spout.x - w * 0.02, at.y - w * 0.12, at.x, at.y);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = w * 0.005;
  c.stroke();
  // Where it lands, the foam spreads.
  for (let k = 0; k < 2; k++) {
    const life = ((t + k * 220) % 440) / 440;
    c.strokeStyle = `rgba(255,248,236,${0.6 * (1 - life)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(at.x, at.y, crema * (0.05 + 0.12 * life), crema * (0.04 + 0.09 * life), 0, 0, TAU);
    c.stroke();
  }
}

/** Steam curling up off the cup. */
function steam(c: CanvasRenderingContext2D, cx: number, cy: number, crema: number, w: number, t: number, reduced: boolean, strength: number): void {
  const wisps = reduced ? 1 : 3;
  for (let k = 0; k < wisps; k++) {
    const life = reduced ? 0.4 : ((t + k * 900) % 2700) / 2700;
    const x0 = cx + (k - 1) * crema * 0.35;
    const y0 = cy - crema * 0.2 - life * w * 0.25;
    const a = 0.22 * strength * Math.sin(Math.PI * life);
    if (a <= 0.01) continue;
    c.strokeStyle = `rgba(255,255,255,${a})`;
    c.lineWidth = w * 0.02;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const y = y0 - (i / 10) * w * 0.16;
      const x = x0 + Math.sin(i * 0.7 + t * 0.003 + k) * w * 0.025;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
  }
}
