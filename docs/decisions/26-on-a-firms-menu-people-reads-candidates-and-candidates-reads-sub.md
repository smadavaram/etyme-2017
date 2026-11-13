## On a firm's menu, People reads Candidates and Candidates reads Submissions — the founder, 2026-11-03

*"People = candidates. And Candidates = submissions."* Said from
Tapin's Owner seat. At a staffing firm the people on its bench, in its
training and on its roster are its **candidates**, and the ones it put
forward to a job are its **submissions**; "People" is nobody's word
there. So on the supplier's, integrator's and MSP's menus the link that
read "People" reads **Candidates** (Bench, Bench pay, Bench check-ins,
Training, Consultants fold under it as before), and the link that read
"Candidates" reads **Submissions** (Interviews folds under it). Machine names, routes and keys do not move. The eyebrows, the chips,
the greeting ("who is on the bench", "who applied") and the
documentation's party table follow the labels. Architect (lib/nav-table,
lib/page-framing, the two tables below) with conversation for the
words, in the wave after the 2026-11-03 retest deploy, with the hat
switch.

**Corrected by the founder the same hour: the client's menu too.**
*"Hiring managers also see submissions as submissions or applications.
Candidates is a memory of candidates they would like to reach out to."*
So one word means one thing on every menu. **Submissions** is who was
put forward to a job, on a client's menu as on a supplier's (a hiring
manager says submissions or applications; Interviews folds under it).
**Candidates** is the people a firm keeps: a supplier's bench, roster
and trainees; a client's memory of the people it would like to reach
out to, which the record already holds as the people put in front of
it, the ones it starred (`Favorite`) and its past contractors, each
with "Ask for them" to the supplier holding their consent. So the
client's menu reads Ask Etyme · Today · Jobs · Submissions · Timesheets
· Invoice receipts · Contractors · Candidates · Suppliers · Settings:
the four steps, then the three lists a hiring manager keeps (who is on
site, who I would like, who supplies), then Settings. Two coordinator's
calls, each reversible by the founder in a sentence: the client's menu
grows to ten links rather than folding the memory under Contractors,
because the founder named it as its own noun; and the home page's four
chips keep "Candidates" for the step until the founder says the word,
because the chips are the buyer's four nouns of 2026-10-14 and a chip
is a step, not a list. **Built 2026-11-03**: `lib/nav-table` draws
these words in the process order below, and the table under
"Navigation per company type" moved in the same commit, so
`sidebar-nav.test.ts` reads the truth.

**"What is the use of You for an Owner?" The founder, the same hour,
on Tapin's Owner seat reading a "YOU" list under the firm's links.**
None, unless the Owner is also on a placement. The list is the
person's own pages as a worker (Your work, Your page, Who has you,
Your data, Your paperwork), and the menu draws it whenever the work
makes the person a worker (`ownPage` in `lib/consultant-portfolio`,
read off a placement, a submission, a bench listing or a line that
pays them), never off the seat. Under the two-hats decision above it
leaves the left menu: it becomes the "You" hat in the account menu,
offered only where that work exists, so an Owner on no placement sees
no You at all, and an Owner who is also placed switches to it on
purpose. Where Tapin's Owner sees it today, the record holds a
worker's row for that address (the candidate seat made by the account
mix-up of 2026-10-20 is the likely one); the hat switch takes the list
off the Owner's menu either way, and the architect reads which row it
is and says so before anything is ended.
**Confirmed by the founder the same hour:** *"You can go under
profile and they switch to worker account."* So the worker's pages
live under the profile, the account menu at the top right, as the
switch to the worker account, and nowhere on the firm's left menu.
Switching there is switching the whole app to the worker's view (the
menu, Ask Etyme, the mark and Today), and switching back is the same
one click; the person is never shown both at once.

**Contracts, not Contractors, and Contracts stands between Submissions
and Timesheets on every firm's menu. The founder, the same hour:**
*"What is contractors — is it Contracts Buy or sell? We already have
candidates, so don't see a need for contractors — but see a utility for
contracts on sell side or buy where documentation happens and hiring
happens, followed by timesheet and expense submit, sometimes to client
or sometimes to employer."* So the noun is the document, not the
person: a person is a candidate until the award, and from the award on
the thing a firm holds is a **contract**, the line that carries the
papers, the start, the rate and the dates, with the weeks and the
expenses hanging off it. Decided, each a coordinator's call reversible
by the founder in a sentence:
- **The client's menu reads Contracts where it read Contractors**: its
  buy side, one row per person placed, with the supplier, the order
  line, the rate it pays, the papers, the start and the time on site,
  and the tabs that folded under Contractors (Ending soon, Past, Tenure,
  Duplicate check) folding under Contracts instead. "Contractors" leaves
  every menu. It stays the buyer's word for the person on the public
  pages ("Know what every contractor costs"), because a page speaks of
  people and a menu names what the firm holds.
- **A supplier's, integrator's and MSP's Contracts is a link of its
  own**, no longer three tabs under Companies, with **Sell** (the line
  that bills the client or the prime) and **Buy** (the line that pays a
  sub-vendor by order or the firm's own employee by payroll) side by
  side and the POs beside them; Companies keeps who the firm trades
  with (clients, suppliers, contacts, agreements). This answers the
  founder's "Where are the contracts for Buy and sell" of the same
  morning.
- **The order on every firm's menu is the process order:** Jobs ·
  Submissions · Contracts · Timesheets · then the money document
  (Invoice receipts for a client, Bills for a supplier), then the two
  lists the firm keeps (Candidates and Suppliers for a client;
  Candidates and Companies for a supplier), then Settings. Ten links
  with Ask Etyme and Today; the one-person firm already reads Contracts
  and is unchanged.
- **An expense follows the contract the way a week does**: filed once
  by the worker against the line, reimbursed by the employer on the buy
  line, and billed to the client on the sell line only where the
  agreement between that pair says the kind is billable (the
  2026-10-19 rule); "sometimes to client or sometimes to employer" is
  that rule read from the worker's side, and nothing new is built for
  it.
Built with the hat switch and the Submissions and Candidates rename,
in one commit per domain, the two tables below moving with
`lib/nav-table` so `sidebar-nav.test.ts` stays green. Machine names,
routes and keys do not move.

**Built the same evening (architect, 745397fa8, 827ba166b, 06455f31a).**
Every firm's menu reads the process order (client: Ask Etyme · Today ·
Jobs · Submissions · Contracts · Timesheets · Invoice receipts ·
Candidates · Suppliers · Settings; supplier and integrator the same
with Bills and Companies; an MSP with no Candidates, nine); "People"
and "Contractors" are on no menu; no route, key or file name moved;
the navigation table below matches the code and the test reads it.
The account menu lists every firm seat as "Company · Role" and "You ·
<first name>" only where `ownPage` says the person is a worker; the
current hat is marked; one click switches; the left menu, search, the
+ button, the tab row and the page headings read one hat; a link into
a worker's own page opens the You hat and a page only the firm's menu
holds opens the firm hat; the hat is remembered in one cookie
(`etyme_hat`, `firm` or `you`, with the seat id after a colon where
the person holds more than one seat), read on the server through
`readHatCookie` in `lib/nav-table`, so Ask Etyme can greet the hat
being worn; a seat chosen in the account menu is used only where it is
the person's own and live, and a switch between firm seats is logged
by the route that always logged one. Twenty-six test sentences in
`__tests__/invariants/two-hats.test.ts`. Coordinator's calls on the
way, each reversible in a sentence: a worker whose seat holds nothing
beyond their own work (Karthik Menon) opens in the You hat, because
the firm hat would show only Ask Etyme; a Member with no permissions
and no work keeps their own pages beside Ask Etyme as one hat; the
You hat keeps the person's conversations inside Ask Etyme and offers
nothing on the + button; switching hats reloads Ask Etyme so the
greeting and the number are read again; the client's Candidates link
opens the people page on Everyone until demand orders Favorites and
Recent engagement first; a supplier's Companies carries no Agreements
tab because no supplier agreements page exists. One lesson, so it is
not paid for twice: the words commit was pushed red on `map.test.ts`
alone, because a matrix line was added without regenerating the
matrix page; the fix followed in the next commit, and a commit that
touches `src/lib/matrix.ts` runs `npm run matrix` and the map test
before it is pushed. **Where the founder's own worker row at Tapin
is**, to be read on production: `ownPage` says worker for the Person
whose email is the Owner's if any of a `ConsultantProfile`, a
`SellContract`, a `Submission` or a `BuyContractCandidate` row carries
that `personId`; a `ConsultantProfile` alone is enough and is the
likeliest (a "Your page" edit or a bench listing). From this build the
Owner's firm menu shows no You list either way; the row only decides
whether "You · Sharath" is offered in the account menu. The words
around the new nouns (the greeting and chips per hat, page-framing's
titles, the nav answers, the client's Candidates page heading and
filter order, the alumni sentences, the documentation's party table)
are conversation's, demand's and market's, built in the same wave.
**Conversation (f7692126c, 4e407c70b, 0255a0be0, 33158bb93) and market
(d390e6f2a), the same evening.** Ask Etyme's greeting, chips and mark
follow the hat through one function (`asYou` in the twin route, read
off the account menu's own cookie and its own rule `offersYouHat`), so
one hat never shows two numbers: an Owner who is also a worker is
greeted as the firm until they put on the You hat, and an Owner on no
placement is greeted as the firm whatever the cookie says; "Where are
my contractors?" answers Contracts, "Where are my candidates?" the
memory at a client and the bench at a supplier, "Who applied?" opens
Submissions, and "on site today" opens Contracts; the client's people
page is headed Candidates; a notice written before 2026-11-03 that
said "<supplier>'s bill" is read in the client's greeting as the
supplier's invoice through one reader; and who hears that a paper
arrived is HR and the compliance officer, else the Owner, else the
Admin, never the sender or a colleague (`paperExaminersAt`), wired
into the documents route by regulatory. Coordinator's calls, each
reversible in a sentence: a seat with no role of its own is greeted
as a worker in either hat; in the You hat only a notice that opens a
page on the You menu is said, so the person's own week notices stay in
the firm hat as before; threads other companies wrote to the firm wait
for the firm hat; both hats share the one saved Ask Etyme thread (a
thread per hat is a schema change); the compliance officer hears a
paper beside HR. The documentation names the menu links where they
help ("On a client's menu, people it may ask for again are under
Candidates. People working there now are under Contracts.") and keeps
"Contractors" as the heading of the people page, the buyer's word for
a person. **One word, said by the founder on 2026-11-04 ("Update
it"):** the home page's second step reads **Submissions**, so the four
steps are Job · Submissions · Timesheets · Invoices on the chips, the
product pages, the documentation spine, the flow charts and the door
maps, and "Candidates" means one thing everywhere a buyer reads it:
the people a firm keeps. This supersedes the second noun of 2026-10-14
and the coordinator's call of the day before; market builds it.

**Master data sits under Network. The founder, 2026-11-04:** *"Also
bring all master data under network hierarchy."* The master data is
what the documentation split named on 2026-09-30: the business partners
(customers and suppliers) and the consultants. So on every firm's menu
the two lists it keeps fold under one link, **Network**: for a supplier,
integrator or MSP the tabs **Candidates** (Bench, Bench pay, Bench
check-ins, Training, Consultants under it) and **Companies** (Clients,
Suppliers, Contacts, Agreements, Scorecards); for a client the tabs
**Candidates** (its memory of people) and **Suppliers** (Contacts,
Agreements, Supplier scorecards). The menu reads Ask Etyme · Today ·
Jobs · Submissions · Contracts · Timesheets · the money document ·
Network · Settings, nine links again, in the process order with the
network after the money. The shell draws Network's two groups as one
grouped tab row (the group's name, then its pages), so a person reaches
Bench or Contacts in one click from the link; every page keeps its
address. Two coordinator's calls, each reversible in a sentence: Sites
stay under Settings, because a site is the firm's own place and a
setup item, not its network; and an MSP's Network holds Companies
alone. Built by the architect from the sentence, the CLAUDE.md table
moving in the same commit, with conversation (`NAV_TOPICS`, the
greeting's links) and market (the documentation's menu words) after.

**Paperwork is a tab of Contracts, not a thing of its own. The founder,
2026-11-04:** *"Let's fix all navigation and then update screenshot.
Should the paperwork be connected to contracts — why is it
navigationally independent? Does it make it easier?"* It should, and
it does: a paper lives on the line, on the side it protects
(2026-09-18), and documentation happens on the contract (his own words
of 2026-11-03). What was still independent is HR's working list and
the firm's own papers, filed under Settings (Paperwork, Missing
paperwork, Document requests, Screening packs, Compliance, Check queue)
and, at a client, Compliance and Document requests under Settings too.
So **Contracts** carries the tabs **Sell · Buy · POs · Paperwork**, and
Paperwork is one list across every line, each row a line (the person
or the firm, the paper, asked · arrived · examined · on file, who owes
it, the start it holds), opening the line; Document requests, Missing
paperwork, Screening packs, Compliance's starts and the check queue
fold into it, and a client's Compliance and Document requests the same;
the firm's own papers (its W-9, insurance, good standing, the papers a
customer holds it to) sit on the same tab as the firm's own rows,
because they are the sell side's papers. Settings keeps **Papers you
require** (the sets, a setup item), the DNR list and the automation
ladder. Every page keeps its address. Two coordinator's calls, each
reversible in a sentence: the one-person firm's Paperwork link stays
as it is (her two hats as two tabs, decided 2026-09-21); and the
worker's "Your paperwork" stays on her own list. Built by the architect
after Network, in the same navigation wave; the walk then retakes every
screenshot on the fixed navigation before the deploy, per "fix all
navigation and then update screenshot".

**The morning of 2026-11-04, after the box restart.** The three
agents cut off by the hourly limit were finished by fresh agents of
the same domain from the diffs in the tree: regulatory (eded7ecdc) made
the request builder, the backfill and the worker's page read what the
placement reads through one reader (`heldOnRecord`, `heldAcross` in
`lib/document-stages/paper-record`, typed by every firm on the person's
lines, with `checksThatAnswer` closing proof of right to work by the
I-9 behind it), closing R1, R1b and R3 in tests; conversation
(e0a4e2fa7) reversed f7692126c's call so a seat with no role of its own
wears the hat the account menu says (Karthik Menon's firm hat reads
"Nothing of Teleworld's is addressed to you; your own work is under
You"), and a colleague's paper is never said to a seat without the
paper's permission in either hat (`hearsPaperNotice`); the architect
(c3a397f3c) made a one-person firm's account menu offer no You hat
through the same code the screen reads (`seatLinesFrom`,
`hatsForSession`; the old test fed the menu a hand-made seat list the
screen never receives, which is why it passed while the screen did
not); market (ceba23d4a) made the second step read Submissions on every
public page (the step name in one place, `steps.ts`, read by the chips,
the step pages, the panels' table titles, the "In it" line, About and
the MSP door map), with the address `/docs/candidates` kept because
routes do not move. Open from it: the worker's page reads an
unexamined upload as "sent, waiting" while the placement reads it as
held (the founder's open line); Ask Etyme's own sentence still says
"jobs, candidates, timesheets and invoices" (conversation, with the
Network words); the backfill's wider reach has run on no database.

**The process order, in the founder's words, 2026-11-04:** *"Jobs,
Submissions, Contracts for Buy & Sell, Timesheets, expenses, Billing
(AR), Invoice Receipt (AP), Payment in, Payment out and Payroll.
Remember even bench vendor can have c2c contracts and restricted only
to bench business."* So the menu follows that sequence, each station
a noun or a tab of the noun before it, in this order: **Jobs ·
Submissions · Contracts** (Sell · Buy · POs · Paperwork) **· Timesheets**
(Timesheets · Expenses) **· Bills** (the firm's billing upward, AR:
Bills · Payments in) **· Invoice receipts** (what it receives from
below, AP: Invoice receipts · Payments out) **· Payroll** (its own
employees) **· Network · Settings**, with Ask Etyme and Today first. A
supplier, integrator or bench vendor reads all of them, eleven links;
a client reads no Bills and no Payroll (it sells nothing and employs
no contractor), nine; an MSP reads no Payroll. Two coordinator's calls,
each reversible by the founder in a sentence: Expenses, Payments in
and Payments out are tabs of the noun before them rather than links
of their own, so the menu stays short while every station is one
click away in his order (say "each its own link" and they become
links); and Payroll is a link of its own because it is neither a bill
nor an invoice receipt (the party who issues a document names it).
**A bench vendor is never restricted to its bench**: it reads the
supplier's whole menu, its Contracts carry its corp-to-corp buy lines
paid by invoice receipt beside its W2 lines paid by payroll, and
nothing on a menu, a chip or a greeting is hidden by a firm's posture
(prime, sub-vendor, bench are positions on a deal, never a kind). Built
by the architect in the same navigation wave, after Network and the
Paperwork tab, the CLAUDE.md table moving with the code.
**Network sits above Jobs. The founder, the same hour:** *"Network
can stay above the jobs."* The master data comes first and the process
follows it, so every firm's menu reads **Ask Etyme · Today · Network ·
Jobs · Submissions · Contracts · Timesheets · Bills · Invoice receipts ·
Payroll · Settings**, a client's without Bills and Payroll, an MSP's
without Payroll. This replaces "the network after the money" in the
Network paragraph above.

**The navigation wave is built (architect, 36b0408e2, e9241d9e7,
730d712fb), the same morning.** Supplier and integrator read Ask Etyme
· Today · Network · Jobs · Submissions · Contracts · Timesheets · Bills
· Invoice receipts · Payroll · Settings (eleven); an MSP the same with
no Payroll (ten); a client Ask Etyme · Today · Network · Jobs ·
Submissions · Contracts · Timesheets · Invoice receipts · Settings
(nine). Network's groups: a supplier's Candidates (Candidates, Bench,
Bench pay, Bench check-ins, Training) and Companies (Companies,
Suppliers, Contacts); a client's Candidates and Suppliers (Suppliers,
Contacts, Agreements, Supplier scorecards); an MSP's Companies alone.
Contracts' groups: the lines (Sell contracts · Buy contracts · POs) and
Paperwork (Paperwork · Missing paperwork · Document requests · Screening
packs · Compliance · Check queue; a client's Compliance · Document
requests). Bills holds AR, Invoice receipts is the AP page, Payroll
holds Commissions; Rolloff stays under Timesheets and Reports under
Today; Sites stay under Settings. The grouped tab row is
`GroupedTabRow` in `components/shell/section-pills`, the grouping
`NavItem.group` through `tabsFor().groups`; a group with a page named
after it links to that page, otherwise the name is plain text. The
foot of the menu names the role a seat actually holds, or "Member"
(Karthik Menon reads "Integrator · Member", never "Delivery";
`footerRole` in `components/shell/sidebar-props`). Every page keeps its
address; `lib/page-framing` was not changed. Coordinator's calls on the
way, each reversible in a sentence: no separate payments pages exist,
so "Payments in" is the AR page and "Payments out" the AP page under
their own labels; "Papers you require" has no Settings link of its own
(its address is the setup checklist's dynamic one, reached from the
checklist, Today and the greeting); a supplier's Network carries no
Scorecards or Agreements tab because those pages are a client's; the
tab labels stay "Sell contracts" and "Buy contracts". One lesson, so
it is not paid for twice: the coordinator's CLAUDE.md commit 2e2bfb5cc
swept the architect's uncommitted edit of the navigation table into
itself, because `git add CLAUDE.md` stages the whole file; a CLAUDE.md
commit made while an agent may be editing the table checks `git diff
--cached` first, or waits. Conversation (`NAV_TOPICS`, the four steps'
sentence) and market (the documentation's menu words) follow in the
same hour, then the matrix rows, release pass 36, the walk with the
navigation screenshots, and the deploy.
**Conversation (a46289407, 0d69fbd25), market (09b5cdc41) and the matrix
(56eca337b), the same hour.** Ask Etyme says where a page is on the new
menu: "Where is our master data?" and "Where is our network?" answer
Network with its two groups, "Where is our paperwork?" and "Where is
compliance?" the Paperwork tab under Contracts, "payments in" the AR
tab under Bills, "payments out" and "what suppliers sent" Invoice
receipts, "payroll" and "commissions" Payroll, and a client asking for
payments in or payroll is told no page of hers shows them, because a
client bills nobody and employs no contractor; Ask Etyme's own sentence
names the steps the way the public pages do ("jobs, submissions,
timesheets and invoice receipts") and its refusal lists "jobs,
submissions, contracts, timesheets, bills, invoice receipts, payroll,
papers and people". The documentation's master-data pages say "under
Network", "under Contracts, their papers on the Paperwork tab", and the
time-and-money page says Bills, Invoice receipts and Payroll. Open from
it, conversation's: when a supplier asks Ask Etyme to pay an invoice,
the refusal's "Open Invoice receipts" link opens `/dashboard/invoices`
(its Bills) rather than `/dashboard/ap`, because `neverSays` is not
told whether the seat is in a client's program; money's `receiptsLink`
already decides it and is the fix.
**Release pass 36 on 0d69fbd25:** type check clean, 13,605 of 13,612
unit, 2,642 of 2,645 integration, build clean. The seven unit reds were
old assertions naming the eyebrows and links the navigation moved
(Candidates, Companies and Settings, now Network and Contracts; a
nav-table comment that wrapped), brought up to the code in cd4f95f5c
with no product file touched, each green alone. **The three integration
reds were a real regression from eded7ecdc, found by the pass and not
by any walk:** the papers fix stopped listing any request item asking
for a kind already on file and in date, and the nightly license renewal
asks for exactly that, so Colleen Byrne's renewal ask vanished from her
page and her greeting and "who asked" read the Wisconsin Board of
Nursing, the issuer of the only license row left. Fixed in 4cf29d862: a
renewal request (`CREDENTIAL_RENEWAL`) is marked as a renewal by
`/api/me/papers` and `myPapers` never treats the paper being renewed as
its answer; every other request keeps eded7ecdc's rule; "who asked" is
the firm that raised it. One gap, said once: a renewal is recognized
by its packet key, so a route asking for a renewal under another key
would need to set the same flag. Release pass 37 runs on the quiet
tree after both.
**Release pass 37 on 4cf29d862:** type check clean, 13,613 of 13,613
unit, 2,644 of 2,645 integration, build clean. The one red,
`__integration__/sign-in-link.test.ts`, was the test's own pick: it
drew Brightmoor's "placed person" with no order, the seed pays Lucía
Fernández and Tobias Lindqvist from Pinnacle too, and a firm that pays
a person direct may hand them a sign-in link, so Pinnacle rightly read
it; the test now asks for a person nobody at Pinnacle pays, lists or
seats (77c5c2b40, test only, green alone). The fifth walk runs on this
build with the navigation screenshots the founder asked for, and the
deploy follows its yes.

**The fifth walk and the deploy, 2026-11-04.** The walk on pass 37's
build (31 checks on 14 seats: 3 saved and proven, 25 refused or answered
rightly, 2 failed, 1 not proven) said the founder's blocker is closed:
Rosa Delgado's and Omar Haddad's accepted undertakings read on file on
the placement and on Compliance, a fresh W-2 request asks for nothing
and creates no request, Rosa's own page lists nothing still needed, and
the backfill closed 640 items (right to work 464, the undertaking 57,
hot-floor induction 80, sterile-field training 39), so Rajesh Iyer's
request reads "Everything is in". The navigation holds on every seat:
a supplier, a bench vendor (Techpeple) and an integrator read the
eleven links and a client the nine, Network opens its grouped tab row,
Paperwork is a tab of Contracts and gone from Settings, all 60 tabs
and every old address open, the home chips read Job · Submissions ·
Timesheets · Invoices and Step 2 of 4 is headed Submissions; 91
navigation screenshots for the founder under
`scratchpad/walk-saves/shots5/nav/`, every menu and tab row on a
supplier and a client at desktop and phone width. Every fix of pass
36 and 37 holds (Contracts "All 28 · Active 26 · $3,206/hr · 1–20 of
28"; Karthik's firm hat; Colleen's one hat). The walker's verdict was
"does not ship" on two faults this wave did not introduce: Compliance
collapses six people's missing background checks into one row naming
nobody, because `whatThisFirmOwes` leaves the person out of its key
when the firm owes the paper (regulatory; walk 4 had read the same
single row as the truth); and the degree warning is still not told to
the worker, because `degreeCheckForYou` is called only by its own test
while the test name and the matrix row say it is built (regulatory's
call site, conversation's words). **The coordinator's call, reversible
by the founder in a sentence: deploy.** The founder's own blockers are
proven on screens, neither fault makes production worse than it was
(both were there on the 3a35d888d build), his retest has waited a day,
and both are fixed in the same hour for the next deploy. Also found:
Rosa's page lists accepted papers under "Asked for", one twice;
Rajesh's request reads "Finished" while its I-9 is unexamined; the
request link prints a raw past date; Rosa's greeting still asks for
the accepted undertaking; Karthik's greeting reads "You are in
validation engineer"; Colleen's one-person firm is asked to approve
her own expense; the page under Invoice receipts is headed "Accounts
payable" and under Network "Consultants"; an MSP seat could not be
opened outside a client's program, so its own ten-link menu is not
proven on screens. **Shipped to production 2026-11-04 (374f522bd on
the deploy branch, source f55f389b1):** the founder's retest wave
(Activate, every acceptance read by the placement, the pay line, Bill
this week, the I-9 dialog, the packet rows, the picker's reasons, the
sign-in link, the worker door on /demo, the model switch link, the nav
answers), the money and papers fixes of walks 3 and 4, the menu wave
(the hats, Submissions and Candidates, Contracts, Network above Jobs,
Paperwork under Contracts, the process order through the money, the
Submissions step), with release pass 37 green on the product code.
Gates on the replay: no Ruby, brand kit present, no source difference;
the twelve additive columns and two indexes of the two waves land
through `DB_PUSH_ON_BUILD`, still on since October 21. Smoke: health
says "Serving 374f522b from main" with the database reachable and the
schema there; the home page, the demo, the four doors, the
documentation and `/docs/candidates`, about, contact, security,
privacy, terms, the DPA, sign-up and `/site/tapin` answer 200; the home
page's chips read Submissions; the inbound email door answers 404 to a
POST. **The founder's two steps:** run the backfill once on
production, `POST /api/packets/backfill` with `{"write": true}` and his
cron secret (`{}` first to read the counts), which closes the older
requests' items for papers their placements hold; and, when he wants
Ask Etyme to read free text, the model key on the production project.

**The post-deploy fix wave, the same morning, from the fifth walk's
leftovers.** Money (9b7a22853): a one-person firm's own expense is
approved on filing where every seat that may approve is her own (the
automation log says why, reversible while no firm above accepted), so
no card, no queue item and no Approve, and she reads "Filed. It is
waiting on Halcyon Talent to accept it. Your firm is yours alone, so
you are not asked to approve your own expense" in the second person
(`lib/money/own-firm-expense`); demand (fbd7dc47e): the decisions
queue drops her own expenses through money's `ownFirmExpenseIds`, so
her mark, her greeting and Today never ask her. Conversation
(5eb96c9a7, 3bfd8e1a7, 1f308d7ce, 616f05999): a "<firm> needs … from
you" notice is read against the record on the day it is said
(`paper-asks.ts` with `heldOnRecord`), so a paper on file is never
asked for again and a notice names only what is left; a role a firm
named itself is said as the role, "as Validation Engineer", never "in
validation engineer", and a seat with no role "as Member"; the framing
for the AP page (a supplier reads Invoice receipts; a client its
Invoice receipts link above "Accounts payable") and for the people
page (Network · Candidates); and the pay refusal's link is built from
money's `receiptsLink`. Coordinator's and owners' calls, each
reversible in a sentence: her filing counts as her firm's approval
rather than a queue item nobody can take; the queue reads the ten
oldest submitted expenses and then drops hers, so a turn may list
fewer than ten; the AP page and the Consultants page type their own
headings and read the framing only when money and supply wire it
(in flight). Still in flight: regulatory's F1 (each person owed is
one named row on Compliance) and F2 (the worker told when her degree
is warned), Rosa's page listing accepted papers under "Asked for",
"Finished" on a request whose I-9 is unexamined, the raw past date on
the request link; and money's call on where a supplier's "Open Invoice
receipts" lands now that its menu has that link. Then the matrix rows,
release pass 38, a short walk on those cases, and the next deploy.
**Landed, the same hour.** Regulatory (9cfcf3f52, 5d1852ae6, 1a73799ca):
Compliance classes each item as about the firm (the agreement,
insurance, good standing, the W-9, the business partner form: one row
per customer) or about a person (everything else, a background check
the firm owes included: one named row per person, whoever owes it,
keyed by line so two people with one name stay two rows), and a check
the firm owes says "Brightmoor Staffing's to produce for Anders
Achterberg" (`src/app/api/compliance/owed-rows.ts`); the worker hears
about her degree at every door that reads it (her own upload, her
answer to a request, HR's accept on Paperwork and on a request),
through conversation's `degreeCheckForYou`, once per firm and sentence
and never HR's words (`lib/document-stages/degree-told`), and her own
upload now also tells HR at every firm that reads her papers; an
accepted paper is listed once on her page under on file with the firm
that accepted it; a request reads "Received, waiting on HR to look at
I-9 and E-Verify" until every paper is examined or on file, and
"Finished" only then (`progressOf` in `lib/packets`); a stored start
sentence is rebuilt on the day the worker's link is read
(`startSentenceNow`). Money (d5dea6f9c): the AP page is headed by the
reader's Invoice receipts link through the framing, and a supplier,
integrator or MSP asked to pay is sent to `/dashboard/ap`, the page its
menu calls Invoice receipts (reversible: send them back to Bills opened
on what they owe); a one-person firm, with no such link, still goes to
Bills. Supply (77bd11036): the Consultants page is headed Network ·
Candidates through the framing, its subtitle the founder's words.
Corrected in the matrix: the degree row had listed
`degree-told-to-the-worker.test.ts` as built since 3b01b83b2, and until
5d1852ae6 the function was called only by its test. Still open, with
owners: HR's request list prints an older request's stored start
sentence as written (regulatory); an item sent and not yet examined
still reads "On file" on the worker's own list (regulatory, the class
of "On file" without an examination); the `receiptsLink` comment in
the Ask Etyme route still says "a supplier at Bills" (conversation).
**Release pass 38 on 3ff7b7f9f, fully green:** type check, 13,658 unit,
2,645 integration, build. The sixth walk runs on its build
(`scratchpad/walk6-brief.md`: the Compliance rows, the worker told
about her degree, Rosa's greeting and page, Rajesh's request and link,
Colleen's own expense, Karthik's role line, the two headings, where a
supplier pays, and an MSP's own ten-link menu), and the fix deploy
follows its yes. The UX vision the founder asked for the same hour
("don't code right away") is drawn, not built; see "One app, two
views".
