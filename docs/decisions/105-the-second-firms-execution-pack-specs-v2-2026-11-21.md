## The second firm's execution pack, specifications v2 — 2026-11-21

**What it is.** A pack from the founder's tester, on the founder's
direction of 2026-11-21 ("execute [the second firm] on Etyme first" and
"onboard strong users and agents"). It is built on a read-only study of
that firm's own mailboxes, made outside Etyme. It supersedes the first
agent specifications.

**Where the pack itself is kept.** Not in this repository. It names
real companies and real people, with pay, debts, terminations and
immigration papers. The standing rules keep every real company out of
the repository, and a person's data out of a history nobody can erase.
This record holds the structure only. The named pack, and the day-one
data, stay with the tester and the founder, and reach production
through the import and the screens, by a person. No test, seed, comment
or commit carries a name from it; a test is named for the pattern it
proves.

**The model it asks for.**
- One tenant for the firm, which exists already. No second tenant.
- Linked legal entities: a sister firm and a second sending identity,
  whose people confirm the firm's candidates. Etyme and Tapin are
  separate tenants.
- *The acting-entity rule.* Every action on every record carries three
  stamps, written at the time and never changed: the legal entity acted
  for, chosen at the point of action and never read off an address or a
  signature; the person; and the role or queue she held.
- *Roles are queues, not mailboxes*: contracts, accounts, payroll,
  timesheets, legal, HR, plus a decision-queue approver seat and a
  signatory seat.
- Home is the decision queue and the agent control view. Every record
  action is on the ledger, and the ledger is the audit trail and the
  usage meter. The firm pays metered agent usage like any tenant.
- Fifteen seats on the first day and one reserved, each chosen because
  the study shows the person carrying the work. Dormant accounts and
  role mailboxes get no seat.

**Six first-party agents**, each a fixed chain with rule tables kept as
data, a model only inside a step, and never the decider on money,
signing or anything about a person.

| Agent | Does | Never |
|---|---|---|
| Chase and reconciliation | Drafts chases; closes a chase when the timesheet arrives on any thread; registers arrivals with duplicate detection; flags amount differences with the figures | Sends a pay-hold or final notice without a named person's approval; promises a pay date; writes off a balance |
| Digest scanner | Turns requirement digests and requirement mail into requirement records, without duplicates, with a suggested match | Replies to a vendor, submits a candidate, confirms a rate |
| Confirmation tracker | Registers each rate confirmation on the candidate's record; ages unanswered requests; blocks a second authorization in an overlapping window; flags a confirmation naming another candidate | Confirms a rate; counts a draft or a bounced mail as a confirmation |
| Census keeper | Keeps people, client and supplier records from evidenced changes; flags dormant licenses and unverified data | Edits a money field; deletes a record; promotes quarantined data |
| Contracts checklist | Tracks agreed rate and terms against actuals and flags drift; tracks insurance and good-standing dates | Signs; accepts changed terms from a vendor's notice |
| Immigration checklist | One record per petition, each dependent paper its own line; routes signature requests to the signatory seat | Files anything; passes on a paper's contents; decides which fees are recoverable |

Standing guardrails for all six: they draft, chase, track and notify by
a link to the record, and a person sends anything that commits the
firm; silence is never approval; every action is on the ledger with
entity, agent and rule version; rules live in tables a tenant edits; a
failed check stops the action and shows on the record.

**The first chains, each with acceptance tests on the real items.**
- *Money loop.* One chain per consultant per period:
  `TIMESHEET_OWED → TIMESHEET_RECEIVED → RECONCILED → INVOICED →
  PAYMENT_PENDING → PAID_UNCONFIRMED → CONFIRMED_CLOSED`, with
  `DISPUTED` on any mismatch, closed only by a recorded human decision.
  Five human gates: a pay-hold notice, a final notice, releasing a
  payment, a write-off, closing a dispute. Tests: an arrival closes its
  chase; a chain whose three stated balances disagree cannot close; a
  chase draft is blocked while a later confirmation sits unlogged; a
  discrepancy is a decision item on the first day; a pay-hold draft
  cannot send without its approval.
- *Candidate and placement record.* Per candidate and vendor:
  `INTAKE → GATE_PENDING → AUTHORIZED → CONFIRMED → SUBMITTED →
  OUTCOME_RECORDED`. A confirmation is one press on the record by a
  named person. Rate history keeps every fork and never an average.
  Fields come from the papers on the record and are versioned. Tests:
  a second confirmation in an overlapping window is blocked and becomes
  a decision item no one seat can override; a confirmation naming
  another candidate cannot save; a bounce reopens the item; a draft
  imports as a draft.
- *Decision queue*, seeded with real open questions, each with its
  true age, its owner and its proof. A decision made by phone stays
  open until recorded.
- *Contracts and immigration checklists.* The agreed field changes only
  on a signed paper; a petition is complete only when every line is.

**Day-one data.** People, candidates, clients, vendors and suppliers
load with a source and an as-of date each. A stated figure is stored as
a statement, never as invented rows. A purchased legacy bench loads
into quarantine: invisible to matching and marketing until a named
person verifies each person and her consent.

**Build order**, one deploy per batch, then stop for the retest on that
tenant: (1) primitives: record, ledger, acting-entity stamp, decision
queue home, agent control view; (2) census import and the census
keeper; (3) the money loop and its agent in draft mode; (4) the
candidate record and the confirmation tracker; (5) the decision-queue
seeds; (6) the two checklists and their agents; (7) the digest scanner.

**Not in this tranche.** No marketing automation. No agent sends
anything. No agent acts across companies. No seat for a dormant
account, and the 21 old invitations are not resent. Nothing that
depends on mail delegation, and no claim of live mail intake. One
mailbox stays untouched by rule.

**Where it meets the standing rules: for the founder's ruling.**
1. *Entities.* CLAUDE.md says one tenant is one domain name, the entity
   layer is not built, and a group is never modeled as two companies.
   The pack puts a sister firm with its own domain inside one tenant as
   a linked legal entity. Either the entity layer is built now, under
   the tenant (the pack's model), or the sister firm is its own tenant
   and its people hold two seats.
2. *Mail.* "Etyme never reads a mailbox", and the forwarded-mail door is
   closed until his attack walk. The digest scanner reads mail. It is
   last in the order and waits on that ruling.
3. *The pay hold.* The regulatory adviser said on 2026-11-18 that a
   W-2 wage is owed on its pay day whatever a timesheet's state. A
   pay-hold notice as a lever needs regulatory's reading before any
   wording is built, even as a draft.
4. *Metering.* Usage can be counted on the ledger now. No price is
   invented: free while testing still stands until he sets one.
5. *Order.* The handover's Batch 1 (record 104) is not finished. The
   pack's first batch overlaps it (a ledger row for every money event)
   and START HERE item 3 (the decision queue home). Which comes first is
   his to say.
