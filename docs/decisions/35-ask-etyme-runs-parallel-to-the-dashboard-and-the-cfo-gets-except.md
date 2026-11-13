## Ask Etyme runs parallel to the dashboard, and the CFO gets exceptions, not a page — decided 2026-10-22 to 2026-10-26

**The question, from the founder, 2026-10-22:** *"Verify if Ask Etyme
conversation also works parallel to Dashboard."* Walked as fifteen seats
in a browser on a fresh copy of the seeded world. The verdict was no:
the mark, the greeting and Today agreed on thirteen seats and a week or
an expense decided on either side showed on the other, but the chat told
Techpeple to bill four weeks Computer Systems already held its invoices
for (a double-billing prompt), a receipt could not be paid from the
chat and the twin's yes paid nothing, the MSP seated at Cavanaugh read a
different queue from the program page, and plain trade questions ("Who
applied?", "Which invoice receipts can I pay?", "Who is missing an
I-9?") fell through to "needs the model". Fixed across six domains and
shipped in this wave; every fault had an owner and a test sentence. What
stands now, so it is not re-derived:
- **One list, read by both doors.** The chat's weeks-to-bill, bench,
  and program queue are the same reads Today and the program page use
  (`firmTuesday`, `benchAt`, `programQueue`). A second computation of a
  figure the dashboard already computes is the bug, whichever door it is
  in.
- **Another company's book is refused by rule, before the model**, in one
  sentence. "Needs the model" is never the answer to a cross-tenant
  question.
- **Plain trade questions are answered from the record, rules first**,
  through the same routes the pages read, and the chips are chosen by the
  seat's permissions so no chip refuses the person it is shown to.
- **Every decision in the count is a card with Yes and Not now**, and
  one receipt is one item: the twin's question rides on the receipt's row
  (`twinApprovalId`), never beside it. A receipt that fails the three-way
  check is never offered Pay; it reads held, with the hours and the way
  forward.
- **Paying an invoice receipt from the chat.** Three coordinator's calls,
  each reversible by the founder in a sentence: a yes pays the balance
  owed; the card asks for the bank reference before the yes, and a yes
  with none is refused ("Enter the bank reference so the AP clerk can
  reconcile it"); `invoice_receipt.pay` replaces `invoice_receipt.approve`
  for `Invoice` receipts (one card per receipt; `approve` stays for
  typed-in receipts). The payment is written by one function,
  `recordInvoicePayment` in `lib/money/invoice-payment`, which the
  receipt's page and the twin's performer both call, behind the same
  gate; the `invoice.paid` event goes out after the commit, never inside
  the transaction.
- **The mark re-reads after any act** on either screen, not on the
  minute.
- **A bill is dated by its agreement on the day it is sent**, and where
  the agreement's date has already passed the card says so before the
  yes ("38 days past due the day it arrives"). Where nobody said what the
  net days run from, they run from the day the bill is sent; that needs
  `paymentTermsFrom` to be nullable (four columns, five readers in other
  domains, ~30 seed writes), sequenced after this wave in the order that
  keeps every commit green.

**The CFO page is not built. Decided on the founder's question,
2026-10-22:** *"Are we still the simple system that's connecting people
like a well-oiled engine, or bothering higher-ups with another overflow
of information tool that they won't need?"* He asked for a thousand
indirect VPs' feedback. A thousand invented executives (not real
people; roles, industries, regions, contractor counts, current tool,
pain and worry drawn from the buyer profile) were each shown three
things and judged one at a time, eight batches, four of them caught
using a formula and redone by hand (https://claude.ai/artifact/JMgRNXaiJ15GeEBfmJQhkm).
Read for who and why, never for how many: 228 of 1,000 would take a
call, which real cold outreach never does. What it said, and what
follows:
- **The engine is wanted; the CFO page is the overflow tool.**
  Operations and procurement wanted the plant-level engine; CFOs wanted
  exceptions only (64 of 158 would use it, 17 ignored it) and ignored the
  engine; the five-number, four-flow CFO page drawn on 2026-10-22
  (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo) sat in the middle
  for every role, the mark of a tool nobody asked for. **So: no CFO page.
  The CFO gets one sentence a week naming only exceptions, and Ask
  Etyme's answer when asked.** Regional managers keep a filtered list of
  their region, which is the drawing's only surviving new screen, built
  when a client with sites in two regions asks.
- **Papers sell before money.** "Nobody starts without papers, audit
  ready" was the value named most, ahead of total spend and matched
  invoices. Public pages and first messages lead with the two things a
  buyer can check: nobody starts without papers, nothing is paid on hours
  nobody signed.
- **Nobody wants to hear about the assistant.** Ask Etyme and the chat
  were named as clutter more than anything else (287 times). It is met in
  use, never sold; this is the "never lead with AI" rule measured.
- **Aim at 200 to 5,000 contractors on spreadsheets or one-agency-per-
  plant, after a pain signal.** Under fifty contractors took 7 calls in
  173; low pain took 2 in 261. Say "sites", not "plants", outside
  manufacturing. The fixable blocker is security (SOC 2, data location,
  the DPA on one downloadable page); lock-in to a VMS, an ERP module or
  an MSP contract is not.
- **The region drawing stands as a drawing**, not a build: the hiring
  manager's own list exists; a region on a site, a regional manager's
  seat and the rollup wait for a paying client with sites in two
  regions. The rules per country shown on it are research, confirmed by
  regulatory before any is built.
- **Corrected by the founder, 2026-10-27:** *"This can be gold. I
  haven't tested, but it was easy to make, but [a] decision."* The
  no-CFO-page verdict above rests on invented buyers, which is the
  borrowed confidence this file warns about. So the verdict is
  **undecided, not rejected**: the drawing
  (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo) is kept and shown
  to three real people who hold those jobs, one question each ("would
  you open this on a Monday, and what would you do after?"), and the
  build or the cut follows their answers, not the simulation's.
- **Built, on the founder's "go ahead and build this", 2026-10-27**, after
  he said the drawing *"explains the product the best, like a beast, and
  nothing else"*. Why it does: it is the only picture of the whole product
  at once from the seat of the person who signs the order — a company's
  every contractor and supplier across every country on one record, the
  four flows (matched, hired, papers, money) side by side, what is stuck
  named, and three seats (CFO, regional manager, hiring manager) reading
  one record at three altitudes. Everything else shows one person at one
  step. The map sells; the engine keeps them. What is built, in order:
  1. **A seeded multi-site client, Corvane Packaging** (architect, with
     money for rates and regulatory for the per-country sets): sites in
     the US, Mexico, Brazil, Colombia, Vietnam, India, Belgium and
     Northern Ireland, grouped in six regions, ten or more hiring
     managers, each plant's suppliers and contractors with rates in the
     site's own currency, a few weeks, receipts (one held), and starts
     (one on hold), so every figure the map shows is on the demo and read
     against the seed. Reached from `/demo` like the other clients.
  2. **A region on a site, and a seat scoped to a region** (architect):
     `CompanyLocation.region`, an org unit of kind REGION, and a program
     seat that reads only its region's sites, through the existing
     isolation at the query. Nothing a regional manager reads crosses
     regions.
  3. **The three views** (demand, with money for the figures): the
     hiring manager's own list exists; the regional manager's list of
     hiring managers (contractors, open jobs, weeks to sign, papers,
     receipts, nearest time limit, spend in the plant's currency); and
     the head-of-operations / CFO rollup, one row per region, the four
     flows with what stopped, spend in one currency. One route, one read,
     the program page's own tabs ("By region"); never a second
     dashboard. The CFO's weekly exception line stays the decision for
     daily use; this is the map.
  4. **Papers and pay per country as data** (regulatory): the rules the
     drawing shows are research; each is confirmed with its source before
     it is shown, and an unconfirmed one is not shown.
  5. **The map on the home page's second screen** (market, after the
     seed lands): drawn from Corvane's seeded figures, inline, checked by
     the story-panel test like every other figure. The seven doors' two
     drawings stay.
  Release pass, preview, production, and a walk as the CFO, a regional
  manager and a hiring manager at Corvane before it is called done.
- **The map is the vision, and it is the home page. Decided by the
  founder, 2026-10-27:** *"This type of home page will sell with clients
  and system integrators big time. This is the vision of Etyme."* So the
  map is not a second screen under the panel; it is the picture the home
  page is built around, drawn from Corvane's seeded figures, with the
  hero's question and the demo button above it and the panel beside or
  below it, and the same map for integrators on their door, drawn from
  an integrator's own people across client sites and regions. The
  integrator's map needs a seeded integrator at that scale (Teleworld
  has four people on site), which is the architect's next seed after
  Corvane. The seven doors' two drawings stay under the fold. The home
  page is drawn before it is built, as every home-page change is.
- **Drawn 2026-10-27, waiting on "build it"**
  (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp). The question and
  the category line stay. The lede under them becomes "Every contractor,
  every supplier, every site and every country, on one record. Read it
  as the CFO, a regional manager or a site's hiring manager ("plant's" until 2026-10-28)." Under the
  buttons, the map: Corvane Packaging's 359 contractors, 25 suppliers and
  31 sites in 8 countries, with three seat tabs that re-read the same
  record (Margaret Osei, CFO, one row per region; Valeria Montes, Latin
  America, her six plants and their hiring managers; Marcus Hollins,
  Dayton, his fourteen contractors and the start on hold). Each seat's
  first line names what stopped: the held Dayton receipt, $42 over the
  signed hours; Maria Lee's start waiting on an I-9; Aoife Kelly in
  Belfast fourteen days from the time limit. Every figure is read from
  `lib/seed-corvane` (`programMonthlySpend` at 160 hours a month,
  `spendInReporting` at the sample rates, labelled as sample). The
  Northbend panel, the two drawings, the four lines, the band and the
  footer follow unchanged. The integrator's map waits for its seed.
- **"Build it", 2026-10-27, with two corrections from the founder's
  phone.** The tabs are the four roles, not people's names, as on the
  region drawing he chose: **CFO · Head of operations · Regional
  manager · Hiring manager**, and under them the line "Signed in as
  Margaret Osei, CFO. Reads every region. Signs nothing a plant's own
  people sign." (*"Clicking on CFO, hiring managers like in the link was
  better … this highlighting tells the story."*) The head of operations
  is Astrid Berge, every plant on one list: 48 weeks waiting across
  22 plants, six people within 30 days of the limit, one row per region
  with its regional manager. And **every party's door gets the same map
  in its own roles** (*"Do it for all parties like those"*): the four
  tabs on a door are that party's roles reading that party's own book,
  drawn from the seed before each is built, one drawing per door. The
  home page is built first, from the corrected drawing
  (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp, version 2); the
  doors follow their drawings.
- **The four doors' maps are drawn, 2026-10-27, waiting on "build it"**,
  each in that party's own roles, every name and figure from the seed
  (the scout's read of `seed-world`, `seed-programmes`, `seed-doors`,
  `seed-internal-moves`, `seed-rate-change`): MSPs
  (https://claude.ai/artifact/CPJviSYK5Uws6bFXLkMgL7): Aptiva Workforce
  in Cavanaugh Glassworks' program as Program manager (Rashida Coleman),
  Supplier manager, Coordinator and AP clerk; the last three seats are
  not seeded at Aptiva and the drawing says so, a seed addition for the
  architect on "build it". Integrators
  (https://claude.ai/artifact/AYzwwuCAYXSHj9KS5FosgT): Teleworld as
  Ingrid Solberg and Rahul Deshpande (delivery managers), Farah Haddad
  (HR), Ravi Kalathil (AP & Payroll). Suppliers
  (https://claude.ai/artifact/3teoAA3AMXxo1d6GSYpfGq): Brightmoor as
  Jenna Okafor (Owner), Marisa Delacroix (Account manager), Imelda
  Santoro (Accounts receivable), Desmond Achebe (AP & Payroll); the
  sub-vendor and bench tabs read Techpeple the same way. Workers
  (https://claude.ai/artifact/6LHDsk2pMnj1aPBNMZCKT8): Helena Marsh
  (Worker) and Colleen Byrne (Solopreneur). Two figures in them are
  computed at seeding (Rosa Delgado's weeks to bill, the bill from
  Nimbus) and the build reads them live, never as literals.

**Shipped to production 2026-10-27 (4bac05708 on the deploy branch,
source e7a589ec7):** the map home page, built from the corrected
drawing (the four role tabs, each a link at its own address, the
"Signed in as" line, every figure read from `lib/seed-corvane` and
checked by `story-panel-map.test.ts`; the seed overrode the drawing in
three places and the test holds each: receipts "clear the three-way
check" rather than "paid", because the seed pays none; Vietnam's spend
is ₫924,000,000; Maria Lee starts in 5 days); under the panel the two
drawings and the four lines, with "Talk to a person" in the hero and
the band (the papers drawing names Ingrid Sørensen, the one start
Northbend's seed holds for an I-9, not Priya Raman, who has no start in
the seed: the founder's word if he wants Priya); Corvane Packaging
seeded with a region on every site, a regional seat that reads only its
region, Ask Etyme and the thread list for that seat, the By region
views, a company's reporting currency and its own rates with who set
each, Corvane's receipts in the books with a Vietnamese one, its orders'
paper sets, its lines' due dates with pay dates from the world's day
on; and the nightly paper letters reading each night's lines, chains,
seats and names once (the night test went from over 30 s to under 10
with 360 more people). Release pass: type check clean, 12,020 unit,
2,483 integration, build clean, on a quiet copy; the last one-file
commit (the ladder's view of the log write) re-ran its two unit files
and the build. Gates: no source difference, no Ruby, brand kit present,
the three "removed" schema lines re-aligned whitespace. Smoke: every
public page 200, the inbound email door 404 to a POST.
**Open for the founder:** production's world has no Corvane yet: the
map reads the seed and shows, but "Open the demo as Margaret Osei"
answers "There is no world-corvane in this deployment's world" until
`POST /api/seed-world` runs with the cron secret, which the coordinator
does not hold; the walk as the CFO, a regional manager and a hiring
manager runs on a local copy of the seeded world meanwhile. The four
doors' maps wait on "build it" on their drawings.

**The walk as the CFO and an indirect procurement director, 2026-10-27,
said: the home page ships, the first screens behind it do not yet.**
On production the procurement director understands the product in
twenty seconds, every figure on the map adds up, and the four tabs
re-read one company convincingly; but "Open the demo as Margaret Osei"
lands on an unseeded door until the founder reseeds. On a local copy
of the seeded world, the figures agree on every screen and the region
wall holds (Valeria Montes is refused United States, Dayton and a
Dayton thread in a sentence); what disagrees is the words and the
counts: the CFO's greeting names the weeks instead of the $42 and
Aoife Kelly; the head of operations gets the CFO's greeting and "You
are in head of operations"; Valeria is given a count where the home
page names Fernanda Albuquerque; Marcus Hollins hears "three things"
in the chat and "two" on By region, and the chat refuses him the I-9
his own page shows; By region shows local money only, no dollars per
region, a footnote that contradicts its card, "0 paid" in attention
color, and its spend column off the edge at 1440 wide. On production
the Northbend AP clerk's PR-2026-0441 card has Open and Not now and
no Pay. Each is routed: conversation (the greetings, the refusal, the
card shape), demand (By region), market (the demo link until Corvane
exists, the US money cell, "Two minutes" and two unverifiable claims,
the phone table), money (why the pay card is missing on production).
One rule the walk itself broke and discarded: a first pass ran the
browser with certificate checks off; every screenshot kept came from
a run that pinned the proxy's certificate.

**Fixed the same day, with four coordinator's calls, each reversible
by the founder in a sentence.** (1) **The mark counts decisions
only.** "N things need you" and the mark are demand's one list (a held
receipt, a start on hold, weeks waiting), read by By region and by Ask
Etyme from the same `greeting()` data, so one person never sees two
numbers; a time limit is not a decision, so the greeting names it as
its own line after the counted things ("Aoife Kelly in Belfast reaches
the time limit in 14 days") and never counts it. (2) **The pay card
was missing on production because the twin refused itself:** the
twin's own older "approve" question on a receipt made the ledger's
segregation guard refuse every night's "pay" question as the twin
deciding what it drafted (money's diagnosis, reproduced on a copy). An
act may now name the question it replaces (`invoice_receipt.pay`
replaces `invoice_receipt.approve`); the guard ignores the twin's own
earlier questions of a replaced act, and the run closes them as
overtaken. The next nightly run repairs production on its own. And **a
pay question put off with "Not now" is asked once more, the day before
the receipt falls due, and never a third time**; a no with a reason is
a no. (3) **The home page asks the database once whether Corvane is
seeded** and waits at most 800 ms; where it is not, each role's link
reads "The demo is being set up" and leads nowhere, so a buyer never
meets an empty door; a slow answer reads as not seeded on that visit.
(4) **Corvane's head of operations is Astrid Berge**, so one page never
shows two Ingrids. Also: "Two minutes" left the sign-up band (a
promised speed, and `lib/positioning` now refuses one written as a
sentence); the two claims in "In it" link to the page where a reader
checks them; on a phone each region is a short block with the hold and
the held receipt first. Open: a region's order on the record (schema
request: `OrgUnit.position` on REGION units, written in the seed's
order; until then the home region leads and the rest follow by
contractor count); the head of operations' "within 30 days" line
counts regions, not people, until demand's figures carry that count.

**Shipped to production 2026-10-27, afternoon (ccdc8bde9 on the deploy
branch, source fa7195340):** the whole fix wave above. Release pass on
a quiet copy of 60aa99f6e: type check clean, 12,052 of 12,054 unit
(the two reds, a date formatted by hand in By region's note and the
map test's literal "Ingrid Solberg", fixed in the two commits after and
their files re-run green with the type check and the build on
fa7195340), 2,493 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
every public page 200, the inbound email door 404 to a POST; production's
home page says "The demo is being set up" under each role, because
Corvane is not in its world until the founder reseeds. The pay card on
production repairs itself at the twin's next nightly run (06:00 UTC,
2026-10-28), when PR-2026-0441 gets its Pay question and the old
"Approve IN-FMDSDT-20260901" card closes as overtaken.

**The phone keeps the drawing's shape. Decided 2026-10-27, on the
founder's "Why doesn't home look like this website"** (the drawing).
On a desktop the built page matched; on his phone it did not, because
the walk's fix for the hidden columns had turned each region into a
stacked block of eleven lines and the five figures into one per row,
so the map ran several screens long. Reverted: the five figures sit
two to a row on a phone, the one table scrolls inside its own box with
the Region cell pinned on the left, the page never scrolls sideways,
exactly as the drawing renders at 390 wide. Shipped to production the
same hour (73ade6358 on the deploy branch, source 9f2790db4; type
check, the public-site unit files and the build green on the quiet
copy; smoke clean). The lesson, so it holds: a fix to a drawn page
that changes its shape goes back through the drawing, not straight to
code.

**Also in this wave, each with its owner and test sentences:** the
screen fixes from the 2026-10-22 papers walk (a firm accepts or sends
back a paper that arrived; the I-9, a provider's verdict and the
adverse-action steps recorded on screen; a passport refused before an
offer; only a yes puts somebody on the bench; every Extend takes a
chosen day and a reason and shows the route's refusal; a licensed job
checked at submission; the client's NDA asked at interview; supplier
onboarding requires the signed copy and the W-9's edition; a client
reads its order's paper set; the worker answers the screening questions
in words; a license renewal sends its number, issuer and expiry as
fields); a non-compete is not asked where the state voids it for workers
(CA, MN, ND, OK, each with its statute); a renewal request falls due
fourteen days before the paper lapses and a lapsed paper is asked for
once; an I-9 edition is read the way the issuer prints it; Marta
Kowalczyk at Talvern Medical works on a work permit ending six weeks
after her line, so extending her is refused on papers in the demo; a
license warning at submission has its rung on the automation ladder;
the simulation report prints each station's own table. Release pass on
a quiet copy of 7ccfc89ff: type check clean, 11,807 unit (the one red
the generated matrix page, regenerated), 2,401 integration, build clean.

**Shipped to production 2026-10-26 (fd050ca52 on the deploy branch,
source 7ccfc89ff, decisions c0e6c7903):** everything in the two
paragraphs above. Gates on the replay: no source difference, no Ruby,
brand kit present, no schema line removed; the one schema change is the
additive `W9` verification type. Smoke: every public page and the chat
200; the inbound email door still answers 404 to a POST, closed until
`EMAIL_INTAKE_LIVE=1`. The walk on production as fifteen seats runs
after this line is written, and its verdict is recorded under it.

**The second walk, on production fd050ca52, said no again, and the
reasons narrowed.** Fixed and confirmed: the chat's weeks-to-bill equal
Today's for every supplier; the seated MSP's chat reads its client's
program; held receipts read held on both doors; most trade questions
are answered. What stopped the yes, and what was decided fixing it,
each reversible by the founder in a sentence:
- **The pay card is created by the twin's nightly job**, which had not
  run since the deploy; locally, after the job, paying from the chat
  worked end to end. The job runs on its own schedule; the coordinator
  holds no cron secret and does not run it by hand.
- **The 2026-10-19 decision #2 covers the bill, not the button.** A bill
  the twin drafted is sent by the seat holding `invoices.issue`; the
  Owner sends it only where nobody else at the firm does, whether the
  press is in Ask Etyme or on Today, and the refusal names who may
  ("Imelda Santoro or Rosalind Tay sends this bill"). One function,
  `maySendBill` in `lib/money/bill-send`, is read by the send route,
  Today's Send button and the chat. A bill a person drafted is unchanged.
- **A seat in a client's program is in that program for the whole
  session.** Today, Needs attention, the mark and the chat all read the
  program's queue; the firm's own book is read only at home. One person
  never sees two numbers. Open for the founder: a seated MSP is never
  offered the client's weeks to sign, even where its seat may sign them.
- **A screen never offers an act the route will refuse**: the held
  receipt's page draws no Pay (`receiptPayPanel`, the same gate as the
  queue and the payment route).
- **A one-person firm is spoken to as herself and never accepts her own
  week.** Her own acceptance leaves the queue, her page, the seed and the
  chat; the automatic stand-in the routes write stays, because payroll
  reads it; once the client signs, her week waits on the firm above her,
  never on herself. A count stored in a sentence on the night a request
  was raised ("runs out in 24 days") is rebuilt on the day it is read.
- **The notice title names the receipt and the supplier at the source**,
  so email and Teams carry it; a clean receipt's reason says "Pay it".

Release pass on a quiet copy of adb269b56, fully green: type check,
11,866 unit, 2,418 integration, build. Two reds on the way were the
harness, not the product: an import path tripping a guard, and the
seeded stand-in acceptance stamped at the same second as the signature
it stands behind.

**Shipped to production 2026-10-26, evening (4279c3a7f on the deploy
branch, source adb269b56):** every fix above. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
public pages and the chat 200, the inbound email door 404 to a POST.
The pay card appears on production after the twin's nightly job next
runs (06:00 UTC); the third walk on production records its verdict
under this line.

**The third walk, on production 4279c3a7f, said yes.** On all fifteen
seats and Brightmoor's Finance seat, the mark, the greeting and Today
carry one number; every item is on both screens; an act on one shows on
the other; all nine faults of the second walk are closed, paying from
the chat proven on a local copy of the same source after the nightly
job. Three small disagreements remain, each with an owner: a one-person
firm's Timesheets list says "Submitted" where every other screen says
signed and waiting on Halcyon (demand); a bill card drafted before the
past-due sentence existed never gets it, and a stored "sent <day>" count
goes stale, the same rule as the renewal count, to be rebuilt on the day
it is read (money, conversation); the raw decisions route still answers
a seated MSP's own queue though no screen reads it (demand). Wording:
"near the time limit" for a person past it; the digest title says
"need approval" over items that say "Pay"; the AP clerk is called "the
AP clerk" to her face.

**All of those leftovers shipped to production 2026-10-26, night
(7f1bb5f31 on the deploy branch, source 76f1fefc6):** a one-person
firm's Timesheets row reads "Signed · waiting on Halcyon Talent"; a
seated firm's bare queue answers its program; a drafted bill's card
reads its past-due line on the day it is drawn, in the chat and in
Teams; "past the time limit" is said as past; the Teams digest titles
payments as paying; every sentence addressed to the person paying says
"you"; a renewal request names the firm asking on every screen and in
the stored row. Release pass fully green on a quiet copy: type check,
11,876 unit, 2,425 integration, build. Gates clean, smoke clean, the
inbound email door still 404. Still to look at once: the pay card on
production after the twin's nightly run (06:00 UTC, 2026-10-27).
