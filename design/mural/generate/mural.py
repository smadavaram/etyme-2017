#!/usr/bin/env python3
"""
Etyme - mural system, built on the live product's own design language.

Tokens, type and motifs are lifted from smadavaram/etyme2040:
tailwind.config.ts, src/app/globals.css, src/components/logo.tsx and the
CLAUDE.md design-system section ("warm canvas, ink, one blue, clay for
attention" / "the prototypes ARE the standard").

Two inks per asset, never three. Depth comes from knocking canvas out of a
solid ink panel - the same inversion the product uses between canvas and
surface.

The single gesture is the logo's rising slash: the 't' crossbar, replaced by
a bar at -25 degrees. Every diagonal in this system is exactly that angle.
"""
import math

# --------------------------------------------------------------------------
# TOKENS - src/app/globals.css :root
# --------------------------------------------------------------------------
CANVAS    = "#F0EEE6"   # page background
SURFACE   = "#FBFAF7"
INK       = "#1F1E1D"   # primary text
RULE      = "#E3DFD5"
ACTION    = "#2B47E5"   # the one blue - primary action, links
ATTENTION = "#C0622E"   # clay
VERIFIED  = "#4F6F52"

NAVY = "#0D1426"        # logo.tsx — the wordmark's own colour

# Two inks, and the second is the first inverted. #2B47E5 is the action /
# link colour, not a brand colour, so it is not used here.
COLORWAYS = {
    "navy":  dict(field=CANVAS, ink=NAVY),   # the home page's own weight
    "night": dict(field=NAVY,   ink=CANVAS), # for stories and out-of-home
}

# Line weights, in the band's design space. The page is built from 1px rules
# on a warm ground; almost everything here is an outline, and solid mass is
# spent only on the evidence dots, the figures and the one slash.
HAIR, RULE_W, STROKE = 3.0, 5.0, 6.0

# Type - tailwind.config.ts fontFamily. Serif for headlines and hero numbers,
# Inter for UI, IBM Plex Mono for data. Gelasio is metrically Georgia, the
# last real face in the site's own serif stack, so renders match what most
# visitors see.
SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,Gelasio,serif"
SANS  = "Inter,system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif"
MONO  = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace"

SLASH_ANGLE = -25          # logo.tsx: transform: rotate(-25deg)
R_PANEL = 8                # tailwind borderRadius.panel

# --------------------------------------------------------------------------
# PRIMITIVES
# --------------------------------------------------------------------------
def f(n):
    return ("%.2f" % n).rstrip("0").rstrip(".")

def rect(x, y, w, h, c, r=0):
    return (f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" '
            f'rx="{f(r)}" fill="{c}"/>')

def pill(x, y, w, h, c):
    return rect(x, y, w, h, c, h/2.0)

def dot(cx, cy, r, c):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c}"/>'

def ring(cx, cy, r, w, c):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - w/2.0)}" fill="none" '
            f'stroke="{c}" stroke-width="{f(w)}"/>')

def hairline(x, y, w, c, t=4):
    return rect(x, y - t/2.0, w, t, c)

def vline(x, y, h, c, t=4):
    return rect(x - t/2.0, y, t, h, c)

def outline(x, y, w, h, c, t=5, r=R_PANEL):
    return (f'<rect x="{f(x + t/2)}" y="{f(y + t/2)}" width="{f(w - t)}" '
            f'height="{f(h - t)}" rx="{f(max(0, r - t/2))}" fill="none" '
            f'stroke="{c}" stroke-width="{f(t)}"/>')

def poly(pts, w, c, cap="round"):
    d = "M" + "L".join(f"{f(x)},{f(y)}" for x, y in pts)
    return (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{f(w)}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"/>')

# --------------------------------------------------------------------------
# THE GESTURE - logo.tsx, the 't' crossbar
# --------------------------------------------------------------------------
def slash(cx, cy, length, w, c, ang=SLASH_ANGLE):
    """The rising bar. Every diagonal in this system is this angle."""
    a = math.radians(ang)
    dx, dy = math.cos(a)*length/2.0, math.sin(a)*length/2.0
    return poly([(cx - dx, cy - dy), (cx + dx, cy + dy)], w, c)

def tee(x, baseline, L, ink, cross):
    """
    A lowercase 't' with no crossbar of its own, plus the rising slash that
    replaces it. Proportions measured off Inter 700 at -0.04em tracking:
    stem 0.085-0.225 em from the glyph's left edge, crossbar band
    0.470-0.555 em above the baseline, foot turning right at 0.075 em.
    """
    sx = x + L*0.155                       # stem centre
    return (pill(sx - L*0.070, baseline - L*0.675, L*0.140, L*0.660, ink) +
            poly([(sx, baseline - L*0.058), (sx + L*0.095, baseline - L*0.018)],
                 L*0.118, ink) +
            slash(sx + L*0.030, baseline - L*0.512, L*0.46, L*0.100, cross))

def tmark(cx, cy, s, ink, field):
    """The standalone mark: that 't' knocked out of a disc."""
    L = s*0.66
    return (dot(cx, cy, s/2.0, ink) +
            tee(cx - L*0.175, cy + L*0.338, L, field, field))

# --------------------------------------------------------------------------
# PRODUCT MOTIFS - the shapes the software actually makes
# --------------------------------------------------------------------------
def evidence(cx, cy, r, c, solid=True):
    """globals.css .evidence-dot - the visual signature of a verified record."""
    return dot(cx, cy, r, c) if solid else ring(cx, cy, r, r*0.62, c)

def card(x, y, w, h, ink, field, t=STROKE, r=None):
    """The site's figure: rounded, 1px rule, nothing else."""
    r = r if r is not None else min(w, h)*0.055 + R_PANEL
    return rect(x, y, w, h, field, r) + outline(x, y, w, h, ink, t, r)

def rec_row(x, y, w, rh, c, solid=True, name=0.30):
    """One row of a record: an evidence dot, a name, figures that line up."""
    o = [evidence(x + rh*0.40, y + rh*0.50, rh*0.165, c, solid)]
    o.append(pill(x + rh*0.92, y + rh*0.41, w*name, rh*0.175, c))
    right = x + w
    for fw in (rh*1.45, rh*0.85):
        right -= fw
        o.append(pill(right, y + rh*0.42, fw, rh*0.155, c))
        right -= rh*0.55
    return "".join(o)

def record(x, y, w, h, ink, field, rows=4, title=0.15):
    """
    One record, holding every contractor. The monument of the system, drawn
    the way the product draws it: an outlined card, a header rule, and rows
    separated by hairlines. Only the evidence dots are solid.
    """
    o = [card(x, y, w, h, ink, field, STROKE)]
    px, py = h*0.105, h*0.095
    o.append(pill(x + px, y + py, w*title, h*0.050, ink))
    o.append(pill(x + w - px - w*0.055, y + py, w*0.055, h*0.050, ink))
    head = y + py + h*0.050 + py*0.85
    o.append(hairline(x + px, head, w - 2*px, ink, HAIR))
    rh = (y + h - py*0.9 - head) / float(rows)
    for i in range(rows):
        ry = head + i*rh
        o.append(rec_row(x + px, ry, w - 2*px, rh, ink, solid=(i % 3 != 1),
                         name=(0.34, 0.24, 0.30, 0.20, 0.27)[i % 5]))
        if i < rows - 1:
            o.append(hairline(x + px, ry + rh, w - 2*px, ink, HAIR))
    return "".join(o)

def tile(x, y, w, h, ink, field, fill=0.46):
    """A stat tile: tiny letterspaced label, then the figure. The product's
    signature component, with the numeral standing in as a solid bar."""
    return (card(x, y, w, h, ink, field, HAIR*1.4) +
            pill(x + w*0.11, y + h*0.20, w*0.44, h*0.075, ink) +
            rect(x + w*0.11, y + h*0.42, w*fill, h*0.21, ink, h*0.035) +
            pill(x + w*0.11, y + h*0.75, w*0.36, h*0.055, ink))

def tiles(x, y, n, w, h, gap, ink, field, fills=(0.30, 0.46, 0.22, 0.38)):
    return "".join(tile(x + i*(w + gap), y, w, h, ink, field, fills[i % len(fills)])
                   for i in range(n))

def chain(x, y, w, ink, field, n=5, sizes=None):
    """Client, program office, supplier, subcontractor, contractor.
    Nodes on one rule - the topology the product is actually about."""
    sizes = sizes or [1.0, 0.82, 0.82, 0.62, 0.62]
    base = w*0.042
    o = [hairline(x, y, w, ink, HAIR)]
    step = w / float(n - 1)
    for i in range(n):
        cx = x + i*step
        r = base*sizes[i % len(sizes)]
        o.append(dot(cx, y, r + base*0.30, field))
        o.append(ring(cx, y, r, r*0.26, ink))
        o.append(dot(cx, y, r*0.26, ink))
    return "".join(o)

def stack(x, y, w, h, ink, field, n=3, off=None):
    """Many supplier records, offset - what folds into the one record."""
    off = off if off is not None else h*0.30
    o = []
    for i in range(n - 1, -1, -1):
        o.append(rect(x + i*off*0.55, y + i*off, w, h, field, R_PANEL*1.6))
        o.append(outline(x + i*off*0.55, y + i*off, w, h, ink, STROKE, R_PANEL*1.6))
    o.append(pill(x + w*0.11, y + h*0.34, w*0.40, h*0.085, ink))
    o.append(pill(x + w*0.11, y + h*0.56, w*0.60, h*0.085, ink))
    return "".join(o)

def sheet(x, y, cols, rows, cell, gap, ink, seed=3):
    """The timesheet. A dense grid with numbers in it reads as enterprise
    software - CLAUDE.md, on why the page leads with a screen."""
    o = []
    for r in range(rows):
        for c in range(cols):
            cx, cy = x + c*(cell + gap), y + r*(cell + gap)
            filled = ((c*7 + r*5 + seed) % 5) < 3
            if filled:
                o.append(rect(cx, cy, cell, cell, ink, cell*0.20))
            else:
                o.append(outline(cx, cy, cell, cell, ink, HAIR*1.3, cell*0.20))
    return "".join(o)

def match(x, y, w, ink, field, lanes=3):
    """Three-way match: contract, timesheet, invoice, converging on one row.
    'Pay one matched invoice per supplier.'"""
    bar = w*0.026
    gap = w*0.085
    o = []
    inlen = w*0.40
    for i in range(lanes):
        ly = y + (i - (lanes - 1)/2.0)*gap
        o.append(pill(x, ly - bar/2.0, inlen, bar, ink))
    node = w*0.105
    o.append(poly([(x + inlen, y - gap), (x + inlen + w*0.10, y)], bar*0.55, ink))
    o.append(poly([(x + inlen, y), (x + inlen + w*0.10, y)], bar*0.55, ink))
    o.append(poly([(x + inlen, y + gap), (x + inlen + w*0.10, y)], bar*0.55, ink))
    cx = x + inlen + w*0.10 + node
    o.append(dot(cx, y, node, ink))
    o.append(poly([(cx - node*0.40, y + node*0.03), (cx - node*0.10, y + node*0.34),
                   (cx + node*0.44, y - node*0.34)], node*0.21, field))
    o.append(pill(cx + node*1.25, y - bar/2.0, x + w - (cx + node*1.25), bar, ink))
    return "".join(o)

def scatter(x, y, cols, rows, gap, r, ink, seed=1):
    """Contractors nobody has one view of. Some verified, most not."""
    o = []
    for j in range(rows):
        for i in range(cols):
            solid = ((i*5 + j*3 + seed) % 7) < 3
            o.append(evidence(x + i*gap, y + j*gap, r, ink, solid))
    return "".join(o)

def climb(x, bl, n, bw, gap, h0, h1, ink):
    """Bars rising on the slash angle."""
    o = []
    for i in range(n):
        h = h0 + (h1 - h0) * (i / max(1, n - 1))
        o.append(rect(x + i*(bw + gap), bl - h, bw, h, ink, bw*0.30))
    return "".join(o)

def figure(x, bl, h, c):
    """A person, in the same register as everything else: no gesture, no
    whimsy. On this record a person is a row with a dot; standing up, they
    are a disc over a panel."""
    hr = h*0.150
    bw = h*0.42
    return (dot(x, bl - h + hr, hr, c) +
            rect(x - bw/2.0, bl - h*0.58, bw, h*0.58, c, bw*0.34))

# --------------------------------------------------------------------------
# TYPE
# --------------------------------------------------------------------------
# Measured advance widths per em, from the rendered faces. Layout maths
# that guesses at text width puts a chevron through a button label, so
# these are measured once and baked in.
ADV = {
    "serif": {" ": 0.2412, "'": 0.2153, ",": 0.2695, "-": 0.374, ".": 0.2695, "0": 0.6138, "1": 0.4297, "2": 0.5586, "3": 0.5517, "4": 0.5649, "5": 0.5283, "6": 0.5659, "7": 0.5024, "8": 0.5962, "9": 0.5659, ":": 0.3125, "A": 0.6709, "B": 0.6538, "C": 0.6421, "D": 0.749, "E": 0.6533, "F": 0.5991, "G": 0.7251, "H": 0.8149, "I": 0.3896, "J": 0.5176, "K": 0.6943, "L": 0.6035, "M": 0.9273, "N": 0.7671, "O": 0.7441, "P": 0.6099, "Q": 0.7441, "R": 0.7017, "S": 0.561, "T": 0.6187, "U": 0.7563, "V": 0.6665, "W": 0.9756, "X": 0.7105, "Y": 0.6152, "Z": 0.6016, "a": 0.5039, "b": 0.5601, "c": 0.4541, "d": 0.5742, "e": 0.4834, "f": 0.3252, "g": 0.5093, "h": 0.582, "i": 0.293, "j": 0.292, "k": 0.5356, "l": 0.2861, "m": 0.8809, "n": 0.5908, "o": 0.5391, "p": 0.5713, "q": 0.5596, "r": 0.4097, "s": 0.4321, "t": 0.3452, "u": 0.5752, "v": 0.4966, "w": 0.7373, "x": 0.5049, "y": 0.4922, "z": 0.4438, "\u2014": 0.8569},
    "sans": {" ": 0.2813, "'": 0.2998, ",": 0.2881, "-": 0.46, ".": 0.2881, "0": 0.6309, "1": 0.4068, "2": 0.6099, "3": 0.6177, "4": 0.646, "5": 0.5933, "6": 0.6201, "7": 0.5659, "8": 0.6187, "9": 0.6201, ":": 0.2881, "A": 0.69, "B": 0.6543, "C": 0.7305, "D": 0.7217, "E": 0.6011, "F": 0.5903, "G": 0.7461, "H": 0.7432, "I": 0.2686, "J": 0.5708, "K": 0.6719, "L": 0.5654, "M": 0.9033, "N": 0.7534, "O": 0.7647, "P": 0.6387, "Q": 0.7647, "R": 0.6436, "S": 0.6416, "T": 0.6455, "U": 0.7441, "V": 0.69, "W": 0.9854, "X": 0.6821, "Y": 0.6787, "Z": 0.6289, "a": 0.5615, "b": 0.6123, "c": 0.5713, "d": 0.6123, "e": 0.583, "f": 0.3701, "g": 0.6133, "h": 0.5913, "i": 0.2422, "j": 0.2422, "k": 0.5488, "l": 0.2422, "m": 0.876, "n": 0.5908, "o": 0.5996, "p": 0.6123, "q": 0.6123, "r": 0.3921, "s": 0.5278, "t": 0.3418, "u": 0.5913, "v": 0.5718, "w": 0.8184, "x": 0.5459, "y": 0.5718, "z": 0.5523, "\u2014": 1},
    "sans6": {" ": 0.252, "'": 0.3257, ",": 0.3188, "-": 0.4653, ".": 0.3188, "0": 0.6597, "1": 0.4228, "2": 0.623, "3": 0.6362, "4": 0.666, "5": 0.6123, "6": 0.6396, "7": 0.5762, "8": 0.6401, "9": 0.6396, ":": 0.3188, "A": 0.7275, "B": 0.6592, "C": 0.7368, "D": 0.7222, "E": 0.6055, "F": 0.5879, "G": 0.749, "H": 0.7456, "I": 0.2769, "J": 0.5796, "K": 0.7031, "L": 0.5654, "M": 0.9224, "N": 0.7593, "O": 0.7685, "P": 0.645, "Q": 0.773, "R": 0.6523, "S": 0.6504, "T": 0.6602, "U": 0.7358, "V": 0.7275, "W": 1.02, "X": 0.7197, "Y": 0.7134, "Z": 0.6523, "a": 0.5742, "b": 0.624, "c": 0.5825, "d": 0.624, "e": 0.5913, "f": 0.3887, "g": 0.6255, "h": 0.6123, "i": 0.2617, "j": 0.2617, "k": 0.5693, "l": 0.2617, "m": 0.9004, "n": 0.6118, "o": 0.6089, "p": 0.624, "q": 0.624, "r": 0.4126, "s": 0.5493, "t": 0.3696, "u": 0.6123, "v": 0.5981, "w": 0.8394, "x": 0.5688, "y": 0.5996, "z": 0.5659, "\u2014": 1},
    "sans7": {" ": 0.2368, "'": 0.3389, ",": 0.334, "-": 0.4678, ".": 0.334, "0": 0.6743, "1": 0.4312, "2": 0.6299, "3": 0.6455, "4": 0.6763, "5": 0.6221, "6": 0.6494, "7": 0.5815, "8": 0.6509, "9": 0.6494, ":": 0.334, "A": 0.7466, "B": 0.6616, "C": 0.7398, "D": 0.7222, "E": 0.6074, "F": 0.5869, "G": 0.7505, "H": 0.7471, "I": 0.2808, "J": 0.5845, "K": 0.7192, "L": 0.5654, "M": 0.9316, "N": 0.7622, "O": 0.7705, "P": 0.648, "Q": 0.7769, "R": 0.6567, "S": 0.6548, "T": 0.6675, "U": 0.7319, "V": 0.7466, "W": 1.0376, "X": 0.7383, "Y": 0.731, "Z": 0.6641, "a": 0.5806, "b": 0.6304, "c": 0.5884, "d": 0.6304, "e": 0.5957, "f": 0.398, "g": 0.6318, "h": 0.6226, "i": 0.271, "j": 0.271, "k": 0.5801, "l": 0.271, "m": 0.9126, "n": 0.6226, "o": 0.6133, "p": 0.6304, "q": 0.6304, "r": 0.4229, "s": 0.5601, "t": 0.3833, "u": 0.6226, "v": 0.6123, "w": 0.8501, "x": 0.5801, "y": 0.6148, "z": 0.5728, "\u2014": 1},
}

def text(s, x, y, size, c, font=SANS, anchor="start", ls=0.0, weight="400"):
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{font}" font-size="{f(size)}" '
            f'font-weight="{weight}" letter-spacing="{f(ls*size)}" fill="{c}" '
            f'text-anchor="{anchor}">{s}</text>')

def tw(s, size, kind="sans", weight=400, ls=0.0):
    """Exact advance width, from the measured tables above."""
    key = kind
    if kind == "sans":
        key = "sans7" if weight >= 700 else ("sans6" if weight >= 600 else "sans")
    tab = ADV[key]
    fallback = tab.get("n", 0.6)
    return sum(tab.get(ch, fallback) for ch in s) * size + ls * size * max(0, len(s) - 1)

def wordmark(x, baseline, size, ink, field, anchor="start"):
    """
    "etyme" in Inter 700. logo.tsx removes the t's crossbar with a clip-path
    and lays the rising slash in its place; on a flat two-colour ground,
    painting the crossbar out in the field colour is the same operation.
    Offsets are measured, not guessed - see tee() above.
    """
    S = size
    total = tw("etyme", S, "sans", 700, -0.04)
    x0 = x if anchor == "start" else x - total
    tx = x0 + 0.5556*S                     # the 't' advance box begins here
    return (text("etyme", x0, baseline, S, ink, SANS, "start", -0.04, "700") +
            rect(tx, baseline - 0.575*S, 0.090*S, 0.118*S, field) +
            rect(tx + 0.221*S, baseline - 0.575*S, 0.140*S, 0.118*S, field) +
            slash(tx + 0.178*S, baseline - 0.512*S, 0.44*S, max(2.5, 0.090*S), ink))

def lockup(x, baseline, size, ink, field, anchor="start"):
    """Mark plus wordmark."""
    r = size*0.72
    gap = size*0.40
    w_total = 2*r + gap + tw("etyme", size, "sans", 700, -0.04)
    x0 = x if anchor == "start" else x - w_total
    return (tmark(x0 + r, baseline - size*0.34, 2*r, ink, field) +
            wordmark(x0 + 2*r + gap, baseline, size, ink, field))

def button(x, y, label, size, ink, field, anchor="start"):
    """The site's primary action: solid blue, white label, 8px radius."""
    padx, h = size*1.30, size*2.55
    w = tw(label, size, "sans", 600, -0.005) + padx*2 + size*1.25
    x0 = x if anchor == "start" else x - w
    return (rect(x0, y - h/2.0, w, h, ink, R_PANEL*(size/14.0)) +
            text(label, x0 + padx, y + size*0.35, size, field, SANS, "start", -0.005, "600") +
            poly([(x0 + w - padx - size*0.50, y - size*0.28),
                  (x0 + w - padx - size*0.10, y),
                  (x0 + w - padx - size*0.50, y + size*0.28)], size*0.13, field))

# --------------------------------------------------------------------------
def svg(w, h, body, field, label="Etyme"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(w)}" height="{f(h)}" '
            f'viewBox="0 0 {f(w)} {f(h)}" role="img" aria-label="{label}">'
            f'<rect width="{f(w)}" height="{f(h)}" fill="{field}"/>{body}</svg>')
