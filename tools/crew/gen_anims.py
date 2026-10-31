"""
Generate the animations the mockups don't contain, working on the rendered full-quality frames.

All functions take and return RGBA uint8 frames of identical size (192x240) with the feet on the
same baseline. `m` is the size multiplier over the 64x80 layout grid (3 for the shipped pack).
"""
import numpy as np
from scipy import ndimage as ndi


# ---------------------------------------------------------------- pixel classes
def _rgb(f):
    return f[..., :3].astype(np.int32)


def opaque(f):
    return f[..., 3] > 0


def is_jeans(f):
    c = _rgb(f); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return opaque(f) & (b > r + 6) & (b >= g - 4)


def is_skin(f):
    c = _rgb(f); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return opaque(f) & (r > 150) & (r - b > 18) & (r - b < 95) & (r >= g) & (g - b < 45) & (r - g < 70)


def figure_rows(f):
    ys = np.where(opaque(f).any(1))[0]
    return ys.min(), ys.max()


def belt_row(f):
    """Top row of the jeans (waist). None for poses without visible jeans at the waist."""
    top, bot = figure_rows(f)
    h = bot - top + 1
    jeans = is_jeans(f); op = opaque(f)
    for y in range(top + int(h * 0.35), top + int(h * 0.80)):
        n = op[y].sum()
        if n and jeans[y].sum() / n > 0.35 and jeans[y].sum() >= 3:
            return y
    return None


def hip_center(f, y0, y1):
    xs = np.where(opaque(f)[y0:y1])[1]
    return xs.mean() if len(xs) else f.shape[1] / 2


def drop_specks(f, min_px):
    a = opaque(f)
    lab, n = ndi.label(a, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndi.sum(a, lab, range(1, n + 1))
        big = np.argmax(sizes) + 1
        keep = [i + 1 for i, s in enumerate(sizes) if s >= min_px or i + 1 == big]
        f = f.copy(); f[~np.isin(lab, keep)] = 0
    return f


def shift(f, dx=0, dy=0):
    out = np.zeros_like(f)
    H, W = f.shape[:2]
    ys0, ys1 = max(0, -dy), min(H, H - dy)
    xs0, xs1 = max(0, -dx), min(W, W - dx)
    out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = f[ys0:ys1, xs0:xs1]
    return out


# ---------------------------------------------------------------- walk in-betweens
def passing_frame(upper_f, legs_f, m=1, with_shift=False):
    """Upper body (and its arms/hands) from a walking contact frame, legs from a standing frame.
    The standing legs are straighter, so the body rises by itself - the bob of a real walk."""
    yu, yl = belt_row(upper_f), belt_row(legs_f)
    if yu is None or yl is None:
        return (upper_f.copy(), 0, 0) if with_shift else upper_f.copy()
    dy = yl - yu
    dx = int(round(hip_center(legs_f, yl, yl + 3 * m) - hip_center(upper_f, yu, yu + 3 * m)))
    up = shift(upper_f, dx, dy)
    out = np.zeros_like(upper_f)
    top_l, bot_l = figure_rows(legs_f)
    feet_y = bot_l - int((bot_l - top_l) * 0.13)
    # legs: jeans everywhere below the belt + whatever is in the feet band (shoes)
    legs_mask = np.zeros(legs_f.shape[:2], bool)
    legs_mask[yl:] = is_jeans(legs_f)[yl:]
    legs_mask[feet_y:] |= opaque(legs_f)[feet_y:]
    legs_mask = ndi.binary_closing(legs_mask, iterations=1) & opaque(legs_f)
    out[legs_mask] = legs_f[legs_mask]
    # upper body above the belt
    out[:yl] = np.where(opaque(up)[:yl, :, None], up[:yl], out[:yl])
    # hands / sleeves of the moving arms that hang below the belt
    hands = opaque(up) & ~is_jeans(up)
    hands[:yl] = False; hands[feet_y:] = False
    hands = ndi.binary_opening(hands) | (hands & is_skin(up))
    # keep only what hangs from the upper body (drops e.g. a raised back shoe of the contact frame)
    upper = opaque(up).copy(); upper[yl:] = False
    lab, n = ndi.label(hands | upper, structure=np.ones((3, 3)))
    attached = np.unique(lab[upper]); attached = attached[attached > 0]
    hands &= np.isin(lab, attached)
    out[hands] = up[hands]
    out = drop_specks(out, 6 * m * m)
    return (out, dx, dy) if with_shift else out


def shear_legs(f, amount=0.75, m=1, facing=1):
    """Bring the feet of a contact frame towards each other (side view passing pose).
    Each row below the point where the legs separate is split at its widest gap; the back leg moves
    forward and the front leg back, by an amount growing from 0 at the split to `amount` of the
    stride at the feet, so the legs stay continuous."""
    yb = belt_row(f)
    if yb is None:
        return f.copy()
    top, bot = figure_rows(f)
    y0 = yb + 3 * m
    op = opaque(f)
    legs = np.zeros(f.shape[:2], bool)
    legs[y0:] = op[y0:]
    knee = y0 + int((bot - y0) * 0.4)
    hand = is_skin(f); hand[knee:] = False           # hands hanging by the thighs stay put
    legs &= ~hand
    rows = {}
    for y in range(y0, bot + 1):
        xs = np.where(legs[y])[0]
        if len(xs) == 0:
            continue
        gaps = np.diff(xs)
        k = int(np.argmax(gaps)) if len(gaps) else 0
        if len(gaps) and gaps[k] > 2 * m:
            rows[y] = xs[k] + 1                    # split column (first pixel of the right leg)
    if not rows:
        return f.copy()
    ysep = min(rows)
    feet = np.where(legs[bot - 2 * m:bot + 1])[1]
    spread = feet.max() - feet.min() if len(feet) else 0
    dmax = spread * amount / 2
    out = f.copy()
    out[ysep:][legs[ysep:]] = 0
    for y in range(ysep, bot + 1):
        xs = np.where(legs[y])[0]
        if len(xs) == 0:
            continue
        t = (y - ysep) / max(1, bot - ysep)
        d = dmax * t
        split = rows.get(y)
        if split is None:                           # legs overlap on this row: leave it
            out[y, xs] = f[y, xs]
            continue
        left, right = xs[xs < split], xs[xs >= split]
        # facing east: the left leg is the back one and moves right (forward), the right leg moves left
        for part, sign in ((left, facing), (right, -facing)):
            dd = int(round(sign * d))
            dst = np.clip(part + dd, 0, f.shape[1] - 1)
            put = out[y, dst, 3] < f[y, part, 3]       # don't overwrite a more solid pixel
            out[y, dst[put]] = f[y, part[put]]
    return drop_specks(out, 4 * m * m)


def _rotate_layer(layer, angle_deg, pivot):
    """Rotate an RGBA layer about pivot (x, y) with premultiplied bilinear sampling."""
    h, w = layer.shape[:2]
    a = layer[..., 3:4].astype(np.float32) / 255.0
    pre = np.concatenate([layer[..., :3].astype(np.float32) * a, a * 255.0], -1)
    th = np.deg2rad(angle_deg)
    c, s_ = np.cos(th), np.sin(th)
    px, py = pivot
    # output (y, x) -> input: rotate back by -angle around the pivot
    mat = np.array([[c, s_], [-s_, c]])        # acts on (y, x)
    off = np.array([py, px]) - mat @ np.array([py, px])
    out = np.zeros_like(pre)
    for ch in range(4):
        out[..., ch] = ndi.affine_transform(pre[..., ch], mat, offset=off, order=1, mode="constant", cval=0)
    al = out[..., 3:4] / 255.0
    rgb = np.where(al > 1e-3, out[..., :3] / np.maximum(al, 1e-3), 0)
    res = np.zeros_like(layer)
    res[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    res[..., 3] = np.clip(out[..., 3], 0, 255).astype(np.uint8)
    res[res[..., 3] < 8] = 0
    return res


def _over_layer(dst, src):
    a = src[..., 3:4].astype(np.float32) / 255.0
    da = dst[..., 3:4].astype(np.float32) / 255.0
    oa = a + da * (1 - a)
    rgb = (src[..., :3] * a + dst[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6)
    out = np.zeros_like(dst)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(oa[..., 0] * 255, 0, 255).astype(np.uint8)
    return out


def _bend_layer(layer, angle_deg, pivot, y_start, ramp):
    """Rotate a leg about the hip, easing the rotation in over `ramp` rows below y_start so the
    top of the thigh stays attached to the hips (no gap opens at the joint)."""
    h, w = layer.shape[:2]
    a = layer[..., 3:4].astype(np.float32) / 255.0
    pre = np.concatenate([layer[..., :3].astype(np.float32) * a, a * 255.0], -1)
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip((Y - y_start) / max(1.0, ramp), 0, 1)
    wgt = t * t * (3 - 2 * t)
    th = np.deg2rad(angle_deg) * wgt
    px, py = pivot
    dx, dy = X - px, Y - py
    c, s_ = np.cos(-th), np.sin(-th)                     # inverse rotation for backward sampling
    sx = px + c * dx - s_ * dy
    sy = py + s_ * dx + c * dy
    out = np.stack([ndi.map_coordinates(pre[..., ch], [sy, sx], order=1, mode="constant", cval=0)
                    for ch in range(4)], -1)
    al = out[..., 3:4] / 255.0
    rgb = np.where(al > 1e-3, out[..., :3] / np.maximum(al, 1e-3), 0)
    res = np.zeros_like(layer)
    res[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    res[..., 3] = np.clip(out[..., 3], 0, 255).astype(np.uint8)
    res[res[..., 3] < 8] = 0
    return res


def swing_legs(f, amount=0.8, m=1, facing=1, base=None):
    """Side-view passing pose from a contact frame: each leg swings about the hip so the feet come
    together under the body. The rotation eases in down the thigh, so the leg keeps its drawn
    shape and stays attached at the hip. The whole figure is then moved so the lower foot stands
    on the same ground row - which gives the walk its natural rise in the passing pose."""
    yb = belt_row(f)
    if yb is None:
        return f.copy()
    top, bot = figure_rows(f)
    if base is None:
        base = bot
    y0 = yb + 3 * m
    op = opaque(f)
    legs = np.zeros(f.shape[:2], bool); legs[y0:] = op[y0:]
    knee = y0 + int((bot - y0) * 0.4)
    hand = is_skin(f); hand[knee:] = False
    legs &= ~hand
    # split column per row where the legs are apart, fitted with a line
    ys, xs_split = [], []
    for y in range(y0, bot + 1):
        xs = np.where(legs[y])[0]
        if len(xs) < 2:
            continue
        gaps = np.diff(xs); k = int(np.argmax(gaps))
        if gaps[k] > 2 * m:
            ys.append(y); xs_split.append((xs[k] + xs[k + 1]) / 2)
    if len(ys) < 4:
        return f.copy()
    ysep = min(ys)
    A = np.polyfit(ys, xs_split, 1)
    split = lambda y: np.polyval(A, y)
    Y, X = np.mgrid[0:f.shape[0], 0:f.shape[1]]
    region = legs & (Y >= ysep)
    back = region & (X < split(Y))
    front = region & (X >= split(Y))
    if facing < 0:
        back, front = front, back
    pivot = (float(split(ysep)), float(ysep - 2 * m))
    body = f.copy(); body[region] = 0
    layers = []
    for mask in (back, front):
        lay = np.zeros_like(f); lay[mask] = f[mask]
        yy, xx = np.where(mask)
        fb = yy >= yy.max() - 6 * m                     # the foot
        fx, fy = xx[fb].mean(), yy[fb].mean()
        vx, vy = fx - pivot[0], fy - pivot[1]
        tx = vx * (1 - amount)                          # target horizontal offset from the hip
        ang = np.degrees(np.arctan2(vx, vy) - np.arctan2(tx, vy))   # forward rotation that moves the foot to tx
        layers.append((lay, ang))
    ramp = (bot - ysep) * 0.45
    layers = [_bend_layer(lay, ang, pivot, ysep, ramp) for lay, ang in layers]
    out = np.zeros_like(f)
    out = _over_layer(out, layers[0])                  # back leg
    out = _over_layer(out, layers[1])                  # front leg
    out = _over_layer(out, body)                       # hips, hands and everything above
    nb = figure_rows(out)[1]
    out = shift(out, 0, base - nb)
    return drop_specks(out, 4 * m * m)


def raise_upper(f, px=1):
    """Lift everything above the belt by `px` (rows duplicated at the waist): the up-beat of a bob."""
    yb = belt_row(f)
    if yb is None:
        return shift(f, 0, -px)
    out = f.copy()
    out[:yb - px] = f[px:yb]
    out[yb - px:yb] = f[yb - 1:yb][[0] * px] if px else out[yb - px:yb]
    return out


# ---------------------------------------------------------------- idle details
def breathe(f, m=1, px=None):
    """Shoulders and head drop a little (rows above the chest line move down)."""
    px = px or max(1, int(round(m * 2 / 3)))
    top, bot = figure_rows(f)
    yb = belt_row(f)
    chest = (top + yb) // 2 if yb is not None else top + int((bot - top) * 0.45)
    out = f.copy()
    out[top + px:chest + 1] = f[top:chest + 1 - px]
    out[top:top + px] = 0
    return out


EYE_WINDOW = (9, 15)    # rows below the hair top (64px set) where the eyes can be


def is_face_skin(f):
    """Pinkish skin only (golden hair highlights excluded)."""
    c = _rgb(f); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return opaque(f) & (r > 170) & (r >= g) & (r - g < 45) & (g >= b - 6) & (g - b < 32)


def find_eyes(f, m=1, top=None):
    """Return (eye masks, face skin) - dark pixels with face skin on both sides and just below."""
    if top is None:
        top, bot = figure_rows(f)
    skin = is_face_skin(f)
    c = _rgb(f); lum = c.mean(-1)
    dark = opaque(f) & ~skin & (lum < 150)
    H, W = skin.shape

    def near(mask, dx, dy, reach):
        acc = np.zeros_like(mask)
        for d in range(1, reach + 1):
            acc |= np.roll(np.roll(mask, d * dy, 0), d * dx, 1)
        return acc
    cand = dark & near(skin, 1, 0, 3 * m) & near(skin, -1, 0, 3 * m) & near(skin, 0, -1, 2 * m)
    band = np.zeros_like(cand); band[top + EYE_WINDOW[0] * m:top + EYE_WINDOW[1] * m + 1] = True
    cand &= band
    elab, en = ndi.label(cand, structure=np.ones((3, 3)))
    eyes = [elab == i for i in range(1, en + 1)]
    eyes = [e for e in eyes if 1 <= e.sum() <= 12 * m * m and np.ptp(np.where(e)[0]) <= 2 * m]
    if not eyes:
        return [], skin
    # the eyes are the lowest dark marks in the window that sit side by side (brows are above)
    eyes.sort(key=lambda e: -np.where(e)[0].mean())
    lowest = np.where(eyes[0])[0].mean()
    eyes = [e for e in eyes if abs(np.where(e)[0].mean() - lowest) <= 1.5 * m]
    eyes.sort(key=lambda e: -e.sum())
    return eyes[:2], skin


def blink_rects(f, rects, m=1, dx=0, dy=0):
    """Close the eyes inside hand-measured rectangles (HD coordinates, inclusive)."""
    out = f.copy()
    c = _rgb(f)
    skin = is_face_skin(f)
    k = m / 2.0                      # rects are measured on the 2x set
    for (x0, y0, x1, y1) in rects:
        x0, y0 = int(np.floor(x0 * k)), int(np.floor(y0 * k))
        x1, y1 = int(np.ceil((x1 + 1) * k)) - 1, int(np.ceil((y1 + 1) * k)) - 1
        x0 += dx; x1 += dx; y0 += dy; y1 += dy
        box = np.zeros(skin.shape, bool); box[y0:y1 + 1, x0:x1 + 1] = True
        around = ndi.binary_dilation(box, iterations=2 * m) & skin
        if not around.any():
            continue
        skin_col = np.median(c[around], axis=0).astype(np.uint8)
        region = box & opaque(f) & ~skin
        if not region.any():
            continue
        lash = c[region][np.argmin(c[region].sum(1))]
        lash = np.clip(lash * 0.9, 0, 255).astype(np.uint8)
        cols = np.where(region.any(0))[0]
        out[region, :3] = skin_col
        t = max(1, int(round(m / 2)))     # lash thickness
        ly = y1 - (1 if m >= 2 else 0)
        for x in cols:
            out[ly - t + 1:ly + 1, x, :3] = lash; out[ly - t + 1:ly + 1, x, 3] = 255
        if m >= 2 and len(cols) > 2:          # a slight downward curve at the outer ends
            for x in (cols[0], cols[-1]):
                out[ly - t:ly, x, :3] = lash
    return out


def blink(f, m=1, top=None):
    """Closed eyes: the eye becomes skin with a dark lash line along its lower edge."""
    res = find_eyes(f, m, top)
    if not res or not res[0]:
        return f.copy()
    eyes, fm = res
    out = f.copy()
    c = _rgb(f)
    near_eyes = ndi.binary_dilation(np.any(eyes, axis=0), iterations=3 * m) & fm
    skin_med = np.median(c[near_eyes] if near_eyes.any() else c[fm], axis=0)
    for e in eyes:
        ys, xs = np.where(e)
        lash = c[e][np.argmin(c[e].sum(1))]
        if ys.max() == ys.min():                      # 1px-tall eye (64px set): fade it to a soft lid
            out[e, :3] = np.clip(skin_med * 0.80, 0, 255).astype(np.uint8)
            continue
        for x in np.unique(xs):
            col = np.where(e[:, x])[0]
            out[col, x, :3] = skin_med.astype(np.uint8)
            out[col.max(), x, :3] = lash.astype(np.uint8)
    return out


# ---------------------------------------------------------------- misc motion
def hop(f, offsets, m=1):
    return [shift(f, 0, -o * m) for o in offsets]


def jitter(f, offsets, m=1):
    return [shift(f, o * m, 0) for o in offsets]


# ---------------------------------------------------------------- reading details
PAGE = (238, 230, 214)
PAGE_EDGE = (120, 92, 72)


def page_turn(f, hinge_hd, length_hd=10, m=1, angles=(35, 90, 145)):
    """Frames of a page lifting from the right half of the open book and laying down on the left.
    hinge_hd: (x, y) of the book's spine top in HD frame coordinates."""
    k = m / 2.0
    hx, hy = int(round(hinge_hd[0] * k)), int(round(hinge_hd[1] * k))
    L = max(3, int(round(length_hd * k)))
    frames = []
    for a in angles:
        out = f.copy()
        ang = np.deg2rad(a)
        pts = []
        for t in np.linspace(0, 1, L * 3):
            x = hx + np.cos(ang) * L * t
            y = hy - np.sin(ang) * L * t * 0.75
            pts.append((int(round(x)), int(round(y))))
        pts = list(dict.fromkeys(pts))
        thick = max(1, int(round(m * 2 / 3)))
        mask = np.zeros(f.shape[:2], bool)
        for (x, y) in pts:
            for k in range(thick):
                yy = y - k
                if 0 <= yy < f.shape[0] and 0 <= x < f.shape[1]:
                    mask[yy, x] = True
        outline_m = ndi.binary_dilation(mask) & ~mask
        out[outline_m & ~opaque(f), :3] = PAGE_EDGE
        out[outline_m & ~opaque(f), 3] = 255
        out[mask, :3] = PAGE; out[mask, 3] = 255
        frames.append(out)
    return frames


# ------------------------------------------------------------------ full-quality blink and page turn
# These work on the full-resolution frames: shapes are drawn 4x supersampled and blended in, so
# the result is as smooth as the mockup art around it (no hard pixel bars).
from PIL import Image as _Image, ImageDraw as _Draw


def _aa_mask(shape, draw_fn, ss=4):
    h, w = shape
    im = _Image.new("L", (w * ss, h * ss), 0)
    draw_fn(_Draw.Draw(im), ss)
    return np.asarray(im.resize((w, h), _Image.BOX), np.float32) / 255.0


def _paint(out, cov, col):
    """Composite a solid colour with per-pixel coverage `cov` over an RGBA frame (in place)."""
    a = np.clip(cov, 0, 1)[..., None]
    da = out[..., 3:4].astype(np.float32) / 255.0
    oa = a + da * (1 - a)
    rgb = out[..., :3].astype(np.float32)
    col = np.asarray(col, np.float32)[None, None]
    new = np.where(oa > 0, (col * a + rgb * da * (1 - a)) / np.maximum(oa, 1e-6), rgb)
    sel = cov > 0.003
    out[sel, :3] = np.clip(new[sel], 0, 255).astype(np.uint8)
    out[sel, 3] = np.clip(oa[sel, 0] * 255, 0, 255).astype(np.uint8)


def blink_eyes(f, eyes, dx=0, dy=0, lid_below=None):
    """Closed eyes. `eyes`: (x0, y0, x1, y1) inclusive boxes, in this frame's own pixels, that cover
    each eye from the upper lash to the bottom of the iris. The eye is covered by its lid (skin
    sampled just under the eye, lightly shaded) and a soft, downward-curved lash line is drawn."""
    out = f.copy()
    c = _rgb(f).astype(np.float32)
    h, w = f.shape[:2]
    for (x0, y0, x1, y1) in eyes:
        x0 += dx; x1 += dx; y0 += dy; y1 += dy
        ew, eh = x1 - x0 + 1, y1 - y0 + 1
        # lid colour: the skin in a ring around the eye
        inner = np.zeros((h, w), bool); inner[y0:y1 + 1, x0:x1 + 1] = True
        if lid_below:            # glasses: sample the cheek below the frame, not the lens
            ring = np.zeros((h, w), bool)
            ring[y1 + lid_below[0]:y1 + lid_below[1] + 1, x0:x1 + 1] = True
        else:
            ring = ndi.binary_dilation(inner, iterations=3) & ~inner
        # skin: warm and not too dark (works for light and brown skin; hair and outlines drop out)
        ring &= (f[..., 3] > 200) & (c.mean(-1) > 85) & (c[..., 0] > c[..., 2] + 20) & (c[..., 0] >= c[..., 1]) & (c[..., 1] - c[..., 2] < 42)
        if not ring.any():
            continue
        skin = np.median(c[ring], 0)
        lid = skin * 0.96
        crease = skin * 0.86
        # lash colour: the darkest pixels of the open eye
        box = c[y0:y1 + 1, x0:x1 + 1].reshape(-1, 3)
        dark = box[np.argsort(box.sum(1))[:max(3, len(box) // 8)]]
        lash = np.median(dark, 0) * 0.9
        # 1) lid over the whole eye
        cov = _aa_mask((h, w), lambda d, s: d.rounded_rectangle(
            [(x0 - 0.6) * s, (y0 - 0.4) * s, (x1 + 1.6) * s, (y1 + 1.4) * s], radius=eh * 0.5 * s, fill=255))
        _paint(out, cov * (f[..., 3] > 0), lid)
        # 2) a faint crease just above the lash line
        base = y0 + eh * 0.42
        sag = max(1.0, eh * 0.24)

        def curve(t, off):
            return [((x0 + t_ * ew) , base + off + sag * np.sin(np.pi * t_)) for t_ in t]

        ts = np.linspace(0, 1, 24)
        cov = _aa_mask((h, w), lambda d, s: d.line([(x * s, y * s) for x, y in curve(ts, -1.3)],
                                                   fill=255, width=max(1, int(1.0 * s)), joint="curve"))
        _paint(out, cov * 0.35, crease)
        # 3) lash: thicker in the middle, tapering at the corners, with a small outer flick
        up = [(x, y - 0.55 - 0.45 * np.sin(np.pi * t)) for (x, y), t in zip(curve(ts, 0), ts)]
        dn = [(x, y + 0.55 + 0.45 * np.sin(np.pi * t)) for (x, y), t in zip(curve(ts, 0), ts)]
        poly = up + dn[::-1]
        cov = _aa_mask((h, w), lambda d, s: d.polygon([(x * s, y * s) for x, y in poly], fill=255))
        _paint(out, cov, lash)
    return out


PAGE_HQ, PAGE_EDGE_HQ = (240, 230, 222), (92, 64, 56)


def page_turn_hq(f, hinge, length, angles=(-52, -90, -128), curl=0.2):
    """A page lifting off the right half of the open book and laying down on the left.
    hinge: (x, y) of the spine in this frame's pixels; angles in screen degrees (0 = right,
    -90 = straight up). The page is drawn as a thin curved sheet, supersampled."""
    hx, hy = hinge
    frames = []
    for a in angles:
        out = f.copy()
        r = np.deg2rad(a)
        ex, ey = hx + np.cos(r) * length, hy + np.sin(r) * length
        # the free end lags behind the turn: bend the sheet back toward where it came from
        nx, ny = np.sin(r), -np.cos(r)          # perpendicular, pointing back toward the right page
        cx, cy = (hx + ex) / 2 + nx * curl * length, (hy + ey) / 2 + ny * curl * length
        ts = np.linspace(0, 1, 30)
        pts = [((1 - t) ** 2 * hx + 2 * (1 - t) * t * cx + t * t * ex,
                (1 - t) ** 2 * hy + 2 * (1 - t) * t * cy + t * t * ey) for t in ts]
        # sheet thickness: widest in the middle (we see a sliver of the page face)
        half = [0.6 + 0.8 * np.sin(np.pi * t) for t in ts]
        def sheet(extra):
            left, right = [], []
            for i, ((x, y), hw) in enumerate(zip(pts, half)):
                j0, j1 = max(0, i - 1), min(len(pts) - 1, i + 1)
                tx, ty = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
                n = np.hypot(tx, ty) or 1
                px_, py_ = -ty / n, tx / n
                left.append((x + px_ * (hw + extra), y + py_ * (hw + extra)))
                right.append((x - px_ * (hw + extra), y - py_ * (hw + extra)))
            return left + right[::-1]
        edge = sheet(0.8)
        cov = _aa_mask(f.shape[:2], lambda d, s: d.polygon([(x * s, y * s) for x, y in edge], fill=255))
        _paint(out, cov, PAGE_EDGE_HQ)
        face = sheet(0.0)
        cov = _aa_mask(f.shape[:2], lambda d, s: d.polygon([(x * s, y * s) for x, y in face], fill=255))
        _paint(out, cov, PAGE_HQ)
        frames.append(out)
    return frames
