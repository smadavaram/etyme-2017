## Bill, invoice receipt, payroll — the party who issues a document names it

**Decided 2026-09-17, by the founder**, over three statements. The
first:

> Use bill for customer and invoice for vendor/supplier payment and
> payroll for employee across the system.

Read alone that sounds like an inversion of what accounting software
says, and it was briefly written down here as one. It is not. The second
statement corrected the reading:

> Companies bill (also called invoice) a customer. Companies do
> invoice-receipt for supplier and payroll for employees.

**"Invoice receipt" is the word an enterprise finance team already
uses** for the step where a supplier's invoice is received and matched,
so the vocabulary settles on words the buyer already knows:

| Direction | Etyme says |
|---|---|
| **Out to the customer** | **bill** |
| **In from a supplier** | **invoice receipt**; the supplier issues its invoice, we receive it |
| **To our own employee** | **payroll** — never billed, never invoiced |

**The rule underneath:** the party who *issues* a document names it. We issue the bill, so
we bill. The supplier issues its invoice, so we do not raise one — we
receive it. An employee issues nothing, so payroll is neither.

**The half that is wrong in the code today is the supply side.** The
client document is a `Bill` and the code calls it an `Invoice`, which
the founder's own parenthesis permits. But `VendorBill` is wrong twice
over: what a sub-vendor sends is **its invoice**, not a bill, and "bill"
now belongs to the customer direction. A screen reading "Vendor bill to
raise" has the wrong party doing the wrong thing.

### The receipt is the timesheet

Worth stating because it falls straight out and the app half-built it
already. A three-way check matches an order against a **receipt** of
what was delivered and an **invoice receipt**. Nothing is delivered in a
staffing firm, so the founder named the equivalent, 2026-09-17:

> Our goods receipt equivalent is timesheet receipt or expense receipt.

That is the right word and it is the trade's, not a system's; CLAUDE.md
is explicit that a screen uses the reader's word. So the check is:

**work order ↔ timesheet receipt (or expense receipt) ↔ supplier invoice**

with the approved timesheet as the receipt: the proof that what was ordered actually
happened, signed by the party who received it.

Three things can be the receipt, and the app already treats all three
the same way, which is the sign the shape is right:

| Receipt | What proves it | Bills as |
|---|---|---|
| **Timesheet receipt** | the client signed the week | an hours line |
| **Expense receipt** | the expense was approved | an expense line |
| **Milestone receipt** | the client accepted the milestone | a milestone line |

`WorkOrder` is the ceiling, the receipt is the proof, the supplier's
invoice is what gets matched against both — and a client pays what came
through the match, never an invoice with no receipt behind it. The
three-way check exceptions that route to the AP desk are the
receipt-against-invoice exception queue, in the trade's words.

**Accounting integrations.** QuickBooks and Xero say *Invoice* for the
customer document and *Bill* for the received supplier one. That maps
cleanly and needs no inversion — their Invoice is our bill, their Bill
is our invoice receipt. State the mapping once at the boundary rather
than adopting their words on a screen.

**What changes and what does not.** The words a person reads change. The
machine names do not: `Invoice` and `VendorBill` keep their model names,
`/api/invoices` and `/api/ap/bills` keep their paths, and
`invoice.issued` stays an event name — by the same precedent that kept
the demo slug `world-nike` and `/api/purchase-orders` under a screen
that says "sales order". An address is not a word anybody reads.
