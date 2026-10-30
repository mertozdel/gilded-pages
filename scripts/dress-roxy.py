"""
Dresses Roxy's atlas in every top of the wardrobe:

    python scripts/dress-roxy.py [--preview <file.png>]

Her sprite pack is drawn in one blouse, the Cream Peter Pan. This finds that blouse in every
frame of public/assets/sprites/roxy/roxy_sheet.png and repaints it in each top's colours from
src/content/blouses.json (shade, base and light, following the cream's own shading), writing
roxy_sheet.<blouse id>.png beside it. The frames and their layout stay the same, so every
sheet uses roxy_sheet.json. A top with `"detail": "stripes"` gets bands of its trim colour.

Only the colour changes: collars, bows, the jabot and sleeve lengths are the pack's blouse.
`--preview` writes a contact sheet of a few poses in every top. Run it again after
build-roxy-sheet.py (which runs it for you) or after changing a top's colours.
Needs Pillow and numpy.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "assets" / "sprites" / "roxy"
BLOUSES = ROOT / "src" / "content" / "blouses.json"
DEFAULT = "cream-peter-pan"
FW, FH = 192, 240
# The cream blouse: a warm, pale, barely saturated yellow (her skin is pinker, her hair and the
# wooden props far more saturated).
HUE = (26, 58)
SAT = (0.05, 0.32)
VAL = 0.42
# Besides the largest patch (the body of the blouse), a patch counts only if it is big enough,
# no brighter than the blouse (her skin's highlights on a raised forearm, her chin or her hands
# are the same tone, only brighter) and within a few pixels of the blouse (a sleeve cut off by
# her arm or the book is; a cloth in her hand isn't).
MIN_PART = 30
PART_VAL = 0.88
PART_GAP = 3
# The blouse's lit rims and the shadows under her arms turn pinker, like her skin, but stay
# darker and less red: grown into from the blouse, a few pixels at most, they stop at skin.
GROW_STEPS = 10
GROW_LUM = 185
GROW_RED = 30
# Stripe height in frame pixels (one red band, one white band).
STRIPE = 4


def hsv(a: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rgb = a[..., :3] / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    some = d > 1e-6
    dd = np.where(some, d, 1)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return np.where(some, h, 0), np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def neighbours(y: int, x: int, h: int, w: int):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny, nx = y + dy, x + dx
            if (dy or dx) and 0 <= ny < h and 0 <= nx < w:
                yield ny, nx


def parts(m: np.ndarray) -> list[list[tuple[int, int]]]:
    """8-connected components of a mask, as pixel lists."""
    seen = np.zeros_like(m)
    h, w = m.shape
    out = []
    for y, x in zip(*np.nonzero(m)):
        if seen[y, x]:
            continue
        seen[y, x] = True
        q, part = deque([(y, x)]), []
        while q:
            p = q.popleft()
            part.append(p)
            for n in neighbours(*p, h, w):
                if m[n] and not seen[n]:
                    seen[n] = True
                    q.append(n)
        out.append(part)
    return out


def dilate(m: np.ndarray) -> np.ndarray:
    out = m.copy()
    out[1:] |= m[:-1]
    out[:-1] |= m[1:]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    out[1:, 1:] |= m[:-1, :-1]
    out[:-1, :-1] |= m[1:, 1:]
    out[1:, :-1] |= m[:-1, 1:]
    out[:-1, 1:] |= m[1:, :-1]
    return out


def enclosed(m: np.ndarray) -> np.ndarray:
    """Pixels the mask surrounds (not reachable from the frame's edge without crossing it)."""
    h, w = m.shape
    outside = np.zeros_like(m)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if not m[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if not m[y, x] and not outside[y, x]:
                outside[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not m[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    return ~m & ~outside


def blouse_mask(frame: np.ndarray) -> np.ndarray:
    """The blouse in one frame: its cream pixels, plus the seams and shadows drawn inside it."""
    h, s, v = hsv(frame)
    al = frame[..., 3] > 0
    cand = al & (h >= HUE[0]) & (h <= HUE[1]) & (s >= SAT[0]) & (s <= SAT[1]) & (v >= VAL)
    found = parts(cand)
    mask = np.zeros_like(cand)
    if not found:
        return mask
    found = [tuple(map(np.array, zip(*p))) for p in sorted(found, key=len, reverse=True)]
    mask[found[0]] = True
    rest = [p for p in found[1:] if len(p[0]) >= MIN_PART and v[p].mean() < PART_VAL]
    grew = True
    while grew:
        grew = False
        near = mask.copy()
        for _ in range(PART_GAP):
            near = dilate(near)
        for p in list(rest):
            if near[p].any():
                mask[p] = True
                rest.remove(p)
                grew = True
    rgb = frame[..., :3]
    L = lum(rgb)
    shaded = al & ~mask & (h >= 5) & (h <= 28) & (s >= 0.06) & (s <= 0.38) & (L >= 95) & (L <= GROW_LUM) & (rgb[..., 0] - rgb[..., 1] <= GROW_RED)
    for _ in range(GROW_STEPS):
        reach = np.zeros_like(mask)
        reach[1:] |= mask[:-1]
        reach[:-1] |= mask[1:]
        reach[:, 1:] |= mask[:, :-1]
        reach[:, :-1] |= mask[:, 1:]
        add = reach & shaded & ~mask
        if not add.any():
            break
        mask |= add
    # Ruffles, seams and folds inside the blouse are darker, browner lines: repaint them too,
    # but not skin (a hand held against her) or anything bright and pink.
    inner = enclosed(mask) & al & (h >= 10) & (h <= 60) & (s < 0.6) & ~((h < 24) & (v > 0.6))
    return mask | inner


def hex_rgb(c: str) -> np.ndarray:
    return np.array([int(c[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def mix(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    return a * (1 - t) + b * t


def lum(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def ramp(L: np.ndarray, anchors: list[float], tones: list[np.ndarray]) -> np.ndarray:
    """Each luminance mapped through the tones placed at the cream's anchor luminances."""
    return np.stack([np.interp(L, anchors, [t[c] for t in tones]) for c in range(3)], -1)


def tones(shade: np.ndarray, base: np.ndarray, light: np.ndarray) -> list[np.ndarray]:
    return [shade * 0.3, shade, base, light, light]


def dress(sheet: np.ndarray, mask: np.ndarray, anchors: list[float], top: dict) -> np.ndarray:
    c = top["colors"]
    out = sheet.copy()
    ys, xs = np.nonzero(mask)
    L = lum(sheet[ys, xs, :3])
    paint = ramp(L, anchors, tones(hex_rgb(c["shade"]), hex_rgb(c["base"]), hex_rgb(c["light"])))
    if top.get("detail") == "stripes":
        trim = hex_rgb(c["trim"])
        red = ramp(L, anchors, tones(trim * 0.72, trim, mix(trim, np.full(3, 255.0), 0.3)))
        band = ((ys % FH) // STRIPE) % 2 == 0
        paint[band] = red[band]
    out[ys, xs, :3] = paint
    return out


def main() -> None:
    args = sys.argv[1:]
    preview = Path(args[args.index("--preview") + 1]) if "--preview" in args else None
    sheet = np.asarray(Image.open(SPRITES / "roxy_sheet.png").convert("RGBA")).astype(np.float32)
    frames = json.loads((SPRITES / "roxy_sheet.json").read_text(encoding="utf-8"))["frames"]
    mask = np.zeros(sheet.shape[:2], bool)
    for f in frames.values():
        r = f["frame"]
        sl = (slice(r["y"], r["y"] + r["h"]), slice(r["x"], r["x"] + r["w"]))
        mask[sl] = blouse_mask(sheet[sl])
    # The cream's shadow, middle and highlight: where each top's shade, base and light go.
    L = lum(sheet[mask][:, :3])
    anchors = [0.0, *np.percentile(L, [10, 50, 95]).tolist(), 255.0]

    tops = [t for t in json.loads(BLOUSES.read_text(encoding="utf-8")) if t["id"] != DEFAULT]
    for old in SPRITES.glob("roxy_sheet.*.png"):
        old.unlink()
    dressed = {}
    for top in tops:
        dressed[top["id"]] = dress(sheet, mask, anchors, top)
        Image.fromarray((dressed[top["id"]] + 0.5).clip(0, 255).astype(np.uint8), "RGBA").save(SPRITES / f"roxy_sheet.{top['id']}.png", optimize=True)
    print(f"{len(tops)} tops -> {SPRITES / 'roxy_sheet.<id>.png'}")

    if preview:
        poses = ["roxy_idle_s", "roxy_idle_se", "roxy_walk_e_1", "roxy_walk_n_1", "roxy_sit_read", "roxy_carry_se", "roxy_triumphant", "roxy_wipe_table_1"]
        poses = [p for p in poses if p in frames]
        rows = [("cream-peter-pan", sheet), *dressed.items()]
        im = Image.new("RGBA", (FW * len(poses), FH * len(rows)), (40, 46, 66, 255))
        for j, (_, sh) in enumerate(rows):
            for i, p in enumerate(poses):
                r = frames[p]["frame"]
                cell = (sh[r["y"] : r["y"] + FH, r["x"] : r["x"] + FW] + 0.5).clip(0, 255).astype(np.uint8)
                im.alpha_composite(Image.fromarray(cell, "RGBA"), (FW * i, FH * j))
        im.save(preview)
        print(f"preview -> {preview}")


if __name__ == "__main__":
    main()
