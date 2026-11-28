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

## Advanced outreach is the selling layer across the plugins (Pax, 2026-11-28)

- It works closely with Websites (the doors it sends people to and lands
  them on), Training (courses, completions and badges as content and
  proof) and Pods (team capacity and offers as what is sold), all read
  from the one ledger.
- It detects automatically, from audience parameters: role (candidate,
  client, partner), industry, skills, location, relationship stage, past
  ledger activity and consent status. Only consented audiences are used.
- Tripwires watched on the ledger: pod capacity opening or an engagement
  ending; a cohort completing a course; a job unfilled past its threshold;
  a new bench skill matching client demand; repeat visits to a course or
  pod page; a completion shared to LinkedIn; a client contract ending.
- A tripwire plus a matched segment is a detected push. The engine matches
  content (a course, a pod offer, outcome proof), assembles the push, and
  sends it inside a campaign approved as one pack. Detection and assembly
  are automatic; an unapproved one-off send never happens.
- Replies land in the decision queue. Results are measured as cost per
  activated tenant and cost per qualified, consented resume.

Lead's notes on what the record can honestly see:
- "Repeat visits" can only count a signed-in person or a known contact
  who arrived through a tracked link from a letter; an anonymous visitor is
  never identified, and page analytics stays on marketing pages only.
- "Shared to LinkedIn" is the learner's own ledgered share click; nothing
  is read from LinkedIn.

## Pax, 2026-11-28: build detection now

Build the detection part now from the spec above: the audience builder,
the tripwires on the ledger, content matched to a segment, and packs sent
only inside a campaign approved as one pack. Campaigns, the outcome email
series, the affiliate engine and the publish layer wait for the design
document, which is in the architect's workspace and not yet in a
repository. Detection does not wait for it.
