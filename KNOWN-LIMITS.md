# Known limits

Every shortcut and every untested path in the job twin, said plainly.
Started 2026-10-12. Each domain writes its own section and never edits
another's (`OPEN_TO_BUILDERS` in `src/lib/domains.ts`).

## The twin's door — etyme-architect

What is built: the role contract, the ledger, the approval route, the
rule set, the nightly run. What is short of that:

1. **The screens are built; nothing has walked them as every desk.**
   `/dashboard/twin` (the picture, the questions waiting, the feed and
   its CSV export), `/dashboard/twin/contract` and `/dashboard/twin/rules`
   exist and were screenshotted as the Northbend program manager only.
   No page test reads them; the founder's rule allows no new test file.
2. **The Teams door is built and has never met Teams.** Conversation's
   bot route (`POST /api/teams/messages`, ee4393f69) checks the Bot
   Framework token, binds the account to a live seat and sends every
   Approve or Reject to `POST /api/twin/approvals/:id`'s own door with
   surface TEAMS. Until the founder's three bot keys are set in Vercel and
   the app is sideloaded, every post is refused and `/ready` reads the
   Teams bot row MISSING; the web's Waiting for you is the door meanwhile.
3. **The event stream can carry the twin and the twin emits nothing into
   it.** `lib/events` writes `actorTwinKind` when asked, and the access
   log carries the twin since regulatory's 49ca56cd4. No twin act calls
   `lib/events` yet, so a subscriber hears nothing the twin does.
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

14. **The program owner's twin page reads the program's numbers from the
    desk's own routes** (`/api/program`, `/api/tenure`). A seat that may
    read the ledger and not those routes reads a dash with the reason, not
    a zero. "Time-limit risks" is warnings plus people past the limit, as
    `/api/tenure` counts them, not the twin's own ledger.
15. **The feed is the last 200 entries.** The CSV export is what the page
    holds — the ledger as the reader may read it, at most 200 rows. A
    full audit export over a date range is a route that does not exist.
16. **A client's other desks now read the whole program's entries,
    without what the rules found** (view PROGRAM), where the door said
    only entries on their own authority. CLAUDE.md says "a client its
    program", and the AP clerk who answers the twin read nothing before.
    A hiring manager and a viewer hold none of the three desks the route
    asks for and are refused in a sentence.
17. **A mismatched receipt cannot be rejected on the twin's page**,
    because it is never put up for approval (5 above). The demo's
    "reject the mismatch" step reads the twin's flag in the feed instead;
    see `DEMO.md`.
18. **Edits of the contract and the rules are read into the feed from
    the automation log**, not written as twin ledger entries, because an
    edit has no tier and `TwinAction.tier` is required. Only the program
    owner's view shows them, and the export carries them.
19. **The conversation panel is found by webpack's listing of
    conversation's folder** (`require.context`), so the page builds
    whether or not it has landed. The nightly digest is a plain dynamic
    import inside a try: a module that will not load reads ABSENT, one
    that throws reads FAILED and is reported, and a digest that went by
    email rather than the bot is counted as a fallback, never as Teams.
20. **`TeamsConversation` has a table and no writer of the
    architect's.** Conversation's bot binds and reads it.

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

## Teams door — etyme-conversation

What is built: `POST /api/teams/messages` (the bot), the identity
binding, the invoice approval card, the time-limit card, the nightly
digest `tellProgramOwnerOnTeams(companyId)`, the app package and
`docs/teams-setup.md`. What is short of that:

1. **No Bot Framework SDK.** `botbuilder` was asked for and not added:
   `package.json` is shared and changes through the architect. The bot
   speaks the protocol directly instead — the token check (published
   keys, issuer, audience, expiry, serviceUrl, channel endorsement) in
   `lib/teams/auth`, and the connector's REST calls in
   `lib/teams/connector`. Swapping the SDK in later changes those two
   files.
2. **Never run against a real tenant.** Every piece is tested by shape
   or by a token signed in the test; nothing has posted to Teams, and
   `/ready` will say so until somebody answers a card there.
3. **Identity is the member as Teams reports it, not an SSO token
   exchange.** The bot reads the sign-in name back from Teams with its
   own token (`getMember`) and matches it to `Person.primaryEmail`. A
   true single sign-on exchange needs an OAuth connection on the Azure
   Bot and `webApplicationInfo` in the manifest; neither is set up.
4. **The tenant is not checked against the company.** A tenant can only
   issue sign-in names on domains it verified, so the address is the
   check. Etyme stores no Entra tenant id per company to compare with.
5. **Single-tenant registration.** `docs/teams-setup.md` registers the
   bot in Etyme's own tenant. A client in another tenant needs a
   multi-tenant registration (or the client's own), which Azure now
   discourages for new bots. Decide before the first client installs it.
6. **The binding is re-made on every activity**, one connector call
   each, so a revoked seat stops at once. No cache.
7. **Acknowledge records nothing.** It answers "Nothing on the record
   changed" and is true. There is no twin act for an acknowledgement;
   if the founder wants one in the ledger, it is an act in
   `TWIN_ACTS` (architect) and one line here.
8. **Escalate opens the person in Etyme** unless the twin has asked
   about writing to the supplier — which the nightly run does not yet do
   (the architect's item 6). So in the demo Escalate is a link.
9. **The program owner is never shown an Approve button.** The approval
   door refuses the person on whose authority the twin asked, and the
   twin asks on the program owner's. So invoice receipts go to the
   people holding the desk the question needs (the AP desk), and the
   program owner's card carries the time-limit risks. One card per
   person, not one card to the owner, on purpose.
10. **A digest item is said twice at most** — when it appears and two
    days before an invoice receipt is due. What was said is read off the
    digest's own notice rows (`entityId` `twin-digest:<company>`), the
    way `cron/watch` does. A receipt with no due date is said once.
11. **Contractor names on a card are not on the access log.** The card
    reads the invoice receipt's lines through money's verdict, which
    logs nothing; the time-limit card does log its person.
12. **No channel cards.** In a channel the bot only says to open the
    one-to-one chat, so amounts and names never reach a room.
13. **The card is replaced after an answer** only where Teams sends the
    card's own id (`replyToId`); otherwise the old buttons stay and a
    second press is refused by the door ("Somebody has already answered
    this.").
14. **Icons are a placeholder** of the three rising strokes, drawn for
    the package, not the brand kit's mark.

## The twin's conversation panel — etyme-conversation

- **The route is `POST /api/conversations/twin`, not `/api/twin-chat`.**
  `app/api/twin-chat` had no owner in `lib/domains`, so a file there
  fails `domain-ownership` on its commit; `app/api/conversations` is
  conversation's already. The pure answering (`ask.ts`) and the reads
  (`read.ts`) sit beside the route, on the `submissions/kind.ts`
  precedent.
- **The variance question reads the twin's recorded receipts, then
  re-runs the rule on each.** "This quarter" is the calendar quarter in
  UTC, by the day the twin recorded its verdict, not by the week the
  hours were worked. Clean and not-clean are today's reading, so a
  receipt fixed since the twin recorded it reads clean. One
  `invoiceVerdict` (a full three-way check) per receipt, capped at 200 —
  fine at a demo's size.
- **Hours over accepted counts accepted weeks only**, summed as
  billed minus accepted where billed is higher. Weeks nobody accepted are
  shown apart, never folded in, and a supplier with no accepted week
  reads "No week accepted yet" rather than zero. Hours under accepted
  are not shown.
- **Suppliers are grouped by display name**, because the verdict carries
  the name and not the id. Two suppliers with one name would share a row.
- **"What needs me" lists only the twin's own questions** (pending
  `TwinApproval`s this seat holds the desk for, never one asked on its
  own authority). Exceptions the twin told a desk about are in the
  ledger, not in this list. A supplier reading a client's twin gets
  none: the twin asks people at its own company.
- **"Approve 1" refers to the order of the list at the moment of
  asking**, re-read on every message. If a colleague answers one in
  between, the numbers move; the confirm card names the receipt, so the
  person sees which before pressing.
- **The model's reply is not checked for claims beyond the lines it was
  given.** It is labeled as the model's, its cited ids are kept only if
  they are real lines, and it cannot act. A check that each figure in
  the reply appears on a cited line is not built.
- **The variance table is a plain table, not `ListSurface`.** It sits in
  a chat bubble with a handful of rows; the invariant reads pages only.
