# Sign-up, login and onboarding — round 4 (2026-10-08)

Walked as every party on a clean copy of c3e294f99. Production build (`next build`, then `next start -p 3104`) on its own copy, database `etyme_walk4`, world seeded with `POST /api/seed-world`, mail captured by a fetch shim. Every new account used a `.test` address. `ETYME_PRIVACY_EMAIL` was left unset on purpose. Verdict: **do not ship**.

Totals: 21 problems, 59 OK. Of round three's 19 problems, 16 are fixed, 2 are partly open (6, 8), and 1 is open in a new place (5). Problems 1 and 2 below are what is left of round three's #5.

The blocker is problem 1. A colleague who joins a client as Member, with no desk, sees only their own pages in the menu. But typing a page address shows the firm's data: the program dashboard with $118,880 this month, every submission with its rate, every job request with its maximum rate, and every contractor with their months on site. The Users & permissions page tells the owner the opposite: "A Member sees their own pages and what is sent to them, and none of the firm's pages."

Round three tested a Member at a new, empty company, so every page was empty and nothing showed. This round also seated a Member at Northbend Athletic, a seeded client with data. That seat was written into the database (person `mo@walk4.test`, EMPLOYEE context, Northbend's own Member role, which has no permissions), because a seeded domain cannot be signed up on. The Member role is identical to the one sign-up gives Lee at Walk Co.

Screenshots: `shots/` in the session scratchpad, named `w4-*`.

| Party | Problems | OK |
|---|---|---|
| Login page | 0 | 1 |
| New client: Rosa, Walk Co | 2 | 10 |
| Colleague (Member) and invite | 8 | 8 |
| Candidate: Nina | 1 | 4 |
| Supplier, recommended then claimed: Maya | 4 | 8 |
| Bench consultant: Omar | 0 | 5 |
| One-person firm: Ana | 1 | 3 |
| Integrator, program office, prime, sub-vendor (new) | 2 | 5 |
| Program office with a seat, worker, program desk (seeded) | 0 | 6 |
| Client pages while loading | 1 | 2 |
| Edge cases | 2 | 7 |

Some problems show up for more than one party. Each problem is counted once, under the party where it was first seen.

## Login page

- OK: the login page never shows Microsoft, Google or magic-link buttons. Checked with the providers call held back for 3 seconds: the first paint shows only email and password, then "Microsoft and Google sign-in are not set up on this deployment yet." (round three #3).

## New client: Rosa, Walk Co

- OK: sign-up shows "Check your email" once. The link opens step 2 with the answers from sign-up kept.
- OK: step 3 asks only about the week. In place of payroll it says "There is no payroll to set up. Your suppliers pay their own people, and you pay their bills." (round three #2).
- OK: the "section below" sentence is gone (round three #1).
- OK: the landing reads "Nothing needs you today." Below it is an empty card offering three next steps: Raise a job request, Invite your suppliers, Import who is already on site.
- OK: the reset link works. Asking twice makes the older link say "A newer link was sent…". The used link says "This link was already used." The old password is refused and the new one signs in.
- OK: the fifth wrong password slows the door: "Too many tries. Wait 60 seconds, then try again."
- OK: Dev is invited as Hiring Manager. The email holds a 3-day link to set a password. After he saves it, the page says "Your password is set. Sign in with it now." He lands on Job requests.
- OK: Your data ends "A privacy contact address is not set up yet. Your requests on this page still run on their dates." (round three #7).
- OK: no British spelling on any page walked, for any party. The org view says "nothing to annualize" (round three #19).
- OK: Supplier scorecards for a client says "How much of what you buy runs through a single supplier", with no supplier revenue words (round three #18).
- PROBLEM 6 (money, `app/dashboard/contracts/page.tsx`): a client's Contracts page ends "Nothing on the sell side yet. A sell line is what you bill a customer from. One arrives when a client awards a submission, and you can record work you are already running with Record a placement." A client bills nobody. The heading above it already reads "Everyone working at your sites, across every supplier."
- PROBLEM 17 (architect, `lib/setup-steps.ts` `packSentence`): setup step 2 and step 3 say "Your dates follow the US pack: weekly hours." "Pack" is the system's word for a template set, not a word a buyer uses. The same sentence appears for every company type.

## Colleague (Member) and invite: Lee at Walk Co, Mo at Northbend Athletic

- OK: Lee types only an email on walkco.test. The form says "walkco is Walk Co's address. You will join it as Member once you confirm your email."
- OK: after the link: "You are in Walk Co as Member. Your owner has been told; you will see more once they give you a desk."
- OK: the Member menu is only their own pages: Conversations, Your work, Your page, Who has you, Your data, Your paperwork (round three #5, the menu half).
- OK: by URL, Timesheets, Budget, Org view, Users & permissions, Suppliers, AP, Ending soon and Expenses each refuse in a sentence, for example "The budget is not part of your seat at Northbend Athletic. Ask your company's owner if you need it." The routes return 403.
- OK: Users & permissions counts the waiting Member: "Needs a decision 1" (round three #4). After a desk is given, it reads 0.
- OK: Dev, invited but never signed in, sits under "Waiting for access … will have the Hiring Manager desk".
- OK: the desk end date reads "until Jan 6, 2027" on the row and in the email: "It runs until Jan 6, 2027." (round three #6, the row and the email).
- OK: Dev's invite link, used a second time, says "This link was already used."
- PROBLEM 1 (demand: `app/api/program/route.ts`, `app/api/submissions/route.ts`, `app/api/requisitions/route.ts`, `app/api/people/route.ts`): a Member with no desk and no permission opens the firm's own pages by URL and sees all of it.
  - `/dashboard/program` reads "2 things need you … $118,880 this month". It shows each supplier's monthly spend (Teleworld Solutions $40,960/mo), Ingrid's held start, and Extend and Roll off buttons on Felix and Amara.
  - `/dashboard/submissions` lists all 12 submissions with rates ("$134/hr", "$131/hr").
  - `/dashboard/requisitions` lists the job requests with "$130/hr max" and the plan check. Yet `/api/requirements` refuses the same Member: "Open jobs are not part of your seat."
  - `/dashboard/people` lists 11 contractors with months on site against the cap.
  - The access page promises "none of the firm's pages" (screens `w4-mo_dashboard_program.png`, `w4-mo_dashboard_submissions.png`).
- PROBLEM 2 (supply, `app/api/alumni/route.ts`): the same Member opens Past contractors: "7 people have worked here", with names, suppliers, months and hours.
- PROBLEM 3 (demand, `app/dashboard/timesheets/page.tsx`, `app/dashboard/program/page.tsx`): a refused page still draws its counters as facts. Timesheets shows "PENDING APPROVAL 0 all clear", "FLAGGED 0 no week on this list is flagged" and "APPROVED VALUE $0" above "Timesheets is not part of your seat". Northbend has 1 week waiting. On the dashboard, "Tenure to watch" and the TENURE tile say "Reading…" forever, because `/api/tenure` refused and nothing says so.
- PROBLEM 4 (regulatory, `app/dashboard/tenure/page.tsx`): Tenure draws "TRACKED 0 … OVER THE LIMIT 0" above its refusal. Northbend has a contractor 24 months in, past the cap.
- PROBLEM 5 (money, `app/dashboard/invoices/page.tsx`, `app/dashboard/expenses/page.tsx`, `app/dashboard/contracts/page.tsx`): Invoice receipts draws "OUTSTANDING $0 we owe" and Expenses draws "$0.00" above their refusals. Contracts shows no refusal at all: "ACTIVE 0 contracts". `/api/contracts` answers 200 with an empty list.
- PROBLEM 7 (money, `app/api/invoices/route.ts`, `app/dashboard/purchase-orders/page.tsx`): two refusals print permission keys: "Requires invoices.read permission" and "Seeing purchase orders needs invoices.read".
- PROBLEM 8 (supply, `app/dashboard/scorecards/page.tsx`): Supplier scorecards tells a Member, and also Dev the Hiring Manager, to "Ask whoever manages suppliers here for the vendors.read permission." For a client, the concentration refusal reads "what the firm turned over this year and how much of it rides on one client, one supplier or one person … ask … for the profitability desk". Those are a supplier's words.
- PROBLEM 10 (regulatory, `app/api/access/route.ts:445`; round three #6, partly open): Change desk confirms in a browser alert: "Lee Chen can now work as Approver. This ends on 2027-01-06 unless renewed." The row and the email were fixed, but this sentence was not.

## Candidate: Nina

- OK: a gmail address on the company tab is refused: "Use your work email. A personal address like gmail.com cannot stand for a company. To sign up as yourself, choose "A candidate", or the one-person…". No account was made.
- OK: the email link lands on Your work: "There is no work here yet … Until then this page is empty, not zeros."
- OK: her menu holds only her six pages.
- OK: Your data has the possessives fixed in "A consultant's own profile", "the signer's own name", "a supplier's own application" and "another person's record". One is still missing; see problem 11.
- PROBLEM 11 (regulatory, `lib/legal.ts:387`; round three #8, partly open): Your data still reads "an approval given or refused with the reason in words, somebody else week of hours signed off". It should say "somebody else's week".

## Supplier, recommended then claimed: Maya, Brookfield Walk Staffing

- OK: Northbend's hiring manager recommends the firm. Maya is emailed an apply link with nothing to sign up for.
- OK: four desks clear it in order: department lead, Procurement, HR, Finance. The apply page then reads "Northbend Athletic approved Brookfield Walk Staffing as a supplier." The claim email says "the bills you send it".
- OK: the claim form says "Northbend Athletic put Brookfield Walk Staffing on Etyme … No new company is made." Maya confirms and setup opens at How you work: "Northbend Athletic is your client. Next: your week and payroll."
- OK: the landing names her client: "Northbend Athletic is your client. Jobs it sends you appear here." The pipeline says "Nothing is billing yet, so there is no monthly revenue to show." (round three #12).
- OK: Submissions says "Candidates you submitted to client job requests." (round three #9). Conversations says "about job requests, contracts and submissions", and its chip reads "Job requests" (round three #10).
- OK: Companies and Contacts head "NETWORK". Paperwork, Screening packs and Check queue head with their Compliance section (round three #11).
- OK: all 47 menu links open with no error in the page.
- OK: no mail went to a demo address all round: 0 of the sends were to `.local`, `.example` or `.invalid`.
- PROBLEM 14 (money, `app/dashboard/rate-history/page.tsx:295`): Rate history heads "OPERATE" but sits under Grow. The same is true for the prime, integrator and program office.
- PROBLEM 16 (supply, `app/dashboard/training/page.tsx:170`, `app/dashboard/alumni/page.tsx:261`, `app/dashboard/scorecards/page.tsx:231`): Training's first counter reads "OPEN REQUIREMENTS". The screen word is job requests. The same is true for the prime and integrator. Two supply pages also type their eyebrow: Past contractors heads "PROGRAM" under a client's Workforce › Offboard, and Supplier scorecards heads "GOVERNANCE" under a program office's Supply.
- PROBLEM 18 (architect, `lib/setup-state.ts:175`): her first System activity line reads 'Setup opened at "How you work" for a supplier that took its record from an invitation'. That is a log line about her firm in the third person, in the system's words.
- PROBLEM 13 (architect, `app/dashboard/settings/page.tsx:202`, `app/dashboard/data/page.tsx`, `app/dashboard/onboarding/page.tsx:69`): Settings and Import head "SETTINGS", and Setup heads "OPERATE". All three sit under Governance › Admin (Governance › Setup on a client). The same happens for every party.

## Bench consultant: Omar, added by Pellwright Validation Partners

- OK: the bench invite email and page work. The stay options are Until I cancel, 5, 7, 15, 25, 50, 60 and 500 days. Yes is recorded: "You stay on Pellwright Validation Partners' bench until you cancel."
- OK: candidate sign-up on the same email sends "Pellwright Validation Partners added you to its bench. Confirm your email to sign in."
- OK: he lands on Your work: "Listed by Pellwright Validation Partners. When a firm puts you forward, your work shows here."
- OK: Who has you shows the one firm, his stay and both consents.
- OK: his menu is his own six pages.

## One-person firm: Ana Lima LLC

- OK: setup has three steps, with no contractor list and no team.
- OK: she lands on Needs attention. It offers only her chips (All, Timesheets, Expenses, Bills) and a first step: "If a client or a firm already gave you a contract, record it under Contracts", with a Record your contract button (round three #13).
- OK: her menu is short. "Company paperwork" and "Your paperwork" are named apart, and You comes last.
- PROBLEM 9 (money, `app/dashboard/purchase-orders/page.tsx`): her POs page reads "What you have authorized … what a supplier may invoice you in total … If your accounts-payable policy requires one, every supplier invoice will fail its check." She has no supplier. The order her client sends her is her sales order. Maya, a supplier, reads the same buyer-only page.
- (Settings heads "SETTINGS" under Governance; see problem 13.)

## Integrator, program office, prime and sub-vendor (new sign-ups)

- OK: each verifies and walks 5 steps, and step 5 offers the roles in the trade's words. The integrator gets Delivery Manager, Team Lead and Supplier Manager. The program office gets Program Manager, Supplier Manager, Coordinator and AP Clerk.
- OK: System activity says "joined Etyme as an integrator", "as a program office", "as a supplier that sells to clients directly" and "as a supplier that sells through other suppliers" (round three #14).
- OK: the program office with no seat lands on "No program yet. Keel Program Office does not run a client's program yet. A client grants you a seat in its program office…" (round three #15).
- OK: the menu sections match the CLAUDE.md table: integrator Deliver/Supply, program office Demand/Supply, prime and sub-vendor Sell/Procure.
- OK: setup step 3's example is right. "A period ending Sat, Oct 10 is worked out Wed, Oct 14 and paid Fri, Oct 16." Oct 10, 2026 is a Saturday, and the Wednesday and Friday after it are the 14th and 16th.
- PROBLEM 12 (architect, `lib/setup-steps.ts:82` `asksPayroll`): the program office is asked its pay period, the day pay is worked out and the day it is paid. Step 4 asks it to "Bring in your contractor list from a spreadsheet." A program office places nobody and pays no contractor. `asksPayroll` excludes only CLIENT. This is the same class as round three #2.
- PROBLEM 15 (demand, `app/dashboard/suppliers/page.tsx:459`, `app/dashboard/program/budget/page.tsx:157`, `app/dashboard/program/team/page.tsx`): on the program office, Suppliers heads "NETWORK" but sits under Supply. On a client, Budget heads "GOVERNANCE" but sits under Workforce › Money. Program team heads with a company name, not a section ("WALK CO", and "APTIVA WORKFORCE" when the seat is Cavanaugh Glassworks').
- (Supply's half of the same eyebrow fault is listed under problem 16: on the program office, Supplier scorecards heads "GOVERNANCE" under Supply; on a client, Past contractors heads "PROGRAM" under Workforce › Offboard, `app/dashboard/alumni/page.tsx:261`.)

## Program office with a seat, worker and program desk (seeded)

- OK: Aptiva Workforce, with its seat at Cavanaugh Glassworks, lands on that client's program under "WORKFORCE · CAVANAUGH GLASSWORKS".
- OK: Cavanaugh reads $84,000 this month. By hand, the five live sell lines are $104 + $119 + $78 + $128 + $96 = $525 an hour × 160 = $84,000. The supplier rows add up the same: $16,640 + $19,040 + $12,480 + $20,480 + $15,360.
- OK: Northbend reads $118,880. By hand, by supplier: Teleworld $40,960 + Brightmoor $39,040 + Computer Systems $23,200 + Pinnacle $15,680 = $118,880. That is $743 an hour × 160.
- OK: Helena reads "Hours this month 16". The database holds the week of Sep 27 to Oct 3 at 8 hours a day on Sep 28 to Oct 2. October holds Oct 1 and Oct 2, so 16.
- OK: Helena's chain is named: "Northbend Athletic · through Computer Systems Inc · employed by Techpeple". Her week reads "waiting for Northbend Athletic to sign … owed to you once Techpeple accepts it."
- OK: a seeded demo address is refused at sign-in: "This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password."
- (Program team on the seat heads "APTIVA WORKFORCE"; see problem 15.)

## Client pages while loading

Every API call was held back 2.5 seconds, as the Northbend program manager.

- OK: no supplier word while loading. Timesheets, Invoice receipts, Contracts, POs and AP show "Loading…" until the reader is known (round three #16, #17).
- OK: Job requests shows client words from the first paint.
- PROBLEM 21 (demand: `submissions`, `requisitions`, `people` pages; supply: `alumni` page): while loading, the counters show zeros as if they were answers. "TOTAL 0 submissions", "All 0 · Draft 0 · Awaiting approval 0", "Everyone0 · On site now0", "TOTAL ALUMNI 0". They then change to 12, 2, 11 and 7.

## Edge cases

- OK: the address `demo` is refused, and a taken address is refused: "keelprime.etyme.com is already somebody else's. Choose another, or ask that company to invite you."
- OK: three password rules are each refused in a sentence: "Use at least 12 characters. This one has 8.", "Do not use the company name in your password." and "Do not use your email address in your password."
- OK: signing up twice sends a new link, and the older one says "A newer link was sent to this email."
- OK: signing in before confirming says "Confirm your email first. We sent a link to uma@latefirm.test." Send the link again sends a new one.
- OK: a nonsense reset link and a nonsense verify link each say "This link does not work" and give the next step.
- OK: nonsense claim, bench-invite, apply, packet, answer and reply links each say the link is not valid, and change nothing.
- OK: a wrong password says only "That email and password do not match."
- PROBLEM 19 (architect, `lib/password.ts:245`): the reserved-address refusal reads "demo is kept for Etyme. Try your company's name, like brookfield." The example is fixed text and was shown to "Other Three Corp".
- PROBLEM 20 (architect, no `app/not-found.tsx`): an address that does not exist, for example `/dashboard/nonsense-page`, shows Next's bare black-and-white "404 | This page could not be found." It has no sentence, no brand and no way back.

## Round three, item by item

| # | Was | Now |
|---|---|---|
| 1 | "section below" on setup step 3 | fixed |
| 2 | client asked payroll | fixed for the client. The program office is still asked (new problem 12) |
| 3 | login flashes Microsoft and Google | fixed |
| 4 | Needs a decision 0 with a waiting Member | fixed |
| 5 | Member promised nothing but opens 16 pages | menu fixed, role fixed. **Still open by URL** (problems 1, 2) |
| 6 | machine end date | row and email fixed. **Dialog still "2027-01-06"** (problem 10) |
| 7 | demo privacy address | fixed |
| 8 | missing possessives | four fixed. **"somebody else week" open** (problem 11) |
| 9 | supplier reads "requirements" in Submissions | fixed |
| 10 | Conversations "Requirements" chip | fixed |
| 11 | eyebrows on Companies, Contacts, Paperwork, Screening packs, Check queue | fixed. Other pages still name another section (problems 13–16) |
| 12 | "$0K monthly revenue" | fixed |
| 13 | one-person firm's chips and no first step | fixed |
| 14 | menu label pasted into a sentence | fixed |
| 15 | program office lands on a sales desk | fixed |
| 16 | supplier words while loading (demand) | fixed |
| 17 | supplier words while loading (money) | fixed |
| 18 | client scorecards show supplier concentration | fixed for the owner. The Member's refusal still uses supplier words (problem 8) |
| 19 | "Annualised" and "(s)" | fixed |

## By owner

- demand (4): 1, 3, 15, 21 (submissions, requisitions, people)
- money (5): 5, 6, 7, 9, 14
- architect (6): 12, 13, 17, 18, 19, 20
- regulatory (3): 4, 10, 11
- supply (3): 2, 8, 16, plus the Past contractors part of 21

Habits seen, for "how to work":
- A fix tested only on an empty firm. Round three's Member fix was walked at a new company, where every page is empty whatever the gate says (1, 2). Any access fix needs a walk on a seeded firm with data.
- A gate in the menu but not in the route. The menu hides a page, but the page's API scopes to the caller's company and gates nothing (1). "Only their own pages" has to hold in the route, not in the sidebar.
- A refused page that still draws its counters (3, 4, 5). The denied state draws "0 all clear" above "not part of your seat". A refusal should replace the counters, not sit below them.
- Eyebrows typed into the page (13–16). `usePageSection` exists and the five pages fixed in round three use it. Rate history, Setup, Settings, Import, Budget, Past contractors, Program team, Suppliers and Supplier scorecards still type a word. The invariant test checks that the word exists on the menu, not that it is the link's own section.
- A setting asked of every type but one (12). `asksPayroll` excludes the client, but the program office pays no contractor either.

Round 5 walks the same parties after the fixes. Its Member walk must be on a seeded client.
