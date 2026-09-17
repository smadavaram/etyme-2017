# CLAUDE.md

Context for any agent working on this repository. Read this before touching code.

---

## What this is

Etyme — an AI-native platform for contingent staffing. It sits between staffing
vendors, their consultants, and the enterprises who hire them.

**Thesis (BRD line 49):** automate commodity workflows so recruiters become human
capital developers — mentoring, coaching, upgrading consultants for AI-era roles.
Sourcing tooling commoditised recruiters into resume-forwarders; this reverses that.

**The founder is not a coder.** He cannot review your code. He can read test names,
click a preview URL, and tell you whether the behaviour is right. Design your work
so those three things are sufficient. See "How work is verified" below — it is not
optional.

---

## What Etyme is — say this, not something else

**Etyme is the system of record for contingent workers: the layer between
a company and every staffing supplier it uses.**

Category first, the way Concur says Travel and Expense before it says
anything clever. The span is requisition → suppliers → submissions →
screening → interviews → onboarding → timesheets → invoices →
compliance. Naming one station makes the whole product read as that
station.

**Tenure is the moat, not the wedge. Decided 2026-09-17.** This section
has now been corrected twice, and the second correction reverses what the
first left standing.

On the 15th it said tenure was the wedge because it is "a legal exposure
rather than a saving". The founder pushed back: nobody is fined at month
nineteen, there is no tenure regulator, enterprises have run eighteen-month
rules on spreadsheets for years and mostly nothing happens. The reason was
replaced — tenure is the number nobody can produce — and the conclusion
was kept.

On the 17th the founder pushed back on the conclusion: **"Tenure is
nobody's problem — only you expect it to be solved."** And that was right
too. Cross-supplier identity resolution and the union of periods are
beautiful engineering problems, and a builder mistakes a problem that is
satisfying to solve for one somebody is paying to have solved. Every
agent read "the sharpest wedge is tenure" and built toward it; no buyer
ever said it.

**A wedge is why they buy. A moat is why they cannot leave.** The two
were conflated here. Tenure is a plausible moat — once every supplier's
contracts for a client are in one place, a number is computable that no
VMS and no supplier can produce, and that gets harder to walk away from
over time. It is a bad wedge — nobody wakes up worried about it, and "we
have never been caught" is true.

So: **keep the tenure ledger, computed correctly, as one line in the
picture. Stop leading with it.** The screens were already more honest
than this paragraph — the client dashboard shows tenure as one panel of
six, and the home page hooks on not-knowing, not on tenure. What was
wrong was the sentence agents were steered by.

**What the wedge actually is is not decided here**, on purpose. It is one
of the four questions below, and which is sharpest is something a buyer
says, not something an agent derives. Twice now an agent has picked
confidently and been repeating somebody else's confidence. The fastest
way to find out is one client answering their CFO with this instead of a
spreadsheet.

**Compliance is the justification, not the motivation.** People buy
because somebody asks a basic question about their own workforce and they
cannot answer it — how many contractors do we have, what are we spending,
who has been here longest, are we paying two suppliers differently for one
skill. Every answer is "I'll get back to you", then three weeks, then a
number nobody trusts. That happens monthly. The penalty is hypothetical.

They then justify the purchase to finance with the exposure. Two
sentences doing two jobs, and anything user-facing needs both: **the hook
is the not-knowing; the business case is what it costs when somebody
finally asks.** Leading with the penalty is selling a fear the buyer does
not actually hold.

**Say it to the client.** The page may not address hiring companies,
primes, subs and bench operators as four equal audiences — that is the
old plan, from before the client became the customer on 2026-09-10.
Speaking to four is speaking sharply to none: a hiring manager who reads
"primes, subs, bench operators" concludes this is software for staffing
firms and leaves. Write to the client and let the suppliers read over
their shoulder; they come anyway, because their client is there.

**Never lead with AI.** It is in there, it does real work, and it is the
least defensible thing in the product. Roughly half of what looks like
AI is plain rules, and that is a feature.

**Two constraints this positioning creates:**
- Horizontal, never vertical. Nothing in the core may assume IT staffing —
  the same product has to work for a travel nurse or a validation engineer.
- Neutrality is absolute. Etyme never runs a bench and never places
  anybody. The moment it competes with its own suppliers the network
  stops growing.

### Why this is written down

It was agreed in conversation and the landing page went on saying
something else for a week — "Stop reading bad submissions", which is one
module describing itself, over a hero showing a shortlist. It read as a
hiring tool. Nothing caught it, because positioning has no test and the
founder had not seen the page.

Copy and framing drift the moment a decision lives only in a chat log.
Anything user-facing gets checked against this section before it ships.

---

## Source of truth, in order

1. `/spec/Etyme_Master_BRD_v3_7_FINAL.docx` — 34 sections. **FROZEN BASELINE.**
   Amendments require a change log, never a rewrite.
2. `/spec/Etyme_BRD_Addendum_D.docx` — work authorisation transition, consultant
   retention, rate transparency. Ratified.
3. `/spec/Etyme_BRD_Addendum_E.docx` — client workforce governance, co-employment
   and tenure, approval chains. Ratified.
4. `/spec/Etyme_User_System_Stories.docx` — 22 modules, paired user and system stories.
5. `prisma/schema.prisma` — the data model. Consolidates 134 legacy models into ~28.
6. `BUILD.md` — API surface, workflows, background jobs, permissions.

If code and spec disagree, the spec wins — unless the spec is wrong, in which case
stop and say so rather than quietly diverging.

---

## Stack (decided, BRD §26.3)

Next.js 14 App Router · TypeScript · Prisma · Postgres with pgvector · NextAuth ·
Vercel · Claude API for parsing and matching.

One language, one repository, one deploy target. Do not introduce a second runtime,
a second ORM, or a microservice without asking.

---

## User populations and channels

Two distinct populations, two auth paths, two notification channels.

| Population | Sign-in | Domain | Notifications |
|---|---|---|---|
| **Business users** (vendors, clients, MSPs, GSIs) | Microsoft (Azure AD / Entra), Google Workspace | Verified from OAuth tenant — corporate domain | **Microsoft Teams** webhook per company channel; email fallback |
| **Candidates** (consultants as individuals) | Google (Gmail), Email magic link, Yahoo | Consumer email — no company domain | **Email only** (transactional via SendGrid / Resend) |

**Domain detection rule:** if the OAuth domain is `gmail.com`, `yahoo.com`,
`outlook.com`, `hotmail.com`, or any known consumer provider → candidate, not
company admin. The OAuth tenant is the authority — replaces the 2017
`EXCLUDED_DOMAINS` check.

**LinkedIn** is a profile field (URL), not an auth provider. Candidates paste it;
we do not use LinkedIn OAuth.

---

## Ratified decisions — these are constraints, not preferences

**From Addendum D**
- Rate visibility is a **per-requirement** vendor setting. Not a company-wide switch,
  not a platform mandate. Setting lives on `Requirement`, inherited by `Assignment`.
- Two margins are distinguished: arbitrage (opacity-based) and expertise (capability-based).
  `Requirement.margin_class` carries this. Do not build features that assume all margin
  is extractive.
- Where markup is undisclosed, trust is carried by rate progression, bench pay honoured,
  median tenure — never by displaying an absence of disclosure.

**From Addendum E**
- **Tenure accrues to the person at the client**, aggregated across all vendors and all
  assignments. Twelve months via one vendor plus twelve via another is twenty-four months
  of exposure. Per-assignment tenure tracking is wrong and is the industry's blind spot.
- Enforcement: **BLOCK** where legally grounded — tenure limit, break in service, work
  authorisation, lapsed supplier insurance, segregation-of-duties violation.
  **WARN, capture a reason, proceed** everywhere else — rate band, headcount plan,
  vendor tier. **Never silently permit.**
- Alumni re-engagement ("ask them back") must check the tenure ledger **before** the
  action is offered. Inside a break period, show the eligibility date instead of a button.
- Governance is table stakes for any client with more than one hiring manager. Never
  gate it behind a pricing tier.
- **A desk nobody has named falls back; it never refuses.** Decided 2026-09-13.
  Where a chain needs a department lead and no value rule names one — a client
  in its first week before anybody wrote a delegation of authority, or an
  approver who recommended the firm themselves and so cannot decide it — the
  program office stands in and the screen says "Program office" rather than
  "Department lead". Refusing instead would mean a client cannot onboard a
  supplier until governance is configured, which is the workaround trap above,
  and would stop a VP recommending anybody at all.
- Most requisitions must clear **without human approval**. Governance slower than the
  workaround produces the workaround.
- **A sub-vendor's name is the prime's to keep. Decided 2026-09-17.** In a
  chain — client buys from a prime, the prime buys from a sub — the NDA
  between prime and sub is what stops the sub learning who the end client
  is and going round the prime to reach them. The client sees the rung it
  pays and nothing below it, **unless the client's agreement with the prime
  requires disclosure**, in which case it sees the sub by name. That is a
  term on the `MasterAgreement` between client and prime, off by default,
  and it is the client's to demand at signing, never the platform's to
  grant. Rates were already closed at every rung (`lib/chain-top`); names
  now follow the same rule. What the client always sees, name or no name,
  is the **standing** of whoever employs the person on its site — insured
  or not, authorized or not — because that is the client's own exposure
  and no NDA changes it. The sub, for its part, knows the site it works
  at — it must, for tenure and compliance — and the platform carries no
  thread from a sub to a client it has no deal with (`lib/threads`), which
  is the other half of the same NDA.

---

## Invariants the database must enforce

Not the UI. The database.

- A `Submission` requires a live `BenchListing` granted by the consultant —
  **unless the submitting firm employs the person** (an EMPLOYEE `Context`),
  in which case the employment is the consent, the kind is `INTERNAL`, and
  the employee is told rather than asked. Decided 2026-09-17; see "Who
  sells and who buys".
- `Submission` is unique on `(requirementId, personId)` — first submission wins on duplicates.
- `SubmissionKind` is computed from ownership, never accepted from a client.
- Rate bands live on `RequirementInvitation`, never on `Requirement` where a recipient
  could read another vendor's rate.
- Every read of another person's data writes an `AccessLog` row, including refusals.
- Anything the system does unprompted writes an `AutomationLog` row with a plain-English
  reason and an honest `reversible` flag.
- Match scores always carry `factors`, `basis`, `confidence` and `unknowns`.
  A bare number is a bug.

---

## How work is verified

The founder cannot read code. This is the compensating discipline.

1. **Every module ships with tests named as English sentences.**
   Good: `"a consultant cannot be submitted without an active bench listing"`
   Bad: `"test submission validation"`
   He reads the test names to confirm you built what he meant.

2. **Never merge on a red test.** No exceptions, no "will fix next commit".

3. **A Vercel preview URL per feature.** He clicks it. If he cannot click it,
   it is not done.

4. **One module at a time, sequentially.** Do not run parallel agents on
   overlapping files. He cannot adjudicate a merge conflict.

5. **When you are uncertain, stop and ask.** A wrong rate calculation that looks
   plausible is worse than a delay. Especially in: timesheet valuation, invoice
   generation, cycle date arithmetic, tenure math.

6. **Ready is the edges, and `/ready` is the only measure of it.** Tests
   prove the inside. An edge with the outside world — a real tenant
   signing in, a real file imported, an email that left, a Teams channel
   that heard, a company that is not seed — is proven only when the
   outside world has done it once on that deployment (`lib/readiness`).
   Every edge has three states: missing, set up but never used, proven.
   Nothing is production ready while a required edge is not proven,
   however many tests are green. The matrix's BUILT means built.

---

## Who pays — decided 2026-09-10

**The client is the customer.** An enterprise with a dozen suppliers pays
for the one thing none of its suppliers can give it: every contractor on
its sites, across every supplier, with tenure added up, paperwork on
file, hours signed and invoices matched — from the desk of whoever does
that job. Suppliers are on the platform because their clients are.

This replaces the earlier plan to sell tooling to vendors first. A
vendor at a hundred dollars a month buys efficiency and can manage
without it; a client at fifty thousand a year buys a legal exposure it
cannot see any other way. The phases below are cut on that.

### Phase 1 — one hire, from every desk (built; ships on this)

The ten stations of one placement, walked from the client's own desks
and refused at each to whoever has no business there:

1. the hiring manager posts a requirement; within plan it publishes
   itself, every desk cleared by rule and by name; a miss goes to the
   desk that owns it — HR reads the role, Procurement audits the
   suppliers, the lead who owns the cost centre signs the money, after
   both — and nobody, the manager least of all, signs their own
2. the programme office chooses which suppliers see it; a hiring
   manager cannot
3. a supplier submits; the client awards; a supplier cannot award its own
4. both contracts and their due dates are written by the award
5. nobody starts without an I-9; a lapsed certificate blocks; a missing
   background check warns and records the reason; a stranger to the
   contract cannot touch it and the AP clerk, a party, still cannot
   start anybody
6. the worker files their own week; nobody else may
7. the client signs the work, the supplier accepts what it pays; nobody
   signs their own hours
8. the supplier invoices its own engagement only
9. the client pays what came through the match — never an invoice the
   supplier has not submitted — and the payment says who paid whom
10. tenure is the person's, across every supplier, counted once per day
    on site, and every read of it leaves a trail

`__integration__/client-programme.test.ts` is that walk, as sentences.

**Three client demo accounts** — Northbend Athletic, Cavanaugh Glassworks,
Talvern Medical — each with a
programme manager, hiring manager, VP, AP clerk and compliance officer
holding the real roles from `lib/company-defaults`, several suppliers,
a history across suppliers, and something waiting at every desk. Built
by `lib/seed-programmes` inside the world seed; reached from `/demo`, or
`POST /api/demo {"as":"world-nike","desk":"ap"}`. Seed once per
deployment with `POST /api/seed-world` and the `CRON_SECRET`.

### Phase 2 — governance and the supplier's own operation

Approval chains beyond one VP · rate bands and headcount enforced at
requisition · three-way match exceptions routed to a desk · rate
variance across suppliers · multi-manager org · the supplier's bench,
releasing-soon and rolloff · screening and interviews as a pipeline ·
1099 and sub-vendor payment down the chain · matching with reasons.

**A program office that is not the client.** Decided 2026-09-14, over
the uniform test. An MSP runs a client's program and places nobody, so
nothing ties it to a client the way a placement ties a supplier — and
so it cannot raise a requisition at all. Letting a firm's own record of
a counterparty stand in would let any firm claim any client, which is
worse than the gap. The answer is a seat: the client grants the MSP a
desk in its program office, the way it grants one to its own people,
and the MSP acts there under the client's own rules with every read
logged. Until that is built the refusal says what is missing rather
than "No client company found for this caller"
(`lib/resolve-client-company`), and
`__integration__/party-uniform.test.ts` holds the sentence.

### Phase 3 — scale

Multi-region programmes · IR35, GST, withholding · supplier scorecards
and tiers · document templates and attestations · reporting and export ·
commissions · sourcing at volume.

**The sequencing rule, kept from the BRD:**

> Phases 1–2 must ship to PAYING customers before enterprise scale work
> begins. The 2017 sprawl happened because everything was built at once.

The 2017 build reached 4,197 commits and stalled on adoption, not on
engineering. Building is now cheap, which makes over-building the primary
risk. If you find yourself scaffolding Phase 3 while a client is not yet
paying for Phase 1, stop.

**Prototypes (reference, not production):** `prototypes/client-console.tsx`
and `prototypes/rolloff-console.tsx` still define the target look of the
client and vendor consoles. `BUILD.md` §6 lists what the 2017 system had
that this one does not yet.

---

## The hardest things in this system

Named so you approach them with care, not speed.

1. **Cycle generation.** Nineteen kinds, five frequencies, business-day shifting
   against a per-company holiday calendar, month ends, February, and idempotency on
   extension.

   **This paragraph used to say the 2017 implementation "is correct and was earned
   over years", and that was false.** It was read against the Rails source on
   2026-09-16, before the tree was deleted, and the engine it told you to port is
   substantially a stub: `Contracts::Cycle#get_next_date` — the function every
   timesheet, invoice and salary date derives from — has its body commented out
   under a live TODO and returns `last_date + 1.day`. `group_by_biweekly` is a
   copy of `group_by_weekly`, so legacy "biweekly" generated weekly periods. Nine
   of the nineteen kinds were commented out; nineteen was a string constant, not
   nineteen generators. `twice_a_month_submit_date` could raise, which is why
   `Contract.set_cycle` wrapped every contract in a bare rescue — contracts
   silently got no cycles at all.

   The claim survived because nobody read the file, and it steered the rebuild for
   months. **`lib/cycle-generator` is now the reference implementation.** It is
   shorter, tested, and correct on more cases than the original ever was. Nothing
   remains to port.

   What is genuinely still open is listed under "The cycle engine, honestly" below.
   **Write the tests first** still holds, and money arithmetic still gets asked
   about rather than guessed.

2. **Field-level permissions.** Cannot be retrofitted. Every read path filters by
   context from the first commit, or you audit every query later.

3. **Cross-vendor identity resolution.** Required for tenure aggregation. Deterministic
   matching on consented identifiers only; probabilistic matches surfaced for human
   confirmation, never silently merged.

### The cycle engine, honestly

Found by reading the Rails source against `lib/cycle-generator` on 2026-09-16.
Written down here because the tree that would have shown them is gone, and
because two of them are money.

1. **Extending a placement writes no cycles.** `api/contracts/[id]/extend`
   moves `endDate` and logs it; its own comment claims it writes the billing
   and pay cycles behind it and it does not. Three months added to a placement
   have no hours-due, invoice or pay rows. It also moves only the sell leg —
   the `BuyContract` end date is left behind. Generate over `[oldEnd, newEnd]`
   only and pass the existing `dueOn` set per kind into `generateCycles`'s
   `existingDates`, which exists and no production caller passes.
2. **No final partial period.** A contract ending on a Wednesday has no hours
   cycle and no invoice cycle for its last two days; generation stops at the
   last whole boundary. The Rails version emitted the short trailing group.
3. **Business days only shift forward.** US payroll pays a Saturday pay day on
   the Friday before; this moves it to the Monday after, which pays after the
   work. The direction is a money decision, per kind rather than globally —
   pay backward, bill forward. Nobody has made it.
4. **No salary lag.** A contract's payment term is not mapped into `offsetDays`,
   so pay day is the period end itself.
5. **Nothing marks pay cleared.** Legacy ran calculate → process → clear. If AP
   needs a settlement date it is a cycle kind, not a status.
6. **DAILY frequency was dropped** with no note. Per-diem work exists. If it was
   deliberate, say so beside the `ON_COMPLETION` comment.
7. **`Cycle` stores no period bounds**, so `cycle-complete` reconstructs which
   period a cycle covers heuristically. It holds for the packs shipped and is
   guesswork the legacy row did not need. `periodStart`/`periodEnd` is a schema
   request for the architect.
8. **Holiday shifting is timezone-fragile.** `shiftToBusinessDay` builds dates in
   local time and looks holidays up by UTC key. Under `TZ=Asia/Kolkata` a holiday
   does not shift at all. Correct under UTC and US zones, so Vercel is fine
   today and a second region would not be.

### Where the 2017 Rails tree went

Deleted from the working tree on 2026-09-16 after its business rules were
extracted to `LEGACY_RULES.md` and the cycle engine was read against the
rebuild.

It is not lost, but it lives in exactly one place: the history of
**`github.com/smadavaram/etyme-2017`**, where the last commit carrying all
876 Ruby files is **`763c6f57`**. It has never existed in `etyme2040`,
whose history was built by replaying app-only commits. So:

```
git show 763c6f57:legacy-app/models/contract_cycle.rb
git checkout 763c6f57 -- legacy-app/
```

**`etyme-2017` is therefore archived, never deleted.** Whatever else moves,
that repository is the only copy of four thousand commits of how this
business actually worked, and no other copy is coming.

An annotated tag would be friendlier and this repository's token is refused
on any tag ref with a 403, so the commit is written down instead.

---

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

## Design system — the prototypes ARE the standard

The prototypes in `prototypes/` define how the production UI must look and feel.
**If the production build does not look like the prototypes, we have failed.**

### Design tokens (from `Etyme_Demo_AllViews.jsx`)

```
canvas:   #F0EEE6    surface:  #FBFAF7    raised:   #FFFFFF
ink:      #1F1E1D    muted:    #6B6862    faint:    #9C9891    rule:     #E3DFD5
action:   #2B47E5    attention:#C0622E    verified: #4F6F52
```

### Typography

- **Serif** (headlines, hero numbers): Iowan Old Style → Palatino → Georgia
- **Sans** (body, UI): Inter → system sans
- **Mono** (data): IBM Plex Mono (rolloff console)
- Tabular figures inside tables (`font-variant-numeric: tabular-nums`)
- Serif headlines are set loose (`letter-spacing: -0.02em`) with `text-wrap: balance`

### Two surface types (from `Etyme_UX_Stress_Test.md`)

| | Decision surfaces | Working surfaces |
|---|---|---|
| Examples | Yours to decide, rolloff fan-out, rate approval | Bench list, requirements, timesheets, invoices |
| Voice | Prose, reasoning, confidence, calm | Tables, search, filters, bulk, density |
| Volume | 3–10 items | Hundreds |
| Typography | Serif headlines, generous space | Tabular figures, tight rows |
| Success | User decides well and leaves | User finds and acts fast |

The theme stays the same on both — warm canvas, ink, one blue, clay for
attention. What changes is density and voice.

### Components (extracted from prototypes)

- **Shell** — sticky header (logo + org + role), sidebar nav with section
  groups (Sell / Procure / Operate / Grow), mobile pill nav
- **Panel** — surface background, 1px rule border, serif title, optional
  subtitle
- **Stat** — label (uppercase 10px) + serif number + optional subtitle.
  Tone variants: default (ink), attention (clay), verified (green)
- **Chip** — small rounded label with tone-coded background: attention,
  verified, action, passive
- **Why** (reasoning disclosure) — score + confidence label, expandable to
  show factors (bar chart), basis, and unknowns
- **Head** — eyebrow label + serif h1 + optional prose subtitle
- **Lbl** — 10px uppercase letter-spaced label

### Navigation per company type

| Company type | Sections |
|---|---|
| Vendor | Today → Sell → Procure → Operate → Grow → Governance |
| GSI (integrator) | Today → Deliver → Supply → Operate → Grow → Governance |
| MSP (program office) | Today → Demand → Supply → Operate → Grow → Governance |
| Client (enterprise) | Workforce → Governance |
| Consultant | You |

Every section is either short enough to read as a list — seven links at the
outside — or every link in it sits under a named sub-heading. **Both sides of
a contract and the hours under them are Operate's, for every party**, because
administering a placement is one job whoever does it; and every firm with
counterparties has a **Network** group naming the firms it trades with and the
people at them. `__tests__/invariants/sidebar-nav.test.ts` reads this table
and fails when the code and it disagree, so a section renamed in one and not
the other breaks the build rather than the founder's walk.

**Eyebrow labels are company-type-specific.** Pages show eyebrows like "Sell"
and "Operate" that make sense for a staffing vendor. A client company
(Northbend Athletic, Talvern Medical) sees the same data under different
section labels — "Workforce" instead of "Sell". The eyebrow, nav section and
page subtitle adapt to the viewer's company type; the underlying data and
pages are shared, the framing is not. `lib/page-framing` still frames a
supplier's contracts page under "Sell" and "Procure" and its consultants page
under "Talent", which are no longer sections of anybody's menu — the client's
eyebrows are pinned to its nav by a test and the supplier's are not yet.

### Eight things to build before features (from UX Stress Test)

1. **Search on every list.** Before anything else.
2. **Restore the plus button** with its four sections.
3. **Working-surface table** — dense, sortable, filterable, paginated,
   bulk-selectable, exportable. One component, used everywhere.
4. **Batch submission.** The 2017 `temp_candidates` pattern with per-item
   error collection.
5. **Progressive explanation.** One line by default, reasoning on click.
6. **Tabular figures inside tables.** Serif for headlines and hero only.
7. **Scope the undo promise** to what is actually built.
8. **Missing states** — loading, error, empty, partial, denied.

### Prototype files (reference, not production code)

- `prototypes/rolloff-console.tsx` — vendor-side rolloff (BRD §16)
- `prototypes/client-console.tsx` — client operations (BRD §17.1)
- `prototypes/Etyme_Demo_AllViews.jsx` — all four company views
- `prototypes/Etyme_Onboarding.jsx` — five-step onboarding flow
- `prototypes/Etyme_UX_Stress_Test.md` — UX analysis and resolution

---

## Who sells and who buys — corrected 2026-09-17

From the founder, and it changes what a prime is:

> Prime, GSI and MSP can bring their own W2s as well and don't need a
> supplier all the time. A GSI delivery manager can bring people from
> another internal PM or delivery manager; HR can bring an internal
> employee who is currently on bench to the project. Prime and GSI can be
> both sell and buy — unlike the client, who only buys, from every other
> party, all of whom can be suppliers.

So the positions on a deal are:

| Party | Sells | Buys from |
|---|---|---|
| **Client** | never | everyone below |
| **Prime / GSI / MSP** | to the client | a sub-vendor by PO, **or its own W2 employee with no PO** |
| **Sub-vendor / bench** | to the prime | its own people |
| **Consultant** | is the person | — |

The buy side already knew this: `BuyContract.purchaseOrderId` is nullable
because you do not raise a PO to your own employee, and `cyclesFor` writes
salary cycles where there is no vendor below and vendor-bill cycles where
there is. **The sell side did not.** `SubmissionKind.INTERNAL` has been in
the schema since it was written and nothing computes it: `POST
/api/submissions` demands a `ConsultantProfile` and a consented
`BenchListing` from every person, so a GSI cannot put its own employee in
front of a client without that employee first agreeing to be marketed by
the firm that already employs them. A schema that knows and a route that
forbids — the same shape as `SalesOrder`, at the party level.

**What a prime needs that a staffing vendor does not**, in the founder's
words — building teams dynamically:

- **Its own bench**: employees between projects, visible to the delivery
  managers and HR who allocate them. Not a `BenchListing` — that is a
  consultant consenting to be sold; this is an employer's roster.
- **Internal mobility**: one delivery manager pulling a person from
  another's project as it winds down, and HR placing somebody from the
  bench, without a submission, an invitation or a marketplace between
  two desks of the same firm.
- **Submitting its own employee** to a client requisition as INTERNAL,
  alongside a sub-vendor's person as NETWORK, on the same requirement.

**The consent line — decided 2026-09-17.** CLAUDE.md's firmest invariant
is that a submission requires a bench listing the consultant granted. For
a W2 employee the employment contract *is* the consent to be assigned —
nobody asks an employee's permission to staff them on a project. But
recording an employee on a client's site, with their tenure and
paperwork, is not nothing, and neutrality is absolute here. So the
carve-out is narrow and the founder confirmed it in these terms: **an
employer may submit its own W2 without a listing; the employee is told,
not asked; the read is logged like any other.** "Own W2" means the firm
holds an EMPLOYEE context for the person — answerable from `Context`
today, no schema. A firm submitting somebody it does *not* employ still
needs the listing, the consent and `maySubmit`, exactly as before. The
invariant in "Invariants the database must enforce" reads accordingly.

---

## Agreement, order, contract — six objects, not two

A recurring confusion, settled here so nobody has to guess: **a sell
contract is not a sales order and a buy contract is not a purchase
order.** Three layers, each answering a different question.

| Layer | The question it answers | Sell side | Buy side |
|---|---|---|---|
| **Agreement** | Are we allowed to trade at all? | `MasterAgreement` | `MasterAgreement` |
| **Order** | How much may be spent, on what, by when? | `SalesOrder` | `PurchaseOrder` |
| **Contract** | What rate, for which person, for how long? | `SellContract` | `BuyContract` |

Two sentences carry the whole distinction:

- **An order carries a ceiling. A contract carries a rate.**
- **An order is about money. A contract is about a person.**

### Why collapsing them breaks real cases

**A sell contract is per person; a sales order is not.** One sales order
for a five-person project produces five sell contracts. Treating them as
the same object makes a five-person project impossible to bill as one
commitment.

**A buy contract to a W2 employee has no purchase order.** You do not
raise a PO to your own employee. This is the clearest proof they are
different things: `BuyContract.purchaseOrderId` is nullable precisely
because roughly half of all buy contracts have none. Where there *is* a
sub-vendor, the buy contract and the PO describe the same commercial
relationship from two angles — the contract carries the rate, the PO
carries the ceiling it draws down — and linking them stops the two
records disagreeing.

**A purchase order belongs to whoever pays.** `PurchaseOrder.issuedById`
is the payer, which is why the model appears on both sides:
`SellContract.purchaseOrderId` is the *client's* PO authorising spend
with us; `BuyContract.purchaseOrderId` is *our* PO authorising spend with
a sub-vendor. Same model, opposite direction.

### And the two that are neither

- **`Engagement`** — the project or statement of work under an
  agreement. Groups several people and several contracts.
- **`ProjectOrder`** — the cost object that accumulates actual revenue
  and cost. Not a commercial document at all; nobody signs one. See the
  note on `InternalOrder`, which is the client's own coding and an
  interface value only.

### The invariant that is not yet enforced

A `BuyContract` with `contractType: W2` and a `purchaseOrderId` set is a
contradiction — a purchase order raised to an employee. Nothing currently
refuses it. It belongs in `etyme-money`'s next piece of work.

---

## Paperwork — the shapes a document actually comes in

From the founder, 2026-09-16, and written down because it is trade
knowledge the code was guessing at. Every row is a real document a
staffing firm handles, and the columns are the properties that differ.
**In contracting and staffing these are not filing; they are business
continuity.** A lapsed certificate stops a supplier working, an expired
work authorization stops a person working, and neither fails loudly on
its own.

### The list is not the domain — the purpose is

Corrected by the founder the same day, before anybody built to the table
below: *"companies can have more documents they would need on — some for
compliance, some for agreement and some for proof."*

So the seven documents in the table are **examples of the shapes, not the
set of types**. Any client or supplier will need types nobody here has
heard of, and they must be able to add one without a migration or a
release. A fixed enum of document kinds is wrong the first week a client
asks for a drug screen, a security clearance, a works council
notification or a client-specific code of conduct.

What is fixed is the **purpose**, and the purpose is what decides
behavior:

| Purpose | Behaves like | Examples |
|---|---|---|
| **Compliance** | has a validity window, watched for expiry, blocks or warns, gets chased | I-9, insurance, licenses, background checks, good standing |
| **Agreement** | signed — possibly by both sides — has a term, amended and versioned | MSA, NDA, statement of work |
| **Proof** | attached as evidence, usually never expires, supports something else rather than standing alone | degrees, transcripts, certifications |

**That is roughly the split the four models already fell into**, which is
the useful part of the finding: `Verification`/`VerificationDoc` is
compliance, `DocInstance`/`DocTemplate` with `MasterAgreement` is
agreement, and attachments are proof. They were not arbitrary — they were
three purposes nobody had named. `DocumentPacket`/`PacketItem` is
orthogonal to all three: it is the request-and-collect mechanism, and any
purpose can be requested through it.

So the five properties below are **declared by a type**, not hardcoded
per document. A type says whether it has a start, an end, or neither;
whether it is signed and by how many sides; whether it is reissued and
so has an edition; and what other types it needs behind it. The I-9 is
then the first type that happens to say "reissued: yes", rather than a
special case in the code.

Defaults ship, because CLAUDE.md says default aggressively and zero
training means nobody defines an I-9 before they can hire. A company
extends and renames from there.

| Document | Valid from | Valid until | Signed by | Supplied by |
|---|---|---|---|---|
| **Master service agreement** | yes | yes | **both parties, countersigned** | the two firms |
| **Visa** | — | yes | — | the government |
| **I-9** | — | see below | the worker and the employer | the worker |
| **License, green card, passport** | — | usually | — | the worker |
| **Education documents** | — | **never expires** | — | the candidate |
| **Certificate of insurance** | **yes** | yes | — | the supplier |
| **Certificate of good standing** | **yes** | yes | — | the supplier |

Five properties fall out of that table, and no single model in this
codebase holds all five:

1. **Validity is three shapes, not one.** No dates at all (a degree
   certificate is true forever). An end only (a visa runs out). A start
   *and* an end (insurance cover, a certificate of good standing) —
   and the start matters, because cover that begins next month does not
   cover a person starting this week. `Verification.expiresAt` already
   says "null = permanent (e.g. education evaluation)", which is the
   right instinct; it has `issuedAt` and nothing reads it as a floor.
2. **A signature can need two sides.** An MSA is not executed until both
   firms have signed, and the date that matters is the later of the two.
   `MasterAgreement` learned this on 2026-09-16; `DocInstance`, which is
   what an NDA or a signed contract uses, has no concept of a
   countersignature and no dates at all.
3. **The form itself has an edition.** The government reissues the I-9
   every year. Which edition somebody signed is a fact about the
   document, and an old edition is not a small problem — it is the
   finding in an audit. Nothing here records a form version.
4. **A document can require other documents.** An I-9 is not proof of
   anything on its own; it is a form that must be backed by evidence of
   the right to work — a license, a visa, a green card. So a "held"
   I-9 with nothing behind it is not held. This is composition, and no
   model expresses it.
5. **Who owes it differs, and that decides who is chased.** A candidate
   attaches their own education documents. A supplier produces its own
   insurance — and a firm asks its **sub-vendor** for theirs, which is
   why the certificate shows up in supplier onboarding rather than in
   somebody's personal file.

**Four models overlap here and none is a superset:** `Verification` and
`VerificationDoc` (the person's compliance evidence, expiry watched by
`cron/watch`), `DocInstance` and `DocTemplate` (papers sent for signature,
no dates), `DocumentPacket` and `PacketItem` (a request with a link
window, where `validUntil` is the link's life and not the document's),
and `VisaPetition` (its own lifecycle and its own watch). They were built
one at a time for one need each, which is why the same certificate can be
represented three ways.

Do not unify them in one pass because the table above is tidy. Do use
the table as the test: a change to any of the four is wrong if it makes
one of the five properties harder to express.

---

## Pricing — decided 2026-08-29

**Free while testing; the price is set after five real vendors are using
it.** Founding firms keep the terms agreed with them, in writing, when a
price exists. Until then no agent invents a number, a range, or a unit —
on the page, in a deck, or in a conversation. The home page states the
decision; changing it is the founder's alone.

---

## Several agents at once

Seven specialists own disjoint parts of the codebase and work at the same
time; two more read only. `docs/how-agents-work.md` is the working
agreement; `.claude/agents/` holds the definitions.

**Parallelism is bought with a boundary, not with coordination.**
`src/lib/domains.ts` maps every file to exactly one owner and
`__tests__/invariants/domain-ownership.test.ts` fails when a new file has
none or two. A page describing who owns what is wrong within a month; a
test is wrong for exactly one commit.

`prisma/schema.prisma` belongs to nobody. Every domain wants a column in
the same file and it is the one artefact where two individually correct
changes still produce a wrong result, so it queues through
`etyme-architect`. A domain agent that needs a column says what it needs
and why, and stops.

| Agent | Use it for |
|---|---|
| `etyme-money` | How a figure is calculated, when it is billed, what somebody is paid |
| `etyme-regulatory` | Anything with a legal consequence |
| `etyme-conversation` | How something is said, to whom, on which channel, how often |
| `etyme-demand` | Between a manager needing somebody and a person being chosen |
| `etyme-supply` | The bench as a business |
| `etyme-market` | Public words, positioning, and moving work between companies without leaking |
| `etyme-architect` | Schema, shared components, decisions crossing two domains |
| `etyme-scout` | "Does this already exist and who owns it" — read only |
| `etyme-release` | Deciding whether it ships — read only |

Work moves: scout → schema → spec as test names → build → release →
preview URL. Different domains may run at the same time. Two agents in
one domain may not, and neither may anything touching the schema
concurrently.

`docs/delivery-matrix.html` carries L1 to L4 with the owning agent per
L2 group. A change to L3 or L4 belongs in the same commit as the code
that caused it.

---

## Completed tasks

### LEGACY_RULES.md ✓

`LEGACY_RULES.md` — business rules from 4,197 commits, in plain English
with file references. Covers all 14 sections: cycle engine, contracts,
submissions, invoicing, company structure, documents, conversations,
compliance, commissions, database constraints, routing, background jobs,
seed data. Seven known bugs documented for the new build to fix.

### Service object extraction ✓

Phase 1: 5 service objects (901 lines extracted).
Phase 2: 14 service objects (2,085 lines extracted from 13 controllers).

### Business logic extraction ✓ (2026-09)

Cycles are money only, on the side of the trade they describe, on the
day the pack asks for (`lib/cycle-kinds`, `lib/cycle-generator`,
`lib/contract-cycles`). The timeline is three words on the thread —
hours, pay, bill (`api/placements/[id]`). Paperwork is a checklist, not
a signing workflow: I-9 and lapsed cover block, the rest warns with a
reason (`lib/contract-clearance`).

### The client path, closed ✓ (2026-09-10)

Five routes that authenticated and did not authorise — activate,
payments, invoice generation, timesheet entry, convert — now refuse a
stranger in words. Awarding writes the cycles. A client pays only what
came through the match. Tenure counts a day on site once, however many
firms billed it, and only days served. Three client programmes seeded
with a desk per job. `__integration__/client-programme.test.ts`.

### Interviews, and the requisition chain as three desks ✓ (2026-09-12)

A client can interview a candidate from the row: rounds in turn, the
supplier and the candidate told on their own channels, the candidate
answering from their own page, the client's notes never leaving the
client (`lib/interview-proposal`, `lib/interview-notices`,
`components/propose-interview`). Only whoever is hiring may set up or
decide a round.

The chain is three desks, not a dollar line: HR reads the role,
Procurement audits the suppliers, the lead who owns the cost centre
signs the money — alongside at one rank, the lead after both; within
plan every desk clears by rule and by name and the requisition publishes
itself; nobody signs their own (`lib/requisition-approval`). HR and
Procurement are standing desks named per business unit, nearest wins
(`ApprovalRule.kind`). A requirement has an owner distinct from who
raised it, a panel, and the suppliers Procurement cleared; the release
stays within them. Words change on a published requirement with every
supplier told; money goes back through approval
(`lib/requisition-change`). Requirements read Draft · Awaiting approval
· Needs changes · Published · Cancelled · Archived — filled is a
placement's word, read in Submissions. `/demo` seats the account owner,
HR and Procurement at each programme.

### Phases 2 and 3, the pieces that were words on the schema ✓ (2026-09-14)

Directed by the founder over the sequencing rule, and said so. Every
status that a scan found nothing writing now moves, each as sentences
in tests and a story on the seeded world:

- an approved, client-billable expense rides on the next invoice as a
  line of its own and is PAID with it (`lib/expense-billing`); the
  three-way match takes the approved expense as the receipt
- a document asked for is SENT (the person told), UPLOADED or SIGNED by
  attestation from their own page (`lib/document-request`, Paperwork
  page, `/api/me/papers`)
- a visa petition is FILED, gets an RFE and the answer, is APPROVED with
  the date it runs out, STAMPED, ACTIVE, and the watch job runs it out
  (`lib/visa-petition`, Visas tab on compliance)
- a course is added and somebody enrolled, started, finished with a
  score, or dropped with a reason (`lib/training`)
- a supplier's standing — probation, approved, preferred — is set from
  the suppliers page and read by the VENDOR_TIER rule
  (`lib/supplier-tier`); a seat unadvertised for six weeks goes COLD
  (`cron/cold-openings`); a unit of every kind can be added
  (`/api/program/units`)
- a milestone the client accepted bills on the next invoice as a line
  with the acceptance as its receipt (INVOICED); a commission-type buy
  contract is paid by a run that posts COMMISSION against the order,
  once per period, under the cap (`lib/commission`,
  `/api/payroll/commissions`); somebody else takes a seat as a new
  contract on the same terms with the old one ENDED and the candidate
  REPLACED (`lib/replacement`); a bill that did not match is a decision
  on the AP desk; a holiday marked for another country does not move
  this site's dates (`appliesTo` in `lib/holidays`)

`InvoiceLine.timesheetId`, `sellContractId` and `personId` are optional
now: a line is an hours line, an expense line or a milestone line.

### Every table moves ✓ (2026-09-14)

"We need all tables to keep moving their respective statuses across
the app." A scan of every status column against every writer found
where they stopped, and `__integration__/status-ledger.test.ts` now
walks one placement and reads every table at every station. Fixed:
the hours, invoice and vendor-bill cycles are marked done when the
thing they waited for happens (`lib/cycle-complete`), so the placement
timeline stops saying "overdue" about a week that was paid; a contract
whose last day has passed is ENDED by the daily job (`cron/end-contracts`),
both sides; activation moves the buy contract with the sell contract;
a supplier can decline an invitation and whoever is hiring is told
(`invitations/[id]/decline`); submitting through the bulk route accepts
the invitation. Left as words on the schema and now corrected: a
timesheet has no PARTIAL status; fewer hours accepted is `acceptedHours`.

### Somebody is told when it breaks ✓ (2026-09-13)

`/ready` measures the edges (`lib/readiness`); two of its red rows are
now built. The daily job writes a `JobRun` before its first job and
after its last, and sends staff a heartbeat either way, so the alert
channel is proven on a day nothing broke. Every failure in an API route
goes through `reportError` (`lib/alerts`): an `Incident` row, and one
email per place per hour to `ETYME_STAFF_EMAILS`. A page that throws
shows a sentence and reports itself (`app/error`, `app/global-error`,
`POST /api/incidents`). Found on the way and fixed: eleven cron routes
accepted the literal header "Bearer undefined" on a deployment with no
secret; all use `cronAuthorized` now. What production still needs from
the founder: `ETYME_STAFF_EMAILS`.

### The client dashboard reads as a desk ✓ (2026-09-13)

"Client dashboard need to be lot better." It opens on a sentence about
the reader — "6 things need you. 6 are urgent." or "Nothing needs you
today." — with the queue under it and Approve on the row, then the
picture: on site, suppliers, this month, ending soon, tenure,
requirements, each a link (`app/dashboard/program`). Four numbers were
real and computed the wrong way round, and each is now a sentence in
`__tests__/invariants/client-desk.test.ts`: a person bought through a
chain was counted once per rung and a sub-supplier's rate reached the
client's page (`lib/chain-top`: the client sees the contract it pays);
monthly spend was divided by a hundred twice; a role filled by history
was "still waiting"; and the desk that signs the work was never told a
week was waiting, because decisions scoped hours to the employer only.
A client now sees the hours, through the supplier it pays, and signs
from the dashboard.

Then, on "fix the gaps and improvise": a week is checked against its
contract before anybody signs it — over the role's hours, or past the
last day — and says so in a sentence (`lib/timesheet-flag`); the
headline counts exceptions; "Approve anyway" takes a reason and puts it
on the signature. Under the queue, what was done today. Somebody
starting soon shows the paperwork verdict a week early, in activation's
own words. Each supplier carries its standing; a published role nobody
has answered in five days says so; a client with nothing on it yet is
told what to do first. The generic demo client's book is mostly history
now, and the seeded Northbend Athletic desk has one 44-hour week to read.

### Network ✓ (2026-09-13)

"People & Suppliers can be changed to Network; contractors and
suppliers should have a table view as well as the feed; filter
suppliers by their existing contractors, and contractors by recent
engagement, favorites, location, blocked." The nav group is Network.
Both pages switch between the feed and a table of the same rows
(`components/network-view`), under one filter bar that asks the same
five questions on both — Everyone · On site now · Recent engagement ·
Favorites · Blocked — and a place (`lib/network-filters`). A favorite
is the opposite of a block: a person or a firm this company would take
again, marked with a star on the row, kept per company and never read
across companies (`Favorite`, `/api/favorites`). Somebody on site is
engaged today; a block keeps the row on the register but out of every
list except its own. The seeded Northbend Athletic desk stars Helena Marsh and the
firm that supplied her.

### A supplier is a workflow, and a person has a page ✓ (2026-09-13)

"Add supplier is a huge waste of real estate — for an activity that has
to happen through workflow and compliance with indirect procurement.
The hiring manager recommends; his department lead — or sometimes the
program office — audits; the vendor is emailed a link for its
information; indirect Procurement qualifies; HR ensures compliance and
screening; AP Finance screens the bank details." The paste box is gone
from the top of Suppliers. A firm walks four desks in order, the way a
requisition does: the recommender's department lead — the nearest
value-rule approver up their own unit tree, the program office where
none is named — confirms the need; Procurement qualifies the firm on
its experience, references, revenue and delivery proofs, its proposal
and a D&B report; HR clears compliance on the certificate of insurance
and a sanctions and litigation screening; Finance verifies the tax form
and the bank details and says the last yes. Each desk verifies its own
items and no other's, and says yes only when its own are verified or
waived with a reason (`lib/supplier-onboarding`, `lib/supplier-desks`,
`SupplierRequest`, `/api/supplier-requests`). Nobody decides their own
recommendation and nobody decides two desks. Every desk is told by
email as well as in the app, and finds the firm on its own dashboard as
a decision. The firm gets a link of its own the moment it is
recommended (`/apply/[token]`, `/api/supplier-apply`): no sign-in,
files recorded by name against the item they answer, bank details kept
to the bank, the account name and four digits; what the firm supplies
is received, never verified, until the desk says so. The link stops
working once the client has decided; in time it is the supplier's door
into the client portal. A firm in the pipeline shows on the suppliers
list, feed and table, as Pending with the desk it is on. Procurement's
own import of firms it approved before is folded away at the bottom.
Walked desk by desk in the browser, sixteen screens, and in
`__integration__/supplier-onboarding.test.ts`.

"Can a hiring manager save a consultant as a favorite, and how will he
invite?" One page per person as this client knows them — where they are
today, time here across every supplier against the cap, every
submission and what each firm asked, interviews, paperwork, who can put
them forward — opened only for somebody put in front of this company,
every read logged (`/api/people/[id]`, `app/dashboard/people/[id]`).
The star is on it. "Ask for them" picks a published role and goes to
the supplier holding their consent on its bench, else whoever last
submitted them, on the thread for that role — never to the consultant,
because Etyme places nobody (`/api/people/[id]/ask`). A blocked person,
an unpublished role and a role they are already on are refused in
words. The seeded Northbend Athletic desk holds Veritan Talent with HR, cleared by the
department lead and Procurement, the firm's side in.

### A supplier brings its team in ✓ (2026-09-13)

"Can Brightmoor add or onboard their team members — account managers,
HR, recruiters, contract managers, finance — so it is easy to
coordinate?" A staffing firm's roles are in its own words now: Owner,
Admin, Recruiter, Resource Manager, Account Manager (the client
relationship — roles, rates, submissions, what was billed; never
payroll or P&L), HR (the firm's own people's paperwork; no money at
all), Contract Manager (agreements, orders, extensions, rates; neither
submits nor pays), Accounts Receivable (bills the client and records
what came in; never accepts hours for pay or runs payroll), AP &
Payroll (pays the consultant or the sub-vendor: accepts hours, runs
payroll, settles bills; never issues a client invoice), Finance (the
whole desk at a small firm; was Accountant), Compliance Officer. A
company formed before a role existed gets it the next time somebody
opens Users & permissions; a renamed role keeps its seats
(`lib/company-roles`). The page has "Invite a teammate": name, work
email, what they do here; the person is emailed and the seat is theirs
the moment they sign in — an own-domain address is welcome, not
refused, because an owner setting up four desks should not wait for
each to find the door. Once seated, they appear on every client's
Contacts page under their firm, sorted into the right chips
(`__tests__/invariants/supplier-team.test.ts`,
`__integration__/supplier-team.test.ts`).

### Every list, two ways ✓ (2026-09-13)

"All tables must have feed and table options like the contractor
table." One component, `ListSurface`, wraps the working-surface table
and adds the feed: the same rows as cards, title from the first column,
subtitle from the second, the rest as lines; action columns stay off
the card. A page that wants a richer card passes one. Nineteen pages
that drew a bare table now offer both; Requirements, Ending soon, POs
and Contacts, which had only cards, now have a table. The reader's
choice is remembered per list on their device.

### What this section taught, for the rest of the app (2026-09-13)

Written after a week on the client's Network — dashboard, suppliers,
contractors, contacts, teams — because each was learned by getting it
wrong first.

1. **Fill from the work, not from data entry.** The People tab was empty
   because it listed only what somebody typed in. Every list should be
   derived from the flows that already know the facts — seats, contracts,
   submissions, threads — with hand entry as the exception. If a screen
   is empty on the seeded world, that is the bug, not the seed.
2. **Every figure on a screen has a sentence on the seeded world.** Five
   contractors for three people, $972 for $60,000, seven roles waiting
   when two were open, six approvals nobody was told about: all real
   numbers computed the wrong way round, none caught until the founder
   looked. A formatter takes minor units only; a chain is counted at
   the rung the client pays; a "waiting" is checked against status.
3. **The desk that acts is the desk that hears.** Decisions were scoped
   to the employer, so the client who signs the work read "Nothing needs
   you". Route every "needs you" through who may act, not who owns the
   row, and tell them by email as well as in the app.
4. **A form is a workflow in disguise.** "Add supplier" was a paste box
   doing indirect procurement's job in one keystroke. Anything with a
   compliance consequence walks desks in order, each verifying only its
   own items, nobody deciding their own or twice, and the counterparty
   supplies its side through a link of its own.
5. **Roles in the trade's words, per kind of company, reaching existing
   companies.** Account Manager, HR, Contract Manager, Accounts
   Receivable, AP & Payroll — not "Accountant". A role added later must
   appear for a firm formed earlier without a migration.
6. **The same five questions on every list.** Everyone · On site now ·
   Recent engagement · Favorites · Pending · Blocked, and a place. A
   filter learned once is learned everywhere; a filter with nothing
   behind it is not offered.
7. **Walk it as each person, and keep the screens.** The mapping bug that
   filed an account manager under Accounts payable was invisible in the
   unit tests and obvious in one screenshot. Every module ends with a
   browser walk as every desk it touches, and the screenshots go to the
   founder.
8. **Segregation is a BLOCK, said in a sentence.** "You recommended this
   firm, so the desks decide it without you." Never a disabled button
   with no words.

### The charts were audited against the validator ✓ (2026-09-13)

"Audit and improvise the sites and UX." Every chart in the app was run
through the palette validator instead of being looked at, and three of
them failed:

- the AR page drew 31–60 and 61–90 days in the identical clay — ΔE 0.0,
  the worst score the validator gives, two bands nobody could tell apart
- the same five age bands were drawn in three different palettes on
  three pages: brand tokens on AR, four unrelated Tailwind reds on
  Invoices, four more on Reports
- the report's contract pipeline put a green segment beside a gray one
  at ΔE 5.6 for normal vision, under the floor of 15, and printed white
  counts inside segments that a narrow band clipped

All three now draw from `lib/chart-colors`: `AGE_BANDS` — the good
status color for current, then a validated one-hue ramp darkening
through the overdue bands — and `SERIES` for identity, opening on the
brand's blue and clay. Both sets pass every check; the runs are quoted
in the file. Segments carry a 2px surface gap; counts moved to the
legend; a legend swatch only stands for a segment that is drawn.
Twenty-seven off-brand Tailwind colors across thirteen screens — a dozen
`bg-red-600` toasts among them — were swept onto the brand tokens, and
a test now fails on any that come back.

### Demand opens, supply answers ✓ (2026-09-13)

A client writes to one supplier from the role or from the candidate's
row; the supplier is told, reads it and answers on the same thread, and
cannot start one — the refusal says to submit or answer the invitation
instead (`lib/threads`, `components/thread`, `Conversation.withCompanyId`).
A firm not on the deal is told nothing is there. Discussion stays the
company's own. The 2017 rule, kept because the demand side still wants
it. Requirements name the person they are for, first, every time; a
paused requisition refuses submissions in a sentence.

### The demo names nobody real, and seeds twice ✓ (2026-09-17)

The home page stopped naming Nike, Corning and Terumo BCT on
2026-09-15, and `/demo` — the button under that line — went on using
them as the headings on three doors. `lib/positioning` read
`app/page.tsx` and nothing else, so a name stripped off the page and
left one click behind it was not stripped off anything.

The sheet in `docs/demo-names.md` is applied: **Northbend Athletic**,
**Cavanaugh Glassworks** and **Talvern Medical** are the three client
programs, with **Auralis Software** and **Maren MSP** on the spine and
**Veritan Talent** the recommended supplier; the towns moved with them
(Tualatin, Elmira, Westminster). **Slugs stay** — `world-nike` is an
address, by the same precedent that kept the demo desk key `programme`,
and only what a human reads changed.

Worse than a display name, and the reason this was urgent: the seed set
`domain: 'nike.com'` and `'terumobct.com'` with `domainVerified: true`,
and joining beats creating, so a real employee of either signing in
would have been seated inside a fictional tenant full of seeded rates
and invoices. Every seeded company now holds a reserved name nobody can
register — `.example`, `.invalid`, `.local` — and
`__tests__/invariants/demo-names.test.ts` reads the seat list, the demo
page, the "Look around" button, `/ready`, the world and program seeds,
the demo seeds and `prisma/seed.ts`, and fails on a retired name or a
buyable domain coming back.

**A seeded world keeps the day it was born.** Every seeded date is
counted in days from today, so re-seeding on a later day found none of
the weeks it had written and wrote the lot again — and exactly seven
days later it died halfway through on a duplicate invoice line, leaving
the world half rewritten. `seedWorld` now reads the first company's
`createdAt` and counts from there (`lib/seed-days`), so a second seeding
is a true no-op whenever it happens. The cost is that a world seeded in
March goes on reading as March: to move the dates forward, drop the
world and seed it again. `__integration__/reseed-across-days.test.ts`.
