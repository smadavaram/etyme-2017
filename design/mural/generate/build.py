#!/usr/bin/env python3
"""Generate the whole asset kit, in both colourways."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mural import *
from layout import compose, pattern, badge

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"

SPECS = [
  # masters: artwork only, for the site (headline goes over them in HTML)
  ("mural-master-band",       2400, 800,  "art"),
  ("mural-master-block",      1600, 1600, "art"),
  ("mural-master-column",     1000, 2000, "art"),
  ("home-hero",               1920, 1080, "art"),
  ("home-hero-strip",         2560, 720,  "art"),
  ("section-divider",         2400, 360,  "art", "strip"),
  ("section-divider-narrow",  900,  360,  "art", "strip-narrow"),

  ("og-share",                1200, 630,  "split"),

  ("meta-feed-square",        1080, 1080, "split"),
  ("meta-feed-portrait",      1080, 1350, "split"),
  ("meta-story-reel",         1080, 1920, "split"),
  ("meta-link-ad",            1200, 628,  "split"),

  ("gdn-300x250",             300,  250,  "split"),
  ("gdn-336x280",             336,  280,  "split"),
  ("gdn-300x600",             300,  600,  "split"),
  ("gdn-160x600",             160,  600,  "split"),
  ("gdn-728x90",              728,  90,   "split"),
  ("gdn-970x250",             970,  250,  "split"),
  ("gdn-468x60",              468,  60,   "split"),
  ("gdn-320x50",              320,  50,   "split"),
  ("gdn-320x100",             320,  100,  "split"),
  ("gdn-responsive-1200x628", 1200, 628,  "split"),

  ("billboard-48sheet",       2880, 960,  "split"),
  ("billboard-ultrawide",     3200, 800,  "split"),
  ("board-portrait",          1080, 1620, "split"),

  ("linkedin-banner",         1584, 396,  "split"),
  ("x-header",                1500, 500,  "split"),
  ("bio-card",                1080, 1080, "art"),
]

def main():
    sd = os.path.join(OUT, "svg"); os.makedirs(sd, exist_ok=True)
    made, uid = [], 0
    for spec in SPECS:
        name, w, h, mode = spec[:4]
        kind = spec[4] if len(spec) > 4 else None
        for cw in ("navy", "night"):
            uid += 1
            fn = f"etyme-{name}-{cw}.svg"
            open(os.path.join(sd, fn), "w").write(compose(w, h, cw, mode, uid, kind=kind))
            made.append((fn, w, h))
    for cw in ("navy", "night"):
        for fn, body, size in ((f"etyme-pattern-tile-{cw}.svg", pattern(400, cw), 400),
                               (f"etyme-mark-{cw}.svg", badge(512, cw), 512)):
            open(os.path.join(sd, fn), "w").write(body)
            made.append((fn, size, size))
    with open(os.path.join(OUT, "manifest.txt"), "w") as fh:
        for fn, w, h in made:
            fh.write(f"{fn}\t{w}\t{h}\n")
    print(f"{len(made)} svg -> {sd}")

main()
