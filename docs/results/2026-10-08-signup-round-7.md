# Sign-up, login and onboarding — round 7 (2026-10-08)

I walked a clean copy of 56f9230ee as every party. It was a production build (`next build`, then `next start -p 3107`) on its own worktree. The database was `etyme_walk7`, seeded with `POST /api/seed-world`. A fetch shim captured the mail. Every new account used a `.test` address. `tsc --noEmit` on the same tree is clean. Verdict: **do not ship**.

Totals: 15 problems, 83 OK. Of round six's 19 problems, 18 are fixed. Problem 6 (eyebrows) is partly open: the client's detail pages, Mo's half and Nina's half are fixed, and the desk-less supplier seat's half is not. That half is now problem 3.

**No data leaked this round.** Karthik Menon and a new desk-less Member at a supplier (Sam, below) tried every worker-menu `[id]` route with a colleague's id. Each read only his own record. Every refusal was written to the access log first. Round six's blocker (the terms page leaking pay) is closed. So is its money finding: a filled job request now shows the rate the client pays.

What is left is how the product speaks:

- The + button still offers a one-person firm and a program office a staffing agency's actions. A program office that places nobody is offered "Add to bench" and "Add consultant", and both pages open for it (problem 1).
- Three money pages on the client's desk show "$0" and "Nothing is running" for the seconds before their read returns. Northbend's Invoice receipts reads "OUTSTANDING $0 we owe" and then "$17,400". Round six recorded these pages as "Loading…" alone, so this is a regression (problem 2).
- Several eyebrows and refusals still name sections or give instructions the reader's own menu does not have (problems 3, 4, 6, 7, 8, 10).

The test parties:

- **Mo** is `mo@walk7.test`, a desk-less Member at Northbend Athletic (EMPLOYEE context, Northbend's own Member role). He was written into the database and signed in with a session minted from the deployment's secret.
- **Sam** is `sam@walk7.test`, added this round as a desk-less Member at a supplier: Brightmoor Staffing's own Member role. Round six asked for this probe.
- **Karthik** came in through the demo door (`{"person":"karthik-menon"}`).
- **Nina** signed up through the form as a candidate with no company.
- Three probe documents were inserted so the documents file route could be tested: a signed NDA for Felix Brenner and one for Karthik from a Teleworld template, and one for Omar Haddad from a Brightmoor template. A fourth, a sent NDA, asked Karthik to sign.

Screenshots are in `w7/shots7/` in the session scratchpad, named `w7-*`. The text of every page opened is in `w7/pages7/`.

| Party | Problems | OK |
|---|---|---|
| Login page | 0 | 1 |
| New client: Rosa, Walk Co Seven | 1 | 5 |
| Colleague (Member): Lee at Walk Co Seven, Mo at Northbend, Sam at Brightmoor | 4 | 14 |
| Own-work seat: Karthik at Teleworld (seeded) | 3 | 11 |
| Candidate: Nina | 2 | 7 |
| Supplier, recommended then claimed: Maya | 0 | 6 |
| Bench consultant: Omar Siddiqui | 0 | 5 |
| One-person firm: Ana Lima LLC | 1 | 4 |
| Integrator, program office, prime, sub-vendor (new) | 1 | 4 |
| Program office with a seat, worker, program desk (seeded) | 2 | 13 |
| Client pages while loading | 1 | 4 |
| Edge cases | 0 | 9 |

Each problem is counted once, under the party where it was first seen. Problems are numbered by severity, not by party.

## Login page

- OK: with the providers call held back 3 seconds, the page shows email and password only. Then it says "Microsoft and Google sign-in are not set up on this deployment yet." No provider is named before that.

## New client: Rosa, Walk Co Seven

- OK: sign-up shows "Check your email" once. The link opens step 2 with the sign-up answers kept.
- OK: step 3 says "Your dates follow the usual US rhythm: weekly hours." and "There is no payroll to set up. Your suppliers pay their own people, and you pay their bills."
- OK: the landing reads "Nothing needs you today. 0 contractors on site through 0 suppliers. $0 this month." Three next steps follow. For an empty client these zeros are true.
- OK (round six, problem 17): the line under the Settings heading now says "Everything here can be changed, except a verified domain." The paragraph below it says "Your company signed up with an email and a password … no verified domain." The two no longer disagree.
- OK (round six, problem 16): Companies heads its columns ETYME ADDRESS and KIND, and KIND reads "Client", not `CLIENT`.
- PROBLEM 4 (regulatory: `app/dashboard/my-data/page.tsx`, `app/dashboard/access/page.tsx`): two Governance pages head with sections the menu does not have (check d).
  - Your data heads "YOU". Users & permissions heads "SETTINGS".
  - On every firm's menu both links sit under Governance.
  - Seen for Rosa, Northbend's and Cavanaugh's program managers, Aptiva, Kestrel, the Brightmoor and Teleworld owners, Maya, and the new integrator, program office, prime and sub-vendor.
  - A client's menu has no "You" section and nobody's menu has a "Settings" section.

## Colleague (Member): Lee at Walk Co Seven, Mo at Northbend Athletic, Sam at Brightmoor Staffing

Mo, Lee and Sam typed all 66 static dashboard addresses. Mo, Sam, Karthik and Nina each called the 134 list routes that answer a GET, leaving out cron, seed, stream and auth routes.

- OK: Lee types only an email at walkco7.test. The form says "walkco7 is Walk Co Seven's address. You will join it as Member once you confirm your email." After the link he reads "You are in Walk Co Seven as Member. Your owner has been told". Rosa is emailed "Lee Chen (lee@walkco7.test) joined Walk Co Seven as Member. Give them a desk."
- OK: the menus. Mo and Lee have Workforce › Conversations, then You. Sam has Today and You.
- OK: of 134 routes, Mo and Sam each get 19 answers of 200, and every one is their own or empty: their own pages, notifications, an empty conversation list, "Contract lines that name you", and an empty decision queue. 112 refuse in a sentence, and 3 ask for a missing id.
- OK (round six, problem 5): Submissions refuses Mo and Lee: "Submissions is not part of your seat at Northbend Athletic. Ask your company's owner if you need it."
- OK: **Sam's colleague probes hold.**
  - The terms of Omar Haddad, Rosa Delgado and Lucía Fernández at Brightmoor all answer "Somebody else's terms is not part of your seat at Brightmoor Staffing." The same goes for their placements ("That placement is not part of your seat…"), their weeks, Omar's document and their person pages.
  - Their rate conversations answer "That submission is not yours."
- OK (round six, problem 12): Contacts, Check queue and Setup show the sentence alone.
- OK (round six, problem 13): Leads shows the sentence alone, with no paste form. Mo's job request, pile and invoice receipt pages show the sentence alone, with no "Screen again" button.
- OK (round six, problem 14): Supplier scorecards says one sentence once. Consultants shows "Loading…" until its refusal. Bench tells Mo "A bench is a supplier's own people, and a client does not browse one…", with no "press Find matches".
- OK: every eyebrow on Mo's and Lee's pages names a section on their menu (round six, problem 6, Mo's half).
- OK: Mo's and Lee's + button offers only "WORKFORCE › New conversation" (round six, problem 7).
- OK: no permission key appears in any sentence on any page saved this round (check f).
- PROBLEM 6 (several owners): eight refused pages still draw a heading and the page's own prose above the refusal (check e). They are shown to Mo, Lee, Sam and Karthik, and the first three to Nina.
  - Duplicate check (demand, `identity/page.tsx`): "When a supplier in the middle of a chain is not on Etyme, one contractor can arrive twice…"
  - Bench check-ins (conversation, `texts/page.tsx`): "A record that says somebody is free at $78 was true three weeks ago…" This puts a dollar figure on a page the reader may not open.
  - Bench pay (architect, `settings/bench-pay/page.tsx`): "What you pay people waiting for a project…", then a second "Bench pay" heading, then the refusal. A client's Member is told what "you pay people waiting for a project". Nina reads "Bench pay is set by the firm, by its owner, admin and finance desks. Your own pay is on your own page." She has no firm and no pay.
  - Interviews (conversation): "Rounds your clients asked for. Nothing is booked until…"
  - Bench (supply): Sam reads "People who granted you a listing — retained and marketing. Their consent is what lets you market them." Karthik reads "People you employ … You need no listing to staff your own". Neither may open the page.
  - Paperwork (regulatory): it draws the heading "Paperwork", then "What you opened is not part of your seat…".
- PROBLEM 7 (regulatory, `app/dashboard/documents/requirements/page.tsx`): "What a document set asks for. Open this from an order or from a placement." This is shown to Mo, Lee, Sam and Nina, and none of them can open an order or a placement. It is an instruction the reader cannot follow (check e).
- PROBLEM 8 (architect: `lib/deskless-door.ts`, `lib/no-desk.ts`): a desk-less seat that opens a record at another company is told to ask its own owner.
  - Sam opens Karthik's week at Teleworld and reads "That week is not part of your seat at Brightmoor Staffing. Ask your company's owner if you need it." He gets the same for Helena Marsh's week and its approval evidence, and for documents at Teleworld.
  - Karthik opens Northbend Athletic's job request, its pile and its invoice receipt, and reads "Job requests is not part of your seat at Teleworld Solutions. Ask your company's owner…".
  - The owner cannot grant another company's record, so the instruction cannot be followed.
  - The answer also confirms that the id is a week or a job request. The placement route answers the same stranger "No placement by that id." (round six, problem 15), and so does the terms route ("These are the terms between a person and the firm that holds them. Only those two can read them.").
  - The cause: the door refuses before the route can tell a colleague from a stranger.
- PROBLEM 10 (architect: `lib/nav-table.ts` `pageNameOf`): seven refusals say "What you opened is not part of your seat at …" in place of the page's name. The pages are Leads, What is coming, Import (`/dashboard/import`), Your standing, Supplier scorecards, Training and Paperwork. Mo, Lee, Sam and Karthik see these. Round six recorded that every refused page names the page in the reader's own words.

## Own-work seat: Karthik Menon at Teleworld (seeded)

His role is Validation Engineer, with `assignments.read` and `timesheets.read`.

- OK: his menu is Today (Needs attention, Conversations, Notifications) and You.
- OK: **his own records open.**
  - Terms: "Karthik Menon's terms with Teleworld Solutions are agreed. Employee of the firm (W2). Pay $89/hr."
  - Rate conversation.
  - Placement: "YOU · Karthik Menon … HOURS ACCEPTED 528".
  - Week (round six, problem 3): "Karthik Menon, Jun 1 – Jun 6 · 40 hours … Approved by Ines Marquardt, Corveldt Aerospace, Jun 8 · Accepted by Sunil Raghavan, Teleworld Solutions, Jun 8".
- OK: **a colleague's terms are refused** (round six, problem 1). The terms of Felix Brenner, Deepa Varma and Marcus Whitfield, by API and by page, answer "Somebody else's terms is not part of your seat at Teleworld Solutions. Ask your company's owner if you need it." No name and no rate appear. The access log holds each as a refusal: "Asked for a colleague's terms of engagement from a seat with no desk that reads them".
- OK (round six, problem 15): Felix's and Deepa's placements answer "That placement is not part of your seat at Teleworld Solutions." Helena's, at another company, answers "No placement by that id."
- OK: their rate conversations answer "That submission is not yours."
- OK (round six, problem 4): after its read, Timesheets says:
  - "These are your own weeks at Teleworld Solutions…"
  - "HOURS LISTED 528", and by hand 13 × 40 + 8 = 528.
  - "APPROVED VALUE —", with "14 weeks approved since Jun 1, 2026; their value is read by the billing desk".
  - No "$0" and no "not recorded".
- OK: Submissions lists his one row with RATE "—". Contracts lists his one line with BILL RATE "Not shown" and says who reads it.
- OK: his employer sent him an NDA to sign. Your paperwork shows "SENT TO YOU TO SIGN … Sign as myself". Pressing it records "Walk7 probe NDA signed. Thank you."
- OK: every refusal he caused is in the access log, written before the answer went out.
- OK: his + button offers "TODAY › New conversation". It no longer offers "New timesheet" (round six, problem 6, the + half).
- PROBLEM 3 (conversation, `lib/page-framing.ts` `pageFraming`; pages: demand `timesheets`, `submissions`; money `contracts`; supply `bench`; conversation `interviews`, `texts`; architect `settings/bench-pay`; regulatory `documents`, `outbound-pack`; round six, problem 6, the desk-less supplier half, **still open**): pages a desk-less supplier seat can open head with sections its menu does not have (check d).
  - Karthik (menu: Today, You) reads:
    - Bench, Bench pay and Bench check-ins: "SUPPLY"
    - Contracts and Timesheets: "OPERATE"
    - Submissions and Interviews: "DELIVER"
    - Paperwork and Screening packs: "COMPLIANCE"
  - Sam reads "PROCURE", "OPERATE", "SELL" and "COMPLIANCE" on the same pages.
  - The cause: these pages call `pageFraming(kind, page, reading)` without the `reader` argument, so `sectionFor` reads the company's whole menu. The 43 pages that use `usePageSection` are right.
  - The matrix row for round six records this as fixed: "a list page is headed only by a section the reader's own trimmed menu lists it under".
- PROBLEM 5 (demand: `timesheets/page.tsx`, `submissions/page.tsx`; money: `contracts/page.tsx`): until the read returns, Karthik is shown the firm's words and a button he cannot use. With every API call held back 3 seconds:
  - Timesheets says "Hours your people worked for your clients. Check them, approve them and bill them."
  - Submissions shows "+ Submit" and "Candidates you submitted to client job requests."
  - Contracts says "What you bill clients. Revenue side — track active engagements…"
  - Each then switches to the "your own" wording.
  - After the read, Submissions still keeps the subtitle "Candidates you submitted to client job requests. Track each from submission to placement." above "These are the times you were put forward by Teleworld Solutions." He submitted nobody.
- PROBLEM 9 (architect, `lib/deskless-door.ts` `ANSWERS_BY_ID`; regulatory for `api/documents/[id]/file`): Karthik cannot open his own signed paper.
  - `/api/documents/<his own NDA>/file` answers "What you opened is not part of your seat at Teleworld Solutions." The door has no entry for `documents/*/file`, so the route's own rule ("the person it is about reads their own") never runs.
  - Your paperwork offers no link to the file today, so no screen tells him something false. But a W2 who signed an NDA from his own page cannot get a copy of what he signed. The brief asks that he read his own and nobody else's; here he reads nobody's.

## Candidate: Nina

- OK: sign-up sends one link. It lands on Your work: "There is no work here yet … Until then this page is empty, not zeros."
- OK: her menu is her six pages: Your work, Your page, Who has you, Your data, Your paperwork, Notifications. She has no + button.
- OK (round six, problem 8): **"on their bench" is gone everywhere.** All 20 pages that said it now say "You are not signed in at a company. Your own work is under Your work." or a sentence naming the page.
- OK (round six, problem 9): her other refusals are now plain sentences:
  - Paperwork: "A company's paperwork is read at the company, and you are not signed in at one. Your own papers are under Your paperwork."
  - Import: "An import loads people into a company, and you are not signed in at one."
  - Shared with you, Milestones, Agreements and Job requests: "… belongs to a company, and you are not signed in at one."
  - Document requests: "Anything a company asks you for is under Your paperwork."
  - Program team: "The program team belongs to a company…"
  - Bench and Consultants: "This is a company's bench…"
- OK (round six, problems 10 and 11): Companies says "This is a company's list of the firms it trades with, and you are not signed in at a company." It has no "Add company" button and no zeros. Timesheets says "These are a company's books, and you are not signed in at a company." `/api/companies` answers her 403.
- OK: of 134 routes, 20 answer her 200, and all are her own or empty.
- OK: Your work tells her "If you work through your own company, sign up as 'I work through my own company'." That can be done: the company sign-up with her email sends "Confirm your email to set up Nina K LLC as your own company … You sign in with the password you already use." I did not click it.
- PROBLEM 11 (conversation, `app/dashboard/conversations/page.tsx`): Conversations is not on her menu, but it opens by address and speaks to a supplier (check c). It reads "Messages with the firms and people you work with, about job requests, contracts and submissions" and draws "+ New" with the tabs Job requests, Contracts, Submissions, Expenses, Direct and General. Then: "A client writes to you from their job or your candidate; it appears here. Notes among your own people start with + New." She has no candidates and no people of her own.
- PROBLEM 12 (demand, `app/dashboard/requisitions/[id]/page.tsx`): Northbend's job request tells her "This job request belongs to another company". It has no full stop. It also draws "← Job requests", a page she does not have.

## Supplier, recommended then claimed: Maya, Brookfield Walk Seven Staffing

- OK: Northbend's hiring manager recommends the firm. The answer is "… is with your department lead. It walks four desks — your lead, Procurement, HR, Finance…". Maya is emailed an apply link that says "Nothing to sign up for."
- OK: four desks clear it in order: the VP as department lead, then the program manager at Procurement, then HR, then the AP clerk at Finance.
  - Each refusal is a sentence. "You already decided an earlier desk on Brookfield Walk Seven Staffing. Somebody else takes this one." "Brookfield Walk Seven Staffing is on the HR desk. That desk decides it; you will be told what they said."
  - Maya is emailed "Northbend Athletic approved … Your jobs and hours from Northbend Athletic, and the bills you send it, will be there." "Bills" is right for what a firm issues upward.
- OK: the claim page offers "Set a password". The form says "Northbend Athletic put Brookfield Walk Seven Staffing on Etyme. Confirm your email and the account is yours. No new company is made."
- OK: setup opens at How you work: "Northbend Athletic is your client. Next: your week and payroll."
- OK: the landing: "Northbend Athletic is your client. Jobs it sends you appear here." System activity: "Setup opened at How you work; the company step was filled from the client's invitation".
- OK: every menu link opens with no page error. Every eyebrow matches its section except the two in problem 4.

## Bench consultant: Omar Siddiqui, added by Pellwright Validation Partners

- OK: the invite email says "Nothing happens until you say yes. We have not stated any pay terms yet…"
- OK: the stay options are Until I cancel, 5, 7, 15, 25, 50, 60 and 500 days.
- OK: the yes is recorded: "You stay on Pellwright Validation Partners' bench until you cancel … this yes lets it market you and agrees no pay."
- OK: a candidate sign-up with the same email sends "Pellwright Validation Partners added you to its bench. Confirm your email to sign in."
- OK: he lands on Your work: "Pellwright Validation Partners markets you … Listed by Pellwright Validation Partners."

## One-person firm: Ana Lima LLC

- OK: setup has three steps, with no contractor list and no team.
- OK: her menu is Today, Operate, Governance (with "Company paperwork") and You (with "Your paperwork").
- OK: every eyebrow on her menu matches its section.
- OK: she lands on Needs attention: "If a client or a firm already gave you a contract, record it under Contracts…", with a "Record your contract" button.
- PROBLEM 1 (architect, `components/shell/header.tsx`; round six, problem 7, only half fixed): **the + button is filtered by the menu only for a seat with no desk** (`if (!isDeskless(permissions)) return offered`). Two kinds of company have a trimmed menu and still get a staffing agency's + button.
  - **Ana Lima LLC and Byrne Critical Care LLC (one-person firms).** The + button offers "SELL › New requirement · Submit consultant" and "PROCURE › Add consultant · Add to bench". She has no Sell or Procure section. "Add consultant" opens Consultants with "Add consultant" and "1 person is on your payroll and is not counted here". That is her, in the third person. CLAUDE.md, 2026-09-21: "a screen offering to add another consultant is a screen asking her about herself in the third person."
  - **Keel MSP Seven (a new program office).** The + button offers "SUPPLY › Add consultant · Add to bench" and "DEMAND › Submit consultant". Round six fixed the menu, which has no Bench or Consultants. But the + button opens both pages:
    - Bench reads "Our bench · listed / Our bench · employed / Partner bench / Bench profit … Your own people coming off a project… Seen by Keel MSP Seven's managers and HR".
    - CLAUDE.md: a program office "places nobody" and Etyme's own "never runs a bench".

## Integrator, program office, prime and sub-vendor (new sign-ups)

- OK: the integrator, prime and sub-vendor walk 5 steps, and the program office walks 4. Step 5 offers the roles in the trade's words. The integrator's list includes Delivery Manager. The suppliers' lists include Account Manager, Contract Manager, Accounts Receivable and AP & Payroll. The program office's list is AP Clerk, Compliance Officer, Coordinator, Program Manager and Supplier Manager.
- OK: the program office with no seat lands on "No program yet … A client grants you a seat in its program office … every read is logged."
- OK: the menus match the CLAUDE.md table. The integrator has Deliver and Supply. The program office has Demand and Supply, with only Suppliers and Supplier scorecards under Supply. The prime and sub-vendor have Sell and Procure.
- OK: every menu link opens with no page error. Every eyebrow matches its section except the two in problem 4.
- PROBLEM 13 (architect, `components/shell/header.tsx`, words for conversation): every supplier's + button says "New requirement — Record a client's job for submissions" and "Submit consultant — Submit a candidate to a requirement". The menu beside it says "Job requests". The founder decided on 2026-09-30 that there is one screen word, "Job requests", on every party's menu. Seen for the new integrator, program office, prime and sub-vendor, and the seeded Brightmoor and Teleworld owners.

## Program office with a seat, worker and program desk (seeded)

- OK (check f; round six, problem 2): **a filled job request shows the rate the client pays.**
  - Northbend's "ERP finance lead" says "Filled by Helena Marsh at $145/hr". The database has the Computer Systems → Northbend line at 14500 and the Techpeple → Computer Systems line at 11800.
  - Cavanaugh's "Process validation engineer" says "Filled by Tomasz Nowak at $128/hr". Vertex → Cavanaugh is 12800 and Sahasra → Vertex is 10300.
- OK (check g; round six, problem 18): **Kwame Mensah.** The ledger says "741 of 548 days", "In break", and "may come back from Nov 18, 2026".
  - His line runs Aug 9, 2024 to Aug 19, 2026. That is 741 days counting both ends.
  - Aug 20 + 90 days = Nov 18.
  - "Reached Feb 7, 2026" is right: Aug 9, 2024 + 547 days.
  - "Over the limit by 6 months": 193 days is at least 181 days, the fewest any 6 months can hold.
- OK (check g): **Lucía Fernández.** The ledger says "427 of 548 days" and "reaches the time limit (Feb 6, 2027)".
  - Brightmoor runs Jun 25, 2025 to Jul 25, 2026: 396 days.
  - Pinnacle runs Sep 8 to Oct 8, 2026: 31 days. 396 + 31 = 427.
  - 548 − 427 = 121 days after Oct 8 is Feb 6, 2027.
  - "14 months" is right: 427 is at least 424, the fewest days any 14 months can hold.
- OK: Northbend reads "$118,880 this month". By hand, the six IN_PROGRESS lines Northbend pays are $124 + $145 + $132 + $132 + $98 + $112 = $743 an hour, × 160 = $118,880.
- OK: Cavanaugh reads "$84,000 this month" through 5 suppliers.
- OK: Northbend's org view reads "ANNUAL RUN RATE $1.43m". $743 × 1,920 = $1,426,560.
- OK: Invoice receipts, after the read, says "OUTSTANDING $17,400 we owe … OPEN INVOICE RECEIPTS 1". That is the September receipt from Computer Systems (round six: 120 hours × $145).
- OK: Past contractors' HOURS column matches the approved weeks in the database: Rosa Delgado 1,181, Omar Haddad 200, Lucía Fernández 80 and Helena Marsh 120. See problem 14 for the zeros.
- OK: Helena's own week reads "Approved by Marcus Oyelaran, Northbend Athletic, Sep 28 · Accepted by Victor Hale, Computer Systems Inc · Accepted by Bhavesh Nair, Techpeple". The eyebrow is "YOU".
- OK (round six, problem 6, the detail half): the detail pages now head from the client's menu.
  - A placement heads "WORKFORCE", a job request "WORKFORCE", a week "WORKFORCE", a person "NETWORK" and the pile "WORKFORCE".
  - `/requisitions/<id>` draws no eyebrow, which is allowed. The "NORTHBEND ATHLETIC" and "JOB REQUEST · APPS" eyebrows are gone.
- OK: Aptiva, seated at Cavanaugh Glassworks, and Kestrel, seated at Talvern Medical, read the client's words: "WORKFORCE · TALVERN MEDICAL … $79,680 this month".
- OK: the + button for a client's program manager offers "New job request", "New conversation" and "Review approvals". All three are on that menu.
- OK: no mail went to a demo address all round. 18 sends, 0 to `.local`, `.example` or `.invalid`.
- PROBLEM 14 (supply, `app/dashboard/alumni/page.tsx`): Past contractors prints HOURS **0** for Kwame Mensah (24 months on site), Felix Brenner (4 months) and Amara Nwosu (3 months). None of them has a single week on record. The seed wrote none, and a contractor imported from a spreadsheet will have none either. A zero beside 24 months reads as "worked nothing". The column should say there are no weeks on record. A confident zero is not a correct answer.
- PROBLEM 15 (demand, `app/dashboard/people/[id]/page.tsx`): "Lucía Fernández is on site now, 14 months into a 18-month cap". This should be "an 18-month cap". It is on the client's person page, which the founder reads.

## Client pages while loading

Every API call except the seat itself was held back 2.5 to 3 seconds. I did this as Cavanaugh's program manager (27 pages), Northbend's program manager, Mo, Karthik and the Brightmoor owner.

- OK: Program office, Document requests, Users & permissions, Settings, Import, Contacts and POs show "Loading…" (or "Loading your setup…") alone.
- OK: the program dashboard and the org view draw nothing until the read. Then they show the true numbers.
- OK: for Mo, Consultants and Supplier scorecards show "Loading…" alone before the refusal.
- OK: Karthik's Your work shows "Loading…" alone.
- PROBLEM 2 (money: `app/dashboard/contracts/page.tsx`, `invoices/page.tsx`, `expenses/page.tsx`; **regression**): three money pages draw confident zeros before their read. Round six recorded all three as "Loading…" alone. Screens are `w7-nbpm-loading-*`.
  - Northbend's Contracts reads "ACTIVE 0 contracts · ROLLOFFS 0 · ACTIVE BILL RATES — Nothing is running" for 3 seconds. Then it reads "ACTIVE 6 contracts … $743/hr".
  - Northbend's Invoice receipts reads "OUTSTANDING $0 we owe · OVERDUE $0 · OPEN INVOICE RECEIPTS 0 · PAID 0". Then it reads "$17,400 … 1 … PAID 2".
  - Expenses reads "TOTAL EXPENSES $0.00 0 reports … PENDING APPROVAL 0" before the read.
  - A supplier's Bills page does the same ("OUTSTANDING $0 owed to us · OPEN BILLS 0").

## Edge cases

- OK: a reserved address names the address typed: "demo is kept for Etyme. Try your company's name, like other-three-corp." "admin" and "www" are refused the same way.
- OK: a taken address: "keelprime7.etyme.com is already somebody else's. Choose another, or ask that company to invite you."
- OK: three password rules, each refused in a sentence: "Use at least 12 characters. This one has 5.", "Do not use the company name in your password." and "Do not use your email address in your password."
- OK: signing in before confirming says "Confirm your email first. We sent a link to uma@latefirm7.test." and offers "Send the link again".
- OK: a seeded demo address is refused at sign-in: "… Etyme demo. A demo seat opens only from the demo page, never with a password."
- OK: reset.
  - Asking twice makes the older link say "A newer link was sent to this email. Use the link in the newest email."
  - A used link says "This link was already used."
  - The old password is refused ("That email and password do not match.") and the new one signs in.
- OK: repeated wrong passwords say "Too many tries. Wait 30 seconds, then try again.", and the wait counts down.
- OK: nonsense reset, verify, claim, bench-invite, apply, packet, answer and reply links each say the link is not valid or did not work, and change nothing.
- OK: a bad address (`/dashboard/nonsense-page`, `/nonsense`) shows "NOT FOUND. There is no page at this address. Go to the home page".

## Round six, item by item

| # | Was | Now |
|---|---|---|
| 1 | Karthik reads every colleague's pay on the terms page | fixed. Refused in the no-desk sentence and logged as a refusal. Sam at Brightmoor is refused the same way |
| 2 | filled job request shows the rung below | fixed. $145 and $128 |
| 3 | his own week refused | fixed. His own opens; a colleague's and a stranger's are refused |
| 4 | Timesheets "$0", "not recorded" | fixed after the read. **While loading it shows the firm's words** (problem 5) |
| 5 | Submissions opens to a client's Member | fixed |
| 6 | eyebrows name sections the reader lacks | client detail pages, Mo's and Nina's halves fixed. **The desk-less supplier half is open on 9 pages** (problem 3) |
| 7 | + offers a Member Review approvals | fixed for a desk-less seat. **Not for a one-person firm or a program office** (problem 1) |
| 8 | Nina: "on their bench" on 20 pages | fixed |
| 9 | Nina: system phrases and fragments | fixed on every page listed. **Conversations and a job request are new** (problems 11, 12) |
| 10 | Companies invites Nina to create a company | fixed |
| 11 | Timesheets drawn to Nina | fixed |
| 12 | Contacts, Check queue, Setup furniture | fixed. **Eight other refused pages keep their prose** (problem 6) |
| 13 | Leads form, pile "Screen again" | fixed |
| 14 | Scorecards three panels; Consultants toolbar; Bench "Find matches" | fixed |
| 15 | colleague's placement "No placement by that id" | fixed |
| 16 | KIND prints the enum | fixed |
| 17 | Settings line says "from your email domain" | fixed |
| 18 | a contract's last day not counted | fixed. Kwame 741, Nov 18; Lucía 427, Feb 6, 2027 |
| 19 | Screening packs no-company sentence to people with a company | fixed. **Its eyebrow is still in problem 3** |

## By owner

- architect (5): 1, 8, 9, 10, 13. Also the bench-pay page in 3 and 6.
- money (1): 2. Also the Contracts half of 3 and 5.
- conversation (2): 3 (`pageFraming` and its callers), 11. Also the Interviews and Bench check-ins pages in 6.
- regulatory (2): 4, 7. Also the Paperwork and Screening packs pages in 3, and the route half of 9.
- demand (3): 5, 12, 15. Also Duplicate check in 6, and Timesheets and Submissions in 3.
- supply (1): 14. Also Bench in 3 and 6.
- No figure checked by hand was wrong: tenure, the month, the run rate, the invoice receipt, the filled rates and the alumni hours with weeks behind them. Problems 2 and 14 are zeros where there is no answer yet. Neither is a wrong calculation.

Habits seen, for "how to work":

- **A fix gated on one kind of reader.** Round six's + button fix was written for "a seat with no desk", so a seat with every permission and a trimmed menu (a one-person firm, a program office) never reached it. The rule in CLAUDE.md is "the + button and the menu are filtered from one answer". The fix should be the menu's answer for everybody, not a branch for desk-less seats.
- **Two ways to frame a page, half migrated.** `usePageSection` reads the trimmed menu; `pageFraming(kind, page, reading)` reads the company's whole menu unless given `reader`. The pages fixed in round six moved; the nine still on `pageFraming` without `reader` did not. While both exist, every new page has an even chance of being wrong.
- **The door answers before the route knows who is asking.** The desk-less door refuses with "ask your company's owner" whether the record is a colleague's or a stranger's, and before a route that would say "your own" can run. A route on a worker's menu that reads "own" needs its own entry at the door, the way `placements/*` and `week-approvals` got one.
- **Loading is a state, not a zero.** Contracts, Invoice receipts and Expenses initialise their totals at 0 and draw them before the read. Round six recorded "Loading…" on all three, so something reset the page state since. A test that renders each money page with its read pending would catch it.

Round 8 should walk the same parties. It should also open every + item as each kind of company (one-person firm, program office, client, supplier), and every page with its read held back, as a desk-less worker as well as a desk.
