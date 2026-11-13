## Load and performance: 100,000 transactions on each page — the founder, 2026-11-01

*"Do load and performance testing for 100000 transactions on each page"*,
with the walk he meant: job → submissions by every route (direct, bench
to prime, prime to client, prime to integrator, prime to prime) →
interviews → offer and placement → the papers gate → timesheets →
invoices and AR/AP. Then: *"Go from one company to another"*, *"Are you
not working on live system?"*, *"Simulate documents to attach, sign or
fill for positive and negative cases"*, and *"ensure UI saves records and
UX flows are optimal."* What was decided and done, so the next run is
not re-derived:

- **Never on production.** A load test writes hundreds of thousands of
  synthetic rows; production's database never carries them. The runs
  are the simulation harness on a fresh copy of the generated world on
  the session's box. Production-grade throughput needs a preview
  deployment with its own hosted database, which only the founder can
  provision; the box's numbers say which routes degrade first and by
  how much, not what the hosted platform does.
- **The run crosses companies by construction.** Every transaction
  walks the chain the trade walks: the client raises the job, primes
  and sub-vendors receive it, a bench firm's person goes forward through
  the prime, the client signs, each rung accepts, the bill goes up one
  rung and lands as an invoice receipt at the next, payroll runs at the
  employer.
- **A pages pass measures the screens, not only the routes**
  (`npm run simulate:pages -- --db etyme_sim_<stamp> --concurrency 40
  --rounds 3`, platform): every page on every party's menu, tabs
  included, read from `lib/nav-table` so it cannot drift, opened as
  26 seats through the demo door, with the reads each page makes on
  load, p50/p95 per page, the two-second fault line, and the table
  counts behind the pages (`reports/pages-<stamp>.md`).
- **Documents both ways** (regulatory, `stages/regulatory/both-ways.ts`,
  `doc-matrix.ts`): every document kind × action (attach, sign or
  countersign, fill from fields) × outcome (accepted, sent back,
  refused, held), the founder's six documents first (proof of right to
  work undated then dated; the I-9 on a printed edition and on one the
  issuer never printed; the background check verdict verbatim with and
  without reference and date; the NDA and confidentiality undertaking
  signed then countersigned, and the wrong order; the drug screen as a
  provider's verdict; Brightmoor's good standing clearing the start, and
  lapsed). It runs on the next scale run.
- **Only a walk on screens proves a person can save a record.** The
  release walker opens every form of every party in a real browser on
  the kept scale world, presses Save, and proves the save three ways
  (the sentence, the record on reload, the row), measuring clicks,
  fields and seconds per flow against the zero-training test; its
  verdict is recorded under this line.

**Calibration, 200 placements × 4 weeks, 40 at once (1 Nov):** 17,830
calls in 206 s, no server error, 3 routes over two seconds (the nightly
agent run 9.0 s, an agent approval 5.4 s, the greeting 2.25 s). The
"$535M billed" in its report was dong, pesos and rupees summed as
dollars: the stations now report per currency.

**The founder's scale, 2,000 jobs × 12 weeks, 60 at once (1 Nov,
`reports/simulation-20261101180424.md`):** 338 firms, 3,663 seats,
183,514 calls in 49 minutes (62 a second on four cores shared with the
database); 2,000 jobs, 11,861 invitations, 13,861 matching runs, 2,697
interview rounds, 1,011 awards, 881 starts, 9,184 weeks filed, 9,012
signed, 8,316 accepted, 292 pay periods. **The one failure: 25 of 720
bill sends answered 500 after 20 to 44 s**, the submit's five-second
interactive transaction starving the pool under sixty senders (money).
Thirteen routes over two seconds at p95: the nightly run 45.9 s for 338
firms, an agent approval 14.1 s, sending a job to suppliers 7.6 s, the
greeting 7.3 s, the award 5.4 s, matching 4.0 s, terms 3.3 s, and six
between 2.0 and 2.6 s. Four lessons, none a product fault: 657 bills
refused for a missing billing address (the generated world's firms had
none; the seed gets `lib/seed-setup`'s rule); 500 starts refused as
HR's work (148 of 160 generated suppliers had an HR role and nobody in
it; the station now has the Owner seat somebody and asks as HR); 696
acceptances refused as one's own hours and 731 flagged weeks signed
without a reason (the stations at generated firms). The pages pass on
that world (682,538 rows behind the pages, 263,813 of them access-log
and 432,336 notices): 4,374 timed calls, none failed; 46 of 158 pages
and 87 reads over two seconds at 40 at once; the worst reads
`/api/suppliers` 20.7 s at Corvane's hiring manager, `/api/decisions`
13.4 s, the greeting 12.7 s, `/api/program` 10.7 s. Every Settings tab
at the supplier read 5.5 to 9.4 s, which looked like a cost shared by
the Settings shell and was not: the pass took each seat's pages in
menu order, so the longest menu's last section opened beside the
other seats' heaviest reads (a median of 17 heavy reads in flight
against 3); measured alone the same tabs are 1.1 to 2.3 s at p50, and
the pass now shuffles each round. The one-person firm's and the
worker's pages were all under the line. The fix wave after the run,
measured at forty at once: the client's suppliers list from 414
queries and 23.6 s to 103 and 10.1 s (demand), the program page's
four figures from 75 queries and 4.2 s to one query and 0.13 s
(demand), sending a job from 52 queries to 32 (demand), the bill send
from 34 server errors in 40 to none (money), a worker's own first
screen from 52 queries to 31 (supply), the compliance page's per-line
reads batched (regulatory), the signer's name and who approved a
week read for many weeks at once (architect).

**The target is 100,000 complete transactions, not per page.
Corrected by the founder, 2026-11-02:** *"100000 in complete
transactions and not per page."* A complete transaction is one
placement walked through every station to a paid invoice receipt at
its payer and a worked-out pay period at its employer, and the
report's headline counts those against the target. The scale run
closed about 1,000 complete transactions in 49 minutes at about 180
calls each, and wrote about 430 notices and 190 access-log rows per
transaction; a world of 3,429 people cannot hold more at once, because
a placement needs a person. So the rungs are: the fixes above and the
documents matrix on a 2,000-job run; 10,000 complete transactions on
this box from a generated world of about 17,000 people (about eight
hours, the generator taking a size); 100,000 on a preview deployment
with its own hosted database, which the founder provisions, the
harness driving it by URL through the demo door and refusing any
production host. Notices and log rows per transaction are reported as
a cost, because at 100,000 they decide the disk. Decided 2026-11-02 on
the architect's costing, each reversible by the founder in a sentence:
a complete transaction is a placement whose every rung's invoice
receipt is paid by its payer and whose employer has worked out a pay
period covering one of its weeks, with the partial states counted
beside it so the report says where the chain stops; the world's size
knob (`--people N`) gets its frame first (addresses, a namer, steps,
the template name) and its per-domain sizes after; and `--url` against
a preview waits on three things only the founder holds: the preview's
NEXTAUTH_SECRET (without it only the demo-door seats open),
its CRON_SECRET (the nightly stations) and a read-only database URL
(the seat catalog).

**A screen that cannot reach its own rule, and why the tests did not
catch it. The founder, 2026-11-02:** his own walker found on production
that the "Accept or send back" dialog for an I-9 in Document requests
has only the expiry and the edition, while the route refuses an I-9
with no document named ("Say which document Rajesh Iyer showed … on
its own it proves nothing"), so the I-9 can never be accepted from the
screen, the placement stays held, and no timesheet or bill follows for
any new placement. *"I am not sure why your testing is unable to catch
bugs like this."* The honest answer, written down so the fix is
structural and not one dialog: the simulation drives routes, and the
routes were given the document's name, so every rule held; the unit
tests test a route and a dialog each on its own, and nothing asserted
that the dialog offers every field the route refuses without; the
screen walks that would have met it (the 2026-10-22 papers walk, the
two Tapin walks) recorded the I-9 as typed in on Compliance, not
accepted from a packet. Three things follow: (1) regulatory adds the
document shown (which list document, its number, the issuer, its
expiry) to every place an I-9 is accepted; (2) an invariant, "every
question a route asks, its screen has a field for": for each refusal a
route can give for a missing field, the dialog that calls it offers
that field, built as far as the code allows and naming what it cannot
cover; (3) the screen walk that presses Save on every form of every
party (the release walker, running on the scale world) is a release
gate for the trust flows, not a walk after the fact: no deploy that
touches papers or money without it, and its faults recorded here by
class, "the screen cannot reach the rule" first.

**The screen walk's verdict, 2026-11-02: do not ship as "every screen
saves".** 175 forms pressed on 26 seats across all six parties on the
scale world (the 1 Nov build, before this wave's fixes), 675 page
opens at desktop and phone width, no page error and no sideways
scroll: 118 saved and proven (the sentence, the row, the record on
reload), 13 refused rightly in a sentence that names the fix, 31
failed, 13 not proven. The money chain works on screens end to end:
the worker files, the client signs with a reason and the overtime
decision, the supplier accepts from Ask Etyme, AR bills the right
figure, the AP clerk pays from the chat with a bank reference. What
fails is the paper that lets a person start, in the class the founder
named: an I-9 or a license arriving through Document requests is
refused for a field the dialog does not have; an I-9 accepted on
Paperwork says "examined" and writes nothing the start gate reads
(the worst class: success said, nothing saved). Both are closed in
this wave by regulatory (5b4ca4d5) and are proven only when the walk
runs again on the new build, which is the release gate. Also found,
each with its owner: an over-hours week on Today's Approvals has no
reason box and prints 45 hours as "$45.00" (demand); Roll off and
Accept on an expense are offered to a program manager whose route
refuses them silently (demand, money); an MSP seated in a program is
offered "Message <supplier>" and "Send on" that always refuse, one in
a permission code (conversation, market); "Ask the supplier" is a
browser prompt (money); a setup question is refused as outside the
record (conversation); a one-person firm cannot change its type
(architect); machine words on screen ("endDate must be after
startDate", "Timesheet is APPROVED, can only approve from SUBMITTED",
"voided cheque"), "will hear from you by email" where none can leave,
and "employs … at $85/hr" before the person said yes. Report:
`scratchpad/walk-saves/report.md`, screenshots before and after every
press.

**The second screen walk, 2026-11-03, on the build after the fixes
(f84db49d9), said: the class "the screen cannot reach the rule" is
closed for the I-9 and the license, and the build still does not ship
as "every screen saves".** 59 presses on 24 seats on the scale world:
35 saved and proven, 17 refused rightly in a sentence, 7 failed, 8 not
proven. The I-9 cases one by one: a paper a firm named its own way
("I-9, with the document it is completed from") is read as the I-9, the
worker sends it from her page, HR accepts it on Paperwork with the
edition, the passport, its number, issuer and expiry, the Verification
and its backing are written and the person starts; the founder's own
case on Document requests (Casimir Kestrel at Ardley Systems) now has
the fields and is accepted; Record the I-9 on Compliance is offered for
an employee with no held start and saves, and for nobody the firm does
not employ; a license through Document requests carries its number and
board; an I-94 is never read as an I-9; an expired passport is refused
rightly. The money chain holds on screens: an over-hours week on Today
draws its reason box and the overtime question and says "44 hours",
never "$45.00"; the supplier accepts from Ask Etyme; the bill is
generated right ($4,508 = 40 × $98 + 4 × $147); the AP clerk pays from
the chat with a bank reference. Also confirmed: a seated MSP's "Message
<supplier>" drawn only where the route opens it and the supplier
reading "Aptiva Workforce, for Cavanaugh Glassworks"; "Ask the supplier"
a field; Roll off and Accept-expense not drawn for a program manager;
the Owner changing the company type and three other seats refused;
setup questions answered with the next item; every machine sentence and
empty email promise of the first walk reworded; Propose a round and
Edit a job request saving. **Three failed, two of them this wave's
own and fixed before the deploy:** an I-9 accepted on Paperwork on an
edition the issuer never printed or on a retired one, because that
path did not read `editions.ts` (regulatory); Ask Etyme's "Open who
applied" landing on an empty Candidates page because the page did not
read the job in the link (demand). **Pre-existing, each with its
owner:** a client's typed-in invoice receipt can never name a supplier
because `receipt-options` reads only the caller's own buy lines, the
last of the class "the screen cannot reach the rule" (money); the
client's signature posts the order's drawn figure at straight time
after a premium was chosen, $4,312 against the $4,508 billed (money, a
money figure, so it goes first in money's next wave); a bill generated
from Bills carries no pay-to and reads "44 h × $98/hr = $4,508.00";
"₫170.00" shows cents the dong does not have (money); Compliance says
every I-9 "is on file with nothing behind it" though the backing is
recorded, and Paperwork says "On file" for a paper nobody examined
(regulatory); a worker's own I-9 upload notifies every seat at her
employer, nine notices (conversation); candidate cards still read word
for word alike; the client's greeting calls an invoice receipt a
"bill" (conversation); Grant the seat with empty fields says nothing,
Activate offered to HR, the worker's link saying "due to start" on a
past day (demand); Add consultant offered to a delivery manager whose
route refuses it (supply). Not proven: a non-dollar expense on a
client's Approvals row (no Corvane agreement names billable expense
kinds, so none reaches a client), and the 390 px phone pass. Report:
`scratchpad/walk-saves/report2.md`, shots under `shots2/`.

**Shipped to production 2026-11-03 (3a35d888d on the deploy branch,
source b30ab360b):** the screen-walk wave, 360 files. The I-9 class
closed on screens: every door that credits an I-9 asks for the
document shown (Document requests, Paperwork, Compliance's Record the
I-9, offered wherever the firm owes it as the employer), a firm's own
name for the I-9 is read as the I-9 and an I-94 never is, one edition
rule every door reads (`editionToRecord`) refuses an edition the issuer
never printed, one retired before the day the form was completed, or
one dated after it, Compliance reads the backing the way the start
does, and a passport shown again on an I-9 already on file is kept.
"Every question a route asks, its screen has a field for" as a contract
test in five domains; money's screens ask on the page, never in a
browser prompt; a button is drawn only where its route will take it
(Today, Candidates, Timesheets; Roll off and Accept-expense never for a
program manager; Send on by `maySendOn`); the Owner changes the kind of
company from Settings and the menu, the chat and the checklist follow;
a setup question is answered with the next item and its link; an
expense carries the currency it was spent in; a seated firm writes to
the client's suppliers as the program and sees "Message <supplier>" on
Candidates; a candidate card tells two jobs with one title apart and
opens that job's candidates; the compliance page reads every line's set
in one call; the generated world's papers grow with it; an approval
stands when its posting fails; every machine sentence the first walk
found reworded; the cron sweep reads route files only; and the load
wave's performance fixes above. Release pass 31 on f84db49d9 (type
check clean, 13,127 of 13,131 unit, 2,606 of 2,608 integration, build
clean; the six reds test strings and ledger entries behind the wave,
fixed and green alone), pass 32 on 12cf8d106 after the walk's two
fixes (type check clean, 13,136 of 13,138 unit, 2,608 of 2,608
integration, build clean; the two reds the posture's ladder counts and
a hand-formatted date, fixed), and on b30ab360b generate, type check,
the four fixed files (173 of 173) and the build, all clean. Gates on
the replay: no Ruby, brand kit present, no source difference. Four
additive columns land through `DB_PUSH_ON_BUILD`, which the founder
sets back to 0 after this deploy: `Expense.currency`,
`Company.kindSetById` and `kindSetAt`, `AccessLog.subjectCompanyId`, and
the index on `Notification(personId, createdAt)`. **The founder's one
step:** sign in to Tapin as the Owner and set its type to Bench vendor
from Settings. Three lessons from the wave, so they are not paid for
twice: a worker restart loses every agent and its context, and the
handover that works is the diff itself (`git diff -- <files>`), which
a fresh agent of the same domain finishes from; two agents running
integration files while a third changes the schema cut each other's
connections (Postgres 57P01, the template rebuild), so the release
pass runs alone and agents run unit files only while it runs; and a
`src/lib/matrix.ts` left staged by a dead agent rode into two commits
and each had to be undone, so a committer checks `git diff --cached`
holds only its own files before `git commit`. Coordinator's calls on
the way, each reversible in a sentence: the candidate card draws no
act until an act kind in the role contract decides a candidate; the
no-email ask sentence drops "has not answered yet", because she was
never sent the link; an I-9 edition dated after the completion day is
refused with the other two; the retirement day prints as the issuer
prints it. **Open, with owners:** a client's typed-in invoice receipt
lists no supplier, the last of the class "the screen cannot reach the
rule", and the order's drawn figure posted at straight time after a
premium was chosen, a money figure, both first in money's next wave,
with a bill generated from Bills carrying no pay-to, "₫170.00" showing
cents, and the acceptance read on `billCurrency` (money); Paperwork
saying "On file" for a paper nobody examined (regulatory); nine notices
on a worker's own upload, identical candidate cards, "bill" for an
invoice receipt in a client's greeting (conversation); Grant the seat
with empty fields saying nothing, Activate offered to HR, "due to
start" on a past day, the bill picker naming jobs (demand); Add
consultant offered to a delivery manager (supply). The three pieces
decided this day (work country, the degree, setup as a conversation)
start on this source, the setup conversation on the founder's read of
https://claude.ai/artifact/3VnXSMPHtFu2uXhSZR1HmM. **Smoke on
production after the deploy:** health says "Serving 3a35d888 from
main" with the database reachable and the schema there, so the four
columns landed; the home page, the demo, all four doors
(`/for/program-offices`, `/for/integrators`, `/for/suppliers`,
`/for/contractors`), documentation, about, contact, security, privacy,
terms, the DPA, sign-up and `/site/tapin` answer 200; the inbound
email door answers 404 to a POST.

**The founder's own retest of production 3a35d888d, 2026-11-03: partial
pass on the I-9, still no-go for activation.** His tester reused Rajesh
Iyer's placement (Brightmoor → Northbend, $95/hr, PO-2026-ADIVD line 4).
What passed: the demo opens with no account; the I-9 accepted on
Document requests now flips the placement's chip to "on file" for the
I-9 and E-Verify, which on Nov 1 did not propagate at all. What still
fails, in his order: the placement page has no Activate button in
either seat, only the prose "Get an I-9 and E-Verify on file, then
activate" and "activate with a reason" with no control behind it, so
the placement stays draft two days past its start with $0 billed;
**every paper but the I-9 does not propagate**: background check, drug
screening, NDA and confidentiality are Accepted on Brightmoor's
Paperwork page through Nov 1, 2027 and still read "needed / Not on
file" on the placement, while a fresh W-2 packet request refuses with
"everything is already on file and current", two truths about one
worker, the class "success said, nothing the gate reads" again, closed
for the I-9 in 128465a12 and open for every other kind; "No buy line
behind this placement", so no pay line and no timesheet; Rajesh has no
way to sign in, so no week can be filed; Helena Marsh's approved Oct
4–10 week ($5,800) still has no draft bill and her week page no bill
section; the I-9 dialog pre-filled edition 01/20/25 for a paper that
prints "Rev. March 2024", "Passport Card" is missing from the list,
expiry is typed segment by segment and a disabled Accept says nothing;
packet rows do nothing when clicked and a stuck packet cannot be
re-sent in-app; "Ask somebody" disables every person with no reason;
Ask Etyme says the model is not set up on this deployment (no key on
production). His order, taken as the build order: Activate as a real
button and every acceptance read by the placement first, deploy, and
he retests the same day; then the buy line, Bill this week on an
approved week, the I-9 dialog, the packet rows, the picker's reasons,
and a placed person's sign-in link on the row for the employer where
no email can leave. His separate rating of the harness (design 7.5,
live 4.5 as of Oct 30; context, actions, boundaries, persistence,
evals) is answered by three pieces queued after this: a post-check at
runtime that every act's downstream record exists, the model on behind
the deterministic checks (the founder's key), and the fifty-question
set graded against the ledger in every release pass.

**Built in his order the same day, release pass 34 fully green on
f2f342723 (type check, 13,318 unit, 2,645 integration, build), and the
third screen walk on that build said: do not ship yet.** What works
on screens now, in the founder's order: Activate is a real button on
the placement page, "Activate with a reason" draws its box, two
placements moved from draft to started and a blocked start was refused
in a sentence; every paper accepted on Document requests reaches the
placement, the verdict fields work and a disabled Accept says what is
missing; stating the pay from the placement wrote the buy line, the
worker signed the terms and a week was filed against it; Rajesh Iyer's
worker door on /demo opens, his Sunday-to-Saturday week was filed,
signed by the client on Today, accepted by his firm and billed at
40 × $130 = $5,200; the I-9 dialog reads the edition printed on the
paper ("Rev. March 2024", not 01/20/25), offers a passport card, takes
the expiry in one box and refuses a bad edition in a sentence; packet
rows open and "Send again" works; the supplier picker says why a firm
is held back; Ask Etyme's model refusal links to the switch, "Where do
I see unpaid bills?" answers with the link and "take me there" opens
it; the candidate card offers no act and "Open who applied" lists the
job's candidates. 65 presses on 21 seats: 39 saved and proven, 18
refused or answered rightly, 5 failed, 3 not proven. **The two that
stop the ship, each with its owner:** "Bill this week" was offered on
a week whose hours were already billed and the press drafted a $412.60
bill holding only a travel expense and no hours, saying the week was
already billed only afterwards (money: the check runs before the
button is drawn and a press that bills none of the week's hours
refuses); and papers are read two ways again, the class the founder
named: a confidentiality undertaking accepted on Paperwork reads "on
file" on the placement while a fresh W-2 request asks for it as "Not
on file" and Compliance lists it as owed, the older requests still read
"0 of 4" for papers the placement holds, and the backfill finds nothing
(regulatory: one reader of what is on file, read by the placement, the
request builder, Compliance and the backfill alike). Also found, each
with its owner: the week's own page has no bill section, one bill page
gives two "left on the order" figures, an employer's acceptance of a
W2's week says the client's $5,200 "to pay" (money); seats that may
not start read "…or activate with a reason" with no button and no
sentence saying who may, the route's sentence is lost on the reload,
"Send the request" is disabled with no reason, a supplier on probation
is held back where Addendum E says warn and proceed (demand); the
Owner's greeting misses the setup items and carries pasted act
descriptions, a poem is answered instead of refused, "Sent again to
<address>" where no email can leave, a firm's own margin refused to
its Owner (conversation); the model switch reads "Turn it off" while
off, Grant the seat with empty fields says nothing (architect); a
newly added consultant is missing from Consultants and a worker with
two lines at one firm sees two identical options (supply). Report:
`scratchpad/walk-saves/report3.md`, 170 screenshots. The fix wave
runs on every domain at once on disjoint files, then release pass 35,
the walk again on the trust items, and the deploy; the founder's
retest waits on it, and he is told so rather than handed a build the
walk refused.

**Demand and supply, the same evening.** Demand (a1a67e31f, f546105c4,
173750d49, e3d4ed465, 03bca14aa): the client's Candidates page is its
memory of people, headed Candidates with one line saying what it is,
the filters Favorites · Recent engagement · Everyone · On site now ·
Blocked, opened on the first filter with rows and never on Blocked
(Northbend opens on Helena Marsh), and a person's page says Candidate
under the name unless they are on site; a start day already gone is
said as past with the day itself; the job edit form asks where the
work is done and whether sponsorship is offered through the raise's
own reader, both word changes that tell the suppliers and never
re-approve, and a job held on another recorded basis is never
overwritten by a sponsorship policy; the award's employment line for a
firm's own employee between projects is paid what their last line
paid, says which, hangs on no order, and a draft, a cancelled line or a
pay of nothing is not pay on record, so the firm states it; and a
supplier on probation is offered under "Pick one of your suppliers"
with its standing beside its name and asked with a reason recorded
with who gave it before the firm is asked (vendor tier warns, Addendum
E), the reason kept as an Event row until the architect gives
`ContractorInvitation` its `pickReason`, `pickedById` and `pickedAt`.
Supply (60a646e57, 9dda9c35c, 9378eccfa, 8211b51d6): one gate,
`mayAddConsultant`, read by the button, the link and the route, so a
delivery manager is not offered Add consultant and is refused in a
sentence naming who adds; "Check the contract under Contracts"; the
Consultants page reads every record a hundred at a time, so a person
the firm just added is on it, searched and paged, and a person asked
onto the bench gets the sign-in line beside Resend; and a worker with
two lines at one firm reads two options that say which is which (the
client, then the job, then the dates, added only where two would read
alike). The "a firm that lists a person can overwrite that person's
own profile" line of 2026-10-30 was already closed on 2026-11-01
(eaddb1fc2, `profileEditPlan`); the same class through the sheet
import is the architect's, in this wave. Coordinator's calls, each
reversible in a sentence: a refusal names the shipped role set for the
kind of firm, not the roles this company edited; the Consultants page
reads every record rather than moving search to the route (about
twenty calls for a very large firm, each logging its bench read once).
**Architect (8b35511b2, 2fec1d143, a63e849f6, a4fc78a2e), the same
evening.** The Ask Etyme model switch is the one button, "Turn it on"
while off and "Turn it off" while on, with no tick box beside it, a
press with no reason refused in a sentence, and "not set up on this
deployment" beside it where there is no key; "Grant the seat" refuses
in a sentence naming the field (the MSP, the role, the reason) and a
name typed and never looked up is looked up on the press; the shared
filter bar takes the reader's order, so demand's own copy can go; and
the placement page says who activates ("…then HR or the Owner
activates") where the start's route names them. Queued for the
architect's next schema pass: `ContractorInvitation.pickReason`,
`pickedById`, `pickedAt`, or a dedicated event name, replacing demand's
stand-in Event row. The placement page asks the activate route twice
(the panel and the line) until money exposes `who` through the panel.
**Conversation (f60ec26fe, 553191430, 1895c1e44, 4d8aac8f0, 187732257),
the same evening.** A writing job ("a short poem about our bench", a
joke, a haiku, a story) is refused in one sentence that says what Ask
Etyme helps with, before any record is read; who else is asked is said
by name, once ("Jonas Whitaker for HCM integration lead and Delphine
Delacroix for Cybersecurity analyst"), never an act kind's description
pasted twice; the setup line leads the Owner's greeting (it was there
and the walk missed it below the first screen); the Owner of the firm
that holds both reads its margin on Rajesh and Omar from Profitability's
own figures, a seat without `margin.read` is refused in a sentence
naming who reads it, and a client is still refused a supplier's margin;
and "Send again" says sent only where an email left to a real address
(`resentSays`, `resendEmailLeaves` in `lib/notify/resend-words`), the
route's wiring being regulatory's. Coordinator's calls, each reversible
in a sentence: the writing refusal covers a narrow list (poem, joke,
haiku, song, story, essay), so "any news on Rajesh's start?" is still
answered; a waiting question with no name is counted and not listed;
"what it made" is the Profitability row's own profit figure, the one
the page shows; the refusal names roles, not people. Also: the architect
built the sheet import to supply's `profileEditPlan` (9004f3572), so a
row about a person with their own account writes the firm's listing
only and the summary says so per row.
**Money (b627ceb7b, 34a8c80ca, 87e27a1ac, 0d770cd8e, 3e8a52167,
c5493db27, 9568a0f0f), the same evening.** The fault that stopped the
ship is closed: "Bill this week" is drawn only where the next bill
would carry the week's own hours (`weekOnPlan` in `lib/money/week-bill`),
and a press on a week whose hours are already on a bill refuses in the
generator's own sentence naming that bill and drafts nothing, not even
the expense alone. The amount left on an order is one figure, read
through the three-way check's own door (`drawnOnOrder` plus this bill),
said once as "left after this bill", and not given at all where a
document on the order is in another currency; a bill sold to, billed
to and settled by one firm says that firm throughout; the activate
route returns `code` and `who` beside `may`, a seat that does not start
reads who does with no button (only for a FORBIDDEN refusal, so the
route's state words never reach a screen), and after Activate the
route's own sentence stays on the screen across the reload for a
minute; the bill picker reads "Helena Marsh · Oct 4 – Oct 10, 2026 ·
Northbend Athletic" (`lib/money/bill-choice`), the job's name only
where no person is on the line; a typed-in invoice receipt from a firm
the payer has no line with, no line billed to it and no order raised
to is refused in a sentence naming both firms; and an expense is
accepted and billed in its own currency (`Expense.currency`, else the
pay currency of the line paying the worker), one in another currency
than the bill left off in the existing sentence, never converted.
Premium overtime on the order's posting was already one pricing
(0a376bb41; `week-overtime-terms.test.ts` pins 40 × $98 + 4 × $147 =
$4,508). Coordinator's calls, each reversible in a sentence: "left
after this bill" counts the draft; a typed-in receipt needs a trading
tie (a buy line, a line billed to the payer, or an order), an agreement
alone is not enough; the kept activation sentence lasts 60 seconds;
`who` lists the shipped role set for the caller's kind of firm. Routed:
the week's own page draws `BillThisWeek` (architect, two lines); the
employer's acceptance saying "$5,200.00 to pay for the week" where that
is the client's bill, and the approve route printing figures without a
currency (demand).
**Regulatory (23f807d15, a04e78ab7, f494754ae, cdf7e6f99, 2f2ed0d7b,
f46c605a7, edf824652, 8bb1d03de) and demand's last sentence
(6dd612db5), the same night.** The second fault that stopped the ship
is closed: one reader of what is on file for a person and a line
(`paperInstancesWhere`, `papersOnRecord`, `heldAbout` in
`lib/document-stages/paper-record`) is read by the placement (both
paths), a fresh request, the Compliance page, the worker's own page and
the backfill, which gained a second pass that reads an item still asked
for on an open request as on file where the paper is already on the
record ("Already on the record when this was asked", marked ACCEPTED
with nobody named as reviewer, so 1,587 items do not land back in HR's
queue); a verdict names the person's accepted authorization for that
check and never another check's; the worker is told "received, <firm>
will look at it before it counts", never "on file", and her page reads
what her firms examined or accepted. Also: a paper that arrived and
nobody examined reads "Arrived, not examined" and is never green; who
hears a paper arrived is the selector (HR and the compliance officer,
else the Owner, else the Admin); the document library shows one row
per name and reads "voided check"; Send again says sent only where an
email left and "Choose who the request goes to" sits beside the
disabled button; a start day gone reads "was due to start <day>" or
"started <day>" through the one formatter; HR reads "then the <roles
that start a placement> activates"; the degree rules reach every door
(Paperwork's accept, Document requests' accept, the worker's upload,
the Paperwork list: a sentence to HR beside the paper and three doors,
the worker told in words, nothing that refuses a start; her own page
writes qualification, field, name on the paper, honors and the file's
hash); and the seven education cases walk the real routes in the
documents matrix. Demand: a firm below the top accepting a week is
told what it bills and how the person below is paid ("$5,200.00 to
bill Northbend Athletic. Rajesh Iyer is paid through payroll on their
own pay line"), never a payroll figure, every figure in the line's
currency. Coordinator's calls, each reversible in a sentence: the
backfill marks ACCEPTED, not RECEIVED; a provider's verification
clears a degree warning only with its name, reference and date;
authorization matching is by the paper's name; HR's three degree doors
are links that pre-fill nothing; the library merges duplicate names on
display only. **Still open, with owners:** no job names a required
qualification, so "not what the job asks" cannot fire (schema request:
`Requirement.requiredQualification`, written by the job form; architect
then demand); the examine dialog has no degree fields yet, so HR's
accept reads the degree on the person's own record (regulatory); the
placement still counts an unexamined upload as held, and making it
require an examination changes starts across the seed (the founder's
call); the person's own list still says "On file" for an unexamined
item and `POST /api/me/papers` reads held papers without accepted
request items (regulatory); older stored start sentences keep their
raw date; the acceptance's "Accepted 40h" shows hours filed, not
accepted, and the reply's `billAmount` divides by 100 for a currency
with no cents (money); the backfill's second pass has run on no
database yet, so the founder runs it once on production with his
secret after the deploy.

**Release pass 35 on 1b5b5e5af and the fourth walk, the same night.**
The pass: type check clean, 13,545 of 13,547 unit, 2,642 of 2,645
integration, build clean; the five reds were old assertions for words
this wave changed on purpose (the people page's filter bar, the
Paperwork chip, "Contractors" in the door's sentence, "W-9 is on file",
the old acceptance sentence), brought up to the code in 2e323404e with
no product file touched, each green alone. The walk on that build (50
checks on 22 seats: 23 saved and proven, 15 refused rightly, 10 failed,
2 not proven) said: **the money blocker passes** (no "Bill this week"
on Helena Marsh's billed week, the direct press refused in the sentence
naming TECH-vv0wk-10 with Invoice rows unchanged; Rosa Delgado's
unbilled week drafted from the week's own page, one hours line, 40 h ×
$112 = $4,480, "On bill IN_ZULMUB_003, drafted and not sent yet") and
every piece of the wave holds on screens (Activate with its sentence
kept, the menus on twelve seats, Candidates opening on Favorites, the
nav answers, the poem refused, the setup line, the margin answer, the
model switch, Grant the seat, Send again, the probation ask, the added
consultant found, the two line options, the bill picker, one "left
after this bill", the acceptance sentence); **and papers are still read
two ways in one place, so it does not ship yet:** an accepted
undertaking reads on file on the placement, on Compliance and on the
worker's page, and a fresh W-2 request still asks for it ("Not on
file") because the request route hands the one reader only the asking
firm's own document types, and the undertaking is the client's paper;
the backfill closes only background checks, licenses and I-9s (781
closed), so Rajesh Iyer's and 17 more Nov 1 requests still wait on the
right to work and the undertaking their placements hold; and the
worker's page lists her NDA as still needed. Each regulatory's, fixed
next. Also found: a supplier's Contracts page shows page one of the
API as the whole list (20 of 28 lines, six running placements missing
from the counts and the rate total; money); the greeting does not
follow Karthik Menon into his firm hat and lists colleagues' uploads
there (conversation); the worker is told nothing when her degree's
year is warned to HR (conversation); a one-person firm is offered a
"You" hat the rule denies her (architect). **For the founder, one
line:** the placement reads an unexamined upload as on file while
Paperwork says "Arrived, not examined" (`PAPER_ON_FILE` keeps
UPLOADED); it is left as it was for this deploy because changing it
changes starts across the seed, and whether an upload nobody examined
may clear a start is his call. Report: `scratchpad/walk-saves/report4.md`,
141 screenshots.
