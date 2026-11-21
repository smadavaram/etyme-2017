## The full pending-work list, handed over — 2026-11-21

**What it is.** One list from the founder's tester, consolidating the bug
register of 2026-11-19, the production test of 2026-11-20, the weekend
plan and the completion plan. It replaces every smaller tranche,
record 102 included. It is worked in phase order.

**Standing rules it sets.**
- Fix what exists. Build nothing new outside this list.
- Deploy per batch, then stop. The tester retests in production, and
  nothing is done until the retest passes.
- A report states claims as claims, with screen and file names.
- An item that cannot be done in its batch is named, with the reason.
  Other work is never substituted in silence.
- Workers run on the strongest model at low effort. Schema and money
  work is sequential under the lead. The standard model is not used.
  This replaces the model split of record 82.

**Start here.**
1. Sensitive numbers are shown unmasked: record 99's rule is not in
   code. A tax ID, bank details and a social security number are masked
   by default and encrypted at rest; the Owner reveals by a click after
   signing in again; anyone else reads only inside a window the Owner
   approves; every reveal and share is on the ledger. On every screen
   that shows them.
2. Payroll shows the old cycle although the first pay-period Sunday is
   set (first period Dec 27 to Jan 9, worked out Jan 13, paid Jan 15).
   A holiday added later moves no pay day already written.
3. Home is wrong as a board of stat tiles (owner's ruling, 2026-11-21).
   Home is a decision queue (real records, oldest first, the proof one
   click away, Approve / Send back / Reject) and agent control (which
   agents run, what each did, spend against its cap, pause or stop each,
   the audit ledger). It is drawn in the tenant's branding. A number is
   shown only where a click reaches its records.
4. Two lists owed in the reply: the four overclaiming screens, and the
   eight yes/no questions on the Layer 6 prototype.

**Phase 1, the batches.** Each is built, deployed once, and then waits
for the retest.
- *Batch 1, money integrity.* Whole cents; invoice numbering, void, and
  a credit note that releases its lines; pay periods written down; a
  ledger row for every money event; an over-bill exception with a second
  approver; one money rule on the Ask pay card, checked when drawn and
  when pressed. Includes items 1 and 2.
- *Batch 2, the hiring chain.* Availability, tier and consent on the
  candidate's record; an Offer record (none exists, and a new candidate
  cannot start cleanly); an insurance-expiry gate with a renewal path;
  "Raise a bill" across several parties; a warning where an order's and
  a line's dates disagree.
- *Batch 3, identity, companies and mail.* One person across several
  addresses; company profile fields; entity types; Companies import;
  invitation resend; a mail outbox with visible retries. The second
  firm's 21 invitations are resent only after the tester verifies one
  test invitation end to end: the fix is built, the resend is not
  triggered.
- *Batch 4, Ask Etyme.* The model on the real tables, answers with
  links to their records, Settings filled. Blocked on the owner's model
  key; everything that does not need the key is built, the rest flagged.
  Target: 90% of the questionnaire in Tapin production.
- *Batch 5, surfaces.* An Approvals screen; a payment-run screen with a
  maker and a checker; tenure display; demo-seat gaps; the overclaiming
  screens reworded to what is built.
- *Homepage and legal.* The homepage of 2026-11-18 was rejected as not
  converting: not for a CFO only, tenure not a headline, and "we set it
  up with you" removed or qualified. The replacement and the legal pages
  are deployed, and verified live by the tester.

**Phase 2, the owner's own steps** (never waited on in silence): the
model key, the two sign-in secrets, mail delegation for the second firm,
and a backup of the second-check key.

**Phase 3, tenants.** Tapin pays like any other user; its real business
is not yet on the record, and its first real invoice runs through
Etyme's own money chain. The second firm is onboarded after the verified
test invitation. A third firm is a candidate, with consent per
consultant before marketing. Firms four and five are outreach, not
build work.

**Phase 4, the truth pass.** Layers 4 and 5 were never retested in
production. The gaps of Layers 7 to 10 are built or labeled honestly, by
the owner's call. Layer 6 templates render in the tenant's branding.
Demo data still holds real names and is cleaned before any outside
demo. Pricing: tiers with a bounded free tier, and per-action metering
on the agent layer with the ledger as the meter. A per-contractor
package is a proposal, not adopted.

**Phase 5, agents.** Specifications arrive from the tester; nothing is
built from an earlier one. The owner's rulings of 2026-11-21:
1. Agents are a marketplace: a catalog of certified agent workers, in
   standard units, priced per action, metered and ledgered. First-party
   only at first.
2. An agent runs a standard chain (the money loop, the hiring chain),
   configured and never customized, with fixed checks before and after
   and rules kept as data. A model works only inside a step, and never
   decides money, signing, or anything about a person.
3. Every agent drafts, chases and notifies by a link to the record, has
   a named human approver, a spend cap and a stop switch, and is on the
   ledger. An agent acting across companies is not decided and is not
   built.

**Phase 6, the finish gate.** The five batches retested and passed in
Tapin production; the bug register empty or accepted in writing; Ask at
90%; five firms live; the second firm's collections settled or under a
dated commitment; pricing live; the money-loop and HR agents running as
draft and notify; no owner's key outstanding.

**Where it met the record that day.**
- The homepage file of 2026-11-18 was deployed about an hour before
  this list arrived (record 103). The list says that design was
  rejected. No replacement file came with it.
- Record 102's order is replaced by the batches above. Its items 1, 2
  and 6 shipped that morning as claims, awaiting the retest.
- "The four overclaiming screens" and a numbered message audit are not
  in the record by that name. Record 84 holds four labels reworded on
  2026-11-16.

### His answer on the homepage — 2026-11-21

"Leave the Nov 18 page live until the replacement." The homepage of
record 103 stays as deployed. It is not rolled back and not edited. The
replacement is built when its file arrives.
