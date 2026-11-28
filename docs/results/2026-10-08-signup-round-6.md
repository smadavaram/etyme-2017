# Sign-up, login and onboarding — round 6 (2026-10-08)

Walked as every party on a clean copy of 0c2daab3c. Production build (`next build`, then `next start -p 3106`) on its own worktree, database `etyme_walk6`, world seeded with `POST /api/seed-world`, mail captured by a fetch shim. Every new account used a `.test` address. Verdict: **do not ship**.

Totals: 19 problems, 84 OK. Of round five's 21 problems, 15 are fixed and 6 are partly open: 7, 11, 17, 18, 19 and 20, which are now problems 15, 14, 8–9, 6, 16 and 17.

Three commits landed on the branch while this walk ran (2e1551f05, e1458a6ab, 695d16ce0). They were not walked. None of them touches the files behind problems 1–5 below, so those problems stand at the new HEAD too.

The blocker is problem 1. Karthik Menon is Teleworld's own W2 engineer with no desk. His menu is now correctly Today and You, and the door refuses him every firm list. But he can still open any colleague's terms page by its address. He read "Felix Brenner … Pay $86/hr" and "Deepa Varma … $97/hr". The terms route treats anybody seated at the submitting firm as "the firm". So any seat at a supplier, a Member included, reads every colleague's pay.

The second finding is about money on the client's own screen. A filled job request names the rate of the rung below the one the client pays. Northbend Athletic pays Computer Systems $145/hr for Helena Marsh. Northbend's job request says "Filled by Helena Marsh at $118/hr". $118 is what Computer Systems pays Techpeple, its sub-vendor. Cavanaugh Glassworks pays Vertex Global $128/hr and reads "$103/hr", which is Vertex's rate to Sahasra. This is the chain rule from 2026-09-13 ("the client sees the contract it pays") broken on one page (problem 2).

The import and location routes, the blocker last round, are closed for every party who tried them (round five, problems 1 and 2).

The Member walk was on a seeded client, as before. The person is `mo@walk6.test`, with an EMPLOYEE context and Northbend's own Member role (no permissions), written into the database. Karthik came in through the demo door (`{"person":"karthik-menon"}`). Nina signed up as a candidate with no company.

Screenshots: `shots6/` in the session scratchpad, named `w6-*`. Page text for every page opened: `pages6/`.

| Party | Problems | OK |
|---|---|---|
| Login page | 0 | 1 |
| New client: Rosa, Walk Co | 0 | 8 |
| Colleague (Member): Lee at Walk Co, Mo at Northbend | 4 | 14 |
| Own-work seat: Karthik at Teleworld (seeded) | 4 | 11 |
| Candidate: Nina | 4 | 6 |
| Supplier, recommended then claimed: Maya | 0 | 6 |
| Bench consultant: Omar | 0 | 4 |
| One-person firm: Ana Lima LLC | 2 | 3 |
| Integrator, program office, prime, sub-vendor (new) | 0 | 6 |
| Program office with a seat, worker, program desk (seeded) | 5 | 12 |
| Client pages while loading | 0 | 5 |
| Edge cases | 0 | 8 |

Each problem is counted once, under the party where it was first seen.

## Login page

- OK: with the providers call held back 3 seconds, the page settles on email and password, then "Microsoft and Google sign-in are not set up on this deployment yet." Nothing names a provider before that sentence.

## New client: Rosa, Walk Co

- OK: sign-up shows "Check your email" once. The link opens step 2 with the sign-up answers kept.
- OK: step 3 reads "Your dates follow the usual US rhythm: weekly hours." No "pack".
- OK: in place of payroll, step 3 says "There is no payroll to set up. Your suppliers pay their own people, and you pay their bills."
- OK: the landing reads "Nothing needs you today. 0 contractors on site through 0 suppliers. $0 this month." Below it are three next steps: raise a job request, invite your suppliers, import who is already on site. For an empty client the zeros are true.
- OK: an empty client's Contracts page: "No contracts yet. A contract appears here when you award a job request to a supplier."
- OK: Settings now says how the company came in (check h): "Your company signed up with an email and a password, so its Etyme address is walkco.etyme.com and it has no verified domain." See problem 17 for the line above it.
- OK: Companies heads the column "ETYME ADDRESS" (check h). There is no SLUG column. See problem 16 for the KIND column.
- OK: Dev is invited as Hiring Manager and emailed "Rosa Diaz invited you to Walk Co". Change desk on Lee confirms "Lee Chen can now work as Approver. This ends on Jan 6, 2027 unless renewed."

## Colleague (Member): Lee at Walk Co, Mo at Northbend Athletic

Mo typed all 66 static dashboard addresses and 9 detail pages with Northbend's own ids. He called all 131 list routes that answer a GET, plus the import, location, placement, terms, timesheet and submission probes the brief named.

- OK: Lee types only an email on walkco.test. The form says "walkco is Walk Co's address. You will join it as Member once you confirm your email." After the link: "You are in Walk Co as Member. Your owner has been told; you will see more once they give you a desk." Rosa gets "Lee Chen (lee@walkco.test) joined Walk Co as Member. Give them a desk."
- OK: the Member menu is Workforce › Conversations, then You: Your work, Your page, Who has you, Your data, Your paperwork.
- OK: **the import door holds** (check a; round five, problem 1). As Mo, `POST /api/imports` naming Teleworld, `POST /api/imports` naming Northbend, `GET /api/imports`, and the rows, mapping and commit routes on a real Teleworld import all answer 403 in a sentence. In the database there is no person `probe6…` and only Teleworld's own import exists.
- OK: **the location door holds** (round five, problem 2). `GET` and `POST /api/companies/<Teleworld>/locations` and the same on Northbend answer 403 to Mo. Teleworld's owner adds "Probe office, Austin TX" to Teleworld: 201. The 500 is gone.
- OK: of 131 list routes, Mo gets 16 answers of 200, and every one is his own or empty: his own pages, his notifications, an empty conversation list, "Contract lines that name you", an empty decision queue. The other 113 refuse in a sentence; 2 ask for a missing id.
- OK: `/dashboard/import` and `/dashboard/data` draw the sentence alone. The four-step wizard is gone.
- OK: Your work reads "You work at Northbend Athletic. You have no contract work here: no placements, no weeks to file, and nobody bills for your time." The four zero tiles are gone (round five, problem 16).
- OK: Contracts says "Contract lines that name you. You see only contracts that name you. None do." Reports says "Reports add up your firm's book. You see only contracts that name you. None do." (round five, problem 9).
- OK: Automation, Companies and Integrations draw the sentence alone (round five, problem 10). So do Consultants, Training and Ending soon (problem 11), Data requests and What is coming (problem 12), Milestones and Agreements in their own names (problem 14).
- OK: Helena's terms page tells Mo "These are the terms between a person and the firm that holds them." It no longer names her (round five, problem 8, Member half).
- OK: `?personId=<Helena>` on timesheets: "That timesheet is not part of your seat at Northbend Athletic." No name.
- OK: no permission key in any sentence on any page saved this round (check f). All of `pages6/` was searched. No British spelling, and "requirement" appears only in addresses.
- OK: Users & permissions counts the waiting Member, then reads 0 waiting after Lee gets a desk.
- OK: every refused page names the page in the reader's own words, for example "Past contractors is not part of your seat at Northbend Athletic. Ask your company's owner if you need it."
- PROBLEM 5 (demand: `app/dashboard/submissions/page.tsx`, `app/api/submissions/route.ts`; regression from 0c2daab3c): Submissions was refused to Mo in round five. It now opens, because the door gives any desk-less seat its own rows. The page is written for a supplier's worker, and Mo is a client's employee. It reads:
  - "People your suppliers have put forward."
  - "These are the times you were put forward by Northbend Athletic. Your colleagues' submissions and every rate are read by the recruiting desk."
  - Sent and Received tabs, then TOTAL 0, PENDING 0, IN PROCESS 0, PLACED 0.
  - "No submissions yet. Submissions from other vendors will appear here."

  A client never puts anybody forward and has no recruiting desk. Lee at Walk Co gets the same page.
- PROBLEM 7 (architect, `components/shell/header.tsx`): the client + button offers a desk-less Member "GOVERNANCE › Review approvals — Timesheets and expenses awaiting you". Mo and Lee have no Governance section and can approve nothing. It opens Needs attention, which says "All clear". CLAUDE.md: the + button and the menu are filtered from the same answer.
- PROBLEM 12 (architect: `app/dashboard/contacts/page.tsx`, `checks/page.tsx`, `onboarding/page.tsx`): three refused pages still draw furniture around the sentence (check d):
  - Contacts draws "People | Companies | Add contact" above the refusal.
  - Check queue opens with "Ten a week. Never let the machine be the only thing checking the machine…".
  - Setup draws the tabs "Clients | Suppliers | Consultants | Assignments".
- PROBLEM 13 (demand: `app/dashboard/leads/page.tsx`, `requirements/[id]/pile/page.tsx`): Leads draws the "PASTE IT IN … Read it" form above the refusal, to Mo, Karthik and Nina. A client has no Leads page at all. The pile draws a "Screen again" button above "Job requests is not part of your seat…".

## Own-work seat: Karthik Menon at Teleworld (seeded)

His role is Validation Engineer, with `assignments.read` and `timesheets.read`.

- OK: **his menu is Today (Needs attention, Conversations, Notifications) and You** (check b; round five, problems 3–7).
- OK: Your work: "APPROVED WEEKS 14, 14 paid". By hand: his line runs Jun 1 to Aug 31, 2026. The Sunday-to-Saturday weeks from May 31 to Aug 29 make 13, and Aug 30–31 makes the 14th (8 hours). The database holds 14 APPROVED sheets. Timesheets lists 528 hours: 13 × 40 + 8 = 528.
- OK: Where you work: "Corveldt Aerospace · employed by Teleworld Solutions, Jun 1 – Aug 31, 2026 · ended, $89/hr". $89 is his own pay on his buy line. It is his to read.
- OK: his own placement opens (`/api/placements/<his line>`): client, dates, 528 hours accepted, "Submitted by Teleworld Solutions to Corveldt Aerospace". Billing and paying are "—".
- OK: Submissions shows 1 row, his own, with RATE "—", under "These are the times you were put forward by Teleworld Solutions." `?personId=<Felix>` is refused: "Somebody else's submissions is not part of your seat…".
- OK: his own terms page opens: "Karthik Menon's terms with Teleworld Solutions are agreed. Employee of the firm (W2). Pay $89/hr."
- OK: his own rate conversation opens (`/api/me/submissions/<his>/rate`). Felix's answers "That submission is not yours."
- OK: `POST /api/submissions` is refused: "Submissions is not part of your seat at Teleworld Solutions." So is answering Corveldt's invitation with a pasted CV (round five, problem 3).
- OK: the firm's lists refuse him in a sentence: companies, contacts, loose ends, invitations, people, Felix's person page, Felix's timesheets and contract lines, Teleworld's locations, imports (round five, problems 4, 6, 7).
- OK: Conversations is empty: he is on no thread (round five, problem 5).
- OK: `?personId=<Helena Marsh>`, who is Techpeple's, answers "That timesheet is not part of your seat at Teleworld Solutions." No name crosses tenants (round five, problem 8).
- PROBLEM 1 (demand, `app/api/submissions/[id]/terms/route.ts`): **BLOCKER.** Karthik reads any colleague's pay by typing the terms address.
  - `/dashboard/submissions/<Felix's submission>/terms` draws "TERMS OF ENGAGEMENT · Felix Brenner — Retail finance systems consultant … Pay $86/hr" (screen `w6-karthik6_dashboard_submissions_…_terms.png`).
  - The route answers the same for Deepa Varma, "$97/hr", and names Marcus Whitfield's sub-vendor: "Marcus Whitfield's terms with Nimbus Talent are agreed."
  - The cause: `partyOf` returns FIRM for anybody seated at the submitting firm, whatever their desk. The door lets a desk-less seat through, because "Your terms" (`YOUR_TERMS_READS`) is on every worker's menu. So a Member at any supplier reads the same.
  - The access log writes it as allowed, with the reason "Read Felix Brenner's own terms of engagement". The reader is Karthik, not Felix.
- PROBLEM 3 (architect: `lib/deskless-door.ts`, `app/api/week-approvals/route.ts`): his own week is refused. On Your work, every week has "Open this week". It goes to `/dashboard/weeks/<his own week>`, and that page says "What you opened is not part of your seat at Teleworld Solutions." (`/api/week-approvals?timesheetId=` answers 403 NO_DESK.) Helena, a consultant, opens the same kind of link and reads her week with all three signatures.
- PROBLEM 4 (demand, `app/dashboard/timesheets/page.tsx`): Timesheets is open to him with only his own weeks, and the page says false things.
  - It says "APPROVED VALUE $0 — billable, from 14 weeks approved since Jun 1, 2026; 14 more with no rate on file", and every row reads "BILL RATE not recorded".
  - The rate is on file ($136/hr to Corveldt). It is withheld from him, which is right. But "$0" and "not recorded" are a confident zero and a false statement.
  - The page also opens on "Hours your people worked for your clients. Check them, approve them and bill them." It never says he sees only his own weeks.
- PROBLEM 6, the Karthik half (conversation, `lib/page-framing.ts`; architect for detail pages): pages he can open head with sections his menu does not have (check e):
  - Contracts and Timesheets "OPERATE", Submissions "DELIVER", Reports "GROW".
  - On refused pages: Bench, Bench pay and Bench check-ins "SUPPLY", Leads "SELL", DNR, Check queue, Paperwork and Screening packs "COMPLIANCE", Compliance, Tenure, Data requests, What is coming and Setup "GOVERNANCE", Contacts "NETWORK".
  - His own placement heads "CORVELDT AEROSPACE".
  - The + button offers "OPERATE › New timesheet — Log hours against a sell contract", though his only line ended Aug 31.

## Candidate: Nina

- OK: sign-up sends one link. It lands on Your work: "There is no work here yet … Until then this page is empty, not zeros."
- OK: her menu is her six pages: Your work, Your page, Who has you, Your data, Your paperwork, Notifications. She has no + button.
- OK: **she cannot start or read an import anywhere** (check c). `POST /api/imports`, naming Teleworld or Northbend, and the rows, mapping and commit routes on Teleworld's import all answer "An import loads people into a company, and you are not signed in at one." `/dashboard/import` says the same.
- OK: locations: `GET` answers "That company is not one you trade with." `POST` answers "A company adds its own work sites. You can add one only at the company you are signed in at."
- OK: Submissions says "A firm puts people forward for jobs, and you are not signed in at a firm. When a firm puts you forward, it shows under Your work." Contractors says "This is a company's list of the people who work for it, and you are not signed in at a company. Your own work is under Your work." Dashboard says the same plain sentence (round five, problem 17, those three pages).
- OK: `POST /api/submissions`: "A consultant is put forward by the firm that holds their consent, not from their own seat. Ask your agency to submit you."
- PROBLEM 8 (regulatory, `lib/seat.ts`; round five, problem 17, still open): Nina is on nobody's bench. On 20 pages she is told "<page> belongs to this agency. You are on their bench, not on their staff — your own work is under Your work." The pages are Users & permissions, Automation, DNR list, Check queue, Contacts, Needs attention, Duplicate check, Integrations, Interviews, Your scorecard, Setup, Budget, Program office, Ending soon, Settings, Suppliers, Bench check-ins, Training, Leads and all three Supplier scorecards panels. Round five fixed this sentence on Contractors only.
- PROBLEM 9 (several owners): Nina's other refusals are system phrases or fragments:
  - Paperwork: "Company context required" (regulatory, `documents/page.tsx`).
  - Import (`/dashboard/data`): "Imports load into a company", with no full stop (architect).
  - Shared with you: "Invitations are addressed to a company" (demand).
  - Document requests: "Packets belong to a company" (regulatory).
  - Program team: "A program belongs to a company"; Milestones: "You must belong to a company." (demand).
  - Job requests: "Open jobs are not part of your seat at this company. Whoever set up your access can add them." She has no company and nobody set up her access (demand).
  - Bench and Consultants: "The bench at your firm is read by the desks that work with consultants … Your seat is not one of them." Bench also opens with "People who granted you a listing … Their consent is what lets you market them." (supply).
- PROBLEM 10 (architect: `app/api/companies/route.ts`, `app/dashboard/companies/page.tsx`): `/api/companies` answers Nina 200 with an empty list. The page draws "Add company", TOTAL 0, VENDORS 0, CLIENTS 0, MSP 0, GSI 0, and "No companies found. Create your first company to get started." To a candidate this reads as an invitation to create a company from inside her account.
- PROBLEM 11 (demand, `app/dashboard/timesheets/page.tsx`): Timesheets draws the full list to Nina: "Your firm accepts them once the client has signed … No timesheets yet. Timesheets will appear here once your consultants file their hours." She has no firm and no consultants.

## Supplier, recommended then claimed: Maya, Brookfield Walk Staffing

- OK: Northbend's hiring manager recommends the firm, and Maya is emailed an apply link: "Nothing to sign up for."
- OK: four desks clear it in order: department lead, Procurement, HR, Finance. The apply page then reads "Northbend Athletic approved Brookfield Walk Staffing as a supplier."
- OK: the claim form says "Northbend Athletic put Brookfield Walk Staffing on Etyme. Confirm your email and the account is yours. No new company is made." Setup opens at How you work: "Northbend Athletic is your client. Next: your week and payroll."
- OK: the landing: "Northbend Athletic is your client. Jobs it sends you appear here." System activity: "Setup opened at How you work; the company step was filled from the client's invitation".
- OK: all menu links open with no page error, and every eyebrow matches its menu section. No permission key.
- OK: Settings: "Your company signed up with an email and a password … no verified domain." The domain field shows brookfieldwalk.test, and in the database `domainVerified` is false, so the sentence is true.

## Bench consultant: Omar, added by Pellwright Validation Partners

- OK: the bench invite email and page work. The stay options are Until I cancel, 5, 7, 15, 25, 50, 60 and 500 days.
- OK: yes is recorded: "You stay on Pellwright Validation Partners' bench until you cancel … this yes lets it market you and agrees no pay."
- OK: candidate sign-up on the same email sends "Pellwright Validation Partners added you to its bench. Confirm your email to sign in."
- OK: he lands on Your work: "Listed by Pellwright Validation Partners. When a firm puts you forward, your work shows here." His menu is his own pages.

## One-person firm: Ana Lima LLC

- OK: setup has three steps, with no contractor list and no team.
- OK: her menu is Today, Operate, Governance (with "Company paperwork") and You (with "Your paperwork"). Every eyebrow matches.
- OK: Settings says "Your company signed up with an email and a password, so its Etyme address is analima.etyme.com and it has no verified domain." (round five, problem 20, body fixed).
- PROBLEM 16 (architect, `app/dashboard/companies/page.tsx`; follows round five, problem 19): SLUG is gone, but the KIND column prints the enum. Ana reads "CONSULTANT_CORP"; Maya reads "VENDOR"; Rosa reads "CLIENT". The chips above say "Vendor", "Client", "MSP", "GSI". A one-person firm reads a machine name for itself.
- PROBLEM 17 (architect, `app/dashboard/settings/page.tsx`): the line under the Settings heading still says "Sign-up filled this in from your email domain and what your company does." The paragraph below it now says the company signed up with an email and a password and has no verified domain. For Maya the facts came from her client's invitation. Rosa, Ana and Maya all read the two lines one above the other.

## Integrator, program office, prime and sub-vendor (new sign-ups)

- OK: the integrator, prime and sub-vendor walk 5 steps. Step 5 offers the roles in the trade's words: Delivery Manager and Account Manager for the integrator, and Account Manager for the suppliers.
- OK: the program office's setup has 4 steps, with no payroll and no contractor list. Step 3: "There is no payroll to set up. You run the program and place nobody, so the suppliers pay their own people." Step 4 offers Program Manager.
- OK: **the program office's menu has no Payroll, Bench, Consultants or Bench check-ins** (check g; round five, problem 21). Supply is Suppliers and Supplier scorecards.
- OK: the program office with no seat lands on "No program yet … A client grants you a seat in its program office." Program office says the same at length.
- OK: the menu sections match the CLAUDE.md table: integrator Deliver/Supply, program office Demand/Supply, prime and sub-vendor Sell/Procure.
- OK: every menu link opens with no page error, and every eyebrow matches its menu section, for the integrator, program office, sub-vendor and one-person firm.

## Program office with a seat, worker and program desk (seeded)

- OK: Aptiva Workforce, with its seat at Cavanaugh Glassworks, lands on that client's program under "WORKFORCE · CAVANAUGH GLASSWORKS".
- OK: Northbend reads $118,880 this month. By hand, the six IN_PROGRESS lines Northbend pays are $124 + $132 + $145 + $132 + $98 + $112 = $743 an hour, × 160 = $118,880. "6 contractors on site through 4 suppliers": Teleworld, Computer Systems, Brightmoor and Pinnacle.
- OK: Cavanaugh reads $84,000. By hand: $128 + $119 + $104 + $96 + $78 = $525 an hour, × 160 = $84,000, through 5 suppliers.
- OK: Helena reads "HOURS THIS MONTH 16". Her week of Sep 27 to Oct 3 has 8 hours on each of Sep 28 to Oct 2, and October holds Oct 1 and Oct 2.
- OK: invoice receipt IN-E4QV99-20260901 from Computer Systems reads $17,400.00, due Nov 14, 2026.
  - The number in the invoice changed from IN-I0BGUO because the seed made new ids. It is the same document.
  - By hand: the approved September weeks are Sep 6, 13 and 20, at 40 hours each. That is 120 hours × $145 = $17,400. The submitted week of Sep 27 is left out. Sep 30 plus net 45 is Nov 14.
  - "$284,600.00 left on the purchase order · 6% used": PO-2026-XM35F is $302,000, and $302,000 − $17,400 = $284,600. $17,400 ÷ $302,000 is 5.8%.
- OK: Kwame Mensah reads "In break … may come back Nov 17, 2026". Aug 19 plus 90 days is Nov 17.
- OK: Lucía Fernández reads "14mo … Brightmoor Staffing, Pinnacle Resourcing", with "Pinnacle Resourcing's contract runs to Sep 8, 2027, 7 months past the day Lucía Fernández reaches the time limit".
- OK: Helena's own week opens: "Approved by Marcus Oyelaran, Northbend Athletic, Sep 28 · Accepted by Victor Hale, Computer Systems Inc · Accepted by Bhavesh Nair, Techpeple". She sees the whole chain, as decided.
- OK: Cavanaugh's program manager reads "Incidents 0 … Nothing has gone anywhere it should not have". `/api/breaches` now answers him 200 with an empty list, so the zero is an answer (round five, problem 13).
- OK: the pile now heads "WORKFORCE" (round five, problem 18, the pile half).
- OK: as Northbend's program manager and as Aptiva, every client menu link opens with its eyebrow matching its section.
- OK: no mail went to a demo address all round: 0 sends to `.local`, `.example` or `.invalid`.
- PROBLEM 2 (demand, `app/api/requisitions/[id]/route.ts`): a filled job request shows the rate of the rung below the client.
  - Northbend's "ERP finance lead" says "Filled by Helena Marsh at $118/hr". Northbend pays Computer Systems $145/hr (the invoice above). $118 is Techpeple → Computer Systems.
  - Cavanaugh's "Process validation engineer" says "Filled by Tomasz Nowak at $103/hr". Cavanaugh pays Vertex Global $128. $103 is Sahasra → Vertex (screen `w6-cvpm6_dashboard_requisitions_…png`).
  - The cause: `placedAt` maps every sell line carrying the requirement's id by person. The last line written wins, whichever rung it is.
  - 13 chained requirements in the seed carry two lines like this.
  - The same map supplies the date: "on Oct 8, 2026" is when the seed wrote the row, not the award (Mar 16). In production the award writes the line, so the date is right there. The rate is not.
  - CLAUDE.md: a sub-supplier's rate reaching the client's page was fixed once in `lib/chain-top`.
- PROBLEM 6, the detail-page half (round five, problem 18, still open): a placement heads "NORTHBEND ATHLETIC". A job request heads "NORTHBEND ATHLETIC" on `/requirements/<id>` and "JOB REQUEST · APPS" on `/requisitions/<id>`. A week heads "HOURS · NORTHBEND ATHLETIC". None is a section on the client's menu. Only the person page ("NETWORK · CONTRACTOR") and the pile follow the menu. Mo's half: Compliance, Tenure, Duplicate check, Supplier scorecards, Data requests and What is coming head "GOVERNANCE", Needs attention "TODAY", Contacts "NETWORK" and Leads "SELL", none on his menu. Nina's: Compliance, Tenure, What is coming and Data requests "GOVERNANCE", Leads "SELL".
- PROBLEM 14 (supply: `app/dashboard/scorecards/page.tsx`, `consultants/page.tsx`, `bench/page.tsx`; round five, problem 11, partly open):
  - Supplier scorecards draws three panels to Mo, Karthik and Nina: "STANDING … It warns and never blocks…", "CONCENTRATION", "SCORED". Each panel has its own refusal.
  - Consultants draws "Add consultant" and the Feed/Table/Export toolbar to Mo until its read returns.
  - Bench tells Mo, who can open no job request: "open a job request and press Find matches".
- PROBLEM 15 (architect, `app/api/placements/[id]/route.ts`): a colleague's placement answers "No placement by that id." That is Helena's for Mo, and Felix's for Karthik. The placement exists, at the reader's own company, and they reach it from a link-shaped address. A refusal written as a missing record reads as a broken link (check b asks for "refused in a sentence"). The door's comment says this is on purpose. The sentence should still say it is not theirs to open.
- PROBLEM 18 (regulatory, `lib/tenure-days.ts`; tenure math, so this is a question, not a fix): days on site count each contract as start-inclusive, end-exclusive. A contract's last day is not counted.
  - Kwame Mensah's line runs Aug 9, 2024 to Aug 19, 2026. That is 741 calendar days counting both ends; the ledger says "740 of 548 days".
  - Lucía Fernández: Brightmoor Jun 25, 2025 to Jul 25, 2026 is 396 days, and the ledger counts 395. Her total reads 426.
  - Each contract a person has had moves the day she reaches the time limit one day later. Lucía's "Feb 7, 2027" is Feb 6 if her last day at Brightmoor counts.
  - CLAUDE.md says "counted once per day on site". The last day of a contract is a day on site, unless the end date is meant as the first day off. Somebody has to decide which, and write it beside `daysOnSite`. A late block on a time limit is the unsafe direction.
- PROBLEM 19 (regulatory, `app/dashboard/outbound-pack/page.tsx`): Screening packs tells Mo and Karthik "Screening packs is not part of your seat at <company>…" and then "An outbound pack is a company answering for itself, so it needs a company to answer for." Both of them have a company. The second sentence is the no-company sentence, shown to everybody.

## Client pages while loading

Every API call was held back 2.5 seconds, as Cavanaugh's program manager (25 pages) and as Mo (10 pages).

- OK: Program office says "Loading…" until its read returns. The "Nobody outside this company sits in this program" sentence is gone (round five, problem 15). After the read: "Aptiva Workforce sits at Cavanaugh Glassworks's Program Manager desk."
- OK: Data requests shows "GOVERNANCE | Data requests | Loading…". No headline and no zero counts before the read.
- OK: Submissions, Contractors, Past contractors, Timesheets, Tenure, Budget, Compliance, Job requests, Identity and Contacts show "Loading…" or "Reading…" with no counter.
- OK: Invoice receipts, Contracts, AP, POs, Expenses, Document requests and Users & permissions show "Loading…" alone.
- OK: as Mo, Contracts, Companies, Automation, Training, Your work and Reports show only a loading line before the refusal or the answer.

## Edge cases

- OK: a reserved address names the address typed, and the example comes from the company's own name: "demo is kept for Etyme. Try your company's name, like other-three-corp." "admin" and "www" are refused the same way, "like fennel-works".
- OK: a taken address: "keelprime.etyme.com is already somebody else's. Choose another, or ask that company to invite you."
- OK: three password rules are each refused in a sentence: "Use at least 12 characters. This one has 5.", "Do not use the company name in your password." and "Do not use your email address in your password."
- OK: reset: asking twice makes the older link say "A newer link was sent to this email." A used link says "This link was already used." The old password is refused and the new one signs in.
- OK: the fifth wrong password says "Too many tries. Wait 60 seconds, then try again."
- OK: signing in before confirming says "Confirm your email first. We sent a link to uma@latefirm.test." Send the link again sends a new one, and the older verify link says "A newer link was sent".
- OK: nonsense reset, verify, claim, bench-invite, apply, packet, answer and reply links each say the link is not valid, and change nothing. A seeded demo address is refused at sign-in: "This address belongs to the Etyme demo."
- OK: a bad address (`/dashboard/nonsense-page`, `/nonsense`) shows the branded not-found page: "NOT FOUND. There is no page at this address. Go to the home page".

## Round five, item by item

| # | Was | Now |
|---|---|---|
| 1 | import routes open to anybody, any company | fixed. Every import route refuses Mo and Nina; no row was written |
| 2 | any company's locations; POST crashed | fixed. Refused to strangers; the owner adds a site (201) |
| 3 | Karthik submits a stranger through an invitation | fixed |
| 4 | Karthik reads every submission and rate, and the client's band | fixed. His own row only, no rate. **But the terms page leaks colleagues' pay** (new problem 1) |
| 5 | Karthik reads the firm's client thread | fixed |
| 6 | Missing paperwork names colleagues with money | fixed |
| 7 | colleague's placement, Companies, Contacts | Companies and Contacts fixed. The placement is withheld but reads "No placement by that id" (problem 15) |
| 8 | refusals name people across tenants | fixed, both halves |
| 9 | narrowed Contracts and Reports drawn as the firm's empty book | fixed |
| 10 | Automation, Companies, Integrations draw counters | fixed |
| 11 | Consultants, Training, Ending soon furniture | Training and Ending soon fixed. **Consultants still draws its toolbar while loading** (problem 14) |
| 12 | Data requests all-clear; What is coming "Try again" | fixed |
| 13 | refused incidents drawn as a confident zero | fixed. The route now answers, so the zero is true |
| 14 | Milestones, Agreements name "Dashboard"; "Try again" | fixed on the pages. The two routes still say "Dashboard", which only the access log shows |
| 15 | Program office wrong sentence while loading | fixed |
| 16 | Mo's four zero tiles | fixed |
| 17 | Nina: Submissions loads forever; "on their bench"; "No company context" | Submissions, Contractors and Dashboard fixed. **"On their bench" remains on 20 pages; "Company context required" on Paperwork** (problems 8, 9) |
| 18 | pile and detail-page eyebrows | the pile fixed. **Placement, job request and week still head with the company name** (problem 6) |
| 19 | SLUG column | fixed. **KIND prints the enum** (problem 16) |
| 20 | Settings speaks of an identity provider | the paragraph fixed. **The line above it still says "from your email domain"** (problem 17) |
| 21 | program office offered Payroll and the bench | fixed |

## By owner

- demand (6): **1 (blocker)**, 2, 4, 5, 11, 13
- architect (7): 3, 7, 10, 12, 15, 16, 17; also the detail pages in 6
- regulatory (3): 8, 18, 19
- supply (1): 14
- conversation (1): 6
- several (1): 9. Its items are demand's (Shared with you, Program team, Milestones, Job requests), regulatory's (Paperwork, Document requests), supply's (Bench, Consultants) and architect's (Import)
- money (0). Every figure checked by hand is right. Problem 2 is a money number, but the page that draws it is demand's.

Habits seen, for "how to work":
- A page on a worker's menu, open to the whole firm. "Your terms" was put on every worker's menu, so the door lets a desk-less seat through to `submissions/*/terms`. The route behind it then asks only "is this caller at the firm?" Opening a route to "your own" needs the route itself to check "own". The rate conversation does this ("That submission is not yours"); the terms route does not.
- A map keyed by person, over rows from every rung. `placedAt` and `placedOnFor` read every sell line carrying the requirement's id. A chain writes one per rung. Any per-person lookup over sell lines has to pick the line the reader is party to. `lib/chain-top` exists for exactly this.
- Opening a list to own rows without asking who the reader is. 0c2daab3c opened Submissions to every desk-less seat. The page's words were written for a supplier's worker, so a client's Member reads "the times you were put forward by Northbend Athletic".
- Withheld drawn as missing. "$0", "not recorded", "no rate on file" and "No placement by that id" each say a thing does not exist, when it exists and is not the reader's to see. The words should say that.
- One refusal sentence for two different people. The "on their bench" sentence was written for a consultant at an agency. It is served to a candidate with no agency at all. The no-company sentence on Screening packs is served to people with a company.

Round 7 walks the same parties after the fixes. It should probe every `*/[id]/*` route that a worker's menu opens, as a colleague at the same firm and as a desk-less Member at a supplier, not only as Karthik.
