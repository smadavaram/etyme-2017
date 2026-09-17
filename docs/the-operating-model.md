# The operating model

From the founder, 2026-09-17, in his own order. This is the chain the
product exists to carry, stated end to end for the first time: who does
what, in which company, and what has to be true before the next thing
happens.

It is written down because a decision that lives only in a chat log
drifts — the lesson CLAUDE.md records from the landing page saying the
wrong thing for a week. Where the build already does something, the file
says so. Where it does not, the file says that too, and those lines are
the work.

---

## The chain, in his words

> Recruiters procure profiles and submit them to requirements internal or
> layer above. Account managers work with the layer above to submit
> shortlisted, negotiated and initially screened for work permitting to
> clients. Clients interview and hire — they agree to an MSA if new, or
> otherwise create a work order and compliance requirements at supplier
> and candidate level every time. The supplier's contract manager and HR
> manager work together to make both client compliance and
> candidate/supplier compliance background check complete. If the
> candidate is green and the company meets the client's compliance line —
> insurance and payment terms — everything is green, then the start date
> is announced and the contract begins.
>
> Candidates file a timesheet, the client approves, and the same is
> distributed to all layers above them. Billing and invoicing is
> synchronized.
>
> The employer pays salary as per agreed terms to the candidate. The
> employer reserves the right to show or not show the customer rate to
> the candidate.
>
> The company bills its client and gets paid on time. The company pays
> payroll and suppliers timely. Ownership and managers monitor
> profitability.

---

## Station by station

### 1 · The recruiter procures and submits

Sources a profile and puts it against a requirement — **its own firm's,
or one that came down from the layer above**. Both directions are real:
a bench vendor answering a prime's role, and a prime answering a
client's.

*Built.* Submission requires the consultant's consent as a live
`BenchListing`, **unless the firm employs them** — a W2 employee is
submitted as `INTERNAL` and told rather than asked (decided 2026-09-17).

### 2 · The account manager sells upward

Takes what the recruiters found, **shortlists, negotiates the rate, and
screens for work permitting before it goes to the client**. The client
should never be the first party to discover somebody cannot legally work.

*Partly built.* Submission carries a rate and a check pack. **The work
authorization screen happens at activation, not before submission** —
`contract-clearance` runs inside `activate`. Screening for the right to
work *before* the client sees the person is not a gate anywhere.

### 3 · The client interviews, hires, and papers it

Three things, and the third is the one the build under-reads:

- **An MSA if the relationship is new.** *Built* — term, lifecycle, both
  signatures, amendment trail, expiry watch.
- **A work order every time.** Not once per relationship — once per
  engagement.

  **The work order is the PO, and the PO is the sales order. Settled by
  the founder, 2026-09-17**, in two statements an hour apart:

  > Work order is not separate from PO — the client gives it to the
  > supplier and it agrees rate, duration, resource and location of work.

  > The PO on the client side is the sales order on the vendor side.

  So there is **one commercial document with three names**, depending on
  which end of it you stand: the client raises a purchase order, the
  supplier receives it as a sales order, and the trade calls the whole
  thing a work order. Not three documents. Not two rows.

  *An earlier version of this file, written an hour before the second
  statement, concluded "do not build `SalesOrder` — the trade does not
  contain one". That was wrong, and wrong in an instructive way: the
  trade contains it, under the name the seller uses. The observation
  underneath it still holds — nothing has ever created a `SalesOrder` —
  but the reason is not that the document is fictional. It is that the
  product models one document as two rows and only ever writes one of
  them.*

  **And the two rows are not duplicates. Each carries what the other
  lacks**, which is why neither can be deleted without moving fields:

  | | `PurchaseOrder` (client's name) | `SalesOrder` (vendor's name) |
  |---|---|---|
  | Ever created? | **yes** — 3 write sites | **no** — none, anywhere |
  | Parties | issuer, recipient | **sold-to, bill-to, ship-to, payer** |
  | Ceiling | `amount` | `ceilingCents` |
  | Dates | start, end | start, end |
  | Billed how | — | **`billingBasis`: time or milestone** |
  | Milestones | — | **`OrderMilestone[]`** |
  | Silence counts as approval | — | **`autoApproveTimesheets`, `approvalWindowDays`** |

  The vendor's view holds all the commercial substance — a client that
  signs in one entity, is billed through a shared service centre, has the
  work done at a third site and pays from a fourth; whether the thing is
  billed by time or by milestone; and the term that says an unanswered
  timesheet is approved after N days. The client's view is what actually
  gets written, and can express none of it.

  **Three consequences follow, and one of them is already costing money:**

  1. **Auto-approval of timesheets can never fire.** `cron/auto-approve`
     reads `salesOrder.autoApproveTimesheets`, and no `SalesOrder` exists,
     so the flag is false on every timesheet in the world. The cron runs
     nightly and approves nothing. It is not broken — it is reading a term
     from a row nobody writes.
  2. **Milestone billing is unreachable** by the same route, and the
     Milestones screen is permanently empty.
  3. **The four-party billing split is unreachable**, which is the first
     thing a large enterprise asks for.

  The fix is one order object named per viewer — a client reads "purchase
  order", a supplier reads "sales order", the trade says "work order", one
  row underneath. That is a schema change and the architect's to make.

  The four terms already exist, split across two rows the way CLAUDE.md's
  own rule requires — *an order carries a ceiling, a contract carries a
  rate*:

  | The paper says | The system holds it on |
  |---|---|
  | how much may be spent, by when | `PurchaseOrder.amount`, `startDate`, `endDate` |
  | the rate | `SellContract.billRate` |
  | the resource | `SellContract.personId` |
  | the location of work | `SellContract.workLocationId` |
  | the two joined | `SellContract.purchaseOrderId` |

  *So the shape is right and the station is empty.* `purchaseOrderId` is
  nullable and **the award never sets it**. A client awards, a contract
  appears, and no work order is raised or required — while the founder
  says the client raises one every time. Nothing refuses a placement that
  no work order authorizes, so the ceiling that governs the spend is
  absent on every placement the product has ever created.
- **Compliance requirements at supplier and candidate level, every
  time.** Per engagement, not per relationship — a client can require
  different checks for a role in a hospital than for one in a warehouse.
  *Not built.* Compliance requirements are a company-level dictionary
  (`lib/document-type`, extensible per company, 2026-09-17); nothing
  attaches a required set to a single engagement or work order.

### 4 · Contract manager and HR manager, together

Two desks, two directions, and the founder names them as working **in
tandem**:

- **Contract manager** — papers the contract, the work order, the rates.
  Holds `assignments.write`, cannot submit.
- **HR manager** — the candidate's own file and the supplier's own
  standing: background check, right to work, licenses, and the firm's
  insurance. Holds `consultants.write`, no money at all.

*Partly built.* The permission split is real and correct. **Neither desk
is told its turn has come** — the award tells only the client-side
raiser, and HR has no queue at all. Both are being wired (2026-09-17).

### 5 · Two greens, then a start date

The founder states the gate precisely, and it is **two gates, not one**:

> If the candidate is green **and** the company meets the client's
> compliance line — insurance and payment terms — everything is green,
> then the start date is announced and the contract begins.

- **Candidate green** — right to work, background check, licenses.
  *Built*: I-9 and right-to-work block; a lapsed or not-yet-valid
  professional license blocks; the rest warns with a reason.
- **Company green** — the supplier's own insurance **and its payment
  terms**. *Half built*: lapsed and not-yet-started cover blocks.
  **Payment terms are not a gate anywhere** — a supplier whose terms do
  not meet the client's line can still start somebody.
- **The start date is announced.** *Not built as an announcement.*
  Activation moves the contract; there is no moment where a date is
  declared to every party who needs it.

### 6 · The timesheet, and the cascade

> Candidates file a timesheet, the client approves, and **the same is
> distributed to all layers above them**.

One filing, then the approval travels **up every rung** — the client
signs, and each firm between the client and the worker sees the same
hours it will bill and be billed for.

*Built, and the best-made station in the product.* The worker files their
own week and nobody else may. Two signatures, `CLIENT_APPROVAL` and
`EMPLOYER_ACCEPTANCE`, and `PASS_THROUGH` for the rungs between. Nobody
signs their own hours. The queue fires when either leg is unsigned.

### 7 · Billing and invoicing, synchronized

Each rung bills the rung above on the same hours, and the chain must not
disagree about what they were.

*Built for the arithmetic, broken for the telling.* Invoicing gates on
approved hours; the three-way match refuses an invoice for hours nobody
signed. But `cron/due-cycles` notifies **the consultant** for
`INVOICE_GENERATE` and `INVOICE_DUE` — four of six cycle kinds are
desk-side money events routed to the one person who cannot act on them.
**AR hears nothing until an invoice is already overdue.**

### 8 · The employer pays, and decides what the candidate sees

> The employer pays salary as per agreed terms. The employer reserves the
> right to show or not show the customer rate to the candidate.

*Built, both halves.* Payroll runs on accepted hours only. Rate
visibility is a per-requirement setting (Addendum D) — **not** a
platform mandate and **not** a company-wide switch — and as of
2026-09-17 a consultant reads their own pay and never the bill rate,
nor a colleague's pay on a shared contract.

The same routing bug as station 7: **AP and payroll are never told a run
is due.**

### 9 · Bills its client, gets paid on time

*Built.* AR ageing, dunning, credit limits, payment application, the
three-way match. A client pays only what came through the match.

### 10 · Pays payroll and suppliers timely

*Built.* AP, vendor bills, payment runs with an approver who is not the
raiser.

### 11 · Ownership monitors profitability

*Built.* `ProjectOrder` accumulates real revenue and cost from awards,
timesheets, commissions, payroll and reserves; `/api/profitability`
reads it, gated on `pnl.read` — which the Account Manager deliberately
does not hold.

---

## When one party is not on the system

The founder asked this before authorizing the order merge, and it was the
right gate: *"can other parties function when one of the parties is not on
system?"* A chain where every firm must be a tenant before anything can be
recorded is a chain nobody can start using.

**Mostly yes, and deliberately.** `Company.claimedAt` is null for a
**shell** — a firm on the register that has not taken possession of
itself. The rule is in the schema: *"An unclaimed shell can be sent a role
and can be scored. It cannot sign in, cannot be seen by the network, and
must never be mistaken for a firm that chose to be here."*

What works against a shell today, verified:

- **It can be sent a role** and scored.
- **It can be named on either contract** — a claimed firm's sell or buy
  contract may name an unclaimed counterparty, on either side.
- **A PO can be raised to it.** `issuedToId` is checked for existence and
  non-self, never for `claimedAt`.
- **It can be invoiced and paid**, and the AP desk *narrates* the edge
  rather than hiding it: *"…is not on the platform. Whoever they pay next
  is outside anything we hold. If this chain matters, invite them."*
- **Timesheets name the hole instead of faking a signature.** The walk
  expects a leg for every rung, then says *"X is not on Etyme, so nothing
  here carries their approval. Somebody has to collect it another way."*
  That is the "never silently permit" rule applied to an absent party.
- **The claim moment is designed, not stubbed.** Rows already point at the
  company id, so they are the claimant's the instant `claimedAt` is set;
  `lib/join-companies` handles the duplicate case on its own terms and
  requires a matching domain and a shared seat before folding two records.

### The one that breaks, and it is the opposite way round

**Only a client can create a shell.** Both paths that make one —
`POST /api/suppliers` and the supplier-onboarding walk — run from the
client's side. There is **no route where a vendor lists a client that is
not here**, and `POST /api/contracts` requires `clientCompanyId` to name a
company that already exists.

So a staffing firm that signs up with an existing book of business cannot
record any of it. Every contract it already holds names a client that is
not on the platform, and nothing lets it say so.

That is worth stating plainly because it inverts the assumption in "Who
pays": the client is the customer and **the client-first path is the one
that is built**. The vendor-first path — the firm that hears about this
from a peer, signs up on a Tuesday and wants to put its current
placements in — has no door. Suppliers are supposed to be here because
their clients are; nothing yet serves the supplier who arrives first.

**The second half of the same gap:** `PurchaseOrder.issuedById` can only
ever be the caller's own company, so **a supplier cannot record the
client's PO** — the work order it was handed. `SellContract.purchaseOrderId`
exists to hold exactly that and nothing can write the row it points at.

### What this means for the order merge

**The two questions are almost orthogonal.** The shell mechanism keys on
`Company.id` and does not care how many order tables exist. Merging
`SalesOrder` into `PurchaseOrder` neither helps nor harms the off-system
case, so **the merge is safe on these grounds.**

They touch in one place. A merged order still needs an issuer, and the
unsolved problem is not that the two sides need separate rows — it is
that **nothing lets a claimed firm write an order naming a shell on the
leg where it is not the natural issuer.** That permission carve-out has
to be written either way. The merge makes it one write path to get right
instead of two, which is a reason to merge first, not a reason to wait.

---

## What this statement changes

Three things it says that the build does not yet do, in the order the
money justifies:

1. **A work order per engagement.** `SalesOrder` is a shell with finished
   arithmetic and no way to create one. The founder says a client raises
   one *every time* — so this is not a missing feature, it is a station
   of the chain with nothing in it.
2. **Compliance requirements set per engagement**, at both supplier and
   candidate level, by the client, at the moment of hiring. Today the
   requirement set is per company.
3. **Payment terms as a green light.** Insurance is a gate; terms are
   not, and the founder names them in the same breath.

And one it says that the build does correctly and quietly: **the
approval is distributed to all layers above**, which is `PASS_THROUGH`
and was built before anybody asked for it.
