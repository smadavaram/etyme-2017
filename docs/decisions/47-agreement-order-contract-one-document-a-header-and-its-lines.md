## Agreement, order, contract — one document, a header and its lines

A recurring confusion, settled here so nobody has to guess: **a sell
contract is not an order, and a buy contract is not an order either.**
Three layers, each answering a different question.

| Layer | The question it answers | Sell side | Buy side |
|---|---|---|---|
| **Agreement** | Are we allowed to trade at all? | `MasterAgreement` | `MasterAgreement` |
| **Order** | How much may be spent, on what, by when? | `WorkOrder` | `WorkOrder` |
| **Contract** | What rate, for which person, for how long? | `SellContract` | `BuyContract` |

Two sentences carry the whole distinction:

- **An order carries a ceiling. A contract carries a rate.**
- **An order is about money. A contract is about a person.**

### It was six, and one of them was two rows for one document

**Corrected 2026-09-17, by the founder, in two statements an hour apart:**

> Work order is not separate from PO — the client gives it to the
> supplier and it agrees rate, duration, resource and location of work.

> The PO on the client side is the sales order on the vendor side.

So the order layer is **one commercial document with three names**
depending on which end of it you stand at: the client raises a **purchase
order**, the supplier receives it as its **sales order**, and the trade
calls the whole thing a **work order**. The product modeled that as two
rows, `PurchaseOrder` and `SalesOrder`, and the two were not duplicates —
each carried what the other lacked, which is why neither could be deleted
without moving fields.

**Only the thin one was ever written.** Nothing anywhere had created a
`SalesOrder`, and three things followed from that, one of them costing
money every night:

- **Auto-approval of timesheets could never fire.** `cron/auto-approve`
  reads `autoApproveTimesheets` off the order. No order row existed to
  carry it, so the flag was false on every timesheet in the world and the
  nightly job approved nothing from the day it was written.
- **Milestone billing was unreachable**, and the Milestones screen was
  permanently empty for every user.
- **The four-party split was unreachable** — a client that signs in one
  entity, is billed through a shared service center, has the work done at
  a third site and pays from a fourth. The first thing a large enterprise
  asks for.

One row now: **`WorkOrder`**. The name is the trade's own and belongs to
neither end, which is the point — `lib/order-naming` decides what each
reader is shown, and nothing user-facing ever says "work order" to
somebody who is a party to it. The URL stays `/api/purchase-orders` and
the event stays `purchase_order.raised`, by the same precedent that kept
the demo slug `world-nike`: an address is not a word anybody reads.

### Corrected again, 2026-09-18 — one document, a header and its lines

The founder, the morning after the order merge:

> Sell contract (how sales documents flow from the upper layer to the
> company) and sales order (how money flows, the rules) are duplicated.
> Buy contract and purchase order are also duplicates. Master contract
> is something that links both for profitability analysis. We don't
> need a master contract if there is no budget profile — sell PO linked
> to buy PO or payroll.

He is right, and the section above over-defended a split that is real
in the tables and wrong in the product. The evidence is in the schema:

- **Six fields are carried on both rows** — `billFrequency`,
  `billAnchor`, `billStraddle`, `paymentTerms`, `startDate`, `endDate`
  sit on `WorkOrder` *and* on `SellContract`, and nothing reconciles
  them. `BuyContract` repeats the set against its own `workOrderId`.
  Two places for one fact is one wrong number waiting.
- **The award still never sets `workOrderId`.** A person awards, a
  contract appears, no order is raised or required. That is the exact
  symptom of a duplicated object: one half is never written, and it
  took a seed audit to notice that `WorkOrder` had zero rows for the
  life of the product.
- **`SellContract` has four optional parents** — `msaId`,
  `engagementId`, `workOrderId`, `projectOrderId` — four different
  attempts at "which deal is this part of."

**The resolution — and the swim-lane drawing already had it before the
prose did:** a purchase order is a **header and its lines**.
The header is the commitment to a counterparty — who, ceiling, dates,
terms, the four partner functions, whether silence approves a week. A
line is one person at one rate at one site. There is no "buy contract"
beside the order's line; the line *is* the contract for that service,
and the timesheet receipt posts against it. The sell side is
the mirror: a sales contract as the header, sales order items as the
lines, one item per worker.

So the words change and the two rows stay:

| The trade says | The row | What it is |
|---|---|---|
| **Purchase order · sales order · work order** — one document, three names | `WorkOrder` | the **header**: counterparty, ceiling, dates, terms, partners |
| **a line on it** — this person, this rate, this site | `SellContract` / `BuyContract` | the **lines**: per person, carrying the rate and everything that hangs off a person |

**What a line does — the founder, later the same morning:**

> Sell contract will bill customer. Buy contract will pay supplier or
> run payroll for candidate.

That is the reason the lines stay rows: **each is the source of one
direction of money.** The sell line is what the firm bills from — it
carries the bill rate and the hours the customer signs, and AR raises
the bill against it. The buy line is what the firm pays from — to a
supplier by invoice receipt where a sub-vendor is below, or to the
candidate by payroll where the firm employs them — and `cyclesFor` in
`lib/cycle-kinds` already writes vendor-bill or salary cycles on exactly
that split. The header carries the ceiling and the terms; a line carries
a rate and moves money one way.

It is also why "sell contract" and "buy contract" are the founder's own
words and may appear on a screen — **as lines of a document, never as a
document of their own** with a page, a number and a flow beside the
order. A screen that offers "New sell contract" as a thing to create
standalone has reintroduced the second document.

**What this fixes, in order:**

1. **One document on every screen, created once.** The award writes the
   header and its first line together. A single-person deal — most of
   them — is a header with one line, and the person never meets two
   things. Five people on one PO is one header, five lines. A W2 is a
   line whose header is the firm's own, with no external number,
   because you do not raise a PO to your own employee; an employee is
   a person on the payroll, not a vendor.
2. **Four of the six fields are the header's; the two dates are the
   line's.** Corrected by `etyme-money` on 2026-09-19 against the
   seeded world, and ratified. The billing rhythm and the net days —
   `billFrequency`, `billAnchor`, `billStraddle`, `paymentTerms` — are
   read from the document the line is on, because a line's own copy
   cannot report its silence: those columns carry schema defaults, so
   `MONTHLY` on a line may mean "agreed" or "nobody asked", and a value
   that cannot say it did not say must not beat one somebody typed.
   **`startDate` and `endDate` stay the line's**, because a line is a
   person and an order is not — a line's start is never a default, it
   is the day *this person* starts. The header's window is *reported*
   beside the line's dates and never applied: twenty-nine seeded lines
   end a month to a year before their order does, on purpose, because
   an order that closes the day the work does cannot carry the final
   invoice, and reading the header's dates onto them would have billed
   a fortnight's placement for thirteen months. A line outside its
   order's window is a sentence on the screen, not a correction.
   `lib/money/order-terms` is the one door (`termsFor`, side explicit),
   and `terms-through-one-door.test.ts` fails on any reader in any
   domain that decides a period from a line's own copy.

   Two things the work surfaced, written down so they are not
   rediscovered: the header and the line did not even share a
   vocabulary for the same four fields — `CONTRACT_START` against
   `CONTRACT`, `TO_LATER` against `END` — which is its own evidence
   nothing had reconciled them; the helper translates, and one
   vocabulary is an enum change for the architect. And `billFrequency`
   decides what an *invoice period* is and nothing else: cycle dates
   come from the template pack, so a header that says WEEKLY does not
   yet move an hours-due or a pay day. Making the document's rhythm
   reach the cycle dates is real, separate money work, documented in
   `lib/contract-cycles`.
3. **The MSA is the legal umbrella and nothing more, and it is
   optional.** No route requires one today; `Engagement.msaId` is the
   one hard dependency and it becomes optional too. A client that sends
   one PO and a contractor should never be made to paper an agreement
   first. "We don't need a master contract if there is no budget
   profile" is exactly right.
4. **The thing that links sell to buy for profitability already
   exists, and it has a name — the 2017 one.** It is `ContractLink` (a
   sell line joined to the buy line that funds it) settling into
   `ProjectOrder` (the roll-up). The founder calls the roll-up the
   **master contract**, and that is what a screen calls it. See "The
   master contract" below.

**What survives from the argument above**, restated as header and
lines rather than as two objects: an order still carries a ceiling and
a line still carries a rate; a header still covers five people where a
line covers one; a W2 line still has no external PO. Those were true.
They were reasons to keep two *rows*. They were never reasons to show
two *documents*, and the section read as if they were.

### The master contract — the 2017 word, kept, and made optional

The founder, on where the two lines came from:

> Our original contract form in Etyme-2017 had these both under one
> form under master contract, but now we are splitting them and letting
> companies tag them to master contract if they want to see contract
> profitability.

The archive (`763c6f57`) bears it out exactly. `LEGACY_RULES.md` §2.1:
a single `Contract` was *"the master container"*, polymorphic on a
Company or a Candidate, and every one spawned two children — a
`SellContract` holding `customer_rate` and a `BuyContract` holding
`payrate`, numbered `SC_` and `BC_`. The 2018 migration then flattened
both onto **one row** — `customer_rate` beside `payrate`,
`buy_company_id`, `b_time_sheet`, `b_show_accounting_to_employee`, the
`b_` prefix marking the buy side — so margin was a subtraction on the
row. A child's invoice created its parent's: *"margin = parent total −
child total"* (§4). That is the form he means.

**So "master contract" is the trade's word — this trade's, since 2017
— for the profitability roll-up, and it is kept.** What changes is that
it is no longer the container every contract is born inside. The lines
come first; the master is a tag.

| Level | The word | The row | Optional? |
|---|---|---|---|
| a sell line and the buy line that funds it | **the pair** — a placement's own margin | `ContractLink` | no — written by the award, because a buy line always pays for some sell line |
| several pairs a company reads as one deal | **master contract** | `ProjectOrder` | **yes** — a company tags lines to one when it wants to see contract profitability; `projectOrderId` is nullable on both lines |
| the legal umbrella between two firms | **agreement · MSA** | `MasterAgreement` | yes, since this morning |

**Two words, never confused on a screen.** `MasterAgreement` is shown as
"Agreement" or "MSA" today — thirteen and two occurrences, and "master
agreement" spelled out nowhere — and it stays that way. "Master
contract" is the roll-up and nothing else. A screen that puts "master
agreement" beside "master contract" has made two things sound like one.

**What is already built, and what is not.** `ProjectOrder` exists,
carries `budgetCents` — the founder's "budget profile" — and a kind
(time-and-materials, fixed price, milestone, retainer). `orderFor` in
`lib/order-postings` groups lines into one **by engagement**, so six
consultants on a project share a bucket, and every posting settles into
it. What is not built is the name a person recognizes, and the
**choice**: today the system decides the grouping, where the founder
wants the company to tag a line to the master it belongs to — or to
none. That is `etyme-money`'s screen work after the current pieces land,
and it needs no schema.

**What 2017 got wrong, stated so it is not rebuilt.** The master was
mandatory, so a firm recording one contractor on one PO had to paper a
container it did not want. And the propagated invoice let the parent's
rate and the child's total disagree with the hours between them. Etyme
bills each rung on the same signed hours through the chain instead, and
the master *reads* what was posted rather than creating anything.

**Sequencing.** This is a schema move and queues through
`etyme-architect`. The cheap half — award creates the header, the six
fields stop being written to lines, the screens show one document with
lines, `Engagement.msaId` goes optional — needs no table dropped and
should go first. Whether the tables themselves merge afterwards is a
question to answer with a paying client's data in the system, not
before.

### Billing and paying follow the agreement between each pair — decided by the founder, 2026-10-18

*"AR and AP is always based on the agreed MSA between client and
supplier and supplier and subvendor/candidate."* So every rung bills and
pays on its own agreement, never on a rule the platform sets:
- **What a firm bills upward** (AR) follows its agreement with the firm
  above: the client and the prime, the prime and the sub-vendor.
- **What a firm pays downward** (AP or payroll) follows its agreement
  with the party below: the sub-vendor's agreement, or the candidate's
  own contract or employment agreement.
- **The terms are the agreement's**: when a bill is raised, the period it
  covers, the net days and what they run from, the currency. A twin that
  drafts a bill drafts it on that agreement's date for that agreement's
  period, and never earlier than the week was signed above.
- **Built the same day:** every term — rhythm, net days, what they run
  from, currency — is read agreement first (`agreementFirst` in
  `lib/billing-cascade`, `termsFor` in `lib/money/order-terms`); the order
  and the line differ only with a recorded reason. The supplier's twin
  drafts a bill the day after the agreement's billing period ends, from
  weeks signed above, through the Bills page's own generator, and asks
  for a yes to send it (`lib/money/supplier-bills`). It acts on the
  Owner's authority, so Accounts Receivable, Finance or Admin say the yes
  (coordinator's call, reversible).
- This qualifies "the MSA is optional" above: where two parties signed
  no separate MSA, the order or the contract between them is their
  agreement, and its terms govern the same way.
- **The agreement sets the terms; an order or a placement may differ
  only with a reason recorded** (founder, the same day: "go with your
  recommendation, build it"). A one-off deal still works, the reason and
  who gave it sit beside the term, and the screen says which document set
  each term. A difference with no reason is refused in a sentence.
- **Built in this order:** the rhythm onto the agreement and the reason
  on a difference (architect); one cascade, agreement first, read by
  billing, paying and the twin (money); the supplier's twin drafting the
  bill on the agreement's date for Accounts Receivable to send, and a
  sent-back bill landing as a card (money, conversation); then Ask Etyme
  for workers.

**Four decisions on the founder's "go with your recommendations",
2026-10-19**, each reversible in a sentence:
1. **An expense is accepted like a week.** The worker's employer approves
   it for reimbursement; each firm above accepts it before it pays it,
   the client first and then down the chain, nobody accepting their own;
   whether a kind of expense is billable comes from the agreement between
   each pair, not from the supplier's own flag. Today only the firm that
   raised the expense approves it, and the payer never does; that is the
   gap this closes. Schema: an acceptance per firm on the expense, and
   billable kinds on the agreement (architect), then money.
2. **Where nobody but the Owner sends bills, the Owner may say yes to
   the twin's bill in Ask Etyme.** "Nobody signs their own" protects money
   going out; a bill is a request for money coming in, and the Owner is
   reviewing the machine's draft, not their own work. The exception
   applies only when no other seat at the firm holds `invoices.issue`,
   and the ledger records that it applied. Anywhere a second person
   exists, that person says yes and the Owner still cannot.
3. **A sub-vendor's overtime is priced on the decision made when the
   client signed the week**, carried down the chain the way the hours
   already are; never on the sub-vendor's own contract alone.
4. **On a cut week, a sub-vendor's invoice loses overtime first**, the
   same as every bill, because to the firm paying it, it is a bill. The
   worker's own pay keeps the pay rule, which since 2026-09-30 is:
   overtime only on the accepted hours above the line by default, and
   "keep the week's overtime" (ordinary hours cut first) as a setting
   the paying firm may choose, recorded with who and why. (Corrected
   2026-10-20: the first version of this line said the worker's pay
   "keeps the opposite rule, ordinary hours first", which was the
   2026-09-29 default that 2026-09-30 superseded; the simulation found
   the two lines disagreeing.)

**And the privacy notice and DPA name the saved Ask Etyme conversation**
(founder, the same day, "go with your recommendations" on the lines
shown to him): a row in sections 3 and 10, four words in section 11,
two cells of the DPA's section 3, "Last updated" October 19, 2026 — a
fact correction, nothing else moved.

### Why collapsing the layers still breaks real cases — read now as header and lines

**A sell contract is per person; an order is not.** One order for a
five-person project produces five sell contracts. That survived the merge
unchanged and is the reason the order layer exists at all — treating them
as one object makes a five-person project impossible to bill as one
commitment.

**A buy contract to a W2 employee has no order.** You do not raise a
purchase order to your own employee. This is the clearest proof they are
different things: `BuyContract.workOrderId` is nullable precisely because
roughly half of all buy contracts have none. Where there *is* a
sub-vendor, the buy contract and the order describe the same commercial
relationship from two angles — the contract carries the rate, the order
carries the ceiling it draws down — and linking them stops the two
records disagreeing.

**An order belongs to whoever pays.** `WorkOrder.issuedById` is the
buyer, which is why one model serves both directions:
`SellContract.workOrderId` is the *client's* order authorizing spend with
us; `BuyContract.workOrderId` is *our* order authorizing spend with a
sub-vendor. Same model, opposite direction, and which direction a reader
is looking from decides whether the screen says "purchase order" or
"sales order".

### And the two that are neither

- **`Engagement`** — the project or statement of work under an
  agreement. Groups several people and several contracts.
- **`ProjectOrder`** — the cost object that accumulates actual revenue
  and cost. Not a commercial document at all; nobody signs one. See the
  note on `InternalOrder`, which is the client's own coding and an
  interface value only.

### The invariant that is not yet enforced

A `BuyContract` with `contractType: W2` and a `workOrderId` set is a
contradiction — a purchase order raised to an employee. `POST
/api/contracts` refuses it on the way in; nothing refuses it on an
update. It belongs in `etyme-money`'s next piece of work.
