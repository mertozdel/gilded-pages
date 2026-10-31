"""Frame boxes for Matt, the regular (mockup M-004). Boxes are (x0, y0, x1, y1) in the mockup;
erase / marks rectangles are in crop coordinates (box minus the 3 px inset)."""

# in-world sprites (full figure, or figure with his own table / sofa)
WORLD = {
    "seated": (25, 177, 166, 293),            # his chair, table, laptop and mug, 3/4 view
    # walk figures stand close together: boxes overlap and the cut keeps the centre figure
    "walk_1": (30, 343, 104, 479), "walk_2": (80, 343, 146, 479), "walk_3": (122, 343, 188, 479),
    "walk_4": (165, 343, 230, 479), "walk_5": (208, 343, 272, 479), "walk_6": (250, 343, 300, 479),
    "cup_stand": (324, 330, 411, 479),        # standing, holding a cup
    "chill": (478, 440, 645, 552),            # lounging on his sofa
}
# close-up busts (dialogue / close-up panel)
BUSTS = {
    "idle_1": (182, 194, 218, 236), "idle_2": (218, 194, 253, 236), "idle_3": (253, 194, 289, 236),
    "idle_4": (289, 194, 324, 236), "idle_5": (182, 238, 218, 293), "idle_6": (218, 238, 253, 293),
    "idle_7": (253, 238, 289, 293), "idle_8": (289, 238, 324, 293),
    "sip_1": (512, 196, 548, 236), "sip_2": (548, 196, 584, 236),
    "look_slow": (666, 196, 700, 236), "look_left": (700, 196, 734, 236),
    "look_scan": (734, 196, 767, 236), "look_right": (767, 196, 801, 236),
    "look_5": (666, 250, 700, 293), "look_6": (700, 250, 734, 293),
    "look_7": (734, 250, 767, 293), "look_8": (767, 250, 801, 293),
    "look_9": (330, 506, 378, 557), "look_10": (378, 506, 426, 557), "look_11": (426, 506, 474, 557),
    "micro_1": (870, 508, 922, 557), "micro_2": (922, 508, 970, 557), "micro_3": (970, 508, 1002, 557),
    "stressed": (423, 330, 512, 421), "anxious": (518, 330, 610, 421), "sad": (622, 330, 713, 421),
}
# drawn cards kept as drawn (keyed background): hands, mug, book, laptop states
CARDS = {
    "hands_keyboard_1": (829, 155, 868, 195), "hands_keyboard_2": (870, 155, 911, 195),
    "hands_trackpad_1": (914, 155, 954, 195), "hands_trackpad_2": (956, 155, 997, 195),
    "hands_mug": (829, 234, 868, 272), "hands_book_1": (870, 234, 911, 272),
    "hands_book_2": (914, 234, 954, 272), "hands_book_3": (956, 234, 997, 272),
    "hand_cup_pose": (827, 322, 885, 357), "hand_page_pose": (881, 318, 930, 360),
    "mug": (505, 250, 549, 294), "book_open": (585, 253, 651, 293),
    "laptop_closed": (338, 200, 384, 233), "laptop_half": (390, 197, 441, 233),
    "laptop_open": (452, 197, 506, 233),
}
PORTRAIT = (17, 22, 172, 168)
FACES = {"face_front": (852, 62, 906, 118), "face_side": (912, 62, 968, 118),
         "hair_front": (542, 53, 600, 118), "hair_34": (604, 53, 664, 118),
         "hair_side": (667, 53, 727, 118), "hair_back": (736, 53, 796, 118)}

# Matt's skin and stubble are close to this sheet's backdrop: the background hue window is set
# tight (the backdrop and grid are rg 15-17, gb 7-12; his skin is rg 28+) and the halo is not
# widened, so faces stay solid
HUE = dict(rg=(10, 21), gb=(3, 21))
BASE = dict(halo_loose=0, gb_up=0, halo=24, t=22)
U = dict(BASE, seed_bottom=False, shadow=False)
OPTS = {
    "seated": dict(BASE, erase=[(0, 0, 141, 19)], shadow=False),
    "cup_stand": dict(BASE, erase=[(0, 0, 88, 8)]),
    "chill": dict(BASE, shadow=False, erase=[(0, 0, 26, 112)]),
    "stressed": dict(U, erase=[(0, 0, 25, 28), (66, 0, 89, 28)]),
    "anxious": dict(U, erase=[(0, 0, 30, 28), (70, 0, 92, 28)]),
    "sad": dict(U, erase=[(0, 0, 30, 28), (68, 0, 91, 28)]),
}
for k in WORLD:
    OPTS.setdefault(k, dict(BASE))
for k in ("walk_1", "walk_2", "walk_3", "walk_4", "walk_5", "walk_6"):
    OPTS[k] = dict(BASE, center_only=True)
for k in ("look_slow", "look_left", "look_scan", "look_right"):
    OPTS[k] = dict(U, label_rows=12)
for k in BUSTS:
    OPTS.setdefault(k, U)
for k in FACES:
    OPTS.setdefault(k, U)
OPTS["portrait"] = dict(U)
for k in ("look_slow", "look_left", "look_scan", "look_right"):     # label text over the hair: not used
    BUSTS.pop(k)


def opts(key):
    return dict(OPTS.get(key, {}))


def tune(src):
    src.rg, src.gb = HUE["rg"], HUE["gb"]
    return src
