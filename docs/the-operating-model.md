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

  **The work order is the PO. Settled by the founder, 2026-09-17:** *"work
  order is not separate from PO — the client gives it to the supplier and
  it agrees rate, duration, resource and location of work."* So it is one
  document with four terms, and **it is not `SalesOrder`** — that model is
  a supplier-side instrument the founder's account of the trade does not
  contain, which is the likeliest reason nothing has ever created one.
  Do not build `SalesOrder` to fill this station.

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
