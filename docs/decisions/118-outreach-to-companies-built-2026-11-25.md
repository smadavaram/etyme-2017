# 118 — Outreach to companies, built (2026-11-25)

Step 1 of record 117's order of work. The lead's rulings that shaped it are
below; the owner has not yet confirmed the numbers, which are proposals.

## What a person does

Companies, Outreach (a tab for a supplier, an integrator and an MSP; a client
only buys, so it has none). Pick an audience, pick an offer, read the letter
Etyme drafted and change it, see who gets it and who is held and why, press
"Ask for a yes". One card goes to the Account Manager, else the Owner. A batch
page then counts each contact's letter.

## The lead's rulings

- **Hot list** is lines a person types, with a suggested draft read from the
  people the firm already shows on its public page: skills and availability
  only, never a name, a rate or an address.
- **Cooling-off** is 180 days per firm, per company, per side, whatever the
  offer. A proposal.
- **Follow-ups** are two, five working days apart. A proposal.
- **Daily cap**: each send counts the one row it writes. What the cap does not
  allow today stays ready for the next run.
- **Approver**: Account Manager, else Owner.

## How it is built

- One batch is one task (kind OUTREACH_BATCH, agent `outreach-batch`, named
  "Outreach batch" on Agent control) and one card. The plan is one letter,
  sent again at most twice, to each of N contacts. The task ledger refuses a
  letter that is not part of the approved batch and a third follow-up.
- Each contact is one `OutreachLetter`. Each send is its own email with one
  To, through the mail door, with the letter as its record. Sent and bounced
  are counted from the mail sent; interested and unsubscribed from the
  letters. There is no open rate and no tracking in a letter.
- Etyme reads no mailbox. An answer comes only through the signed "I'm
  interested" link: opening it changes nothing; its button opens one lead
  (source OUTREACH) and one card and stops that letter's follow-ups. A
  second use opens nothing more. The firm's own page is where the contact
  lands, or a thank-you page where the firm has none.
- Record 116 on every letter: the sending firm and its postal address, an
  honest subject (never Re: or Fwd:), an unsubscribe link, bounced addresses
  left alone. A firm with no postal address, or a deployment with no public
  web address, drafts nothing and says why.
- A company Not classified, a contact at a company not on the firm's own
  register, and another firm's rolodex are never in an audience. One company
  gets one letter per batch.

## Not built

Candidate outreach (waits for the candidate's own yes to updates), courses,
the learn card after a batch, suppliers by skill, a saved-filter table, a
browser case that presses "Ask for a yes", and a walk on screens. The
dormant check-in does not yet read a batch letter when it counts the 180
days; a batch does read the check-in.
