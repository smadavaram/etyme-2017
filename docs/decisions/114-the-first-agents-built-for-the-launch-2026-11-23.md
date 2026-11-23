## The first agents, built for the launch — 2026-11-23

Built overnight on the owner's kickoff (record 113), in its order:
chain 7's engine, the task record, then chains 5 and 4 for Tapin.
NOT DEPLOYED: deploys happen on Saturday and Sunday only (record 107),
so the first deploy that can carry this is 2026-11-28. Source
5d1e783d0.

**Release check on 5d1e783d0.** Type check clean. The whole unit suite
(17,851 tests) after two fixes. The database tests in four parts, with
three tests updated to the eighth agent, the nightly agents job and the
new draft table. The production build. No browser walk yet.

**Against the agent activity spec (record 112), per chain.**

| Chain | Built in code, not deployed | Not built |
|---|---|---|
| 7 Run the firm | The switch (Off, Drafts only, On; the Owner's alone), the daily runner writing every act to the ledger as the agent, the daily cap and "N of M today", the control view with tasks waiting and running. Off stops the next send at once. | The weekly census and payroll-hours summary. |
| Task record | One yes per task, as the owner ruled. A card on the decision queue; the mail door refuses an agent send without an approved task, a letter outside the plan, and a retry past it. An escalation is its own task. | Stored drafts of the letters. |
| 4 Run the week | The timesheet chase: one task per missing week; after the yes the letter and its retries two working days apart; closed the moment the week is filed; ended with "no answer" when retries are spent, never escalating by itself. The old reminder is quiet for a firm whose chase is on. The payroll draft: built by the run's own computation with nothing written, shown on Payroll as "Draft by the payroll agent, not run", one card per new draft. | Week approval and payroll release stay a person's, as the spec says. |
| 5 Money loop | Reconciliation: a recorded payment matched to its bill to the cent moves the month to "Paid, not confirmed", never to closed; a short pay, an overpay, another currency, a payment with no bill, a payment matching two bills, and rate drift each open one decision with the figures. It sends nothing. | The invoice by an agent; chasing money owed with evidence (a later task under the one-yes rule). |
| 1, 2, 3, 6 | Nothing new. | All of their agents. |

**Proposed chase defaults, shown on the card as proposals.** One
letter, then up to 2 reminders, 2 working days apart, closing when the
week is filed.

**Choices the builders made, for the owner or the tester to overrule.**
1. An agent's ledger rows carry the person who last set its switch,
   because the ledger requires a person on every row; the role held
   reads "agent".
2. The payroll draft's card names the period and the number of people;
   the total gross is in its proof, read only by a seat that reads
   payroll.
3. A first instalment against a bill reads as a short pay.
4. Drift is not judged on a contract with an approved rate amendment.
5. A card whose week arrives before anyone says yes stays open; a later
   yes then closes the task with nothing sent.
6. Admin and Finance read payroll in the default supplier roles, so
   they read the draft's figures too (record 109).

**For switching them on in production, after the deploy.** Each agent
is Off for every firm. The Owner switches it in Decisions, Agent
control, best first to "Drafts only", and sets a daily cap.

### The lead's ruling on who reads immigration papers — 2026-11-23

A walk found a recruiter reading and writing petitions, posted notices
and public access files. Ruling, under record 108: these are HR's and the
compliance officer's work. They are read and written with
`governance.read`, which HR, the compliance officer, the Owner and an
Admin hold and a recruiter, an account manager and a contract manager do
not. A contract manager sees the contract checklist items only. The
older petitions route still gates on `consultants.write`; it is to be
brought under the same rule.
