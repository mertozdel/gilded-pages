"""
Cuts Roxy's wardrobe pictures from her tops mockup (model B-001, one row of poses per top):

    python scripts/cut-roxy-tops.py <roxy_sprites_v2>/source/roxy_mockup_d.png

Takes the front standing pose of each top, keys out the mockup's beige background, grid lines
and drop shadows, and writes public/assets/sprites/roxy/tops/<blouse id>.png: 128 x 160, Roxy
128 px tall with her feet on row 157 (the same proportions as her 192 x 240 game frames, so the
wardrobe shows every top at the same size). The Vermeer Blue row is cut off at the waist; its
legs come from the front walking loop below it (the same blouse), joined at the belt.
Needs Pillow and numpy.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "sprites" / "roxy" / "tops"
W, H = 128, 160
STAND = 128
FEET = 157

# The light frame borders of each pose in the mockup (x0, y0, x1, y1).
TOPS = {
    "standard-tshirt": (541, 17, 630, 157),
    "cream-peter-pan": (27, 202, 106, 328),
    "ivory-jabot": (27, 356, 106, 479),
    "dusty-rose-puff": (541, 356, 628, 479),
    "emerald-bow": (27, 510, 106, 656),
    "midnight-satin": (528, 510, 628, 656),
}
VERMEER_UPPER = (27, 689, 106, 779)
VERMEER_LEGS = (528, 689, 628, 779)
INSET = 3


def background(img: np.ndarray, boxes: list[tuple[int, int, int, int]]) -> np.ndarray:
    """The frames' beige and its lighter grid lines, sampled from the frames' empty side strips."""
    px = []
    for x0, y0, x1, y1 in boxes:
        px.append(img[y0 + INSET : y1 - INSET, x0 + INSET : x0 + INSET + 6].reshape(-1, 3))
        px.append(img[y0 + INSET : y1 - INSET, x1 - INSET - 6 : x1 - INSET].reshape(-1, 3))
    px = np.concatenate(px).astype(np.float32)
    px = px[(px.max(1) - px.min(1) < 40) & (px.mean(1) > 120) & (px[:, 0] >= px[:, 1]) & (px[:, 1] >= px[:, 2])]
    lum = px.mean(1)
    mid = np.median(lum)
    grid = px[lum > mid + 8]
    glum = grid.mean(1)
    return np.array([px[lum <= mid + 4].mean(0), grid[glum <= np.median(glum)].mean(0), grid[glum > np.median(glum)].mean(0)], dtype=np.float32)


def dist(c: np.ndarray, pal: np.ndarray) -> np.ndarray:
    return np.sqrt(((c[..., None, :] - pal[None, None]) ** 2).sum(-1)).min(-1)


def bg_like(c: np.ndarray, pal: np.ndarray, t: float) -> np.ndarray:
    # The background is a red-leaning grey (R > G > B): green or blue pixels never are.
    hue_ok = ~((c[..., 1] - c[..., 0] > 3) | (c[..., 2] - c[..., 0] > 3))
    return (dist(c, pal) < t) & hue_ok


def flood(cand: np.ndarray, seeds: np.ndarray) -> np.ndarray:
    """The candidate pixels 4-connected to a seed."""
    out = np.zeros_like(cand)
    q = deque(zip(*np.nonzero(seeds & cand)))
    for y, x in q:
        out[y, x] = True
    h, w = cand.shape
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    return out


def components(m: np.ndarray) -> list[np.ndarray]:
    left = m.copy()
    parts = []
    while left.any():
        y, x = np.argwhere(left)[0]
        seed = np.zeros_like(m)
        seed[y, x] = True
        part = flood(left, seed)
        parts.append(part)
        left &= ~part
    return parts


def dilate(m: np.ndarray) -> np.ndarray:
    out = m.copy()
    out[1:] |= m[:-1]
    out[:-1] |= m[1:]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def cut(img: np.ndarray, pal: np.ndarray, box: tuple[int, int, int, int], seed_bottom: bool = True) -> np.ndarray:
    """The pose inside `box` as RGBA with the background removed."""
    x0, y0, x1, y1 = box
    c = img[y0 + INSET : y1 - INSET + 1, x0 + INSET : x1 - INSET + 1].astype(np.float32)
    h, w = c.shape[:2]
    sat = c.max(-1) - c.min(-1)
    lum = c.mean(-1)
    cand = bg_like(c, pal, 26)
    # Drop shadows under the feet: a darker beige, still low in saturation.
    feet = np.zeros_like(cand)
    feet[int(h * 0.82) :] = True
    cand |= feet & (sat < 30) & (lum > 95) & (lum < 160)
    seeds = np.zeros_like(cand)
    seeds[0] = seeds[:, 0] = seeds[:, -1] = True
    if seed_bottom:
        seeds[-1] = True
    # Only background reached from the frame's edge: the cream blouses' shading is too close to
    # the grid colour to clear enclosed pockets automatically.
    bg = flood(cand, seeds)
    # Peel the soft rim the mockup leaves around her outline.
    for _ in range(2):
        rim = dilate(bg) & ~bg
        bg |= rim & bg_like(c, pal, 40)
    fg = ~bg
    # Keep her and nothing that floats free of her (grid specks, label pixels).
    parts = components(fg)
    if parts:
        big = max(p.sum() for p in parts)
        fg = np.zeros_like(fg)
        for p in parts:
            if p.sum() >= 0.1 * big:
                fg |= p
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., :3] = c
    rgba[..., 3] = fg * 255.0
    return rgba


def bbox(a: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(a[..., 3] > 0)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def belt_rows(a: np.ndarray) -> list[int]:
    """Rows that are mostly dark and unsaturated, like her belt (the bow's ultramarine is dark
    too, but saturated and narrow). Shaded hair can pass as well, so callers say where to look."""
    rgb, al = a[..., :3], a[..., 3] > 0
    dark = al & (rgb.mean(-1) < 90) & (rgb.max(-1) - rgb.min(-1) < 40)
    rows = [y for y in range(a.shape[0]) if al[y].sum() and dark[y].sum() >= 0.5 * al[y].sum()]
    if not rows:
        raise SystemExit("no belt found")
    return rows


def span(a: np.ndarray, ys: range) -> tuple[float, float]:
    """Her mean outer edges over some rows: at the belt, her hands and forearms either side."""
    edges = [np.nonzero(a[y, :, 3] > 0)[0] for y in ys]
    return float(np.mean([e.min() for e in edges])), float(np.mean([e.max() + 1 for e in edges]))


def resize(a: np.ndarray, k: float) -> np.ndarray:
    """Premultiplied Lanczos resize, so the cleared background never bleeds into her edge."""
    h, w = a.shape[:2]
    size = (max(1, round(w * k)), max(1, round(h * k)))
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4] / 255.0
    chans = [np.asarray(Image.fromarray(pm[..., i]).resize(size, Image.LANCZOS)) for i in range(4)]
    out = np.stack(chans, -1).clip(0, 255)
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 0, out[..., :3] * 255.0 / np.maximum(al, 1e-6), 0)
    return out.clip(0, 255)


def vermeer(img: np.ndarray, pal: np.ndarray) -> np.ndarray:
    """The waist-up Vermeer Blue pose over the legs of the front walking loop, joined at the top
    of the belt. The two rows are drawn at slightly different sizes: the legs are scaled so her
    forearms and hands are as wide apart just under the belt as they are just above it."""
    upper = cut(img, pal, VERMEER_UPPER, seed_bottom=False)
    legs = cut(img, pal, VERMEER_LEGS)
    # The waist-up frame ends on her belt; the walking loop starts just above it.
    rows = belt_rows(upper)
    ub = rows[-1]
    while ub - 1 in rows:
        ub -= 1
    lb = belt_rows(legs)[0]
    ul, ur = span(upper, range(ub - 4, ub))
    ll, lr = span(legs, range(lb, lb + 4))
    k = (ur - ul) / (lr - ll)
    legs = resize(legs, k)
    lb = round(lb * k)
    ll, lr = ll * k, lr * k
    # Both halves centred on the same line; the canvas is wide enough for either.
    mid = max((ul + ur) / 2, (ll + lr) / 2)
    ux = round(mid - (ul + ur) / 2)
    lx = round(mid - (ll + lr) / 2)
    below = legs[lb:]
    out = np.zeros((ub + below.shape[0], max(ux + upper.shape[1], lx + legs.shape[1]), 4), np.float32)
    out[:ub, ux : ux + upper.shape[1]] = upper[:ub]
    out[ub:, lx : lx + legs.shape[1]] = below
    return out


def frame(a: np.ndarray) -> Image.Image:
    """Trimmed, scaled to her standing height and stood on the frame's feet row, centred."""
    x0, y0, x1, y1 = bbox(a)
    a = resize(a[y0:y1, x0:x1], STAND / (y1 - y0))
    h, w = a.shape[:2]
    out = np.zeros((H, W, 4), np.float32)
    top, left = FEET - h, (W - w) // 2
    out[top : top + h, left : left + w] = a
    return Image.fromarray((out + 0.5).clip(0, 255).astype(np.uint8), "RGBA")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not src or not src.exists():
        sys.exit("usage: python scripts/cut-roxy-tops.py <roxy_mockup_d.png>")
    img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    pal = background(img, list(TOPS.values()))
    OUT.mkdir(parents=True, exist_ok=True)
    poses = {name: cut(img, pal, box) for name, box in TOPS.items()}
    poses["met-vermeer-blue"] = vermeer(img, pal)
    for name, pose in poses.items():
        frame(pose).save(OUT / f"{name}.png", optimize=True)
    print(f"{len(poses)} tops -> {OUT}")


if __name__ == "__main__":
    main()
