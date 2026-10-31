#!/usr/bin/env python3
"""
Build Matt, the cafe regular (mockup M-004): a non-playable customer who always sits at his own
table with his laptop and his coffee.

  python3 tools/matt_build.py --mockups source --out .

Writes matt/ with
  - texture `matt` (frames 256x240, feet / chair legs on row 236): his seated table set (chair,
    table, laptop and mug are part of the sprite), walking, standing with a cup, lounging on his
    sofa;
  - texture `matt_closeup` (frames 160x160): close-up busts for dialogue (idle loop, looking
    around, sipping, micro-movements, stressed / anxious / sad);
  - portraits, cards (hand loops, mug, book, laptop states).
Full-quality rules as the crew: every pose is cut at the mockup's own detail and resized once with
high-quality resampling; no palette, no outline, no pixel snapping.
"""
import argparse, json, os, shutil
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import cv2

import crew_cut as cc
import gen_anims as g
from hq import hq_resize
import matt_config as mc
import crew_build as cb

FW, FH, BASE = 256, 240, 236
CW, CH = 160, 160                       # close-up frames
S_WALK = 196 / 128                      # standing height 196 px, like the crew
S_SEAT = S_WALK * 29 / 26               # seated set: matched on head width (drawn ~10% smaller)
S_CUP = 196 / 136
S_CLOSE = 3.0                           # close-up busts
SS = 4


def opaque(f):
    return f[..., 3] > 0


def place(p, ox, oy, fw=FW, fh=FH):
    fr = np.zeros((fh, fw, 4), np.uint8)
    h, w = p.shape[:2]
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(fw, ox + w), min(fh, oy + h)
    fr[y0:y1, x0:x1] = p[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    return fr


def bottom_center(p, cx=None, fw=FW, fh=FH, base=BASE):
    ys = np.where(opaque(p).any(1))[0]; xs = np.where(opaque(p).any(0))[0]
    cx = (xs.min() + xs.max()) / 2 if cx is None else cx
    ox, oy = int(round(fw / 2 - cx)), base - ys.max()
    return place(p, ox, oy, fw, fh), (ox, oy)


def poly_mask(pts, shape, scale=1.0):
    m = Image.new("L", (shape[1] * SS, shape[0] * SS), 0)
    ImageDraw.Draw(m).polygon([(x * scale * SS, y * scale * SS) for x, y in pts], fill=255)
    return np.asarray(m.resize((shape[1], shape[0]), Image.BOX)) > 127


def inpaint(img, mask, r=3):
    out = img.copy()
    m = (mask & opaque(img)).astype(np.uint8) * 255
    out[..., :3] = cv2.inpaint(np.ascontiguousarray(img[..., :3]), m, r, cv2.INPAINT_TELEA)
    return out


def over(dst, src, dx=0, dy=0):
    """Alpha-composite src (same size or smaller, at offset) over dst."""
    out = dst.astype(np.float32).copy()
    h, w = src.shape[:2]
    x0, y0 = max(0, dx), max(0, dy)
    x1, y1 = min(dst.shape[1], dx + w), min(dst.shape[0], dy + h)
    if x1 <= x0 or y1 <= y0:
        return dst
    s = src[y0 - dy:y1 - dy, x0 - dx:x1 - dx].astype(np.float32)
    d = out[y0:y1, x0:x1]
    a = s[..., 3:4] / 255.0; da = d[..., 3:4] / 255.0
    oa = a + da * (1 - a)
    rgb = (s[..., :3] * a + d[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6)
    d[..., :3] = np.where(oa > 0, rgb, d[..., :3]); d[..., 3:4] = oa * 255
    out[y0:y1, x0:x1] = d
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- seated table set
# all coordinates in the seated cut (the mockup box minus the 3 px inset)
MUG_POLY = [(87, 61), (105, 61), (106, 77), (87, 78)]          # where the mockup draws the mug
MUG_REST = (76, 69)                     # new spot (bottom centre): by his far hand, reachable
FAR_ARM = [(57, 56), (64, 56), (65, 66), (63, 74), (57, 75)]   # resting far forearm (right of the torso's outline)
TABLE_BACK_Y = 64                       # table's back edge behind that forearm
ELBOW = (58.5, 59.0)                    # far elbow, at the side of his torso
MOUTH = (49.5, 45.5)
NEAR_HAND = [(42, 77), (57, 77), (58, 90), (42, 90)]           # near hand on the laptop corner
HEAD = [(30, 18), (64, 18), (64, 50), (52, 52), (40, 52), (30, 48)]
TORSO = [(22, 18), (66, 18), (66, 62), (56, 66), (44, 74), (24, 74)]   # moves when he breathes
EYES_SEAT_FINAL = [(76, 57, 84, 60), (87, 57, 94, 60)]   # on the scaled table set


def is_wood(c):
    c = c.astype(int)
    return (c[..., 0] > c[..., 1]) & (c[..., 1] > c[..., 2]) & (c[..., 0] - c[..., 2] > 45)


def is_laptop(c):
    c = c.astype(int); sat = c.max(-1) - c.min(-1)
    return (sat < 28) & (c.mean(-1) > 115)


def move_mug(seat):
    """Lift the mug off the far corner of the table (it is out of his reach there) and stand it by
    his far hand, behind the laptop's edge. Returns (table set without the mug, mug layer)."""
    region = poly_mask(MUG_POLY, seat.shape)
    mug = region & opaque(seat) & ~is_wood(seat[..., :3])
    mug = ndi.binary_closing(mug, iterations=1) & region & opaque(seat)
    layer = np.zeros_like(seat); layer[mug] = seat[mug]
    ys, xs = np.where(mug)
    layer = layer[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # the table's back edge, interpolated between the columns either side of the mug
    def edge_y(x):
        col = np.where(opaque(seat)[:, x] & is_wood(seat[..., :3])[:, x])[0]
        return col.min() if len(col) else ys.max()
    xa, xb = xs.min() - 2, xs.max() + 2
    ya, yb = edge_y(xa), edge_y(xb)
    base = inpaint(seat, ndi.binary_dilation(mug, iterations=1))
    for x in range(xs.min() - 1, xs.max() + 2):
        ye = ya + (yb - ya) * (x - xa) / (xb - xa)
        for y in range(ys.min() - 1, ys.max() + 2):
            if mug[min(max(y, 0), mug.shape[0] - 1), x] and y < ye - 0.5:
                base[y, x] = 0
    # redraw the table's dark back edge across the gap (colour of the edge either side)
    def edge_px(x):
        y = np.where(opaque(seat)[:, x])[0].min()
        return seat[y, x, :3].astype(int)
    ink = ((edge_px(xa) + edge_px(xb)) / 2).astype(np.uint8)
    for x in range(xs.min() - 1, xs.max() + 2):
        col = np.where(opaque(base)[:, x])[0]
        if len(col):
            y = col.min()
            base[y, x, :3] = ink; base[y, x, 3] = 255
            if y + 1 < base.shape[0]:
                base[y + 1, x, :3] = ((ink.astype(int) + base[y + 1, x, :3].astype(int)) // 2).astype(np.uint8)
    return base, layer


def put_mug(base, layer, bottom_center_xy):
    bx, by = bottom_center_xy
    h, w = layer.shape[:2]
    out = over(base, layer, int(round(bx - w / 2)), int(round(by - h + 1)))
    lap = is_laptop(base[..., :3]) & opaque(base)                 # laptop stays in front
    lap &= poly_mask([(58, 64), (92, 64), (92, 90), (58, 90)], base.shape)
    out[lap] = base[lap]
    return out


def capsule(shape, p0, p1, w0, w1, skin, shade, ink):
    """A shaded forearm from p0 (elbow) to p1 (wrist), supersampled; returns an RGBA layer."""
    h, w = shape[:2]
    big = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    (x0, y0), (x1, y1) = p0, p1
    vx, vy = x1 - x0, y1 - y0
    n = max(1e-6, np.hypot(vx, vy)); nx, ny = -vy / n, vx / n
    def poly(k):
        a, b = w0 / 2 * k, w1 / 2 * k
        return [((x0 + nx * a) * SS, (y0 + ny * a) * SS), ((x1 + nx * b) * SS, (y1 + ny * b) * SS),
                ((x1 - nx * b) * SS, (y1 - ny * b) * SS), ((x0 - nx * a) * SS, (y0 - ny * a) * SS)]
    d.polygon(poly(1.0), fill=tuple(ink) + (255,))
    for (cx, cy, r) in ((x0, y0, w0 / 2), (x1, y1, w1 / 2)):
        d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=tuple(ink) + (255,))
    d.polygon(poly(0.72), fill=tuple(shade) + (255,))
    # lit upper half
    a, b = w0 / 2 * 0.72, w1 / 2 * 0.72
    top = [((x0 + nx * a) * SS, (y0 + ny * a) * SS), ((x1 + nx * b) * SS, (y1 + ny * b) * SS),
           ((x1 + nx * b * 0.1) * SS, (y1 + ny * b * 0.1) * SS), ((x0 + nx * a * 0.1) * SS, (y0 + ny * a * 0.1) * SS)]
    d.polygon(top, fill=tuple(skin) + (255,))
    out = np.asarray(big.resize((w, h), Image.BOX)).copy()
    return out


def rotate_layer(layer, deg):
    im = Image.fromarray(layer)
    return np.asarray(im.rotate(deg, resample=Image.BICUBIC, expand=True))


def seated_frames(seat, hand_cup):
    """Seated table set: rest pose, breathing, blink, typing, glancing, and a coffee sip made from
    the mockup's hand-holding-a-mug card on a drawn forearm."""
    s = S_SEAT
    base, mug = move_mug(seat)
    rest_src = put_mug(base, mug, MUG_REST)
    # far forearm lifted (mug in hand): above the table's back edge there is only background;
    # below it, the table and the laptop corner are filled in from around
    farm = poly_mask(FAR_ARM, base.shape)
    noarm_src = base.copy()
    top = farm.copy(); top[TABLE_BACK_Y:] = False
    noarm_src[top] = 0
    low = farm.copy(); low[:TABLE_BACK_Y] = False
    noarm_src = inpaint(noarm_src, low)
    R = lambda im: hq_resize(im, s)
    rest, noarm = R(rest_src), R(noarm_src)
    P = lambda xy: (xy[0] * s, xy[1] * s)
    F = {}
    F["sit"] = rest
    # breathing: head and shoulders settle 2 px (the chair and table stay put)
    torso = poly_mask(TORSO, rest.shape, s) & opaque(rest)
    def breathe(f, px=2):
        lay = np.zeros_like(f); lay[torso] = f[torso]
        out = f.copy(); out[torso] = 0
        under = np.zeros_like(f); under[torso] = 0
        return over(out, g.shift(lay, 0, px))
    F["sit_br"] = breathe(rest)
    eyes = EYES_SEAT_FINAL
    # typing: the near hand taps (1-2 px), the far hand on the laptop edge too
    hand = poly_mask(NEAR_HAND, rest.shape, s) & opaque(rest) & ~is_wood(rest[..., :3]) & ~is_laptop(rest[..., :3])
    hand = ndi.binary_opening(hand)
    def tap(f, dy, dx=0):
        lay = np.zeros_like(f); lay[hand] = f[hand]
        out = f.copy()
        return over(out, g.shift(lay, dx, dy))
    F["type_1"] = tap(rest, -2); F["type_2"] = rest; F["type_3"] = tap(rest, -2, 1); F["type_4"] = tap(rest, -1, -1)
    # glancing up from the laptop: the head tilts a little about the neck
    head = poly_mask(HEAD, rest.shape, s) & opaque(rest)
    def tilt(f, deg, dx=0, dy=0):
        lay = np.zeros_like(f); lay[head] = f[head]
        piv = (int(48 * s), int(52 * s))
        im = Image.fromarray(lay).rotate(deg, resample=Image.BICUBIC, center=piv, translate=(dx, dy))
        out = f.copy(); out[head] = 0
        # fill under the moved head with the shirt / neck it covered (no hole at the collar)
        return over(over(f * 0 + out, np.asarray(im)), np.zeros_like(f))
    F["look_l"] = tilt(rest, 5, -2, 0)
    F["look_r"] = tilt(rest, -5, 2, 0)
    F["look_up"] = tilt(rest, 0, 0, -2)
    # sip: the mockup's hand-holding-a-mug card on a drawn forearm from his far elbow
    cardc = hand_cup[np.ix_(opaque(hand_cup).any(1), opaque(hand_cup).any(0))]
    cs = cardc[..., :3].astype(int)
    skin_px = cs[opaque(cardc) & (cs[..., 0] > 170) & (cs[..., 0] > cs[..., 1] + 15) & (cs[..., 1] > cs[..., 2])]
    skin = np.median(skin_px, 0).astype(int)
    shade = (skin * 0.84).astype(int); ink = np.array([78, 50, 46])
    card = hq_resize(cardc, 0.5 * s)                    # its mug matches the mug on his table
    shirt_px = rest[poly_mask([(30, 56), (52, 56), (52, 66), (30, 66)], rest.shape, s) & opaque(rest)][:, :3]
    shirt = np.median(shirt_px, 0).astype(int)
    shoulder = P((60.0, 51.0))                          # far shoulder, at the torso's edge
    ch, cw = card.shape[:2]
    # anchors in the unflipped card: hand on the left (wrist at the left edge), mug on the right
    MUG_BC, WRIST = (cw * 0.64, ch * 0.93), (1.0, ch * 0.55)
    elbow = P(ELBOW)

    def hold(bottom_xy, flip=False, deg=0.0, raised_elbow=None):
        c = card[:, ::-1] if flip else card
        mbc = (cw - 1 - MUG_BC[0], MUG_BC[1]) if flip else MUG_BC
        wr = (cw - 2.0, WRIST[1]) if flip else WRIST
        if deg:
            c = rotate_layer(np.ascontiguousarray(c), deg)
            th = np.deg2rad(deg); hh, ww = c.shape[:2]
            def rot(pt):
                x, y = pt[0] - cw / 2, pt[1] - ch / 2
                return (x * np.cos(th) + y * np.sin(th) + ww / 2, -x * np.sin(th) + y * np.cos(th) + hh / 2)
            mbc, wr = rot(mbc), rot(wr)
        ox, oy = bottom_xy[0] - mbc[0], bottom_xy[1] - mbc[1]
        out = noarm
        el = elbow
        if raised_elbow is not None:     # arm lifted away from the body: sleeve + upper arm show
            el = raised_elbow
            upper = capsule(noarm.shape, shoulder, el, 15.0, 12.0, shirt, (shirt * 0.82).astype(int), ink)
            out = over(out, upper)
        arm = capsule(noarm.shape, el, (ox + wr[0], oy + wr[1]), 11.5, 9.0, skin, shade, ink)
        return over(over(out, arm), c, int(round(ox)), int(round(oy)))
    F["sip_1"] = hold(P(MUG_REST))                                     # hand on the mug
    F["sip_2"] = hold((108, 104), flip=True, deg=6, raised_elbow=(124, 110))    # lifting
    F["sip_3"] = hold((93, 96), flip=True, deg=24, raised_elbow=(122, 104))     # at his mouth
    return F


# ---------------------------------------------------------------- the rest of the in-world set
CHILL_TORSO = [(50, 0), (114, 0), (114, 50), (106, 66), (70, 70), (50, 60)]


def masked_breathe(f, mask, px=2):
    lay = np.zeros_like(f); lay[mask] = f[mask]
    out = f.copy(); out[mask] = 0
    return over(out, g.shift(lay, 0, px))


def shirt_cx(f):
    c = f[..., :3].astype(int)
    shirt = opaque(f) & (c[..., 1] >= c[..., 2] + 10) & (c[..., 0] - c[..., 2] < 40) & (c.mean(-1) < 130) & (c.mean(-1) > 60)
    xs = np.where(shirt)[1]
    return np.median(xs) if len(xs) else None


def world_frames(src, cuts, hand_cup):
    S = seated_frames(cuts["seated"], hand_cup)
    # the table set: chair and table legs on the base row, centred; one offset for every frame
    _, (ox, oy) = bottom_center(S["sit"])
    F = {k: place(v, ox, oy) for k, v in S.items()}
    # walking (3/4 toward the viewer, heading left) and standing
    for i in range(1, 7):
        p = hq_resize(cuts[f"walk_{i}"], S_WALK)
        F[f"walk_{i}"], _ = bottom_center(p, cx=shirt_cx(p))
    F["stand"] = F.pop("walk_1")
    upper = np.arange(FH)[:, None] < 150
    F["stand_br"] = masked_breathe(F["stand"], opaque(F["stand"]) & upper, 2)
    p = hq_resize(cuts["cup_stand"], S_CUP)
    F["cup_stand"], _ = bottom_center(p, cx=shirt_cx(p))
    F["cup_stand_br"] = masked_breathe(F["cup_stand"], opaque(F["cup_stand"]) & upper, 2)
    # lounging on the sofa; when he breathes only his head and chest move
    p = hq_resize(cuts["chill"], S_SEAT)
    F["chill"], (ox, oy) = bottom_center(p)
    m = poly_mask(CHILL_TORSO, cuts["chill"].shape)
    lay = np.zeros_like(cuts["chill"]); lay[m] = cuts["chill"][m]
    tors = place(hq_resize(lay, S_SEAT), ox, oy)[..., 3] > 0
    F["chill_br"] = masked_breathe(F["chill"], tors & opaque(F["chill"]), 2)
    return F


# ---------------------------------------------------------------- close-ups
def closeup_frames(cuts):
    """Busts on 160x160 frames, lined up on the head: hair top on row 10, head centred. The
    bottom bust rows are drawn larger on the sheet, so they get a smaller factor."""
    big_rows = ("look_9", "look_10", "look_11", "micro_1", "micro_2", "micro_3")
    out = {}
    for k in [k for k in mc.BUSTS if k not in ("stressed", "anxious", "sad")]:
        im = cuts[k].copy()
        lum = im[..., :3].astype(int).mean(-1)
        im[:5][lum[:5] > 140] = 0                        # the cell's light frame line above the hair
        im = g.drop_specks(im, 25)
        f = 0.74 if k in big_rows else 0.86 if k.startswith("sip") else 1.0
        p = hq_resize(im, S_CLOSE * f)
        ys = np.where(opaque(p).any(1))[0]
        top = ys.min()
        band = opaque(p)[top:top + int(p.shape[0] * 0.3)]
        xs = np.where(band.any(0))[0]
        cx = (xs.min() + xs.max()) / 2
        out["cu_" + k] = place(p, int(round(CW / 2 - cx)), 10 - top, CW, CH)
    return out


def anims_def():
    T = 120
    return {
        "world": [
            ("sit_idle", [("sit", 2200), ("sit_br", 900), ("sit", 1600), ("sit_br", 900)], -1,
             "his default: sitting at his table, breathing"),
            ("sit_type", [("type_1", 110), ("sit", 110), ("type_3", 110), ("sit", 110), ("type_4", 110), ("sit", 110)] * 3
             + [("sit", 500)], -1, "typing on his laptop"),
            ("sit_look", [("sit", 300), ("look_l", 1300), ("sit", 400), ("look_r", 1300), ("sit", 300)], 0,
             "glances up and around the room (someone walks in, the door bell)"),
            ("sit_sip", [("sit", 200), ("sip_1", 320), ("sip_2", 260), ("sip_3", 1200), ("sip_2", 260), ("sip_1", 320),
                         ("sit", 300)], 0, "drinks his coffee"),
            ("walk_sw", [(f"walk_{i}", T) for i in (2, 3, 4, 5, 6)], -1,
             "walking 3/4 toward the viewer, heading left (flipX for SE)"),
            ("stand", [("stand", 1500), ("stand_br", 700)], -1, "standing (at the counter, at the door)"),
            ("stand_cup", [("cup_stand", 1500), ("cup_stand_br", 700)], -1, "standing with a coffee (refill trip)"),
            ("chill", [("chill", 1800), ("chill_br", 900)], -1, "lounging on his sofa"),
        ],
        "closeup": [
            ("cu_idle", [(f"cu_idle_{i}", 220) for i in (5, 6, 7, 8, 7, 6)], -1, "close-up: idle micro-movements"),
            ("cu_idle_face", [(f"cu_idle_{i}", 240) for i in (1, 2, 3, 4, 3, 2)], -1, "close-up, face only"),
            ("cu_look", [("cu_look_5", 600), ("cu_look_6", 500), ("cu_look_7", 700), ("cu_look_8", 500),
                         ("cu_look_9", 600), ("cu_look_10", 500), ("cu_look_11", 600)], -1, "close-up: looking around"),
            ("cu_sip", [("cu_sip_1", 700), ("cu_sip_2", 1100), ("cu_sip_1", 500)], 0, "close-up: a sip"),
            ("cu_micro", [(f"cu_micro_{i}", 300) for i in (1, 2, 3, 2)], -1, "close-up: body micro-movements"),
        ],
    }


# ---------------------------------------------------------------- sheets, portraits, cards
def pack(frames, prefix, image_name, fw, fh, base, cols=8):
    names = sorted(frames)
    rows = -(-len(names) // cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    atlas = {"frames": {}, "meta": {"app": "matt_build.py", "version": "1.0", "image": image_name,
                                    "format": "RGBA8888", "size": {"w": cols * fw, "h": rows * fh}, "scale": "1"}}
    for i, n in enumerate(names):
        x, y = (i % cols) * fw, (i // cols) * fh
        sheet.alpha_composite(Image.fromarray(frames[n]), (x, y))
        atlas["frames"][f"{prefix}{n}"] = {
            "frame": {"x": x, "y": y, "w": fw, "h": fh}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh}, "sourceSize": {"w": fw, "h": fh},
            "pivot": {"x": 0.5, "y": round((base + 1) / fh, 4)}}
    return sheet, atlas


def trim(im, margin=1):
    ys, xs = np.where(opaque(im))
    return im[max(0, ys.min() - margin):ys.max() + margin + 1, max(0, xs.min() - margin):xs.max() + margin + 1]


def cards(src):
    out = {}
    for name, (x0, y0, x1, y1) in mc.CARDS.items():
        c = src.img[y0:y1, x0:x1].astype(np.uint8)
        d_model, _ = cc.background_model(c, src)
        bgc = cc.bg_cand(c, src, 26) & (d_model < 30)
        seeds = np.zeros_like(bgc); seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
        lab, _ = ndi.label(bgc)
        ids = np.unique(lab[seeds & bgc]); ids = ids[ids > 0]
        fg = ~np.isin(lab, ids)
        lab2, n = ndi.label(fg)
        if n > 1:
            sizes = ndi.sum(fg, lab2, range(1, n + 1))
            fg = np.isin(lab2, [i + 1 for i, s_ in enumerate(sizes) if s_ >= 0.08 * sizes.max()])
        fg = ndi.binary_fill_holes(fg)
        rgba = np.zeros(c.shape[:2] + (4,), np.uint8); rgba[..., :3] = c; rgba[..., 3] = fg * 255
        out[name] = trim(cc.peel(rgba, src, loose=0, gb_up=0, d_model=d_model))
    return out


def load(mockup_dir):
    allb = dict(mc.WORLD); allb.update(mc.BUSTS); allb.update(mc.FACES); allb["portrait"] = mc.PORTRAIT
    src = mc.tune(cc.load_source(os.path.join(mockup_dir, "matt_mockup.png"), allb, strict=True))
    cuts = {k: cc.cut(src, b, **mc.opts(k)) for k, b in allb.items()}
    hand_cup = cc.cut(src, (825, 318, 890, 360), **dict(mc.BASE))
    return src, cuts, hand_cup


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mockups", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    src, cuts, hand_cup = load(args.mockups)
    W = world_frames(src, cuts, hand_cup)
    C = closeup_frames(cuts)
    A = anims_def()
    d = os.path.join(args.out, "matt")
    if os.path.exists(d):
        shutil.rmtree(d)
    for sub in ("frames", "portraits", "cards"):
        os.makedirs(os.path.join(d, sub))
    for tex, frames, fw, fh, base, key in (("matt", W, FW, FH, BASE, "world"), ("matt_closeup", C, CW, CH, CH - 1, "closeup")):
        missing = [f for _, seq, _, _ in A[key] for f, _ in seq if f not in frames]
        assert not missing, missing
        sheet, atlas = pack(frames, "matt_", f"{tex}_sheet.png", fw, fh, base)
        sheet.save(os.path.join(d, f"{tex}_sheet.png"))
        json.dump(atlas, open(os.path.join(d, f"{tex}_sheet.json"), "w"), indent=1)
        for n, f in frames.items():
            Image.fromarray(f).save(os.path.join(d, "frames", f"matt_{n}.png"))
        meta = {"texture": tex, "frameSize": {"w": fw, "h": fh},
                "anims": [{"key": f"matt_{k}", "frames": [{"frame": f"matt_{f}", "duration": t} for f, t in seq],
                           "repeat": rep, "use": use} for k, seq, rep, use in A[key]]}
        if key == "closeup":
            meta["origin"] = {"x": 0.5, "y": 1.0}
        if key == "world":
            meta.update({"origin": {"x": 0.5, "y": round((BASE + 1) / FH, 4)},
                         "seat": {"note": "sit_* frames include his own chair, table, laptop and mug. The origin is "
                                          "the floor point under the table set; depth-sort by y like furniture.",
                                  "footprint_tiles": [2, 2]},
                         "facing": {"SW": "walk_sw", "SE": "walk_sw + flipX"}})
        json.dump(meta, open(os.path.join(d, f"{tex}_anims.json"), "w"), indent=1)
    # portraits: the big bust, face and hair studies (mockup size), emotions at 2x
    Image.fromarray(trim(cuts["portrait"])).save(os.path.join(d, "portraits", "matt_portrait_main.png"))
    for k in mc.FACES:
        Image.fromarray(trim(cuts[k])).save(os.path.join(d, "portraits", f"matt_{k}.png"))
    for k in ("stressed", "anxious", "sad"):
        Image.fromarray(hq_resize(trim(cuts[k]), 2.0)).save(os.path.join(d, "portraits", f"matt_emotion_{k}.png"))
    for name, im in cards(src).items():
        Image.fromarray(im).save(os.path.join(d, "cards", f"matt_card_{name}.png"))
    prev = os.path.join(args.out, "previews"); os.makedirs(prev, exist_ok=True)
    preview(W, A["world"], C, A["closeup"], os.path.join(prev, "matt_animations.webp"))
    grid = dict(W); grid.update({k: place(v, (FW - CW) // 2, FH - CH - 4) for k, v in C.items()})
    cb.FW, cb.FH = FW, FH
    cb.preview_grid(grid, os.path.join(prev, "matt_all_frames.png"), cols=10)
    print(f"matt: {len(W)} world frames, {len(C)} close-up frames, {len(A['world'])} + {len(A['closeup'])} animations")


def preview(W, AW, C, AC, path, tick=60, seconds=6.0):
    items = [(k, seq, rep, W, FW, FH) for k, seq, rep, _ in AW] + [(k, seq, rep, C, CW, CH) for k, seq, rep, _ in AC]
    cols = 7; cw, ch = FW + 6, FH + 18
    rows = -(-len(items) // cols)
    frames = []
    for t in range(int(seconds * 1000 / tick)):
        now = t * tick
        im = Image.new("RGB", (cols * cw + 6, rows * ch + 6), (122, 110, 104)); dr = ImageDraw.Draw(im)
        for i, (key, seq, rep, fr, fw, fh) in enumerate(items):
            total = sum(d for _, d in seq)
            tt = now % total if rep != 0 else (min(now, total - 1) if now < total + 700 else (now - total - 700) % total)
            acc = 0
            for fname, dur in seq:
                acc += dur
                if tt < acc:
                    break
            x = 6 + (i % cols) * cw; y = 6 + (i // cols) * ch
            f = Image.fromarray(fr[fname])
            im.paste(f, (x + (FW - fw) // 2, y + (FH - fh)), f)
            dr.text((x, y + FH + 3), "matt_" + key, fill=(240, 232, 220))
        frames.append(im)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=tick, loop=0, quality=92, method=4)


if __name__ == "__main__":
    main()
