## The setup checklist and the four doors' maps are built — "Build it", the founder, 2026-10-28

"Build it", on the two drawings waiting since 2026-10-27: the setup
checklist with its fill sources
(https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq, eleven items now,
Sites after Addresses) and the four doors' maps (MSPs
https://claude.ai/artifact/CPJviSYK5Uws6bFXLkMgL7, Integrators
https://claude.ai/artifact/AYzwwuCAYXSHj9KS5FosgT, Suppliers
https://claude.ai/artifact/3teoAA3AMXxo1d6GSYpfGq, Workers
https://claude.ai/artifact/6LHDsk2pMnj1aPBNMZCKT8). Read as both,
because both were listed under "waiting on your build it" in the same
line; the checklist first. Built in this order: the checklist's schema
(the company profile, the legal and billing addresses, the people in
charge, the company-level paper sets) and its screens, the reminder on
every page until the list is empty, and the refusals that name the
step (architect, with regulatory for the paper sets as data); the
Integrators, Suppliers and Workers maps from their drawings, every
figure read from the seed (market), the MSP map after the architect
seeds Aptiva's three missing seats. A release pass, then production.

**Built and shipped to production the same day (957f5f38b on the
deploy branch, source 2d68a5de9).** The checklist: `SetupItem`,
`SetupAnswer` (source DOMAIN · PAPER · IMPORT · WEBSITE · PERSON, with
the quote), `CompanyAddress`, `CompanyInCharge`, the profile columns on
`Company`, `RemitTo.accountName` and the Finance check (who, when, for
which client; only the last four digits ever stored), a company-level
paper set per party as every line's floor; `/dashboard/settings/setup`
with the eleven items, Owner and Admin only, each skippable with the
line saying what skipping stops; a W-9 or insurance certificate read by
rules first and by the model only where the company turned it on, every
value shown with its quote and confirmed before it is recorded; the
reminder on Today and one line in the Owner's Ask Etyme greeting
("Finish setting up: your company, addresses, your sites and 8 more.
Complete setup"), never counted in the mark. The gates in
`lib/setup-gates`, each wired: no bill sent without a billing address
(route, Today, chat, twin); no firm paid until its bank is checked
(payment, receipt page, payment run, the twin's question); no paper
chased for a party whose set was never confirmed (the dated chase, the
never-filed and cover letters, the cover re-ask, the license renewal),
with what was held back named in the night's report; a colleague joins
by domain only once the domain is verified. Finance holding the
supplier walk's bank item records who checked the bank and for which
client; a bank change clears the check everywhere it is written
(`bankChange` in `lib/money/remit-change`). The four doors' maps, each
in its party's roles, every name and figure read from the seed or live
through `door-map-facts` under `mayReadLive` (only the seed's own
firms, at reserved addresses; anything else reads "on the demo").
Coordinator's calls on the way, each reversible in a sentence: the
paper sets use regulatory's four parties (W2 workers, corp-to-corp,
sub-vendors, customers); a client is never asked for bank details and
a one-person firm gets no team, sites, people in charge or domain item;
"Your people" (the import) stays on `/start` and leaves the checklist;
every seeded firm that bills gets an address and checked payment
details, so no seeded bill or payment is refused; `PAPER_CHASE_WITHHELD`
is planned (L0) until regulatory writes it; the MSP door's Supplier
manager and Coordinator tabs open Rashida Coleman's seat and say so,
because the demo has no key for those two roles; "Read from our
website", the logo upload and a scanned paper are not built. Release
pass on a quiet copy of c0cef3357: type check clean, 12,312 of 12,315
unit (the three reds a hand-formatted date, a phone grid and a link to
a missing page, fixed in 2d68a5de9 and re-run green with the type check
and the build), 2,592 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, every "removed" schema line
re-aligned whitespace and one unique key widened. Smoke: every public
page and all four doors 200, the inbound email door 404 to a POST.
**Open:** Halcyon's 12-day cover at Cavanaugh is dead seed data (the
chain writes 200 days first); the people in charge are read by no
screen but setup; the walk as every party on the new setup runs next.
