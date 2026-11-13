## The job twin — decided by the founder, 2026-10-12

The founder's brief: build the **job twin**, a headless agent that acts in
the role of a contingent-workforce program manager. It watches the record,
enforces the rules, and surfaces only exceptions and approvals to a person.
Two doors, one twin, one ledger: **Microsoft Teams** for the ten-second
approvals and alerts where people already work, and **Etyme's own
conversation and dashboard** for configuration, investigation, analytics
and governance. Quick actions and approvals surface on both doors;
configuration, investigation and governance live only in Etyme.
`reports/Muse digital twin for Etyme.md` is the design behind it.

What is decided, and the reason each stands on:

- **Governance is the product.** A **role contract** per company and twin
  kind, stored as data and enforced in code, with three tiers: ACTS ALONE
  (reversible, within rules: flag a mismatch, send a reminder, draft a
  summary), NEEDS APPROVAL (money movement, external messages, anything
  irreversible), NEVER TOUCHES (release payroll, sign agreements,
  award, reject or end a placement, read another company's data, approve
  what the twin drafted or what its own authority's person asked for).
  Every edit of the contract is a new version and is ledgered.
- **Rules first, the model second.** Business rules — the time limit and
  its 90/60/30-day warnings, rate bands, the hours tolerance on an
  invoice receipt, approval chains — are code and data; the twin never
  improvises policy and never is the gate. Ambiguity escalates to a
  person.
- **No twin action without a ledger entry.** `TwinAction` records the
  time, the actor (the twin and the human role it acted under), the
  action, the entity, the rule cited, the rationale in plain English, the
  surface (Teams, web, cron) and the approval where there is one. It
  stands beside the access log and the automation log, not instead of
  them, because an auditor asks who did what under whose authority.
- **Identity binds at activation.** Single sign-on maps the corporate
  identity to an Etyme seat and its permissions. Least privilege. The
  identity that submits cannot approve.
- **Isolation at the query**, never only the screen: a supplier reads
  only its own entries, a client its program, the program owner all.
- **It stands on the existing record.** No new company, person,
  supplier, requirement, timesheet or invoice tables: those exist, are
  seeded and are in production. New is only what the twin needs — the
  role contract, the twin's ledger and approvals, a rule set per company,
  and a twin actor kind on the logs. Rebuilding the record for the demo
  would be the 2017 sprawl.
- **The Teams bot is a route in this app**, not a second service; the
  one new dependency is the bot adapter. Teams never writes state
  directly: every card action calls the one approval route the web also
  calls.
- **The wedge, built first because it is the demo:** the time limit
  watched daily with warnings at 90, 60 and 30 days, and invoice receipts
  checked against accepted hours within a set tolerance and the
  contracted band. The seeded Northbend Athletic desk holds one person
  60 days from the limit and three pending receipts, two clean and one
  with an hours mismatch.
- **Testing budget, the founder's hard rule for this prototype:** tests
  only for what can lose money or break trust — the rules against the
  seed, a NEVER-tier act refused, and ledger integrity. No other new test
  file without asking. The existing suite still has to pass, because
  nothing ships on a red test. `KNOWN-LIMITS.md` lists every shortcut
  plainly. Two passes: the demo path first; hardening only when asked.
- **Not built:** a talent marketplace, more matching, general
  procurement, company-size claims. "Enterprise" stays in titles.
- **The words stay Etyme's** on every screen and card: job request, time
  limit, invoice receipt, bill.

**Built 2026-10-12, M1 to M3, on the existing record.** The rules
(`lib/twin/rules/tenure`, `lib/twin/rules/invoice`), the role contract,
the ledger and the one approval door (`lib/twin/ledger`,
`POST /api/twin/approvals/[id]`), the nightly run (`cron/twin`), the
Teams door (`POST /api/teams/messages`, `lib/teams`, no new dependency:
the route speaks the Bot Framework protocol itself and every card action
calls `decideApproval` with surface TEAMS), the program twin page with
its contract and rule-set editors (`/dashboard/twin`), and the
conversation panel (`POST /api/conversations/twin`, rules first, the
model describes only). `DEMO.md` is the 90-second path;
`KNOWN-LIMITS.md` lists every shortcut by owner. Three things learned,
written down so they are not re-derived:

- **A supplier's invoice has no "approved for payment" status, and gets
  none.** The match is the approval: the AP desk's waiver with a reason
  is what passes a difference, and a status beside it would be a second
  gate nobody sets. One gate, `mayPayInvoiceReceipt` in
  `lib/invoice-match`, is read by the payment route and by the twin, so
  the two cannot disagree about what is payable. A DRAFT invoice is now
  refused as not submitted; a check that returns nothing refuses.
- **The twin cannot ask the program manager.** It acts on the program
  manager's authority, and nobody signs their own, so its questions go to
  the desk that holds the permission (the AP clerk for a receipt) and the
  program manager reads why under each one. A mismatched receipt is never
  put up for a yes; the twin tells the paying desk instead.
- **The twin's reads are logged as the twin, under the person it acts
  for.** `AccessLog.actorKind` TWIN with `actorTwinKind`; a twin row that
  names no twin is refused by the log. Three of the automation ladder's
  thirty-four unprompted acts are now not plain rules: proactive matching
  and the twin's two recorded acts, named as such on the governance page
  and in the security posture.

**It is called Ask Etyme, it lives in Conversations, and it looks like a
chat. Decided by the founder, 2026-10-12**, on seeing the first build:
*"First I thought you will call it 'Ask Etyme'. Second it would live in
Conversations. Third, expected it to look like Claude or ChatGPT. You
are making it look very clumsy."* So: the person's door to the twin is
a conversation pinned at the top of the Conversations list and first in
the sidebar above Today, one click from any page, never a popup and
never a floating bubble. It is a thread, newest at the bottom, the
composer fixed at the bottom, suggested questions as chips, and nothing
else on the screen; a reply carries its table and its links inside the
message; an act the twin needs a yes for is a card inside the reply with
Yes and Not now, going through the one approval route. The Program twin
page keeps the ledger and the editors; the chat is the front door. On a
phone it is one screen at a time with a back arrow and a close in the
header. The lesson, so it is not repeated: a chat built as a widget
inside a dashboard page by the people building the dashboard reads as a
form. The prototype-before-code rule from the home page applies to a
product screen the founder will look at, not only to public pages.

**Ask Etyme is the app. Decided by the founder, 2026-10-12** (*"absolutely
build the Etyme app just like Elon Musk"*, on the seven moves below).
- **The chat is the first screen.** After sign-in a desk lands in Ask
  Etyme, and the greeting is its dashboard: what needs it, what waits on
  another desk and which, who is near the time limit. Lists and tables
  stay one click behind for the person who wants to search and sort.
- **It does things, inside the rules.** Every act a desk can take in the
  product is offered as a card in the chat, Yes and Not now, and goes
  through the one approval route under the role contract's three tiers.
  An act on the NEVER floor (extend, end, award, payroll, sign) is
  refused in a sentence that says who may do it; the chat never grows a
  second door. A new act in the chat is a new act kind in the role
  contract first, with its tier, before any card is drawn.
- **Teams first**, because that is where a manager's day is. The bot
  route and the cards are built; the keys and the sideload are the
  founder's.
- **One number: acts per day in the chat** (web and Teams), counted from
  the ledger's surface, shown on the twin's page, expected to climb
  weekly. If it does not, the answers or the questions are wrong.
- **Cut what the chat makes redundant.** The Program twin page keeps the
  ledger and the two editors; its four stats and its "waiting for you"
  list are the greeting now. Needs attention and the greeting are one
  list; one of them goes.
- **The boundary is a feature.** Nothing leaves the tenant unless the
  client turns the model on; every read logged; every act ledgered. Said
  on the first screen.
- **Held back, on purpose:** free text to the model stays off until the
  client turns it on, and sends only what the rules did not answer.
  Rules first; the buyer is an IT person.

**The model boundary, and the four weeks. Decided by the founder,
2026-10-13** (*"run it"*, on the plan below). The boundary stands on
Etyme's own reason: the record holds several companies' people and money
at once, so a client turning a model on must never expose a supplier's
rates or a worker's pay.
- **Per company, off by default.** A company switch, set by its settings
  desk, recorded with who and when. Until it exists the first screen says
  "turned on for this deployment", which is the truth today.
- **Masked before it leaves.** Names, rates and pay become tokens before
  anything is sent; only what the rules did not answer is sent; put back
  on the way out. The model never sees a real name.
- **Nothing retained by the provider**, under its business terms.
- **Every prompt and answer logged on the record** beside the access
  log, readable by the company. "What left" is a query.
- **Suggestions only.** The model never reaches the approval route.
- **No model feature ever reads across tenants.** Variance is across a
  client's own suppliers; standing, never price, is what crosses firms;
  the only cross-firm data is consented. No benchmark of a supplier's
  rates across clients, ever. Enforced where data is fetched, not in a
  prompt.

The four weeks, as the founder approved them: **week 1** the feed and
the voice (answers read the ledger live and say "checked just now"; a
one-page voice guide — recommendation first, fact second, why on tap,
one sentence per refusal with the door, no apology words, dry and never
funny about money or people; fifty real questions with their right
answers, run as a test every day); **week 2** the boundary as code (the
switch, masking at the edge, zero retention, the prompt log, no
cross-tenant read); **week 3** acts and memory (every act a card, each a
new act kind in the role contract first; a correction becomes a rule the
person can read and keeps on their yes; after ten yeses on one card the
twin asks to do that one alone, ledgered, reversible); **week 4** Teams
and the number (keys and sideload; acts per day reviewed every morning).
One release a day to the preview, the fifty-question score beside it,
never a red score shipped. The fifty questions are the one new test file
the testing budget admits for this, approved with the plan.

**Nine decisions made on the founder's instruction, 2026-10-13**
(*"Think like Elon Musk and make decisions"*). Each is the coordinator's
call, reversible by the founder in one sentence.
1. **The home page's security band says what is done**, four plain cards;
   "what is not done yet, and the order it will be done in" is one link
   to the security page. The security page's "not done" list is reworded
   as "next, in order": penetration test, then SOC 2 Type I, then Type
   II, no date because none is contracted. The rate-limiting and
   firewall line leaves every public page; it stays in the internal
   posture document. Honest, and not a warning label.
2. **The four party doors are built** from their drawings: suppliers and
   bench firms, program offices, integrators, contractors. Reached by
   link or advertising, sign-up first, not on the home page's menu.
3. **The 0.5% tolerance decides what the twin raises, not what is paid.**
   Payment stays strict: a bill is paid only on accepted hours at the
   contract rate. A client who wants a tolerance on payment asks, and it
   is a setting with the reason beside it.
4. **The program manager may edit the role contract and the rule set.**
   The twin acts on that desk's authority, so that desk sets its limits;
   `governance.write` opens the editors beside `settings.manage`, every
   edit a version in the ledger.
5. **A supplier's Dashboard link keeps opening its own Today tables.**
   One click behind Ask Etyme, as the rule says.
6. **The model is small and rented**, masked at the edge, zero retention,
   every prompt logged, off per company by default (option 1). An owned
   model inside Etyme's environment is the switch for the first client
   whose security review asks where the text goes; it is a second
   runtime and waits for that client.
7. **Week 3 is next after week 2 lands**: the two drawn acts become act
   kinds first ("route a question to the right desk", acts alone; "send
   a receipt back to the supplier for correction", needs approval, an
   outside message), then cards; a correction becomes a rule; ten yeses
   bring the promotion ask.
8. **Ask Etyme ships to production on the next green pass and a "ships"
   verdict from the walk**, the same way the last wave did. The reseed
   and the twin run on production still need the founder's secret.
9. **No more drawings until the drawn ones are built.** The coaching
   drawing waits for week 3's build; the voice is written, not drawn.

**Five more decisions, on the founder's "deploy when ready and many
decisions like Elon Musk", 2026-10-13.** Each reversible in a sentence.
10. **Green is ready.** A wave ships to production on a green release
    pass (type check, unit, integration, build) and the walk reads
    production afterwards, not a preview before. This replaces the
    second half of decision 8: a walk on a tree that is still moving
    proves nothing, and from the 14th the founder's own day on the
    record is the walk that counts.
11. **The email key is the fix; the bootstrap is the fallback.** The
    founder puts the email key into Vercel; from then on seats come in
    through the ordinary sign-up and invitation doors. The staff
    bootstrap exists for the first morning only and is never extended.
12. **Commits are stamped when made, never re-stamped in a loop.** The
    re-stamping rebase stalled for an hour and cost a half-shipped
    preview. A step that fails silently is removed, not retried.
13. **The production address is `etyme2040.vercel.app` until the
    founder points `etyme.com` at it.** Every page and command says the
    address that works today; no document names an address that does
    not resolve.
14. **Week 3 starts after Etyme's first day on Etyme.** Every gap that
    day hits goes ahead of the planned work; the roadmap is what the
    tenant could not do.

**Four models, one platform: the founder's shorthand, 2026-10-13.**
*"Model X is enterprise, S is GSI and MSP, Model Y is supplier and
Model 3 candidate."* Internal only, never on a page or screen. X is the
enterprise client (Workforce and Governance, low volume, pays per year
and funds the rest); S is the integrator and the program office
(Deliver, Supply, Demand, the seat, the internal bench); Y is the
supplier and bench firm (Sell, Procure, Operate, Grow; free while
testing, comes because its client is there); 3 is the candidate (You;
never pays; the volume and the brand, so the one that must feel
finished). The rule the analogy carries: one platform, four bodies. The
record, the approval route, the decision card and the ledger are never
forked per party; the menu table, the eyebrows and the party page are
the body. A feature that only works for one model is a body panel.

**One Ask Etyme conversation per person, saved, and it never leaves the
tenant or the transaction. Decided by the founder, 2026-10-18** (*"go
with your recommendation … ensure no conversation goes beyond
environment and transaction"*). Until this day the conversation lived
only on the screen and was gone on a reload.
- **One conversation, kept.** Each seat has one Ask Etyme thread, saved
  on the record, so it survives a reload, a phone switch and a sign-out.
  A **Clear** button starts over; there is no list of old chats, because
  the greeting is "what needs you" and several threads would split one
  queue. A card already answered stays answered in the history.
- **It never goes beyond the environment.** The saved thread belongs to
  the seat and its company: nobody at another company reads it, and
  nobody at the same company reads another person's thread. It is kept
  where the record is kept and leaves only through the model boundary
  already decided (off by default, masked, nothing retained, logged).
- **It never goes beyond the transaction.** Ask Etyme answers about this
  company's own work on the record — its jobs, candidates, timesheets,
  bills, invoice receipts, payroll, papers and people — and refuses
  anything else in one sentence that says what it can help with. A
  question about another company's book, or a general question with no
  record behind it, is refused, never answered from the model's own
  knowledge.

**Notifications are deleted; Ask Etyme carries the number. Decided by
the founder, 2026-10-13** (*"kill notification and place Ask Etyme icon
instead of it, and show a number (like 5) which symbolizes 5 decisions
or responses expected. Ask Etyme (primary) and dashboard (switch to)."*).
The first deletion of the part count. So:
- **The Notifications page and its menu entry go.** The Ask Etyme mark
  sits where the bell was, in the header and first in the sidebar, with
  one number on it: the decisions and answers this seat owes right now.
  The number is the greeting's own count of what needs you, read from
  the one decisions queue, so the badge and the first line of the chat
  can never disagree. A seat that owes nothing shows no number.
- **What a notice used to say becomes a line in the greeting**, under
  "Since you last looked", read from the same rows the page listed, and
  it is gone from the greeting once read. Email and Teams keep carrying
  the decision card; the in-app bell is the part that is deleted.
- **Ask Etyme is primary; the dashboard is "switch to".** The chat
  header carries one link, "Switch to dashboard", which opens the desk's
  own Today tables; every dashboard page carries the mark with the
  number, one click back. The two are one app read two ways, never two
  menus.
- Built straight from the founder's sentence, no drawing first, because
  the sentence is the drawing: an icon, a number, a link.
- **One icon flips between the two screens. Decided by the founder the
  same evening**, replacing the merge an hour earlier (*"Why can't you
  use chat icon and dashboard icon to flip"*). The logo is the logo and
  carries nothing. One control on the right of the header flips: on the
  dashboard it is a chat icon with the number, opening Ask Etyme; on
  Ask Etyme it is a dashboard icon, opening the desk's own Today
  tables. The "Switch to dashboard" link and the number on the logo are
  both gone. The sidebar's pinned Ask Etyme entry keeps its number.
- **A prototype draws the real mark from the logo component**, never
  a redrawn one; the founder caught a misdrawn mark twice.
- **No words in the phone header. Decided by the founder the same
  night** (*"This is still clutter"*, on a drawing that kept the company
  name, the role, the pills and the demo line). On Ask Etyme the header
  is the logo and the flip, nothing else, and no pill row. On every
  other page it is the logo, the flip with the number and the menu.
  The company, the role, the demo chip, search, plus and the initials
  leave the header: the menu says who you are, the screen says where
  you are, search and add live inside each list, the demo says so once
  in the greeting and at the top of the drawer. Built without waiting
  for "build it", on the founder's "what would Elon Musk do": a drawing
  he has corrected twice is approved. **Next deletion, after Etyme's
  first day on Etyme:** the phone menu shrinks to the nine links of the
  part-count plan; the chat is the navigation.

**Etyme runs on Etyme from 2026-10-14, as a vendor company. Decided by
the founder, 2026-10-13** (*"Let's run Etyme for Etyme starting tomorrow
as vendor company"*), with five seats on etyme.com: sharath (Owner),
support (Admin), hradmin (HR), oliver (Account Manager), timesheets (AP
and Payroll); the desks are the coordinator's assignment and the owner
changes them. Said once so it is a choice: the neutrality rule is that
the record never supplies people; this tenant is the founder's training
and placement business running on the record as a supplier like any
other, and the platform is not a party to its deals. If it is ever read
as the platform supplying people, the fix is the tenant's name and
domain, not the record. Because production has no email key, the first
seats are made by a staff bootstrap route behind the cron secret that
returns one-time sign-in links; after that, seats come in through
invitations like any firm's. Every gap this tenant hits is the roadmap.

**The hours tolerance is 0.5%, not 2%. Decided by the founder,
2026-10-12** (*"Not % but .5% is better"*), after the first walk. So the
default rule set raises an invoice receipt whose billed hours differ from
the accepted hours by more than half a percent; at or under the line is
clean. A company may still set its own figure on the rules page, recorded
with who and why. The seeded Northbend desk is unchanged by it: 40
against 40 is clean and 41.5 against 40 is 3.75% over.

**Open for the founder:** whether the 0.5% hours tolerance should also
clear payment (money kept payment strict, per "bill only accepted
hours"); whether the program manager's desk may edit the role contract
(the editors ask for `settings.manage`, so the account owner does it in
the demo); and the Teams keys and app sideload, after which `/ready`'s
"Teams bot" row moves from MISSING.

**Bench first, the MSP grows with time, and the two are kept apart.
Decided by the founder, 2026-10-15** (*"My strength is building
bench"*; on the advice to shelve the MSP business: *"We just need to
put time and it will happen"*). The MSP offer stays on the site as it
is. The founder's bench business runs on Etyme as a supplier like any
other, under **its own name and its own address, never `etyme`** — a
tenant called Etyme placing people reads as the platform supplying
them, and the published Terms say Etyme places nobody. It gets no
access any other supplier lacks, and where Etyme runs a client's
program it competes like any other supplier, with no first look at a
job. Nothing is built that favors it.
**Its name is Tapin, at `tapin.etyme.com`** (founder, the same day,
after rejecting names that did not "rhyme well" or look modern: "Tap
In" is a player tapped in off the bench). The five seats of "Etyme runs
on Etyme" sit at Tapin. Until Tapin has its own email domain its seats
may use @etyme.com addresses, but etyme.com is never verified as
Tapin's domain: the platform's own domain is never a supplier's.
**Etyme runs on Etyme from the weekend of 2026-10-17** (founder,
2026-10-16: "Etyme for Etyme is a reality from this weekend"), as Tapin.
The 2026-10-14 start above slipped while the sign-up email was refused:
etyme.com had no Resend records, so the confirmation is sent from
`notify.etyme.com` once that domain is verified in Resend.
