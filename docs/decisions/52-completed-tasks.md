## Completed tasks

### LEGACY_RULES.md ✓

`LEGACY_RULES.md` — business rules from 4,197 commits, in plain English
with file references. Covers all 14 sections: cycle engine, contracts,
submissions, invoicing, company structure, documents, conversations,
compliance, commissions, database constraints, routing, background jobs,
seed data. Seven known bugs documented for the new build to fix.

### Service object extraction ✓

Phase 1: 5 service objects (901 lines extracted).
Phase 2: 14 service objects (2,085 lines extracted from 13 controllers).

### Business logic extraction ✓ (2026-09)

Cycles are money only, on the side of the trade they describe, on the
day the pack asks for (`lib/cycle-kinds`, `lib/cycle-generator`,
`lib/contract-cycles`). The timeline is three words on the thread —
hours, pay, bill (`api/placements/[id]`). Paperwork is a checklist, not
a signing workflow: I-9 and lapsed cover block, the rest warns with a
reason (`lib/contract-clearance`).

### The client path, closed ✓ (2026-09-10)

Five routes that authenticated and did not authorise — activate,
payments, invoice generation, timesheet entry, convert — now refuse a
stranger in words. Awarding writes the cycles. A client pays only what
came through the match. Tenure counts a day on site once, however many
firms billed it, and only days served. Three client programmes seeded
with a desk per job. `__integration__/client-programme.test.ts`.

### Interviews, and the requisition chain as three desks ✓ (2026-09-12)

A client can interview a candidate from the row: rounds in turn, the
supplier and the candidate told on their own channels, the candidate
answering from their own page, the client's notes never leaving the
client (`lib/interview-proposal`, `lib/interview-notices`,
`components/propose-interview`). Only whoever is hiring may set up or
decide a round.

The chain is three desks, not a dollar line: HR reads the role,
Procurement audits the suppliers, the lead who owns the cost centre
signs the money — alongside at one rank, the lead after both; within
plan every desk clears by rule and by name and the requisition publishes
itself; nobody signs their own (`lib/requisition-approval`). HR and
Procurement are standing desks named per business unit, nearest wins
(`ApprovalRule.kind`). A requirement has an owner distinct from who
raised it, a panel, and the suppliers Procurement cleared; the release
stays within them. Words change on a published requirement with every
supplier told; money goes back through approval
(`lib/requisition-change`). Requirements read Draft · Awaiting approval
· Needs changes · Published · Cancelled · Archived — filled is a
placement's word, read in Submissions. `/demo` seats the account owner,
HR and Procurement at each programme.

### Phases 2 and 3, the pieces that were words on the schema ✓ (2026-09-14)

Directed by the founder over the sequencing rule, and said so. Every
status that a scan found nothing writing now moves, each as sentences
in tests and a story on the seeded world:

- an approved, client-billable expense rides on the next invoice as a
  line of its own and is PAID with it (`lib/expense-billing`); the
  three-way match takes the approved expense as the receipt
- a document asked for is SENT (the person told), UPLOADED or SIGNED by
  attestation from their own page (`lib/document-request`, Paperwork
  page, `/api/me/papers`)
- a visa petition is FILED, gets an RFE and the answer, is APPROVED with
  the date it runs out, STAMPED, ACTIVE, and the watch job runs it out
  (`lib/visa-petition`, Visas tab on compliance)
- a course is added and somebody enrolled, started, finished with a
  score, or dropped with a reason (`lib/training`)
- a supplier's standing — probation, approved, preferred — is set from
  the suppliers page and read by the VENDOR_TIER rule
  (`lib/supplier-tier`); a seat unadvertised for six weeks goes COLD
  (`cron/cold-openings`); a unit of every kind can be added
  (`/api/program/units`)
- a milestone the client accepted bills on the next invoice as a line
  with the acceptance as its receipt (INVOICED); a commission-type buy
  contract is paid by a run that posts COMMISSION against the order,
  once per period, under the cap (`lib/commission`,
  `/api/payroll/commissions`); somebody else takes a seat as a new
  contract on the same terms with the old one ENDED and the candidate
  REPLACED (`lib/replacement`); a bill that did not match is a decision
  on the AP desk; a holiday marked for another country does not move
  this site's dates (`appliesTo` in `lib/holidays`)

`InvoiceLine.timesheetId`, `sellContractId` and `personId` are optional
now: a line is an hours line, an expense line or a milestone line.

### Every table moves ✓ (2026-09-14)

"We need all tables to keep moving their respective statuses across
the app." A scan of every status column against every writer found
where they stopped, and `__integration__/status-ledger.test.ts` now
walks one placement and reads every table at every station. Fixed:
the hours, invoice and vendor-bill cycles are marked done when the
thing they waited for happens (`lib/cycle-complete`), so the placement
timeline stops saying "overdue" about a week that was paid; a contract
whose last day has passed is ENDED by the daily job (`cron/end-contracts`),
both sides; activation moves the buy contract with the sell contract;
a supplier can decline an invitation and whoever is hiring is told
(`invitations/[id]/decline`); submitting through the bulk route accepts
the invitation. Left as words on the schema and now corrected: a
timesheet has no PARTIAL status; fewer hours accepted is `acceptedHours`.

### Somebody is told when it breaks ✓ (2026-09-13)

`/ready` measures the edges (`lib/readiness`); two of its red rows are
now built. The daily job writes a `JobRun` before its first job and
after its last, and sends staff a heartbeat either way, so the alert
channel is proven on a day nothing broke. Every failure in an API route
goes through `reportError` (`lib/alerts`): an `Incident` row, and one
email per place per hour to `ETYME_STAFF_EMAILS`. A page that throws
shows a sentence and reports itself (`app/error`, `app/global-error`,
`POST /api/incidents`). Found on the way and fixed: eleven cron routes
accepted the literal header "Bearer undefined" on a deployment with no
secret; all use `cronAuthorized` now. What production still needs from
the founder: `ETYME_STAFF_EMAILS`.

### The client dashboard reads as a desk ✓ (2026-09-13)

"Client dashboard need to be lot better." It opens on a sentence about
the reader — "6 things need you. 6 are urgent." or "Nothing needs you
today." — with the queue under it and Approve on the row, then the
picture: on site, suppliers, this month, ending soon, tenure,
requirements, each a link (`app/dashboard/program`). Four numbers were
real and computed the wrong way round, and each is now a sentence in
`__tests__/invariants/client-desk.test.ts`: a person bought through a
chain was counted once per rung and a sub-supplier's rate reached the
client's page (`lib/chain-top`: the client sees the contract it pays);
monthly spend was divided by a hundred twice; a role filled by history
was "still waiting"; and the desk that signs the work was never told a
week was waiting, because decisions scoped hours to the employer only.
A client now sees the hours, through the supplier it pays, and signs
from the dashboard.

Then, on "fix the gaps and improvise": a week is checked against its
contract before anybody signs it — over the role's hours, or past the
last day — and says so in a sentence (`lib/timesheet-flag`); the
headline counts exceptions; "Approve anyway" takes a reason and puts it
on the signature. Under the queue, what was done today. Somebody
starting soon shows the paperwork verdict a week early, in activation's
own words. Each supplier carries its standing; a published role nobody
has answered in five days says so; a client with nothing on it yet is
told what to do first. The generic demo client's book is mostly history
now, and the seeded Northbend Athletic desk has one 44-hour week to read.

### Network ✓ (2026-09-13)

"People & Suppliers can be changed to Network; contractors and
suppliers should have a table view as well as the feed; filter
suppliers by their existing contractors, and contractors by recent
engagement, favorites, location, blocked." The nav group is Network.
Both pages switch between the feed and a table of the same rows
(`components/network-view`), under one filter bar that asks the same
five questions on both — Everyone · On site now · Recent engagement ·
Favorites · Blocked — and a place (`lib/network-filters`). A favorite
is the opposite of a block: a person or a firm this company would take
again, marked with a star on the row, kept per company and never read
across companies (`Favorite`, `/api/favorites`). Somebody on site is
engaged today; a block keeps the row on the register but out of every
list except its own. The seeded Northbend Athletic desk stars Helena Marsh and the
firm that supplied her.

### A supplier is a workflow, and a person has a page ✓ (2026-09-13)

"Add supplier is a huge waste of real estate — for an activity that has
to happen through workflow and compliance with indirect procurement.
The hiring manager recommends; his department lead — or sometimes the
program office — audits; the vendor is emailed a link for its
information; indirect Procurement qualifies; HR ensures compliance and
screening; AP Finance screens the bank details." The paste box is gone
from the top of Suppliers. A firm walks four desks in order, the way a
requisition does: the recommender's department lead — the nearest
value-rule approver up their own unit tree, the program office where
none is named — confirms the need; Procurement qualifies the firm on
its experience, references, revenue and delivery proofs, its proposal
and a D&B report; HR clears compliance on the certificate of insurance
and a sanctions and litigation screening; Finance verifies the tax form
and the bank details and says the last yes. Each desk verifies its own
items and no other's, and says yes only when its own are verified or
waived with a reason (`lib/supplier-onboarding`, `lib/supplier-desks`,
`SupplierRequest`, `/api/supplier-requests`). Nobody decides their own
recommendation and nobody decides two desks. Every desk is told by
email as well as in the app, and finds the firm on its own dashboard as
a decision. The firm gets a link of its own the moment it is
recommended (`/apply/[token]`, `/api/supplier-apply`): no sign-in,
files recorded by name against the item they answer, bank details kept
to the bank, the account name and four digits; what the firm supplies
is received, never verified, until the desk says so. The link stops
working once the client has decided; in time it is the supplier's door
into the client portal. A firm in the pipeline shows on the suppliers
list, feed and table, as Pending with the desk it is on. Procurement's
own import of firms it approved before is folded away at the bottom.
Walked desk by desk in the browser, sixteen screens, and in
`__integration__/supplier-onboarding.test.ts`.

"Can a hiring manager save a consultant as a favorite, and how will he
invite?" One page per person as this client knows them — where they are
today, time here across every supplier against the cap, every
submission and what each firm asked, interviews, paperwork, who can put
them forward — opened only for somebody put in front of this company,
every read logged (`/api/people/[id]`, `app/dashboard/people/[id]`).
The star is on it. "Ask for them" picks a published role and goes to
the supplier holding their consent on its bench, else whoever last
submitted them, on the thread for that role — never to the consultant,
because Etyme places nobody (`/api/people/[id]/ask`). A blocked person,
an unpublished role and a role they are already on are refused in
words. The seeded Northbend Athletic desk holds Veritan Talent with HR, cleared by the
department lead and Procurement, the firm's side in.

### A supplier brings its team in ✓ (2026-09-13)

"Can Brightmoor add or onboard their team members — account managers,
HR, recruiters, contract managers, finance — so it is easy to
coordinate?" A staffing firm's roles are in its own words now: Owner,
Admin, Recruiter, Resource Manager, Account Manager (the client
relationship — roles, rates, submissions, what was billed; never
payroll or P&L), HR (the firm's own people's paperwork; no money at
all), Contract Manager (agreements, orders, extensions, rates; neither
submits nor pays), Accounts Receivable (bills the client and records
what came in; never accepts hours for pay or runs payroll), AP &
Payroll (pays the consultant or the sub-vendor: accepts hours, runs
payroll, settles bills; never issues a client invoice), Finance (the
whole desk at a small firm; was Accountant), Compliance Officer. A
company formed before a role existed gets it the next time somebody
opens Users & permissions; a renamed role keeps its seats
(`lib/company-roles`). The page has "Invite a teammate": name, work
email, what they do here; the person is emailed and the seat is theirs
the moment they sign in — an own-domain address is welcome, not
refused, because an owner setting up four desks should not wait for
each to find the door. Once seated, they appear on every client's
Contacts page under their firm, sorted into the right chips
(`__tests__/invariants/supplier-team.test.ts`,
`__integration__/supplier-team.test.ts`).

### Every list, two ways ✓ (2026-09-13)

"All tables must have feed and table options like the contractor
table." One component, `ListSurface`, wraps the working-surface table
and adds the feed: the same rows as cards, title from the first column,
subtitle from the second, the rest as lines; action columns stay off
the card. A page that wants a richer card passes one. Nineteen pages
that drew a bare table now offer both; Requirements, Ending soon, POs
and Contacts, which had only cards, now have a table. The reader's
choice is remembered per list on their device.

### What this section taught, for the rest of the app (2026-09-13)

Written after a week on the client's Network — dashboard, suppliers,
contractors, contacts, teams — because each was learned by getting it
wrong first.

1. **Fill from the work, not from data entry.** The People tab was empty
   because it listed only what somebody typed in. Every list should be
   derived from the flows that already know the facts — seats, contracts,
   submissions, threads — with hand entry as the exception. If a screen
   is empty on the seeded world, that is the bug, not the seed.
2. **Every figure on a screen has a sentence on the seeded world.** Five
   contractors for three people, $972 for $60,000, seven roles waiting
   when two were open, six approvals nobody was told about: all real
   numbers computed the wrong way round, none caught until the founder
   looked. A formatter takes minor units only; a chain is counted at
   the rung the client pays; a "waiting" is checked against status.
3. **The desk that acts is the desk that hears.** Decisions were scoped
   to the employer, so the client who signs the work read "Nothing needs
   you". Route every "needs you" through who may act, not who owns the
   row, and tell them by email as well as in the app.
4. **A form is a workflow in disguise.** "Add supplier" was a paste box
   doing indirect procurement's job in one keystroke. Anything with a
   compliance consequence walks desks in order, each verifying only its
   own items, nobody deciding their own or twice, and the counterparty
   supplies its side through a link of its own.
5. **Roles in the trade's words, per kind of company, reaching existing
   companies.** Account Manager, HR, Contract Manager, Accounts
   Receivable, AP & Payroll — not "Accountant". A role added later must
   appear for a firm formed earlier without a migration.
6. **The same five questions on every list.** Everyone · On site now ·
   Recent engagement · Favorites · Pending · Blocked, and a place. A
   filter learned once is learned everywhere; a filter with nothing
   behind it is not offered.
7. **Walk it as each person, and keep the screens.** The mapping bug that
   filed an account manager under Accounts payable was invisible in the
   unit tests and obvious in one screenshot. Every module ends with a
   browser walk as every desk it touches, and the screenshots go to the
   founder.
8. **Segregation is a BLOCK, said in a sentence.** "You recommended this
   firm, so the desks decide it without you." Never a disabled button
   with no words.

### The charts were audited against the validator ✓ (2026-09-13)

"Audit and improvise the sites and UX." Every chart in the app was run
through the palette validator instead of being looked at, and three of
them failed:

- the AR page drew 31–60 and 61–90 days in the identical clay — ΔE 0.0,
  the worst score the validator gives, two bands nobody could tell apart
- the same five age bands were drawn in three different palettes on
  three pages: brand tokens on AR, four unrelated Tailwind reds on
  Invoices, four more on Reports
- the report's contract pipeline put a green segment beside a gray one
  at ΔE 5.6 for normal vision, under the floor of 15, and printed white
  counts inside segments that a narrow band clipped

All three now draw from `lib/chart-colors`: `AGE_BANDS` — the good
status color for current, then a validated one-hue ramp darkening
through the overdue bands — and `SERIES` for identity, opening on the
brand's blue and clay. Both sets pass every check; the runs are quoted
in the file. Segments carry a 2px surface gap; counts moved to the
legend; a legend swatch only stands for a segment that is drawn.
Twenty-seven off-brand Tailwind colors across thirteen screens — a dozen
`bg-red-600` toasts among them — were swept onto the brand tokens, and
a test now fails on any that come back.

### Demand opens, supply answers ✓ (2026-09-13)

A client writes to one supplier from the role or from the candidate's
row; the supplier is told, reads it and answers on the same thread, and
cannot start one — the refusal says to submit or answer the invitation
instead (`lib/threads`, `components/thread`, `Conversation.withCompanyId`).
A firm not on the deal is told nothing is there. Discussion stays the
company's own. The 2017 rule, kept because the demand side still wants
it. Requirements name the person they are for, first, every time; a
paused requisition refuses submissions in a sentence.

### The demo names nobody real, and seeds twice ✓ (2026-09-17)

The home page stopped naming Nike, Corning and Terumo BCT on
2026-09-15, and `/demo` — the button under that line — went on using
them as the headings on three doors. `lib/positioning` read
`app/page.tsx` and nothing else, so a name stripped off the page and
left one click behind it was not stripped off anything.

The sheet in `docs/demo-names.md` is applied: **Northbend Athletic**,
**Cavanaugh Glassworks** and **Talvern Medical** are the three client
programs, with **Auralis Software** and **Maren MSP** on the spine and
**Veritan Talent** the recommended supplier; the towns moved with them
(Tualatin, Elmira, Westminster). **Slugs stay** — `world-nike` is an
address, by the same precedent that kept the demo desk key `programme`,
and only what a human reads changed.

Worse than a display name, and the reason this was urgent: the seed set
`domain: 'nike.com'` and `'terumobct.com'` with `domainVerified: true`,
and joining beats creating, so a real employee of either signing in
would have been seated inside a fictional tenant full of seeded rates
and invoices. Every seeded company now holds a reserved name nobody can
register — `.example`, `.invalid`, `.local` — and
`__tests__/invariants/demo-names.test.ts` reads the seat list, the demo
page, the "Look around" button, `/ready`, the world and program seeds,
the demo seeds and `prisma/seed.ts`, and fails on a retired name or a
buyable domain coming back.

**A seeded world keeps the day it was born.** Every seeded date is
counted in days from today, so re-seeding on a later day found none of
the weeks it had written and wrote the lot again — and exactly seven
days later it died halfway through on a duplicate invoice line, leaving
the world half rewritten. `seedWorld` now reads the first company's
`createdAt` and counts from there (`lib/seed-days`), so a second seeding
is a true no-op whenever it happens. The cost is that a world seeded in
March goes on reading as March: to move the dates forward, drop the
world and seed it again. `__integration__/reseed-across-days.test.ts`.

**Shipped to production 2026-11-12 (2c314683a on the deploy branch,
source 3288d493e), on the founder's "deploy".** In it: sign-in by
company directory with the Owner's choice of directory only, invitation
only or hybrid; a person turned off in the directory locked out on the
next click; limits on a seat invited on a public address; the
Superadmin screen for Ask Etyme limits and the three-day trial; the
model connection, waiting for the key; the forwarding setup item
(intake stays closed); Google directory import (off until the privacy
line is approved); and the walk's fixes, including EMAIL_SERVER no
longer breaking sign-in. Release pass on 376de51b8: type check and
build clean, 14,871 of 14,872 unit, 2,833 of 2,834 integration; the two
reds were old test lines for words removed on purpose, fixed in
3288d493e and green alone. The identity walk on 62a498151 said ships.
Gates: no Ruby, brand kit present, no source difference, no schema
line removed. Smoke: health "Serving 2c314683" with the database ready
and the schema there; every public page, the four doors and
`/site/tapin` 200; the inbound email door 404 to a POST. **Open:**
Resend's records for etyme.com are live in DNS (2026-11-11) and
`NOTIFY_FROM_EMAIL` must be an address on that domain; etyme.com has no
MX records, so @etyme.com mailboxes receive nothing; the public-seat
refusal sentence on the timesheet-approve and a few settings routes;
the password door and emailed link under directory-only are proven by
unit tests only.

**The Superadmin address is support@etyme.com. The founder, 2026-11-12:**
*"Sharath@etyme.com would be too personal - I will use
support@etyme.com."* So `ETYME_STAFF_EMAILS` on production holds
support@etyme.com, which opens the Superadmin screen and receives
staff alerts. It stays Etyme's own mailbox and holds no seat at Tapin
or any company. sharath@etyme.com stays Tapin's Owner and nothing more.
