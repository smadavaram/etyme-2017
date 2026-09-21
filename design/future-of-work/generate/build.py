#!/usr/bin/env python3
"""Generate the whole Etyme 'Future of Work' asset kit."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mural import *
from layout import compose, tile, badge

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"

# name,               w,    h,    mode,   colorways
SPECS = [
  # --- masters: artwork only, for the website hero (text goes over it in HTML)
  ("mural-master-band",      2400, 800,  "art",   ["light", "indigo"]),
  ("mural-master-block",     1600, 1600, "art",   ["light", "indigo"]),
  ("mural-master-column",    1000, 2000, "art",   ["light", "indigo"]),
  ("home-hero",              1920, 1080, "art",   ["light", "indigo"]),
  ("home-hero-strip",        2560, 720,  "art",   ["light", "indigo"]),

  # --- website / sharing
  ("og-share",               1200, 630,  "split", ["light", "indigo"]),

  # --- Meta (Facebook + Instagram)
  ("meta-feed-square",       1080, 1080, "split", ["light", "indigo"]),
  ("meta-feed-portrait",     1080, 1350, "split", ["light", "indigo"]),
  ("meta-story-reel",        1080, 1920, "split", ["light", "indigo"]),
  ("meta-link-ad",           1200, 628,  "split", ["light", "indigo"]),

  # --- Google Display Network
  ("gdn-300x250",            300,  250,  "split", ["light", "indigo"]),
  ("gdn-336x280",            336,  280,  "split", ["light", "indigo"]),
  ("gdn-300x600",            300,  600,  "split", ["light", "indigo"]),
  ("gdn-160x600",            160,  600,  "split", ["light", "indigo"]),
  ("gdn-728x90",             728,  90,   "split", ["light", "indigo"]),
  ("gdn-970x250",            970,  250,  "split", ["light", "indigo"]),
  ("gdn-468x60",             468,  60,   "split", ["light", "indigo"]),
  ("gdn-320x50",             320,  50,   "split", ["light", "indigo"]),
  ("gdn-320x100",            320,  100,  "split", ["light", "indigo"]),
  ("gdn-responsive-1200x628",1200, 628,  "split", ["light", "indigo"]),

  # --- out of home / boards
  ("billboard-48sheet",      2880, 960,  "split", ["light", "indigo"]),
  ("billboard-ultrawide",    3200, 800,  "split", ["light", "indigo"]),
  ("board-portrait",         1080, 1620, "split", ["light", "indigo"]),

  # --- profiles / link-in-bio
  ("linkedin-banner",        1584, 396,  "split", ["light", "indigo"]),
  ("x-header",               1500, 500,  "split", ["light", "indigo"]),
  ("bio-card",               1080, 1080, "art",   ["light", "indigo"]),
]

def main():
    sd = os.path.join(OUT, "svg"); os.makedirs(sd, exist_ok=True)
    uid = 0
    made = []
    for name, w, h, mode, cws in SPECS:
        for cw in cws:
            uid += 1
            s = compose(w, h, cw, mode, uid)
            fn = f"etyme-fow-{name}-{cw}.svg"
            open(os.path.join(sd, fn), "w").write(s)
            made.append((fn, w, h))
    for cw in ("light", "indigo"):
        open(os.path.join(sd, f"etyme-fow-pattern-tile-{cw}.svg"), "w").write(tile(400, cw))
        made.append((f"etyme-fow-pattern-tile-{cw}.svg", 400, 400))
        open(os.path.join(sd, f"etyme-fow-mark-{cw}.svg"), "w").write(badge(512, cw))
        made.append((f"etyme-fow-mark-{cw}.svg", 512, 512))
    print(f"{len(made)} svg files -> {sd}")
    with open(os.path.join(OUT, "manifest.txt"), "w") as fh:
        for fn, w, h in made:
            fh.write(f"{fn}\t{w}\t{h}\n")

main()
