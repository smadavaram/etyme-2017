#!/usr/bin/env python3
"""
Placements: the mural, plus one flat block of type. Nothing else.

The type block always resolves headline-first. If the space cannot carry a
headline at a confident size, the supporting copy is dropped - never shrunk
until it is unreadable. Small banners end up headline + wordmark, which is
what a 320x50 slot can actually hold.
"""
from mural import *
from scenes import place_art, pick_art

COPY = dict(
    head_2=["The future", "of work."],
    head_1=["The future of work."],
    sub="Hiring, contracts, timesheets and payments — one platform.",
    sub_short="One platform for hiring, contracts and time.",
    cta="See how it works",
)

def clamp(v, lo, hi):
    return max(lo, min(v, hi))

def wrap(s, size, maxw, maxlines):
    """Greedy wrap. Returns None if it will not fit in maxlines."""
    lines, cur = [], ""
    for word in s.split():
        t = (cur + " " + word).strip()
        if not cur or tw(t, size, False) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = word
            if len(lines) >= maxlines:
                return None
    lines.append(cur)
    return lines if len(lines) <= maxlines else None

def _solve(iw, ih, head, sub, cta, wm):
    """Lay the stack out top-down and report the headline size it allows."""
    wm_s  = clamp(iw*0.050, 9, ih*0.15) if wm else 0
    cta_s = clamp(iw*0.036, 8, ih*0.13) if cta else 0
    sub_s = clamp(iw*0.032, 7, ih*0.11) if sub else 0

    sub_lines = wrap(sub, sub_s, iw, 2) if sub else None
    if sub and sub_lines is None:
        return None

    used = 0.0
    if wm:  used += wm_s*1.30 + wm_s*0.80
    if sub: used += len(sub_lines)*sub_s*1.28 + sub_s*0.80
    if cta: used += cta_s*2.40 + cta_s*0.80

    avail = ih - used
    if avail <= 0:
        return None
    hs = min(iw / max(tw(l, 1.0) for l in head), avail / (len(head)*1.03), iw*0.30)
    return dict(hs=hs, wm_s=wm_s, cta_s=cta_s, sub_s=sub_s, sub_lines=sub_lines)

def type_block(x, y, w, h, ink, field, head, sub, cta, wm=True, safe_top=0):
    """A flat INK block carrying FIELD type - the plaque beside the mural."""
    p = clamp(min(w, h) * 0.115, min(w, h)*0.08, min(w, h)*0.20)
    p = max(p, 6)
    ix, iy, iw, ih = x + p, y + p + safe_top, w - 2*p, h - 2*p - safe_top

    ideal = min(iw / max(tw(l, 1.0) for l in head), iw*0.30)
    plan = None
    for opts in ((wm, sub, cta), (wm, None, cta), (wm, None, None), (False, None, None)):
        s = _solve(iw, ih, head, opts[1], opts[2], opts[0])
        if s and (s["hs"] >= ideal*0.45 or opts == (False, None, None)):
            plan, wm, sub, cta = s, opts[0], opts[1], opts[2]
            break
    if plan is None:
        plan = _solve(iw, ih, head, None, None, False) or dict(
            hs=ih*0.5, wm_s=0, cta_s=0, sub_s=0, sub_lines=None)
        wm = sub = cta = None

    hs, wm_s, cta_s, sub_s = plan["hs"], plan["wm_s"], plan["cta_s"], plan["sub_s"]
    o = [bar(x, y, w, h, ink)]

    top = iy
    if wm:
        o.append(wordmark(ix, top + wm_s*0.76, wm_s, field, ink))
        top += wm_s*1.30 + wm_s*0.80

    bot = iy + ih
    if cta:
        o.append(cta_pill(ix, bot - cta_s*1.20, cta, cta_s, field, ink))
        bot -= cta_s*2.40 + cta_s*0.80
    if sub:
        lines = plan["sub_lines"]
        base = bot - len(lines)*sub_s*1.28 + sub_s
        for i, ln in enumerate(lines):
            o.append(text(ln, ix, base + i*sub_s*1.28, sub_s, field,
                          BODY_FONT, "start", -0.005, "500", "0.82"))
        bot -= len(lines)*sub_s*1.28 + sub_s*0.80

    block_h = len(head)*hs*1.03
    base = top + (bot - top - block_h)*0.5 + hs*0.76
    for i, line in enumerate(head):
        o.append(text(line, ix, base + i*hs*1.03, hs, field, HEAD_FONT, "start", -0.032))
    return "".join(o)


def compose(w, h, cwname, mode="split", uid=0, nudge=0.5):
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    if mode == "art":
        return svg(w, h, place_art(pick_art(w, h), 0, 0, w, h, ink, field, uid, nudge), field)

    a = w / float(h)
    one_line = a > 4.2 or (a > 1.2 and h < 140)
    head = COPY["head_1"] if one_line else COPY["head_2"]

    if a >= 1.55:                                   # type left, mural right
        pw = w * (0.60 if a > 4.2 else (0.44 if a > 2.2 else 0.47))
        tx, ty, tW, tH = 0, 0, pw, h
        ax, ay, aW, aH = pw, 0, w - pw, h
        na = 0.62
    else:                                           # type above, mural below
        ph = h * (0.46 if a >= 0.78 else (0.44 if a >= 0.45 else 0.42))
        tx, ty, tW, tH = 0, 0, w, ph
        ax, ay, aW, aH = 0, ph, w, h - ph
        na = 0.58

    sub = COPY["sub"] if min(w, h) >= 380 else COPY["sub_short"]
    # Instagram / Facebook stories put their own UI over the top ~13% of frame.
    safe = h*0.085 if (h / float(w) >= 1.6) else 0
    body = (place_art(pick_art(aW, aH), ax, ay, aW, aH, ink, field, uid, na) +
            type_block(tx, ty, tW, tH, ink, field, head, sub, COPY["cta"], True, safe))
    return svg(w, h, body, field)


def tile(s, cwname):
    """Seamless scallop repeat, built from the mural's own half-discs.
    Two banded rows per tile, offset by half a scallop, so it butts up cleanly
    on all four edges. For accent bands and section dividers."""
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    r, o = s*0.25, []
    o += [half(s*0.25, 0, r, "S", ink), half(s*0.75, 0, r, "S", ink)]
    o += [half(0, s*0.5, r, "S", ink), half(s*0.5, s*0.5, r, "S", ink),
          half(s, s*0.5, r, "S", ink)]
    return svg(s, s, "".join(o), field)

def badge(s, cwname):
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    return svg(s, s, disc(s/2, s/2, s/2, ink) + y_fork(s/2, s*0.545, s*0.245, field, s*0.092), field)
