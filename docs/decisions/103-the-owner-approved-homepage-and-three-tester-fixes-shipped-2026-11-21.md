## The owner-approved homepage and three tester fixes shipped — 2026-11-21

**What he said** (2026-11-18). "New batch: homepage replacement,
owner-approved." Replace the live homepage with his reviewed file
(`prototypes/homepage/approved-2026-11-18.html`), keeping its layout,
structure and copy, with seven non-negotiables:
1. Branding strictly from the brand kit: canvas #F0EEE6, ink #1F1E1D,
   violet #5228FF, Gelasio and Inter, the kit logo at 26px with ink
   letters.
2. Light only: no dark color scheme anywhere on the page.
3. The hero badge reads "Enterprise contingent workforce management."
   The page title is "Etyme | Enterprise contingent workforce
   management". Never a company-size range.
4. "Free" appears only in the hero offer line, the price section and
   the Start free buttons.
5. The footer is the standard site footer.
6. Demo and sample companies stay labeled as demo data.
7. Confirm whether analytics runs on the marketing pages; if none,
   enable the host's web analytics there, and say so.

This supersedes the homepage brief of 2026-11-12 and, for the homepage
only, "don't touch the home page" of 2026-11-18 (record 94), which was
said about the storefront.

**What went out.** Source 27926cb40, deploy commit 7aaf79cb, serving on
both production addresses.
- *The homepage.* The hero is the badge and "Every contractor. Every
  supplier. One record." It has role cards, the Ask Etyme demo with four
  sample questions, guarantees, the three chat doors, a price card
  beside "What Etyme doesn't do yet", and one Start free panel. The
  question line and the locked line of the 2026-11-12 brief, the "At a
  glance" panel, the security card and the complement line are gone.
- *Analytics.* None ran before. The host's web analytics now loads on
  the public marketing pages only (the shared public footer). It is not
  in the signed-in product and not on a firm's public page. It collects
  nothing until it is switched on in the host's project settings.
- *Where the built page differs from his file*, each to keep a standing
  rule:
  - "desk" left the visible text ("Who it is for", "Pick yours"),
    "Program owner" became "Program manager", "Reqs" became "Jobs";
  - the sample figures are the seed's sample company (359 contractors
    through 25 suppliers), not invented ones, and three of the four
    sample questions changed to ones the seed can answer;
  - the sign-up form became one Start free button, because its choices
    were contractor-count ranges and it sent nothing;
  - the two chat doors that are not built carry "Not live yet";
  - the title has no trailing period, as in his file.
- *The company guard.* The three chat doors are read as phrases and set
  aside by `namedCompanies` (`CHAT_DOORS` in `lib/positioning`), on his
  rulings of 2026-11-13 and 2026-11-16. Nothing else is set aside.
- *The legal pages.* The privacy policy and the DPA say which pages
  carry page analytics, name the host as the processor, and say only
  "no advertising cookies", because the package's own documentation
  does not say whether it sets a cookie. They also say what matching
  sends now (no name, a placeholder for the rate) and that a check that
  could not ask the outside service is recorded as unverified.
- *Tester's list, item 1* (record 102). A question asked on a firm's
  public page is kept as one `PageAsk` record before any seat is told.
  The firm lists, searches, takes, answers and closes it on a Questions
  tab under Jobs. One nobody has taken is a decision card, so it counts
  in the number on Ask Etyme. Where the record cannot be written, the
  visitor reads that it did not send.
- *Item 2.* Add consultant has "Our own W-2 employee": it seats her at
  the firm with the Employee role and no bench listing, sends the seat
  invitation, and her first sign-in lands on the record the firm made.
  A client company is not offered it. Somebody who already has an
  account is refused, and the screen says to ask her onto the bench.
- *Item 6.* The Add to Bench dialog links to Add consultant.
- *The fixes before the model key* (records 96, 98): the submission
  check, screening, matching, the worker bio, the nightly match and the
  sheet import ask the company's switch, mask what leaves, and say
  "unverified" where nothing was asked.

**How it was checked.**
- Type check clean. Unit suite 956 files, 17,538 tests. Integration 368
  files, in three parts. Production build.
- A walk in a browser said it ships: the seven non-negotiables one by
  one, every "free" on the page counted, dark preference changing
  nothing, analytics present on public pages and absent in the product
  and on firm pages, a visitor's question kept, counted, taken and
  closed, another firm refused, an employee added with the screen
  saying no email left.
- Smoke on production: health, the homepage's title and badge, the
  public pages, `/site/tapin`, the inbound email door answering 404.

**To do on production, by the founder or staff.**
- Switch on web analytics in the host's project settings.
- Recover the questions already stored:
  `npx tsx scripts/backfill-page-asks.ts` prints counts and writes
  nothing; add `--write` to make the records. It needs production's
  database address, from a machine that holds it.

**Open.**
- The privacy sentence about the package's documentation reads badly
  in a legal page. Whether the host's analytics sets a cookie is his to
  confirm, and the sentence is then restored or cut.
- Naming the host on the privacy page is an exception to "never name a
  real company". A processor list needs the name; he confirms.
- "Not for thousands of contractors" may read as a size claim.
- Adding employees one after another is not counted against the hourly
  invitation limit.
- A question somebody took and never answered nags nobody.
- The page-wide search box does not find a question; the Questions tab
  does.
- The offer pill's tint and the header button's corners differ a little
  from his file.
- Tokens from matching, bio and skill-check calls are not counted
  toward the monthly allowance. An unknown model id is still costed at
  a fallback.
- Tester's list items 3, 5, 7, 8, 9 and 10 (record 102).

**Lessons, so they are not paid for twice.**
- A builder cut off by the usage limit keeps its edits on disk. Resume
  the same builder; do not start another on the same files.
- A test that builds its dates from today must also make the world it
  needs, or it passes on the 4th and fails on the 21st.
- An approved design is checked against the standing rules line by
  line. Where a line cannot be said honestly, the smallest label is
  added and he is told, never a silent change and never a silent claim.
- A new package that changes what a legal page says is a legal change:
  the page and its test move in the same batch.
