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

Regulatory's own list was sent in its report, which this file's author
did not receive. Seen in its code and to be confirmed by regulatory:

- The warning days were a typed default until the `RuleSet` table; the
  table and `ruleSetFor` now exist and `tenureWarnings` is called with
  the company's days by `src/lib/twin/run.ts`.
- `tenureWarnings` logs its reads under the program owner, because the
  twin is not yet an actor in the access log (see 3 above).

## Invoice rule — etyme-money

- `invoiceRulesFor` returns the default; `ruleSetFor` now exists and the
  nightly run passes the company's tolerance in.
- The founder has been asked whether two per cent should also clear
  payment. Until he answers, the tolerance decides only what the twin
  raises.
- `seedTwinInvoiceDemo` finds Northbend and Pinnacle by display name.
