"""
Core helpers for cutting Roxy's AI-generated character mockups into clean pixel-art frames.

A mockup is one picture: poses sit in boxes on a beige background with lighter grid lines,
sometimes with labels, speech bubbles and drop shadows. `cut()` keys all of that out and
returns the pose as RGBA at source resolution; `pixelize()` snaps it to a real pixel grid
with a shared palette.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from sklearn.cluster import KMeans


# ---------------------------------------------------------------- sources
class Source:
    """One mockup image, with its background and grid-line colours sampled automatically."""

    def __init__(self, path, boxes):
        self.path = path
        self.img = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
        self.boxes = boxes
        self.beige, self.grid = self._sample_bg()

    def _sample_bg(self):
        px = []
        for (x0, y0, x1, y1) in self.boxes.values():
            if x1 - x0 < 40 or y1 - y0 < 40:
                continue
            c = self.img[y0 + 3:y1 - 2, x0 + 3:x1 - 2]
            band = np.concatenate([c[:6].reshape(-1, 3), c[:, :6].reshape(-1, 3), c[:, -6:].reshape(-1, 3)])
            px.append(band)
        px = np.concatenate(px).astype(np.float32)
        sat = px.max(1) - px.min(1)
        px = px[(sat < 40) & (px.mean(1) > 110) & (px.mean(1) < 200)]   # drop figure/border pixels
        km = KMeans(5, n_init=4, random_state=0).fit(px)
        cent = km.cluster_centers_; counts = np.bincount(km.labels_, minlength=5)
        order = np.argsort(cent.mean(1))
        lum = cent.mean(1); base = np.average(lum, weights=counts)
        beige = cent[lum <= base + 6]
        grid = cent[lum > base + 6]
        if len(grid) == 0:
            grid = cent[order[-1:]]
        return beige.round().astype(np.int32), grid.round().astype(np.int32)


def dist(rgb, pal):
    return np.sqrt(((rgb[..., None, :] - pal[None, None]) ** 2).sum(-1)).min(-1)


def not_bg_hue(c):
    """The backgrounds are red-leaning greys (R > G > B); green or blue pixels are never background."""
    return (c[..., 1] - c[..., 0] > 3) | (c[..., 2] - c[..., 0] > 3)


def bg_candidates(c, src, t):
    db, dg = dist(c, src.beige), dist(c, src.grid)
    beige = (db < t) & (db <= dg)
    grid = (dg < t) & (dg < db)
    anybg = beige | grid
    rows = grid.sum(1) / np.maximum(anybg.sum(1), 1) > 0.40
    cols = grid.sum(0) / np.maximum(anybg.sum(0), 1) > 0.40
    rows = ndi.binary_dilation(rows, iterations=1)
    cols = ndi.binary_dilation(cols, iterations=1)
    online = rows[:, None] | cols[None, :]
    return (beige | (grid & online)) & ~not_bg_hue(c), grid & online


# ---------------------------------------------------------------- cutting
def grid_lines(c, src, bgmask, t):
    """Rows and columns that are grid lines, judged only from known background pixels."""
    dg, db = dist(c, src.grid), dist(c, src.beige)
    gridc = (dg < t) & (dg < db) & bgmask
    nb_r = bgmask.sum(1); nb_c = bgmask.sum(0)
    rows = (gridc.sum(1) >= 8) & (gridc.sum(1) > 0.5 * np.maximum(nb_r, 1))
    cols = (gridc.sum(0) >= 8) & (gridc.sum(0) > 0.5 * np.maximum(nb_c, 1))
    return rows, cols


def has_grid_segment(m, gridc, rows, cols, min_run=4):
    ys, xs = np.where(m)
    for r in np.where(rows)[0]:
        if r < ys.min() or r > ys.max():
            continue
        for rr in (r - 1, r, r + 1):
            if 0 <= rr < m.shape[0]:
                seg = (m[rr] & gridc[rr]).astype(np.int8)
                if seg.any() and _maxrun(seg) >= min_run:
                    return True
    for col in np.where(cols)[0]:
        if col < xs.min() or col > xs.max():
            continue
        for cc in (col - 1, col, col + 1):
            if 0 <= cc < m.shape[1]:
                seg = (m[:, cc] & gridc[:, cc]).astype(np.int8)
                if seg.any() and _maxrun(seg) >= min_run:
                    return True
    return False


def _maxrun(v):
    best = cur = 0
    for x in v:
        cur = cur + 1 if x else 0
        best = max(best, cur)
    return best


def cut(src, box, inset=3, t=18, halo=26, label_rows=0, keep_frac=0.15, fill_holes=True,
        shadows=True, legs=True, erase=(), pockets=(), keep=None, seed_bottom=True):
    """Return the pose inside `box` as RGBA (source resolution) with the background removed.

    erase: list of (x0, y0, x1, y1) rectangles in crop coordinates to drop (bubbles, labels).
    keep:  optional list of (x0, y0, x1, y1) rectangles whose pixels are always foreground.
    """
    x0, y0, x1, y1 = box
    c = src.img[y0 + inset:y1 - inset + 1, x0 + inset:x1 - inset + 1].copy()
    H, W = c.shape[:2]
    cand, gridline = bg_candidates(c, src, t)
    sat = c.max(-1) - c.min(-1); lum = c.mean(-1)
    if label_rows:
        text = np.zeros_like(cand)
        text[:label_rows] = ((sat < 40) & ((lum < 70) | (lum > 200)))[:label_rows]
        text = ndi.binary_dilation(text, iterations=1) & (np.arange(H)[:, None] < label_rows)
        cand |= text
    if shadows:
        foot = np.zeros_like(cand); foot[int(H * 0.80):] = True
        cand |= foot & (sat < 30) & (lum > 85) & (lum < 165)
    seeds = np.zeros_like(cand); seeds[0, :] = True
    if seed_bottom:
        seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
    else:   # waist-up poses touch the bottom edge: seed the sides only above the shoulders
        seeds[:int(H * 0.55), 0] = seeds[:int(H * 0.55), -1] = True
    lab, _ = ndi.label(cand)
    ids = np.unique(lab[seeds & cand]); ids = ids[ids > 0]
    bgm = np.isin(lab, ids)
    # close leaks: border-connected background must arrive through a channel wider than a few px
    disk = ndi.iterate_structure(ndi.generate_binary_structure(2, 1), 2)
    opened = ndi.binary_opening(bgm, structure=disk)
    lab2, _ = ndi.label(opened)
    ids2 = np.unique(lab2[seeds & opened]); ids2 = ids2[ids2 > 0]
    before = bgm.copy()
    bgm &= ndi.binary_dilation(np.isin(lab2, ids2), structure=disk, iterations=1)
    force_bg = np.zeros_like(bgm)
    # enclosed pockets (between arms and body, under a raised arm...) are background when they
    # carry the frame's grid lines; skin and blouse shadows never do
    # enclosed pockets of background (inside an arm loop...) are given by hand as seed points:
    # the mockups' blouse tones are too close to the grid colour to find them automatically
    if pockets:
        plab, _ = ndi.label(cand)
        for (px, py) in pockets:
            if plab[py, px]:
                force_bg |= plab == plab[py, px]
    if legs:
        fys = np.where((~before).any(1))[0]
        if len(fys):
            band = np.zeros_like(bgm); band[fys.min() + int((fys.max() - fys.min()) * 0.62):] = True
            lp = band & (dist(c, np.concatenate([src.beige, src.grid])) < t) & ~not_bg_hue(c)
            force_bg |= ndi.binary_opening(lp)
    bgm |= force_bg
    for _ in range(2):  # trim the soft halo around the silhouette
        edge = ndi.binary_dilation(bgm) & ~bgm
        bgm |= edge & bg_candidates(c, src, halo)[0]
    fg = ~bgm
    for (ex0, ey0, ex1, ey1) in erase:
        fg[ey0:ey1, ex0:ex1] = False
    if shadows:
        fg = remove_shadow(c, fg)
    lab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1)); big = sizes.max()
        fg = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep_frac * big])
    if fill_holes:
        fg = ndi.binary_fill_holes(fg) & ~force_bg
    fg = ndi.median_filter(fg.astype(np.uint8), size=3).astype(bool) | ndi.binary_erosion(fg)
    if keep:
        for (kx0, ky0, kx1, ky1) in keep:
            fg[ky0:ky1, kx0:kx1] |= ~before[ky0:ky1, kx0:kx1]
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = c; rgba[..., 3] = fg * 255
    return rgba


def remove_shadow(c, fg):
    ys = np.where(fg.any(1))[0]
    if not len(ys):
        return fg
    top, bot = ys.min(), ys.max()
    band = np.zeros_like(fg); band[bot - max(6, int((bot - top) * 0.10)):bot + 1] = True
    sat = c.max(-1) - c.min(-1); lum = c.mean(-1)
    return fg & ~(band & (sat < 30) & (lum > 80) & (lum < 165))


# ---------------------------------------------------------------- pixel snapping
def build_palette(images, k, seed=0):
    px = np.concatenate([im[..., :3][im[..., 3] > 0] for im in images]).astype(np.float32)
    rs = np.random.default_rng(seed)
    px = px[rs.choice(len(px), min(len(px), 120000), replace=False)]
    km = KMeans(k, n_init=4, random_state=seed).fit(px)
    return np.clip(km.cluster_centers_.round(), 0, 255).astype(np.int32)


def nearest(rgb, pal):
    return ((rgb[..., None, :].astype(np.int32) - pal[None, None]) ** 2).sum(-1).argmin(-1)


def pixelize(rgba, scale, pal):
    """Each target pixel takes the most common palette colour of the source pixels it covers
    (no blending, so edges stay crisp); dark outline colours get a small vote boost."""
    h, w = rgba.shape[:2]
    th, tw = max(1, round(h * scale)), max(1, round(w * scale))
    idx = nearest(rgba[..., :3], pal); a = rgba[..., 3] > 0
    if th >= h or tw >= w:     # upscaling: plain nearest-neighbour from the source pixel
        sy = (np.arange(th) * h / th).astype(int).clip(0, h - 1)
        sx = (np.arange(tw) * w / tw).astype(int).clip(0, w - 1)
        out = np.zeros((th, tw, 4), np.uint8)
        out[..., :3] = pal[idx[sy][:, sx]]; out[..., 3] = a[sy][:, sx] * 255
        return out
    ys = (np.arange(h) * th / h).astype(int).clip(0, th - 1)
    xs = (np.arange(w) * tw / w).astype(int).clip(0, tw - 1)
    cell = ys[:, None] * tw + xs[None, :]
    votes = np.zeros((th * tw, len(pal)), np.int32)
    np.add.at(votes, (cell[a], idx[a]), 1)
    cover = np.bincount(cell.ravel(), minlength=th * tw)
    boost = np.where(pal.mean(1) < 75, 1.35, 1.0)
    choice = (votes * boost[None]).argmax(1)
    alpha = (votes.sum(1) >= 0.5 * cover) & (cover > 0)
    out = np.zeros((th, tw, 4), np.uint8)
    out[..., :3] = pal[choice].reshape(th, tw, 3); out[..., 3] = (alpha * 255).reshape(th, tw)
    return out


def tidy(rgba, min_px=3):
    a = rgba[..., 3] > 0
    lab, n = ndi.label(a)
    if n > 1:
        sizes = ndi.sum(a, lab, range(1, n + 1))
        keepm = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_px])
        rgba = rgba.copy(); rgba[..., 3] = np.where(keepm, rgba[..., 3], 0)
    return rgba


def outline(rgba, amount=0.6):
    """Selective outline: silhouette-edge pixels become a darker shade of their own colour."""
    a = rgba[..., 3] > 0
    edge = a & ~ndi.binary_erosion(a, structure=[[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    out = rgba.copy(); rgb = out[..., :3].astype(np.float32)
    out[..., :3] = np.where(edge[..., None], np.minimum(rgb, rgb * amount + 12), rgb).astype(np.uint8)
    return out


def bbox(rgba):
    ys, xs = np.where(rgba[..., 3] > 0)
    return xs.min(), ys.min(), xs.max(), ys.max()


def hip_x(rgba, lo=0.50, hi=0.60):
    x0, y0, x1, y1 = bbox(rgba); h = y1 - y0 + 1
    band = rgba[y0 + int(h * lo):y0 + int(h * hi), :, 3] > 0
    xs = np.where(band)[1]
    return xs.mean() if len(xs) else (x0 + x1) / 2


def head_width(rgba, frac=0.18):
    """Width of the hair mass in the top part of the figure (used to match scale across poses)."""
    x0, y0, x1, y1 = bbox(rgba)
    h = y1 - y0 + 1
    band = rgba[y0:y0 + max(4, int(h * frac)), :, 3] > 0
    widths = [np.ptp(np.where(r)[0]) + 1 for r in band if r.any()]
    return float(np.percentile(widths, 90)) if widths else 0.0


def fit_icon(rgba, size, pal, do_outline=True):
    x0, y0, x1, y1 = bbox(rgba)
    crop = rgba[y0:y1 + 1, x0:x1 + 1]
    s = (size - 2) / max(crop.shape[:2])
    p = tidy(pixelize(crop, s, pal))
    if do_outline:
        p = outline(p)
    out = np.zeros((size, size, 4), np.uint8)
    oy = (size - p.shape[0]) // 2; ox = (size - p.shape[1]) // 2
    out[oy:oy + p.shape[0], ox:ox + p.shape[1]] = p
    return out


def peel_fringe(rgba, src, t=26, dark=40, rounds=14):
    """Remove leftover background pixels sitting outside the figure's dark outline.

    At full resolution a 1-2 px rim of mockup background or grid colour can survive the keying
    (most visibly as a beige cap on top of the hair). A boundary pixel is peeled when its colour is
    within `t` of the mockup's background/grid colours AND it has a clearly darker opaque pixel within 2 px,
    i.e. it lies outside an outline. Light parts of the figure itself (blouse, skin) are never
    peeled because they sit inside the outline."""
    from scipy import ndimage as ndi
    out = rgba.copy()
    bgc = np.concatenate([src.beige, src.grid]).astype(np.float32)
    rgb = out[..., :3].astype(np.float32)
    d = np.sqrt(((rgb[..., None, :] - bgc[None, None]) ** 2).sum(-1)).min(-1)
    lum = rgb.mean(-1)
    bg_like = d < t
    for _ in range(rounds):
        a = out[..., 3] > 0
        edge = a & ndi.binary_dilation(~a, structure=np.ones((3, 3), bool), border_value=1)
        # darkest opaque pixel within 2 px (the outline may sit one row further in)
        l = np.where(a, lum, 999.0)
        darkest = ndi.minimum_filter(l, size=5, mode="constant", cval=999.0)
        kill = edge & bg_like & (darkest < lum - dark)
        if not kill.any():
            break
        out[kill, 3] = 0
    # thin light lines (grid remnants 1-2 px wide) sticking out of the silhouette
    a = out[..., 3] > 0
    for _ in range(2):
        thin = a & ~ndi.binary_opening(a, structure=np.ones((3, 3), bool))
        kill = thin & (d < t + 14) & (lum > 120)
        if not kill.any():
            break
        a &= ~kill
    lab, n = ndi.label(a, structure=np.ones((3, 3), bool))
    if n > 1:
        sizes = ndi.sum(a, lab, range(1, n + 1))
        a &= np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= 12])
    out[~a, 3] = 0
    return out
