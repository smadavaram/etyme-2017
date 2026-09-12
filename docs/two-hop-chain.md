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

## Step 8 — one week of hours, billed once at each hop

`Timesheet.sellContractId` is still a single foreign key, and that is
correct: the hours belong to the contract of the firm that actually
employs the person, because that is where the person actually works. The
week is filed against Contract 2's sell side, once, and nothing is ever
copied.

What was missing was a way for Computer Futures to *reach* it.

```
SellContract  --ContractLink-->  BuyContract      ✓ in the schema
BuyContract   --???-->           SellContract     ✗ nothing
```

`BuyContract.vendorCompanyId` names the firm we buy from. It does not
name the contract, and two people from the same sub-vendor on two roles
are two sell contracts.

**`BuyContract.supplierSellContractId`** is that edge — null when the
person is our own employee, which is where the ladder ends, the same
reason `purchaseOrderId` is nullable. The walk asserts both: Contract
1's buy side points at Contract 2's sell side, and Contract 2's buy side
points at nobody.

`src/lib/work-chain.ts` walks it, and descends only. A firm learns which
contracts sit below it, because that is where its hours are. It learns
nothing about what sits above, because that is somebody else's margin.

### One billing per leg, not one ever

`InvoiceLine.timesheetId` used to be `@unique` — *one timesheet, one
line, ever*. Right between two parties, and wrong the moment a prime
stands between the client and the employer: one week is then
legitimately billed twice, by different firms at different rates. That
is not a duplicate. It is two commercial facts about one physical fact.

It is now `@@unique([timesheetId, sellContractId])`. The guard worth
keeping — the same week billed twice on the same contract — is exactly
what that says.

### Why the hours stay on the contract rather than moving to `Engagement`

The earlier version of this document said the fix was to move the
timesheet onto `Engagement`. It was wrong. An `Engagement` hangs off a
`MasterAgreement`, which has one vendor and one client — it is per
firm-pair, exactly as a sell contract is. The hours would have sat on
CloudEPA's engagement with Computer Futures' still empty: the same
problem, one table across.

**Hours are a fact; contracts are opinions about who pays for the fact.**
Keeping the fact in one place and letting each opinion reach it is what
means amending a contract can never change what somebody did last
Tuesday.

The full five-party version of this walk, from requisition to cash, is
in `docs/full-spine.md`.
