"""Cutting for the Joel/Jonas mockups: roxy_cut's keying, with a floor-shadow rule suited to their
light sneakers (the lilac shadow is removed only where it touches the background, so grey shoe
parts inside the outline are never mistaken for shadow)."""
import numpy as np
from scipy import ndimage as ndi
import roxy_cut as rc


def load_source(path, boxes, strict=False):
    """rc.Source with background colours sampled from the cells, minus any dark cluster that
    really comes from figure shading (it would eat into the grey t-shirts).

    strict=True (sheets where clothing matches the grid colour, like the bassist's cream socks):
    bright grid colour only counts on real grid lines, every cut is checked against a per-cell
    background model, and only lilac pixels count as floor shadow."""
    src = rc.Source(path, boxes)
    src.strict = strict
    lum = src.beige.mean(1)
    src.beige = src.beige[lum >= lum.max() - 12]
    # hue window of the real background, from the cells' side bands
    px = []
    for (x0, y0, x1, y1) in boxes.values():
        c = src.img[y0 + 4:y1 - 3, x0 + 4:x1 - 3]
        px += [c[:, :3].reshape(-1, 3), c[:, -3:].reshape(-1, 3)]
    px = np.concatenate(px).astype(int)
    l = px.mean(1); sat = px.max(1) - px.min(1)
    px = px[(l > 120) & (l < 200) & (sat < 45)]          # ignore coloured cards (flags...)
    rg, gb = px[:, 0] - px[:, 1], px[:, 1] - px[:, 2]
    src.rg = (np.percentile(rg, 5) - 2, np.percentile(rg, 95) + 2)
    src.gb = (np.percentile(gb, 5) - 2, np.percentile(gb, 95) + 3)
    return src


def _split_grid(src):
    """Dim grid colours behave like the background; bright ones (the grid lines) only count where
    they actually form a line, so light clothing of the same colour (cream socks...) is kept."""
    if not hasattr(src, "_bright"):
        top = src.beige.mean(1).max() + 20
        lum = src.grid.mean(1)
        src._dim = np.concatenate([src.beige, src.grid[lum <= top]])
        src._bright = src.grid[lum > top]
    return src._dim, src._bright


def bg_cand(c, src, t, loose=0, gb_up=None):
    """Background or grid colour: close to the sampled colours AND inside the background's hue
    window. The hue window keeps the t-shirts' warm shading and skin out of the background.
    `loose` widens the window for the rim pixels next to known background (the soft halo where
    the mockup blends the figure into the backdrop)."""
    c = c.astype(int)
    if getattr(src, "strict", False):
        dim, bright = _split_grid(src)
    else:
        dim, bright = np.concatenate([src.beige, src.grid]), np.zeros((0, 3), int)
    rg, gb = c[..., 0] - c[..., 1], c[..., 1] - c[..., 2]
    gb_up = loose // 2 if gb_up is None else gb_up
    hue = ((rg >= src.rg[0] - loose // 2) & (rg <= src.rg[1] + loose)
           & (gb >= src.gb[0] - loose) & (gb <= src.gb[1] + gb_up))
    near_dim = (rc.dist(c, dim) < t) & hue
    if not len(bright):
        return near_dim
    near_bright = (rc.dist(c, bright) < t) & hue
    anybg = near_dim | near_bright
    rows = near_bright.sum(1) / np.maximum(anybg.sum(1), 1) > 0.40
    cols = near_bright.sum(0) / np.maximum(anybg.sum(0), 1) > 0.40
    rows = ndi.binary_dilation(rows, iterations=1)
    cols = ndi.binary_dilation(cols, iterations=1)
    online = rows[:, None] | cols[None, :]
    return near_dim | (near_bright & online)


def background_model(c, src, line_frac=0.30):
    """Distance of every pixel to the background expected AT THAT SPOT: the cell's flat backdrop
    colour, or the grid-line colour on the cell's actual grid rows and columns. Light clothing
    that happens to match the grid colour (cream socks) is only 'background' where a grid line
    really runs, so the flood fill can't swallow it."""
    ci = c.astype(int)
    dim, bright = _split_grid(src)
    d_dim = rc.dist(ci, dim)
    flat = ci[d_dim < 16]
    back = np.median(flat, 0) if len(flat) > 50 else dim.mean(0)
    d_back = np.sqrt(((ci - back) ** 2).sum(-1))
    if not len(bright):
        return d_back, back
    near_line = rc.dist(ci, bright) < 22
    H, W = near_line.shape
    def lines(score):
        idx = np.where(score > line_frac)[0]
        keep = np.zeros(len(score), bool)
        keep[idx] = True
        return ndi.binary_dilation(keep, iterations=1)   # anti-aliased lines are ~2 px wide
    rows, cols = lines(near_line.mean(1)), lines(near_line.mean(0))
    on = rows[:, None] | cols[None, :]
    lc = ci[near_line & on]
    line_col = np.median(lc, 0) if len(lc) > 20 else bright.mean(0)
    d_line = np.sqrt(((ci - line_col) ** 2).sum(-1))
    # pixels on a line may show the line, the backdrop or a blend of the two
    mid = (back + line_col) / 2
    d_mid = np.sqrt(((ci - mid) ** 2).sum(-1))
    # a grid line is thin: a line-coloured pixel only counts as background when backdrop shows
    # within 3 px across the line. Where a line crosses light clothing (cream socks), the pixels
    # beside it are clothing, so the line can't carry the background into the figure.
    bk = d_back < 22
    def near(mask, axis):
        acc = np.zeros_like(mask)
        for d in (1, 2, 3):
            acc |= np.roll(mask, d, axis) | np.roll(mask, -d, axis)
        return acc
    line_ok = (cols[None, :] & near(bk, 1)) | (rows[:, None] & near(bk, 0))
    d_on = np.minimum(np.minimum(d_back, d_line), d_mid)
    return np.where(on & line_ok, d_on, d_back), back


def cut(src, box, inset=3, t=18, halo=26, label_rows=0, keep_frac=0.15, erase=(), keep=None,
        seed_bottom=True, shadow=True, fill_holes=True, pockets=(), halo_loose=6, halo_passes=3,
        marks=(), gb_up=0, model_t=28, center_only=False):
    x0, y0, x1, y1 = box
    c = src.img[y0 + inset:y1 - inset + 1, x0 + inset:x1 - inset + 1].copy()
    H, W = c.shape[:2]
    strict = getattr(src, "strict", False)
    if strict:
        d_model, back = background_model(c, src)
        back_lum = float(np.mean(back))
    else:
        d_model = np.zeros(c.shape[:2]); back_lum = 164.0; model_t = 1e9
    cand = bg_cand(c, src, t) & (d_model < model_t)
    sat = c.max(-1) - c.min(-1); lum = c.mean(-1)
    ci = c.astype(int); rg_, gb_ = ci[..., 0] - ci[..., 1], ci[..., 1] - ci[..., 2]
    if label_rows:
        # frame labels ("1: Start"...): white letters, their anti-aliasing and dark drop shadow
        # all become background, even where a letter touches the top of the head; the cap
        # (olive) and hair (gold) are saturated or green-leaning and are kept
        rows = np.arange(H)[:, None] < label_rows
        white = rows & (lum > 185) & (sat < 45)
        near = rows & ndi.binary_dilation(white, iterations=2)
        cand |= white | (near & (sat < 42) & (ci[..., 1] < ci[..., 0] - 3))
    if shadow:
        # lilac floor shadow and its soft rim (between background and lilac): bottom quarter,
        # low saturation, mid luminance, never warmer than the background
        band = np.zeros_like(cand); band[int(H * 0.72):] = True
        # (a floor shadow is never brighter than the backdrop: that keeps light socks and shoes)
        # The shadow is lilac (blue close to green); its soft rim blends into the backdrop.
        if strict:
            shade = ((sat < 36) & (lum > 95) & (lum < back_lum + 8) & (rg_ <= src.rg[1] + 4)
                     & ((gb_ <= 8) | (d_model < model_t + 6)))
        else:
            shade = (sat < 36) & (lum > 95) & (lum < 172) & (gb_ <= src.gb[1]) & (rg_ <= src.rg[1] + 4)
        cand |= band & shade
    seeds = np.zeros_like(cand); seeds[0, :] = True
    if seed_bottom:
        seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
    else:
        seeds[:int(H * 0.55), 0] = seeds[:int(H * 0.55), -1] = True
    lab, _ = ndi.label(cand)
    ids = np.unique(lab[seeds & cand]); ids = ids[ids > 0]
    bgm = np.isin(lab, ids)
    disk = ndi.iterate_structure(ndi.generate_binary_structure(2, 1), 2)
    opened = ndi.binary_opening(bgm, structure=disk)
    lab2, _ = ndi.label(opened)
    ids2 = np.unique(lab2[seeds & opened]); ids2 = ids2[ids2 > 0]
    before = bgm.copy()
    bgm &= ndi.binary_dilation(np.isin(lab2, ids2), structure=disk, iterations=1)
    force_bg = np.zeros_like(bgm)
    if pockets:
        plab, _ = ndi.label(cand)
        for (px, py) in pockets:
            if plab[py, px]:
                force_bg |= plab == plab[py, px]
    bgm |= force_bg
    rim = bg_cand(c, src, halo + 6, loose=halo_loose, gb_up=gb_up) & (d_model < model_t + 14)
    for _ in range(halo_passes):
        edge = ndi.binary_dilation(bgm) & ~bgm
        bgm |= edge & rim
    fg = ~bgm
    for (ex0, ey0, ex1, ey1) in erase:
        fg[ey0:ey1, ex0:ex1] = False
    # emote marks (sweat drops, anger ticks, motion squiggles) that sit against the hair: erase
    # inside the rectangle but keep golden hair pixels
    hairlike = (ci[..., 1] - ci[..., 2] > 45) & (ci[..., 0] > 120)
    for (ex0, ey0, ex1, ey1) in marks:
        sub = fg[ey0:ey1, ex0:ex1]
        sub &= hairlike[ey0:ey1, ex0:ex1]
    lab, n = ndi.label(fg)
    if n and center_only:
        # several figures in one box (a walk strip): keep the big piece nearest the box centre
        sizes = ndi.sum(fg, lab, range(1, n + 1)); big = sizes.max()
        cands = [i + 1 for i, s in enumerate(sizes) if s >= 0.25 * big]
        coms = ndi.center_of_mass(fg, lab, cands)
        best = min(zip(cands, coms), key=lambda t: abs(t[1][1] - W / 2))[0]
        keepm = lab == best
        near = ndi.binary_dilation(keepm, iterations=2)
        smalls = [i + 1 for i, s in enumerate(sizes) if s < 0.25 * big]
        fg = keepm | (np.isin(lab, smalls) & near)
    elif n:
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
    return peel(rgba, src, loose=halo_loose, gb_up=gb_up, d_model=d_model if strict else None,
                model_t=model_t)


def peel(rgba, src, t=28, dark=36, rounds=14, loose=6, gb_up=0, d_model=None, model_t=28):
    """roxy_cut.peel_fringe with the hue-gated background test: removes the leftover rim of
    background outside the outline without touching light skin or white sneakers."""
    out = rgba.copy()
    rgb = out[..., :3].astype(np.int32)
    lum = rgb.mean(-1)
    bg_like = bg_cand(rgb, src, t, loose=loose, gb_up=gb_up)
    if d_model is not None:
        bg_like &= d_model < model_t + 10
    for _ in range(rounds):
        a = out[..., 3] > 0
        edge = a & ndi.binary_dilation(~a, structure=np.ones((3, 3), bool), border_value=1)
        l = np.where(a, lum, 999.0)
        darkest = ndi.minimum_filter(l, size=5, mode="constant", cval=999.0)
        kill = edge & bg_like & (darkest < lum - dark)
        if not kill.any():
            break
        out[kill, 3] = 0
    a = out[..., 3] > 0
    for _ in range(2):
        thin = a & ~ndi.binary_opening(a, structure=np.ones((3, 3), bool))
        kill = thin & bg_cand(rgb, src, t + 14) & (lum > 120)
        if d_model is not None:
            kill &= d_model < model_t + 14
        if not kill.any():
            break
        a &= ~kill
    lab, n = ndi.label(a, structure=np.ones((3, 3), bool))
    if n > 1:
        sizes = ndi.sum(a, lab, range(1, n + 1))
        a &= np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= 12])
    out[~a, 3] = 0
    return out
