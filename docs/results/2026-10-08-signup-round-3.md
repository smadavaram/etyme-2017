# Sign-up, login and onboarding — round 3 (2026-10-08)

Walked as every party on a clean copy of e85d47273. Dev server on its own copy, database `etyme_walk3`, world seeded with `POST /api/seed-world`, mail captured by a fetch shim. Every new account used a `.test` address. Verdict: do not ship.

Totals: 19 problems, 61 OK. Of round two's 21 problems, 18 are fixed, 2 are partly open (8, 28) and 1 is narrower (18). Problems 9, 10, 16 and 17 below carry round two's #8 and #28, and problem 18 is what is left of #18. The other 14 are new.

Screenshots: `shots-w3/` in the session scratchpad, numbered as below.

| Party | Problems | OK |
|---|---|---|
| New client | 3 | 10 |
| Colleague / invite | 3 | 9 |
| Candidate | 2 | 5 |
| Supplier (claimed) | 4 | 6 |
| Bench consultant | 0 | 7 |
| One-person firm | 1 | 3 |
| Integrator, program office, prime, sub-vendor (new) | 2 | 3 |
| Worker and program desk (seeded) | 0 | 6 |
| Client pages while loading, and empty | 4 | 1 |
| Edge cases | 0 | 11 |

## New client: Rosa, Walk Co (001–023)

- OK: the form has one heading. "Check your email" appears once (round two #2).
- OK: the verify link opens step 2 with the answers from sign-up kept.
- OK: step 5 invites Dev as Hiring Manager. The email holds a 3-day password link.
- OK: the empty desk reads "…to the suppliers Procurement cleared. Their submissions…" with the space in place (round two #3).
- OK: after sign-out, /dashboard says "You are not signed in" and offers Sign in.
- OK: the fifth wrong password slows the door: "Too many tries. Wait 60 seconds, then try again."
- OK: reset by one-time link works. The old password is refused and the new one signs in.
- OK: the owner is emailed when a colleague joins: "Lee Chen joined Walk Co".
- OK: the login page now matches the other doors (round two #44).
- OK: the bell and the notifications page are empty, and they say so.
- PROBLEM 1 (architect, `components/settings/payroll-panel.tsx`): setup step 3 says "A date on a day off or a holiday moves the way the section below says." Setup has no section below it (005).
- PROBLEM 2 (architect, `app/(auth)/start`, `lib/setup-steps`): a client ("We hire contractors") is asked its pay period, the day pay is worked out and the day it is paid. A client runs no contractor payroll on Etyme, so the answer is never used (005).
- PROBLEM 3 (architect, `app/(auth)/login/page.tsx`): the login page shows "Continue with Microsoft", "Continue with Google" and "Send magic link" for about a second on every load, and longer after sign-out (013). None is set up. Then they vanish and the footer says "Microsoft and Google sign-in are not set up on this deployment yet." The cause is `has()`, which returns true while `available === null`. The subtitle also still says "or your company's Microsoft or Google account" (014).

## Colleague and invite (024–040)

- OK: Lee types only an email on walkco.test. The form says "walkco is Walk Co's address. You will join it as Member", and he is seated as Member.
- OK: Sam typed "Totally Different Inc" first. He still joins Walk Co as Member and is told so (040).
- OK: a stranger asking for `walkco` is refused: "walkco.etyme.com is already somebody else's." No mail is sent.
- OK: Dev's invite link sets a password and he lands on Job requests. Using the link again says "This link was already used."
- OK: a desk change is emailed: "You now have the Hiring Manager desk" (round two #14).
- OK: an invited person who never signed in shows under "Waiting for access", not as having access (round two #16).
- OK: a Member opens Past contractors without a crash (round two #17).
- OK: a Member's job requests page says in a sentence who may raise one.
- OK: the owner's bell says "Give them a desk."
- PROBLEM 4 (regulatory, `app/dashboard/access/page.tsx`): the counters read "Needs a decision 0" while Lee is listed as "Member · give them a desk", and the owner was emailed to give him one (033).
- PROBLEM 5 (regulatory for the sentence, architect for `lib/company-roles`): the access page says a domain colleague "can see nothing until somebody here decides". The Member role holds `assignments.read` and `timesheets.read`. Sam's menu, as a Member with no desk, opens 16 pages: Contracts, Timesheets, Budget, Tenure, Supplier scorecards, Org view and more. Either the sentence or the role is wrong.
- PROBLEM 6 (regulatory, access page and notice): the desk end date is a machine date on screen and in the email: "until 2027-07-05" and "It runs until 2027-07-05."

## Candidate: Nina (041–049)

- OK: a gmail address on the company tab is refused in a sentence that names both other doors. No account was made.
- OK: the candidate's email link lands on Your work with the empty cards: "Until then this page is empty, not zeros."
- OK: her menu holds only her own six pages, and the password hint names no company (round two #22).
- OK: signing up again as "I work through my own company" now makes the company. The mail says "You sign in with the password you already use", and setup is three steps (round two #21, #37).
- OK: Your paperwork, Who has you and Notifications are worded for a person.
- PROBLEM 7 (regulatory, `lib/data-request.ts:736`): Your data ends "Questions about any of this go to privacy@etyme.example." That is a reserved demo address, shown to a real person. When `ETYME_PRIVACY_EMAIL` is unset, the page should say that no address is set up yet (046).
- PROBLEM 8 (regulatory, `lib/legal.ts`, `lib/retention.ts`, `lib/data-request.ts`): the possessives are missing on Your data. It reads "A consultant own profile", "a supplier own application", "the signer own name" and "another person record" (046).

## Supplier, recommended then claimed: Maya, Brookfield Walk Staffing (058–073)

- OK: the hiring manager recommends the firm, and the firm is emailed an apply link with no sign-up.
- OK: four desks approve. The apply page then reads "Northbend Athletic approved you as a supplier" (round two #26).
- OK: the claim email says "the bills you send it" (round two #27).
- OK: claim, set a password, then verify. Setup opens at How you work: "Northbend Athletic is your client. Next: your week and payroll." (round two #29).
- OK: the menu sections are Today, Sell, Procure, Operate, Network, Money, Grow, Governance, matching the table. All 47 links open without error.
- OK: the Pipeline figure is right. Techpeple shows $37K. By hand, $112 + $118 = $230 an hour × 160 = $36,800.
- PROBLEM 9 (demand, `app/dashboard/submissions/page.tsx:1505`): the supplier reads "Candidates received from other vendors against your requirements." The sent tab says "client requirements." The screen word is "job requests" (round two #28 class).
- PROBLEM 10 (conversation, `app/dashboard/conversations/page.tsx:387,409`): the page says "linked to requirements, contracts, and submissions", and a filter chip reads "Requirements".
- PROBLEM 11 (conversation, `lib/page-framing`): some eyebrows name a different section from the menu. Companies and Contacts say "OPERATE" but sit under Network. Paperwork, Screening packs and Check queue say "OPERATE" but sit under Compliance. On the client, Contacts says "WORKFORCE" under Network.
- PROBLEM 12 (architect, `app/dashboard/page.tsx:422`): an empty firm's pipeline reads "$0K monthly revenue" (073).

## Bench consultant: Omar by a demo firm, Karim by Maya (074–099)

- OK: the bench invite email and page work. The stay options are Until I cancel, 5, 7, 15, 25, 50, 60 and 500 days. Yes is recorded.
- OK: candidate sign-up on the same email sends "Pellwright Validation Partners added you to its bench. Confirm your email to sign in." It is a 24-hour verify link that matches the page (round two #33).
- OK: the password typed at sign-up signs in. Nothing is thrown away (round two #33).
- OK: a real person added by a demo firm signs up and signs in (round two #34).
- OK: Who has you shows the one firm, its stay and the two consents.
- OK: Your work shows the empty cards, not zeros (round two #35).
- OK: Karim, added by the claimed real supplier, walks the same path.

## One-person firm: Ana, and Nina's own company (050–057)

- OK: setup has three steps, with no contractor list and no team (round two #37).
- OK: she lands on Needs attention, which is on her menu (round two #38).
- OK: the menu is short. "Company paperwork" and "Your paperwork" are named apart, and "You" comes last.
- PROBLEM 13 (demand, `app/dashboard/decisions/page.tsx`): her Needs attention page offers the chips "Job requests", "Rolloff", "Submissions", "To paper" and "To start". She has none of these. On day one the page only says "All clear. Nothing needs your attention right now. Check back later." It gives no first step, such as adding the contract her client sent (057).

## Integrator, program office, prime and sub-vendor, new sign-ups (100–123)

- OK: each verifies and walks 5 steps, and step 5 offers the roles in the trade's words. The integrator gets Delivery Manager, Team Lead and Supplier Manager. The program office gets Program Manager, Supplier Manager, Coordinator and AP Clerk.
- OK: the menu sections match the CLAUDE.md table: integrator Deliver/Supply, program office Demand/Supply, prime and sub-vendor Sell/Procure.
- OK: no type is offered a desk it does not have at step 5.
- PROBLEM 14 (architect, `lib/password-door.ts:722`, `app/api/onboarding/route.ts:373`): each landing's System activity pastes the menu label into a sentence: "Keel Program Office joined Etyme as we run the program for a client." The integrator gets "…as we deliver projects and supply people".
- PROBLEM 15 (architect, `app/dashboard/page.tsx`): the program office lands on a staffing supplier's sales desk. It shows "THE NUMBER: good submissions a day, per job · target 5", "Cost per submission", "Pipeline: monthly revenue", "On bench: No consultants on bench" and "Contract Pipeline". A program office places nobody. Its first screen should be the programs it runs and the suppliers it governs (111).

## Worker and program desk, seeded (155–157)

- OK: Helena reads "Hours this month 16". By hand, October holds Oct 1 and Oct 2 at 8 hours each, out of the week of Sep 27 to Oct 3.
- OK: Helena's chain is named: "Northbend Athletic · through Computer Systems Inc · employed by Techpeple". Her owed sentence waits on the client, then on Techpeple.
- OK: the Northbend program desk reads $118,880 this month. By hand, $124 + 132 + 145 + 98 + 132 + 112 = $743 an hour × 160 = $118,880.
- OK: the program desk says "6 on site, 1 signed not started, 4 suppliers, 2 ending within 60 days". The database agrees: Ingrid starts Oct 15, Felix ends Oct 26 and Amara ends Nov 2.
- OK: a seeded demo address is refused at reset and at sign-in: "This address belongs to the Etyme demo. A demo seat opens only from the demo page, never with a password." No mail is sent.
- OK: no mail went to any demo address while seeding or during the four desk approvals: 30 sends, 0 to `.local`, `.example` or `.invalid` (round two #30).

## Client pages, loading and empty (158–168)

- OK: the requisitions page shows client words from the first paint.
- PROBLEM 16 (demand; round two #8 still open): client pages still show supplier words while loading. The cause is that pages pass `company?.kind ?? 'VENDOR'` into `pageFraming`, which defeats its own unknown-reader guard. Timesheets reads "OPERATE · Hours your people worked for your clients. Check them, approve them and bill them." and "Approved value $0" for up to 6.7 seconds (158). The same default is in `requirements`, `requirements/[id]`, `submissions`, `rolloff`, `consultants`, `contacts` and `texts`.
- PROBLEM 17 (money; round two #8 still open): Invoice receipts first reads "Outstanding $0 owed to us · Open bills" (164). Contracts first shows the Sell/Buy tabs and "Active bill rates" (160). Both settle to client words later.
- PROBLEM 18 (supply, `app/dashboard/scorecards/page.tsx`): a client's supplier scorecards include "One client: Nothing has been billed through any client in this window" and "a first client is a hundred per cent of the revenue". That is a supplier's concentration measure, shown to a client (167).
- PROBLEM 19 (demand, `app/api/program/org/route.ts:330`): Org view reads "Annualised from the rates Walk Co is itself billed … across 0 of 0 live contractor(s)". That is British spelling, which the American English guard misses, and "(s)" on a screen (168).

## Edge cases (126–154)

- OK: the address `demo` is refused: "demo is kept for Etyme."
- OK: an address that is taken is refused.
- OK: three password rules are refused, each in its own sentence: the email as the password, under 12 characters, and the company name.
- OK: signing up twice sends a new link. The older one says "A newer link was sent to this email. Use the link in the newest email."
- OK: signing in before confirming says "Confirm your email first" and offers to send the link again. Resending works.
- OK: a verify link used twice says "Already confirmed".
- OK: a used reset link says so on open, with no form (round two #43).
- OK: an older reset link is refused on open.
- OK: a nonsense reset link and a nonsense verify link each say "This link does not work" and give the next step.
- OK: nonsense claim, bench-invite and apply links each say the link is not valid, and change nothing.
- OK: an unconfirmed sign-in with the wrong password says only "That email and password do not match."

## By owner

- architect (6): 1, 2, 3, 12, 14, 15, plus the role half of 5
- regulatory (5): 4, 5, 6, 7, 8
- demand (4): 9, 13, 16, 19
- conversation (2): 10, 11
- money (1): 17
- supply (1): 18

Habits seen, for "how to work":
- A guard fixed in the library and bypassed at the call site (16, 17). `pageFraming(null)` says nothing, but ten pages pass `?? 'VENDOR'`. A test should refuse a literal kind as a fallback.
- One dashboard for every firm that is not a client (15). The program office inherited a supplier's sales numbers because it is "not a client".
- A label reused as a sentence (14). A menu option written in the first person ("we run…") cannot follow "joined Etyme as".
- A setting asked of everybody because the panel exists (2). Setup should ask each type only what it will use.

Round 4 walks the same parties after the fixes.
