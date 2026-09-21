#!/usr/bin/env python3
"""
Placements: the mural, a hairline, and type set the way the home page sets it.

No coloured panel behind the words. The site separates everything with a 1px
rule on the warm ground and nothing else, so these do the same - which is
also why they still hold at two inks.

Copy is the live hero, verbatim: eyebrow, serif headline at regular weight,
Inter subhead, and the page's own primary action.
"""
from mural import *
from scenes import place_art, pick_art

COPY = dict(
    eyebrow="VENDOR MANAGEMENT SYSTEM",
    head_3=["Every contractor.", "Every supplier.", "One record."],
    head_2=["Every contractor.", "One record."],
    head_1=["One record."],
    sub="See every contractor on your sites, which supplier sent them, and what they cost.",
    sub_short="One record of every contractor, across every supplier.",
    cta="Open an example program",
)

# proportions taken off the live hero: h1 60px, eyebrow 10, sub 21, button 14
R_EYE, R_SUB, R_CTA, R_MARK = 0.167, 0.350, 0.233, 0.470

def clamp(v, lo, hi):
    return max(lo, min(v, hi))

def wrap(s, size, maxw, maxlines):
    lines, cur = [], ""
    for word in s.split():
        t = (cur + " " + word).strip()
        if not cur or tw(t, size, "sans") <= maxw:
            cur = t
        else:
            lines.append(cur); cur = word
            if len(lines) >= maxlines:
                return None
    lines.append(cur)
    return lines if len(lines) <= maxlines else None

def _fit(head, iw, ih, sub, cta, mark, eyebrow):
    """Resolve the stack headline-first and report the size it allows."""
    by_w = iw / max(tw(l, 1.0, "serif") for l in head)
    hs = min(by_w, iw*0.20)

    def sizes(h):
        return (clamp(h*R_MARK, 11, ih*0.16) if mark else 0,
                clamp(h*R_EYE, 7, ih*0.09) if eyebrow else 0,
                clamp(h*R_SUB, 8, ih*0.13) if sub else 0,
                clamp(h*R_CTA, 8, ih*0.12) if cta else 0)

    for _ in range(24):
        ms, es, ss, cs = sizes(hs)
        sub_lines = wrap(sub, ss, iw, 3) if sub else None
        if sub and sub_lines is None:
            return None
        if eyebrow and tw(COPY["eyebrow"], es, "sans", 600, 0.14) > iw:
            return None
        used = 0.0
        if mark:    used += ms*1.15 + hs*0.62
        if eyebrow: used += es*1.10 + hs*0.34
        if sub:     used += hs*0.44 + len(sub_lines)*ss*1.60
        if cta:     used += hs*0.46 + cs*2.70
        need = len(head)*hs*1.06 + used
        if need <= ih:
            return dict(hs=hs, ms=ms, es=es, ss=ss, cs=cs, sub_lines=sub_lines)
        hs *= 0.94
    return None

def type_block(x, y, w, h, ink, field, head_sets, sub, cta):
    p = clamp(min(w, h)*0.115, min(w, h)*0.075, min(w, h)*0.19)
    p = max(p, 7)
    ix, iy, iw, ih = x + p, y + p, w - 2*p, h - 2*p

    # richest first: drop the subhead, then the button, then the eyebrow, then
    # the lockup. Never shrink the headline past readable to keep them all.
    # drop the subhead first, then the eyebrow, then the button, and the
    # lockup only when there is nothing left to give
    COMBOS = ((1, 1, sub, cta), (1, 1, None, cta), (1, 0, None, cta),
              (1, 0, None, None), (0, 0, None, None))
    best = None
    for hi, heads in enumerate(head_sets):
        ideal = min(iw / max(tw(l, 1.0, "serif") for l in heads), iw*0.20)
        for rank, combo in enumerate(COMBOS):
            mk, ey, sb, ct = combo
            r = _fit(heads, iw, ih, sb, ct, mk, ey)
            if r and r["hs"] >= ideal*0.45:
                # keep the mark first, then the longer headline, then the rest
                cand = ((0 if mk else 1), hi, rank, -r["hs"], r, heads, combo)
                if best is None or cand[:4] < best[:4]:
                    best = cand
                break
    if best is None:                       # nothing fits cleanly: take the roomiest
        for heads in head_sets:
            for rank, combo in enumerate(COMBOS):
                mk, ey, sb, ct = combo
                r = _fit(heads, iw, ih, sb, ct, mk, ey)
                if r and (best is None or r["hs"] > -best[3]):
                    best = ((0 if mk else 1), 0, rank, -r["hs"], r, heads, combo)
    if best is None:
        return "", False
    plan, head, (mark, eye, sub, cta) = best[4], best[5], best[6]
    hs, ms, es, ss, cs = plan["hs"], plan["ms"], plan["es"], plan["ss"], plan["cs"]

    o, top = [], iy
    if mark:
        o.append(lockup(ix, top + ms*0.80, ms, ink, field))
        top += ms*1.15 + hs*0.62
    if eye:
        o.append(text(COPY["eyebrow"], ix, top + es*0.82, es, ink, SANS,
                      "start", 0.14, "600"))
        top += es*1.10 + hs*0.34
    for i, line in enumerate(head):
        o.append(text(line, ix, top + hs*0.74 + i*hs*1.06, hs, ink, SERIF,
                      "start", -0.02, "400"))
    top += len(head)*hs*1.06
    if sub:
        top += hs*0.44
        for i, ln in enumerate(plan["sub_lines"]):
            o.append(text(ln, ix, top + ss*0.80 + i*ss*1.60, ss, ink, SANS,
                          "start", -0.005, "400"))
        top += len(plan["sub_lines"])*ss*1.60
    if cta:
        top += hs*0.46
        o.append(button(ix, top + cs*1.35, cta, cs, ink, field))
    return "".join(o), bool(mark)


def compose(w, h, cwname, mode="split", uid=0, nudge=0.5):
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    if mode == "art":
        return svg(w, h, place_art(pick_art(w, h), 0, 0, w, h, ink, field, uid, nudge),
                   field, "Etyme")

    a = w / float(h)
    t = clamp(min(w, h)*0.0055, 1.0, 5.0)
    if a >= 1.5:                                     # type left, mural right
        pw = w * (0.60 if a > 4.2 else (0.46 if a > 2.2 else 0.50))
        tx, ty, tW, tH = 0, 0, pw, h
        ax, aW = pw, w - pw
        art = place_art(pick_art(aW, h), ax, 0, aW, h, ink, field, uid, 0.58)
        div = rect(pw - t/2, 0, t, h, ink)
    else:                                            # type above, mural below
        ph = h * (0.50 if a >= 0.78 else (0.44 if a >= 0.45 else 0.48))
        tx, ty, tW, tH = 0, 0, w, ph
        art = place_art(pick_art(w, h - ph), 0, ph, w, h - ph, ink, field, uid, 0.48)
        div = rect(0, ph - t/2, w, t, ink)

    sets = ([COPY["head_3"], COPY["head_2"], COPY["head_1"]]
            if min(w, h) >= 150 else [COPY["head_2"], COPY["head_1"]])
    sub = COPY["sub"] if min(w, h) >= 400 else COPY["sub_short"]
    block, marked = type_block(tx, ty, tW, tH, ink, field, sets, sub, COPY["cta"])
    # a leaderboard has no room for the lockup beside the headline, and an ad
    # with no attribution is not worth running: put the mark in the artwork
    if not marked:
        ax0, ay0 = (tW, 0) if a >= 1.5 else (0, ph)
        aw0, ah0 = (w - tW, h) if a >= 1.5 else (w, h - ph)
        ms = clamp(min(aw0, ah0)*0.30, 16, 64)
        pad = ms*0.55
        block += tmark(ax0 + aw0 - pad - ms/2, ay0 + pad + ms/2, ms, ink, field)
    body = art + div + block
    return svg(w, h, body, field, "Etyme — every contractor, every supplier, one record")


def pattern(s, cwname):
    """A seamless field of evidence dots - the product's smallest mark."""
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    o, g, r = [], s/4.0, s*0.030
    for j in range(4):
        for i in range(4):
            solid = ((i*3 + j*5) % 7) < 3
            o.append(evidence(g*(i + 0.5), g*(j + 0.5), r, ink, solid))
    return svg(s, s, "".join(o), field)

def badge(s, cwname):
    C = COLORWAYS[cwname]; ink, field = C["ink"], C["field"]
    return svg(s, s, tmark(s/2, s/2, s, ink, field), field, "Etyme")
