#!/usr/bin/env python3
"""
Etyme - "The Future of Work"
A two-colour, geometric mural system. One artwork, many placements.

Colours (only ever two inks):
  FIELD  the wall / background
  INK    the artwork

Every shape below is built from circles, half-circles, quarter-arcs, bars,
chevrons and dots snapped to a unit grid - the vocabulary of a painted mural.
Depth comes from knocking FIELD back out of INK, never from a third colour.
"""
import math, os

# --------------------------------------------------------------------------
# PALETTE  - sampled from app/assets/images/etyme-logo-dark.png
# --------------------------------------------------------------------------
INDIGO = "#5337FB"   # the indigo stroke of the etyme "y"
BONE   = "#F4F0E6"   # warm gallery-wall off-white
INK_DK = "#14121F"   # optional near-black alternate

COLORWAYS = {
    "light":  dict(field=BONE,   ink=INDIGO),   # indigo on bone
    "indigo": dict(field=INDIGO, ink=BONE),     # bone on indigo
}

HEAD_FONT = "'Archivo Black', 'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif"
BODY_FONT = "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif"

# --------------------------------------------------------------------------
# PRIMITIVES
# --------------------------------------------------------------------------
def f(n):
    return ("%.2f" % n).rstrip("0").rstrip(".")

def disc(cx, cy, r, c):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c}"/>'

def ring(cx, cy, r, w, c):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" '
            f'stroke="{c}" stroke-width="{f(w)}"/>')

def bar(x, y, w, h, c, rx=0):
    return (f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" '
            f'rx="{f(rx)}" fill="{c}"/>')

def half(cx, cy, r, d, c):
    """Half disc. d = N (bulge up) / S / E / W. Flat edge through the centre."""
    if d == "N": p = f'M{f(cx-r)},{f(cy)} A{f(r)},{f(r)} 0 0 1 {f(cx+r)},{f(cy)}Z'
    elif d == "S": p = f'M{f(cx+r)},{f(cy)} A{f(r)},{f(r)} 0 0 1 {f(cx-r)},{f(cy)}Z'
    elif d == "E": p = f'M{f(cx)},{f(cy-r)} A{f(r)},{f(r)} 0 0 1 {f(cx)},{f(cy+r)}Z'
    else:          p = f'M{f(cx)},{f(cy+r)} A{f(r)},{f(r)} 0 0 1 {f(cx)},{f(cy-r)}Z'
    return f'<path d="{p}" fill="{c}"/>'

def quarter(cx, cy, r, q, c):
    """Quarter disc with its square corner at (cx,cy). q = NE/NW/SW/SE."""
    pts = {"NE": ((cx+r, cy), (cx, cy-r)),
           "NW": ((cx, cy-r), (cx-r, cy)),
           "SW": ((cx-r, cy), (cx, cy+r)),
           "SE": ((cx, cy+r), (cx+r, cy))}[q]
    (sx, sy), (ex, ey) = pts
    return (f'<path d="M{f(cx)},{f(cy)}L{f(sx)},{f(sy)}'
            f'A{f(r)},{f(r)} 0 0 0 {f(ex)},{f(ey)}Z" fill="{c}"/>')

def arch(x, bl, w, h, c):
    """Flat-footed doorway: vertical jambs, semicircular head."""
    sh = bl - h + w / 2.0
    return (f'<path d="M{f(x)},{f(bl)}L{f(x)},{f(sh)}'
            f'A{f(w/2)},{f(w/2)} 0 0 1 {f(x+w)},{f(sh)}L{f(x+w)},{f(bl)}Z" fill="{c}"/>')

def stroke_path(d, w, c, cap="round"):
    return (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{f(w)}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"/>')

def polyline(pts, w, c, cap="round"):
    d = "M" + "L".join(f"{f(x)},{f(y)}" for x, y in pts)
    return stroke_path(d, w, c, cap)

def ray(cx, cy, ang, r0, r1, w, c):
    a = math.radians(ang)
    return polyline([(cx + r0*math.cos(a), cy + r0*math.sin(a)),
                     (cx + r1*math.cos(a), cy + r1*math.sin(a))], w, c)

def dot_grid(x, y, cols, rows, gap, r, c):
    return "".join(disc(x + i*gap, y + j*gap, r, c)
                   for j in range(rows) for i in range(cols))

def dot_row(x0, x1, y, gap, r, c):
    n = max(1, int((x1 - x0) // gap) + 1)
    return "".join(disc(x0 + i*gap, y, r, c) for i in range(n))

def scallop(x0, x1, y, r, d, c):
    n = max(1, int(round((x1 - x0) / (2.0*r))))
    step = (x1 - x0) / n
    return "".join(half(x0 + step*(i + 0.5), y, step/2.0, d, c) for i in range(n))

def weave(x0, x1, y, r, c):
    """Alternating up / down half-discs - the collaboration band."""
    n = max(1, int(round((x1 - x0) / (2.0*r))))
    step = (x1 - x0) / n
    out = []
    for i in range(n):
        out.append(half(x0 + step*(i + 0.5), y, step/2.0, "N" if i % 2 == 0 else "S", c))
    return "".join(out)

def stripes(x0, y0, x1, y1, n, w, c):
    out = []
    for i in range(n):
        x = x0 + (x1 - x0) * i / max(1, n - 1)
        out.append(bar(x - w/2.0, y0, w, y1 - y0, c, w/2.0))
    return "".join(out)

# --------------------------------------------------------------------------
# BRAND MOTIFS
# --------------------------------------------------------------------------
def y_fork(cx, cy, s, c, w=None):
    """
    The etyme 'y', abstracted: two arms converge, one tail continues.
    A person and an opportunity meeting at a point in time.
    """
    w = w or s * 0.30
    a = lambda deg, L: (cx + L*math.cos(math.radians(deg)),
                        cy + L*math.sin(math.radians(deg)))
    return (polyline([a(-125, s*1.05), (cx, cy)], w, c) +
            polyline([a(-52,  s*1.35), (cx, cy)], w, c) +
            polyline([(cx, cy), a(108, s*0.85)], w, c))

def clock(cx, cy, r, c, field):
    """The y, read as a clock face. Etyme's two ideas in one mark: time + match."""
    out = [disc(cx, cy, r, c),
           disc(cx, cy, r*0.855, field),
           disc(cx, cy, r*0.795, c),
           disc(cx, cy, r*0.725, field)]
    for i in range(12):                       # hour ticks
        ang = -90 + i*30
        rr = r*0.60
        a = math.radians(ang)
        out.append(disc(cx + rr*math.cos(a), cy + rr*math.sin(a),
                        r*0.045 if i % 3 else r*0.068, c))
    out.append(y_fork(cx, cy + r*0.06, r*0.46, c, r*0.115))
    out.append(disc(cx, cy + r*0.06, r*0.075, c))
    return "".join(out)

def mark(cx, cy, r, ink, field):
    """The round 2-colour badge: a y-fork knocked out of a solid disc."""
    return disc(cx, cy, r, ink) + y_fork(cx, cy + r*0.08, r*0.52, field, r*0.19)

def figure(x, bl, h, c, field, pose="stand"):
    """A worker. Circle head, arched body, one gestural limb.
    Limbs start inside the body so they read as arms, not sticks."""
    hr, bw, body_h = h*0.145, h*0.46, h*0.60
    o = [disc(x, bl - h + hr, hr, c),
         arch(x - bw/2.0, bl, bw, body_h, c)]
    sy = bl - body_h*0.80
    lw = h*0.125
    if pose == "reach":
        o.append(polyline([(x + bw*0.18, sy), (x + bw*0.86, sy - h*0.17),
                           (x + bw*0.74, sy - h*0.42)], lw, c))
    elif pose == "wave":
        o.append(polyline([(x - bw*0.18, sy), (x - bw*0.88, sy - h*0.14),
                           (x - bw*0.78, sy - h*0.40)], lw, c))
    elif pose == "lift":
        o.append(polyline([(x - bw*0.20, sy), (x - bw*0.80, sy - h*0.30)], lw, c))
        o.append(polyline([(x + bw*0.20, sy), (x + bw*0.80, sy - h*0.30)], lw, c))
    elif pose == "carry":
        o.append(polyline([(x + bw*0.20, sy), (x + bw*0.78, sy + h*0.08)], lw, c))
        o.append(bar(x + bw*0.78 - h*0.14, sy + h*0.22, h*0.28, h*0.21, c, h*0.05))
    return "".join(o)


def portal(x, bl, w, h, ink, field, inner=None):
    """A doorway - an opening into work. Optionally holds a figure."""
    t = w*0.17
    out = [arch(x, bl, w, h, ink),
           arch(x + t, bl, w - 2*t, h - t, field)]
    if inner:
        out.append(inner)
    return "".join(out)

def stair(x, bl, n, bw, gap, h0, h1, c, rx=None):
    rx = bw*0.5 if rx is None else rx
    out = []
    for i in range(n):
        h = h0 + (h1 - h0) * (i / max(1, n - 1))
        out.append(bar(x + i*(bw + gap), bl - h, bw, h, c, rx))
    return "".join(out)

def check_badge(cx, cy, r, ink, field):
    return (disc(cx, cy, r, ink) +
            polyline([(cx - r*0.40, cy + r*0.03), (cx - r*0.10, cy + r*0.33),
                      (cx + r*0.44, cy - r*0.33)], r*0.20, field))

def stream(d, w, ink, field, dots=()):
    """A flowing pipeline with payloads riding along it."""
    out = [stroke_path(d, w, ink)]
    for (px, py) in dots:
        out.append(disc(px, py, w*0.30, field))
    return "".join(out)

def sunburst(cx, cy, r, ink, field, n=5, d="N"):
    """Concentric half-discs breaking a horizon - the dawn."""
    return "".join(half(cx, cy, r * (1 - i/float(n)), d, ink if i % 2 == 0 else field)
                   for i in range(n))


def orbit_dots(cx, cy, r, n, dr, c, a0=0, span=360):
    out = []
    for i in range(n):
        a = math.radians(a0 + span * i / float(n))
        out.append(disc(cx + r*math.cos(a), cy + r*math.sin(a), dr, c))
    return "".join(out)

# --------------------------------------------------------------------------
# TYPE
# --------------------------------------------------------------------------
def text(s, x, y, size, c, font=HEAD_FONT, anchor="start", ls=-0.025, weight="400",
         opacity=None):
    o = f' opacity="{opacity}"' if opacity else ""
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{font}" font-size="{f(size)}" '
            f'font-weight="{weight}" letter-spacing="{f(ls*size)}" fill="{c}" '
            f'text-anchor="{anchor}"{o}>{s}</text>')

def tw(s, size, black=True):
    """Rough advance width for Archivo Black / Archivo, for laying out pills."""
    k = 0.615 if black else 0.545
    narrow = sum(1 for ch in s if ch in "iIlj.,'!| ")
    wide   = sum(1 for ch in s if ch in "mMWw@")
    return (len(s)*k - narrow*0.30 + wide*0.22) * size

def wordmark(x, baseline, size, ink, field, anchor="start"):
    """2-colour etyme lockup: badge + wordmark."""
    r = size*0.62
    if anchor == "start":
        cx = x + r
        tx = x + 2*r + size*0.42
    else:
        total = 2*r + size*0.42 + tw("etyme", size, False)
        cx = x - total + r
        tx = x - total + 2*r + size*0.42
    return (mark(cx, baseline - size*0.36, r, ink, field) +
            text("etyme", tx, baseline, size, ink, BODY_FONT, "start", -0.035, "700"))

def cta_pill(x, y, label, size, ink, field, anchor="start"):
    padx, h = size*1.00, size*2.40
    w = tw(label, size, False) + padx*2 + size*0.95
    x0 = x if anchor == "start" else x - w
    return (bar(x0, y - h/2.0, w, h, ink, h/2.0) +
            text(label, x0 + padx, y + size*0.35, size, field, BODY_FONT, "start", -0.01, "700") +
            polyline([(x0 + w - padx - size*0.44, y - size*0.30),
                      (x0 + w - padx - size*0.06, y),
                      (x0 + w - padx - size*0.44, y + size*0.30)], size*0.15, field))

# --------------------------------------------------------------------------
# SVG DOC
# --------------------------------------------------------------------------
def svg(w, h, body, field):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(w)}" height="{f(h)}" '
            f'viewBox="0 0 {f(w)} {f(h)}" role="img" '
            f'aria-label="Etyme - the future of work">'
            f'<rect width="{f(w)}" height="{f(h)}" fill="{field}"/>{body}</svg>')


def bez(p0, p1, p2, p3, ts):
    """Points along a cubic bezier, so payloads sit exactly on the stream."""
    out = []
    for t in ts:
        u = 1 - t
        out.append((u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]))
    return out

def curve_stream(p0, p1, p2, p3, w, ink, field, n=5):
    d = (f"M{f(p0[0])},{f(p0[1])}C{f(p1[0])},{f(p1[1])} {f(p2[0])},{f(p2[1])} "
         f"{f(p3[0])},{f(p3[1])}")
    dots = bez(p0, p1, p2, p3, [(i + 0.5) / n for i in range(n)])
    return stroke_path(d, w, ink) + "".join(disc(x, y, w*0.26, field) for x, y in dots)
