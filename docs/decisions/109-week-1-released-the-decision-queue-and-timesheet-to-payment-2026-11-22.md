## Week 1 released: the decision queue, and timesheet to payment — 2026-11-22

The first release under the weekend contract (record 107). Everything
below is a CLAIM until the tester passes it by screen number in
production. Source commit 428f4009f; the deploy commit and the smoke
are at the foot.

**What shipped.**

| Screen | Where | Claim |
|---|---|---|
| A1 | Settings, Company tab | The Owner sets "First screen after sign-in" to the decision queue. Sign-in, the Dashboard link, the header's home, a seat switch and the demo door then land there. A regional seat and a worker's own page do not move. |
| A2 | `/dashboard/decisions` | Open decisions, oldest first: question, owner, age in days, entity. The Owner or an Admin opens one with a stated opening day, an owner, proof and links to records. |
| A3 | `/dashboard/decisions/[id]` | The question, the proof, then Approve, Send back, Reject. A reason is required to send back or reject. Sent back, it stays open and keeps its age. |
| A4 | the same page | The decider, the entity, the role held, the time, the decision and the reason. The item moves to Decided and its age stops. |
| A5 | the Agent control tab | Six agents, each "Not enabled", the meter a count, the cap "Not set", no switch. Two lines read "baseline pending". The firm's ledger, newest first. |
| A6 | `/dashboard/records/[type]/[id]` | A record's key fields and its whole ledger history. |
| B1 | the queue | A disputed month is a decision on its owner's queue. |
| B2 | Payroll, tab "Timesheet to payment" | The firm's billing consultants: client, agreed rate, start, the month's state. "Start this month". |
| B3 | a consultant's month | The state strip, the one next move, the amounts as stated, the ledger. |
| B4 | a past month's page | "Load a past month as closed", with its source and as-of day. |
| B5, B6 | a month's page | Each consultant's state and amounts; the count per state; "Total stated on timesheets" per currency; disputes with owners. |

**The rules under them.**
- Every act on these records is one ledger row with three stamps: the
  legal entity acted for, the person, the role she held. No code path
  changes or removes a row.
- Only a working seat at the firm reads anything here. A seat on the
  firm's bench reads nothing.
- Every working seat reads the queue's rows. The proof and history of
  an item are read by its owner, the Owner, the Admins and whoever sent
  it back or decided it.
- A payroll row on any ledger, and a disputed month's proof, are read
  only by a seat that reads payroll. Another seat is told how many acts
  it is not shown.
- Every amount is typed by a person with its currency. Two stated
  amounts that disagree dispute the month and open a decision in the
  same transaction. A month that has not ended is never loaded as
  closed; a month that has not begun is never started.
- "Today" is the firm's own day, from its main site's time zone.

**How it was proven here.**
- The release check on 428f4009f: type check clean; 17,679 unit tests;
  3,883 tests against the database; the production build.
- A review of step 1 by four readers, each finding checked twice: 21
  raised, 6 confirmed by both checkers, 5 by one, 10 disproved. All 11
  that stood were fixed.
- Three walks in a browser. The first said Flow A does not ship (a
  bench seat read the queue; a count contradicted the record; the demo
  door ignored the setting). The second passed Flow A and failed Flow B
  (HR read payroll amounts on the ledger; a future month saved as
  closed; a silent Save; a dispute decided by a seat that reads no
  payroll). The third said both ship.

**Not in this release, named and not swapped.**
- Tapin's colors on signed-in screens. A test pins Etyme's action
  colors, and the builder stopped there. Week 2's list.
- The real records: the four decision items, Tapin's consultants and
  customers, October and December. A person types them after the
  deploy. NOT RETESTED.
- A browser test that presses Save on the new forms. The walks pressed
  them by hand.
- Sign-in through a real account door; a firm with no legal entity;
  the Account Manager's seat on Flow B. Not walked.
- A timesheet's arrival recorded on import; monthly pay in arrears;
  chase and pay-hold drafts; any agent.

**Found by the last walk, not fixed, week 2's first items.**
1. "…timesheets state no amount yet, and is left out": "are".
2. A contract that ends in the future reads "ended on".
3. A decided dispute not yet returned still says "The decision is owed
   by" its owner.
4. On the load form the browser's own date bubble hides the route's
   sentence, and the entity box stays red after an entity is chosen.

**Three things the tester should know.**
- The Admin role holds the payroll permissions in the default supplier
  roles, so an Admin reads these amounts, moves a month and may be
  named to decide a dispute. Finance does too. Changing that is a
  change to the role table.
- AP & Payroll does not read the agreed rate on B2 and B3: the standing
  rule shows a bill rate only to seats that price or bill.
- One month carries one sum of money: the three stated amounts must
  agree. For a payroll month, the same sum goes in all three.

**Which model ran which piece** is in STATE.md, said to the founder and
not here.

### The deploy — 2026-11-22, a Sunday

- Source f988c05c3 (the checked code of 428f4009f plus this record and
  STATE.md), replayed from 19c3c102a as deploy commit 6490627a, pushed
  once. Production reported it about nine minutes later, on both hosts.
- Gates: no Ruby; the brand kit present; no source difference. Two
  schema lines differ from the last deploy by one space each, with no
  column, type or rule changed.
- Smoke: health READY on both hosts; the home page, the four door
  pages, demo, documentation, about, security, privacy, terms, the DPA,
  contact, sign-in, sign-up and Tapin's page all answer; the inbound
  email door answers 404; the three new routes answer a signed-out
  caller "Not authenticated".
- NOT PROVEN by the smoke: a signed-in read of the three new tables in
  production. No agent signs in to production. The tester's first
  opened decision and first started month prove them.
- Last replayed source is now f988c05c3.
