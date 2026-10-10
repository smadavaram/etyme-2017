# Sign-up, login and onboarding — round 2 (2026-10-08)

Walked as every party on a clean copy of c5de825d4 (tree equal to ab92626c9). Verdict: do not ship.

Totals: 21 problems (19 new, 2 still open), 27 OK. Round one's five blockers are fixed.

| Party | Problems | OK |
|---|---|---|
| New client | 3 | 6 |
| Colleague / invite | 4 | 6 |
| Candidate | 2 | 2 |
| Supplier | 5 | 3 |
| Bench consultant | 3 | 2 |
| One-person firm | 2 | 1 |
| Seeded person | 0 | 1 |
| Edge cases | 1 | 3 |
| Login, map, bell | 1 | 3 |

Problems, numbered as the walk numbered them:
2 "Check your email" heading repeated · 3 "Procurement cleared.Their" missing space ·
8 client pages flash supplier words while loading (timesheets, contracts, job requests) ·
14 a desk change is told in the app only, no email · 16 an invited person who never signed in reads as having access ·
17 Member opening Past contractors crashes (server route imports the client sidebar) ·
18 confident sentences with no data (scorecards "the other eleven", org "nothing to reconcile") ·
21 candidate told to sign up again as a one-person firm; doing so makes no company and drops the answers ·
22 candidate's password hint names a company; Notifications heading and bills list on a worker's menu ·
26 apply page still headed "is considering you" after approval · 27 claim email says bills "from" the client ·
28 "requirement" on Suppliers and Invitations · 29 a claimed supplier gets no next step and no week/payroll setup ·
30 real email sent to reserved demo addresses by seeding and desk steps · 33 bench person's sign-up: 24h said, 1h link; password thrown away; mail unnamed; "Set a new password" ·
34 a real person added by a demo firm is locked out of sign-up, reset and sign-in for good ·
35 a bench person with no work sees a row of zeros, not the empty cards · 37 one-person firm setup asks for a contractor list and a team ·
38 one-person firm lands on a page not on her menu that calls her "your vendor" · 43 a dead reset link opens the form ·
44 login page differs from the other doors in type, canvas, sentence and a false footer.

Habits seen, for "how to work":
- A rule written for seed data reached a real person (34). "Seed is never a real account" needs its mirror: a real email is never treated as seed because of who typed it.
- A loading state that guesses the reader's kind (8). Say nothing until the company is known; the rule from the eyebrow fix, applied to every subtitle.
- A server route importing a client component (17). The boundary test should catch an `app/api` import of `components/`.
- A sentence written for a full demo world shown on an empty one (18). Every confident sentence needs its empty state.

Round 3 walks the same parties after the fixes.
