# STATE.md

The state of every item in the handover of 2026-11-21
(`docs/decisions/104-the-full-pending-work-list-handed-over-2026-11-21.md`).
A fresh session reads CLAUDE.md, that handover and this file, and
continues from here. Written 2026-11-21 after the START HERE tranche's
deploy.

**How to read it.**
- DONE means built, release-checked, walked in a browser and deployed.
  It is still a CLAIM until the tester's retest in Tapin production
  passes. Nothing below has been retested yet.
- BLOCKED names what it waits on.
- NOT STARTED means no code was written for it in this tranche.
- Production serves deploy commit `756963c8` (source `19c3c102a`) on
  `www.etyme.com` and `etyme2040.vercel.app`, checked 2026-11-21 20:41
  UTC. Deploys before it this week: `17f680c4` (2026-11-18),
  `7aaf79cb` (2026-11-21).

## How to work (for the next session)

- Source branch: `claude/extract-rails-business-logic-s1pd8`. The deploy
  is a gated replay to the product repository's `main`; the last
  replayed source is `19c3c102a`. The replay and smoke scripts live in
  the session scratchpad and are not in the repository: a fresh session
  rebuilds them from "Release" in CLAUDE.md, or asks.
- Release check, run in parts because the build machine restarts when
  idle: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`; the
  whole unit suite; the integration suite split in three and run in the
  foreground; `npx next build`. Then a walk in a browser by a reader who
  did not build it. Then deploy, smoke, stop.
- Workers: the strongest model at low effort. Schema and money work is
  one builder at a time under the lead. Never `git stash` on the shared
  tree.
- A date-built test must make the world it needs (record 103).

## START HERE

| # | Item | State | Evidence, or what it waits on |
|---|---|---|---|
| 1 | Sensitive numbers masked | DONE in part (claim) | See below. |
| 2 | Payroll shows the configured cycle | DONE (claim), one question open | See below. |
| 3a | Home: decision queue | BLOCKED | The prototype file `etyme-vision-ui.html` did not arrive in the session. The owner said to build to those screens, not to the text alone. |
| 3b | Home: agent control | BLOCKED | The same file, and the agent specifications of Phase 5. |
| 4 | Two lists owed | DONE in part | The eight Layer 6 questions were given verbatim with a recommended answer each (from the prototype's notes; they are copied at the end of this file). The "four overclaiming screens" could not be given: no audit is filed under that name or number. Record 84 holds four labels reworded on 2026-11-16. Waiting on the tester's own list of screen names. |

### Item 1, what is claimed

Commits `ba427191e`, `cc5832baf`. Deployed in `756963c8`.
- A tax ID is stored sealed (`taxIdSealed`, `taxIdLast4`; the plain
  `taxId` column is left empty on every write) on `Company` and
  `RemitTo`. Every reply shows dots and the last four, to everyone.
- The one reader is `src/lib/sensitive.ts` (sealing, server only) and
  `src/lib/sensitive-mask.ts` (masking, safe for a screen).
- Screens and routes: Settings > Setup, the company step and its W-9
  reader (`src/app/api/settings/setup/`,
  `src/app/dashboard/settings/setup/items.tsx`); payment details
  (`src/app/api/settings/remit-to/route.ts`); every bill view through
  `src/lib/money/pay-to.ts`.
- The Owner's reveal: a Show control
  (`src/components/step-up/reveal-number.tsx`) and
  `POST /api/settings/sensitive/reveal`, only after a fresh second
  check. Every reveal and refusal is on the security log
  (`SENSITIVE_REVEALED`, `SENSITIVE_REVEAL_REFUSED`), never the number.
  An Admin is refused.
- Bank details were already only bank, account name and last four. No
  column holds a full account, a routing number or a social security
  number; a test fails if one is added.
- No model prompt reads a tax ID; a test guards it.
- Walk: 593 page and data replies across six seats and three public
  pages held no full number. The authenticator-app reveal was proven end
  to end. With the data key unset, a new tax ID is refused in a
  sentence.

**Not built in item 1:**
- Anyone but the Owner asking to see a number: the request, the
  Owner's approval card, the granted window and its purposes (record 99,
  rule 3). A non-Owner reads that it is not built yet.
- Sharing outside the firm (record 99, rule 4).
- Cover grants (record 99) and the three-step role option (record 100).

**Not proven in item 1:** the passkey path of the reveal; the public
company page and a client's view of a supplier's record (no such page
was reachable on the seeded world); a model-written Ask Etyme answer;
the reveal for a payment-details tax ID.

**Waits on the owner (Phase 2 kind, a new key):**
- `ETYME_DATA_SEAL_KEY` set on the host (32 bytes). Until then
  production refuses to save a new tax ID, in a sentence. Existing ones
  show masked.
- Then `npx tsx scripts/seal-sensitive.ts` (counts only), then with
  `--write`, against production with that key. Until it runs, tax IDs
  typed before 2026-11-21 are still plain in the database, masked only
  by the screens listed above.

**Behavior change:** an empty tax ID box no longer clears the number.
Nothing on that screen clears it.

### Item 2, what is claimed

Commit `10a489dfc`. Deployed in `756963c8`.
- The cause was not an old cycle. Periods are counted forward and back
  from the first Sunday, so today's work is in the period Nov 15 to
  Nov 28. The picker did not reach Dec 27, and nothing on the page said
  the periods were counted back from a Sunday still ahead.
- Payroll (`src/app/dashboard/payroll/page.tsx`,
  `src/app/api/payroll/route.ts`, `src/lib/money/pay-periods.ts`) now
  opens on the period holding today, lists every period up to the first
  one, and says: "<firm> counts its pay periods from the first period,
  Dec 27, 2026 – Jan 9, 2027, worked out Wed, Jan 13, 2027 and paid Fri,
  Jan 15, 2027. The periods before it are counted back from that
  Sunday." with "Open the first period".
- A pay day already written keeps its date when the first Sunday is set
  or a holiday is added; tested and walked.

**Open, the owner's to decide (a pay rule, not changed):** is work
before Dec 27 paid in two-week periods counted back from Dec 27 (what
ships), or on Tapin's old monthly cycle (record 95), with periods only
from Dec 27?

**Watch, from the walk:** a firm that changes its pay period after pay
rows exist can show two different pay days for one person (stored rows
against the page's periods). Seen on a firm switched by SQL; not
confirmed on a firm that changed it through Settings.

**Not confirmed:** Tapin's real company row was not read. If it lacks
the Sunday or the every-other-week choice, the page lists by month.

## Phase 1

### Batch 1, money integrity

| Item | State | Note |
|---|---|---|
| Sensitive numbers (START HERE 1) | DONE in part | Above. |
| Payroll cycle display (START HERE 2) | DONE (claim) | Above. |
| Whole cents everywhere | NOT STARTED | Not audited in this tranche. |
| Invoice numbering, void, credit note releasing its lines | NOT STARTED | |
| Pay periods written down | NOT STARTED | Periods are worked out, not stored. |
| A ledger row for every money event | NOT STARTED | |
| Over-bill exception with a second approver | NOT STARTED | |
| One money rule on the Ask pay card, at draw and at press | NOT STARTED | |

Batch 1 is NOT complete. Only the two START HERE items went out. The
retest path named in the handover (the lifecycle money path, the named
payment run, the pay-card cases) is not yet answerable.

### Batch 2, the hiring chain

| Item | State | Note |
|---|---|---|
| Availability, tier and consent on the candidate's record | NOT STARTED | |
| The Offer record | NOT STARTED | None exists. |
| Insurance-expiry gate with a renewal path | NOT STARTED | |
| "Raise a bill" across several parties | NOT STARTED | |
| Warning where an order's and a line's dates disagree | NOT STARTED | |
| Own W-2 employee on Add consultant | DONE (claim) | Deployed `7aaf79cb`. Candidates > Add consultant > "Our own W-2 employee". Not in the handover's Batch 2 list; it was record 102, item 2. Adding many in a row is not counted against the hourly invitation limit. |
| Add to Bench links to Add consultant | DONE (claim) | Deployed `7aaf79cb`. Record 102, item 6. |

### Batch 3, identity, companies and mail

| Item | State | Note |
|---|---|---|
| One person across several addresses (D3/D4) | NOT STARTED | Scouted: no merge code exists; nothing merges silently. The existing route is passing ownership. A staff merge tool would be new. |
| Company profile fields (A6) | NOT STARTED | Scouted: website exists; description, industry, specialty, markets served do not. Needs the schema. |
| Entity types (B3) | NOT STARTED | Scouted: asked only in a skippable setup step. |
| Companies import (G7) | NOT STARTED | Scouted: reuse the import pipeline. |
| Invitation resend, the provider's 403 (D1) | BLOCKED | On the owner or tester confirming the sending domain is verified at the mail provider. The code already says "Not sent" on a refusal. |
| Mail outbox with visible retries | NOT STARTED | |
| The second firm's 21 invitations | NOT TO BE TRIGGERED | Only after the tester verifies one test invitation end to end. |
| Invitation email layout | DONE (claim) | Deployed `17f680c4`: one button, no printed address. |
| Mailed links carry the lasting address | DONE (claim) | Deployed `17f680c4`. |

### Batch 4, Ask Etyme

| Item | State | Note |
|---|---|---|
| The model on the real tables, answers with links, Settings filled | BLOCKED | Phase 2: the owner's model key. Nothing that does not need the key was built in this tranche. |
| Fixes before the key | DONE (claim) | Deployed `7aaf79cb`: the check, screening, matching, bio, nightly match and sheet import ask the company's switch, mask what leaves, and say "unverified". Tokens from matching, bio and skill-check calls are not counted toward the monthly allowance. |
| Public Ask questions kept | DONE (claim) | Deployed `7aaf79cb`: a `PageAsk` record, the Questions tab under Jobs, a decision card. Questions stored before the deploy need `npx tsx scripts/backfill-page-asks.ts` (then `--write`) against production. |
| The questionnaire at 90% | NOT STARTED | Baseline about 21 of 30 failing. |

### Batch 5, surfaces

| Item | State | Note |
|---|---|---|
| Approvals screen | NOT STARTED | |
| Payment-run screen with a maker and a checker | NOT STARTED | |
| Tenure display | NOT STARTED | |
| Demo-seat gaps | NOT STARTED | |
| The overclaiming screens reworded | BLOCKED | On the tester's list of screen names (START HERE 4). |

### Homepage and legal

| Item | State | Note |
|---|---|---|
| The public page | AS DEPLOYED, held | The 2026-11-18 design is live (`7aaf79cb`, record 103). The handover says that design was rejected. The owner ruled on 2026-11-21: "Leave the Nov 18 page live until the replacement." |
| The replacement | BLOCKED | The tester says the replacement's target is the Decision Queue home of the Vision UI file, which did not arrive. Asked and unanswered: whether the queue replaces the signed-in home (the lead's reading) or the public address itself. No replacement was built, so no file was used as its base. No homepage change deploys until the Decision Queue home passes the retest in Tapin. |
| Legal pages | DONE (claim) | Deployed `7aaf79cb`: the privacy policy and DPA name page analytics on public pages and the host as processor, and say what matching sends. Open: one awkward sentence about the analytics package's cookies. |
| Page analytics | DONE (claim), waits on the owner | On public marketing pages only. Collects nothing until switched on in the host's project settings. |

## Phase 2, the owner's own steps

None is done as far as this session can see (names were checked by the
tester on 2026-11-18, not by this session).

| # | Step | Unblocks |
|---|---|---|
| 1 | Model key | Batch 4 |
| 2 | Microsoft sign-in secret | The Microsoft button |
| 3 | Professional-network sign-in secret | The candidates' button |
| 4 | Mail delegation for the second firm | Agent email access (Phase 5) |
| 5 | Backup of the second-check key | The owner's vault |
| new | `ETYME_DATA_SEAL_KEY`, then the sealing script | Saving a tax ID in production; sealing the old ones |
| new | Web analytics switched on at the host | Measuring the homepage |
| new | The stored-questions script run against production | The questions asked before 2026-11-21 |

## Phase 3, tenants

NOT STARTED as build work. Tapin's real business is not on the record.
Nothing was entered. The second firm's invitations were not resent.

## Phase 4, the truth pass

NOT STARTED. Layers 4 and 5 have not been retested in production. The
gaps of Layers 7 to 10 are neither built nor relabeled beyond record 84.
Layer 6 templates: a static prototype only (`prototypes/storefront/`,
record 94). Demo data was not cleaned of real names. No pricing was
built.

## Phase 5, agents

NOT STARTED. No specification has arrived. Nothing is to be built from
an earlier one. The scout's inventory of the twin's fourteen acts is in
record 98.

## The second firm's execution pack (record 105)

**In one sentence (record 106).** The second firm reaches one million
dollars of profit in 2027 by converting its existing demand and bench
at a tracked rate, holding agreed rates against drift, and collecting
on one chain. The pack builds exactly that. Measure conversion, drift
and the age of money owed from the ledger, and report them with each
batch.

NOT STARTED. It arrived on 2026-11-21 after the tranche was deployed.
- The named pack and its day-one data are NOT in the repository, by the
  standing rules. Record 105 holds the structure only. A fresh session
  that needs a name or a figure asks the tester for the pack; it never
  writes one into a file, a test or a commit.
- Its batch 1 (primitives: record, ledger, acting-entity stamp, decision
  queue home, agent control view) is BLOCKED on: the Vision UI file; the
  ruling on entities (record 105, point 1); and the ruling on order
  against the handover's Batch 1 (point 5).
- Its batches 2 to 7 are NOT STARTED. Batch 7, the digest scanner, also
  waits on the mailbox ruling (point 2). Any pay-hold wording waits on
  regulatory (point 3).

**Owner's planning assumption, 2026-11-21 (record 106).** Plan the
second firm as a company with no loan. Collection is working capital,
with bench carry as its first use. The model's arithmetic stands; the
day-90 review reports operating profit directly. The money loop gains
one field on a chain of money owed to the firm: where collected money
was put (bench carry, operations or reserve), decided and recorded by a
person. NOT STARTED, with the rest of the money loop (pack batch 3).

**Owner's corrections, 2026-11-21 (record 106).**
1. The loan is the sister firm's, not the second firm's. The second
   firm is the creditor. The chain of money owed by the sister firm
   carries a counterparty-risk flag; the pace of collection and any
   further credit to it are decision-queue items, never routine chases.
   NOT STARTED (pack batch 3).
2. The mission: 36 consultants billing at an average margin of $15 an
   hour by 2027-11-21 (about $1.0 million of gross profit). The two
   headline measures on the agent control view and the trajectory report
   are the count of consultants billing and the blended margin an hour.
   Both read "not yet measured" until the census is loaded (pack batch
   2). Quarter one is 2026-11-22 to 2027-02-19; the day-90 review
   reports against the mission. The blended margin is drawn only for a
   seat that may read margin. NOT STARTED.

## The weekend release contract (record 107)

Thirteen weekend releases, 2026-11-21 to 2027-02-14. One item, one
deploy, then stop. Done means the second firm's team runs it on Monday;
the tester's retest on that tenant is acceptance. The calendar is in
record 107.

**Standing release rule (owner, 2026-11-21).** Deploys happen on
Saturday and Sunday only. There is no hotfix exception, not for money
and not for security. Monday to Friday is for running and measuring: a
defect found then is written below as NOT RELEASED, never fixed
quietly, and takes the coming weekend's first slot.

**Weekday findings, NOT RELEASED.** None yet.

**The two mission numbers, as of 2026-11-21.** Consultants billing:
BASELINE PENDING. Blended margin an hour: BASELINE PENDING. The
baseline is an output of the week 2 census and is never estimated. The
target is 36 at $15 by 2027-11-21.

**Week 1, Nov 21–22: pack batch 1, primitives.** IN PROGRESS: scouted,
nothing built. The Monday run: the decision queue is home, four seeded
items with owners and true ages.
- Settled by the contract: the pack's batch 1 goes before the rest of
  the handover's Batch 1; the decision queue is the signed-in home.
- Built on record 105's reading: one tenant, legal entities as a layer.
- Still waited on: the Vision UI file, for the two screens.
- The release ask for the weekend (record 107) adds a Tapin load. The
  four decision items, seven placements and three customers are entered
  by a person on the screens after the deploy: NOT STARTED, the
  tester's. Tapin's two money chains need the money loop of week 3 and
  are NOT IN THIS RELEASE unless the owner rules otherwise. The
  branding check is NOT CHECKED.
- The rest of the handover's Batch 1 is DISPLACED, not dropped; the
  lead recommends week 3, with the remainder in week 4.

**Week 1 by screen (record 107).** Each is NOT RETESTED until the
tester passes it by number.
- Flow A, the second firm: A1 sign-in lands on the queue · A2 queue ·
  A3 item with Approve, Send back, Reject · A4 decision recorded · A5
  agent control and ledger · A6 record view. IN PROGRESS.
- Flow B, Tapin: B1 home · B2 consultants · B3 placement and state
  strip · B4 October chain · B5 December chain · B6 payroll summary ·
  Tapin's colors. NOT STARTED. It follows Flow A, and slips to week 2's
  first slot if it is not green in time.
- Conflicts where the flow won over standing text: seven, listed in
  record 107 (three buttons; a three-way question; the left column
  stays; the meter is a count with no price; no dead kill switch;
  tenant colors are new building; Flow B is week 3's money loop).



Not met. No batch has been retested.

## The eight Layer 6 questions, verbatim, with the answer recommended

1. Should the tagline read "Data engineering consultants, ready to
   interview" once a data engineer is shown? — Yes.
2. Does "train → bench → profile → interview" stay off Tapin's page?
   (Record 69.) — Yes.
3. Is a pod a team, each person consenting, interviewed as one? — Yes.
4. May a pods heading say "AI data readiness"? — No.
5. Is hradmin@etyme.com Tapin's public contact? — No; the firm, not a
   mailbox, unless the Owner opts in.
6. Does the network board live inside the app? — Yes.
7. Is Ask-first every new tenant's default? — No; it is Tapin's choice.
8. Does a firm see only requirements from firms it already trades with?
   (The prototype says yes.) — Yes.

## Questions waiting on the owner or the tester

1. ANSWERED by record 107: the decision queue is the signed-in home.
2. The Vision UI prototype file.
3. The names of the four overclaiming screens.
4. Work before Dec 27: two-week periods counted back, or the old
   monthly cycle?
5. Whether the sending domain is verified at the mail provider.
6. The four pay defaults for monthly pay in arrears (record 95).
7. A week at a changed base with no recorded overtime rule: hold the
   whole week, as built, or only the premium (records 92, 94)?
8. Whether the host's page analytics sets a cookie, for the privacy
   sentence.
9. Entities: a sister firm inside one tenant as a linked legal entity,
   or its own tenant with two seats (record 105, point 1)?
10. ANSWERED by record 107: the pack's batch 1 first. Open in its
    place: which weekend takes the rest of the handover's Batch 1?
11. May the digest scanner read mail, and by which door (point 2)?
