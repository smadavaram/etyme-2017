# Sign-up, login and onboarding — round 1 (2026-10-08)

Walked as every party on a local run of commit 9b650e9b0, by the release agent. Verdict: do not ship.

Totals: 33 problems, 22 OK.

| Party | Problems | OK |
|---|---|---|
| No email keys set | 3 | 1 |
| New client company | 5 | 8 |
| Colleague joining | 8 | 2 |
| Candidate | 3 | 1 |
| Supplier recommended by a client | 6 | 2 |
| Consultant invited to a bench | 2 | 2 |
| One-person firm | 1 | 1 |
| Seeded demo person | 1 | 0 |
| Edge cases | 4 | 5 |

Blocks real use: an owner cannot give a Member a desk (22); an invite email has no way in (24);
an approved supplier is never told and claiming makes a second company (37, 38); a seeded demo
seat can be taken with a password (46); a one-person firm has no door (45).

Routed: architect 17, regulatory 4, demand 8, supply 4, conversation 4 (some shared).

Habits seen, for "how to work":
- A form that collects answers it will not use (18). Rule already written; the door broke it.
- Two base-URL rules in one app (33). One door for every mailed link.
- A seeded person reachable by a real-world door (46). Seed is never a real account.
- A build commit marked BUILT whose next step cannot be done (22 behind "owner is told").

Round 2 walks the same eight parties after the fixes.
