"""Paints furniture out of a café painting: fills hole polygons from the painting around them
(exemplar inpainting, patch by patch from the hole's edge inwards) and writes the filled area as a
patch PNG (transparent outside the holes) for the room map's Overlays layer. The painting itself
is never changed, so a patch can be switched off or moved in the map.

    python scripts/paint-out.py <job.json>

job.json:
    {
      "painting": "public/assets/rooms/cafe-machorn-guests.png",
      "out": "public/assets/rooms/patches/cafe-two-top.png",
      "steps": [                          # filled in order; each step can use what earlier ones filled
        {
          "holes":  [[[x, y], ...], ...],  # polygons to fill (px of the painting)
          "only":   [[[x, y], ...], ...],  # copy only from inside these (clean floor, an armchair)
          "like":   [[[x, y], ...], ...],  # and only pixels coloured like these samples (the floor)
          "keep":   [[[x, y], ...], ...],  # never copied from (people)
          "grow":   1,                    # px added around the holes (catches outlines)
          "minus_sprite": {               # optional: leave out what a sprite covers anyway
            "sheet": "public/assets/sprites/matt/matt_sheet.png", "frames": ["matt_chill", "matt_chill_br"],
            "x": 668, "y": 362, "scale": 0.539, "origin": [0.5, 0.9875]
          },
          "clone":  false,                # true: copy each hole whole from one shifted spot (a
                                          # clone stamp: floor tiles stay in line); else patch by patch
          "clean":  0.98,                 # clone: how much of that spot must be allowed source
          "radius": 70,                   # how far from the hole to look
          "patch":  9,                    # patch size (odd)
          "near":   0.02,                 # how much nearer source patches are preferred (local light)
          "tone":   true                  # even out the fill's light with its surroundings
        }
      ]
    }

Prints the patch's top-left corner and size: that's its object in the map (x, y, width, height).
Needs Pillow and numpy.
"""
import json
import sys

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image, ImageDraw, ImageFilter


def poly_mask(size, polys):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(pt) for pt in p], fill=255)
    return np.asarray(m) > 0


def grow(mask, px):
    if px <= 0:
        return mask
    img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * px + 1))
    return np.asarray(img) > 0


def shrink(mask, px):
    img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * px + 1))
    return np.asarray(img) > 0


def palette_mask(img, sample, tol=22.0, k=16):
    """Pixels coloured like the sample (k-means centres of its colours, within `tol`)."""
    px = img[sample].reshape(-1, 3)
    rng = np.random.default_rng(1)
    centres = px[rng.choice(len(px), size=min(k, len(px)), replace=False)]
    for _ in range(12):
        lab = np.argmin(((px[:, None, :] - centres[None]) ** 2).sum(-1), axis=1)
        centres = np.array([px[lab == i].mean(0) if (lab == i).any() else centres[i] for i in range(len(centres))])
    flat = img.reshape(-1, 3)
    best = np.full(len(flat), np.inf)
    for c in centres:
        best = np.minimum(best, ((flat - c) ** 2).sum(-1))
    return (np.sqrt(best) <= tol).reshape(img.shape[:2])


def inpaint(img, hole, source, half, radius, near_weight=0.02):
    """
    Criminisi-style fill. The next patch is the front pixel with the highest priority: how much of
    its patch is known, times how strongly a line (grout, an edge) runs into the hole there, so
    lines carry on across it. Each is filled from the best-matching patch (SSD) in `source`.
    """
    H, W, _ = img.shape
    img = img.copy()
    hole = hole.copy()
    conf = (~hole).astype(np.float64)
    gray = img.mean(axis=2)
    # A source patch must lie wholly on known, allowed pixels; they never change, so they are cut once.
    ok_center = shrink(source & ~hole, half)
    ok_center[:half, :] = ok_center[-half:, :] = False
    ok_center[:, :half] = ok_center[:, -half:] = False
    k = 2 * half + 1
    cy_all, cx_all = np.nonzero(ok_center)
    if not len(cy_all):
        raise SystemExit('no source patches: widen the radius or the "only" areas')
    patches = sliding_window_view(img, (k, k, 3))[:, :, 0][cy_all - half, cx_all - half]  # (N, k, k, 3)
    while hole.any():
        known = ~hole
        front = hole & grow(known, 1)
        ys, xs = np.nonzero(front)
        # The isophote (gradient turned a quarter turn) of the known image, and the front's normal.
        g = np.where(hole, np.nan, gray)
        gy_, gx_ = np.gradient(np.nan_to_num(g, nan=float(np.nanmean(g))))
        my, mx = np.gradient(hole.astype(np.float64))
        best_p, best_c, best_i = -1.0, 0.0, 0
        for i, (y, x) in enumerate(zip(ys, xs)):
            y0, y1, x0, x1 = max(0, y - half), min(H, y + half + 1), max(0, x - half), min(W, x + half + 1)
            c = conf[y0:y1, x0:x1].sum() / (k * k)
            # The strongest known gradient in the patch, against the front's normal.
            kn = ~hole[y0:y1, x0:x1]
            if kn.any():
                gxs, gys = gx_[y0:y1, x0:x1][kn], gy_[y0:y1, x0:x1][kn]
                m = np.argmax(gxs * gxs + gys * gys)
                n = np.hypot(mx[y, x], my[y, x]) or 1.0
                d = abs(-gys[m] * mx[y, x] / n + gxs[m] * my[y, x] / n) / 255.0
            else:
                d = 0.0
            p = c * (d + 0.05)
            if p > best_p:
                best_p, best_c, best_i = p, c, i
        cy, cx = int(ys[best_i]), int(xs[best_i])
        cy = min(max(cy, half), H - half - 1)
        cx = min(max(cx, half), W - half - 1)
        tgt = img[cy - half:cy + half + 1, cx - half:cx + half + 1]
        tmask = known[cy - half:cy + half + 1, cx - half:cx + half + 1]
        near = (np.abs(cy_all - cy) <= radius) & (np.abs(cx_all - cx) <= radius)
        if not near.any():
            raise SystemExit(f'no source patch near ({cx}, {cy}): widen the radius or the "only" areas')
        diff = (patches[near] - tgt) * tmask[None, :, :, None]
        ssd = (diff * diff).sum(axis=(1, 2, 3))
        # Prefer near patches a little (keeps the lighting of the spot).
        ssd = ssd + near_weight * ((cy_all[near] - cy) ** 2 + (cx_all[near] - cx) ** 2)
        j = np.argmin(ssd)
        sy, sx = cy_all[near][j], cx_all[near][j]
        src = img[sy - half:sy + half + 1, sx - half:sx + half + 1]
        fill = hole[cy - half:cy + half + 1, cx - half:cx + half + 1]
        img[cy - half:cy + half + 1, cx - half:cx + half + 1][fill] = src[fill]
        conf[cy - half:cy + half + 1, cx - half:cx + half + 1][fill] = best_c
        hole[cy - half:cy + half + 1, cx - half:cx + half + 1][fill] = False
    return img


def match_tone(img, filled, hole, ref, r=4, iters=600):
    """
    Evens out the fill's light with its surroundings: at the hole's edge, the difference between
    the local mean of `ref` pixels just outside (what the fill is made of: floor next to floor,
    never the dark machine beside it) and the fill's just inside; that offset is spread smoothly
    across the hole (a membrane), so shadows and lamplight carry on into it.
    """
    known = ~hole & ref
    edge = hole & grow(known, r)
    k = 2 * r + 1

    def local_mean(a, m):
        from numpy.lib.stride_tricks import sliding_window_view as sw
        pad = ((r, r), (r, r))
        mp = np.pad(m.astype(np.float64), pad)
        s = sw(mp, (k, k)).sum(axis=(2, 3))
        out = np.zeros_like(a)
        for c in range(3):
            ap = np.pad(a[..., c] * m, pad)
            out[..., c] = sw(ap, (k, k)).sum(axis=(2, 3)) / np.maximum(s, 1)
        return out

    outside = local_mean(img, known)
    inside = local_mean(filled, hole)
    if not edge.any():
        return filled
    delta = np.zeros_like(filled)
    delta[edge] = outside[edge] - inside[edge]
    ys, xs = np.nonzero(hole)
    y0, y1, x0, x1 = ys.min() - 1, ys.max() + 2, xs.min() - 1, xs.max() + 2
    d = delta[y0:y1, x0:x1]
    h = hole[y0:y1, x0:x1]
    free = h & ~edge[y0:y1, x0:x1]
    for _ in range(iters):
        p = np.pad(d, ((1, 1), (1, 1), (0, 0)), mode='edge')
        hp = np.pad(h, 1)
        nb = (p[:-2, 1:-1] * hp[:-2, 1:-1, None] + p[2:, 1:-1] * hp[2:, 1:-1, None]
              + p[1:-1, :-2] * hp[1:-1, :-2, None] + p[1:-1, 2:] * hp[1:-1, 2:, None])
        n = (hp[:-2, 1:-1].astype(int) + hp[2:, 1:-1] + hp[1:-1, :-2] + hp[1:-1, 2:])[..., None]
        d = np.where(free[..., None], nb / np.maximum(n, 1), d)
    out = filled.copy()
    out[y0:y1, x0:x1] = np.where(h[..., None], filled[y0:y1, x0:x1] + d, filled[y0:y1, x0:x1])
    return out


def clone_fill(img, hole, source, radius, clean=0.98, ring=5, step=1):
    """
    Fills a hole with a copy of one shifted spot of the painting: the shift whose surroundings match
    the hole's surroundings best (on a ring `ring` px wide), among those that land the hole on
    `source` pixels (at least `clean` of it). On a tiled floor the best shift lands on the tiling, so grout lines carry on.
    """
    H, W, _ = img.shape
    ys, xs = np.nonzero(hole)
    rim = grow(hole, ring) & ~hole
    ry, rx = np.nonzero(rim)
    best, best_d = np.inf, None
    for dy in range(-radius, radius + 1, step):
        for dx in range(-radius, radius + 1, step):
            if abs(dx) + abs(dy) < 8:
                continue
            sy, sx = ys + dy, xs + dx
            if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W:
                continue
            if source[sy, sx].mean() < clean:
                continue
            qy, qx = ry + dy, rx + dx
            if qy.min() < 0 or qx.min() < 0 or qy.max() >= H or qx.max() >= W:
                continue
            d = ((img[ry, rx] - img[qy, qx]) ** 2).sum() / len(ry)
            if d < best:
                best, best_d = d, (dy, dx)
    if best_d is None:
        raise SystemExit('no clean spot to clone from: widen the radius or the "like" areas')
    out = img.copy()
    out[ys, xs] = img[ys + best_d[0], xs + best_d[1]]
    print(f'  clone {len(ys)} px from shift {best_d[1]:+d},{best_d[0]:+d} (ring error {best:.0f})', file=sys.stderr)
    return out


def sprite_cover(size, spec):
    """Every pixel the sprite covers in any of its frames, placed at (x, y) by its origin."""
    sheet = Image.open(spec['sheet']).convert('RGBA')
    frames = json.load(open(spec['sheet'].replace('.png', '.json')))['frames']
    k = float(spec['scale'])
    ox, oy = spec.get('origin', [0.5, 0.9875])
    out = Image.new('L', size, 0)
    for name in spec['frames']:
        f = frames[name]['frame']
        a = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])).split()[3]
        w, h = round(f['w'] * k), round(f['h'] * k)
        a = a.resize((w, h), Image.LANCZOS).point(lambda v: 255 if v > 200 else 0)
        out.paste(a, (round(spec['x'] - ox * w), round(spec['y'] - oy * h)), a)
    return np.asarray(out) > 0


def main():
    job = json.load(open(sys.argv[1]))
    painting = Image.open(job['painting']).convert('RGB')
    img = np.asarray(painting).astype(np.float64)
    size = painting.size
    done = np.zeros(img.shape[:2], bool)
    for step in job['steps']:
        hole = grow(poly_mask(size, step['holes']), int(step.get('grow', 1))) & ~done
        if step.get('minus_sprite'):
            hole &= ~shrink(sprite_cover(size, step['minus_sprite']), 1)
        radius = int(step.get('radius', 70))
        source = grow(hole, radius) & ~hole & ~poly_mask(size, step.get('keep', []))
        if step.get('only'):
            source &= poly_mask(size, step['only'])
        if step.get('like'):
            source &= palette_mask(img, poly_mask(size, step['like']), float(step.get('tolerance', 22)))
        if step.get('clone'):
            # One shift per hole, so each keeps its own floor tiles in line.
            filled = img
            for poly in step['holes']:
                part = hole & grow(poly_mask(size, [poly]), int(step.get('grow', 1)))
                filled = clone_fill(filled, part, source & ~hole, radius, float(step.get('clean', 0.98)))
        else:
            filled = inpaint(img, hole, source, int(step.get('patch', 9)) // 2, radius, float(step.get('near', 0.02)))
        img = match_tone(img, filled, hole, source) if step.get('tone', True) else filled
        done |= hole
    ys, xs = np.nonzero(done)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = np.clip(np.round(img[y0:y1, x0:x1]), 0, 255).astype(np.uint8)
    rgba[..., 3] = done[y0:y1, x0:x1] * 255
    Image.fromarray(rgba, 'RGBA').save(job['out'], optimize=True)
    print(json.dumps({'out': job['out'], 'x': int(x0), 'y': int(y0), 'width': int(x1 - x0), 'height': int(y1 - y0)}))


if __name__ == '__main__':
    main()
