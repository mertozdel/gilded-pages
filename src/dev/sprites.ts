/** Dev-only: every animation of Roxy (from her sprite pack, with each step's duration) and the NPC sheets, for checking the art. */
import { REGULARS } from '../content';
import { renderNpcSheet } from '../game/companion/art/figure';
import { WALK_INS, regularLook } from '../game/companion/art/people';
import { loadRoxyAtlas, ROXY_ANIMS } from '../game/companion/art/roxyFrames';

const out = document.getElementById('out')!;
const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 2);
/** Roxy's frames are 192 px tall art; show them at half the NPC scale. */
const roxyScale = scale / 2;

const show = (src: CanvasImageSource, sx: number, sy: number, w: number, h: number, k: number, smooth: boolean) => {
  const big = document.createElement('canvas');
  big.width = Math.round(w * k);
  big.height = Math.round(h * k);
  const c = big.getContext('2d')!;
  c.imageSmoothingEnabled = smooth;
  c.drawImage(src, sx, sy, w, h, 0, 0, big.width, big.height);
  return big;
};

const atlas = await loadRoxyAtlas();
for (const a of Object.values(ROXY_ANIMS)) {
  const h = document.createElement('h2');
  const total = a.steps.reduce((t, s) => t + s.duration, 0);
  h.textContent = `${a.name} (${a.steps.length} steps, ${total} ms) — ${a.use}`;
  out.append(h);
  const row = document.createElement('div');
  for (const s of a.steps) {
    const fr = atlas.rect(s.frame);
    const cv = show(atlas.image, fr.x, fr.y, fr.w, fr.h, roxyScale, true);
    cv.title = `${s.frame} · ${s.duration} ms`;
    row.append(cv);
  }
  out.append(row);
}
const h = document.createElement('h2');
h.textContent = 'NPCs: stand, walk (6), sit, type (2); SE row then NE row';
out.append(h);
for (const l of [...REGULARS.map(regularLook), ...WALK_INS.map((w) => w.look)]) {
  const sheet = renderNpcSheet(l);
  out.append(show(sheet, 0, 0, sheet.width, sheet.height, scale, false), document.createElement('br'));
}
