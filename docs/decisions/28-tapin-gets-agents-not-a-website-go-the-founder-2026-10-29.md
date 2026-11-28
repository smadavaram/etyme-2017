## Tapin gets agents, not a website — "Go", the founder, 2026-10-29

The founder asked whether Tapin should have a public website of its own
to attract clients and candidates, or whether to build agents first to
transact and let firms host a website elsewhere. Tested against the five
questions, the website scored on nothing but micro-distribution and the
agents on the core problem (a recruiter's day lost to handoffs), credit
(a signed week that moves itself is what a lender can advance against)
and the one number (acts per day). **Decided: agents first, and the
generated company page is the website.** Every company already has a
public page at `/site/<slug>`, read from its own record (what it does,
who is coming free, the positions it works, an ask box into Ask Etyme),
and it fills itself the moment Tapin's people are on its bench. No
separate marketing site, blog, SEO pages or careers portal; a firm that
wants those hosts them anywhere and links to its Etyme page. Built in
this order, on "Go":
1. **Tapin's week on Etyme**, walked on screens on a local copy as a
   supplier signing up fresh: people onto the bench by their yes, the
   first prime linked by one ask and one yes, papers filed, a job
   answered, a week filed and signed, the bill drafted. Every gap is
   the roadmap (release).
2. **The supplier-side agents**: the twin's acts turned toward a
   supplier, each a new act kind in the role contract first with its
   tier (architect), then a card in the supplier's Ask Etyme
   (conversation): put a matching bench person forward to a job the
   firm was sent; ask a person for the papers a start needs; draft the
   bill the day the week is signed (exists); ask for a renewal before a
   paper lapses (exists); tell the recruiter who is coming free and who
   is idle. Yes and Not now, through the one approval route; NEVER
   floor unchanged.
3. **"Join the bench" on the generated page**: one door for a candidate
   into the bench ask that already exists, never a second record of
   them (market, on the public page; supply's bench ask unchanged).
4. **`tapin.etyme.com` opens Tapin's generated page**, and a firm's own
   domain later: a host mapping, not a site (architect).

**Built and shipped to production the same day (b0881c5a6 on the deploy
branch, source f0e939f76).** The supplier's three act kinds in the role
contract (`bench.put_forward`, needs a yes from the seat holding
`submissions.create` and never the Owner where another seat holds it,
performed through `POST /api/submissions` itself so consent, the time
limit, licenses and the band are the route's own, a yes with no rate
refused, a yes from Teams sent to the web; `papers.ask_for_start`, acts
alone through regulatory's clearance ask where `mayChasePaper` says the
set is confirmed; `bench.coming_free`, acts alone, one summary a week
by name to the seats that submit, nothing outside the firm), the
supplier's default contract listing all five with `bill.draft` and
`bill.send`, the nightly run raising them for every supplier-kind firm
(`runSupplierActs` after `runSupplierBills`), every entry ledgered under
the Owner's role and the supplier's twin named in the access log; the
three cards in the supplier's Ask Etyme (the why on tap, a rate box,
`NEEDS_RATE` and `PUT_FORWARD_SIGNED_IN` reused from the performers,
the start ask as "Ask Etyme asked <person> for <papers>", the refused
ask carrying the gate's sentence with the link to setup, coming free as
one line of names never counted in the mark); "Join the bench" on a
staffing or bench firm's generated page, the yes from the invitation
letter and never on the page, one reply on every path, a cap per page
per hour, through supply's one function `askOntoBench` in
`lib/consultant-portfolio/bench-ask` that Add consultant calls too, the
public lookup logged as `PUBLIC_PAGE_ADDRESS_LOOKUP` with no actor
before the reply; the do-not-return picker reading the bench listing;
a corp-to-corp worker about to start chased against her own set; and
a firm's Etyme address on `<slug>.etyme.com` opening `/site/<slug>`
through the middleware (the app's own pages sent to the main host, a
stranger's subdomain the home page) once `*.etyme.com` points at the
deployment, which is the founder's DNS line. Coordinator's calls on the
way, each reversible in a sentence: a brand-new person asked onto a
bench no longer gets a seat at the firm before their yes (the
2026-10-22 rule applied to both doors); no Owner-only exception for
putting somebody forward (a firm where only the Owner submits is told
to put them forward from the job's page); the twin offers only
existing matches of 70 or more with confidence above LOW, at most three
people per job per night; coming free goes out once a week; no
role-contract rows are seeded, so the shipped default reaches every
firm. Release pass on a quiet copy of 107ba513b: type check clean,
12,358 of 12,359 unit (the one red the posture's route count, fixed in
f0e939f76), 2,592 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
every public page and the four doors 200, `/site/tapin` 200 on
production, the inbound email door 404 to a POST. **Open:** the
founder's DNS line for `*.etyme.com`; the setup page has no address for
a single item, so the refused start ask links to the checklist, not
to Papers you require; the start-papers line reaches only seats that
get HR's notice; the Tapin walk on screens records its verdict under
this line.

**The walk said: Tapin cannot run its week on Etyme. Do not ship as
"Tapin runs on Etyme".** Sign-up, the checklist, three people onto the
bench by their own yes (one seeded, no second record), the link to
Brightmoor and putting a person forward all work on screens. The chain
stops at the award: insurance Brightmoor accepted on its Paperwork
screen never reaches the record the award checks, so "Place" refuses
every time, and no week, signature, acceptance or bill followed. Also
found, each with its owner: the job's rate band posts dollars where the
record holds cents, so $90–$110 reads $0.90–$1.10 (demand); a W2's own
page shows the prime's rate to his firm, a rung he is not party to
(money); the award raises a second order beside the one raised by hand
(money); "Record a placement" fails for every firm on a company id the
session does not return (money); a firm with more than one person has
no screen to file its own W-9, insurance or good standing, and the
client's Document requests page cannot open or accept what arrived
(regulatory); an agreement can be recorded but never signed on screen,
and recording the prime's order is refused naming a role the prime does
not have (money); Brightmoor's owner is never told in Ask Etyme that a
link request waits, Tapin's greeting never mentions the job, the
interview or the placement, and the page says "a letter is on its way"
where no email can be sent (conversation); the account manager is
refused sending a job, Tapin's job page has no way to put somebody
forward, and "Answer interview" opens an empty page (demand); the
checklist never shows where an answer came from and a skipped item
reads "Saved by" (architect); details typed for a person who already
has an account are silently dropped (supply); `/site/<slug>` shows a
client nothing to act on (market). Report:
`scratchpad/walk-tapin/report.md`, 172 screens. The fix wave goes
ahead of other work, per "the two trust flows get the first seat";
the second walk records its verdict under this line.

**The fix wave shipped to production 2026-10-30 (1dd0b5ad0 on the
deploy branch, source f73276c07).** Every fault above closed, each with
its owner's test sentences: a supplier's certificate accepted by the
client on Paperwork, on Document requests or through the examine route
is written by one function (`recordSupplierPaper`) onto the record the
award, the clearance and the nightly watch read, so the award clears
the same day; the refusal names the firm once; a firm with a team files
its own W-9, insurance and good standing from Company paperwork
(`mayFileFirmPapers`); the rate band is stored in cents through one
reader (`centsTyped`/`typedFromCents`); who may send a job down depends
on the kind of firm (`who-sends.ts`); a job received from a prime has
"Put forward"; the award joins the prime's existing open order between
the two firms and says so where the dates differ, order numbers take
their suffix from both firms, and the client's award row never carries
the prime's order to its sub; a worker's own page and rate history read
only the line that pays her (`isWorkersOwnPayLine`, `ownPayLineWhere`);
"Record a placement" reads the caller's company from the seat; the
order refusal names the roles that may at that kind of firm; an
agreement is countersigned on screen; a link request is a card with
Yes and Not now and on the one decisions list with a join request, so
Today and the mark agree; a sub-vendor's greeting names the job it was
sent, the interview and the start, and firms below the supplier hear
their person's rounds; a said notice stays in "Since you last looked"
five minutes, which was why the first walk's greeting missed notices;
a bench firm's page gives a client who is coming free (only people who
said yes to being shown beyond the firm, never a name or a rate), an
ask box into the firm's Ask Etyme and the firm's contact, and never
claims a letter went when none could; the checklist says where each
answer came from (DOMAIN with the domain quoted, PAPER with the W-9
line, PERSON), a skipped item says skipped, every item has its own
address; what a firm types about a person who already has an account
is kept on its own listing (`BenchListing.firmHeadline`, `firmSkills`,
`firmLocation`, `firmNotes`) and never on the person; "Answer
interview" opens the round. Release pass 30 on a quiet copy of
f73276c07, fully green: type check, 12,420 unit, 2,605 integration,
build. Gates: no source difference, no Ruby, brand kit present, no
schema line removed. Smoke: every public page, the four doors and
`/site/tapin` 200, the inbound email door 404 to a POST. Still open,
with owners: a firm that lists a person can overwrite that person's
own profile through the edit route (supply); the award's cover sentence
reads "The supplier" where no name is passed from other callers
(demand); the seed's dead 12-day cover at Cavanaugh (architect). The
second Tapin walk on screens records its verdict under this line.

**The second walk said: still no, and the chain now reaches the bill.**
Steps one to five work on screens: every checklist answer says where it
came from, three people onto the bench by their yes with what Tapin
typed kept, the link request a card and one number on Brightmoor's
mark, greeting and Today, the agreement countersigned, the order
raised, Tapin's own papers filed and accepted, the job sent by the
account manager and read at $90–$110, Put forward, the interview
answered from the worker's page, the award clearing on the accepted
insurance, the week signed by Northbend and accepted by Brightmoor and
Tapin ($5,200 signed, $4,000 accepted at each rung, $1,800 owed to
Ravi, who sees only his $45). Three things stop the week, each with
its owner: **the employer cannot record its own W2's I-9** (Tapin's
Compliance page lists starts only at the client rung, the upload lands
on the Northbend–Brightmoor line and Brightmoor is told; regulatory);
**Activate asks for a reason and draws no box** for a paperwork
warning (demand); **the bill can never be sent**, because the award put
a line starting Oct 19 on Brightmoor's order that opens Oct 30, the
check fails "starts before PO opens", only Brightmoor may waive it and
Brightmoor cannot see an unsent bill or change its order's dates
(money; the 2026-09-19 rule says a line outside its order's window is a
sentence, never a refusal). Also: the start card's Open lands on a
missing contracts page (demand); Today says "Sent, not yet paid" of a
bill never sent and the order shows $4,000 drawn for it (money);
Tapin's Paperwork says "not examined" after Brightmoor accepted and the
request still asks (regulatory); bench counts differ across Consultants,
Today and Ask Etyme (supply); Northbend's mark stale until a reload
(conversation); wrong words: "Brightmoor employs Ravi", "Accounts
Receivable" raises an order, "BILL RATE" for what the prime pays,
"vendor / client / msp", "organisation" on a public page, a client's
chat suggestions on a supplier's seat, the sign-up panel speaking to a
client, "(job MSA5YG)". Report `scratchpad/walk-tapin-2/report.md`,
218 screens. The third walk records its verdict under this line.
