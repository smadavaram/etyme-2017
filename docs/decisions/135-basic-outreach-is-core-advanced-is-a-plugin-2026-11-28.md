# 135. Basic outreach is core; advanced outreach is a plugin website — 2026-11-28

Relayed by Pax (architect).

- **Basic outreach lives in the core app, on the party's ledger.** Direct
  emails and messages to a party, and candidate update letters, are core
  ledger activity. The candidate-letter capability built in Batch C is
  basic outreach: it is surfaced in the core on the party's ledger, not as a
  separate plugin website.
- **Advanced outreach is the plugin website.** It implements a four-part
  marketing framework (opportunity, offer, customer, money): campaigns, the
  outcome email series, the affiliate and recruiter engine, and the publish
  layer, as set out in the outreach design document of 2026-11-26 and its
  Nov 27 addendum.
- **General rule:** a basic action on the record is core; an advanced
  framework is a plugin website.

Rules that still hold for every letter, basic or advanced: one person's yes
per task (record 112), the mass-mail policy (record 116), a candidate only
after her own yes to updates (record 117), and no screen says an email went
unless email can leave.

Open: the outreach design document is not in either repository, so the
advanced plugin waits until it is added.

## What was built, 2026-11-28

- The candidate update letter and a new letter to one contact go under their
  own mail templates (`candidate-update`, `direct-letter`). The Outreach
  switch holds only `outreach-batch` and `dormant-outreach`, so both go with
  the plugin off, after the firm's one yes.
- A letter to one contact is raised from the party's Ledger tab ("Write to
  <name>", `POST /api/letters/direct`) and follows record 116. Every letter
  sent or held to a party is an activity line on its ledger.
- Open: the advanced plugin site, and a screen that raises the candidate
  update batch.
