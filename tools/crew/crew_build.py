#!/usr/bin/env python3
"""
Build the Joel, Jonas and Jason sprite packs from their character mockups.

  pip install -r tools/requirements.txt
  python3 tools/crew_build.py --mockups source --out .

Same full-quality rules as Roxy's pack: every pose is cut at the mockup's own detail, resized
once with high-quality resampling (no palette, no outline, no pixel snapping), placed in 192x240
frames with the feet on row 236, and the missing in-between frames are generated in code.
"""
import argparse, json, os, shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import crew_cut as cc
import gen_anims as g
from hq import hq_resize
from crew_config import BOXES, ITEMS, PORTRAITS, CARD_INSET, opts

FW, FH, BASE = 192, 240, 236          # same frame as Roxy: feet on row 236, origin (0.5, 0.9875)
TARGET = 196                          # standing height (top of cap / hair to soles)
CHARACTERS = {"joel": "joel_mockup.png", "jonas": "jonas_mockup.png", "jason": "jason_mockup.png"}


# ---------------------------------------------------------------- body helpers (trousers, shirt)
def opaque(f):
    return f[..., 3] > 0


def is_pants(f):
    """Olive cargo trousers (Joel, Jonas) or blue denim (Jason)."""
    c = f[..., :3].astype(int); r, gg, b = c[..., 0], c[..., 1], c[..., 2]
    olive = (gg >= r - 6) & (gg > b + 14) & (c.mean(-1) < 150)
    denim = (b > r + 8) & (b >= gg - 6) & (c.mean(-1) < 170) & (c.max(-1) - c.min(-1) > 25)
    return opaque(f) & (olive | denim)


def figure_rows(f):
    ys = np.where(opaque(f).any(1))[0]
    return ys.min(), ys.max()


def belt_row(f):
    """Top row of the trousers (waist)."""
    top, bot = figure_rows(f)
    h = bot - top + 1
    pants = is_pants(f); op = opaque(f)
    for y in range(top + int(h * 0.30), bot + 1):
        n = op[y].sum()
        if n and pants[y].sum() / n > 0.35 and pants[y].sum() >= 4:
            return y
    return None


def waist_width(f):
    y = belt_row(f)
    xs = np.where(is_pants(f)[y:y + 4].any(0))[0]
    return xs.max() - xs.min() + 1


def hip_center(f):
    y = belt_row(f)
    if y is None:
        x0, x1 = np.where(opaque(f).any(0))[0][[0, -1]]
        return (x0 + x1) / 2
    xs = np.where(is_pants(f)[y:y + 6].any(0))[0]
    return (xs.min() + xs.max()) / 2


# gen_anims was written for Roxy's jeans: point its leg helpers at these trousers too
g.is_jeans = is_pants
g.belt_row = belt_row
g.figure_rows = figure_rows


def place(p, ox, oy):
    fr = np.zeros((FH, FW, 4), np.uint8)
    h, w = p.shape[:2]
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(FW, ox + w), min(FH, oy + h)
    if x1 > x0 and y1 > y0:
        fr[y0:y1, x0:x1] = p[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    clipped = int((p[..., 3] > 0).sum() - (fr[..., 3] > 0).sum())
    return fr, clipped


def place_feet(p, cx=None):
    """Feet on the base row, hips centred."""
    ys = np.where(opaque(p).any(1))[0]
    hx = hip_center(p) if cx is None else cx
    return place(p, int(round(FW / 2 - hx)), BASE - ys.max())


def is_shirt(f):
    """Grey or white t-shirt: low saturation, mid to bright."""
    c = f[..., :3].astype(int)
    return opaque(f) & (c.max(-1) - c.min(-1) < 24) & (c.mean(-1) > 95)


def mirror_keep_head(f):
    """The other half of a front walk: the body is mirrored (other arm, other leg) but the head
    stays as drawn, so the hair, cap logo and glasses don't flip back and forth. The seam is the
    t-shirt collar."""
    top, bot = figure_rows(f)
    h = bot - top
    shirt = is_shirt(f); op = opaque(f)
    neck = top + int(h * 0.30)
    for y in range(top + int(h * 0.2), top + int(h * 0.45)):
        if op[y].sum() and shirt[y].sum() / op[y].sum() > 0.45:
            neck = y
            break
    m = f[:, ::-1].copy()
    band = slice(top, neck)
    def cx(a):
        xs = np.where(opaque(a)[band].any(0))[0]
        return (xs.min() + xs.max()) / 2
    head = g.shift(f, int(round(cx(m) - cx(f))), 0)
    out = m.copy()
    out[:neck] = head[:neck]
    return out


def torso_anchor(f):
    """(x, y) of the torso: centre of the t-shirt a little above the waist, and the waist row."""
    yb = belt_row(f)
    shirt = is_shirt(f)
    rows = range(max(0, yb - 14), yb - 4)
    xs = [np.where(shirt[y])[0] for y in rows if shirt[y].any()]
    cx = np.median([(x.min() + x.max()) / 2 for x in xs]) if xs else FW / 2
    return cx, yb


def print_mask(f, rect, sat_min=40):
    x0, y0, x1, y1 = rect
    c = f[..., :3].astype(int); sat = c.max(-1) - c.min(-1); lum = c.mean(-1)
    m = np.zeros(f.shape[:2], bool)
    sub = (sat > sat_min) | (lum < 110)
    m[y0:y1 + 1, x0:x1 + 1] = sub[y0:y1 + 1, x0:x1 + 1]
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=2))
    return m & opaque(f)


def paste_print(dst, ref, rect, clear_rect=None):
    """Put the t-shirt print of `ref` (inside `rect`, frame coordinates) on `dst`'s shirt, aligned
    on the torso, so the print stays the same through a walk cycle. `clear_rect` (in dst) is a
    print that must go first (a mirrored one): it is painted over with the shirt's own white."""
    out = dst.copy()
    if clear_rect is not None:
        import cv2
        old = ndi.binary_dilation(print_mask(out, clear_rect, sat_min=20), iterations=2) & opaque(out)
        rgb = np.ascontiguousarray(out[..., :3])
        out[..., :3] = cv2.inpaint(rgb, old.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
    (rx, ry), (dx, dy) = torso_anchor(ref), torso_anchor(out)
    sx, sy = int(round(dx - rx)), int(dy - ry)
    m = ndi.binary_dilation(print_mask(ref, rect))
    ys, xs = np.where(m)
    ty, tx = ys + sy, xs + sx
    ok = (ty >= 0) & (ty < FH) & (tx >= 0) & (tx < FW)
    ys, xs, ty, tx = ys[ok], xs[ok], ty[ok], tx[ok]
    keep = out[ty, tx, 3] > 0                        # only on the figure, never outside it
    out[ty[keep], tx[keep]] = ref[ys[keep], xs[keep]]
    return out


def hop(f, px):
    return g.shift(f, 0, -px)


# ---------------------------------------------------------------- per character
PRINT = {  # t-shirt print box in the first front-walk frame (frame coordinates, inclusive)
    "jason": (82, 110, 115, 150),
}
EYES = {  # eye boxes measured on the final frames (x0, y0, x1, y1 inclusive), for blinks
    "joel": {"idle_s": [(86, 69, 93, 75), (101, 69, 107, 75)],
             "calm": [(89, 71, 96, 76), (104, 70, 111, 76)]},
    "jonas": {"idle_s": [(84, 71, 92, 76), (100, 71, 108, 76)],          # inside the glasses
              "calm": [(90, 71, 98, 74), (104, 71, 113, 74)]},
    "jason": {"idle_s": [(85, 70, 92, 75), (100, 70, 108, 75)],
              "calm": [(90, 67, 98, 72), (104, 67, 111, 72)]},
}


def build_character(who, mockup_dir):
    src = cc.load_source(os.path.join(mockup_dir, CHARACTERS[who]), BOXES)
    cuts = {k: cc.cut(src, BOXES[k], **opts(who, k)) for k in BOXES}

    def height(k):
        t, b = figure_rows(cuts[k]); return b - t + 1

    s_walk = TARGET / height("f5")
    s_pose = TARGET / height("calm")
    # the emotions section is drawn a little smaller; match the waist width to the calm pose
    s_emo = s_pose * waist_width(cuts["calm"]) / np.mean([waist_width(cuts["confused"]),
                                                          waist_width(cuts["triumphant"])])
    scale = {k: s_walk for k in ("f2", "f3", "f5", "f7", "f9", "side_w", "side_s", "back_w", "back_s",
                                 "run_side_1", "run_side_2", "run_front_1", "run_front_2")}
    scale.update({k: s_pose for k in ("calm", "gesture", "vocal", "flustered")})
    scale.update({k: s_emo for k in ("triumphant", "confused", "chill")})
    R = {k: hq_resize(cuts[k], s) for k, s in scale.items()}

    F, warn = {}, []
    for k in scale:
        if k in ("triumphant", "confused", "chill"):
            continue
        F[k], clip = place_feet(R[k])
        if clip > 2:
            warn.append(f"{k} clipped {clip}px")
    # upper-body poses: line their waist up with the calm pose, then give them its legs
    yb_calm = belt_row(F["calm"])
    for k in ("triumphant", "confused"):
        p = R[k]
        F[k + "_upper"], clip = place(p, int(round(FW / 2 - hip_center(p))), yb_calm - belt_row(p))
        if clip > 2:
            warn.append(f"{k} clipped {clip}px")
    ys = np.where(opaque(R["chill"]).any(1))[0]; xs = np.where(opaque(R["chill"]).any(0))[0]
    F["chill"], _ = place(R["chill"], int(round(FW / 2 - (xs.min() + xs.max()) / 2)), BASE - ys.max())

    D = {}
    # idles
    D["idle_s"] = F["f5"]; D["idle_s_br"] = g.breathe(F["f5"], 3)
    D["idle_e"] = F["side_s"]; D["idle_e_br"] = g.breathe(F["side_s"], 3)
    D["idle_n"] = F["back_s"]; D["idle_n_br"] = g.breathe(F["back_s"], 3)
    D["calm"] = F["calm"]; D["calm_br"] = g.breathe(F["calm"], 3)
    # walk south: arm-swing contact, passing (leg lifted), then the same two mirrored
    D["walk_s_1"] = F["f2"]; D["walk_s_2"] = F["f3"]
    D["walk_s_3"] = mirror_keep_head(F["f2"]); D["walk_s_4"] = mirror_keep_head(F["f3"])
    if who in PRINT:          # printed t-shirt: same print, same way round, in all four steps
        rect = PRINT[who]
        mx0, my0, mx1, my1 = rect
        mirrored = (FW - 1 - mx1 + (D["walk_s_3"].shape[1] - FW), my0, FW - 1 - mx0, my1)
        D["walk_s_2"] = paste_print(D["walk_s_2"], F["f2"], rect)
        D["walk_s_3"] = paste_print(D["walk_s_3"], F["f2"], rect, clear_rect=(mirrored[0] - 3, my0 - 1, mirrored[2] + 3, my1 + 1))
        D["walk_s_4"] = paste_print(D["walk_s_4"], F["f2"], rect)
    # walk north: back contact, back standing, mirrored
    D["walk_n_1"] = F["back_w"]; D["walk_n_2"] = F["f9"]
    D["walk_n_3"] = F["back_w"][:, ::-1].copy(); D["walk_n_4"] = F["f9"][:, ::-1].copy()
    # walk east: contact and a generated passing pose (legs swing under the hips)
    # in profile both contact poses share one silhouette, so the cycle is contact / passing x2
    D["walk_e_1"] = F["side_w"]; D["walk_e_2"] = g.swing_legs(F["side_w"], 0.85, 3)
    # runs: two drawn strides, each with a lifted in-between
    for v, a, b in (("s", "run_front_1", "run_front_2"), ("e", "run_side_1", "run_side_2")):
        D[f"run_{v}_1"] = F[a]; D[f"run_{v}_2"] = hop(F[a], 5)
        D[f"run_{v}_3"] = F[b]; D[f"run_{v}_4"] = hop(F[b], 5)
    # talking and reactions
    D["gesture"] = F["gesture"]; D["gesture_br"] = g.breathe(F["gesture"], 3)
    D["vocal"] = F["vocal"]; D["vocal_br"] = g.breathe(F["vocal"], 3)
    D["vocal_l"] = g.shift(F["vocal"], -3, 0); D["vocal_r"] = g.shift(F["vocal"], 3, 0)
    D["flustered"] = F["flustered"]; D["flustered_br"] = g.breathe(F["flustered"], 3)
    D["flustered_l"] = g.shift(F["flustered"], -3, 0); D["flustered_r"] = g.shift(F["flustered"], 3, 0)
    cel = g.passing_frame(F["triumphant_upper"], F["calm"], 3)
    D["celebrate"] = cel
    for o in (3, 9, 12):
        D[f"celebrate_up{o}"] = hop(cel, o)
    conf = g.passing_frame(F["confused_upper"], F["calm"], 3)
    # the confused cell stops at the hips and cuts off his lowered hand: borrow the calm pose's
    # hand on that side (both arms hang the same way there)
    yb = belt_row(conf)
    def left_arm_x(f, y):              # outer edge of the arm hanging on the left
        return np.where(opaque(f)[y])[0][0]
    lowest = max(y for y in range(yb, FH) if opaque(F["confused_upper"])[y, :FW // 2].any()) \
        if opaque(F["confused_upper"])[yb:, :FW // 2].any() else yb
    yref = min(lowest, yb + 2) - 1
    dx = int(round(left_arm_x(conf, yref) - left_arm_x(F["calm"], yref)))
    calm_s = g.shift(F["calm"], dx, 0)
    hand = g.is_skin(calm_s) & ~opaque(conf)
    hand[:yb] = False; hand[:, FW // 2:] = False
    hand = ndi.binary_opening(hand)
    lab, n = ndi.label(hand)
    if n:                                   # only the hand right under the arm
        sizes = ndi.sum(hand, lab, range(1, n + 1)); hand = lab == (np.argmax(sizes) + 1)
        edge = ndi.binary_dilation(hand, iterations=2) & ~opaque(conf) & opaque(calm_s)
        edge[:yb] = False; edge[:, FW // 2:] = False
        hand |= edge & ~g.is_jeans(calm_s)
    conf[hand] = calm_s[hand]
    D["confused"] = conf; D["confused_br"] = g.breathe(conf, 3)
    D["sit_floor"] = F["chill"]; D["sit_floor_br"] = g.breathe(F["chill"], 3)
    # blinks (eye boxes measured on these final frames)
    for name, boxes in EYES[who].items():
        D[name + "_bl"] = g.blink_eyes(D[name], boxes)
    D = {k: g.drop_specks(v, 30) for k, v in D.items()}
    return src, cuts, D, warn


# ---------------------------------------------------------------- animations
def anims_def(who):
    has_bl = lambda n: n in EYES[who]
    W, RN = 125, 85
    idle_s = [("idle_s", 1500), ("idle_s_br", 700), ("idle_s", 1100)]
    if has_bl("idle_s"):
        idle_s += [("idle_s_bl", 120)]
    idle_s += [("idle_s", 600), ("idle_s_br", 700)]
    calm = [("calm", 1400), ("calm_br", 700)]
    if has_bl("calm"):
        calm += [("calm_bl", 120)]
    calm += [("calm", 900), ("calm_br", 700)]
    shake = lambda n: [(n, 80), (n + "_l", 80), (n, 80), (n + "_r", 80)] * 2
    cel = [("celebrate", 80), ("celebrate_up3", 70), ("celebrate_up9", 70), ("celebrate_up12", 120),
           ("celebrate_up9", 70), ("celebrate_up3", 70), ("celebrate", 160)] * 2
    return [
        ("idle_s", idle_s, -1, "standing, facing the viewer"),
        ("idle_e", [("idle_e", 1500), ("idle_e_br", 700)], -1, "standing in profile (flipX for west)"),
        ("idle_n", [("idle_n", 1500), ("idle_n_br", 700)], -1, "standing, back to the viewer"),
        ("walk_s", [(f"walk_s_{i}", W) for i in range(1, 5)], -1, "walking toward the viewer (S, SE, SW)"),
        ("walk_e", [("walk_e_1", W), ("walk_e_2", W)] * 2, -1, "walking in profile (flipX for west)"),
        ("walk_n", [(f"walk_n_{i}", W) for i in range(1, 5)], -1, "walking away (N, NE, NW)"),
        ("run_s", [(f"run_s_{i}", RN) for i in range(1, 5)], -1, "running toward the viewer"),
        ("run_e", [(f"run_e_{i}", RN) for i in range(1, 5)], -1, "running in profile (flipX for west)"),
        ("calm_s", calm, -1, "relaxed idle while chatting"),
        ("talk_s", [("calm", 450), ("gesture", 900), ("calm_br", 400), ("gesture_br", 700)], -1,
         "talking with open hands"),
        ("gesture_s", [("gesture", 1200), ("gesture_br", 600)], 0, "\"check it out!\""),
        ("oops_s", shake("vocal") + [("vocal", 900), ("vocal_br", 600)], 0, "\"uh-oh!\" hands over mouth"),
        ("flustered_s", shake("flustered") + [("flustered", 800), ("flustered_br", 600)], 0,
         "flustered / embarrassed"),
        ("celebrate_s", cel, 0, "fists in the air"),
        ("confused_s", [("confused", 1300), ("confused_br", 700)], -1, "scratching his head"),
        ("sit_floor", [("sit_floor", 1600), ("sit_floor_br", 800)], -1, "chilling on the floor"),
    ]


# ---------------------------------------------------------------- sheets, portraits, icons, previews
def pack(frames, prefix, image_name, cols=10):
    names = sorted(frames)
    rows = -(-len(names) // cols)
    sheet = Image.new("RGBA", (cols * FW, rows * FH), (0, 0, 0, 0))
    atlas = {"frames": {}, "meta": {"app": "crew_build.py", "version": "1.0", "image": image_name,
                                    "format": "RGBA8888", "size": {"w": cols * FW, "h": rows * FH}, "scale": "1"}}
    for i, n in enumerate(names):
        x, y = (i % cols) * FW, (i // cols) * FH
        sheet.alpha_composite(Image.fromarray(frames[n]), (x, y))
        atlas["frames"][f"{prefix}{n}"] = {
            "frame": {"x": x, "y": y, "w": FW, "h": FH}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FW, "h": FH}, "sourceSize": {"w": FW, "h": FH},
            "pivot": {"x": 0.5, "y": round((BASE + 1) / FH, 4)}}
    return sheet, atlas


def trim(im, margin=2):
    ys, xs = np.where(im[..., 3] > 0)
    return im[max(0, ys.min() - margin):ys.max() + margin + 1, max(0, xs.min() - margin):xs.max() + margin + 1]


def portraits(src, cuts, who):
    """Busts at the mockup's own resolution on one shared canvas, bust bottom-centred. Card
    portraits (Jason's flag card) are kept as drawn."""
    calm = cuts["calm"]
    t, b = figure_rows(calm)
    crops = {"main": trim(calm[:t + int((b - t) * 0.42)])}
    for name, (cell, mode) in PORTRAITS[who].items():
        if mode == "card":
            x0, y0, x1, y1 = BOXES[cell]; i = CARD_INSET
            c = src.img[y0 + i:y1 - i + 1, x0 + i:x1 - i + 1].astype(np.uint8)
            # the card ends with its last painted stripe: drop the plain rows under it
            ci = c.astype(int); sat = ci.max(-1) - ci.min(-1)
            edge = sat[:, :4].max(1)
            painted = np.where(edge > 60)[0]
            if len(painted):
                c = c[:painted.max() + 1]
            crops[name] = np.concatenate([c, np.full(c.shape[:2] + (1,), 255, np.uint8)], -1)
        else:
            crops[name] = trim(cuts[cell])
    side = max(max(c.shape[:2]) for c in crops.values())
    out = {}
    for name, c in crops.items():
        canvas = np.zeros((side, side, 4), np.uint8)
        h, w = c.shape[:2]
        canvas[side - h:, (side - w) // 2:(side - w) // 2 + w] = c
        out[name] = canvas
    return out


def item_icons(src, who):
    out = {}
    for name, (x0, y0, x1, y1) in ITEMS[who].items():
        c = src.img[y0:y1, x0:x1]
        bgc = cc.bg_cand(c, src, 30, loose=8, gb_up=4)
        seeds = np.zeros_like(bgc); seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
        lab, _ = ndi.label(bgc)
        ids = np.unique(lab[seeds & bgc]); ids = ids[ids > 0]
        fg = ~np.isin(lab, ids)
        lab2, n = ndi.label(fg)
        if n > 1:
            sizes = ndi.sum(fg, lab2, range(1, n + 1))
            fg = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s >= 0.08 * sizes.max()])
        fg = ndi.binary_fill_holes(fg)
        rgba = np.zeros(c.shape[:2] + (4,), np.uint8); rgba[..., :3] = c; rgba[..., 3] = fg * 255
        out[name] = trim(cc.peel(rgba, src, loose=6, gb_up=3), 1)
    return out


def preview_grid(frames, path, cols=11, bg=(122, 110, 104, 255)):
    names = sorted(frames)
    rows = -(-len(names) // cols)
    pad, lab = 4, 12
    im = Image.new("RGBA", (cols * (FW + pad) + pad, rows * (FH + pad + lab) + pad), bg)
    d = ImageDraw.Draw(im)
    for i, n in enumerate(names):
        x = pad + (i % cols) * (FW + pad); y = pad + (i // cols) * (FH + pad + lab)
        d.rectangle([x, y, x + FW - 1, y + FH - 1], outline=(150, 138, 130))
        im.alpha_composite(Image.fromarray(frames[n]), (x, y))
        d.text((x + 2, y + FH + 1), n[:26], fill=(240, 232, 220))
    im.save(path)


def preview_anim(frames, anims, path, cols=8, tick=60, seconds=4.2):
    cw, ch = FW + 6, FH + 18
    rows = -(-len(anims) // cols)
    W, H = cols * cw + 6, rows * ch + 6
    out = []
    for t in range(int(seconds * 1000 / tick)):
        now = t * tick
        im = Image.new("RGB", (W, H), (122, 110, 104)); d = ImageDraw.Draw(im)
        for i, (key, seq, rep, _) in enumerate(anims):
            total = sum(dur for _, dur in seq)
            tt = now % total if rep != 0 else (min(now, total - 1) if now < total + 600 else (now - total - 600) % total)
            acc = 0
            for fname, dur in seq:
                acc += dur
                if tt < acc:
                    break
            x = 6 + (i % cols) * cw; y = 6 + (i // cols) * ch
            fimg = Image.fromarray(frames[fname]); im.paste(fimg, (x, y), fimg)
            d.text((x, y + FH + 3), key, fill=(240, 232, 220))
        out.append(im)
    out[0].save(path, save_all=True, append_images=out[1:], duration=tick, loop=0, quality=92, method=4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mockups", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", nargs="*", default=list(CHARACTERS))
    args = ap.parse_args()
    for who in args.only:
        src, cuts, D, warn = build_character(who, args.mockups)
        anims = anims_def(who)
        missing = [f for _, seq, _, _ in anims for f, _ in seq if f not in D]
        assert not missing, missing
        d = os.path.join(args.out, who)
        if os.path.exists(d):
            shutil.rmtree(d)
        for sub in ("frames", "portraits", "icons"):
            os.makedirs(os.path.join(d, sub))
        sheet, atlas = pack(D, f"{who}_", f"{who}_sheet.png")
        sheet.save(os.path.join(d, f"{who}_sheet.png"))
        json.dump(atlas, open(os.path.join(d, f"{who}_sheet.json"), "w"), indent=1)
        for n, f in D.items():
            Image.fromarray(f).save(os.path.join(d, "frames", f"{who}_{n}.png"))
        anim_json = {
            "texture": who, "frameSize": {"w": FW, "h": FH},
            "origin": {"x": 0.5, "y": round((BASE + 1) / FH, 4)}, "standHeight": TARGET,
            "iso_facing": {"S": "_s", "SE": "_s", "SW": "_s", "E": "_e", "W": "_e + flipX",
                           "N": "_n", "NE": "_n", "NW": "_n"},
            "anims": [{"key": f"{who}_{k}", "frames": [{"frame": f"{who}_{f}", "duration": dur} for f, dur in seq],
                       "repeat": rep, "use": use} for k, seq, rep, use in anims],
        }
        json.dump(anim_json, open(os.path.join(d, f"{who}_anims.json"), "w"), indent=1)
        for name, im in portraits(src, cuts, who).items():
            Image.fromarray(im).save(os.path.join(d, "portraits", f"{who}_portrait_{name}.png"))
        for name, im in item_icons(src, who).items():
            Image.fromarray(im).save(os.path.join(d, "icons", f"icon_{name}.png"))
        prev = os.path.join(args.out, "previews"); os.makedirs(prev, exist_ok=True)
        preview_grid(D, os.path.join(prev, f"{who}_all_frames.png"))
        preview_anim(D, anims, os.path.join(prev, f"{who}_animations.webp"))
        print(f"{who}: {len(D)} frames, {len(anims)} animations", "; ".join(warn))


if __name__ == "__main__":
    main()
