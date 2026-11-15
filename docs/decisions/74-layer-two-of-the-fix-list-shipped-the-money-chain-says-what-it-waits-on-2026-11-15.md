## Layer 2 of the fix list shipped: the money chain says what it waits on — 2026-11-15

**What it is.** The second of five layers of the fix list of 2026-11-14
(record 72): area E, "jobs that cannot complete". Approve a timesheet,
raise a bill, extend a company, and the Settings sentences about
approvals, the pay-period Sunday and integrations. It went out as its
own deploy.

**What the read-only pass found.**
- *Timesheets.* The empty page was two fixed sentences. It could not
  tell "nobody is placed" from "placed and not started", "started and
  not filed" or "filed and waiting for the client".
- *Bills.* A bill needs six things in order. The page named one, its
  dialog another, and the button was drawn before the page knew whether
  anything could be billed. Payables had its pay act all along; the
  firm's page was empty because it buys from no supplier, and did not
  say so.
- *Extend.* It writes one row and emails nobody. The only way back was
  inside the drawer, and "Can be undone" was printed under every row.
- *Approvals.* Both Settings sentences were wrong in part; neither read
  what the approval engine does.
- *The pay-period Sunday.* The box existed since record 71. The places
  blocked on it did not link to it, and a firm that never saved its
  payroll choice was told nothing.
- *Integrations.* Nothing is connected and nothing can be mapped. The
  page showed a product as picked.

**What went out.**
- An empty Timesheets page says which step is missing, for the seat
  reading it, and links to that step where the seat may do it. Only the
  worker files; nothing offers to file for her, and nothing mentions
  email. Tiles that count weeks narrow the list to them.
- Where a client is not on Etyme and nobody there who approves hours is
  recorded, Timesheets and Bills both say the first step first: add that
  person under Contacts, then attach the approval on the week. The
  attach form offers the contact just saved.
- Bills and its dialog say one sentence, from the route, about what a
  bill waits on. The button is drawn only where something can be billed.
  The act is "Raise a bill"; "Send" delivers it; one name for each state
  on the list and on the bill. Before Send, a line says where it goes
  and whether an email can leave. A seat that may not raise a bill is
  told to ask a seat the firm has filled, on Bills, on the week's own
  page and on the placement.
- Payables says where an invoice receipt comes from and that a firm's
  own employees are paid by payroll.
- Extend leaves its sentence on the row with Undo beside it, also under
  a filter. A refused Undo links to where the work is ended. History
  says "Can be undone" only while it can.
- The activity log offers Reverse on no row. Its Reverse had only ever
  stamped the row and never undone the act, for any action. Each row now
  says where the act is undone, with a link for a seat that may, or that
  it cannot be. A direct call is refused in the same sentence and marks
  nothing. An act is offered an undo on the log only once its real undo
  is written there (`UNDONE_BY_THE_LOG` in `lib/autonomy`).
- Accepting and rejecting a week are buttons in words, where they were a
  bare tick and a cross.
- Approvals and Cost centers read one count of company-wide rules, link
  to each other, and name a department's rule as that department's. A
  rule on the money can be added.
- Every place blocked on the pay-period Sunday links to its box, which
  opens with the cursor in it. A firm that never saved its payroll
  choice is told, not refused. No screen suggests a Sunday.
- Payroll says what Calculate and Process did. Her page reads a
  processed week as paid on her pay day, the period's own, and never on
  the day Process was pressed.
- A blocked start links to where the I-9 is recorded.
- Integrations says Etyme is connected to no accounting system and makes
  a file the firm loads itself. No product is shown as picked.
- AP & Payroll no longer reads the amount to bill after accepting a
  week; forty hours and that amount gave the bill rate away.
- The job-status route checks whose job it is. It had checked nothing:
  any signed-in person could close another firm's job by its id.

**Choices the coordinator made, for the founder to overrule.**
- "Raise a bill" makes it and "Send" delivers it. His own word,
  "release", is a one-line change.
- Extend gets no confirm step; it gets an Undo.
- A supplier keeps the Approvals and Cost centers tabs.
- A processed week reads "paid on your pay day" until that day comes.
- An attached approval keeps the words of record 46 and ends "evidence
  attached".

**How it was checked.**
- A reader who built none of it ran the routes and found three faults:
  Timesheets said a worker "has not filed" on a placement that had not
  started; Extend lost its sentence under a filter; the approvals
  sentence was false for a firm whose only rule is one department's.
  All fixed.
- Four full release checks. The first had six unit tests red, each a
  pin on where a rule was written, after the rule had moved. The second
  was green. The third had one integration test red: the Phase 1 walk
  pinned the old words of a refusal the last fix reworded. The fourth,
  on the commit deployed, was green.
- Two presses in a browser. The first found the figures right to the
  cent and stopped on older untrue sentences: the paid day on her page,
  "Approved by email" for an attached file, roles nobody holds, an undo
  that undid nothing, a block with no link. The second passed eight
  items of ten and stopped on four things: a bare tick for accepting a
  week; two sentences that named roles the firm had not filled; and the
  activity log's Reverse, which marked a job sent to suppliers as
  reversed while the supplier still held it. All four were fixed, and
  the coordinator pressed the four on the built app.

**The deploy.** Pushed 13:39 UTC, serving 13:45 UTC: deploy commit 9233ec91
(source d85b87fc1), on top of aaafbb9f. Twenty-two commits, no schema
line. Health: database ready. Every public page, sign-in, sign-up and
`/site/tapin` answered 200. The inbound email door answered 404.

**Open, for the founder.**
- "Raise a bill" or "Release a bill".
- Does a supplier keep the Approvals and Cost centers tabs?
- May the one generic journal file carry Etyme's own account codes
  where a firm has mapped none? Today the export refuses, and no screen
  can set a code, so it can never go.
- Should an attached file read "Approved by email" at all?
- Should Contacts have a role for the person who approves hours?
- Should a bill go to a contact recorded only as the hours approver,
  where no accounts-payable contact is recorded?
- May a job be withdrawn from one supplier alone?
- Layouts named after real accounting products remain in the invoice
  coding code. They go with the coding block (record 64).

**Left for a later batch.** Many log rows are still stored as "can be
undone" by the routes that write them, in every owner's files. The log
no longer reads that flag to offer anything, so no screen is wrong; each
owner makes its flag honest in its own pass. The architect's report
lists them by owner.

**Lessons, so they are not paid for twice.**
- An empty page knows why it is empty, or it reads the route that does.
- A stored "can be undone" is not the truth. It is worked out when read,
  from the rule that would do the undo.
- A sentence that tells a person whom to ask names a seat the firm has
  filled.
- A builder who moves a rule greps every test that pins its old place,
  another owner's included. The coordinator runs the whole unit suite
  before the release check.
- A route no screen calls is still a door. Every door that changes a
  firm's record checks whose it is first.
- A walker leaves no file in the repository.
- A button that says it undoes is traced to the code that undoes. Where
  there is none, the button is the fault, whatever the row's flag says.
- A reworded refusal is searched for in the integration tests too. The
  unit suite does not find those pins.
