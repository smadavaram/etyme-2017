## The weekend release contract — 2026-11-21

**What it is.** A contract from the founder's tester, at the founder's
direction, on 2026-11-21. It governs every weekend release from then to
2027-02-14: thirteen releases. The execution pack (record 105) stays
the source of scope. This contract is the rhythm and the shape of
acceptance. As in record 105, the names of firms and people in it stay
outside the repository; each is written here as a role or a pattern.

**Standing rules, every weekend.**
1. One batch, one deploy, then stop. Only the weekend's item ships.
   Nothing rides along.
2. Done means it runs on Monday. Each release has a Monday run: a named
   queue or chain the second firm's team operates on the record that
   Monday. A feature nobody operates is not a release.
3. Claims are claims. The tester's retest in production, on the second
   firm's tenant, is acceptance. Release notes list builds as claims
   with evidence. Anything untested is marked NOT RETESTED, never done.
4. STATE.md is updated in the same release, with the two mission
   numbers (consultants billing, blended margin an hour) against the
   path to 36 consultants at $15 by 2027-11-21.
5. Failures roll forward, not sideways. A failed retest item is the
   next weekend's first item. No midweek fix, except a defect in money
   integrity or security. Guardrails never change inside a release:
   agents draft only; people decide money, signing and people; no agent
   acts across companies.

**The calendar.**

| Week | Dates | The item | The Monday run |
|---|---|---|---|
| 1 | Nov 21–22 | Pack batch 1, primitives: record, ledger, acting-entity stamp, decision-queue home, agent control view | The decision queue is home; four seeded items show with owners and true ages |
| 2 | Nov 28–29 | Pack batch 2: census import with quarantine, and the census keeper in draft mode | The census is live; the W-2 skills-gap report is produced |
| 3 | Dec 5–6 | Pack batch 3: money loop, chase and reconciliation in draft mode, three seeded chains | Accounts runs money owed on the record; the named one-consultant chain test passes in production |
| 4 | Dec 12–13 | Fix and retest buffer; the fifteen seats finish onboarding; the Phase 1 baseline report (billing count, blended margin, days to collect, money owed by age) | — |
| 5 | Dec 19–20 | Pack batch 4: candidate record and confirmation tracker; the dual-submission test gates it | Account managers confirm on records only |
| 6 | Dec 26–27 | Decision-queue seeds fully live; the data under the supplier scorecard (light by design) | The queue review runs wholly off the decision queue |
| 7 | Jan 2–3 | Contracts checklist and its agent; one supplier's rate drift fires on load | Contracts works drift flags from the checklist |
| 8 | Jan 9–10 | Immigration checklist and its agent; the signatory queue live | Signature requests land in the signatory's queue directly |
| 9 | Jan 16–17 | Supplier scorecard, first version, in the decision queue; the first published conversion rate | — |
| 10 | Jan 23–24 | Pack batch 7, the digest scanner | Daily requirements land as records matched to the verified bench |
| 11 | Jan 30–31 | Rate intelligence, first version: closing-rate history shown at confirmation time | — |
| 12 | Feb 6–7 | Placement-record views a client can check, for two direct-client conversations. A combined-bench pilot with the sister firm only if that firm agreed in writing; otherwise fix and retest buffer | — |
| 13 | Feb 13–14 | Hardening and the day-90 trajectory pack. No new features. | The Feb 19 review: run rate against 36 at $15, the gap named |

**Never in a release.** Marketing automation. Any agent sending
anything. Any agent acting across companies. A claim that depends on
directory-wide mailbox access before that access exists. Anything
touching the one mailbox that stays untouched. A second deploy to fix
one more thing: it takes the next weekend's first slot.

**What this settles, and what it leaves open (the lead's reading).**
- *Order.* The pack's batch 1 goes first, this weekend. The rest of the
  handover's Batch 1 (record 104: whole cents, bill numbering, void and
  credit note, written pay periods, a ledger row per money event, the
  second approver on an over-bill) has no slot on this calendar. It is
  named as displaced, not dropped. The lead's recommendation: it rides
  with week 3, where the money loop needs it, and what does not fit goes
  to week 4.
- *Which page.* The decision queue is the signed-in home, on the second
  firm's tenant first. No public page changes. The homepage ruling
  stands (record 104 addendum).
- *Where it is retested.* On the second firm's tenant. The earlier
  ruling named Tapin for the decision-queue retest before any homepage
  change; that gate still reads Tapin until the founder says otherwise.
- *Entities.* Record 105 already says one tenant with linked legal
  entities. The lead builds the acting-entity stamp on that reading: an
  entity is a layer under the tenant, never a second company.
- *Still open.* The Vision UI file. The screens of the home and the
  control view are to be built to it, not to the text alone. Week 10
  still meets the rule that Etyme never reads a mailbox, and waits on
  the founder's ruling on the door. Pay-hold wording in week 3 waits on
  regulatory.
- *A standing rule the calendar meets.* Blended margin is drawn only
  for a seat that may read margin. The Monday report says so.

### Amendment: releases only on Saturday and Sunday — owner's ruling, 2026-11-21

"No releases Monday to Friday — only Saturday and Sunday." This
replaces rule 5's exception.
- A deploy happens on a Saturday or a Sunday, and on no other day.
  There is no hotfix exception, not for money and not for security. A
  defect found Monday to Friday is logged, and takes the coming
  weekend's first slot.
- Monday to Friday is for running and measuring. The second firm's team
  works on what shipped. The tester checks behavior in production and
  logs defects for the weekend. STATE.md records a weekday finding as
  NOT RELEASED, never as a quiet fix.
- The Monday run is unchanged. Weekdays are for running the business,
  which is why releases are fenced to the weekend.

### The release ask for weekend 1 — 2026-11-21

From the tester, approved by the owner. Acceptance is the tester's
retest in production, per tenant, on Sunday. The names, the figures
and the four real questions in the ask stay outside the repository.

**The second firm: pack batch 1, and nothing else.**
1. Record, ledger, acting-entity stamp, decision-queue home, agent
   control view.
2. The decision queue holds the four real open items, each with its
   owner named, its true age and its proof attached. One is about a
   year old.
3. STATE.md carries the two mission numbers as BASELINE PENDING. The
   baseline is an output of the week 2 census and is never estimated.
The Monday run: the decision queue is that tenant's home, and Monday's
queue review runs off it.

**Tapin: a load onto the same primitives, in the same release.**
1. Its seven billing consultants as placement records: consultant,
   client, agreed rate, start.
2. Three customer records.
3. A first money chain, historical and closed: October 2026 payroll.
4. A first live chain, in draft mode: December 2026 payroll, with
   timesheets in, states visible and discrepancies as decision items.
   Nothing sends and no agent acts.
5. A branding check: Tapin's loaded records render in Tapin's colors.
The Monday run: Tapin's December payroll shows as one chain on the
record. If the load cannot fit without touching the quality of the
second firm's batch, it slips to week 2's first slot. The second
firm's batch does not slip.

**Not this weekend.** The census import and everything after it. Any
Tapin agent. Any new feature for either tenant. Any change to the two
deployed START HERE items beyond defects logged for week 2.

**The lead's reading, said to the founder the same day.**
- *Who loads.* Real records are never written into the repository, and
  no agent writes production data. The four decision items, the seven
  placements and the three customers are entered by a person on the
  screens, after the deploy.
- *Tapin items 1 and 2* need nothing new: the Contracts and Companies
  screens exist. Acts taken after the deploy carry the three stamps.
- *Tapin items 3 and 4 are not a load.* A money chain with states is
  pack batch 3, which the calendar builds in week 3. Nothing built
  today holds a chain. They cannot ship this weekend as "a load onto
  week 1's primitives" without building part of week 3 early, which
  the ask itself forbids. The lead's recommendation: they move with the
  money loop, and week 3 opens on Tapin's two chains.
- *Tapin item 5* is unchecked: whether the signed-in screens, and not
  only the storefront, draw in a tenant's own colors is read from the
  code before it is claimed.

### Week 1 as screen-to-screen flows — owner's direction, 2026-11-21

Specifications are screen-to-screen flows. The build goes screen by
screen against these numbers. The tester retests by screen number. A
screen passes only if its state traces to a record, its actions work
end to end in production, and the ledger entry shows in A5. Where a
flow screen conflicts with an earlier text specification, the flow
wins for week 1, and the conflict is written in STATE.md.

**Flow A, the second firm: the decision queue.**
- *A1 Sign-in* lands directly on A2. No dashboard, no tiles.
- *A2 Decision queue (home).* A list, oldest first. A row is a
  one-sentence question, its owner, its age in days, and the acting
  entity. Week 1's rows are the four real items. A row opens A3.
- *A3 Item.* The question on top. Under it the proof: linked records
  and figures. Under the proof exactly three buttons: Approve, Send
  back, Reject. Send back and Reject need a one-line reason typed on
  the item. Send back returns to A2 with the reason attached and the
  age still counting. Approve and Reject go to A4.
- *A4 Decision recorded.* The item shows the decider (name and entity
  stamp), the time, the decision and the reason. It leaves the queue
  and shows in A5's ledger. No outcome exists only by phone.
- *A5 Agent control* (a tab from A2). Each agent: its running state,
  its actions today, its meter against its cap, its kill switch. Under
  them the audit ledger: every action stamped with entity, person or
  agent, and time. In week 1 no agent acts; the ledger is live and the
  agent rows read "not enabled".
- *A6 Record view* (from any proof link in A3). The record with its
  full ledger history. Every counter anywhere traces to a record seen
  here, or it does not ship.

**Flow B, Tapin: the money loop.**
- *B1 Sign-in* lands on the decision-queue home. Tapin's queue starts
  empty except payroll discrepancies.
- *B2 Consultants.* The seven billing consultants as placement
  records: name, client, agreed rate, start, current chain state.
- *B3 Placement record.* Consultant, client, rate history, documents,
  and the period's state strip: timesheet owed, received, reconciled,
  invoiced, payment pending, paid unconfirmed, confirmed closed, with
  the current state marked.
- *B4 The October 2026 chain*, historical and closed, with its ledger.
- *B5 The December 2026 chain*, live, in draft mode. A timesheet's
  arrival moves the state, recorded by hand or on import; no agent
  acts. An amount mismatch is DISPUTED and a decision item in B1.
- *B6 Payroll summary.* Each consultant's state for the period, the
  total payable, and discrepancies as decision items with owners.
- Tapin's own colors throughout.

**Conflicts with standing text, flagged (the flow wins for week 1).**
1. *Three buttons.* The standing rule is a card with Yes and Not now,
   through one approval route. A3 has Approve, Send back, Reject. The
   decision item is built to A3; the twin's own cards are unchanged.
2. *A question that is not a yes or a no.* One of the four items asks
   which of three courses to take. With three buttons, the question is
   written as one proposed course, and the reason line carries the
   rest. The lead recommends this wording at entry.
3. *"No dashboard."* The seat lands on the decision queue. The left
   column and its switch stay, or nobody could reach a record.
4. *Meter and cap.* No price exists (free while testing). The meter is
   a count of actions; the cap reads "not set".
5. *A kill switch with no agent.* In week 1 each agent row reads "not
   enabled", and no switch is drawn that would do nothing.
6. *Tapin's colors on signed-in screens.* The design system gives every
   signed-in screen Etyme's tokens, and no tenant colors are stored.
   This is new building, not a load.
7. *Flow B is the money loop*, which the calendar builds in week 3.
   The ask's own clause applies: Flow A does not slip; Flow B ships
   with it only if it is built and green in time, and otherwise takes
   week 2's first slot. Tapin pays monthly (record 95) and that rule
   is not built; B6's "total payable" is the sum a person entered on
   the chain, never a figure Etyme worked out.
