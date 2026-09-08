# The whole spine — requisition to cash, walked step by step

```
Adobe Systems  →  Magnit  →  Computer Systems  →  CloudEPA  →  Priya Raman
   (client)       (MSP)         (prime)            (sub)      (the person)

   demand travels down ▸                        ◂ the person travels up

   $135/hr billed        no rate         $110/hr billed      $85/hr paid
```

`__integration__/full-spine.test.ts` — 60 tests, every one of them a real
route handler called the way the browser calls it. Nothing is written
straight to the database except the world as it stood before the story
started: the companies, the people, the cost centre, the delegation of
authority and Priya's bench listing.

This is the case the product exists for. A two-party demo cannot show it,
and every finding below came from walking it rather than from reading
the code.

---

## The five parties

| | Who they are | What they hold |
|---|---|---|
| **Adobe Systems** | the client | the requisition, the budget, the purchase order |
| **Magnit** | the MSP | Adobe's programme. Routes demand, takes no rate |
| **Computer Systems** | the prime supplier | sells to Adobe, buys from CloudEPA |
| **CloudEPA** | the sub-vendor | sells to Computer Systems, employs Priya |
| **Priya Raman** | the consultant | one bench listing, one timesheet |

**The MSP here is an agent, not a principal.** It sees the demand, picks
who gets to see it, and holds no contract — the arrangement the founder
described. A principal MSP, one that sells to Adobe and buys from
Computer Systems, is a fourth commercial hop and is not modelled. The
walk asserts Magnit ends with zero sell contracts and zero buy contracts,
so if that ever changes a test says so.

---

## The walk

### Part one — the demand

**Step 1 · A manager raises it.** `POST /api/requisitions`. One head, twelve
months, $150/hr ceiling, funded from `DME-PLAT-4100`. That annualises to
$288,000, which is over the $100,000 delegation, so it routes to a VP
rather than opening. It reaches **no vendor** until somebody says yes,
and the automation log records why it routed in words the manager can
read.

**Step 2 · The VP approves it.** The manager who raised it is refused —
`FORBIDDEN`, the approval is not theirs to give. The requisition opens
the moment the last rank approves, and not before.

**Step 3 · Adobe puts it to its MSP, with a band.** `payMin`/`payMax` live
on the invitation, never on the requisition, so a second vendor cannot
read the first one's numbers. A band above the ceiling the requisition
was approved at is refused outright.

**Step 4–5 · It travels down the panel.** Magnit accepts, records the role
against itself carrying Adobe forward as the end client, and sends it to
Computer Systems at $135. Computer Systems does the same and sends it to
CloudEPA at $115. Three bands, three recipients, **each reads only its
own** — CloudEPA never learns Adobe agreed to $150.

### Part two — the supply

**Step 6 · CloudEPA puts Priya forward at $110.** It could not have
happened without the bench listing she granted, and the listing was
granted *after* being invited rather than stamped when the row was made.

**Step 7 · The package is checked before it goes anywhere.**

**Step 8 · Computer Systems forwards her to Adobe at $135.** A second
submission with its own rate, linked to the first. CloudEPA learns she
was forwarded and to whom — **not for how much.**

**Step 9 · Adobe interviews her three times.** Screen, technical, onsite,
numbered in order. The supplier confirms times on her behalf and it is
recorded as exactly that. The supplier is refused when it tries to record
its own candidate as having passed — `NOT_YOURS`. CloudEPA can see she is
interviewing and cannot see Adobe's notes.

### Part three — the paper

**Step 10 · Adobe commits the budget before it commits to a person.** A
purchase order to Computer Systems, $259,200 for the year. *An order
carries a ceiling. A contract carries a rate.*

**Step 10b · No supplier places anybody without cover on file.** The award
is refused outright while Computer Systems has no certificates —
`AWARD_BLOCKED`, general liability and workers' compensation. Addendum E:
BLOCK where it is legally grounded, and this is not a warning to click
past.

**Step 11 · Adobe awards it.** Computer Systems gets a sell contract at
$135 on 45-day terms, and a buy contract from **CloudEPA at $110** — the
cost, not the price.

**Step 12 · Computer Systems awards its own sub.** CloudEPA gets a sell
contract at $110 and a **W2** contract for Priya at $85, with no vendor
and no purchase order, because you do not raise one to your own employee.

The ladder, asserted end to end: **$135 → $110 → $85.** One firm's cost is
the next firm's revenue at every hop.

**Step 13 · Activated, and the PO attached.**

### Part four — compliance

**Step 14 · What has to be true before she sets foot on site.** E-Verify
`CLEAR` — the check that blocks. Sterling background check `CLEAR` with an
expiry on it — the one that warns, uploaded by one person and verified by
another.

### Part five — the money

**Step 15 · Priya files one week, once.** Forty hours, one row. She is
refused when she tries to sign it herself: *Nobody approves their own
hours.*

**Step 16 · Two signatures, from two different companies.** Adobe says the
work happened (`CLIENT_APPROVAL`). CloudEPA accepts what it will pay for
(`EMPLOYER_ACCEPTANCE`). Different statements, and in a chain almost never
the same company.

**Step 17 · CloudEPA pays her.** 40 hours at $85 — $3,400.

**Step 18 · CloudEPA invoices Computer Systems $4,400, and is paid.**

**Step 19 · And here the chain stops, one hop short of Adobe.**

**Step 20 · What each firm made.** CloudEPA $1,000 on the week. Computer
Systems nothing yet, which is honest rather than optimistic.

---

## What the walk found

Four bugs, none of which an existing test could have caught, because
nothing had ever driven the award route for real.

### 1. Every award returned a 500 — after committing

`orderFor()` opens a `ProjectOrder` and returns its id. The award route
wrote that id to `BuyContract.internalOrderId`, which is a foreign key
pointing at `InternalOrder` — the *client's* own coding, a different
table. The insert violated the constraint and threw, **after** the
transaction that creates the contracts had already committed.

So the person who pressed Award saw an error, and somebody had in fact
been placed. Fixed: the column is `projectOrderId`.

### 2. No forwarded candidate could ever be awarded

Forwarding mirrors the role onto the destination's books. That create
left `approvalState` at its default of `DRAFT`, and the award route's own
approval gate refuses a draft requisition: *"Requisition is draft — nobody
can be placed against it yet."*

A chain could therefore be built all the way to the client and then never
closed. The manual requirement path already sets `AUTO_APPROVED` and
explains why — a vendor answering somebody else's advert is not raising a
requisition against their own budget. The forwarding path is the same
case and was missed. Fixed.

### 3. Every chained placement showed zero margin

`buySide` decided who a firm buys from by comparing the supplier with the
awarding company. Those are **never** equal — the route refuses that case
explicitly one screen up, with `NO_COUNTERPARTY`. So the "our own
employee" branch was unreachable, and every buy contract:

- belonged to the supplier and **named the supplier as its own vendor**
- recorded the price being charged as the cost being paid
- was `C2C`, always; `W2` was unreachable

Margin came out at **zero on every chained placement**. That is at least a
number somebody queries. A company buying from itself is not.

Fixed by reading the chain instead of guessing at it. A forwarded
submission carries `parentSubmissionId`; the parent's sender is the
supplier and the parent's rate is the cost. A submission with no parent is
a firm's own person — `W2`, no vendor, and the rate has to be typed
because nothing in the chain says what you pay your own employee.

### 4. A company owner could not see its own money

`POST /api/companies` grants its Owner role `permissions: ['*']`. Thirteen
routes checked `caller.permissions.includes('margin.read')` directly
rather than through `hasPermission`, which honours the wildcard
everywhere else in the build.

So for the owner of any company created through the API: AR, AP, payment
runs, credit notes, collections, vendor concentration, vendor risk,
payroll reserve, profitability and **recording a payment** all returned
403. Fixed in all thirteen.

---

## What the walk found and did not fix

### The award lands on a copy of the requisition, not on the requisition

Demand travels down the chain by somebody **rekeying it**. There is no
route that turns an accepted invitation into the recipient's own record,
so Magnit's copy and Computer Systems' copy carry no
`Requirement.mirroredFromId` and nothing ties the three rows together.

When the submission climbs back up, forwarding mirrors the role onto
Adobe's books — creating a **second** Adobe requirement, because the chain
that arrived has no link back to the first. Adobe now holds two records
of one job, and the award lands on the copy.

The award route exists, in its own words, to carry the cost centre, the
hiring manager, the org unit and the seat count onto the contract. It
carries **none of them**, because the mirror has none of them. Concretely,
after a successful placement:

- Adobe's approved requisition still reads `OPEN` with zero seats filled
- the sell contract has a null `hiringManagerId`
- there is no `ContractCostAllocation`, so $259,200 of committed spend
  never reconciles against the budget that approved it

The fix crosses two domains and the schema, so it is reported rather than
attempted: requirements created from an invitation should carry
`mirroredFromId`, and forwarding should rejoin the original when the
destination is the company the chain started at.

### One timesheet can only bill one hop

`Timesheet.sellContractId` is a single required foreign key. The week is
filed against CloudEPA's sell contract, so CloudEPA pays and invoices from
it — and Computer Systems' sell contract, the one that bills Adobe $135,
has **no hours against it at all**.

To its credit the invoice route refuses rather than raising an invoice for
nothing. But the result is that the money chain stops one hop short of
the client, and $259,200 of purchase order sits undrawn against work that
was actually done.

Filing the week twice would make both hops billable and create two records
of one fact. They agree today and will not after the first correction. The
unique constraint is on `(sellContractId, periodStart)`, so nothing
prevents it.

**The fix is to move the timesheet onto `Engagement`.** It needs a schema
change and belongs to `etyme-architect`.

### Adobe can see CloudEPA on its compliance page

Worth deciding rather than discovering. Adobe holds no counterparty record
for CloudEPA and cannot reach them anywhere else in the product — and
there they are, named on Adobe's own compliance page, because CloudEPA
holds a contract whose end client is Adobe.

That is Addendum E working rather than a leak: tenure accrues to the
person at the client aggregated across every vendor, and a client that
cannot see which firms are on its site cannot compute it or answer for
it. But it is also the prime's supply chain, and primes hide subs for a
living. Both tests are in the walk, named, so whichever way it is decided
the decision is visible.

---

## Running it

```
npx vitest run -c vitest.integration.config.ts __integration__/full-spine.test.ts
```

Needs Postgres on localhost. The harness drops and recreates `etyme_test`
before the story starts.
