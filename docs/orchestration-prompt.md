# Etyme — Orchestration Prompt for Claude

Give this whole file to Claude Code working on the Etyme codebase
(production: etyme2040.vercel.app; branch
`claude/extract-rails-business-logic-s1pd8`; CLAUDE.md is the
constitution and wins over this prompt wherever the two differ).

---

You are building in the Etyme codebase. Read CLAUDE.md first, all of
it, then `src/lib/domains.ts`, then the matrix (`src/lib/matrix.ts`).
Etyme is the system of record for contingent workers: one record,
across every staffing supplier, for job requests, candidates,
timesheets, bills, invoice receipts, time limits and paperwork. It is
not a general VMS, not a public talent marketplace, and never an
autonomous agent that moves money or signs anything.

## 1. The idea

The paper "Learning Self-Orchestration in Decentralized Agent Swarms"
(arXiv 2610.22322) shows that who acts next, and when, matters as
much as how well each agent acts. Its agents learn that by bidding.
**Do not build bidding or any learned weight.** Etyme's buyers are IT
and program leaders who must be able to audit why anything happened,
and the model boundary in CLAUDE.md forbids a model deciding on
money, hiring, signing or relationships.

Build the Etyme reading instead: **one explainable next-step engine**
that, for every open item on the record, answers from stored fields
only:

- **Who acts next:** party, company, role, named person.
- **What they get:** which card, on which surface (Ask Etyme, Teams,
  email), and when (now, or in the next batch).
- **Why:** one sentence citing the rule and the figures on the record.
- **Who is told without being asked to act**, and **who is
  deliberately not told**. Suppression is logged.
- **Decision:** ACT, WAIT or NO ACTION. NO ACTION is a logged, counted
  outcome.

The next-step score is rules as data: the dependency is cleared, this
party is the blocker, deadline nearness, SLA breach, lifecycle stage,
and that party's standing. Every score is reproducible from the row.

**Build it out of what exists, not beside it.** The decisions queue
(`/api/decisions`), the twin's questions (`lib/twin/ledger`), the role
contract, the Ask Etyme greeting and the Teams digest already decide
most of this for most flows. The engine is the one function those
call, not a new framework they are migrated to later. A rebuild of
working flows is the 2017 sprawl and is refused.

## 2. Rules you never break

1. **Twins never talk to each other.** Four twins: client (program
   manager), supplier, integrator, worker. Only the first two exist in
   code (`TwinKind` PROGRAM_MANAGER, SUPPLIER). Twin A writes a step
   to the record; Twin B puts a card in front of its own person.
2. **Privacy at the query.** A client sees the bill rate of the rung
   it pays and the standing (insured, authorized) of whoever employs
   the person; a sub-vendor's name only where the agreement requires
   disclosure. A prime sees its own pay rate to the sub and the sub's
   standing. A sub sees its pay rate, never the client's bill rate.
   The worker sees their own pay, their own papers, and every firm in
   the chain by name. Date of birth and I-9 contents are readable only
   by the employer-of-record's compliance role. Nothing is checked
   only on the screen.
3. **Surfaces.** Ask Etyme is the front door for every seat: the
   greeting is the person's queue, every act is a card there. Teams
   carries the same cards for quick yeses and exceptions. The
   dashboard is where lists and tables live, one click behind, reached
   from the card. Google Chat is not built; do not add it.
4. **Ledger first.** Every decision, card, suppression, approval,
   override and outcome is written to the ledger before any notice
   leaves. The access log already does this for reads; refusals are
   written before they are sent.
5. **People act.** The twins draft, route, remind, surface and
   simulate. A named person takes every consequential step through
   the one approval route (`POST /api/twin/approvals/[id]`). The
   role contract's three tiers (acts alone · needs approval · never)
   govern every act; a new act is a new act kind in the contract
   first, with its tier, before any card is drawn.

## 3. Words

Use the trade's words, in American English, as CLAUDE.md fixes them:
job request, job, candidates, who applied, timesheet, **bill** (what
a firm sends up to whoever pays it), **invoice receipt** (what a firm
receives from below), payroll, time limit, on hold, approved
suppliers, MSP, program manager, the person's role. Never "desk",
never "program office", never "vendor bill", never a state name from
the code. A refusal is one sentence saying what is missing and who
can act. A test fails on either banned word in text a person reads.

## 4. Governance as data

A governance matrix, stored and enforced in code: party × role ×
lifecycle stage × flow = {sees, does, must approve, never, when
told}. Most of it exists: `lib/company-roles`, `lib/permissions`,
the role contract, `lib/nav-table`. Extend those; do not write a
second permission system.

Parties: client · prime · sub-vendor · bench vendor · integrator ·
MSP · one-person firm · worker. An integrator buys and sells like a
prime and brings its own W2s; an MSP runs a client's program in a
seat the client grants and places nobody. They are not one party.

Lifecycle: job request → approved suppliers → candidates →
interview → award → paperwork → ready to start → placement (weekly)
→ time-limit milestone → bills and invoice receipts → extension or
conversion → end → offboarded.

Stage rules to hold (most are built; verify, do not rebuild):
- Candidates: a client sees nobody who has not consented, except a
  firm's own W2 submitted as INTERNAL, where the employment is the
  consent and the employee is told.
- Paperwork: ready-to-start is computed from the required set
  (`lib/document-requirements`, `lib/contract-clearance`); I-9 and
  lapsed cover block, the rest warns with a reason; an override is a
  named person with a reason in the ledger; work authorization is
  never waived.
- Placement: only the worker files the week; the client signs at the
  top; each rung below accepts the same week in turn; nobody signs
  their own; a firm never approves its own bill.
- Time limit: warnings at 90, 60 and 30 days. A message to another
  company (`tenure.warning.notify_supplier`) needs a yes today. **If
  the founder wants it automatic, that is a decision to put to him,
  not to assume.**
- After end: the 90-day break starts the day after the last day;
  "ask them back" checks the ledger before the button is offered;
  retention is as the regulatory rules state.

Never, all twins, all stages (the role contract's floor, unchanged):
submit a person without consent · award · sign anything · complete
an I-9 or any form for the worker · release payroll or a payment ·
approve your own work, timesheet, bill or draft · expose DOB, I-9
data, another rung's rate, or a hidden sub-vendor's name · change a
rate, bank detail or contract term outside its approval flow.

## 5. The flows

Every flow is read against what is built before a line is written.
Use `etyme-scout` first and list what exists, what is partial, and
what is missing. Work moves scout → architect (schema) → tests as
sentences → build → release pass → preview.

**A. Timesheet to bill to payment (built; verify and finish).**
- The worker files; the client signs; each rung accepts (`lib/week-
  approval`).
- The supplier's twin drafts the bill **on the agreement's billing
  date, for the agreement's period, from weeks signed above** — never
  "immediately on final acceptance": a firm bills upward on the
  client's signature, and the agreement between each pair sets when
  (`lib/money/supplier-bills`, `lib/billing-cascade`). A person sends
  it (Accounts Receivable, Finance or Admin in Ask Etyme; the Owner
  from the Bills page); a draft can be withdrawn with a reason.
- The payer's three-way check — order and its ceiling, signed
  timesheet or approved expense or accepted milestone, invoice
  receipt — is one gate (`mayPayInvoiceReceipt`, `keyed-receipt`) for
  bills sent through Etyme and invoices typed in. A mismatch is held
  with a sentence to the one party who can fix it, never paid
  forward. Payment is strict: accepted hours at the contract rate;
  the 0.5% tolerance decides only what the twin raises.
- Statuses are the ones that exist: a draft, a sent bill, an invoice
  receipt received or held, paid. There is no "approved for payment";
  the match is the approval.
- Still owed, and yours to do here: the AP screen (lines, waive,
  cancel, pay), waiver parity on platform bills, bill cards in Teams,
  the middle firm's receipt checks (awaits a founder decision on
  whose authority), reminder dates reconciled with the agreement's
  billing date.

**B. Paperwork (mostly built).** Documents are declared by type with
purpose (compliance · agreement · proof), owner, signer, verifier,
dependencies, due and expiry. I-9 Section 1 is the worker's, due day
one; Section 2 is the employer's authorized representative within
three business days; the system never tells the worker which
documents to bring and never pre-fills Section 1. DOB is collected
once, masked, compliance-only. A rejection goes back to the one
party who can fix it with a reason code. Rewire `lib/contract-
clearance`, `lib/packets`, `lib/outbound-pack`, `lib/supplier-
onboarding` to read `lib/document-requirements` (owed by
regulatory).

**C. Candidates and matching (partly built; do not reverse what is
decided).** The client's program manager or Procurement chooses
which approved suppliers see a job; a job is never broadcast and a
supplier never scores itself in. Matching brings consented bench to a
job request, existing suppliers first, every match with factors,
basis, confidence and unknowns. Duplicates are stopped at the record
(`Submission` unique on requirement + person). A client decision
carries a structured reason that goes back to that supplier only.
Bench appears only against a live job request; no bench blasts.
**Dynamic submission caps are a new rule: propose them to the
founder with the five-question test; do not build them unasked.**

**D. Relationships (partly built).** Standing is earned on the record
(`lib/supplier-tier`: probation, approved, preferred) from events —
accepted submissions, clean weeks, clean receipts, papers on time.
The engine may propose a step up or a step down to a person; it never
changes standing itself. Stopping a relationship is a governed
ladder, warn → throttle → pause → remove, each step a person's yes
with a reason code and an appeal path, grounds being events on the
record. Neutrality is absolute: Etyme never favors a supplier, Tapin
included.

**E. Profit (partly built).** Margin per placement on the record,
each party reading only its own slice; a client never sees a
supplier's margin. Exceptions ranked by dollars at risk: rate drift
from the agreement, margin below floor, signed weeks not yet billed,
receivables ageing, conversion at the time limit, overtime leakage,
duplicate-billing risk. Every card shows the dollars, the rule, two
outcomes and what would invalidate it.

**F. Who is told, and how often (applies to every flow).**
- One action card per open item, to the one person who can act.
- Information is separate: HR is told of every bench move, each rung
  is told when a week reaches it, the worker is told at each step.
  Those are notices, not cards, and they are not suppressed.
- Batched delivery for quick approvals; immediate only for the urgent
  class (locks, security, day-1 and day-3 paperwork deadlines).
- Caps on reminders per document and per week; a bench blast is
  banned; a worker is contacted only by the firm holding their
  consent.
- Soliciting outside the record after a paused relationship is a
  negative standing event when reported on the record.

## 6. Measurement

Per twin, party and role, weekly, from the ledger: items advanced
(not touched), median time an item sat with that party, exception
rate, suppressed count, override rate, NO ACTION count. The one
number the founder watches stays: acts per day in the chat. The
system proposes a rule change from a repeated pattern; a person
turns it into data; governance never changes itself.

## 7. How work is done here

- The founder cannot read code. Every test is an English sentence he
  can read; a preview link he can click; a drawing before any screen
  he will look at. No new test file without asking.
- One domain agent per area at a time; `src/lib/domains.ts` says who
  owns what. Schema changes go only through `etyme-architect`,
  additive and nullable, because production applies them on build
  behind `DB_PUSH_ON_BUILD` (the founder sets it for that one deploy
  and removes it after).
- Nothing ships on a red test. One full release pass per wave: type
  check, unit, integration, build; then preview; then production.
- Decisions open with the founder today — do not assume them: whether
  the Owner may approve the twin's bill where nobody else sends
  bills; whether each firm above the worker accepts an expense before
  paying it; a sub-vendor's overtime rate and which hours come off
  first on a cut week; whose authority a supplier's receipt checks
  run under; whether time-limit messages to a supplier go without a
  yes.

## 8. Build order

Slice 0 is reading, not code: map every flow above against the
record, the queue, the twins and the matrix; report what exists,
what is partial, what is missing, and which existing door the engine
will be built into. Then:

1. Finish A: AP screen, waiver parity, Teams bill cards, reminder
   dates reconciled.
2. B: rewiring onto `lib/document-requirements`; I-9 timing cards to
   the compliance role only.
3. The engine as one function inside the decisions queue and the
   twin's run, returning who / what / why / told / suppressed /
   decision, with NO ACTION logged; Ask Etyme and Teams read it.
4. F: batching, caps, suppression log.
5. C: structured reasons back to one supplier; bench only against a
   live job; proposals (caps) to the founder.
6. D: the ladder and proposals.
7. E: the ranked exception cards.

Stop after each slice. Report: files changed, schema requests, tests
run and green, the seeded scenario walked end to end as each party,
and every rule you had to invent, flagged. Commit only on green. Do
not start the next slice until the report is delivered.

## 9. Acceptance

1. Helena Marsh's week: filed once, signed by Northbend, accepted by
   Computer Systems and Techpeple in turn; the prime's twin drafts
   its October bill on the agreement's date for both October weeks
   (80 h × $145 = $11,600), a person sends it, the three-way check
   passes, Northbend pays, and Helena is owed 40 × $90 = $3,600 on
   her pay day. Every figure read from the seed, none typed into the
   test.
2. A receipt of 41.5 h against 40 h signed is held with a sentence,
   never payable, and only the fixing party is told.
3. A client seat cannot read DOB, I-9 contents, a pay rate, or a
   hidden sub-vendor's name anywhere: screens, API, notices, exports.
4. A job reaches only the suppliers the program manager approved; a
   duplicate candidate is stopped before the client sees them.
5. A worker with an unverified mandatory document cannot be ready to
   start without a named person's override and reason in the ledger.
6. I-9 Section 2 at risk on day two goes to the employer's compliance
   role only; the client and the worker are not told.
7. The 60-day time-limit warning is recorded and the program owner
   told at the milestone; any message to the supplier still waits for
   a yes unless the founder decides otherwise.
8. Three governed violations move a supplier warn → throttle, each
   step a person's yes, ledger-readable and appealable.
9. Every card shows why (rule and figures), the decision (ACT, WAIT,
   NO ACTION) and a link to the record.
10. NO ACTION and suppressed notices are counted in the weekly
    report.

## 10. Tone

Specific, numeric, plain. Name the party, the amount, the date and
the rule. Sentences of about fifteen words. If a number is not on
the record, say what is missing; never invent one. Never lead with
AI. Never name a competitor.
