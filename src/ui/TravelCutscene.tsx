import { useEffect, useRef } from 'react';
import { bus } from '../bus/events';
import { characterForVenue } from '../content/characters';
import { VENUES } from '../content/venues';
import { useStore } from '../store';

const MS = 3000;

/** Smooth 0..1. */
const ease = (t: number) => t * t * (3 - 2 * t);

function drawTrain(c: CanvasRenderingContext2D, w: number, h: number, t: number, back: boolean): void {
  // Sky, the Alps, meadows.
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8EC9F0');
  sky.addColorStop(1, '#E8F4FA');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const peaks = [0.05, 0.22, 0.38, 0.55, 0.7, 0.88, 1.05];
  peaks.forEach((px, i) => {
    const x = (px - t * 0.08) * w;
    const ph = h * (0.32 + (i % 3) * 0.07);
    c.fillStyle = '#7C8BA6';
    c.beginPath();
    c.moveTo(x - w * 0.16, h * 0.62);
    c.lineTo(x, h * 0.62 - ph * 0.8);
    c.lineTo(x + w * 0.16, h * 0.62);
    c.fill();
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.moveTo(x - w * 0.045, h * 0.62 - ph * 0.8 + h * 0.07);
    c.lineTo(x, h * 0.62 - ph * 0.8);
    c.lineTo(x + w * 0.045, h * 0.62 - ph * 0.8 + h * 0.07);
    c.fill();
  });
  c.fillStyle = '#6FBF5A';
  c.beginPath();
  c.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 20) c.lineTo(x, h * 0.6 + Math.sin(x / 90 + t * 2) * 10);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  c.fillStyle = '#58A548';
  c.fillRect(0, h * 0.74, w, h * 0.26);
  // Little flowers going by.
  for (let i = 0; i < 40; i++) {
    const x = ((i * 137 + (back ? 1 : -1) * t * w * 0.6) % w + w) % w;
    c.fillStyle = i % 3 ? '#F6E3A1' : '#FFFFFF';
    c.fillRect(x, h * 0.8 + (i % 7) * 12, 4, 4);
  }
  // The rails.
  c.fillStyle = '#5A3A22';
  c.fillRect(0, h * 0.72, w, 6);
  // The train: an engine and two coaches.
  const p = ease(t);
  const x = back ? w * (1.1 - p * 1.3) : w * (-0.2 + p * 1.3);
  const dir = back ? -1 : 1;
  const y = h * 0.72;
  const bw = w * 0.09;
  for (let k = 0; k < 3; k++) {
    const cx = x - dir * k * bw * 1.08;
    c.fillStyle = k === 0 ? '#2F6DB5' : '#C9374F';
    c.fillRect(cx - bw / 2, y - bw * 0.55, bw, bw * 0.5);
    c.fillStyle = '#F4F4F4';
    for (let wdx = -0.32; wdx < 0.35; wdx += 0.32) c.fillRect(cx + wdx * bw - 6, y - bw * 0.48, 12, 10);
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(cx - bw * 0.3, y, 7, 0, Math.PI * 2);
    c.arc(cx + bw * 0.3, y, 7, 0, Math.PI * 2);
    c.fill();
  }
  // Steam.
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (let k = 0; k < 4; k++) {
    c.beginPath();
    c.arc(x + dir * bw * 0.2 - dir * k * 26, y - bw * 0.7 - k * 14, 10 + k * 4, 0, Math.PI * 2);
    c.fill();
  }
}

function drawPlane(c: CanvasRenderingContext2D, w: number, h: number, t: number, back: boolean): void {
  // The map: sea, two continents (Europe and Asia, loosely), the route.
  c.fillStyle = '#1C3D63';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#E8DCC0';
  const blob = (pts: [number, number][]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h)));
    c.closePath();
    c.fill();
  };
  blob([
    [0.05, 0.25],
    [0.3, 0.18],
    [0.36, 0.35],
    [0.3, 0.5],
    [0.18, 0.58],
    [0.08, 0.5],
  ]);
  blob([
    [0.34, 0.15],
    [0.75, 0.1],
    [0.95, 0.25],
    [0.92, 0.5],
    [0.78, 0.65],
    [0.6, 0.6],
    [0.45, 0.45],
    [0.36, 0.32],
  ]);
  const from = { x: w * 0.2, y: h * 0.36 };
  const to = { x: w * 0.82, y: h * 0.45 };
  const ctrl = { x: w * 0.5, y: h * 0.05 };
  const at = (u: number) => ({ x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * ctrl.x + u * u * to.x, y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * ctrl.y + u * u * to.y });
  c.setLineDash([8, 10]);
  c.strokeStyle = 'rgba(255,111,216,0.9)';
  c.lineWidth = 3;
  c.beginPath();
  for (let u = 0; u <= 1; u += 0.02) {
    const p = at(u);
    if (u) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  }
  c.stroke();
  c.setLineDash([]);
  c.font = `600 ${Math.round(h * 0.035)}px Silkscreen, "Noto Sans SC", "Microsoft YaHei", monospace`;
  c.lineWidth = 4;
  c.strokeStyle = '#F2EDE4';
  c.fillStyle = '#3B2418';
  for (const [label, p] of [
    ['Nürnberg', from],
    ['上海', to],
  ] as const) {
    c.strokeText(label, p.x - 30, p.y + 34);
    c.fillText(label, p.x - 30, p.y + 34);
  }
  c.fillStyle = '#C9374F';
  for (const p of [from, to]) {
    c.beginPath();
    c.arc(p.x, p.y, 6, 0, Math.PI * 2);
    c.fill();
  }
  // The plane.
  const u = back ? 1 - ease(t) : ease(t);
  const p = at(u);
  const q = at(Math.min(1, Math.max(0, u + (back ? -0.01 : 0.01))));
  c.save();
  c.translate(p.x, p.y);
  c.rotate(Math.atan2(q.y - p.y, q.x - p.x));
  const s = h * 0.03;
  c.fillStyle = '#FFFFFF';
  c.beginPath();
  c.moveTo(s * 2, 0);
  c.lineTo(-s * 1.6, -s * 0.35);
  c.lineTo(-s * 1.6, s * 0.35);
  c.fill();
  c.beginPath();
  c.moveTo(s * 0.3, 0);
  c.lineTo(-s * 0.6, -s * 1.6);
  c.lineTo(-s * 0.9, -s * 1.6);
  c.lineTo(-s * 0.4, 0);
  c.lineTo(-s * 0.9, s * 1.6);
  c.lineTo(-s * 0.6, s * 1.6);
  c.fill();
  c.restore();
  // Clouds drifting by.
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    const x = (((i * 0.21 - t * 0.3) % 1) + 1) % 1;
    c.beginPath();
    c.ellipse(x * w, h * (0.7 + (i % 3) * 0.08), w * 0.06, h * 0.025, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/**
 * The 3-second trip to a venue and back: a small train through alpine meadows to the village
 * fest, a small plane over the map to China (reversed on the way home). Any key or tap skips.
 * Arriving opens the venue; coming home announces `break:end` (the twin says hello) and opens
 * the café.
 */
export function TravelCutscene() {
  const travel = useStore((s) => s.travel);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!travel) return;
    const venue = VENUES[travel.venue];
    const who = characterForVenue(travel.venue)!;
    const back = travel.dir === 'back';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const st = useStore.getState();
      st.setTravel(null);
      if (back) {
        bus.emit('break:end', { character: who.id, venue: travel.venue });
        st.navigate({ name: 'cafe', c: who.id });
      } else st.navigate({ name: 'venue', venue: travel.venue });
    };
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      const cv = ref.current;
      if (cv) {
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        if (cv.width !== Math.round(w * dpr)) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
        }
        const c = cv.getContext('2d')!;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const t = Math.min(1, (performance.now() - t0) / MS);
        if (venue.travel === 'train') drawTrain(c, w, h, t, back);
        else drawPlane(c, w, h, t, back);
        if (t >= 1) return finish();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'Tab' || e.key === 'Shift')) return;
      finish();
    };
    const arm = window.setTimeout(() => {
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
    }, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(arm);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
    };
  }, [travel]);

  if (!travel) return null;
  const venue = VENUES[travel.venue];
  return (
    <div className="travel" role="status" aria-label={travel.dir === 'out' ? `Off to the ${venue.title}` : 'Back to the café'} data-testid="travel">
      <canvas ref={ref} />
      <p className="travel-caption">
        {travel.dir === 'out' ? (venue.travel === 'train' ? 'To the village fest…' : 'Flying to China…') : 'Back to Café Machorn…'} <small>(any key to skip)</small>
      </p>
    </div>
  );
}
