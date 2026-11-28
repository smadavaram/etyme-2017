## Onboarding is tested as every party and fills itself from what the company already has — decided by the founder, 2026-10-27

*"So test and ease onboarding for every party; fetch from any source of
info."* Walked the same day, as eight strangers on a local copy of the
seeded world (165 screens, timed): every party signs up in about two
minutes and every setup answer has a default, so the doors are easy.
Behind them the trust breaks, and the verdict was "do not ship
onboarding as eased":
- a supplier that signed up and is then approved by a client is
  **founded again** as a second company, and the owner is seated on
  both; a sub-vendor's "Add company" founds a third;
- a client with one person **can never approve a supplier**: the card
  tells her to invite a second person, and tells the second person the
  same, which breaks "an approver nobody has named falls back; it
  never refuses";
- an MSP **cannot be seated from any screen** (the grant is API only),
  and has no way to ask;
- an integrator's W2 import lands its people as **bench consultants**,
  commits through a browser pop-up, and shows machine words;
- a person who signed up herself **can never be asked onto a bench**;
  a solopreneur cannot put her own license on file and is asked to ask
  herself; a sub-vendor cannot record its agreement or the prime's
  order on any screen; "On file" is ticked with no file or verdict
  behind it;
- the ten-item checklist, the addresses and "Papers you require"
  decided on 2026-10-20 and 2026-10-22 **are not built**: setup is still
  four steps, and no seeded firm is reminded of anything.
And the scout found one rule breach: the import's document reader called
the model whenever a key existed, with no per-company switch, no masking
and no log. Fixed first (c6f202d52): an import reads with the model only
where the company turned it on, masked through one shared door in
`lib/model-boundary` (names, firms, rates, emails, phones), every prompt
and answer logged.

**Decided, on the walk, each the coordinator's call and reversible by
the founder in a sentence:**
1. **One firm, one tenant.** A firm already on Etyme is found, never
   founded again: by verified domain, then Etyme address, then an exact
   name whose owner shares the email domain (`findFirm` in
   `lib/company-create`). A claim link taken by somebody seated at a
   firm on the same domain joins that firm; approval attaches to the
   firm that applied; a counterparty already on Etyme is linked, never
   copied.
2. **A one-person client is told which role to invite**, and that
   person can decide on arrival; the recommender still never decides.
3. **An MSP is seated from the client's Settings**, and asks for a seat
   from its own first screen.
4. **A W2 row imports as the firm's own employee**, never a bench
   listing; owners and managers are never "on your payroll" unless the
   work says so.
5. **A firm asks a person who already has an account onto its bench
   with the same yes**, never a second record of her.
6. **The apply form is filled once**: labels that stay, the firm's own
   record pre-filled, and a second client reuses the papers and
   references in one click.
7. **Nothing is "On file" without the file or the verdict**: a vendor
   screening carries the provider, reference and date; a D&B report
   carries the file or its number and date.
8. **Every new party's first greeting names its one next act and the
   link** (recommend a supplier; ask a client for a seat; add your
   people; turn on Your page; record your contract and your papers).

**"Fetch from any source", the rule before any of it is built.** The
setup fills itself from, in this order, and says where each answer came
from so a person corrects it in a word:
- **the work email's domain** (company name, country, currency, the
  Etyme address, the domain claim), already in code for the OAuth door
  and now the password door too;
- **a paper the company uploads** (a W-9 carries the legal name, the
  address and the EIN; a certificate of insurance carries the insurer
  and the dates; a license its number, issuer and expiry): read by
  rules first, by the model only where the company turned it on,
  masked and logged, and every read value shown with the quote it came
  from and confirmed by a person before it is recorded;
- **a file the company already has** (its contractor list, supplier
  list, sites, holidays, purchase orders): the import that exists;
- **the company's own website**, by an address the Owner pastes: a new
  outside read, so it is built only with its guard: https only, no
  redirects followed, no private or link-local address, a size cap, a
  timeout, text only (title, the organization's structured data,
  address and phone), never a page the person did not name, never a
  crawl; what it finds is a suggestion the person confirms.
- **Never a mailbox, never a registry Etyme has no agreement with,
  never a page fetched on the person's behalf without their asking**,
  and nothing read from one company fills another's setup.

**Built in this order:** the trust breaks above, one domain per set of
files, the same day (architect: one tenant, the MSP seat screen, the
import, the sign-up's guesses; demand: the one-person approval, the
apply form, the job form's defaults; supply: the bench ask, the roster,
roll-off without a line; regulatory: the evidence behind "On file", a
firm's own papers, the default paper sets as data; money: the
sub-vendor's agreement and sales order on screen, the Buy tab;
conversation: the invited colleague lands in, every first greeting's
next act, the rescue link where no email can be sent; market: the
footer's Clients). Then the checklist with its fill sources, **drawn
first** (https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq: the ten
items with their state, and Your company, Addresses and Papers you
require open, every answer carrying where it came from)
and built on "build it": the schema for the profile, the addresses and
the company-level paper sets (architect), the screens, the reminder on
every page until the list is empty, and the refusals that name the
step.

**Shipped to production 2026-10-27, evening (5a0eb15e9 on the deploy
branch, source 483e96b34):** the whole onboarding fix wave, every trust
break above closed on the record. One firm, one tenant (`findFirm`,
`claimOrJoin`; the supplier's approval attaches to the firm that signed
up; a counterparty already on Etyme is linked where the two trade and
never copied); a one-person client is told which role to invite and the
invited person decides on arrival; an MSP asks a client for a seat from
its first screen and the client grants one from Settings naming the
role (`ProgramSeatRequest`, additive); an integrator's W2 rows import as
its own employees, the import commits from the page in the trade's
words, and a roll-off can be flagged with no project line
(`ProjectRelease.sellContractId` optional); a firm asks a person who
already has an account onto its bench on her own record, and the
thank-you page offers her own page; the apply form has labels that stay,
is filled from the firm's record, and a second client reuses its papers
in one click; nothing is "On file" without the file or the verdict; a
one-person firm files its own W-9, insurance and license, a worker her
own license, certification or degree with the copy kept on her record
(`VerificationDoc` bytes, `CERTIFICATION`, `DEGREE`); a firm's own
staff are offered for petitions and papers as "on your staff"; a
sub-vendor records its agreement and the prime's order on screen, the
Buy tab shows buy lines, and an order raised by hand asks for its first
line; every new party's first greeting names its one next act; an
invited colleague lands signed in; sign-up stays open with no email
key, the confirmation link kept on the notice for staff (a reset link
never is); the sign-up form guesses the Etyme address, country and
currency; owners and managers are staff, never "on your payroll"; the
band's Clients door is the home page. Release pass on a quiet copy of
6e1825fc3: type check clean, 12,164 unit (the one red the posture's
route count, a docs-only fix after), 2,538 integration, build clean.
Gates: no source difference, no Ruby, brand kit present, the seven
"removed" schema lines re-aligned whitespace and the one column going
nullable. Smoke: every public page and both sign-up forms 200, the
inbound email door 404 to a POST, health names the password door. The
second onboarding walk as the same eight strangers runs on a local
copy of this source and records its verdict under this line.

**The second walk, on the same source, said: six of eight parties
eased, two still blocked.** Eased: the client (address, country and
currency guessed; the first act named; the invited Program Manager
decides on arrival), the bench vendor, the integrator (W2s on the
roster, a roll-off flagged with no line), the MSP (asks, is granted,
reads the program), the worker (her page, her papers, a bench ask on
her own record), the one-person firm (her own papers). Mostly eased:
the prime supplier (first apply 23 fields; the second client one click).
Blocked: **a prime and its sub-vendor cannot link**: "one firm, one
tenant" stopped the copy, and each side is now told to ask the other
to add it, with no door that does; so the sub-vendor's agreement and
order pickers stay empty. And **an invited colleague lands on "Select
a conversation"**, not her welcome, and the welcome contradicts the
line above it. Three coordinator's calls, reversible in a sentence:
(1) **two firms already on Etyme link by a request one side sends and
the other accepts in one click**, the way a seat is asked and granted;
the request names the relationship (your client / your sub-vendor);
nothing is recorded until the other side's yes; a vendor adding its own
sub-vendor checks the sub-vendor's papers (W-9, insurance, good
standing, the agreement) and never walks a client's four roles.
(2) **An outside firm is never granted a client's Owner role** on a
seat. (3) **A worker may name a client not yet on Etyme**, as text,
matched the day that company joins. The rest of the walk's list is
wording and wrong doors, routed with the three.

**Shipped to production 2026-10-27, night (42085f3b1 on the deploy
branch, source aa890b891):** the second wave. Two firms already on
Etyme link by one ask and one yes (`TradeLinkRequest`,
`POST /api/trade-links`; a yes writes the counterparty record on both
sides in one transaction; "Add company" for a firm on Etyme offers
"Ask them to link"); a firm never lists itself among its companies; a
vendor adding its own sub-vendor checks its papers (W-9, insurance,
good standing, the agreement) by one person and never walks a client's
four roles; a second client's apply form carries every answer the firm
gave the first, dates included, and HR confirms the supplier's dates
rather than re-typing them; an order raised by hand, by either end,
asks for its first line, and a buy line goes only on an open order
this firm raised to the firm it pays; with nobody to record an
agreement with, the form says to link first; an invited colleague
lands in Ask Etyme itself with her welcome first, and "nothing waits"
is said only when nothing does; every first-act link opens the screen
that does the act; a bench vendor's first act is its bench; an
invitation never claims an email went when none could and never hands
out a sign-in address the person cannot use; a one-person firm's
paperwork speaks to her as the firm; an outside firm's seat never
holds the Owner, the Approver, a role that grants seats or one that
signs hours (regulatory's rule, read from permissions); a worker names
a client not yet on Etyme and it is honored the day exactly one
company of that name joins (`DoNotSubmit.companyName`); the Pay column
never shows a bill rate; a bench invitation's link is kept on the
notice for staff where no email can leave; a pending firm reads the
day it was recommended and one name for its step. Release pass on a
quiet copy of aa890b891, fully green: type check, 12,187 unit, 2,547
integration, build. Gates: no source difference, no Ruby, brand kit
present, the seven "removed" schema lines re-aligned whitespace and
one column going nullable. Smoke: every public page and both sign-up
forms 200, the inbound email door 404 to a POST. Still waiting on
"build it": the setup checklist with its fill sources
(https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq) and the four doors'
maps.
