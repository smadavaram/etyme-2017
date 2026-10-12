# Known limits

Every shortcut and every untested path in the job twin, said plainly.
Started 2026-10-12. Each domain writes its own section and never edits
another's (`OPEN_TO_BUILDERS` in `src/lib/domains.ts`).

## The twin's door — etyme-architect

What is built: the role contract, the ledger, the approval route, the
rule set, the nightly run. What is short of that:

1. **Nothing to click.** There is no screen for the ledger, the
   questions waiting, the role contract or the rule set. The routes
   answer; no page calls them. The matrix row L3.7.6.1 says PARTIAL for
   this reason.
2. **No Teams card and no bot route.** `POST /api/twin/approvals/:id`
   is the one route Teams will call, and it takes `surface: "TEAMS"`, but
   it asks for a signed-in session. A card answered from Teams needs the
   bot adapter, and the identity binding from the Teams user to the
   Etyme seat. Neither exists.
3. **The twin is not yet a named actor in the access log or the event
   stream.** The columns exist (`AccessLog.actorKind`,
   `AccessLog.actorTwinKind`, `Event.actorTwinKind`). Nothing writes
   them, because the writers are `lib/access-log` (regulatory) and
   `lib/events` (conversation). Until they carry the twin, a read the
   twin makes is filed under the program owner with the twin named only
   in the reason, and the twin emits no events.
4. **Approving an `Invoice` writes no state on the invoice.** A receipt
   keyed in as a `VendorBill` moves from RECEIVED to APPROVED, which is
   what a payment run reads. An `Invoice` a supplier sent through Etyme
   has no approved-for-payment state, so a yes is the ledger entry and
   the approval row; the payment is still recorded on the AP desk, which
   runs the three-way check again. Money to decide whether that state
   should exist.
5. **A mismatched receipt is told, not put up for approval.** The
   coordinator asked for approvals on clean and mismatched receipts. A
   mismatch fails money's three-way check, which the approval re-runs,
   so its only possible yes is refused. The run tells the paying desk
   instead. A clean receipt that the check would still not pay (inside
   the tolerance, outside the exact hours) is recorded and nothing more.
6. **A supplier is not yet told about a breach.** The act
   (`tenure.warning.notify_supplier`, needs approval) and its performer
   exist and are tested through the door, but the nightly run does not
   call it: the tenure rule gives supplier names, not supplier ids.
7. **The approval notice goes in the app.** `tellTheDesk` writes an
   in-app notice to up to ten people at the desk. No email or Teams
   delivery is asked for, so somebody who does not open Etyme does not
   hear.
8. **A program office in a seat reads nothing here.** `ledgerFeed`
   scopes by the reader's own company. An MSP seated in a client's
   program (`ProgramSeat`) is a stranger to that client's twin until the
   feed resolves seats the way `lib/money/seated-books` does.
9. **The authority is the first Program Manager found.** With two seated,
   the twin acts on the authority of one of them, chosen by id. With
   none, it acts on the role alone, and every notice to the program
   owner is refused in the ledger with the reason.
10. **A refusal carries no finding key, on purpose,** so a finding refused
    tonight is tried again tomorrow. A refusal that recurs every night
    writes an entry every night.
11. **The tests are the two files the founder allowed, against an
    in-memory record**, not Postgres: `__tests__/invariants/twin-role-contract.test.ts`
    and `twin-ledger.test.ts`. Untested against a database: the
    transaction rollback, the unique finding key under a race, the
    nightly run end to end, and every route. The schema change is
    exercised only by `__integration__/client-programme.test.ts`
    building the template.
12. **The approval route is not limited by a desk-less seat's door
    either way.** A seat with no desk is refused at the shared door
    (`lib/deskless-door`) on every `/api/twin` route, including the
    ledger entries made on its own authority.
13. **`partyCompanyIds` has no index.** A supplier's feed is a filter on
    an array inside one client's rows. Fine at a demo's size; an index
    (GIN) is the change when it is not.

## Time-limit rule — etyme-regulatory

What is built: `src/lib/twin/rules/tenure.ts` reads the client's own time
limit and break, every supplier's lines at the client, and names the
people 90, 60 and 30 days from the limit and those past it. The warning
days come from the company's rule set (`ruleSetFor`), and every person
read is on the access log under the program owner and the twin's kind
(`TWIN`, `PROGRAM_MANAGER`). What is short of that:

1. **The database half is untested against Postgres.** The arithmetic is
   tested in `__tests__/invariants/twin-tenure-rule.test.ts`, and the
   read and its access-log rows against an in-memory record. The query
   itself — the end-client filter, the states, a chain's rungs — and the
   demo person landing 60 days out on a seeded world are not run against
   a database by any test of this rule.
2. **One time limit per client.** The rule reads the first active
   TENURE_CAP and BREAK_IN_SERVICE rule it finds across the client's
   policies, in no stated order. A client with a different limit per
   business unit or per site is warned on one of them, and which one is
   not chosen on purpose.
3. **A line that was not running is not counted.** Only IN_PROGRESS,
   PAUSED and ENDED lines are read. A line CANCELLED after work started
   drops the days already worked, so the count can read low; a VERIFIED
   line that starts next week is not read, so somebody away who is about
   to come back past the limit is not warned until they are on site.
4. **One person is one `Person` row.** Days are added up by person id.
   The same human entered by two suppliers as two records is two short
   stays, and neither is warned. Cross-supplier identity resolution is
   not done here, and no probable match is raised for a person to
   confirm.
5. **Suppliers are named, not identified.** A warning carries the names
   of the firms the client pays, never their ids, and a sub-vendor's
   name not at all. That is why the run cannot yet tell a supplier
   (architect's item 6): the act needs the firm's id, and the rule must
   still never hand a sub-vendor's name to the client.
6. **The eighteen-month default is a product default, not a law.** Where
   a client set no time limit the rule warns against eighteen months and
   says "default" in the citation. A client that wants no limit at all
   has no way to say so through the rule set; only a caller passing
   `capMonths: null` turns it off. A warning keyed to a limit day also
   repeats its tier if the contract dates move that day.

## Invoice rule — etyme-money

- **The tolerance decides what the twin raises, not what is paid.** A
  receipt two per cent over is CLEAN to the twin and still fails the
  three-way check's QUANTITY, so it carries `payable: false` and the AP
  desk records the difference with a reason before it is paid. Whether
  two per cent should also clear payment is put to the founder, not
  decided here.
- **`seedTwinInvoiceDemo` finds Northbend and Pinnacle by display name**,
  not by slug or id. A renamed demo company seeds no receipts and says
  nothing.
- **`pendingReceiptsFor` runs `matchInvoice` once per open receipt**,
  capped at 500 a company, and lists ISSUED and HELD receipts beside
  submitted ones. Fine at a demo's size; a batched match is the change
  when it is not. An ISSUED or HELD receipt is not payable, and the
  payment gate (below) says so.
- **Resolved 2026-10-12:** `invoiceRulesFor` now reads `ruleSetFor`, so
  a company's saved tolerance is the one the rule uses.
- **An `Invoice` has no approved-for-payment status, on purpose
  (2026-10-12).** On a supplier's `Invoice` the match is the approval:
  `payGate` in `lib/invoice-match` is the one gate, read by the AP
  desk's payment door and offered to the twin as `mayPayInvoiceReceipt`.
  A twin's yes is a ledger entry over that gate's answer and moves no
  status. **No payment run reads an `Invoice`:** `PaymentRunItem` names a
  `VendorBill` only, so a supplier's own invoice is paid one at a time
  through `POST /api/invoices/:id/payments`. Batching them is a schema
  request (an optional `invoiceId` on `PaymentRunItem`), not made until a
  client asks.
