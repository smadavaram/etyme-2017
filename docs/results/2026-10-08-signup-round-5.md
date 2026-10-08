# Sign-up, login and onboarding — round 5 (2026-10-08)

Walked as every party on a clean copy of 7ca937838. Production build (`next build`, then `next start -p 3105`) on its own worktree, database `etyme_walk5`, world seeded with `POST /api/seed-world`, mail captured by a fetch shim. Every new account used a `.test` address. Verdict: **do not ship**.

Totals: 21 problems, 76 OK. Of round four's 21 problems, 20 are fixed and 1 is partly open (5, the Contracts page; now problem 9).

The blocker is problem 1. Any signed-in person can write people and contracts into any company. A Member at Northbend Athletic, with no desk, used the import routes to add a person to Teleworld Solutions, a different company. The import put that person on Teleworld's bench without their consent and opened a live sell contract at $150/hr. A candidate with no company at all could do the same, and could read another company's import rows with pay and bill rates. The import routes check only that somebody is signed in. They never pass through `getCallerContext`, so the one door built after round four never sees them.

The second finding is about seats that hold a permission or two but no desk. The door narrows only a seat with zero permissions. Karthik Menon, Teleworld's own W2 engineer, holds two reads (`assignments.read`, `timesheets.read`). His own weeks and lines are correctly his alone, and a colleague's by name is refused. But from his own menu he reads every submission his firm made, with each rate. He reads the client's rate band and the firm's commercial thread with a client. He can submit a stranger to a client job request (problems 3–7).

The Member walk was on a seeded client, as round four asked. The person is `mo@walk5.test`, with an EMPLOYEE context and Northbend's own Member role (no permissions), written into the database. Karthik came in through the demo door (`{"person":"karthik-menon"}`).

Screenshots: `shots5/` in the session scratchpad, named `w5-*`. Page text for every page opened: `pages5/`.

| Party | Problems | OK |
|---|---|---|
| Login page | 0 | 1 |
| New client: Rosa, Walk Co | 0 | 11 |
| Colleague (Member): Lee at Walk Co, Mo at Northbend | 9 | 10 |
| Own-work seat: Karthik at Teleworld (seeded) | 5 | 4 |
| Candidate: Nina | 1 | 5 |
| Supplier, recommended then claimed: Maya | 1 | 9 |
| Bench consultant: Omar | 0 | 5 |
| One-person firm: Ana Lima LLC | 1 | 4 |
| Integrator, program office, prime, sub-vendor (new) | 1 | 6 |
| Program office with a seat, worker, program desk (seeded) | 2 | 10 |
| Client pages while loading | 1 | 3 |
| Edge cases | 0 | 8 |

Each problem is counted once, under the party where it was first seen.

## Login page

- OK: with the providers call held back 3 seconds, the first paint shows only email and password. Then: "Microsoft and Google sign-in are not set up on this deployment yet."

## New client: Rosa, Walk Co

- OK: sign-up shows "Check your email" once. The link opens step 2 with the sign-up answers kept.
- OK: step 3 reads "Your dates follow the usual US rhythm: weekly hours." The word "pack" is gone (round four #17).
- OK: in place of payroll, step 3 says "There is no payroll to set up. Your suppliers pay their own people, and you pay their bills."
- OK: the landing reads "Nothing needs you today." Below it are three next steps: raise a job request, invite your suppliers, import who is already on site.
- OK: the reset link works. Asking twice makes the older link say "A newer link was sent…". The used link says "This link was already used." The old password is refused and the new one signs in.
- OK: the fifth wrong password says "Too many tries. Wait 60 seconds, then try again."
- OK: Dev is invited as Hiring Manager. The email gives a 3-day link to set a password. After he saves it: "Your password is set. Sign in with it now." The link used again says "This link was already used."
- OK: Change desk on Lee confirms "Lee Chen can now work as Approver. This ends on Jan 6, 2027 unless renewed." The row and the email agree (round four #10).
- OK: an empty client's Contracts page says "No contracts yet. A contract appears here when you award a job request to a supplier." (round four #6).
- OK: Dev, as Hiring Manager, is refused Supplier scorecards' standing panel by desk: "…is done by Program Manager, Procurement Lead or Compliance Officer at Walk Co." No permission key, no supplier words (round four #8).
- OK: no British spelling, no "requirement" as a screen word, and no permission key in any sentence, on any page saved this round. All text in `pages5/` was searched.

## Colleague (Member): Lee at Walk Co, Mo at Northbend Athletic

Mo typed all 66 static dashboard addresses: every page on the client menu and every page on the supplier, integrator, program office and one-person menus. He also typed 8 detail pages using Northbend's own ids, and called 45 API routes directly.

- OK: Lee types only an email on walkco.test. The form says "walkco is Walk Co's address. You will join it as Member once you confirm your email." After the link: "You are in Walk Co as Member. Your owner has been told; you will see more once they give you a desk." Rosa gets "Lee Chen joined Walk Co … Give them a desk."
- OK: signing up again on Lee's confirmed email sends "You already have an account. Sign in, or set a password", and the page says nothing more than "Check your email".
- OK: the Member menu is Conversations, Your work, Your page, Who has you, Your data and Your paperwork.
- OK: the four round-four leaks are closed. `/dashboard/program`, `/dashboard/submissions`, `/dashboard/requisitions`, `/dashboard/people` and `/dashboard/alumni` each draw one sentence, for example "Dashboard is not part of your seat at Northbend Athletic. Ask your company's owner if you need it." Their routes return 403 NO_DESK (round four #1, #2).
- OK: on the brief's direct calls, `/api/program`, `/api/submissions`, `/api/requisitions`, `/api/people`, `/api/alumni` and `/api/vendors/scorecards` return 403 with a sentence. `/api/documents/<id>/file` returns 403 for a Techpeple and a Cavanaugh document. `/api/conversations` returns 200 with an empty list: only threads naming him, which is right.
- OK: 36 more routes refuse in a sentence, including tenure, timesheets, invoices, expenses, POs, AP, suppliers, contacts, bench, consultants, interviews, rolloff, automation, companies and data requests. The detail pages for Helena (person, placement, week), a job request and an invoice receipt each draw the sentence alone.
- OK: Timesheets, Tenure, Invoice receipts, Expenses, Budget, Org view, POs, AP, Payroll, Program team, Program office, Settings, Import (`/dashboard/data`) and Users & permissions draw the sentence alone. They show no counters (round four #3, #4, #5 for invoices and expenses, #7).
- OK: no permission key in any refusal. Tenure names the desks: "Reading the tenure ledger is done by Program Manager, Hiring Manager or Approver at Northbend Athletic…"
- OK: eyebrows, for the pages a Member is shown: Conversations "WORKFORCE", the You pages "YOU".
- OK: Users & permissions counts the waiting Member, and reads 0 after Lee is given a desk.
- PROBLEM 1 (architect: `app/api/imports/route.ts`, `app/api/imports/[id]/commit/route.ts`, `[id]/mapping`, `[id]/rows`, `[id]/rows/[rowId]`; page `app/dashboard/import/page.tsx`): **BLOCKER.** The import routes check only `getSessionEmail` and take `companyId` from the request body.
  - As Mo, a desk-less Member at Northbend, `POST /api/imports {"companyId": "<Teleworld>", "kind": "PEOPLE", "rows": [...]}` answered 200. Then `POST /api/imports/<id>/commit` answered "Committed 1 records."
  - In the database, "Walk Five Probe" now has a CONSULTANT context at Teleworld Solutions. He also has a RETAINED bench listing at Teleworld that he never consented to, and an IN_PROGRESS sell contract there at $150/hr.
  - As Nina, a candidate with no company, `POST /api/imports` into Northbend answered 200. `GET /api/imports/<Mo's import>/rows` returned the raw row with "pay rate 90" and "bill rate 150".
  - `/dashboard/import` draws the full four-step import wizard to the Member with no refusal. The client dashboard's "Import who is already on site" and setup step 4's "Import a file" both link to that page.
  - This breaks three invariants: a bench listing needs the consultant's consent, a firm writes only its own book, and every read of another person's data writes an access log.
  - Users & permissions still tells the owner "A Member sees … none of the firm's pages."
- PROBLEM 2 (architect, `app/api/companies/[id]/locations/route.ts`): the same class. `GET /api/companies/<any id>/locations` returns any company's sites to any signed-in person: Mo, and Maya at Brookfield, both read Teleworld's "Wichita office, Wichita KS". `POST` to the same route takes any company id and fails only because it crashes with a 500 (a Prisma validation error in the server log). So adding a location is also broken for its own company.
- PROBLEM 9 (money: `app/dashboard/contracts/page.tsx`, `app/dashboard/reports/page.tsx`; round four #5, partly open): Mo's Contracts page at Northbend reads "Everyone working at your sites, across every supplier … ACTIVE 0 contracts … No contracts yet. A contract appears here when you award a job request to a supplier." Northbend has 6 live lines worth $743/hr. `/api/contracts` narrows a Member to the lines naming him, as designed. The page never says so: it presents the narrowed list as the firm's empty book. Reports does the same with "No data yet. Reports will populate as you add contracts…". The page should say whose lines these are, or refuse.
- PROBLEM 10 (architect: `app/dashboard/automation/page.tsx`, `companies/page.tsx`, `integrations/page.tsx`): three refused pages still draw counters, forms or empty states around the refusal.
  - Automation draws five tiles ("TOTAL ACTIONS 0 recorded", "ON ITS OWN 0", …) and "All 0". Then the refusal. Then "No automation entries found. The system hasn't performed any automated actions yet." (screen `w5-mo5_dashboard_automation.png`).
  - Companies draws "TOTAL 0 companies, VENDORS 0, CLIENTS 0, MSP 0, GSI 0" and the chips "All0 Vendor0 Client0" above the refusal.
  - Integrations draws the refusal, then the "Reconcile against a statement" form with its Reconcile button.
- PROBLEM 11 (supply: `app/dashboard/consultants/page.tsx`, `training/page.tsx`, `rolloff/page.tsx`): Consultants draws "Add consultant" and the Feed/Table/Export toolbar above the refusal. Training draws three sentences and four tiles of dashes ("OPEN JOB REQUESTS —", "PEOPLE YOU COULD FIELD — not readable", …) beside the refusal. Ending soon prints the refusal as a load failure: "Could not load who is ending: Ending soon is not part of your seat…".
- PROBLEM 12 (regulatory: `app/dashboard/privacy/page.tsx`, `app/dashboard/governance/page.tsx`): Data requests opens on the headline "Nothing is waiting on this desk today." Then comes the refusal. Then "Requests 0 … Nobody has asked this company for their data", "Holds 0 … This company holds nobody's records back." That is a confident all-clear on a desk the reader cannot see. "What is coming" (`/dashboard/governance`) puts a "Try again" button under the refusal, so the refusal reads as a fault that a retry would fix.
- PROBLEM 14 (demand: `app/dashboard/program/milestones/page.tsx`, `program/agreements/page.tsx`, `requisitions/[id]/page.tsx`, `invitations/page.tsx`): refusals that read as errors or name the wrong page.
  - Milestones prints "Could not load milestones: Dashboard is not part of your seat…".
  - Agreements prints "Dashboard is not part of your seat…" and then a second sentence about seating a contract manager. The routes `/api/program/milestones` and `/api/program/agreements` both say "Dashboard".
  - The job request detail and Shared with you put "Try again" under the refusal.
- PROBLEM 16 (supply, `app/dashboard/my-work/page.tsx`): Mo's landing, Your work, draws four zero tiles: "HOURS THIS MONTH 0, WAITING ON APPROVAL 0, APPROVED, NOT BILLED 0 your vendor bills these, ENDING WITHIN 60 DAYS 0". He is a client employee and nobody bills for him. A candidate with no work gets "Until then this page is empty, not zeros." The Member gets the zeros.
- PROBLEM 8, the Member half (demand, `app/dashboard/submissions/[id]/terms/page.tsx`): `/dashboard/submissions/<id>/terms` tells Mo "These are the terms between Helena Marsh and the firm that holds them. Only those two can read them." A seat refused every submission still learns who was submitted. The Karthik half is below.

## Own-work seat: Karthik Menon at Teleworld (seeded)

His role is Validation Engineer, with `assignments.read` and `timesheets.read`. His menu is Teleworld's integrator menu, with You appended.

- OK: Your work shows "APPROVED WEEKS 14, 14 paid". By hand: his line runs Jun 1 to Aug 31, 2026. Sunday-to-Saturday weeks from May 31 to Aug 29 make 13, and Aug 30–31 makes the 14th (8 hours, Monday Aug 31). The database holds 14 APPROVED sheets from 2026-06-01 to 2026-08-31.
- OK: `/api/timesheets` returns only his 14 weeks. `?personId=<Felix Brenner>`, a Teleworld colleague, is refused: "Felix Brenner's timesheet is not part of your seat at Teleworld Solutions…".
- OK: `/api/contracts` (sell and buy) returns only his line. `?personId=<Felix>` is refused: "You read the contract lines that name you. Reading somebody else's contract lines is for the Recruiter, Resource Manager or Account Manager desk at Teleworld Solutions."
- OK: Consultants, Bench, Expenses, Payroll and Job requests refuse in sentences that name the desks. `/api/people/<Felix>` says "That person has not been put in front of you".
- PROBLEM 3 (demand, `app/api/invitations/[id]/answer/route.ts`, `app/dashboard/invitations/page.tsx`): Karthik submitted a stranger to a client. Shared with you offers him "Answer this with a CV" on Corveldt Aerospace's DO-178C job. `POST /api/invitations/<id>/answer` with a pasted CV for "Walk Probe Two" at $135/hr answered 200: "Walk Probe Two is with DO-178C verification engineer. They are on your bench now." A validation engineer has no recruiting desk. CLAUDE.md: "A person the firm does not employ still needs a recruiting desk, the person's listing and consent."
- PROBLEM 4 (demand: `app/api/submissions/route.ts`, `app/api/invitations/route.ts`, and the pages): Submissions lists all 6 of Teleworld's submissions with each colleague and rate. Examples: "Meera Balakrishnan … Through Nimbus Talent $141/hr", "Deepa Varma … Our own employee $148/hr", "Amara Nwosu … $124/hr". Shared with you shows the client's band "YOUR RATE BAND $130–$145/hr". He holds no desk that works submissions or rates (screen `w5-karthik_dashboard_submissions.png`).
- PROBLEM 5 (conversation, `app/api/conversations/route.ts`): Conversations shows him Teleworld's thread with Corveldt about another candidate. He is not a participant. It reads: "Can Meera Balakrishnan start inside three weeks, and is the rate you sent inclusive of expenses?" The "own threads" fix narrows only a seat with zero permissions.
- PROBLEM 6 (money, `app/api/loose-ends/route.ts`): Missing paperwork lists colleagues by name with money, for example "Felix Brenner … Northbend Athletic $21,120" and "Marcus Whitfield…".
- PROBLEM 7 (architect: `app/api/placements/[id]/route.ts`, `app/api/companies/route.ts`, `app/api/contacts/route.ts`):
  - `GET /api/placements/<Felix's line>` returns Felix's placement to Karthik: client Northbend, his dates, sales order SO-PZC9C "line 1 of 2", the other line (Amara Nwosu), the job it came from and the cycle timeline. Rates are withheld.
  - Companies lists the firm's five counterparties, and Contacts lists its client rolodex ("Ines Marquardt, Owner · Corveldt Aerospace … Call about: open jobs").
  - All of these are the firm's book. Round four's door narrows a seat with zero permissions, and a seat with two reads that are not desks is treated like a desk.
- PROBLEM 8, the Karthik half (demand, `app/api/timesheets/route.ts`): the refusal names whoever's id is asked, from any company. `?personId=<Helena Marsh>` — Techpeple's person, sold through Computer Systems to Northbend, with no tie to Teleworld — answers "Helena Marsh's timesheet is not part of your seat at Teleworld Solutions." The id becomes a name across tenants. The sentence also implies that Teleworld holds the week.

## Candidate: Nina

- OK: `g.mail.walk5@gmail.com` on the company tab is refused: "Use your work email. A personal address like gmail.com cannot stand for a company…". No person was created and no mail was sent.
- OK: the email link lands on Your work: "There is no work here yet … Until then this page is empty, not zeros."
- OK: her menu is her six pages: Your work, Your page, Who has you, Your data, Your paperwork, Notifications.
- OK: Your data reads "somebody else's week of hours signed off" (round four #11).
- OK: Job requests, Contracts and Invoice receipts typed by URL each answer in a sentence, for example "These are a company's books, and you are not signed in at a company."
- PROBLEM 17 (demand: `app/dashboard/submissions/page.tsx`, `app/dashboard/people/page.tsx`): `/dashboard/submissions` shows "Loading…" forever; after 8 seconds no request has been made. `/dashboard/people` tells her "The register belongs to this agency. You are on their bench, not on their staff". She is on nobody's bench. `/dashboard/program` says "No company context. You must belong to a company." That is the system's phrase, not a sentence for her.

## Supplier, recommended then claimed: Maya, Brookfield Walk Staffing

- OK: Northbend's hiring manager recommends the firm. Maya is emailed an apply link: "Nothing to sign up for."
- OK: four desks clear it in order: department lead, Procurement, HR, Finance. The apply page then reads "Northbend Athletic approved Brookfield Walk Staffing as a supplier." The claim email says "the bills you send it".
- OK: the claim form says "Northbend Athletic put Brookfield Walk Staffing on Etyme … No new company is made." Setup opens at How you work: "Northbend Athletic is your client. Next: your week and payroll."
- OK: the payroll example is right. "A period ending Sat, Oct 10 is worked out Wed, Oct 14 and paid Fri, Oct 16." Oct 10, 2026 is a Saturday.
- OK: the landing names her client: "Northbend Athletic is your client. Jobs it sends you appear here." System activity reads "Setup opened at How you work; the company step was filled from the client's invitation" (round four #18).
- OK: all 47 menu links open with no page error, and every eyebrow matches its menu section. Rate history heads GROW (round four #14). Settings, Import and Setup head GOVERNANCE (#13). Training reads "OPEN JOB REQUESTS" (#16).
- OK: POs reads "Your orders … A sales order is what your customer agreed you may bill; a purchase order is what you have authorized a supplier to invoice you." (round four #9).
- OK: no mail went to a demo address all round: 0 sends to `.local`, `.example` or `.invalid`.
- OK: on Northbend's or Teleworld's company id, `?companyId=` on submissions, contracts, timesheets, job requests, invoices and expenses answers only Brookfield's own book. Payroll refuses: "You can only read your own company here."
- PROBLEM 19 (architect, `app/dashboard/companies/page.tsx`): the Companies table has a column headed "SLUG" ("brookfield-walk-staffing", and "world-nike" on Karthik's). That is the system's word on a working screen.

## Bench consultant: Omar, added by Pellwright Validation Partners

- OK: the bench invite email and page work. The stay options are Until I cancel, 5, 7, 15, 25, 50, 60 and 500 days.
- OK: yes is recorded: "You stay on Pellwright Validation Partners' bench until you cancel … this yes lets it market you and agrees no pay."
- OK: candidate sign-up on the same email sends "Pellwright Validation Partners added you to its bench. Confirm your email to sign in."
- OK: he lands on Your work: "Listed by Pellwright Validation Partners. When a firm puts you forward, your work shows here."
- OK: his menu is his own pages.

## One-person firm: Ana Lima LLC

- OK: setup has three steps, with no contractor list and no team.
- OK: Needs attention offers only her chips (All, Timesheets, Expenses, Bills) and the first step "Record your contract".
- OK: her POs page reads "What your customers have agreed … Your own sales orders … Each line is you, at one rate, at one site." (round four #9).
- OK: her menu keeps "Company paperwork" and "Your paperwork" apart, with You last. Every eyebrow matches.
- PROBLEM 20 (architect, `app/dashboard/settings/page.tsx`): Settings tells her "Your domain is not editable. It came from your identity provider and it is what decides who joins this company automatically." She signed up with a password. She has no identity provider, and the domain field reads "—".

## Integrator, program office, prime and sub-vendor (new sign-ups)

- OK: the integrator, prime and sub-vendor walk 5 steps. Step 5 offers the roles in the trade's words: Delivery Manager, Team Lead and Supplier Manager for the integrator; Account Manager, Recruiter, Accounts Receivable and AP & Payroll for the suppliers.
- OK: **the program office's setup has 4 steps, with no payroll and no contractor list** (round four #12, check g). Step 3 says "There is no payroll to set up. You run the program and place nobody, so the suppliers pay their own people." Step 4 offers Program Manager, Supplier Manager, Coordinator and AP Clerk.
- OK: the program office with no seat lands on "No program yet".
- OK: the menu sections match the CLAUDE.md table: integrator Deliver/Supply, program office Demand/Supply, prime and sub-vendor Sell/Procure.
- OK: every eyebrow matches its menu section on every link, for the integrator, program office and sub-vendor (round four #15, #16).
- OK: the payroll example dates are right for every type that is asked.
- PROBLEM 21 (architect, `lib/nav-table.ts`): the program office's menu still offers Payroll under Operate, and Bench, Consultants and Bench check-ins under Supply. Its own setup has just told it that it places nobody and pays nobody. CLAUDE.md says a program office "places nobody and runs no bench".

## Program office with a seat, worker and program desk (seeded)

- OK: Aptiva Workforce, with its seat at Cavanaugh Glassworks, lands on that client's program under "WORKFORCE · CAVANAUGH GLASSWORKS".
- OK: Cavanaugh reads $84,000 this month. By hand, the five IN_PROGRESS sell lines are $128 + $119 + $104 + $96 + $78 = $525 an hour, × 160 = $84,000.
- OK: Northbend reads $118,880. By hand, the six IN_PROGRESS lines are $124 + $132 + $145 + $132 + $98 + $112 = $743 an hour, × 160 = $118,880. Teleworld reads $40,960, which is ($124 + $132) × 160. Brightmoor reads $39,040, which is ($132 + $112) × 160.
- OK: Lucía Fernández reads "14 months here through Brightmoor Staffing, Pinnacle Resourcing".
  - By hand: Brightmoor, Jun 25, 2025 to Jul 25, 2026, is 396 days. Pinnacle, from Sep 8, 2026 to today, is 31 days. Together that is 427 days.
  - The fewest days any 14 consecutive months can hold is 424 (February to the next March), so she has served 14 whole months.
- OK: Kwame Mensah reads "24 months here … can come back Nov 17". By hand: Aug 9, 2024 to Aug 19, 2026 is 741 days, which is at least 730 and so 24 months. Aug 19 plus 90 days is Nov 17.
- OK: Helena reads "Hours this month 16". Her week of Sep 27 to Oct 3 has 8 hours on each of Sep 28 to Oct 2, and October holds Oct 1 and Oct 2.
- OK: the invoice receipt IN-I0BGUO-20260901 from Computer Systems reads $17,400.00, due Nov 14, 2026.
  - By hand: her approved September weeks are Sep 6, 13 and 20, at 40 hours each. That is 120 hours × $145 = $17,400. The submitted week of Sep 27 is left out, as it should be.
  - Sep 30 plus net 45 is Nov 14.
- OK: Helena's paperwork names who reported the check: "Sterling reported clear on Mar 14, 2026."
- OK: a seeded demo address is refused at sign-in: "This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password."
- OK: as Northbend's program manager, every client menu link opens with its eyebrow matching its section. Budget heads WORKFORCE, Program team GOVERNANCE, Past contractors WORKFORCE (round four #15, #16).
- PROBLEM 13 (regulatory, `app/dashboard/privacy/page.tsx`): Cavanaugh's program manager has no desk for incidents, and `/api/breaches` answers him 403. The page still reads "Incidents 0 … Nothing has gone anywhere it should not have. Anything that reached your company's records would be here." The headline above it reads "Nothing is waiting on this desk today." A refused read is drawn as a confident zero on the one panel where a zero is a legal statement. The same headline, "Requests 0" and "Holds 0" also show before the first read; see the loading section.
- PROBLEM 18 (demand, `app/dashboard/requirements/[id]/pile/page.tsx`): the pile heads "PROGRAM". A client's menu has Workforce and Governance; "Program" is not a section on it. The detail pages for a placement and a job request head with the company name ("NORTHBEND ATHLETIC") rather than a section. Of the detail pages, only the person page ("NETWORK · CONTRACTOR") follows the menu.

## Client pages while loading

Every API call was held back 2.5 seconds, as the Northbend and Cavanaugh program managers, across 26 pages.

- OK: Submissions, Job requests, Contractors and Past contractors show "Loading…" or "Reading everyone who has worked here…". They show no zero counters before the first read (round four #21).
- OK: Timesheets, Invoice receipts, Contracts, POs, AP, Expenses and Document requests show "Loading…" until the reader is known.
- OK: Job requests shows client words from the first paint.
- PROBLEM 15 (demand, `app/dashboard/program/seats/page.tsx`): at Cavanaugh, Program office says "Nobody outside this company sits in this program. That is the ordinary case: your own people run it…" before its read returns. Aptiva Workforce sits there. The sentence changes to the truth only after the read.
- (Data requests draws "Nothing is waiting on this desk today.", "Requests 0" and "Holds 0" before its read returns; counted under problem 13.)

## Edge cases

- OK: a reserved address names the address typed, and the example comes from the company's own name: "demo is kept for Etyme. Try your company's name, like other-three-corp." "admin" and "www" are refused the same way, "like fennel-works" (round four #19, check i).
- OK: a taken address: "keelprime5.etyme.com is already somebody else's. Choose another, or ask that company to invite you."
- OK: three password rules are each refused in a sentence: "Use at least 12 characters. This one has 5.", "Do not use the company name in your password." and "Do not use your email address in your password."
- OK: signing up twice sends a new link, and the older link says "A newer link was sent to this email."
- OK: signing in before confirming says "Confirm your email first. We sent a link to uma@latefirm.test." Send the link again sends a new one.
- OK: nonsense reset, verify, claim, bench-invite, apply, packet, answer and reply links each say the link is not valid, and change nothing.
- OK: a wrong password says only "That email and password do not match."
- OK: a bad address (`/dashboard/nonsense-page`, `/nonsense`) shows the branded not-found page: "NOT FOUND. There is no page at this address. Go to the home page", on the warm canvas with a serif headline (round four #20, check h; screen `w5-404.png`).

## Round four, item by item

| # | Was | Now |
|---|---|---|
| 1 | Member reads program, submissions, job requests, contractors by URL | fixed. Each refuses in a sentence; the route returns 403. **But routes that never call `getCallerContext` bypass the door** (new problem 1) |
| 2 | Member reads Past contractors | fixed |
| 3 | refused Timesheets and dashboard draw counters | fixed |
| 4 | refused Tenure draws counters | fixed |
| 5 | refused Invoice receipts, Expenses draw $0; Contracts no refusal | Invoice receipts and Expenses fixed. **Contracts and Reports still present a Member's narrowed list as the firm's empty book** (problem 9) |
| 6 | client's Contracts speaks to a supplier | fixed |
| 7 | permission keys in refusals | fixed |
| 8 | scorecards refusal uses key and supplier words | fixed |
| 9 | POs speaks only as buyer | fixed for the supplier and the one-person firm |
| 10 | Change desk dialog "2027-01-06" | fixed: "Jan 6, 2027" |
| 11 | "somebody else week" | fixed |
| 12 | program office asked payroll and contractor list | fixed |
| 13 | Settings, Import, Setup eyebrows | fixed |
| 14 | Rate history eyebrow | fixed |
| 15 | Suppliers, Budget, Program team eyebrows | fixed |
| 16 | Training "requirements"; Past contractors, scorecards eyebrows | fixed |
| 17 | "pack" in setup | fixed |
| 18 | system log line in the third person | fixed |
| 19 | reserved-address example fixed text | fixed |
| 20 | bare Next 404 | fixed |
| 21 | zero counters while loading | fixed |

## By owner

- architect (7): **1 (blocker)**, 2, 7, 10, 19, 20, 21
- demand (7): 3, 4, 8, 14, 15, 17, 18
- money (2): 6, 9
- supply (2): 11, 16
- regulatory (2): 12, 13
- conversation (1): 5

Habits seen, for "how to work":
- A door that only some routes pass through. The deskless door lives in `getCallerContext`. Routes that authenticate with `getSessionEmail` alone (`imports/**`, `companies/[id]/locations`, and others listed by `grep -L getCallerContext`) never meet it, and the worst of them write. "One door" holds only if every route uses it. A test that fails on any `route.ts` calling `getSessionEmail` without `getCallerContext` would have caught problems 1 and 2.
- "Desk-less" read as "zero permissions". The narrowing for timesheets, contracts, threads and documents keys on an empty permission list. A worker seat with two read permissions is a worker, not a desk, but it gets every route marked "scopes itself to your company" (problems 3–7). The question to ask is whether the seat holds a desk that acts on the thing, not whether it holds any permission at all.
- A refusal that carries a name. Refusing "by name" is right for a colleague the reader already knows. It is wrong when the name is looked up from an id the reader supplied, at any company (problem 8).
- A narrowed list drawn as the whole list. When a route narrows to "rows naming you", the page has to say so. Otherwise "ACTIVE 0 … No contracts yet" is a confident zero (problem 9).
- A refusal beside the furniture. Several pages still draw their tiles, chips, forms or empty-state copy around the refusal sentence (10–12, 14). The refusal should replace the page body.

Round 6 walks the same parties after the fixes. It should repeat the import probe as a Member and as a candidate. It should also re-walk Karthik's whole menu, not only his weeks.
