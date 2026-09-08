# One placement, two contract pairs — the L4 walk

```
Adobe Systems  ←  Computer Futures  ←  CloudEPA  ←  candidate1
   (client)          (prime)            (sub)      (the person)
      $135              $110              $85
```

Two contract pairs, one person, one week of work, a margin at each hop.
Each firm is the **upper** of its own contract and the **lower** of the
one above.

`__integration__/two-hop-chain.test.ts` walks it step by step against a
real database. Every step below is a test you can read.

---

## The two pairs

| | Contract 1 | Contract 2 |
|---|---|---|
| Belongs to | Computer Futures | CloudEPA |
| Sells to | Adobe Systems @ $135 | Computer Futures @ $110 |
| Buys from | CloudEPA @ $110 | candidate1 @ $85 |
| Type | `C2C` | `W2` |
| The person is | on it to file hours, nothing else | the employee |

**The join is the price.** Computer Futures' cost and CloudEPA's revenue
are the same $110. If those two ever disagree, one of the pair is
invoicing something the other is not paying — so the walk asserts it.

**`BuyContract.vendorCompanyId` is null on Contract 2** and set on
Contract 1. You do not raise a purchase order to your own employee, and
that nullable column is the clearest proof an order and a contract are
different objects.

---

## The walk

**Step 1–2 · The chain exists, and nobody sees past their neighbours.**
Computer Futures sees Adobe above and CloudEPA below. **Adobe cannot see
CloudEPA at all** — the client buys from the prime and has no
relationship with the firm that actually found the person. That is the
whole reason a chain exists, and the reason tenure cannot be obtained by
asking.

**Step 3 · The person agreed to be marketed, and by whom.** One bench
listing, at CloudEPA, `GRANTED` — and granted *after* being invited
rather than at the moment the row was made. Nobody further up the chain
has them on a bench, including the two firms that will bill for them.

**Step 4–5 · Two pairs, each with its own margin.** CloudEPA makes $25 an
hour, Computer Futures makes $25 an hour, and neither can see the
other's.

**Step 6 · The person files one week, once.** Forty hours, one row. Hours
are a fact; a fact recorded twice eventually disagrees with itself. The
employer's `WorkAssertion` rides on it, because in a chain the company
that approves is not the company that pays.

**Step 7 · CloudEPA is paid and pays.** Payroll owes the person 40 × $85
= **$3,400**. CloudEPA bills Computer Futures 40 × $110 = **$4,400**. A
$1,000 margin on the week, derived from the one timesheet through
`ContractLink`.

---

## Step 8 — where one timesheet stops being enough

`Timesheet.sellContractId` is a **single required foreign key**.

The week is filed against Contract 2's sell side, so CloudEPA can invoice
and pay from it. **Contract 1's sell side — the one that bills Adobe
$135 — has no hours at all.** Computer Futures can pay CloudEPA and
cannot bill Adobe.

The obvious workaround is the dangerous one. Filing the same week again
against Contract 1 makes both hops billable, and the walk proves nothing
stops you: the unique constraint is `(sellContractId, periodStart)`, so a
second row on a *different* sell contract is perfectly legal.

Two records of one fact. They agree today. They will not after the first
correction — somebody amends one, the other keeps the old number, and
the gap appears at invoice-versus-bill weeks later with nobody able to
say which is right.

**So the model handles a one-hop chain completely and a two-hop chain
only up to the second invoice.**

### What fixes it

Move the timesheet off the contract and onto the work. `Engagement`
already groups several sell contracts and is the natural owner.

- One assignment, four firms → **one** timesheet. Each firm derives
  through its own `ContractLink`, as payroll already does.
- Two assignments → two timesheets, unambiguously.
- The person files once per *place they worked*, which is how they
  already think about it.

Contracts change constantly — a sub-vendor is swapped, a rate amended, a
link closed. If hours hang off the contract graph, every one of those
changes rewrites history about work already done. **Hours are a fact;
contracts are opinions about who pays for the fact.** Keeping them apart
means amending a contract can never change what somebody did last
Tuesday.

That is a schema change and it is not made here. This walk exists to
show the gap with evidence rather than describe it.
