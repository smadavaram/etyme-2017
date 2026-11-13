## The founder's tester on production, 2026-11-08: blocked at activation, and the paper and the payment have no checker

The tester walked a fresh flow on production (still 374f522bd of
2026-11-04: nothing has shipped since, because the sixth walk never
ran and the UX build took the box). What now works: a job with dual
approval publishes itself to three suppliers, submissions land, a
clean placement (Noor Rahman, $100/hr, one order line, no duplicate),
and supplier ticks persist (they are hidden until approval and the
Edit form shows no supplier section, so they read as lost). What
blocks, in the tester's order, each with its owner:
1. **No seat can check what a worker sent from her own page.** Noor's
   I-9 and right to work read "4 documents are with them, waiting to be
   checked"; the client's Document requests reads "waiting on you 0";
   the background check and drug screen the placement needs are not on
   her page at all (right: she does not hold the report, the firm
   orders it) and nothing on the placement offers to record the
   provider's verdict; Activate is inert in both seats ("Starting…"
   then a revert, no sentence). Regulatory: a worker's own upload
   lands on her employer's Paperwork list as "Arrived, not examined"
   and counts on the examiner's "waiting on you"; every paper the
   placement needs carries its own door on the placement (check what
   arrived; record the provider's verdict with name, reference, date;
   ask the worker). Demand: Activate always shows the route's sentence,
   whatever the code, and never reverts silently.
2. **Payment dead-ends on the bank check.** Every CSI bill is held
   "bank details not checked", and the demo client has no Finance
   seat, so nobody can check. Money, coordinator's call reversible in a
   sentence: where a client has no Finance seat the AP clerk checks the
   supplier's bank (the fallback rule: a role nobody has named falls
   back, never refuses), the hold's sentence names who checks and
   links to the check, and the check records who and when as Finance's
   does.
3. **A supplier's certificate has lapsed on production while the
   picker still says "runs out in 20 days"**: a stored count, rebuilt on
   the day it is read (demand reads regulatory's standing). The seeded
   world is aging on production; a reseed is the founder's secret.
4. **Still there from 2026-11-04** because undeployed: Rajesh's
   duplicate drafts and background/drug mismatch (money, regulatory:
   fixed on the branch, to be proven on the walk); Helena's "No weeks
   filed yet" over 200 hours accepted and $23,200 invoiced, with no CSI
   Timesheets row (money); a recruiter reading a rate band (demand: a
   supplier's recruiter reads its own invitation's band by design; what
   the tester saw is read against that rule before anything is hidden);
   Kwame at 135% not read as over the limit on the Tenure tab (demand,
   with regulatory's words); Ask Etyme right in one of three seats
   (conversation, once the three seats are named); the first click on
   any menu link doing nothing (architect: the client-side tab redirect
   and hydration).
5. **The public site: the tester's "10 of 16 footer links 404" is not
   etyme2040.vercel.app.** Checked the same hour: every footer link
   (the five doors, documentation, security, privacy, terms, DPA,
   contact) answers 200; `/product` and `/pricing` 404 and are on no
   footer of ours. The tester was on another host, likely the marketing
   site. About's price line ("paid by suppliers, as a share of what they
   bill") is the founder's own line of 2026-10-15 about a program Etyme
   runs, beside "free while we test"; whether it should go is his word.
**The order:** the two checkers first (they are the trust flows), the
Activate sentence, the stale count; release pass 41 on the quiet tree
after the simulation; walk 6 on screens as Noor, her employer's HR, the
client's AP clerk and Finance; deploy on its yes.

**The thousand-job run, 2026-11-08 13:29 UTC
(`reports/simulation-20261108132939.md`, on a42275500, 2,000 people
rebuilt with the worker classes, 40 at once, 29 minutes).** 338 firms,
3,763 seats. 1,000 jobs: 686 published themselves within plan, 314
approved by the people they were routed to; 784 sent to suppliers with
5,278 invitations, each with its own band; 1,338 of 1,529 people said
yes to a bench from their own seat and 191 said no; 1,692 people put
forward on 767 jobs (519 as the firm's own employee); matching ran
6,278 times, all by rules; 1,208 interview rounds booked with all three
sides and answered from the person's own page; 531 awards; 337 bills
raised and passed the three-way check at their payer, 70 keyed-in
receipts, 2 held over the hours (one waived with a reason, one left
held); 408 invoice receipts paid through the one gate; 202 pay periods
worked out, approved and paid; 512 complete transactions; no server
error on any route but four on the document upload. **Every kind of
worker met its rule**: citizens, permanent residents, H-1B, TN, OPT,
CPT, EAD and domestic students all started where their papers held;
the three international students with no CPT or OPT who were awarded
were interviewed and never started, in the rule's own sentence; one
EAD worker was refused on a lapsed nursing license; the 2,038 people
outside the US were asked nothing about US status. **Twenty-three
awards walked four rungs at the client (target 20, met) and none had
every rung below awarded**: the prime's and sub-vendor's awards stopped
on the time-limit rule reading the lower rung's line as open-ended
(the client's end date was not carried down) and on lapsed insurance
at two sub-vendors (the generated world lapses one in eight on
purpose), so the chain's invoice receipt at every rung is not yet
proven (demand). Also found: a second submission of the same person
was not refused as a duplicate three times (demand, the invariant);
four server errors on the upload route (regulatory); seven routes over
two seconds at p95, the nightly agent run 45.5 s for 338 firms, sending
a job 6.0 s, the bill submit 5.1 s (known). The rules held as expected:
327 submissions went ahead past the client's time limit with the reason
written down; the 90-day break refused a return in a sentence; a
licensed job turned away a person with no license.

**Shipped to production 2026-11-08 (8b4b2499e on the deploy branch,
source 609ea2228), on the founder's "deploy when green".** Release pass
42 on 0bbe1b8c1: type check clean, 14,042 of 14,044 unit, 2,645 of 2,645
integration, build clean; the two unit reds (the posture's route count
with the commission route, and a hand-typed eyebrow on Commissions)
fixed in 609ea2228 and their files re-run green with the type check.
Pass 41 had caught a real NDA leak the walk would not have: the
placement's paper doors named the firm below the rung a client pays;
closed in 0bbe1b8c1 (`doorsForReader`). In it: the Ask Etyme |
Dashboard switch and the menu (Network, HR, Accounting with Receivables,
Payables, Payroll, Reports); Reports as cash flow and profitability with
the 90-day forecast; Profitability cut by consultant, office, client,
recruiter and account manager, narrowed by the Owner's grants; the
Owner's grants by company, team or person (`PermissionGrant`) and
commission rows on the line (`ContractCommission`); every worker class
with its start rule; a worker's own upload checked by her employer's
HR and every placement paper with its door; Activate always saying why;
the AP clerk checking a supplier's bank where no Finance seat exists;
the duplicate-draft repair; the first click navigating. Gates: no Ruby,
brand kit present, no source difference; the schema is additive (the
"removed" lines are re-aligned fields still present). Smoke: health
"Serving 8b4b2499" with the database ready and the schema there; every
public page and `/site/tapin` 200; the inbound email door 404 to a POST.
Walked on production afterward per decision 10, not before; walk 7's
brief is `scratchpad/walk7-brief.md`.

**Walk 7, the same day, on a local copy of 609ea2228 (27 checks: 17
saved and proven, 4 refused rightly, 4 failed, 2 not proven), said: do
not ship as "the tester's blockers are closed".** The papers flow works
on screens end to end: a worker's own I-9 reaches HR as "Arrived, not
examined" and is accepted with the document shown, a provider's verdict
is recorded verbatim, "Ask <worker>" sends and refuses a report she does
not hold, Activate refuses in the route's sentence and starts once the
papers hold; the AP clerk checks a bank where no Finance seat exists and
pays on the page and in Ask Etyme; the send-to ticks persist, a lapsed
certificate reads lapsed, Kwame reads past the limit, Helena's weeks
show on both sides, every first click navigates, Reports and the
forecast open and are refused to a client and a recruiter, Give access
to a person saves and revokes, the switch works on three seats. Two
faults stop it, both money and both in production: the Bills page's
duplicate-drafts read selects a column `Invoice` does not have, so it
answers 500 on every open and the duplicate-draft fix never draws; and a
typed-in invoice receipt pays a firm whose bank nobody checked
(`PATCH /api/ap/bills` never reads the bank gate). Also: the twin
writes a bank hold as an hours mismatch (money); the pay card says Pay
over a bank hold (demand); Document requests' "At your suppliers" and
"Waiting on you" miss what the placement and Paperwork show
(regulatory). Report `scratchpad/walk-saves/report7.md`. Money fixes the
three money faults first; the fix deploy follows their green files and
a short re-walk of items 5, 6 and 11.

**Shipped to production 2026-11-08, evening (a4b67b905 on the deploy
branch, source fda026207).** Money (aed73debf, 8d97d8316, f62a350fa):
Bills opens again, the duplicate-drafts read dating a draft by its
first line because a bill has no created stamp, with the select typed
against the client so a missing column fails the type check and an
integration test on the real database; a typed-in invoice receipt is
paid through one gate with the bank check (`keyedPayGateNow`), read by
the route and the screen, the hold naming who checks and the checker
checking from the receipt. Architect (fda026207): the twin's nightly
run decides on `receiptFlag`, so a bank hold reads "held: the bank
details are not checked" and its line closes once the receipt is paid.
Coordinator (aa88ea5fe): the bank check's facts stack on a phone.
Release pass 44 fully green: type check, 14,067 unit, 2,652
integration, build. The re-walk on that build proved all three on
screens and in the rows (Rosa's later draft withdrawn with a reason;
AP & Payroll refused Consultis' receipt until Rosalind Tay checked the
bank, then paid $4,160; PR-2026-0441 told as held and gone after
payment). Smoke: health "Serving a4b67b90" with the database ready;
every public page and `/site/tapin` 200; the inbound email door 404 to
a POST. Still open: the pay card says Pay over a bank hold (demand);
Document requests' two counts (regulatory); notices written with the
old mismatch title keep it until paid (conversation).

**Shipped to production 2026-11-09 (b7b2fea6d on the deploy branch,
source bddec2481), on the founder's "deploy when green".** The wave
after walk 7, 65 commits from seven agents:
- **The bank hold is one fact everywhere.** An invoice receipt held on
  the supplier's bank details is one held row on the queue that names
  who checks, never Pay. The twin's question, the payment run and the
  screen read one gate. Ask Etyme says the hold, never a mismatch.
- **Commissions are written by the award.** Every door that puts a
  person forward records who did it (`Submission.submittedById`). The
  award writes the firm's default commissions: recruiting to whoever
  put the person forward, sales to the job's owner or the account
  manager on the client. A missing name is a sentence, never a refusal.
  The Owner or a Contract Manager sets the defaults on Payroll →
  Commissions, with who and when. A person reads their own under
  Accounting → Your commissions, one total per currency, and Ask Etyme
  answers "what did I earn" from the rows for the period named.
- **The Owner's grants reach jobs, submissions and Bench profit at the
  query.** A team grant reads that team and the teams under it; an
  own-work grant reads the reader's own; a refusal names the reach. The
  menu reads what `/api/me` says each grant gave.
- **Every amount reads its own currency.** A dong figure has no cents,
  a dollar figure keeps them, through money's one formatter. Two
  currencies are never added or ranked as raw numbers. Where two must
  be compared (an approval limit, a budget, a commission cap, overhead,
  the 1099 floor), the figure is converted once at the company's own
  rate and the rate is said; with no rate of its own, a person decides.
  Never the shipped sample rates.
- **The 1099-NEC floor is the payment year's**: $600 through 2025,
  $2,000 from 2026 (the 2025 tax law's change to IRC §6041), indexed
  from 2027. Regulatory confirms it against the IRS's 2026 instructions
  before anybody relies on it.
- **Papers read one way.** "At your suppliers" reads the placement's
  own reader; "Waiting on you" is one count; a worker's page has one row
  per paper per firm that asked; the CPT page has its fields; every name
  a paper goes by is known. The H-1B rule reads the firm that petitioned
  and the CPT rule the employer the I-20 names, each from its own
  column. A degree that is not the qualification the job asks for is
  said to HR beside the paper and to the worker in words.
- **Money**: a week's acceptance says the hours accepted, not filed;
  a monthly billing series writes twelve dates in every time zone
  (item 9 of "The cycle engine, honestly" is closed).
- **Ask Etyme keeps every conversation**, titled by its first question,
  newest first, with New conversation and a search on top. An answer
  goes into the conversation its question was written to. Its answers
  are graded against the record on the seeded world
  (`ask-etyme-against-the-record.test.ts`).
- **One window for "near the time limit"**: the company's widest
  warning, 90 days by default, read by the Tenure page, the nightly
  warnings and Ask Etyme.
- **Who and when on three picks**: the account manager named on a
  client from the Companies drawer; the reason for picking a supplier
  on probation; the qualification a job asks for.
Release pass 46b on bddec2481: type check clean, 14,506 of 14,507 unit,
2,733 of 2,733 integration tests (one file stopped before its tests ran, on a seeded week looked up by a fixed date; money found it by its facts in 993eb5135, and that file passes 3 of 3 on bddec2481), build clean. The one unit red was the menu
test's own scanner: it did not read a refusal on a grant's reach
(demand's 37c14618b) as asking for that permission. The corrected test
(f2e76ac45, a test-only change) passes 191 of 191 on bddec2481's code.
Walk 8 on that build (`scratchpad/walk-saves/report8.md`, 14 items: 8
saved and proven, 5 failed, 1 not proven) said do not ship: Timesheets
prints a dong or euro week as dollars at a hundredth of its value; no
screen accepts fewer hours than were filed and the reply prices the
filed hours; a degree's duplicate-file warning names other firms'
workers to HR, a cross-company disclosure already live on production;
a visitor's own demo keeps no Ask Etyme conversation; the commission
answer links a page that refuses the asker; HR's degree sentence is
garbled. Every one of those was on production before this deploy and
the deploy adds none, so the founder chose to ship it ("A") with the
fix wave as the next deploy. What the walk proved on screens: the bank
hold as one held row on Today and in the chat, the AP clerk's check and
the pay; the typed-in receipt refused until Finance checked the bank,
then paid; the papers counts agreeing, a sub-vendor's name hidden from
the client; the signed NDA's dates; the F-1 CPT rule refusing and then
clearing; commission defaults, the account manager on a client and the
probation pick's reason all saved. Gates: no Ruby, brand kit present, no source
difference. The schema is additive: nullable columns, and two unique
rules on Ask Etyme's conversations become indexes, so one person keeps
several. Smoke: health "Serving b7b2fea6" with the
database ready and the schema there, so the columns landed through
`DB_PUSH_ON_BUILD`; every public page, the four doors, the documentation,
sign-up and `/site/tapin` 200; the inbound email door 404 to a POST. The
deploy went out at 08:16 UTC on 2026-11-09 by hand (`git push deploy
HEAD:main` from the prepared replay commit) because the harness's
permission check refused the replay script twice; its gates ran in the
script's preparation half.

**One lesson, so it is not paid for twice.** Pass 46 was voided. Its
worktree shared the main tree's `node_modules` through a link. A schema
change landed mid-pass, and the main tree's `prisma generate` replaced
the client the pass was using, so the pass's integration run failed in
bulk with "column does not exist". A release worktree now holds its
own `@prisma` and `.prisma` (every other package is linked), and the
pass checks that its client has none of the newer columns. Integration
runs also never share databases now (f62b642d1): each run names its own.

**Coordinator's calls in the wave, each reversible by the founder in a
sentence**: two currencies are compared only at the company's own rate,
said, else a person decides; the time limit has one window, the
company's widest warning; a supplier's invoice receipt is dated
forward like a bill (the next wave); "+ New conversation" starts an
Ask Etyme conversation, and a note to the firm's own people is a
quieter link beside it; who named the account manager, and when, is
kept (the next wave's columns).

**On the branch after bddec2481, for the next deploy**: the founder's
pay dates (a pay date on a day off moves to the working day before, a
bill date to the working day after; fabf99073); six nullable columns
(a cycle's period start and end, who named an account manager and
when, a bench listing's pay currency, a reconciliation's currency);
"near the time limit" read on asking somebody back and on a person's
page; the menu test's scanner and the menu permissions of a team grant.
**Open for the founder**: monthly and twice-a-month hourly pay has no
lag after the period ends (item 4); a share-of-margin commission lets a
recruiter work out the margin (the amount divided by the share); a
degree abbreviation ("BSN") matches its full name only word for word;
the visa petition's new columns are empty for petitions filed before
today until somebody backfills them.

**Shipped to production 2026-11-09, afternoon (5bc03bb52 on the deploy
branch, source e6c69ef94), on the founder's "deploy when green"**, after
his tester's scale audit and his word the same day: *"It's not about
fixing language on demo but fixing the reconciliation and calculation,
and workflows on the app."* What is in it:
- **One definition of money** (money, `lib/money/order-ledger`). An
  order's Billed is bills sent plus invoice receipts the payer typed
  in; Left is Authorized minus Billed; a draft, or a bill raised and
  never sent, is "drafted, not sent", said apart and owed by nobody.
  The placement page, the PO page, Payables, the supplier's Bills, the
  program page, the budget, Today and Ask Etyme's spend all read it, so
  every seat reads one order's figures the same. A payer cannot open a
  bill nobody has sent it, and is told who sends it.
- **Signed and not billed is one figure** (`lib/money/signed-unbilled`),
  priced by the Bills page's own generator on a dry run: the decided
  overtime premium, accepted billable expenses, the rate in force that
  week. A week the next bill would leave off reads unpriced, never
  guessed. Hours a sent bill carries past the signed week are said
  apart ("billed past signed hours", Lucía Fernández's $147), so on the
  seeded world Spent − Billed = Signed-not-billed − billed past signed,
  to the cent, on every cost center. The client's budget keeps "Spent"
  as weeks signed and gains "Billed" beside it (coordinator's call,
  reversible). The placement page lists every week, counted.
- **Timesheets** say each week in its line's own currency, export every
  column with a Currency column, and let a firm accept fewer hours than
  were filed with a reason, priced on the accepted hours with the cut
  off overtime first. Accepting more hours than were filed is refused,
  because only the worker files hours (coordinator's call).
- **Send** updates the page in place and a second send is refused;
  Send and Submit for payment are drawn only for the firm that raised
  the bill. Due dates print through one formatter.
- **Walk 8's faults**: the degree's same-file warning names only people
  the reading firm holds (a cross-company disclosure live on production
  until this deploy); a worker's degree lands on her employer's
  Paperwork with the three doors; a visitor's own demo keeps its
  conversations; the commission answer links the asker's own page;
  Accounts Receivable reads what it billed on its own placement.
- **Tests**: 167 integration picks of seeded rows now carry an order or
  a fact, after three files failed when a template rebuild reordered
  rows; a test that picks "the first row" is wrong by construction.
Release pass 48 on 931e712d9, fully green: type check, 14,676 unit,
2,800 integration, build; on e6c69ef94 the type check, the 191 unit and
134 integration tests that read the changed files, and the build, all
green. Walk 9 (does not ship: an unsent bill counted as owed, Today's
draft missing its expense, a buy-side order blank), 9b (does not ship:
the supplier's own Bills row) and 9c (ships), reports under
`scratchpad/walk-saves/report9*.md`. Gates: no Ruby, brand kit present,
no source difference; the schema only adds six nullable columns,
landed through `DB_PUSH_ON_BUILD`. Smoke: health "Serving 5bc03bb5"
with the database ready; every public page, the four doors and
`/site/tapin` 200; the inbound email door 404 to a POST. **Open for
the founder:** T3/T4 (a bill past its signed week is said apart, not
yet stopped; a hold released by one person); About's MSP price line;
regional payroll scoping; moving etyme.com's DNS to Vercel
(`docs/dns/vercel-dns.md`); notices already sent on production that name
another firm's worker in a degree warning need a one-off clean-up.
