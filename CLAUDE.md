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

**The sharpest wedge is tenure**, not efficiency. A contractor's time on
site aggregated across every supplier is a number no vendor can compute
and no client can obtain by asking, and it is a legal exposure rather
than a saving. Efficiency pitches lose to "we are managing fine".

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
- Most requisitions must clear **without human approval**. Governance slower than the
  workaround produces the workaround.

---

## Invariants the database must enforce

Not the UI. The database.

- A `Submission` requires a live `BenchListing` granted by the consultant.
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

**Three client demo accounts** — Nike, Corning, Terumo BCT — each with a
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
   extension. The 2017 implementation in `payroll_cycles.rb` and `contract_cycle.rb`
   is correct and was earned over years. **Port the arithmetic, not the architecture,
   and write the tests first.**

2. **Field-level permissions.** Cannot be retrofitted. Every read path filters by
   context from the first commit, or you audit every query later.

3. **Cross-vendor identity resolution.** Required for tenure aggregation. Deterministic
   matching on consented identifiers only; probabilistic matches surfaced for human
   confirmation, never silently merged.

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
| Vendor | Today → Sell → Procure → Operate → Grow |
| Consultant | You → Grow |
| GSI (Infosys) | Deliver → Supply → Operate |
| Client (Enterprise) | Workforce → Governance |

**Eyebrow labels are company-type-specific.** The current build is vendor-only
(Phase 1). Pages show eyebrows like "Sell" and "Operate" that make sense for
a staffing vendor. A client company (Nike, Terumo BCT) would see the same data
under different section labels (e.g. "Workforce" instead of "Sell"). When the
client portal is built (Phase 4), the eyebrow, nav section, and page subtitle
must adapt to the viewer's company type — the underlying data and pages are
shared, the framing is not.

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
