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
  underneath it still held — nothing had ever created a `SalesOrder` —
  but the reason was not that the document is fictional. It was that the
  product modeled one document as two rows and only ever wrote one of
  them.*

  **Merged, 2026-09-17.** `PurchaseOrder` and `SalesOrder` are one
  `WorkOrder`, carrying the union of both: the issuer and the recipient,
  the ceiling and the dates, the four parties (sold-to, bill-to, ship-to,
  payer), the billing basis and its `OrderMilestone[]`, and
  `autoApproveTimesheets` with `approvalWindowDays`. The name is the
  trade's own and belongs to neither end; `lib/order-naming` decides what
  each reader is shown, so a client reads "purchase order" and a supplier
  reads "sales order" off the same row. The URL stays
  `/api/purchase-orders` and the event stays `purchase_order.raised` —
  an address is not a word anybody reads.

  **What that fixed, and it was three things:**

  1. **Auto-approval of timesheets can now fire.** `cron/auto-approve`
     read `salesOrder.autoApproveTimesheets`, no `SalesOrder` ever
     existed, so the flag was false on every timesheet in the world and
     the nightly job approved nothing from the day it was written. It is
     proven alive in `__integration__/work-order.test.ts`: *"a timesheet
     nobody answered is approved when the order says silence counts, and
     is not when it does not."*
  2. **Milestone billing is reachable.** Milestones hang off the row that
     is actually written, and the Milestones screen reads the order the
     client raised rather than one nobody had.
  3. **The four-party split is reachable** — the first thing a large
     enterprise asks for.

  The two sentences the merge had to preserve, and did: **an order
  carries a ceiling, a contract carries a rate**, and **a contract is per
  person, an order is not**. One order still produces a contract for each
  person on it, and the rate, the person and the site stay on
  `SellContract`, joined by `workOrderId`:

  | The paper says | The system holds it on |
  |---|---|
  | how much may be spent, by when | `WorkOrder.amount`, `startDate`, `endDate` |
  | whether silence approves a timesheet | `WorkOrder.autoApproveTimesheets`, `approvalWindowDays` |
  | the rate | `SellContract.billRate` |
  | the resource | `SellContract.personId` |
  | the location of work | `SellContract.workLocationId` |
  | the two joined | `SellContract.workOrderId` |

  *What is still empty is the station, not the shape.* `workOrderId` is
  nullable and **the award still never sets it**. A client awards, a
  contract appears, and no work order is raised or required — while the
  founder says the client raises one every time. Raising one now attaches
  every running contract with that buyer and no order, which closes it
  for a firm recording its book; it does not close it at award.
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

And the notice it sends is titled with the engine's own enum:
`"INVOICE_GENERATE cycle due in 3 days"`. So a contractor is told
`SALARY_CALCULATE` about her own pay. That is the precise mistake
CLAUDE.md records from 2017 — *"the timeline filter was the cycle
engine's own enum (`TimesheetSubmit`, `SalaryCalculation`) … exposing how
it is built instead of what it is for"* — reintroduced in the one place
nobody read, and `labelOf()` in `lib/cycle-kinds` already returns "Pay
day", "Invoice to raise" and "Hours due" for exactly this purpose. Two
bugs on the same six lines: the wrong person, told in the wrong words.

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

### The one that broke, and it was the opposite way round — closed 2026-09-17

**Only a client could create a shell.** Both paths that made one —
`POST /api/suppliers` and the supplier-onboarding walk — ran from the
client's side. There was **no route where a vendor listed a client that
is not here**, and `POST /api/contracts` required `clientCompanyId` to
name a company that already existed.

So a staffing firm that signed up with an existing book of business could
record none of it. Every contract it already held named a client that was
not on the platform, and nothing let it say so. That inverted the
assumption in "Who pays": the client is the customer and the client-first
path was the one that was built, while the vendor who arrives first — the
firm that hears about this from a peer, signs up on a Tuesday and wants to
put its current placements in — had no door.

**It has one now**, and it is deliberately the same door the other way
round (`lib/off-system`):

- **`POST /api/clients`** lists a client that is not on the system,
  creating a shell with `claimedAt` null and `listedById` set, with an
  unsigned agreement stub and a counterparty row behind it, invitable and
  claimable through the existing `SupplierInvite` path.
- **`POST /api/contracts`** accepts a shell client, and — this is new and
  closes a hole that was already open — refuses a *claimed* company the
  caller has nothing on file with, in a sentence. Any firm being able to
  name any client is the trap CLAUDE.md names under the MSP seat, and it
  was live on that route until now.
- **`POST /api/purchase-orders`** lets a claimed firm write an order on
  the leg where it is not the natural issuer, **where that counterparty is
  a shell**. So a supplier records the purchase order its client handed
  it, `WorkOrder.recordedById` says who typed it in, and the row becomes
  the client's the day they claim it. Where the buyer *is* here the
  refusal is a next step rather than a wall: the order is theirs to raise.

What is still missing is a **screen** for any of it. The three routes are
walked as sentences in `__integration__/work-order.test.ts`; nobody can
click them yet.

### What the merge and the door had in common

**The two questions were almost orthogonal.** The shell mechanism keys on
`Company.id` and does not care how many order tables exist.

They touched in one place, and it was the reason to do them together. A
merged order still needs an issuer, and the unsolved problem was never
that the two sides need separate rows — it was that **nothing let a
claimed firm write an order naming a shell on the leg where it is not the
natural issuer.** That carve-out had to be written either way, and the
merge made it one write path to get right instead of two.

---

## What this statement changes

Three things it says that the build does not yet do, in the order the
money justifies:

1. **A work order per engagement.** *Done as a model, 2026-09-17* — one
   `WorkOrder`, raisable by the client and recordable by a supplier whose
   client is not here. **Not done as a habit:** the award still does not
   raise one, and nothing refuses a placement no order authorizes, which
   is what "every time" actually means.
2. **Compliance requirements set per engagement**, at both supplier and
   candidate level, by the client, at the moment of hiring. Today the
   requirement set is per company.
3. **Payment terms as a green light.** Insurance is a gate; terms are
   not, and the founder names them in the same breath.

And one it says that the build does correctly and quietly: **the
approval is distributed to all layers above**, which is `PASS_THROUGH`
and was built before anybody asked for it.
