# 115 — The four agent gaps, built after the first deploy (2026-11-23)

## The owner's words

"OWNER DECISION — BUILD THE FOUR GAPS. Sharath answered yes: build the
four gaps next, after Saturday's deploy — (1) the statement-of-work
item, (2) one checklist per petition type, (3) the on-time notice
check, (4) saying why a chase was skipped. Sequencing unchanged: the
Saturday Nov 28 deploy of c8d8abaf7 stays first ... the four gaps build
after that deploy, for the following release."

## What each gap is (from the chain report of 2026-11-23)

1. **Statement-of-work item.** The contracts checklist compares bill
   rate, MSA terms and the order window, and has no SOW item. Its rate
   is compared with the line's own current rate, not a signed paper.
2. **One checklist per petition type.** The immigration checklist is a
   fixed four-line list for every petition.
3. **On-time notice check.** The notice log flags when the ten business
   days end; nothing checks the notice went up on time.
4. **Why a chase was skipped.** The money-owed chase skips a bill held
   by an open reconciliation question, or with no receivables owner,
   without saying so.

## Order

Saturday 2026-11-28 deploys c8d8abaf7 first. The four gaps are built
after it, for the following release. Gaps 2 and 3 have a legal
consequence: the petition-type lists and the on-time rule are
regulatory's, warn until regulatory confirms them with a source, and
never block. No agent signs, moves money, decides a person or publishes
compliance copy. Defaults elsewhere held.

## What was built

**Gap 1, the statement-of-work item (2026-11-24).** The contracts checklist
lists a "Statement of work" item on a placement whose engagement (its own,
else its order's) has a written statement of work: signed reads met, a
written one with no signature date reads as drift and opens one card to the
Contract Manager, else the Owner. It warns only. A new bill rate item no
longer starts "agreed" with the line's own rate: it has no agreed value and
reads open ("no signed paper recorded"), opens no card, and becomes met or
drift only after a person records the signed paper
(`POST /api/compliance/checklist-items/:id`). The lead's rulings: rate items
the agent had already listed are left as they are, so they still hold the
line's old rate as agreed and read met without a paper until a person
records one; there is no SOW rate field; two lines under one unsigned SOW
open one card each. Known edge: recording a signed paper on the statement
of work item itself would agree it to "Not signed"; the route was not
touched and a person should sign the SOW on the engagement instead.
