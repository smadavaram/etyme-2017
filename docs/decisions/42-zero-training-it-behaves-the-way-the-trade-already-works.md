## Zero training — it behaves the way the trade already works

**Decided 2026-09-10.** The people using this are HR and contracting
professionals. They will not be trained on it, and nothing may assume
they were. Gmail and Airbnb are the reference: a first-time user does the
right thing because the product is shaped like the thing they already
know how to do.

What that means, concretely — and every one of these was learned by
getting it wrong first:

- **Their words, not the system's.** A nav entry, a column, a chip or a
  filter says what a recruiter or a programme manager would say —
  Requirements, Submissions, AR, AP, POs, Contracts. Never an internal
  state name. The 2017 timeline filter was the cycle engine's own enum
  (`TimesheetSubmit`, `SalaryCalculation`); the rebuild's nav read as
  "out of context for Indian English speakers". Both were the same
  mistake: exposing how it is built instead of what it is for.
- **Three words, not nineteen states.** Group internal states into the
  handful of milestones a person actually acts on — hours, pay, bill;
  draft, awaiting, open, filled, cancelled. Every internal transition
  does not deserve its own name on a screen.
- **One door, then the right seat.** Never ask a visitor to classify
  themselves on a distinction the product exists to say is not a property
  of a firm. Demand and supply are positions on a deal.
- **Default aggressively, configure rarely.** Ship the one sane default
  (Friday weeks, the 15th and month-end, forward weekend shift). Add a
  setting the first time a paying client needs a different answer, not
  because a legacy client theoretically could. A knob per client is how
  the 2017 engine reached four thousand commits.
- **Never hand them a form whose answer is thrown away.** The seat
  picker was one for a week. If a choice is offered, the choice is
  honoured.
- **American English, on every screen.** Decided 2026-09-13. The
  customers are US enterprises: program, program office, cost center,
  authorization, color. A buyer who reads "Programme team" registers
  foreign before they register what it does.
  `__tests__/invariants/american-english.test.ts` fails on a British
  spelling anywhere under `src/`. Machine names that were British before
  the decision — the demo desk key `programme`, the seeded
  `world-nike-programme@` email, `seed-programmes.ts` — stay, because an
  address is not a word anybody reads. This file keeps its own spelling.
- **Every list, two ways.** Decided 2026-09-13. A list is a table when
  there are two hundred rows and a feed when there are eight, and the
  reader chooses — every list offers both, from one description of its
  rows (`components/list-surface`), and remembers the choice.
  `__tests__/invariants/list-surface.test.ts` fails on a page that draws
  a bare table.
- **A chart's colors are computed, not chosen.** Decided 2026-09-13.
  One palette, in `lib/chart-colors`, with the validator run quoted
  beside each set: a severity ramp for ordered bands (one hue, light to
  dark, so worse reads as darker), a fixed series order for identity
  (never cycled, never recolored by rank), and reserved status colors
  that are never "series four". Stacked fills are separated by a 2px
  gap in the surface, never a border; a count sits in the legend, never
  inside a segment where a narrow band clips it; and where nothing
  varies — eight bars all of length one — the list is the honest form
  and no bar is drawn.
  `__tests__/invariants/chart-colors.test.ts` recomputes the lightness
  and contrast rather than pinning hex, and fails on any screen that
  reaches outside the palette.
- **Explain in a sentence, not a code.** A refusal says what is missing
  and what to do — "Priya cannot start without an I-9. Get it on file,
  then activate." — never `DOCUMENTS_BLOCK`. The code is for the
  machine; the sentence is the product.

The test for any screen: would somebody who has done this job for ten
years, and never seen Etyme, do the right thing on the first try? If the
honest answer needs the word "once they understand", it is not done.
