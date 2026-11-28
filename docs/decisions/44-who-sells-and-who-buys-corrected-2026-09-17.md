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

The buy side already knew this: `BuyContract.workOrderId` is nullable
because you do not raise a PO to your own employee, and `cyclesFor` writes
salary cycles where there is no vendor below and vendor-bill cycles where
there is. **The sell side did not, until 2026-09-17.** `SubmissionKind.INTERNAL`
sat in the schema with nothing computing it, and `POST /api/submissions`
demanded a `ConsultantProfile` and a consented `BenchListing` from every
person — a schema that knew and a route that forbade. It is computed now:
where the submitting firm holds an EMPLOYEE context for the person, the
door skips the listing, tells the employee, logs the read and writes
INTERNAL (`app/api/submissions/kind.ts`). Since 2026-09-30 matching also
brings a firm's own employees between projects to a job request, and they
go forward as INTERNAL from the match (`lib/match-pool`).

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
