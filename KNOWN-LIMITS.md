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
19. **The conversation is Ask Etyme, not a panel on this page.** The
    twin's page carries one line to it (`/dashboard/conversations/etyme`),
    and the sidebar draws "Ask Etyme" above the sections wherever a menu
    has Conversations. The chat page is conversation's; until it lands,
    the line and the menu entry open a page that does not exist. The
    nightly digest is a plain dynamic import inside a try: a module that
    will not load reads ABSENT, one that throws reads FAILED and is
    reported, and a digest that went by email rather than the bot is
    counted as a fallback, never as Teams.
20. **`TeamsConversation` has a table and no writer of the
    architect's.** Conversation's bot binds and reads it.
21. **The supplier half of `cron/twin` now calls the Teams digest, and
    the digest has nothing to say to a supplier yet (2026-10-18).** Each
    supplier firm gets `tellOnTeams` after its bill run, counted per
    firm as bot, fallback or nothing, the same as a client program. But
    `lib/teams/digest` (conversation's) knows only invoice receipts and
    the time limit, so for a supplier every row reads NOTHING and no
    message is sent: a `bill.send` question is in Ask Etyme only. The
    change the digest needs, for etyme-conversation:
    - `digestFor` reads a third list: `TwinApproval` rows PENDING whose
      `twinAction.action` is `bill.send`, filtered by the same
      `mayDecide` (holds `needsPermission`, i.e. `invoices.issue`; is
      not the authority the twin acts for; did not ask for it). Keys
      `bill:<approvalId>` and a last call `bill:<approvalId>:due`.
    - Facts per row, the same as the Ask Etyme card (`ask.ts`/`read.ts`):
      customer, period, hours, amount, due line. A `billSendFacts` in
      `lib/teams/facts` and a `billTitle` and a row in `digestCard` in
      `lib/teams/cards`, with Send bill and Not now as `Action.Submit`
      carrying the approval id — answered only through `decideApproval`
      with surface TEAMS, exactly as the invoice card is; Not now on a
      bill is a recorded no with its reason, as on the web.
    - `tellProgramOwnerOnTeams` adds the desks holding the pending
      `bill.send` approvals' `needsPermission` to the people it sends
      to (it reads `INVOICE_APPROVE` only today); `digestHeading` counts
      bills.
    No other Teams path writes state; nothing here adds one.

## Staff bootstrap — etyme-architect (2026-10-14)

1. **`POST /api/staff/bootstrap-company` exists because production has no
   email key.** Sign-up confirms an address by email and an invitation is
   an email, so neither works there. Staff hold the one-time links and
   must hand each to its person privately; once the key is set, seats come
   in through Users & permissions and this route is not needed.
2. **The domain is verified on staff's word**, not by an identity
   provider (`CompanyDomain.verifiedVia = 'STAFF'`), and the log says so.
3. **It is not one transaction.** People, the company and the seats are
   written in turn. A failure part-way leaves what was made; running it
   again finds it and adds only what is missing.
4. **Untested against a database.** The rules are tested as a plan
   (`planBootstrap`); the writes are exercised only by running it.

## The sample seat and the home page's frame — etyme-architect (2026-10-14)

1. **A refused write is answered and not written to the access log.** The
   log's actions are a named list in `lib/access-log` (regulatory's), and
   none of them is "a write refused to the sample". A refused write reads
   nobody, so the read invariant holds; the trail of who tried is what is
   missing. Asked of `etyme-regulatory`: a `SAMPLE_WRITE` action, after
   which `sampleCaller` in `lib/api-context` records it before the 403.
2. **A stranger's reads are logged as the program manager's.** Every read
   the sample seat makes is filed under Lorena Kellerman as a PERSON, so
   Northbend's access log cannot tell her from the public. A `SAMPLE`
   actor kind beside PERSON and TWIN is the fix, also regulatory's.
3. **The full demo door still writes to the seeded world.** `POST /api/demo
   {"as":"world-nike"}` seats a stranger at the real seeded desk with every
   permission. Only the sample seat is read-only; "nothing a stranger does
   can touch the seeded world" is true of the frame, not of that door.
4. **A GET that writes is not caught.** The door refuses every method but
   GET, HEAD and OPTIONS; a route that changes state on a GET would change
   it for the sample too. The five screens' reads were checked against the seeded world; the
   other routes were not, and the access log is written on reads by design.
5. **The screens are the dashboard's rows, drawn again.** The dashboard
   pages fetch in the browser after load; the frame calls the same routes
   on the server and draws its own compact markup, so the numbers agree
   and the layout is the frame's.

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

- **The tolerance decides what the twin raises, not what is paid.** The
  default is 0.5% (founder, 2026-10-12), and a receipt at or under it is
  CLEAN to the twin. It still fails the three-way check's QUANTITY, so it
  carries `payable: false` and the AP desk records the difference with a
  reason before it is paid. **Decided** (CLAUDE.md, "Nine decisions", item
  3): payment stays strict; a payment tolerance is a setting a client asks
  for, with its reason beside it.
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

### A typed-in invoice receipt (`VendorBill`) — etyme-money, 2026-10-18

The intake, the exception queue, the payment and the payment run ask one
check (`checkKeyedReceipt`, gate `keyedPayGate` / `mayPayKeyedReceipt` in
`lib/money/keyed-receipt`). Since the second piece the same day a receipt
may be typed in with lines (a week, an approved expense, an accepted
milestone, matched by `threeWayMatch` like a platform invoice), a
difference may be waived with a reason on the platform's rules
(`/api/ap/bills/[id]/match/override`, void once the total changes), a
payment writes a `Payment` row naming the receipt (left out of every
receivables view), a released payment run writes one per receipt, and a
mis-keyed receipt is cancelled through `/api/ap/bills/[id]/cancel`. What
is still short, each refused rather than guessed:

- **A receipt typed in as a total is checked on its total.** Hours and a
  rate typed on the receipt as a whole are not stored, so at payment it is
  held to the accepted hours at the agreed rate, to the cent, and nobody
  may waive that. To waive an hours difference, record it with lines.
- **An overtime premium on a typed-in line** is priced only where it can
  be read without a guess: the supplier bills the payer on the platform
  (`BuyContract.supplierSellContractId`), the week has an overtime decision,
  and the payer accepted the whole week — then exactly as that supplier's
  platform invoice would be priced (`recompute`). Where the supplier is
  not on the platform, or the payer accepted fewer hours than an overtime
  week's, a line asking for a premium fails the arithmetic, which nobody
  may waive. **For the founder:** on the pay side, is a supplier's
  overtime premium the supplier's own contract terms (as on the
  platform), the payer's `BuyContract.overtimeMultiplierBps`, or the
  decision the client's signer made at the top? And on a cut week, does
  the payer's cut come off overtime first (the billing rule) or ordinary
  hours first (the worker's pay rule) when the payer is paying a
  sub-vendor rather than a worker?
- **A rate change inside one week** cannot be stated as one line at one
  rate; such a receipt is refused with a sentence asking for it to be
  recorded as a total, which is priced day by day.
- **No edit door.** A receipt's total or lines change only by cancelling
  it and typing the corrected one in again. The waiver's "void if the
  total changes" holds for any writer, so it is ready for one.
- **Cancelling does not reopen the "invoice receipt to record" date** the
  receipt closed. A receipt typed in again for the same period closes no
  second date (it would have closed the next period's), so the date stays
  closed through the correction, which is the right end state.
- **Expense approval is one status across the chain** — an expense line
  is paid against `Expense.status` APPROVED, not against the paying firm's
  own acceptance of it. Waiting on the founder; not built.
- **Two receipts for one week let in before 2026-10-18** are paid once:
  the one recorded first, or the one already part paid; the other is
  refused at payment and left out of a run.

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

## Ask Etyme (was the twin's conversation panel) — etyme-conversation

- **The thread is kept, one per seat, since 2026-10-19.** Every question
  and its answer are saved on the seat's own thread
  (`lib/ask-etyme-thread`, the architect's door) and drawn again after a
  reload, a phone switch or a sign-out, oldest first, with today's
  greeting under them as the newest message. **The greeting itself is
  not saved**: it is "what needs you now", rebuilt from the ledger on
  every load, and a saved one would be yesterday's queue with yesterday's
  cards. A card's yes, no or Not now is recorded on the line that drew
  it after the approval route answers, and the reply after a yes or a no
  is kept only where the record already shows that decision; a card in
  the greeting is on no saved line, so a Not now there lasts the page
  load, and the next greeting asks again. Clear starts over from the
  greeting; the old lines stay on the record and are no longer shown.
  "Show earlier" fetches up to 1,000 lines once; a longer thread shows
  its newest 1,000.
- **A seeded demo seat keeps no conversation, and says why once at the
  top of the thread**: every visitor who opens that desk is seated as
  the same seeded person, so a saved thread would show one stranger
  another's questions. The shared sample and an API key keep none
  either. A visitor's own demo sandbox, at their own address, keeps one.
- **Not yet in a person's data export, erasure or retention**: the
  saved thread is regulatory's to add (`lib/access-log`,
  `lib/erasure`, `lib/retention`), as the matrix row says.
- **Never beyond the transaction is a word test, by rule**
  (`app/api/conversations/twin/transaction.ts`). A free-text question
  is on the record when it uses a word of the trade the record holds
  (job, candidate, timesheet, bill, invoice, payroll, paperwork, the
  time limit and about a hundred more), carries a reference (an invoice
  number, a ledger id) or names a person or firm the reader may read.
  A short list of general asks (a poem, the weather, a capital city,
  code) and anything naming another company's book or a benchmark
  ("other companies", "market rate", "competitors", a firm named
  "… Inc" that the reader does not trade with) is refused in one
  sentence before the model switch is read. A question about the record
  in words the list does not hold is refused too, and the sentence says
  what to ask; "thanks" and "hello" are refused the same way.
- **The model's answer must cite a line it was given.** An answer with
  no `[id]` from the ledger lines sent, other than the one sentence for
  an act, is not shown: the person reads "I cannot answer that yet." and
  a link to the ledger. It is logged with purpose `ASK_ETYME_REPLACED`
  and "Not shown to the person: …" ahead of the masked text, so the
  company's prompt log shows it. A citation proves a line was read, not
  that every sentence came from it.
- **The pinned row says what Ask Etyme answers, not its last reply.**
  The last reply is saved now; drawing it on the Conversations list is
  not built.
- **"What did we spend by supplier this month?" counts invoice receipts
  by the day each was billed** (`issuedAt`, else `submittedAt`), in the
  UTC calendar month, never a draft, cancelled or void one, and only
  those the reader's company is asked to pay. It is not hours times
  rate. A receipt with neither date is counted in no month and the
  answer says how many there are. Two currencies are never added.
- **"Which weeks are unsigned?" is a client's question** — filed weeks
  the client has not signed, inside the reader's account walls, no
  supplier named because in a chain the week sits on a rung the client
  may not know by name. A supplier asking is sent to Timesheets in a
  sentence. A program office in a client's seat is not answered for the
  client yet; it reads its own company.
- **"Who is near the time limit?" reads the twin's own warnings in the
  ledger**, newest per person, with days counted from today to the day
  the warning names. A person whose contract ended after the warning
  stays listed until the next reading supersedes it; the answer says the
  day of the reading. Only the program owner's desks read it, as on the
  twin's page.
- **A name in a never-floor question** is matched against the people
  on this company's placements inside the reader's account walls (500
  most recent): the full name first, else a first or last name carried
  by exactly one person; two or more and Etyme asks which ("Helena Marsh
  or Helena Ruiz?"). A misspelling links to the list instead. A receipt
  is matched by its number.
- **Told, not asked** lists at most the 20 latest receipts the twin
  flagged, read again now; one corrected, waived or paid since drops off.
- **The greeting's recommendation is a card with links, not a button.**
  "Ask Renata Okafor, AP Clerk, to approve …" names who holds the desk,
  read from the seats; the prototype's "she is on today" is not on the
  record (nobody's presence is), so it is not said. Sending her the ask
  would be a new act kind in the role contract first (week 3).
- **"Checked just now" is true per answer**: variance and the told line
  run the three-way check on each receipt at the moment of the question,
  and the time limit runs the tenure rule live. A nightly verdict the
  live check overturned is said once, for 36 hours after the night it
  was recorded, and not after.
- **Variance now reads every invoice receipt billed in the quarter**,
  not only the ones the nightly run recorded, at most 200 per question.
  It is read at the paying company only; a supplier is refused with the
  door.
- **Zero retention is not set by the code.** The provider client in
  this repository (`@anthropic-ai/sdk` 0.117.1) has no per-request
  no-retention option or header, so none is sent. Whether the provider
  keeps nothing depends on the organization's agreement with it, which
  is the founder's to arrange and is not verified here.
- **Masking knows names from the record, not from their shape**
  (`newMasker` in `app/api/conversations/twin/mask.ts`). It masks the
  people on the reader's company's placements and seats, the firms it
  trades with, and its own name. A name typed into a question that is
  on none of those leaves as typed. A first or last name alone is
  masked only when written with its capital; a common word in a firm's
  name ("Systems", "Staffing") is not masked on its own. Figures are
  masked by pattern: a currency amount, a rate per hour, day, week,
  month or year, and a percentage beside margin, markup, fee,
  commission, discount or spread. A percentage elsewhere (the 0.5%
  tolerance) leaves as written.
- **The map lives for one request.** Nothing stores it; the log gets
  the real values only so it can refuse a text that still holds one.
- **The prompt log keeps the masked question and lines and the masked
  answer**, not the system instruction, which is a constant in `ask.ts`.
- **The model is `claude-haiku-4-5`**, one constant (`SMALL_MODEL`),
  the smallest model this deployment prices in `lib/agent-run`.
- **"Not now" changes nothing and is not recorded.** The question stays
  waiting and comes back with "What needs me today?". **Except on a
  drafted bill (2026-10-18):** there "Not now" is a recorded no, with
  the person's reason or, where they give none, a sentence saying so,
  because the nightly run asks about a draft once and a no that is not
  recorded would ask again every night. The draft stays on the Bills page.
- **The bill card and the hold card are web only.** The Teams door
  carries invoice receipts and the time limit and nothing else; it does
  not render the twin's questions generically, so a `bill.send` question
  never reaches Teams, and the supplier's twin's nightly pass sends no
  Teams digest at all. Carrying it is a third list in `lib/teams/digest`
  and a call from the supplier half of `cron/twin` (architect's).
- **A hold on a bill is a card for whoever sends bills
  (`invoices.issue`), not a number on the badge.** The badge is the
  decisions queue's count (etyme-demand); a held bill is not in it.
- **"Ask Pinnacle for a corrected invoice" from the prototype is not
  built.** The twin has no act that sends a supplier a message about a
  receipt, and the approval route accepts none, so no card for it is
  drawn. It needs an act kind in the role contract first (architect).

### Before 2026-10-12, as the panel on the twin's page

- **The route is `POST /api/conversations/twin`, not `/api/twin-chat`.**
  `app/api/twin-chat` had no owner in `lib/domains`, so a file there
  fails `domain-ownership` on its commit; `app/api/conversations` is
  conversation's already. The pure answering (`ask.ts`) and the reads
  (`read.ts`) sit beside the route, on the `submissions/kind.ts`
  precedent.
- **The variance question reads the twin's recorded receipts, then
  re-runs the rule on each.** "This quarter" is the calendar quarter in
  UTC, by the day each receipt was billed (`issuedAt`, else
  `submittedAt`) — the same day the spend answer counts by, so one
  receipt falls in one period on both. A receipt with neither date is in
  no quarter. Clean and not-clean are today's reading, so a
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

## The public site — etyme-market (2026-10-14)

1. **`/census` is to be deleted on November 13, 2026, with its form and
   its route.** The founder deleted the audit from every page on
   2026-10-14 ("Does anyone need the audit form? I think it's useless.").
   Until that date the page stays reachable, linked from nowhere on the
   public site, with one line at its top: "This page closes on November
   13, 2026. Write to us from Contact instead." On that date: delete
   `src/app/census/` and `src/lib/census-copy.ts` (market), the
   `/api/census/*` routes and `lib/census` with their letters
   (regulatory, money, conversation — each its own), the `AUDIT` kind in
   `POST /api/market/leads` and its words in `lib/public-site/leads`
   (market), the `/census` entry in `lib/public-site/pages`, and the
   `GET_THE_AUDIT` constant in `lib/public-site/funnel`. Owner of the
   date: market.
2. **`/demo` still links the audit.** Its foot (`src/app/demo/page.tsx`
   and the words in `src/app/demo/seats.ts`) is the platform's and was
   not touched. `public-funnel.test.ts` names it as the one place left,
   and fails when it is gone so the line can be deleted.
3. **The lane drawings are no longer shown, and are not deleted.** Since
   2026-10-15 no page draws `public/model/*.png`: the ten party pages
   that showed them became one table ("Who does what"), and the nine
   process pages became five step pages whose flow charts are words. The
   images (drawn from `docs/lanes/streams.mjs`, which has no owner in
   `lib/domains.ts`) still say "desk" and "program office" inside them,
   and `public/model` is still named under matrix row L3.1.4.1. Nobody
   reads them; delete them once the matrix line is dropped. One party
   page file, `lib/public-site/docs/candidate-employee.ts`, is kept
   unread for the same reason (the matrix names it); delete it with the
   line.
4. **The page-view counts still name the audit.** `audit_cta_clicked`
   and the two `audit_form_*` events stay in `lib/public-site/market-events`
   because rows already written carry them; nothing on the site sends
   them any more.
