"""Frame boxes for the Joel and Jonas mockups (both use the same sheet layout).

Boxes are (x0, y0, x1, y1) of each cell's frame line in the mockup. Erase rectangles are in crop
coordinates (the box minus a 3 px inset).
"""
BOXES = {
    # walking front / back (section "Walking front")
    "f1": (35, 55, 124, 225), "f2": (133, 55, 223, 225), "f3": (231, 55, 321, 225),
    "f5": (35, 260, 124, 443), "f7": (133, 260, 223, 443), "f9": (232, 260, 319, 443),
    # walking side / back
    "side_w": (405, 55, 494, 225), "back_w": (508, 55, 597, 225),
    "side_s": (405, 275, 494, 443), "back_s": (508, 274, 596, 443),
    # run cycle
    "run_side_1": (624, 86, 729, 262), "run_front_1": (747, 86, 847, 262),
    "run_side_2": (624, 274, 729, 445), "run_front_2": (747, 274, 847, 445),
    # poses and emotions
    "calm": (37, 494, 143, 708), "gesture": (152, 495, 264, 709), "vocal": (280, 495, 392, 709),
    "flustered": (416, 495, 526, 687), "triumphant": (535, 495, 644, 620),
    "confused": (655, 494, 755, 620), "chill": (764, 495, 868, 620),
    # busts
    "stern": (585, 658, 688, 740), "anxious": (163, 765, 265, 868), "sad": (280, 765, 391, 868),
    "exhausted": (417, 735, 534, 868), "wink": (573, 765, 684, 868), "confused_bust": (703, 765, 811, 868),
}

# cutting options per cell. erase / marks rectangles are in crop coordinates (box minus 3 px)
LABEL = dict(label_rows=20)
UPPER = dict(seed_bottom=False, shadow=False)
OPTS = {
    "f1": LABEL, "f2": LABEL, "f3": LABEL, "f5": LABEL, "f7": LABEL, "f9": LABEL,
    "gesture": dict(marks=[(91, 8, 112, 66)]),
    "vocal": dict(erase=[(76, 0, 110, 26), (80, 26, 110, 40)],
                  marks=[(76, 46, 100, 78), (10, 156, 33, 184), (74, 156, 94, 182), (78, 38, 100, 48)]),
    "triumphant": UPPER, "confused": UPPER, "chill": dict(shadow=True),
    "stern": UPPER, "anxious": dict(UPPER, marks=[(12, 40, 27, 64), (70, 33, 90, 60)]),
    "sad": UPPER, "exhausted": UPPER, "wink": UPPER, "confused_bust": UPPER,
}

# item icons per character: (x0, y0, x1, y1) in the mockup
ITEMS_COMMON = {
    "pizza_box_open": (885, 230, 955, 334), "pizza_slice": (956, 229, 994, 264),
    "notebook": (889, 345, 952, 394), "napkin_stack": (889, 405, 952, 454),
    "tile_clean_coffee": (956, 288, 994, 324), "tile_dirty_blue": (956, 345, 994, 382),
    "tile_dirty_coffee": (956, 402, 994, 439), "tile_clean_bell": (956, 493, 994, 529),
    "tile_dirty_green": (956, 555, 994, 592),
    "cap": (889, 70, 949, 104), "cap_2": (889, 117, 949, 155),
    "cap_3": (887, 480, 950, 522), "cap_4": (887, 557, 950, 599),
}
ITEMS_SHARED = {k: ITEMS_COMMON[k] for k in (
    "pizza_box_open", "pizza_slice", "notebook", "napkin_stack", "tile_clean_coffee",
    "tile_dirty_blue", "tile_dirty_coffee", "tile_clean_bell", "cap", "cap_2", "cap_3")}
ITEMS = {
    "jason": dict(ITEMS_SHARED, **{
        "hair_curl": (958, 70, 984, 105), "hair_piece": (886, 167, 953, 224),
        "flag": (889, 557, 946, 604), "coffee_bag": (890, 617, 949, 679),
        "tile_coffee_cup": (956, 625, 994, 660), "sombrero_vueltiao": (884, 680, 955, 722),
        "tile_vueltiao": (956, 686, 994, 722), "aguardiente": (900, 742, 931, 801),
        "dominoes_box": (885, 810, 953, 859), "tile_domino": (956, 810, 994, 846),
    }),
    "joel": dict(ITEMS_COMMON, **{
        "cap_back": (952, 72, 997, 104), "cap_5": (889, 167, 949, 206),
        "pizza_box_front": (889, 610, 948, 679), "pizza_tray": (884, 680, 957, 722),
        "tile_clean_blue": (956, 617, 994, 654), "tile_clean_brown": (956, 680, 994, 719),
        "notebook_2": (886, 742, 954, 797), "tile_dirty_dark": (956, 745, 994, 782),
        "napkin_stack_2": (889, 805, 952, 849), "tile_dirty_tools": (956, 807, 994, 844),
    }),
    "jonas": dict(ITEMS_COMMON, **{
        "hair_curl": (955, 70, 984, 105), "hair_piece": (886, 167, 953, 224),
        "hair_full": (888, 610, 955, 669), "hair_front": (888, 670, 953, 734),
        "head_side": (890, 742, 951, 797), "hair_tuft": (896, 805, 946, 839),
    }),
}

# per-character overrides (merged over OPTS)
CHAR = {
    "joel": {
        "*": dict(gb_up=0),
        "flustered": dict(marks=[(12, 6, 34, 22), (12, 22, 40, 44), (85, 6, 106, 42), (80, 6, 85, 17)]),
        "vocal": dict(erase=[(76, 0, 110, 26), (80, 26, 110, 40), (76, 26, 80, 32)],
                      marks=[(74, 46, 100, 80), (10, 156, 33, 184), (74, 156, 94, 182), (78, 38, 100, 48)]),
    },
    "jason": {
        "*": dict(gb_up=0),
        "vocal": dict(erase=[(76, 0, 110, 26), (80, 26, 110, 40), (74, 26, 80, 48)],
                      marks=[(74, 46, 100, 80), (10, 156, 33, 184), (74, 156, 94, 182), (78, 38, 100, 48)]),
    },
    "jonas": {
        "*": dict(gb_up=3),
        "flustered": dict(marks=[(8, 6, 40, 44), (80, 6, 106, 44)]),
        "back_s": dict(erase=[(0, 0, 88, 2)]),
        "triumphant": dict(halo_loose=1, erase=[(0, 0, 110, 4), (0, 0, 4, 16)]),
        "confused": dict(erase=[(4, 92, 17, 118)]),
        "confused_bust": dict(marks=[(14, 0, 31, 19)]),
    },
}


def opts(who, key):
    o = dict(CHAR.get(who, {}).get("*", {}))
    o.update(OPTS.get(key, {}))
    o.update(CHAR.get(who, {}).get(key, {}))
    return o


# portraits per character: name -> (cell, mode); "cut" keys out the background, "card" keeps
# the drawn card as it is (Jason's flag card)
PORTRAITS = {
    "joel": {"stern": ("stern", "cut"), "anxious": ("anxious", "cut"), "sad": ("sad", "cut"),
             "exhausted": ("exhausted", "cut"), "wink": ("wink", "cut"),
             "confused": ("confused_bust", "cut")},
    "jonas": {"stern": ("stern", "cut"), "anxious": ("anxious", "cut"), "sad": ("sad", "cut"),
              "exhausted": ("exhausted", "cut"), "wink": ("wink", "cut"),
              "confused": ("confused_bust", "cut")},
    "jason": {"stern": ("stern", "cut"), "sad": ("exhausted", "cut"), "thinking": ("wink", "cut"),
              "confused": ("confused_bust", "cut"), "flag": ("anxious", "card")},
}
CARD_INSET = 4      # card portraits: crop inside the cell frame line


# ================================================================= Jonas, lederhosen bassist
# Own sheet layout (M-002 "Lederhosen Bassist"): boxes in that mockup
BASS_BOXES = {
    # locomotion (cells 1-2 hold the bass, cell 3, side and back don't)
    "w1": (35, 55, 124, 225), "w2": (133, 55, 222, 225), "w3": (231, 55, 321, 225),
    "side": (404, 55, 494, 225), "back": (508, 55, 597, 225),
    "run_side": (624, 86, 729, 262), "run_front": (747, 86, 847, 262),
    # bass playing cycle, as numbered on the sheet
    "p1": (35, 294, 124, 444), "p2": (133, 294, 222, 444), "p3": (231, 294, 321, 444),
    "p4": (335, 294, 428, 444), "p5": (441, 294, 534, 444), "p10": (547, 294, 640, 444),
    "p11": (652, 294, 744, 444), "p12": (756, 294, 846, 444),
    # poses and emotions
    "calm": (36, 494, 143, 708), "gesture": (152, 494, 264, 708), "vocal": (279, 494, 391, 708),
    "flustered": (416, 494, 525, 687), "triumphant": (535, 494, 643, 620),
    "confused": (653, 494, 757, 620), "chill": (764, 494, 868, 620),
    # busts
    "stern": (584, 657, 688, 740), "anxious": (163, 766, 264, 868), "sad": (279, 766, 390, 868),
    "exhausted": (416, 735, 535, 868), "wink": (571, 766, 669, 868),
    "confused_bust": (702, 766, 813, 868),
}
# fretboard close-ups: drawn cards, kept as drawn
BASS_CARDS = {"fret_1": (715, 661, 749, 733), "fret_2": (754, 661, 789, 733),
              "fret_3": (793, 661, 828, 733), "fret_4": (832, 661, 867, 733)}
BLABEL = dict(label_rows=20)
BASS_OPTS = {
    "*": dict(gb_up=3),
    "w1": BLABEL, "w2": BLABEL, "w3": BLABEL,
    # playing cycle: only the frame number is erased (label_rows would also eat the white feather)
    "p1": dict(erase=[(0, 0, 18, 16)]), "p2": dict(erase=[(0, 0, 18, 16)]),
    "p3": dict(erase=[(0, 0, 18, 16)]), "p4": dict(erase=[(0, 0, 18, 16)]),
    "p5": dict(erase=[(0, 0, 18, 16)]), "p10": dict(erase=[(0, 0, 26, 16)]),
    "p11": dict(erase=[(0, 0, 26, 16)]), "p12": dict(erase=[(0, 0, 26, 16)]),
    "gesture": dict(erase=[(90, 8, 112, 52), (80, 46, 92, 56)]),
    "vocal": dict(erase=[(76, 8, 112, 42)], marks=[(70, 52, 92, 84)]),
    "flustered": dict(erase=[(14, 8, 30, 28)], marks=[(14, 28, 30, 40), (70, 6, 104, 42)]),
    # busts: the grid shows through between the bass neck and the body down to the cell's bottom
    # edge, so the flood fill also starts from the bottom and sides
    "anxious": dict(shadow=False, marks=[(64, 36, 80, 50), (14, 44, 27, 58)]),
    "confused_bust": dict(shadow=False, marks=[(14, 0, 28, 14)]),
    "triumphant": dict(seed_bottom=False, shadow=False), "confused": dict(seed_bottom=False, shadow=False),
    "stern": dict(seed_bottom=False, shadow=False),
    "sad": dict(shadow=False), "exhausted": dict(shadow=False),
    "wink": dict(shadow=False, pockets=[(80, 40)]),
}
BASS_ITEMS = {
    "hat": (893, 70, 951, 106), "hat_2": (893, 108, 952, 149), "hair_curl": (960, 70, 986, 106),
    "bass_guitar": (954, 107, 996, 214), "hair_full": (885, 168, 953, 224),
    "pizza_box_open": (885, 230, 955, 334), "tile_pizza": (956, 236, 994, 272),
    "tile_pizza_dirty": (956, 288, 994, 325), "notebook": (884, 345, 947, 396),
    "tile_book_dirty": (956, 345, 994, 382), "napkin_stack": (887, 404, 953, 455),
    "tile_coffee_dirty": (956, 402, 994, 438),
    "picks": (882, 525, 935, 570), "strings": (882, 574, 928, 620), "bass_stand": (882, 625, 922, 684),
    "strap": (882, 686, 930, 747), "metronome": (895, 750, 928, 801), "amp": (882, 806, 928, 860),
}
BASS_ITEM_ERASE = {"bass_guitar": [(976, 152, 1000, 172)]}     # the "New" tag


def bass_opts(key):
    o = dict(BASS_OPTS["*"]); o.update(BASS_OPTS.get(key, {}))
    return o
