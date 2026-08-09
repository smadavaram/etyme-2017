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

## Current state

**Built (prototypes, not production):**
- `prototypes/rolloff-console.tsx` — vendor-side rolloff, dual scale (staffing vendor
  and SI delivery unit). Implements BRD §16 fan-out.
- `prototypes/client-console.tsx` — client-side operations. Daily approval queue,
  contracts with six-party rolloff fan-out, alumni memory, vendor discovery by skill
  and region, multi-manager org view with rate variance and vendor tail.

**Specified, not built:** everything else. `BUILD.md` §6 lists the ten real gaps
against the 2017 system — conversations, notifications, expenses, commissions,
vendor bills, rate history, holiday calendar, blacklist, interviews, bank and tax details.

**Not started:** the actual Next.js application. The prototypes are React files
demonstrating behaviour, not a running app.

---

## Phase 1 scope — and the rule about it

Company formation + AI site generation · roles including PM and RMG · candidate
profiles and pipeline · bench module · standalone Assignment with bench burn
dashboard · training funnel data model · Releasing Soon pool and rolloff fan-out ·
email and CSV VMS fallback parser · document libraries.

**The sequencing rule, from the BRD itself:**

> Phases 1–2 must ship to PAYING vendors before Phase 4 enterprise work begins.
> The 2017 sprawl happened because everything was built at once.

The 2017 build reached 4,197 commits and stalled on adoption, not on engineering.
Building is now cheap, which makes over-building the primary risk. If you find
yourself scaffolding Phase 3 or 4 while Phase 1 is unshipped, stop.

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

## First task

Read the 2017 Rails codebase and produce `LEGACY_RULES.md` — the business rules
encoded across 4,197 commits, in plain English, with file references.

Prioritise: the cycle engine, rate change history, submission and duplicate handling,
contract state transitions, commission calculation.

This is the highest-leverage job in the project and it gets harder the longer it waits.
Everything built afterwards is faster and more correct for having it.
