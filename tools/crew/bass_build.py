#!/usr/bin/env python3
"""
Build Jonas's second outfit: the lederhosen bassist (mockup M-002).

  python3 tools/bass_build.py --mockups source --out .

Same full-quality rules and frame layout as the crew packs (192x240 frames, standing height 196,
feet on row 236). Writes jonas_bass/ with texture `jonas_bass` and animations `jonas_bass_*`.

The sheet draws him WITH the bass in the front views, the playing cycle, the talking poses and the
busts, and WITHOUT it in the profile and back views, the runs, and the celebrate / head-scratch /
floor poses. The pack keeps that split: "bass on" and "bass off" animations.
"""
import argparse, json, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import crew_cut as cc
import crew_build as cb
import gen_anims as g
from hq import hq_resize
from crew_config import BASS_BOXES, BASS_CARDS, BASS_ITEMS, BASS_ITEM_ERASE, bass_opts

NAME = "jonas_bass"
MOCKUP = "jonas_bass_mockup.png"
FW, FH, BASE, TARGET = cb.FW, cb.FH, cb.BASE, cb.TARGET
opaque, figure_rows, place, place_feet = cb.opaque, cb.figure_rows, cb.place, cb.place_feet


# ---------------------------------------------------------------- lederhosen helpers
def is_leather(f):
    c = f[..., :3].astype(int); r, gg, b = c[..., 0], c[..., 1], c[..., 2]
    lum = c.mean(-1); sat = c.max(-1) - c.min(-1)
    return (opaque(f) & (r > gg) & (gg - b >= 10) & (r - b >= 30) & (r - b <= 80) & (lum > 35)
            & (lum < 112) & (sat < 85))


def belt_row(f, start=0.48):
    """Top of the lederhosen below the shirt (the chest bar higher up is skipped)."""
    top, bot = figure_rows(f)
    h = bot - top + 1
    lea = is_leather(f); op = opaque(f)
    for y in range(top + int(h * start), bot + 1):
        n = op[y].sum()
        if n and lea[y].sum() / n > 0.40 and lea[y].sum() >= 6:
            return y
    return None


# point the shared helpers (crew_build and gen_anims) at the lederhosen
cb.is_pants = is_leather
cb.belt_row = belt_row
g.is_jeans = is_leather
g.belt_row = belt_row


def is_bass(f):
    """Sunburst body, pickguard and neck of the bass: saturated reds/oranges, plus the white
    pickguard next to them."""
    c = f[..., :3].astype(int); r, gg, b = c[..., 0], c[..., 1], c[..., 2]
    sat = c.max(-1) - c.min(-1)
    warm = opaque(f) & (sat > 90) & (r > gg + 40)
    return ndi.binary_closing(warm, iterations=2)


def bass_bottom(f):
    ys = np.where(is_bass(f).any(1))[0]
    return ys.max() if len(ys) else None


def head_cx(f, frac=0.22):
    top, bot = figure_rows(f)
    band = opaque(f)[top:top + max(3, int((bot - top) * frac))]
    xs = np.where(band.any(0))[0]
    return (xs.min() + xs.max()) / 2


def mirror_legs(f, from_row=None):
    """The other foot forward: everything below `from_row` (below the bass) mirrored around the
    hips, the rest - head, hands and the bass - as drawn (a bass must never flip)."""
    top, bot = figure_rows(f)
    if from_row is None:            # just below the shorts (the bass ends above them)
        lea = is_leather(f)
        rows = [y for y in range(top + (bot - top) // 2, bot + 1) if lea[y].sum() >= 6]
        from_row = (max(rows) + 2) if rows else top + int((bot - top) * 0.72)
    lower = np.zeros(f.shape[:2], bool); lower[from_row:] = True
    xs = np.where(opaque(f)[from_row:from_row + 6].any(0))[0]
    hx = (xs.min() + xs.max()) / 2
    m = f[:, ::-1]
    dx = int(round(hx - (FW - 1 - hx)))
    m = g.shift(m, dx, 0)
    out = f.copy()
    out[lower] = 0
    out[lower] = m[lower]
    return out


def lift_leg(f, side, px):
    """Raise one lower leg (side 'l' or 'r' in the image) by px: a step seen from behind."""
    top, bot = figure_rows(f)
    lea = is_leather(f)
    hem = max(y for y in range(top, bot + 1) if lea[y].any())       # bottom of the shorts
    y0 = hem - 4
    xs = np.where(opaque(f)[y0:].any(0))[0]
    hx = (xs.min() + xs.max()) / 2
    X = np.arange(FW)[None, :]
    region = np.zeros(f.shape[:2], bool); region[y0:] = True
    region &= (X < hx) if side == "l" else (X >= hx)
    region &= opaque(f)
    out = f.copy()
    layer = np.zeros_like(f); layer[region] = f[region]
    out[region] = 0
    up = g.shift(layer, 0, -px)
    sel = up[..., 3] > 0
    out[sel] = up[sel]
    return out


def shorts_from_bottom(f, bottom=None):
    """(top row, bottom row, left, right) of the lederhosen shorts, found from the bottom of the
    shorts upward while the rows stay mostly leather."""
    lea = is_leather(f)
    top, bot = figure_rows(f)
    counts = lea.sum(1)
    if bottom is None:
        # the shorts are the longest run of solidly-leather rows in the lower part of the figure
        # (brown shoes also read as leather, but only for a few rows)
        lo = top + int((bot - top) * 0.35)
        strong = counts[lo:bot + 1] >= 0.55 * counts[lo:bot + 1].max()
        best, start = (0, lo), None
        for i, v in enumerate(list(strong) + [False]):
            if v and start is None:
                start = i
            elif not v and start is not None:
                if i - start > best[0]:
                    best = (i - start, lo + start)
                start = None
        bottom = best[1] + best[0] - 1
    ref = np.median(counts[bottom - 6:bottom + 1])
    y = bottom
    while y > top and counts[y - 1] >= 0.5 * ref:
        y -= 1
    xs = np.where(lea[max(y, bottom - 8):bottom + 1].any(0))[0]
    return y, bottom, xs.min(), xs.max()


def row_core(row, gap=12):
    """(left, right) of the longest run of True in a row, bridging gaps up to `gap` px (wide
    enough to join the two legs of the shorts)."""
    xs = np.where(row)[0]
    if not len(xs):
        return None
    runs, a = [], xs[0]
    for p, q in zip(xs[:-1], xs[1:]):
        if q - p > gap + 1:
            runs.append((a, p)); a = q
    runs.append((a, xs[-1]))
    return max(runs, key=lambda r: r[1] - r[0])


def hand_mask(f, y0, y1, x_left, x_right):
    """Skin (and its outline) outside the columns x_left..x_right, rows y0..y1: hanging hands."""
    c = f[..., :3].astype(int); r, gg, b = c[..., 0], c[..., 1], c[..., 2]
    skin = opaque(f) & (r - gg > 12) & (gg - b < 10) & (r > 70)
    zone = np.zeros(f.shape[:2], bool); zone[y0:y1] = True
    zone[:, x_left:x_right + 1] = False
    m = skin & zone
    m = ndi.binary_dilation(m, iterations=1) & opaque(f) & zone
    return m


def leather_span(f, y0, y1):
    """Median left/right edge of the shorts over rows y0..y1 (the main leather run per row, so a
    hand or a stray brown pixel beside the shorts doesn't widen it)."""
    lea = is_leather(f)
    spans = [row_core(lea[y]) for y in range(y0, y1)]
    spans = [r for r in spans if r is not None]
    return int(np.median([r[0] for r in spans])), int(np.median([r[1] for r in spans]))


def compose_upper(upper_cut, legs, hands=(), seam=5):
    """A waist-up pose (cut, unscaled; its cell ends part-way down the shorts) on the standing legs
    of `legs` (a placed frame). Joined at the lederhosen waistband: the upper pose is scaled so its
    waist is as wide as the legs' waist, and everything below the waistband - shorts, knees, socks,
    shoes - comes from the legs frame, so there is no step in the shorts. The legs frame's hanging
    arms are removed. `hands`: sides ('l', 'r') where the upper pose's arm hangs down past the
    cell's bottom edge; the legs frame's hand on that side is attached to the end of that arm."""
    lt, lb, _, _ = shorts_from_bottom(legs)
    ub0 = figure_rows(upper_cut)[1] - 1
    ut, _, _, _ = shorts_from_bottom(upper_cut, bottom=ub0)
    a0, a1 = leather_span(legs, lt + 1, lt + seam)
    b0, b1 = leather_span(upper_cut, ut + 1, ut + seam)
    up = hq_resize(upper_cut, (a1 - a0 + 1) / (b1 - b0 + 1))
    ub0 = figure_rows(up)[1] - 1
    ut, _, _, _ = shorts_from_bottom(up, bottom=ub0)
    b0, b1 = leather_span(up, ut + 1, ut + seam)
    upf, _ = place(up, int(round((a0 + a1) / 2 - (b0 + b1) / 2)), lt - ut)
    cut = lt + seam                                      # rows from here down come from the legs
    X = np.arange(FW)
    lea_l, lea_u = is_leather(legs), is_leather(upf)
    def body_mask(f, lea, y0, y1):
        """Per row, the shorts: the main leather run, with its left and right edges median-
        filtered down the rows so a hand or stray brown pixel can't widen a single row."""
        m = np.zeros(f.shape[:2], bool)
        ys, L, Rr = [], [], []
        for y in range(y0, min(y1, FH)):
            r = row_core(lea[y])
            if r is not None:
                ys.append(y); L.append(r[0]); Rr.append(r[1])
        if not ys:
            return m
        L = ndi.median_filter(np.array(L), size=9, mode="nearest")
        Rr = ndi.median_filter(np.array(Rr), size=9, mode="nearest")
        for y, l, r in zip(ys, L, Rr):
            m[y, max(0, l - 1):r + 2] = True
        return m
    # legs part: shorts and legs only
    legs_part = legs.copy(); legs_part[:cut] = 0
    shorts = body_mask(legs, lea_l, cut, lb + 1)
    legs_part[cut:lb + 1][~shorts[cut:lb + 1]] = 0
    h0, h1 = leather_span(legs, lb - 3, lb + 1)
    below = np.zeros_like(shorts); below[lb + 1:, h0 - 3:h1 + 4] = True
    legs_part[lb + 1:][~below[lb + 1:]] = 0
    # the legs frame's own arms: hands beside the shorts go, then any piece separate from the
    # shorts and legs
    legs_part[hand_mask(legs, cut, lb - 1, a0 + 6, a1 - 6)] = 0      # (knees below lb stay)
    core = ndi.binary_opening(opaque(legs_part), structure=np.ones((3, 3), bool))
    lab, n = ndi.label(core)
    if n > 1:
        sizes = ndi.sum(core, lab, range(1, n + 1))
        main = ndi.binary_dilation(lab == (np.argmax(sizes) + 1), iterations=2) & opaque(legs_part)
        legs_part[~main] = 0
    # upper part: everything above the seam; below it only an arm named in `hands`
    upper_part = upf.copy()
    ushorts = body_mask(upf, lea_u, cut, FH)
    below = np.zeros(upf.shape[:2], bool); below[cut:] = True
    keep_arm = np.zeros_like(below)
    for side in hands:
        keep_arm |= (X < (a0 + a1) / 2)[None, :] if side == "l" else (X >= (a0 + a1) / 2)[None, :]
    upper_part[below & (ushorts | ~keep_arm)] = 0
    out = legs_part.copy()
    m = opaque(upper_part); out[m] = upper_part[m]
    # hands for arms cut off by the cell
    for side in hands:
        sel = (X < (a0 + a1) / 2) if side == "l" else (X >= (a0 + a1) / 2)
        arm = opaque(upper_part) & sel[None, :] & ~shorts & ~ushorts
        arm[:cut] = False
        if not arm.any():
            continue
        lab, n = ndi.label(arm)
        sizes = ndi.sum(arm, lab, range(1, n + 1)); arm = lab == (np.argmax(sizes) + 1)
        arm_end = np.where(arm.any(1))[0].max()
        ax = np.where(arm[arm_end - 2:arm_end + 1].any(0))[0]
        hand = hand_mask(legs, lt, lb + 4, a0 + 6, a1 - 6) & sel[None, :]
        if not hand.any():
            continue
        lab, n = ndi.label(hand)
        sizes = ndi.sum(hand, lab, range(1, n + 1)); hand = lab == (np.argmax(sizes) + 1)
        hy = np.where(hand.any(1))[0]
        hrows = hy[:max(1, len(hy) // 3)]                # upper third of the hanging forearm
        hx = np.where(hand[hrows].any(0))[0]
        dx, dy = int(round(ax.mean() - hx.mean())), arm_end - 3 - hy.min()
        lay = np.zeros_like(legs); lay[hand] = legs[hand]
        lay = g.shift(lay, dx, dy)
        lay[:arm_end - 1] = 0
        keep = opaque(lay) & ~opaque(out); out[keep] = lay[keep]
    return g.drop_specks(out, 30)


# ---------------------------------------------------------------- build
EYES = {  # eye boxes on the final frames (x0, y0, x1, y1 inclusive), inside the glasses
    "idle_s": [(87, 71, 93, 74), (102, 71, 108, 74)],
    "calm": [(90, 71, 97, 75), (103, 71, 110, 75)],
}


def build(mockup_dir):
    src = cc.load_source(os.path.join(mockup_dir, MOCKUP), BASS_BOXES, strict=True)
    cuts = {k: cc.cut(src, BASS_BOXES[k], **bass_opts(k)) for k in BASS_BOXES}
    h = lambda k: (lambda t: t[1] - t[0] + 1)(figure_rows(cuts[k]))
    s_walk = TARGET / h("w1")          # walk, runs and the playing cycle share one scale
    s_pose = TARGET / h("calm")        # talking poses and emotions
    walk = ("w1", "w2", "w3", "side", "back", "run_side", "run_front")
    play = ("p1", "p2", "p3", "p4", "p5", "p10", "p11", "p12")
    pose = ("calm", "gesture", "vocal", "flustered", "triumphant", "confused", "chill")
    R = {k: hq_resize(cuts[k], s_walk) for k in walk + play}
    R.update({k: hq_resize(cuts[k], s_pose) for k in pose})

    F, warn = {}, []
    def put(k, p, clip):
        F[k] = p
        if clip > 2:
            warn.append(f"{k} clipped {clip}px")
    for k in walk + ("calm", "gesture", "vocal", "flustered"):
        cx = head_cx(R[k]) if k in ("w1", "w2", "calm", "gesture", "vocal", "flustered") else None
        put(k, *place_feet(R[k], cx))
    # playing cycle: his feet stay planted, so every frame is lined up on its feet (bottom rows)
    for k in play:
        p = R[k]
        ys = np.where(opaque(p).any(1))[0]
        xs = np.where(opaque(p)[ys.max() - 10:ys.max() + 1].any(0))[0]
        put(k, *place(p, int(round(FW / 2 - (xs.min() + xs.max()) / 2)), BASE - ys.max()))
    ys = np.where(opaque(R["chill"]).any(1))[0]; xs = np.where(opaque(R["chill"]).any(0))[0]
    put("chill", *place(R["chill"], int(round(FW / 2 - (xs.min() + xs.max()) / 2)), BASE - ys.max()))

    D = {}
    br = lambda f: g.breathe(f, 3)
    # ---- bass on: standing, walking toward the viewer, playing, talking
    D["idle_s"] = F["w1"]; D["idle_s_br"] = br(F["w1"])
    D["walk_s_1"] = F["w2"]; D["walk_s_2"] = F["w1"]
    D["walk_s_3"] = mirror_legs(F["w2"]); D["walk_s_4"] = F["w1"]
    for k in play:
        D["play_" + k[1:]] = F[k]
    D["play_10_dip"] = g.shift(F["p10"], 0, 2)            # a small dip on the down-stroke
    D["calm"] = F["calm"]; D["calm_br"] = br(F["calm"])
    D["gesture"] = F["gesture"]; D["gesture_br"] = br(F["gesture"])
    D["vocal"] = F["vocal"]; D["vocal_br"] = br(F["vocal"])
    D["vocal_l"] = g.shift(F["vocal"], -3, 0); D["vocal_r"] = g.shift(F["vocal"], 3, 0)
    D["flustered"] = F["flustered"]; D["flustered_br"] = br(F["flustered"])
    D["flustered_l"] = g.shift(F["flustered"], -3, 0); D["flustered_r"] = g.shift(F["flustered"], 3, 0)
    # ---- bass off: free walking, profile, back, runs, celebrate, head-scratch, floor
    D["free_s_1"] = F["w3"]; D["free_s_2"] = cb.mirror_keep_head(F["w3"])
    stand_e = g.swing_legs(F["side"], 1.0, 3)          # the side cell is mid-stride: close it
    D["idle_e"] = stand_e; D["idle_e_br"] = br(stand_e)
    D["walk_e_1"] = F["side"]; D["walk_e_2"] = g.swing_legs(F["side"], 0.85, 3)
    D["idle_n"] = F["back"]; D["idle_n_br"] = br(F["back"])
    D["walk_n_1"] = lift_leg(F["back"], "l", 7); D["walk_n_2"] = F["back"]
    D["walk_n_3"] = lift_leg(F["back"], "r", 7); D["walk_n_4"] = F["back"]
    D["run_s_1"] = F["run_front"]; D["run_s_2"] = cb.hop(F["run_front"], 5)
    D["run_s_3"] = cb.mirror_keep_head(F["run_front"]); D["run_s_4"] = cb.hop(D["run_s_3"], 5)
    flight = g.swing_legs(F["run_side"], 0.3, 3)        # legs a little closer: mid-air
    D["run_e_1"] = F["run_side"]; D["run_e_2"] = cb.hop(flight, 7)
    D["run_e_3"] = cb.hop(F["run_side"], 2); D["run_e_4"] = cb.hop(flight, 4)
    cel = compose_upper(cuts["triumphant"], F["w3"])
    D["celebrate"] = cel
    for o in (3, 9, 12):
        D[f"celebrate_up{o}"] = cb.hop(cel, o)
    conf = compose_upper(cuts["confused"], F["w3"], hands=("l",))
    D["confused"] = conf; D["confused_br"] = br(conf)
    D["sit_floor"] = F["chill"]; D["sit_floor_br"] = br(F["chill"])
    for name, boxes in EYES.items():
        D[name + "_bl"] = g.blink_eyes(D[name], boxes, lid_below=(4, 7))
    D = {k: g.drop_specks(v, 30) for k, v in D.items()}
    return src, cuts, D, warn


def anims_def():
    has = lambda n: n in EYES
    W, RN, P = 125, 85, 110
    idle = [("idle_s", 1500), ("idle_s_br", 700), ("idle_s", 1000)]
    idle += [("idle_s_bl", 120)] if has("idle_s") else []
    idle += [("idle_s", 700), ("idle_s_br", 700)]
    calm = [("calm", 1400), ("calm_br", 700)] + ([("calm_bl", 120)] if has("calm") else []) + [("calm", 900), ("calm_br", 700)]
    shake = lambda n: [(n, 80), (n + "_l", 80), (n, 80), (n + "_r", 80)] * 2
    cycle = [(f"play_{i}", P) for i in (1, 2, 3, 4, 5, 10, 11, 12)]
    groove = [(f"play_{i}", P) for i in (1, 2, 3, 4, 5)] + [("play_10_dip", P), ("play_11", P), ("play_12", P)]
    cel = [("celebrate", 80), ("celebrate_up3", 70), ("celebrate_up9", 70), ("celebrate_up12", 120),
           ("celebrate_up9", 70), ("celebrate_up3", 70), ("celebrate", 160)] * 2
    return [
        # bass on
        ("idle_s", idle, -1, "standing with the bass, facing the viewer"),
        ("walk_s", [(f"walk_s_{i}", W) for i in range(1, 5)], -1, "walking toward the viewer with the bass"),
        ("play_s", cycle, -1, "playing the bass: the 12-step cycle as drawn (frames 1-5, 10-12)"),
        ("play_groove_s", groove, -1, "playing with a small dip on the down-stroke (livelier)"),
        ("play_slow_s", [(f, 180) for f, _ in cycle], -1, "slow ballad tempo"),
        ("calm_s", calm, -1, "relaxed, bass hanging, while chatting"),
        ("talk_s", [("calm", 450), ("gesture", 900), ("calm_br", 400), ("gesture_br", 700)], -1, "talking"),
        ("gesture_s", [("gesture", 1200), ("gesture_br", 600)], 0, "\"check it out!\""),
        ("oops_s", shake("vocal") + [("vocal", 900), ("vocal_br", 600)], 0, "\"uh-oh!\" (wrong note)"),
        ("flustered_s", shake("flustered") + [("flustered", 800), ("flustered_br", 600)], 0, "flustered"),
        # bass off
        ("walk_free_s", [("free_s_1", 170), ("free_s_2", 170)], -1, "walking toward the viewer, no bass"),
        ("idle_e", [("idle_e", 1500), ("idle_e_br", 700)], -1, "standing in profile (flipX for west)"),
        ("walk_e", [("walk_e_1", W), ("walk_e_2", W)] * 2, -1, "walking in profile (flipX for west)"),
        ("idle_n", [("idle_n", 1500), ("idle_n_br", 700)], -1, "standing, back to the viewer"),
        ("walk_n", [(f"walk_n_{i}", W) for i in range(1, 5)], -1, "walking away"),
        ("run_s", [(f"run_s_{i}", RN) for i in range(1, 5)], -1, "running toward the viewer"),
        ("run_e", [(f"run_e_{i}", RN) for i in range(1, 5)], -1, "running in profile (flipX for west)"),
        ("celebrate_s", cel, 0, "fists in the air (end of a song, a book finished)"),
        ("confused_s", [("confused", 1300), ("confused_br", 700)], -1, "scratching his head"),
        ("sit_floor", [("sit_floor", 1600), ("sit_floor_br", 800)], -1, "chilling on the floor"),
    ]


def portraits(src, cuts):
    calm = cuts["calm"]
    t, b = figure_rows(calm)
    crops = {"main": cb.trim(calm[:t + int((b - t) * 0.40)])}
    for k in ("stern", "anxious", "sad", "exhausted", "wink", "confused_bust"):
        crops[k.replace("_bust", "")] = cb.trim(cuts[k])
    side = max(max(c.shape[:2]) for c in crops.values())
    out = {}
    for name, c in crops.items():
        canvas = np.zeros((side, side, 4), np.uint8)
        hh, ww = c.shape[:2]
        canvas[side - hh:, (side - ww) // 2:(side - ww) // 2 + ww] = c
        out[name] = canvas
    return out


def fret_cards(src):
    """The fretboard close-ups, kept as drawn (opaque cards) on one shared size."""
    cards = {k: src.img[y0 + 2:y1 - 1, x0 + 2:x1 - 1].astype(np.uint8) for k, (x0, y0, x1, y1) in BASS_CARDS.items()}
    hh = min(c.shape[0] for c in cards.values()); ww = min(c.shape[1] for c in cards.values())
    return {k: np.concatenate([c[:hh, :ww], np.full((hh, ww, 1), 255, np.uint8)], -1) for k, c in cards.items()}


def item_icons(src):
    out = {}
    for name, (x0, y0, x1, y1) in BASS_ITEMS.items():
        c = src.img[y0:y1, x0:x1].copy()
        for (ex0, ey0, ex1, ey1) in BASS_ITEM_ERASE.get(name, ()):
            c[max(0, ey0 - y0):ey1 - y0, max(0, ex0 - x0):ex1 - x0] = src.beige[0]
        d_model, _ = cc.background_model(c, src)
        bgc = cc.bg_cand(c, src, 30, loose=8, gb_up=4) & (d_model < 34)
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
        out[name] = cb.trim(cc.peel(rgba, src, loose=6, gb_up=3, d_model=d_model), 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mockups", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    src, cuts, D, warn = build(args.mockups)
    anims = anims_def()
    missing = [f for _, seq, _, _ in anims for f, _ in seq if f not in D]
    assert not missing, missing
    d = os.path.join(args.out, NAME)
    if os.path.exists(d):
        shutil.rmtree(d)
    for sub in ("frames", "portraits", "icons", "fretboard"):
        os.makedirs(os.path.join(d, sub))
    sheet, atlas = cb.pack(D, f"{NAME}_", f"{NAME}_sheet.png")
    sheet.save(os.path.join(d, f"{NAME}_sheet.png"))
    json.dump(atlas, open(os.path.join(d, f"{NAME}_sheet.json"), "w"), indent=1)
    for n, f in D.items():
        Image.fromarray(f).save(os.path.join(d, "frames", f"{NAME}_{n}.png"))
    anim_json = {
        "texture": NAME, "frameSize": {"w": FW, "h": FH},
        "origin": {"x": 0.5, "y": round((BASE + 1) / FH, 4)}, "standHeight": TARGET,
        "iso_facing": {"S": "_s", "SE": "_s", "SW": "_s", "E": "_e", "W": "_e + flipX",
                       "N": "_n", "NE": "_n", "NW": "_n"},
        "bass_on": ["idle_s", "walk_s", "play_s", "play_groove_s", "play_slow_s", "calm_s", "talk_s",
                    "gesture_s", "oops_s", "flustered_s"],
        "anims": [{"key": f"{NAME}_{k}", "frames": [{"frame": f"{NAME}_{f}", "duration": dur} for f, dur in seq],
                   "repeat": rep, "use": use} for k, seq, rep, use in anims],
    }
    json.dump(anim_json, open(os.path.join(d, f"{NAME}_anims.json"), "w"), indent=1)
    for name, im in portraits(src, cuts).items():
        Image.fromarray(im).save(os.path.join(d, "portraits", f"{NAME}_portrait_{name}.png"))
    for name, im in item_icons(src).items():
        Image.fromarray(im).save(os.path.join(d, "icons", f"icon_{name}.png"))
    for name, im in fret_cards(src).items():
        Image.fromarray(im).save(os.path.join(d, "fretboard", f"{NAME}_{name}.png"))
    prev = os.path.join(args.out, "previews"); os.makedirs(prev, exist_ok=True)
    cb.preview_grid(D, os.path.join(prev, f"{NAME}_all_frames.png"))
    cb.preview_anim(D, anims, os.path.join(prev, f"{NAME}_animations.webp"), cols=10)
    print(f"{NAME}: {len(D)} frames, {len(anims)} animations", "; ".join(warn))


if __name__ == "__main__":
    main()
