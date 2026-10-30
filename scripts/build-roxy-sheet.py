"""
Builds Roxy's atlas for the game from her sprite pack (roxy_sprites_v2):

    python scripts/build-roxy-sheet.py <pack>/roxy

The pack's behind-the-counter poses (serving, the espresso machine) are cut off at the
counter line. In the painted café she works on the near side of the counter, so nothing
hides her legs: this adds a full-figure copy of each of those poses (`<name>_full`) with the
legs of her standing pose in the same view grafted on at the waist. The serving leans keep
her feet planted and shear the legs so the lean runs down to the floor.

Writes public/assets/sprites/roxy/roxy_sheet.png + .json (every pack frame plus the
full-figure ones), fx_sheet.png + .json, src/game/companion/art/roxyPack.json (the
pack's animation and effect timings) and the app icons in public/icons/ (her portrait
in a gold deco frame, for the home screen). Then runs scripts/dress-roxy.py, which repaints
the new sheet in every top of the wardrobe.
Needs Pillow and numpy.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "sprites" / "roxy"
ICONS = ROOT / "public" / "icons"
NAVY = (20, 27, 45, 255)
GOLD = (227, 193, 111, 255)
PACK_JSON = ROOT / "src" / "game" / "companion" / "art" / "roxyPack.json"
FW, FH = 192, 240
COLS = 11

# full-figure frame <- (upper-body frame, its un-moved base frame, standing frame of the same
# view, how to join, which of the standing pose's hanging hands to drop)
#   "low":   the upper body keeps all its jeans; the legs start under them (serving: her free
#            hand hangs at her hip in both poses, the other holds the saucer)
#   "waist": joined at the waistband, the blouse above the belt stretched until her head is as
#            high as standing (reaching up: the back-view cut is shorter in the body than her
#            standing back view)
SERVE = ("roxy_serve_se", "roxy_pass_se_1", "low", "right")
REACH = ("roxy_reach_n", "roxy_walk_n_1", "waist", "both")
GRAFTS = {
    "roxy_serve_se_full": ("roxy_serve_se", *SERVE),
    "roxy_serve_se_br_full": ("roxy_serve_se_br", *SERVE),
    "roxy_serve_se_lean1_full": ("roxy_serve_se_lean1", *SERVE),
    "roxy_serve_se_lean2_full": ("roxy_serve_se_lean2", *SERVE),
    "roxy_reach_n_full": ("roxy_reach_n", *REACH),
    "roxy_reach_n_br_full": ("roxy_reach_n_br", *REACH),
    "roxy_reach_n_up_full": ("roxy_reach_n_up", *REACH),
}
# Rows blended across the seam; rows of blouse stretched above the belt; her feet's row.
SEAM = 3
BAND = 30
FEET = 236


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)


def jeans(a: np.ndarray) -> np.ndarray:
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    return (al > 128) & (b > r + 12) & (b >= g)


def hair(a: np.ndarray) -> np.ndarray:
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    return (al > 128) & (r > g + 15) & (g > b + 15)


def rows_of(m: np.ndarray) -> list[int]:
    return [y for y in range(m.shape[0]) if m[y].sum() > 3]


def centre(m: np.ndarray, y0: int, y1: int) -> float:
    return float(np.nonzero(m[y0:y1])[1].mean())


def premul(a: np.ndarray) -> np.ndarray:
    out = a.copy()
    out[..., :3] *= out[..., 3:4] / 255.0
    return out


def unpremul(a: np.ndarray) -> np.ndarray:
    out = a.copy()
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 0, out[..., :3] * 255.0 / np.maximum(al, 1e-6), 0)
    return out


def shift_rows(a: np.ndarray, dx: np.ndarray) -> np.ndarray:
    """Shifts each row right by dx[row] px (sub-pixel, premultiplied linear interpolation)."""
    pm = premul(a)
    out = np.zeros_like(a)
    xs = np.arange(a.shape[1], dtype=np.float32)
    for y in range(a.shape[0]):
        for c in range(4):
            out[y, :, c] = pm[y, :, c] if not dx[y] else np.interp(xs - dx[y], xs, pm[y, :, c], left=0, right=0)
    return unpremul(out)


def remap_rows(a: np.ndarray, src_y: np.ndarray) -> np.ndarray:
    """Row y of the result samples row src_y[y] of `a` (linear between rows; outside is clear)."""
    pm = premul(a)
    out = np.zeros_like(a)
    for y, sy in enumerate(src_y):
        if sy < 0 or sy > a.shape[0] - 1:
            continue
        y0 = int(np.floor(sy))
        y1 = min(y0 + 1, a.shape[0] - 1)
        t = sy - y0
        out[y] = pm[y0] * (1 - t) + pm[y1] * t
    return unpremul(out)


def over(top: np.ndarray, under: np.ndarray) -> np.ndarray:
    a_t = top[..., 3:4] / 255.0
    a_u = under[..., 3:4] / 255.0
    a_o = a_t + a_u * (1 - a_t)
    out = np.zeros_like(top)
    out[..., :3] = np.where(a_o > 0, (top[..., :3] * a_t + under[..., :3] * a_u * (1 - a_t)) / np.maximum(a_o, 1e-6), 0)
    out[..., 3:4] = a_o * 255.0
    return out


def graft(upper: np.ndarray, base: np.ndarray, stand: np.ndarray, join: str, drop: str) -> np.ndarray:
    """The upper-body pose over the standing pose's legs. `base` is the upper pose before its
    breath, lean or rise, so every variant is joined the same way and keeps its own motion."""
    j_up, j_base, j_st = jeans(upper), jeans(base), jeans(stand)
    r_up, r_base, r_st = rows_of(j_up), rows_of(j_base), rows_of(j_st)
    hip_st = r_st[0] + 2
    if join == "low":
        cut_base = r_base[-1] - 2
        cut_up = r_up[-1] - 2
        extra = 0.0
    else:
        cut_base = r_base[0] + 2
        cut_up = r_up[0] + 2
        # Stretch the blouse above the belt so her head is where it is standing.
        need = (hip_st - rows_of(hair(stand))[0]) - (cut_base - rows_of(hair(base))[0])
        extra = float(np.clip(need, 0, BAND * 0.5))
    # Hips of the base pose on the standing pose's hips; the variant moves from there.
    cx_base = centre(j_base, cut_base - 4, cut_base + 2)
    cx_st = centre(j_st, hip_st, hip_st + 6)
    lean = centre(j_up, cut_up - 4, cut_up + 2) - cx_base
    rise = cut_up - cut_base
    dy = hip_st - (cut_base + extra)

    # Upper body: the band above its waist stretched, then moved onto the hips. Faded out
    # across the seam so the jeans run on without a step.
    ys = np.arange(FH, dtype=np.float32) - dy
    band_top = cut_up - BAND
    k = (BAND + extra) / BAND
    src = np.where(ys < band_top, ys, np.where(ys < band_top + BAND + extra, band_top + (ys - band_top) / k, ys - extra))
    body = remap_rows(upper, src)
    body = shift_rows(body, np.full(FH, cx_st - cx_base, dtype=np.float32))
    seam = hip_st + rise
    w = np.ones(FH, dtype=np.float32)
    for i in range(SEAM):
        w[seam - SEAM + i] = 1 - (i + 1) / (SEAM + 1)
    w[seam:] = 0
    body[..., 3] *= w[:, None]

    # Legs: the standing pose from its hips down, following a rise and sheared by a lean
    # (the hips go with the upper body, the feet stay planted).
    legs = stand.copy()
    legs[: hip_st - SEAM] = 0
    # Hands that are busy above: keep only the jeans' own columns on that side.
    for y in range(hip_st - SEAM, FEET):
        xs = np.nonzero(j_st[min(max(y, r_st[0]), r_st[-1])])[0]
        if drop in ("left", "both"):
            legs[y, : max(0, xs.min() - 1)] = 0
        if drop in ("right", "both"):
            legs[y, xs.max() + 2 :] = 0
    if rise:
        legs = remap_rows(legs, np.arange(FH, dtype=np.float32) - rise)
    t = np.clip((FEET - np.arange(FH, dtype=np.float32)) / max(1, FEET - hip_st), 0, 1)
    legs = shift_rows(legs, lean * t)
    return over(body, legs)


def icon(portrait: Image.Image, size: int, maskable: bool) -> Image.Image:
    """Her portrait on navy with a soft gold glow; framed in gold, or full-bleed for a maskable icon."""
    ss = 4
    big = size * ss
    im = Image.new("RGBA", (big, big), NAVY)
    # The glow behind her head.
    yy, xx = np.mgrid[0:big, 0:big].astype(np.float32)
    d = np.hypot(xx - big * 0.5, yy - big * 0.46) / (big * 0.5)
    glow = np.clip(1 - d, 0, 1) ** 1.6 * 0.45
    arr = np.asarray(im, dtype=np.float32).copy()
    for c in range(3):
        arr[..., c] = arr[..., c] * (1 - glow) + GOLD[c] * glow
    im = Image.fromarray(arr.astype(np.uint8), "RGBA")
    # A gold double rule, like the app's panels; the bust stands on the inner one. A maskable
    # icon has no frame: the bust runs off the bottom and her face sits in the middle safe circle.
    rules = ((0.035, 0.022), (0.075, 0.008))
    h = int(big * (0.82 if maskable else 0.8))
    bottom = big if maskable else big - int(big * rules[1][0])
    w = int(portrait.width * h / portrait.height)
    im.alpha_composite(portrait.resize((w, h), Image.LANCZOS), ((big - w) // 2, bottom - h))
    if not maskable:
        dr = ImageDraw.Draw(im)
        for inset, width in rules:
            o = int(big * inset)
            dr.rectangle((o, o, big - o - 1, big - o - 1), outline=GOLD, width=max(1, int(big * width)))
    return im.resize((size, size), Image.LANCZOS)


def icons(pack: Path) -> None:
    portrait = Image.open(pack / "portraits" / "roxy_portrait_main.png").convert("RGBA")
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in (("icon-192.png", 192, False), ("icon-512.png", 512, False), ("maskable-512.png", 512, True), ("apple-touch-icon.png", 180, True)):
        icon(portrait, size, maskable).convert("RGB").save(ICONS / name, optimize=True)


def main() -> None:
    pack = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not pack or not (pack / "roxy_anims.json").exists():
        sys.exit("usage: python scripts/build-roxy-sheet.py <roxy_sprites_v2>/roxy")
    frames_dir = pack / "frames"
    frames = {p.stem: load(p) for p in sorted(frames_dir.glob("*.png"))}
    for name, (up, base, st, join, drop) in GRAFTS.items():
        frames[name] = graft(frames[up], frames[base], frames[st], join, drop)

    names = sorted(frames)
    rows = (len(names) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * FW, rows * FH))
    atlas = {}
    for i, n in enumerate(names):
        x, y = (i % COLS) * FW, (i // COLS) * FH
        sheet.paste(Image.fromarray(np.clip(frames[n] + 0.5, 0, 255).astype(np.uint8), "RGBA"), (x, y))
        atlas[n] = {
            "frame": {"x": x, "y": y, "w": FW, "h": FH},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FW, "h": FH},
            "sourceSize": {"w": FW, "h": FH},
            "pivot": {"x": 0.5, "y": 0.9875},
        }
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "roxy_sheet.png", optimize=True)
    meta = {"app": "scripts/build-roxy-sheet.py", "image": "roxy_sheet.png", "format": "RGBA8888", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1"}
    (OUT / "roxy_sheet.json").write_text(json.dumps({"frames": atlas, "meta": meta}, indent=1), encoding="utf-8", newline="\n")
    for f in ("fx_sheet.png", "fx_sheet.json"):
        shutil.copyfile(pack / f, OUT / f)

    anims = json.loads((pack / "roxy_anims.json").read_text(encoding="utf-8"))
    fx = json.loads((pack / "fx_anims.json").read_text(encoding="utf-8"))
    PACK_JSON.write_text(json.dumps({"roxy": anims, "fx": fx["anims"]}, indent=1), encoding="utf-8", newline="\n")
    icons(pack)
    print(f"{len(names)} frames ({len(GRAFTS)} full-figure) -> {OUT / 'roxy_sheet.png'} {sheet.size}; icons -> {ICONS}")
    subprocess.run([sys.executable, str(ROOT / "scripts" / "dress-roxy.py")], check=True)


if __name__ == "__main__":
    main()
