#!/usr/bin/env python3
"""
Etyme - "The Future of Work"
Three mural compositions, drawn in fixed design spaces and cover-cropped into
whatever box a placement gives them - the way a mural meets the wall it lands on.

The structural move in all three: one monumental INK arch, with the artwork
inverted inside it. Two inks, three readings - ink on wall, wall on ink,
and the bare wall itself.
"""
from mural import *

# ==========================================================================
# 1. THE BAND  - 2400 x 800
#    dawn -> doorways -> the hour -> the flow -> the placement
# ==========================================================================
def art_band(ink, field):
    BL = 700
    o = [bar(0, 720, 2400, 26, ink),
         dot_row(42, 2358, 768, 78, 9, ink)]

    # dawn - arcs breaking the horizon
    o.append(sunburst(290, BL, 248, ink, field, 5))
    for a in (-124, -90, -56):
        o.append(ray(290, BL, a, 286, 342, 16, ink))
    o.append(dot_grid(64, 92, 4, 3, 54, 10, ink))
    o.append(mark(470, 158, 60, ink, field))

    # doorways - openings into work
    o.append(scallop(566, 1010, 118, 42, "S", ink))
    o.append(portal(566, BL, 200, 446, ink, field,
                    figure(666, BL, 252, ink, field, "stand")))
    o.append(portal(818, BL, 146, 326, ink, field,
                    figure(891, BL, 186, ink, field, "stand")))

    # the hour - a monumental arch, the artwork inverted inside it
    AX, AW, AH, IBL = 1080, 624, 734, 662
    o.append(arch(AX, BL, AW, AH, ink))
    o.append(clock(1392, 268, 194, field, ink))
    for a in (-148, -118, -88, -58, -28):
        o.append(ray(1392, 268, a, 214, 250, 13, field))
    o.append(bar(AX + 34, IBL, AW - 68, 12, field))
    o.append(stair(1120, IBL, 3, 38, 11, 60, 126, field))
    o.append(figure(1336, IBL, 180, field, ink, "stand"))
    o.append(figure(1578, IBL, 200, field, ink, "reach"))
    o.append(dot_row(1130, 1654, 700, 65, 8, field))

    # the flow - people moving to where they are needed
    o.append(weave(1764, 2364, 96, 46, ink))
    o.append(curve_stream((1762, 404), (1906, 296), (2090, 444), (2372, 326),
                          34, ink, field, 5))
    o.append(check_badge(2272, 214, 64, ink, field))
    o.append(figure(1846, BL, 242, ink, field, "lift"))
    o.append(figure(2014, BL, 190, ink, field, "carry"))

    # the placement
    o.append(stair(2158, BL, 4, 50, 14, 98, 318, ink))
    return "".join(o)


# ==========================================================================
# 2. THE BLOCK - 1200 x 1200. The square telling.
# ==========================================================================
def art_block(ink, field):
    BL = 1010
    o = [bar(0, 1030, 1200, 26, ink),
         dot_row(40, 1160, 1078, 76, 9, ink)]

    AX, AW, AH, IBL = 470, 690, 1010, 964
    o.append(arch(AX, BL, AW, AH, ink))
    o.append(clock(818, 436, 204, field, ink))
    for a in (-146, -116, -86, -56):
        o.append(ray(818, 436, a, 224, 258, 13, field))
    o.append(check_badge(616, 196, 56, field, ink))
    o.append(bar(AX + 36, IBL, AW - 72, 12, field))
    o.append(stair(512, IBL, 3, 40, 12, 66, 142, field))
    o.append(figure(726, IBL, 190, field, ink, "carry"))
    o.append(figure(1010, IBL, 218, field, ink, "reach"))
    o.append(dot_row(524, 1156, 1002, 70, 8, field))

    # the left column, read top to bottom
    o.append(sunburst(148, 0, 232, ink, field, 5, "S"))
    o.append(mark(384, 180, 54, ink, field))
    o.append(weave(20, 452, 306, 46, ink))
    o.append(curve_stream((26, 440), (160, 386), (300, 500), (446, 430),
                          26, ink, field, 4))
    o.append(portal(40, BL, 180, 442, ink, field,
                    figure(130, BL, 212, ink, field, "stand")))
    o.append(dot_grid(268, 578, 3, 2, 46, 9, ink))
    o.append(stair(268, BL, 3, 48, 14, 102, 256, ink))
    return "".join(o)


# ==========================================================================
# 3. THE COLUMN - 800 x 1600. Stories, skyscrapers, portrait boards.
# ==========================================================================
def art_column(ink, field):
    BL = 1400
    o = [bar(0, 1420, 800, 26, ink),
         dot_row(36, 764, 1468, 74, 9, ink)]

    o.append(sunburst(628, 0, 250, ink, field, 5, "S"))
    o.append(dot_grid(48, 74, 3, 3, 52, 10, ink))
    o.append(mark(140, 330, 62, ink, field))
    o.append(curve_stream((266, 392), (398, 320), (556, 448), (762, 356),
                          28, ink, field, 4))
    o.append(weave(60, 740, 500, 46, ink))

    AX, AW, AH, IBL = 76, 648, 790, 1358
    o.append(arch(AX, BL, AW, AH, ink))
    o.append(clock(400, 845, 176, field, ink))
    for a in (-146, -116, -86, -56):
        o.append(ray(400, 845, a, 196, 226, 13, field))
    o.append(scallop(112, 688, 1030, 42, "S", field))
    o.append(check_badge(168, 1132, 50, field, ink))
    o.append(bar(AX + 32, IBL, AW - 64, 12, field))
    o.append(figure(268, IBL, 206, field, ink, "carry"))
    o.append(stair(404, IBL, 3, 40, 12, 70, 156, field))
    o.append(figure(618, IBL, 222, field, ink, "reach"))
    o.append(dot_row(128, 672, 1398, 68, 8, field))
    return "".join(o)


ART = {"band": (2400, 800, art_band),
       "block": (1200, 1200, art_block),
       "column": (800, 1600, art_column)}

def place_art(kind, x, y, w, h, ink, field, uid, nudge=0.5):
    dw, dh, fn = ART[kind]
    s = max(w / float(dw), h / float(dh))
    ox, oy = x + (w - dw*s) * nudge, y + (h - dh*s) * 0.5
    return (f'<clipPath id="c{uid}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" '
            f'height="{f(h)}"/></clipPath><g clip-path="url(#c{uid})">'
            f'<g transform="translate({f(ox)},{f(oy)}) scale({f(s)})">'
            f'{fn(ink, field)}</g></g>')

def pick_art(w, h):
    """Pick the composition that crops best into this box, not merely the
    nearest aspect - the band is a frieze and survives a hard horizontal crop,
    while the block loses its arch the moment it is cropped vertically."""
    a = w / float(h)
    return "band" if a >= 1.25 else ("block" if a >= 0.72 else "column")
