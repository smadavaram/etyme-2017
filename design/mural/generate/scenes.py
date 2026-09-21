#!/usr/bin/env python3
"""
Three murals, drawn in fixed design spaces and cover-cropped into whatever
box a placement gives them.

The home page is near-monochrome, built from 1px rules on a warm ground, and
it leads with a real screen rather than an illustration. So this is a line
mural, not a poster: almost everything is an outline, there is a great deal
of air, and solid mass is spent only where the product spends it - the
evidence dots, a few figures, and the one rising slash.

The argument is the home page's own: contractors nobody has one view of, the
chain of firms they arrived through, and then one record holding all of it.
"""
from mural import *

# ==========================================================================
# THE BAND - 2400 x 800
# ==========================================================================
def art_band(ink, field):
    BOT = 704
    o = [hairline(0, BOT, 2400, ink, HAIR)]
    for i in range(49):
        o.append(vline(48 + i*48, BOT + 22, 12, ink, HAIR))

    # what you cannot see today - mostly unverified, nobody's one view
    o.append(pill(80, 148, 118, 12, ink))
    o.append(scatter(96, 208, 5, 4, 50, 9, ink, 1))
    o.append(hairline(80, 420, 200, ink, HAIR))
    o.append(pill(80, 444, 142, 10, ink))
    o.append(pill(80, 470, 90, 10, ink))

    # the one bold stroke in the piece - the logo's crossbar, wall-sized
    o.append(slash(578, 302, 618, 17, ink))

    # the chain a contractor actually arrives through
    o.append(pill(898, 150, 124, 12, ink))
    o.append(chain(916, 212, 404, ink, field, 5))

    # what the record answers, in tiles
    o.append(tiles(1420, 128, 3, 214, 128, 26, ink, field))

    # one record
    o.append(record(898, 336, 1242, 322, ink, field, rows=4))

    # the rise, and the mark that closes the band
    o.append(tmark(2278, 252, 88, ink, field))
    o.append(climb(2222, BOT, 3, 30, 14, 90, 214, ink))

    # people, on the rule everything else stands on
    o.append(figure(430, BOT, 172, ink))
    o.append(figure(532, BOT, 136, ink))
    return "".join(o)


# ==========================================================================
# THE BLOCK - 1200 x 1200
# ==========================================================================
def art_block(ink, field):
    BOT = 1072
    o = [hairline(0, BOT, 1200, ink, HAIR)]
    for i in range(24):
        o.append(vline(48 + i*48, BOT + 22, 12, ink, HAIR))

    o.append(pill(72, 142, 112, 12, ink))
    o.append(scatter(88, 198, 4, 3, 50, 9, ink, 2))
    o.append(pill(560, 142, 118, 12, ink))
    o.append(chain(578, 204, 356, ink, field, 4, [0.92, 0.74, 0.74, 0.58]))

    o.append(slash(330, 386, 448, 16, ink))
    o.append(tiles(624, 330, 2, 228, 132, 26, ink, field, (0.34, 0.50)))

    o.append(record(72, 542, 1056, 336, ink, field, rows=4))

    o.append(sheet(72, 930, 5, 2, 34, 9, ink, 1))
    o.append(match(420, 972, 448, ink, field))
    o.append(climb(1016, BOT, 3, 28, 12, 76, 184, ink))
    o.append(figure(340, BOT, 152, ink))
    return "".join(o)


# ==========================================================================
# THE COLUMN - 800 x 1600
# ==========================================================================
def art_column(ink, field):
    BOT = 1452
    o = [hairline(0, BOT, 800, ink, HAIR)]
    for i in range(16):
        o.append(vline(44 + i*48, BOT + 22, 12, ink, HAIR))

    o.append(pill(64, 148, 108, 12, ink))
    o.append(scatter(80, 206, 4, 3, 50, 9, ink, 4))
    o.append(pill(440, 148, 112, 12, ink))
    o.append(chain(452, 210, 286, ink, field, 4, [0.92, 0.74, 0.74, 0.58]))

    o.append(slash(398, 452, 462, 16, ink))

    o.append(tiles(64, 626, 2, 322, 140, 28, ink, field, (0.34, 0.50)))
    o.append(record(64, 820, 672, 340, ink, field, rows=4))

    o.append(sheet(64, 1216, 5, 2, 34, 9, ink, 2))
    o.append(match(64, 1350, 440, ink, field))
    o.append(climb(650, BOT, 3, 28, 12, 76, 184, ink))
    o.append(figure(606, BOT, 148, ink))
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
    a = w / float(h)
    return "band" if a >= 1.25 else ("block" if a >= 0.72 else "column")
