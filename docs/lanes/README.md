# The party documents — swim lanes and the test scripts that prove them

One generator draws every L1 stream as a swim lane, once, and re-draws it
from each party's vantage point; lists under each drawing the integration
test sentences that walk that party's stations; and renders one PDF per
party. The founder reads the drawings and the test names. Nothing here is
production code.

```
node docs/lanes/build-all.mjs     # ten party pages + the artifact page → docs/lanes/out/
node docs/lanes/render-pdfs.mjs   # one 17×11in PDF per party (Playwright, Chromium preinstalled)
node docs/lanes/compete.mjs       # the competitive landscape page, from the same renderer
```

## How it is built

- **`streams.mjs` is the data.** `L` names the base lanes (a supplier's
  desks and its three counterparties). `streams` holds L1.1–L1.7, each as
  `steps` (`{id, lane, col, label, note, refuse?, hollow?, desk?, split?}`)
  and `arrows` (`{from, to, label?, dashed?}`). `parties` holds the ten
  vantage points; `viewFor(party, stream)` maps base lanes onto the party's
  own desks (blue-edged, solid) and collapses everybody else into shaded,
  faded lanes. `clientFlow` is the one end-to-end drawing, four panels on
  ten fixed lanes. `svg()` is the renderer: orthogonal connectors, one
  elbow in the column gap, a detour over the lane when both elbows would
  cross a box, labels on the longest straight segment, every box numbered
  in reading order, clay for a refusal, dashed for a station named but not
  yet built.
- **`build-all.mjs` is the classifier.** `sentences.mjs` re-reads every
  `describe`/`it` under `__integration__/` on each build; `FILE` maps each
  walk to the parties it involves and the stream it belongs to, `STREAM`
  and `L17` regexes place cross-stream walks step by step, and the
  candidate regexes split candidate sentences across the three candidate
  parties. A sentence renamed in a test is renamed in the document.
- **A drawing is checked, not admired.** Lane sub-labels over 30
  characters throw. Every party × stream is rendered by the build, so a
  step that lands on a lane the party does not have fails loudly.

## The prompt that produces one of these for another object

Give this to an agent, filling the brackets. It is the brief that produced
the client document, generalized.

> Draw **[the L1 stream / the L2 group / the object — e.g. "an expense,
> from receipt to reimbursement"]** as a swim lane in `docs/lanes/streams.mjs`,
> using the base lanes in `L` (add a lane only if no existing desk does the
> job, and give it a sub-label under 30 characters). One box per station a
> person acts at; the label is what that person would say, the note is the
> rule in six words; a **refusal** is a clay sentence on the box in the
> product's own words, never a code; a station the operating model names
> that the build does not yet do is a **dashed** box. Every arrow carries
> the artifact that moves (the requisition, the submission, the bill, the
> timesheet receipt) — never an unlabeled arrow between two boxes. Where the
> station is done by different desks at different parties, tag the step
> with `desk: {client, msp, sub}` so `viewFor` places it. Then add the
> sentence for it to the caption, and a row to the stream's trade-language
> table (Etyme's word · the inspiration's word · where they meet and part;
> no transaction codes, ever).
>
> Then prove it: for every station, name the integration test sentence
> that walks it (`__integration__/*.test.ts`, `it('…')` as an English
> sentence). Where none exists, write the walk on the seeded world first —
> Northbend Athletic, Cavanaugh Glassworks, Talvern Medical and their
> suppliers — as sentences a non-coder reads, then map the file to its
> parties and stream in `FILE` in `build-all.mjs`. A station with no
> sentence under it is drawn dashed until it has one.
>
> Build with `node docs/lanes/build-all.mjs && node docs/lanes/render-pdfs.mjs`,
> open the party PDFs at pages for that stream, and look: no arrow crosses
> a box, no label sits on a title, no lane is empty for the party whose
> document it is. Send the PDFs; publish `out/seven-streams.html` as the
> artifact.

Loops in the drawings are the arrows that come back: a refused week filed
again, a match exception decided and re-run, a hold lifted and the erasure
resumed. Draw them as a dashed arrow returning to the earlier column with
the reason on it; never as a second copy of the station.
