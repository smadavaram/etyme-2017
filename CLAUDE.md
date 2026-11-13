# CLAUDE.md

Context for any agent working on this repository. Read this before touching code.

---

## What this is

Etyme — an AI-native platform for contingent staffing. It sits between staffing
vendors, their consultants, and the enterprises who hire them.

**Thesis (BRD line 49):** automate commodity workflows so recruiters become human
capital developers — mentoring, coaching, upgrading consultants for AI-era roles.
Sourcing tooling commoditised recruiters into resume-forwarders; this reverses that.

**The founder is not a coder.** He cannot review your code. He can read test names,
click a preview URL, and tell you whether the behaviour is right. Design your work
so those three things are sufficient. See "How work is verified" below — it is not
optional.

---

## How this file is kept — decided 2026-11-13

This file holds the rules that stand today, and nothing else. It had grown
to 84,000 words. Every agent reads all of it before it starts, so its
length was the largest cost of every piece of work (founder, 2026-11-13:
"we are timing out quickly, is there a clean up we can do").

- **The full record of every decision is in `docs/decisions/`**, word for
  word: the founder's own sentences, the reasons, what was built, every
  release check, every walk and every deploy. `docs/decisions/README.md`
  lists the files by number and title.
- **Each rule below ends with the numbers of the files that hold its full
  text** ("→ 12, 35"). Read the files for your area before you change
  anything they decide. Where a rule here and its record disagree, the
  newest dated text in the record wins, and this file is corrected in the
  same commit.
- **A code comment or a test that cites a section of CLAUDE.md by its
  title** finds that section in `docs/decisions/` under the same title.
- **A new decision** is written here as one to four lines under its
  theme, and in full as a new file in `docs/decisions/`. What shipped,
  release-check numbers, walk verdicts and lessons go in the record, never
  here. A test holds this file under 15,000 words.

---

## Two words nobody uses — decided by the founder, 2026-10-14

*"Never use desk and program office — nobody uses those in the real
world."* He had said it before and it was not held; this is where it is
held. On every page, screen, email, card, Ask Etyme reply, document and
every reply to the founder:
- **"Program office" is never said.** The firm that runs a client's
  program is an **MSP**. The client's own person is their job title,
  the **program manager**. The door for MSPs reads "MSPs".
- **"Desk" is never said.** Say the person's role: the AP clerk, HR,
  Procurement, the hiring manager, the account manager. Where no role
  fits, "team". "Each desk sees its own work" is "Each role sees its own
  work".
- Machine names do not move (routes, keys, enum values, file names),
  by the same rule as `world-nike`. A test fails on either word in text
  a person reads.

The older records in `docs/decisions/` use both words throughout, written
before the rule; read them as the replacements above. New text follows
the rule.

**And the sentence around them is the trade's too** (founder, the same
day, on "Who came in for the Java developer?": *"Who uses this
sentence? In the HR world it's who applied, or who matches my job, or
who is available."*). Ask Etyme, every card, every page and every
email says what a recruiter, a hiring manager or an AP clerk says out
loud: who applied, candidates, who matches this job, who is available,
approved suppliers, send the job, schedule an interview, approve a
timesheet, pay an invoice, months here, on hold. Never a phrase that
only reads well to the people who built it. The test is the same as
for a screen: would somebody who has done this job for ten years say
this sentence?

---

## What Etyme is — say this, not something else

Full text → 03, 36, 37, 59.

- **Etyme is the system of record for contingent workers: the layer
  between a company and every staffing supplier it uses.** The span is job
  request → suppliers → submissions → screening → interviews → onboarding
  → timesheets → invoices → compliance. Naming one station makes the
  product read as that station.
- **The category is "Enterprise contingent workforce management"** and
  nothing else. "Vendor management system" is banned on public pages. The
  bare acronym VMS stays in two uses only: the founder's label for the
  choice ("Etyme as VMS software" beside "Etyme as MSP provider"), and the
  buyer's own systems.
- **The client is the customer and the reader.** Write to the client and
  let suppliers read over the shoulder. Never four audiences on one page.
- **The hook is the not-knowing**: what do my contractors cost, how many
  are there, who has been here longest. Compliance is the justification,
  not the motivation. **Tenure is the moat, never the wedge**: keep the
  tenure ledger correct and do not lead with it. What the wedge is, is not
  decided. A buyer says it; no agent derives it.
- **Never lead with AI.** Ask Etyme is met in use, never sold.
- **Never name an enterprise incumbent, or any real company, anywhere**:
  page, document, screen, test name, code comment, commit message, reply
  to the founder. A rule stands on its own reason. The one exception is an
  integration target a customer picks by name, as a label on a setting.
  `lib/positioning` guards the pages.
- **No company-size range on any public page.** No superlative, no
  promised speed or result, no certification, uptime or customer count
  Etyme cannot show. No invented customer, logo or figure; sample data is
  labeled as the demo's. The reader is a technical IT buyer and the goal
  is trust: every public sentence is something the reader can check on
  the site, or a plain description of what the product does.
- **Neutrality is absolute.** Etyme never runs a bench, never places
  anybody, is never a prime vendor, never holds the contract for a
  person, never bills for one and never pays one. It may be a
  vendor-neutral MSP, offered once and quietly as a second way to use the
  record. Nothing on any page reads as aimed at a supplier.
- **Horizontal, never vertical.** Nothing in the core assumes IT staffing.
- **Plain English for a global reader.** A short heading, then cards,
  steps, lists and tables. Sentences of about fifteen words, never past
  twenty-five. Common words, no idioms. Cut words, never facts. Public
  pages and product screens say the same words: job, job request, bill,
  invoice receipt, time limit. A trade term is glossed on first use.
- **The four steps are Job · Submissions · Timesheets · Invoices**, on the
  chips, the product pages, the documentation spine and the flow charts.
- **The picture is people doing their day**: a named person and the step
  in front of them. Never a planet, a network graph, particles or a
  metaphor for scale.
- **Cash flow and document flow are the trust layers.** The money moves
  exactly as the signed week says, and nobody starts without the paper
  that lets them. They get the hardest tests and the first seat at every
  release. Public pages lead with those two.
- **The home page** (founder's brief, 2026-11-12). One call: Start free,
  in the header, the hero and the end, opening sign-up. "See it work"
  scrolls to the demo. The hero keeps the question "Know what every
  contractor costs, across every supplier." and his locked line. The Ask
  Etyme demo is drawn from the seed and labeled "Demo — not a customer";
  its Send sends nothing. The CFO view (Corvane Packaging) is closed
  behind a button. The price lines are his words and no agent adds a
  number. The complement line reads "Sits alongside your HR and finance
  systems. No rip-and-replace." until he says "name them". Never on the
  page: a size range, "design partner", or a hint that Etyme pays
  invoices on its own.
- **Every other public page**: one headline, the compact panel playing
  the four steps with that party's own named person, at most three lines,
  the sign-up band, one security line, and the one-row footer (Clients ·
  MSPs · Integrators · Suppliers · Workers · Demo · Documentation · About
  · Security · Privacy · Terms · DPA · Contact). Four doors: MSPs,
  Integrators, Suppliers (Prime, Sub-vendor, Bench tabs), Workers (Worker,
  Solopreneur tabs). No price on a door. Every public page fits one
  screen and a test caps its words; the legal pages show their whole
  text. Every name and figure on a panel is read against the seed by a
  test.
- **A page the founder will look at is prototyped before it is built**,
  as the live page's own words with the change applied, and photographed
  at phone width before it is called built. A fix that changes a drawn
  page's shape goes back through the drawing.
- **Security is said honestly**: what is done, what is not, what comes
  next (penetration test, then SOC 2 Type I, then Type II; no date). An
  enterprise buyer asks for the attestation before signing, so it is
  Phase 1 work.

---

## Every idea is tested against the founder's framework — decided 2026-09-29

The founder asked that every idea he brings be tested against one
framework, and the test shown before any building starts. Five questions,
each answered in a line with a grade (strong · partial · missing):

1. **The core problem.** What real, often-overlooked pain does it solve,
   in a "boring" sector, for whom? A problem only a builder enjoys is
   not one (see "Tenure is the moat, not the wedge").
2. **The four pillars.** Which does it touch, and how:
   - **Real economy** — physical work or essential products;
   - **Micro-distribution** — how work, people or goods reach the end
     buyer;
   - **Credit / lending** — understanding and managing financial risk;
   - **Cost arbitrage** — efficiencies across markets (for Etyme, always
     in the client's favor, never a margin Etyme takes).
3. **The stepping stone.** If it is not the final goal, what bridge does
   it build toward it, and what is the next step after it?
4. **Operational metrics.** Can it make money on every transaction? How
   does it build trust with suppliers, customers and lenders? Does it
   help attract and keep people through a clear, shared vision?
5. **Keep it simple.** Can the idea and its values be said in a few
   plain words?

The answer is a short table, then a verdict: build now, build later as a
stepping stone, or do not build — with the one reason that decides it.
An idea that scores well on everything but point 4 while no client is
paying is sequenced after the first paying client, per the sequencing
rule below.

---

## Source of truth, in order

1. `/spec/Etyme_Master_BRD_v3_7_FINAL.docx` — 34 sections. **FROZEN BASELINE.**
   Amendments require a change log, never a rewrite.
2. `/spec/Etyme_BRD_Addendum_D.docx` — work authorisation transition, consultant
   retention, rate transparency. Ratified.
3. `/spec/Etyme_BRD_Addendum_E.docx` — client workforce governance, co-employment
   and tenure, approval chains. Ratified.
4. `/spec/Etyme_User_System_Stories.docx` — 22 modules, paired user and system stories.
5. `prisma/schema.prisma` — the data model. Consolidates 134 legacy models into ~28.
6. `BUILD.md` — API surface, workflows, background jobs, permissions.

If code and spec disagree, the spec wins — unless the spec is wrong, in which case
stop and say so rather than quietly diverging.

---

## Stack (decided, BRD §26.3)

Next.js 14 App Router · TypeScript · Prisma · Postgres with pgvector · NextAuth ·
Vercel · Claude API for parsing and matching.

One language, one repository, one deploy target. Do not introduce a second runtime,
a second ORM, or a microservice without asking.

---

## User populations and channels

Two distinct populations, two auth paths, two notification channels.

| Population | Sign-in | Domain | Notifications |
|---|---|---|---|
| **Business users** (vendors, clients, MSPs, GSIs) | Microsoft (Azure AD / Entra), Google Workspace | Verified from OAuth tenant — corporate domain | **Microsoft Teams** webhook per company channel; email fallback |
| **Candidates** (consultants as individuals) | Google (Gmail), Email magic link, Yahoo | Consumer email — no company domain | **Email only** (transactional via SendGrid / Resend) |

**Domain detection rule:** if the OAuth domain is `gmail.com`, `yahoo.com`,
`outlook.com`, `hotmail.com`, or any known consumer provider → candidate, not
company admin. The OAuth tenant is the authority — replaces the 2017
`EXCLUDED_DOMAINS` check.

**LinkedIn** is a sign-in door for candidates only, since 2026-11-12 (see "The
sign-in page leads with the account buttons"). The button says "Candidates
only". A seat at a company never signs in with it. The profile URL stays a
field. No other LinkedIn data is used.

---

## Ratified decisions — these are constraints, not preferences

**From Addendum D**
- Rate visibility is a **per-requirement** vendor setting. Not a company-wide switch,
  not a platform mandate. Setting lives on `Requirement`, inherited by `Assignment`.
- Two margins are distinguished: arbitrage (opacity-based) and expertise (capability-based).
  `Requirement.margin_class` carries this. Do not build features that assume all margin
  is extractive.
- Where markup is undisclosed, trust is carried by rate progression, bench pay honoured,
  median tenure — never by displaying an absence of disclosure.

**From Addendum E**
- **Tenure accrues to the person at the client**, aggregated across all vendors and all
  assignments. Twelve months via one vendor plus twelve via another is twenty-four months
  of exposure. Per-assignment tenure tracking is wrong and is the industry's blind spot.
- Enforcement: **BLOCK** where legally grounded — tenure limit, break in service, work
  authorisation, lapsed supplier insurance, segregation-of-duties violation.
  **WARN, capture a reason, proceed** everywhere else — rate band, headcount plan,
  vendor tier. **Never silently permit.**
- Alumni re-engagement ("ask them back") must check the tenure ledger **before** the
  action is offered. Inside a break period, show the eligibility date instead of a button.
- Governance is table stakes for any client with more than one hiring manager. Never
  gate it behind a pricing tier.
- **A desk nobody has named falls back; it never refuses.** Decided 2026-09-13.
  Where a chain needs a department lead and no value rule names one — a client
  in its first week before anybody wrote a delegation of authority, or an
  approver who recommended the firm themselves and so cannot decide it — the
  program office stands in and the screen says "Program office" rather than
  "Department lead". Refusing instead would mean a client cannot onboard a
  supplier until governance is configured, which is the workaround trap above,
  and would stop a VP recommending anybody at all.
- Most requisitions must clear **without human approval**. Governance slower than the
  workaround produces the workaround.
- **A sub-vendor's name is the prime's to keep. Decided 2026-09-17.** In a
  chain — client buys from a prime, the prime buys from a sub — the NDA
  between prime and sub is what stops the sub learning who the end client
  is and going round the prime to reach them. The client sees the rung it
  pays and nothing below it, **unless the client's agreement with the prime
  requires disclosure**, in which case it sees the sub by name. That is a
  term on the `MasterAgreement` between client and prime, off by default,
  and it is the client's to demand at signing, never the platform's to
  grant. Rates were already closed at every rung (`lib/chain-top`); names
  now follow the same rule. What the client always sees, name or no name,
  is the **standing** of whoever employs the person on its site — insured
  or not, authorized or not — because that is the client's own exposure
  and no NDA changes it. The sub, for its part, knows the site it works
  at — it must, for tenure and compliance — and the platform carries no
  thread from a sub to a client it has no deal with (`lib/threads`), which
  is the other half of the same NDA.

---

## Invariants the database must enforce

Not the UI. The database.

- A `Submission` requires a live `BenchListing` granted by the consultant —
  **unless the submitting firm employs the person** (an EMPLOYEE `Context`),
  in which case the employment is the consent, the kind is `INTERNAL`, and
  the employee is told rather than asked. Decided 2026-09-17; see "Who
  sells and who buys".
- `Submission` is unique on `(requirementId, personId)` — first submission wins on duplicates.
- `SubmissionKind` is computed from ownership, never accepted from a client.
- Rate bands live on `RequirementInvitation`, never on `Requirement` where a recipient
  could read another vendor's rate.
- Every read of another person's data writes an `AccessLog` row, including refusals.
  **And a refusal's row is written before the refusal is sent. Decided
  2026-10-08.** Found by the sign-up walk: the row was written without
  waiting, and a serverless host may stop the function the moment the 403
  goes out, so the row could be lost — the invariant held in tests and
  not in production. Now a refused read goes through `recordRefusal` in
  `lib/access-log`, which waits for the write and never throws: if the
  write fails, staff are alerted and the refusal still stands. Successful
  bulk reads stay fire-and-forget on purpose.
  `__tests__/invariants/access-lifecycle-log.test.ts` names every route
  that still logs a refusal without waiting, and that list may only
  shrink.
- Anything the system does unprompted writes an `AutomationLog` row with a plain-English
  reason and an honest `reversible` flag.
- Match scores always carry `factors`, `basis`, `confidence` and `unknowns`.
  A bare number is a bug.

---

## How work is verified

The founder cannot read code. This is the compensating discipline.

1. **Every module ships with tests named as English sentences.**
   Good: `"a consultant cannot be submitted without an active bench listing"`
   Bad: `"test submission validation"`
   He reads the test names to confirm you built what he meant.

2. **Never merge on a red test.** No exceptions, no "will fix next commit".

3. **A Vercel preview URL per feature.** He clicks it. If he cannot click it,
   it is not done.

4. **One module at a time, sequentially.** Do not run parallel agents on
   overlapping files. He cannot adjudicate a merge conflict.

5. **When you are uncertain, stop and ask.** A wrong rate calculation that looks
   plausible is worse than a delay. Especially in: timesheet valuation, invoice
   generation, cycle date arithmetic, tenure math.

7. **Builders test their own files; one release pass tests everything.**
   Decided by the founder, 2026-10-06. A builder runs the unit and
   integration files that cover its module, by name, and never the full
   suite. The full suite runs once per wave, on a quiet tree, and its
   red list is routed to owners. See `docs/how-agents-work.md`.

8. **A screen is tested against the route it calls, and a form is
   tested by pressing Save. Decided by the founder, 2026-11-02**, on the
   I-9 dialog that could never be accepted (*"What's the right way to
   test so we can catch and fix bugs like the I-9 field?"*). Three
   layers, each catching what the one below cannot:
   - **The route's own tests** prove the rule: a refusal for every
     missing field, in a sentence. They cannot see a screen.
   - **A contract test between every screen and its route** proves the
     screen can satisfy the rule: for each field a route refuses
     without, the dialog that calls it offers that field, and a route
     that gains a required field fails the build until its screen gains
     the field in the same commit (`every question a route asks, its
     screen has a field for`). Cheap, in the unit suite, on every push.
   - **A browser test per form that presses Save on the seeded world**
     and proves the record three ways (the sentence, the record on
     reload, the row), for every form on the two trust flows (papers
     and money) before any deploy that touches them, and for every form
     of every party nightly. The simulation, which calls routes, can
     never replace it.
   And a bug found on a screen by a person becomes all three before it
   is called fixed: a browser case that fails first, the contract line
   that would have caught its class, and one line here.

6. **Ready is the edges, and `/ready` is the only measure of it.** Tests
   prove the inside. An edge with the outside world — a real tenant
   signing in, a real file imported, an email that left, a Teams channel
   that heard, a company that is not seed — is proven only when the
   outside world has done it once on that deployment (`lib/readiness`).
   Every edge has three states: missing, set up but never used, proven.
   Nothing is production ready while a required edge is not proven,
   however many tests are green. The matrix's BUILT means built.

---

## Who pays, and the order of work

Full text → 40, 11, 56.

- **The client is the customer.** Suppliers come because their client is
  there. Free while testing.
- **Phase 1 is one hire, walked from every role** (ten stations;
  `__integration__/client-programme.test.ts`). Phases 1 and 2 ship to
  paying customers before enterprise scale work. If you find yourself
  building Phase 3 while no client pays for Phase 1, stop. Two exceptions
  the founder made himself: the bench, and the security attestation.
- **The app is completed before anything new is built** (2026-11-12).
  The company portals, the training door and a company's own web address
  are drawn and wait. Complete means: every open item is built and
  proven, or named as waiting on the founder; the release check is green;
  the walk on screens says ships. The order is the two trust flows, then
  whatever stops a firm's real first week, then the rest.
- **Etyme may run a client's program as a vendor-neutral MSP**, in a seat
  the client grants, under the client's rules, every read logged.

## Parties, deals and the record

Full text → 44, 45, 38, 30, 39, 60, 27.

- **Positions on a deal.** A client only buys. A prime, integrator or MSP
  sells to the client and buys from a sub-vendor by order, or from its
  own W2 employee with no order. A sub-vendor or bench firm sells to the
  prime. Prime, sub-vendor and bench are positions on a deal, never a
  kind of firm, and nothing on a menu is hidden by a firm's posture.
- **A firm's own W2 is submitted without a bench listing** (kind
  INTERNAL): the employment is the consent, and the employee is told, not
  asked. Anybody the firm does not employ needs the listing and consent.
- **A sub-vendor's name is the prime's to keep.** The client sees the
  rung it pays, and the standing (insured, authorized) of whoever employs
  the person on its site. Rates are closed at every rung.
- **One tenant is one domain name.** A legal entity and a site are layers
  under the tenant. The entity layer is not built; a group is never
  modeled as two companies. One firm, one tenant: a firm already on Etyme
  is found, never founded again.
- **A site is where people work.** A job request names its site by id. A
  site names which approved suppliers may fill jobs there, and its hiring
  managers. The placement inherits the job's site. A site has a country
  and a time zone. A local holiday is a kind of day on the week, and the
  client's signature on the week is the agreement.
- **The bench is built now.** An integrator's bench is its own people
  rolling off: flagged, reserved, the releasing manager confirms the
  date, the receiving manager places; HR is told of every step and the
  person is told, not asked. A bench supplier's people are on its bench
  by their own consent, for as long as each chooses. The words are "Our
  bench", "Partner bench" and "What we need". A client never browses a
  bench: matching brings bench to a job request, existing suppliers
  first. A match from a firm that is not a supplier shows the firm,
  skills, availability and reasons, never a name or a rate, and its one
  act is "ask to add this firm". A bench is shared only between firms
  that already trade, one rung at a time.
- **A company can be recorded without classifying it** (2026-11-12).
  Kind and position are two facts. A position (Customer above us,
  Supplier below us) lives on the register row, is given by Extend and
  never by the Kind, and one company can hold both. A company with no
  position reads "Not classified": it is on the Companies list and in
  Contacts' "Works at", and in no supplier or client list, count, picker
  or workflow. "Saving a company never emails them." One reader decides
  every gate and the badge (`standingWith`, `lacksPosition`).
- **A firm on Etyme is never tied to you from your side alone.** Two
  firms on Etyme link by one ask and one yes. No door writes an
  agreement, a register row or an order on a firm that did not take part,
  and no reply tells you about a firm you do not work with.

## Money

Full text → 46, 47, 48, 41, 19, 55, 16, 20.

- **Bill, invoice receipt, payroll.** What a firm issues upward is a
  bill. What it receives from below is an invoice receipt. Its own
  employee is paid by payroll. The party who issues a document names it.
  The receipt in the three-way check is the signed timesheet (or the
  approved expense, or the accepted milestone): order ↔ receipt ↔
  supplier's invoice.
- **One document, a header and its lines.** `WorkOrder` is the header:
  counterparty, ceiling, dates, terms. `SellContract` and `BuyContract`
  are the lines: a person and a rate. The sell line bills the customer;
  the buy line pays a supplier or runs payroll. A W2 line has no order.
  An order is called purchase order, sales order or work order by which
  end reads it (`lib/order-naming`). The master contract is the optional
  profitability roll-up (`ProjectOrder`). The MSA is optional.
- **Terms follow the agreement between each pair.** Rhythm and net days
  are read through one door, agreement first (`termsFor` in
  `lib/money/order-terms`); an order or a line differs only with a
  recorded reason. Start and end dates stay the line's.
- **One week, filed once by the worker, signed at the top, accepted down
  rung by rung.** Only the worker files hours. Nobody signs their own. A
  client may approve by an emailed link, or by attached evidence with a
  named approver. A firm bills only the hours the firm above accepted,
  and bills upward on the client's signature. An invoice receipt holding
  a week its payer has not accepted is blocked. On a cut week a bill
  loses overtime first; a worker's pay, by default, carries overtime
  only on accepted hours above the line.
- **The week runs Sunday to Saturday.** Days off, the hours-due day and
  the approve-by day are company settings (default: Saturday and Sunday
  off, due Monday, approved Wednesday, at most one extra week). Weekend
  hours can be filed and are never flagged for being on a weekend.
- **Payroll is run by pay period, and the period is the company's
  choice** (default every other week). Pay never goes out before it is
  worked out. Every hour is paid at the rate in force on the day worked.
- **Months served are whole months, never rounded up.** A contract's
  last day is a day on site; a break starts the day after it. Tenure is
  the person's at the client, across every supplier, a day counted once.
- **Payment stays strict.** An invoice receipt is paid only through the
  one gate (`mayPayInvoiceReceipt`), on accepted hours at the contract
  rate, with the supplier's bank details checked. The AP clerk checks
  the bank where no Finance seat exists. The 0.5% hours tolerance decides
  what is raised, not what is paid. A paid date that has not happened is
  refused.
- **Etyme never moves money.** A payment run is a list. It leaves as a
  file for the client's own system; the confirmation marks receipts
  paid; the supplier is told the day it is paid.
- **Commission is a row on the line it is earned on**: sales on the sell
  line, recruiting on the buy line, accrued from accepted weeks, paid
  through Payroll → Commissions.
- **One definition of money on every screen** (`lib/money/order-ledger`,
  `lib/money/signed-unbilled`). Every amount reads its own currency
  through one formatter. Two currencies are compared only at the
  company's own rate, and the rate is said.
- **Cycle dates.** `lib/cycle-generator` is the reference; nothing
  remains to port from 2017. Pay and bill dates move to the nearest
  working day (a Saturday back, a Sunday forward), as a company setting.
  The open items are listed in the record (41). Money arithmetic is
  asked about, never guessed: timesheet valuation, invoice generation,
  cycle dates, tenure math.
- **Reports is cash flow, with a 90-day forecast, and profitability.** A
  client's Reports shows what it owes its suppliers and never a margin.

## Papers

Full text → 49, 31, 33, 20.

- **Nobody starts without the paper that lets them.** A missing I-9 or
  right to work, lapsed insurance and lapsed good standing BLOCK. The
  rest WARN, capture a reason and proceed. Work authorization cannot be
  waived.
- **A document type declares its shape**: validity, signatures, edition,
  what it needs behind it. Its purpose (compliance, agreement, proof)
  decides how it behaves. A company adds types without a release.
- **A requirement lives on the line, on the side it protects**
  (`DocumentRequirement`, one door in `lib/document-requirements`). The
  default set is a floor. Evidence stays the person's or the firm's.
- **A verdict a third party renders is never rendered by Etyme**, or by
  any seat in Etyme: a background check, a drug screen, an education
  verification. Collect the consent, pass the package, record the
  verdict word for word with the provider's name, reference and date.
  The employer keeps the process around it.
- **Screening before an offer asks only what is lawful.** The ID, the
  I-9 and the background check come at the award.
- **Work authorization is checked where the work is done.** A job
  refuses a person over status only with a recorded lawful basis.
- **A degree is read with its fields, warns and never blocks**, and stays
  on the person's own record for good.
- **Nothing is "On file" without the file or the verdict.** One reader
  says what is on file (`lib/document-stages/paper-record`).
- **Etyme never reads a mailbox.** Forwarded-email intake stays closed
  (`EMAIL_INTAKE_LIVE` unset) until the founder's attack walk and his
  yes. Directory reads stay off (`ETYME_DIRECTORY_LIVE` unset) until his
  yes on the privacy line.

## Ask Etyme and the twin

Full text → 12, 24, 35, 14.

- **It is called Ask Etyme, it is a chat, and it is the first screen
  after sign-in.** Conversations are kept and listed per seat. An answer
  that is a list or a figure is shown as data beside the chat, from the
  page's own reader.
- **Governance is the product.** A role contract per company: ACTS
  ALONE, NEEDS APPROVAL, NEVER TOUCHES. Rules first, the model second;
  the twin never improvises policy. No twin act without a `TwinAction`
  ledger entry. A new act is an act kind in the role contract first.
- **One approval route** for the web, Teams and the chat
  (`POST /api/twin/approvals/[id]`). Every decision in the count is a
  card with Yes and Not now. One list is read by both doors, so the
  mark, the greeting and Today agree. A figure the dashboard computes is
  never computed a second way.
- **The twin cannot ask the person whose authority it acts on.** A
  receipt that fails the check is never put up for a yes.
- **The model boundary.** Per company, off by default. Masked before it
  leaves. Nothing retained. Every prompt and answer logged. Suggestions
  only. No model feature reads across tenants. Another company's book is
  refused by rule, before the model. A conversation never leaves the
  tenant or the transaction.
- **The voice.** Recommendation first. Names, not counts. One sentence
  per refusal, with the door. No apology words. The trade's phrasing:
  who applied, approve a timesheet, pay an invoice, on hold.
- **The Notifications page is deleted.** The number on Ask Etyme is the
  decisions this seat owes.
- **Setup and settings are also a conversation** with the Owner or
  Admin. A settings change is a card, never a silent act. Bank details
  and the domain claim are never the twin's to touch.

## Navigation and the shell

Full text → 15, 16, 25, 26, 32. The table under "Navigation per company
type" below is what the code draws, and a test reads it.

- **One switch at the top of the left column: Ask Etyme | Dashboard.**
- **One person, two hats, one at a time**, switched in the account menu.
  The hat is a view, never a permission.
- **A menu link is drawn only where the role's permissions do that
  work.** A button is drawn only where its route will take it.
- **One word means one thing.** Submissions is who was put forward to a
  job. Candidates is the people a firm keeps. Contracts is the line from
  the award on. Network holds the lists a firm keeps.
- **Every first screen names a person and the step in front of them.**
  Machine talk leaves every first screen.

## Sign-in, identity, Owners and access

Full text → 13, 22, 23, 53, 54, 58, 18, 21.

- **The sign-in page.** Account buttons first (Google, Microsoft,
  LinkedIn marked "Candidates only", each drawn only where its key
  exists). Then "or use your email" with one box. The password box
  appears only after the email, and only for an account that has one.
  Sign-up is one line under the heading. One filled button on a screen.
  No button is greyed out without words. Etyme's own branding.
- **The page never says whether an address has an account.** The email
  is routing, never proof.
- **A consumer address is a candidate**, unless it was invited to a
  seat. Both account doors show the account chooser.
- **A company's sign-in policy is directory only, invitation only, or
  hybrid**, and hybrid is the Owner's choice. Directory only refuses
  every other door at the API, logged, with no break-glass. Identity is
  the directory's issuer and subject, never the email. A person turned
  off in the directory loses the seat on the next request. A seat
  invited on a public address does no money or signing acts.
  Governments are a configuration (OIDC, SAML), never a build per
  country.
- **The ladder.** Superadmin (Etyme's staff, `ETYME_STAFF_EMAILS`,
  support@etyme.com; platform tools only, never a company's data) above
  Owner above Admin. An Admin never acts on an Owner. The last Owner is
  never removed. Admin is IT and people, not money or contracts. Passing
  ownership is one act with the new Owner's yes. Recovery is by proof of
  the domain. The first person to sign a company up is an Admin, and
  Owner is earned by proof.
- **The Owner decides who sees what**: a grant by company, team or
  person (`PermissionGrant`), narrowed at the query. Never across a
  company, never past segregation of duties.
- **Team structure is one tree the Owner draws** (`OrgUnit`). A
  directory is read, never written.
- **A company renames only a person it alone knows.**
- **support@etyme.com is Etyme's own mailbox**, never a seat at a
  company.

## Onboarding and setup

Full text → 27, 29, 13.

- **Sign-up and "Your company" take a minute**, and the company works
  at once. After that the Owner or Admin reads one checklist. Every item
  is skippable, every answer is defaulted and says where it came from
  (the domain, a paper, an import, a person).
- **A skipped item refuses only the act that needs it**, in a sentence
  that names the step.
- **Fill from what the company already has.** Never a mailbox, never a
  registry Etyme has no agreement with, and nothing read from one
  company fills another's.
- **An MSP is seated from the client's Settings.** A W2 row imports as
  the firm's own employee, never a bench listing.

## Tapin

Full text → 28, 12, 22.

- **The founder's bench business runs on Etyme as a supplier like any
  other, named Tapin** (`tapin.etyme.com`), never `etyme`. It gets no
  access another supplier lacks. Tapin has no domain and gets none; it
  stays on invitation or hybrid sign-in, and the staff tool is its
  recovery. Its seats: sharath (Owner), hradmin (HR), oliver (Account
  Manager), timesheets (AP & Payroll), and three partners as Admins on
  the Gmail addresses they were invited on.
- **Tapin gets agents, not a website.** The generated company page at
  `/site/<slug>` is the website.

## How this project tests and ships

Full text → 33, 34, 17, 20, 52, 57, 41.

- **The simulation drives the real routes as real seats**
  (`npm run simulate`), never rows written into tables, and never on
  production.
- **Only a walk on screens proves a person can do the job.** Every wave
  that changes a trust flow ends with a walk in a browser, and its
  faults are recorded by class, "the screen cannot reach the rule"
  first.
- **Release.** Builders run their own files. One full release check
  (type check, unit, integration, build) runs alone, on a quiet copy
  that holds its own database client. A deploy is a replay to the deploy
  branch through gates: no Ruby, the brand kit present, no source
  difference, no schema line removed. Then smoke: health, every public
  page, `/site/tapin`, the inbound email door answering 404, and MX and
  SPF after any DNS change. Production is `etyme2040.vercel.app`.
- **"Deploy when green"** (founder, 2026-11-13). Green is: the
  reviewers' blockers fixed, the release check green, and the walk
  saying ships.
- **Never**: load or simulation on production; a secret, password or
  sign-in code in chat; the coordinator holding the cron secret; a
  one-time link or token shown, copied or logged.
- **Lessons, so they are not paid for twice.** A test that picks "the
  first row" is wrong by construction. A seeded world keeps the day it
  was born. `git add` of a shared file checks `git diff --cached` first.
  A schema change during a release check voids it. A browser page never
  imports a server-only file, and a test walks for it. A relayed claim
  is re-derived before it steers work. A DNS change is checked against
  the old zone, mail first; a domain with mailboxes and no MX is an
  outage, said first and alone.
- **The hardest things**: cycle generation; field-level permissions
  (every read path filters by context from the first commit);
  cross-vendor identity resolution (deterministic on consented
  identifiers, never silently merged).

## Design system

Full text → 43.

- **The brand kit (`brand-kit/`) decides color, type, corners, shadows,
  motion, icons and the logo.** The prototypes in `prototypes/` decide
  layout, screens and behavior.
- **Tokens.** canvas `#F0EEE6` · surface `#FBFAF7` · raised `#FFFFFF` ·
  sunk `#E7E4DA` · ink `#1F1E1D` · muted `#6B6862` · faint `#9C9891` ·
  rule `#E3DFD5` · action on a filled button `#5228FF` · action as text
  `#4421D6` · attention `#C0622E` · verified `#4F6F52` · danger
  `#B83A3A`. The vivid green `#00C800` is the logo and nothing else.
- **Type.** Serif headlines (Iowan Old Style, Palatino, Georgia). Inter
  for body and controls. IBM Plex Mono for data. Tabular figures in
  tables.
- **Two surfaces.** Decision surfaces: prose, three to ten items, calm.
  Working surfaces: dense tables, search, filters, bulk.
- **Every list offers a table and a feed** (`components/list-surface`),
  with the same filter questions on every list.
- **A chart's colors are computed, never chosen** (`lib/chart-colors`).

---

### Navigation per company type

**Since 2026-11-08 ("One app, two tabs"), the top of the left column is
one switch, Ask Etyme | Dashboard, with the seat's number on Ask Etyme.**
In Ask Etyme the column holds New conversation, search, Pinned and the
conversations; in Dashboard it holds the role's menu, below. A firm's
menu reads the founder's sketch: Today · Network (Candidates, Companies)
· Jobs · Submissions · HR (Contracts, Timesheets, Expenses) · Accounting
(Receivables, Payables, Payroll, Reports) · Settings ("Money is
Accounting", 2026-11-08: Receivables is the Bills page and Payables the
Invoice receipts page; the pages keep the trade's words, and only the
menu names the two ledgers). Reports is cash flow and profitability
(founder, 2026-11-08): Profitability is a page of the Reports link at
its own address, and Reports is offered only where the seat may open
Receivables' AR, Payables or Profitability. A client reads Accounting
with Payables and Reports since 2026-11-12, its Reports being what it
owes its suppliers, paid and due, and the forecast of it, never a
margin and never Profitability. A group
is a heading and never a link, and a link is drawn only where the role
may open one of its pages. Ask Etyme is not on the menu: the switch is
Ask Etyme. In the table, "Network: Candidates, Companies" is the heading
Network over two links.

The tabs behind each link have not moved (founder, 2026-10-19 for the
tabs; 2026-11-03 for the words; 2026-11-04 for Network, the Paperwork
tab and the order: see "Master data sits under Network", "Paperwork is
a tab of Contracts", "The process order, in the founder's words" and
"Network sits above Jobs"). A menu entry is a noun on the person's own
work; every other page is a tab inside one of them. Submissions is who
was put forward to a job, Contracts is the line from the award on, and
Network holds the two lists a firm keeps: Candidates, the people it
keeps, and the firms it trades with (Companies, or a client's
Suppliers).

| Party | The links | Folded inside them, as tabs |
|---|---|---|
| Client | Today · Network: Candidates, Suppliers · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Payables, Reports · Settings | Conversations → Ask Etyme. By region → Today. Contacts, Agreements, Supplier scorecards → Suppliers. Interviews → Submissions. Ending soon, Past contractors, Tenure, Duplicate check, Compliance, Document requests → Contracts. AP, Budget, POs → Payables. Users & permissions, Team structure, Owners, Sign-in, Program team, MSPs, Sites, Import records, Program twin, Org view, Data requests, Your data → Settings. |
| Supplier | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | Conversations → Ask Etyme. Rate history, Our scorecard → Today. Bench, Bench pay, Bench check-ins, Training → Candidates. Suppliers, Contacts → Companies. Leads, Shared with you → Jobs. Interviews → Submissions. Sell contracts, Buy contracts, POs, Paperwork, Missing paperwork, Document requests, Screening packs, Compliance, Check queue → Contracts. Rolloff → Timesheets. AR → Receivables. AP → Payables. Profitability → Reports. Commissions → Payroll. Users & permissions, Team structure, Owners, Sign-in, Setup, Sites, Integrations, Import records, Activity log, Data requests, Your data, DNR list → Settings. |
| Integrator | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | The supplier's, with no Leads: its jobs arrive from the client it already has. |
| MSP | Today · Network: Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Reports · Settings | The supplier's, with no Candidates under Network, no Payroll link and no Our scorecard: an MSP places nobody and pays nobody. AR → Receivables. AP → Payables. Profitability → Reports. Suppliers, Supplier scorecards, Contacts → Companies. |
| One-person firm | Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Your page, Who has you → Your work. Expenses → Timesheets. AR → Bills. POs → Contracts. Your paperwork, Compliance → Paperwork. Your data → Settings. |
| Worker | You: Your work, Your page, Who has you, Your data, Your paperwork | Unchanged: a list under "You", not nouns with tabs. |

Each link opens the first of its pages the reader may open, and on any
of them the shell draws the tab row under the page header, the noun's
own page first (`components/shell/section-pills`). Nothing behind the
menu is deleted: every page keeps its address, and search and the +
button still find it. Network, Contracts and Settings are the links whose
tab rows are grouped (Settings: People · Company · Records): each group's name, then its pages ("Candidates:
Bench · Bench pay · … | Companies: Suppliers · Contacts"; "Contracts:
Sell contracts · Buy contracts · POs | Paperwork: Missing paperwork ·
Document requests · …"), the group's name being the link to its own
register where one is named after it, so Bench, Contacts or Document
requests is one click from the link. Settings keeps Papers you require
(the setup checklist's item), the DNR list and the activity log.
The tab row's groups are not the menu's headings: the eyebrow over a
page still reads the noun it is a tab of (Network over Bench, Timesheets
over Expenses, Today over Profitability), because the tabs did not move. The money is three links in the founder's order:
Bills (what the firm issues upward, with AR, where payments in are
recorded), Invoice receipts (what it receives from below: AP, where
payments out are recorded; there is no separate payments page, so each
is the AR or AP page in its own words), and Payroll (its own employees,
with Commissions). Nothing on a menu is hidden by a firm's posture: a
bench vendor reads the supplier's whole menu. Sites stay under
Settings; the worker's "You" is the one list.
`__tests__/invariants/sidebar-nav.test.ts` reads this table — the links
and headings the Dashboard column prints (`menuFor` in lib/nav-table)
and every page named in the third column — and fails when the code and
it disagree, so a link renamed in one and not the other breaks the
build rather than the founder's walk.

**A one-person corporation reads its own short menu. Decided
2026-09-21.** A `CONSULTANT_CORP` had no row here and fell through to
Vendor, so an ICU travel nurse paid corp-to-corp through her own LLC was
handed a staffing agency's forty-nine links — Leads, Bench, Consultants,
Bench check-ins, Training, Rolloff, Payroll commissions, Profitability —
for a firm whose only consultant is herself. She is the person **and**
the firm, so she gets the firm's week (her contracts, the order behind
one, her hours, what she billed and what came back) and her own record,
because a solo corporation's owner is always somebody the work is about.
Since 2026-10-19 her own pages sit inside her seven links (Your work,
Paperwork, Settings) rather than in a "You" list appended after them.
Nothing about
a bench, a pipeline or a recruiter's commission: a screen offering to
add another consultant is a screen asking her about herself in the third
person.

**And her two hats are named apart on her one menu.** Every other party
reads "Paperwork" as a tab of its Settings, where it is plainly the
firm's own documents. She is the firm *and* the worker, so her Paperwork
link opens two tabs side by side, **"Company paperwork"** for the firm's
and **"Your paperwork"** for her own, which is the rule her other pages
already follow: your work, your page, your data.
Two entries reading the same word on one menu is the duplicate class the
founder has reported three times, and a heading cannot disambiguate it
for somebody who is both things at once.

**A person who is also a worker wears two hats, one at a time.** Since
2026-11-03 (see "One person, two hats, switched in the account menu"):
the account menu at the top right lists every firm seat the person
holds and "You" where the work makes them a worker; the left menu
shows one hat's links and nothing else, the firm's in the firm hat and
the worker's own pages in the You hat. A link into a worker's own page
opens the You hat. The hat is a view, never a permission: every route
still answers the seat it always answered. The paragraphs below are the
history it replaces.

**Until 2026-11-03: a person who is also a worker kept their firm's
links and gained "You" at the end.** Decided 2026-09-17, on the founder opening Karthik Menon's
demo door and saying "Candidate Karthik is all buggy". He is a systems
integrator's own W2 — the case "Who sells and who buys" added the same day
— so his only context is EMPLOYEE at Teleworld and the shell read identity
off the seat's type: he was served Teleworld's whole integrator menu, and
the four pages that are actually his appeared nowhere at all. The demo door
dropped him on `/dashboard/my-work` and nothing in his own navigation
pointed back to it.

Appended, never substituted. He is Teleworld staff with a real seat **and**
the person the work is about, and giving him the consultant menu instead
would be the same bug facing the other way. Whether somebody is a worker is
read off the work — a placement, a submission, a contract that pays them
(`ownPage` in `lib/consultant-portfolio`) — and never off a context type,
because every staffer of every firm holds an EMPLOYEE context and a
client's bookkeeper is not a contractor. Somebody whose seat already **is**
the consultant seat reads the Consultant row and nothing changes for them.

**Corrected 2026-10-08, by the sign-up walk: the firm's sections are a
desk's, and a seat with no desk reads Today and You.** Round five seated a
Member with no desk at a populated client and typed every URL: the
firm's money and people came back. Round four had tested the same seat
at an empty company, where every page is empty whatever the rules say.
Two things followed, both in `lib/nav-table` and one door in
`lib/api-context` (`lib/deskless-door`):
- **"No desk" means "holds nothing beyond own-work reads"**
  (`assignments.read`, `timesheets.read`), not "holds no permission". A
  desk is any permission that acts on the firm's book or reads across
  it. Karthik's two reads were meant to open his own placements and
  weeks; they opened the firm's submissions with rates, a commercial
  thread and colleagues' placements.
- **One door, not a gate per route.** Every dashboard route passes
  through the shared caller check, which refuses a desk-less seat on
  anything its menu does not show it, in a sentence, the refused read
  logged before the refusal goes out. The allowlist is derived from the
  menu table, so it cannot drift. A route that scopes itself to the
  caller's own rows declares that and is let through.
  `__tests__/invariants/every-route-has-a-door.test.ts` fails on any API
  route that goes through none of the shared door, the cron check or the
  staff check and is not on the named list of public token routes.
So Karthik's menu is now Ask Etyme, with his conversations inside it,
and You (Notifications went on 2026-10-13, and Conversations folded into
Ask Etyme on 2026-10-19). He lands in Ask Etyme like every seat ("Ask
Etyme is the app"); his own work is one click behind it. The paragraph
above still holds for a worker who holds a role at the firm: a delivery
manager who is also on a placement keeps the firm's links and gains You. **For the
founder to confirm:** this narrows what a firm's own W2 sees by default;
if an integrator wants its engineers to read the firm's lists, that is a
desk the firm gives them, not the default.

**A menu entry the route will refuse is a menu entry that lies.** The same
rule as the buttons, one layer up: a nav item names the permission the page
behind it actually asks for, read off that route's own GET handler, and a
seat that holds none of them is not shown the link. A link with no
permission beside it opens a page that refuses nobody — it scopes itself to
the caller's company and shows what that company has. The + button and ⌘K
are filtered from the same answer, so the three doors into a page cannot
disagree. Where a route's gate refuses the very desk the page is named for
— `/api/ar` and `/api/ap` ask for `margin.read` and the Accounts Receivable
desk does not hold it — the link stays unfiltered and the gate is the bug,
because hiding a desk from itself is worse than a refusal.

**Eyebrow labels are company-type-specific.** A page's eyebrow names the
link it sits under on the reader's own menu, and since 2026-10-19 that is
one of the nine: a tab is headed by its noun, so Interviews reads
"Candidates" and Payroll reads "Bills". A client company (Northbend
Athletic, Talvern Medical) sees the same data under its own links — its
suppliers' invoices read "Invoice receipts" where a supplier's own bills
read "Bills". The eyebrow, nav link and page subtitle adapt to the
viewer's company type; the underlying data and pages are shared, the
framing is not. `lib/page-framing` derives every eyebrow from the same
nav table the sidebar draws, so a supplier's contracts read "Companies"
and a client's read "Contractors", and
`__tests__/invariants/page-framing.test.ts` fails on an eyebrow that names a
link the reader's menu does not have. Since 2026-09-21 the framing also
takes the seat: a program office at a client's desk reads the client's words
over the client's book, with one clause saying whose book it is.

---

## Zero training — it behaves the way the trade already works

**Decided 2026-09-10.** The people using this are HR and contracting
professionals. They will not be trained on it, and nothing may assume
they were. Gmail and Airbnb are the reference: a first-time user does the
right thing because the product is shaped like the thing they already
know how to do.

What that means, concretely — and every one of these was learned by
getting it wrong first:

- **Their words, not the system's.** A nav entry, a column, a chip or a
  filter says what a recruiter or a programme manager would say —
  Requirements, Submissions, AR, AP, POs, Contracts. Never an internal
  state name. The 2017 timeline filter was the cycle engine's own enum
  (`TimesheetSubmit`, `SalaryCalculation`); the rebuild's nav read as
  "out of context for Indian English speakers". Both were the same
  mistake: exposing how it is built instead of what it is for.
- **Three words, not nineteen states.** Group internal states into the
  handful of milestones a person actually acts on — hours, pay, bill;
  draft, awaiting, open, filled, cancelled. Every internal transition
  does not deserve its own name on a screen.
- **One door, then the right seat.** Never ask a visitor to classify
  themselves on a distinction the product exists to say is not a property
  of a firm. Demand and supply are positions on a deal.
- **Default aggressively, configure rarely.** Ship the one sane default
  (Friday weeks, the 15th and month-end, forward weekend shift). Add a
  setting the first time a paying client needs a different answer, not
  because a legacy client theoretically could. A knob per client is how
  the 2017 engine reached four thousand commits.
- **Never hand them a form whose answer is thrown away.** The seat
  picker was one for a week. If a choice is offered, the choice is
  honoured.
- **American English, on every screen.** Decided 2026-09-13. The
  customers are US enterprises: program, program office, cost center,
  authorization, color. A buyer who reads "Programme team" registers
  foreign before they register what it does.
  `__tests__/invariants/american-english.test.ts` fails on a British
  spelling anywhere under `src/`. Machine names that were British before
  the decision — the demo desk key `programme`, the seeded
  `world-nike-programme@` email, `seed-programmes.ts` — stay, because an
  address is not a word anybody reads. This file keeps its own spelling.
- **Every list, two ways.** Decided 2026-09-13. A list is a table when
  there are two hundred rows and a feed when there are eight, and the
  reader chooses — every list offers both, from one description of its
  rows (`components/list-surface`), and remembers the choice.
  `__tests__/invariants/list-surface.test.ts` fails on a page that draws
  a bare table.
- **A chart's colors are computed, not chosen.** Decided 2026-09-13.
  One palette, in `lib/chart-colors`, with the validator run quoted
  beside each set: a severity ramp for ordered bands (one hue, light to
  dark, so worse reads as darker), a fixed series order for identity
  (never cycled, never recolored by rank), and reserved status colors
  that are never "series four". Stacked fills are separated by a 2px
  gap in the surface, never a border; a count sits in the legend, never
  inside a segment where a narrow band clips it; and where nothing
  varies — eight bars all of length one — the list is the honest form
  and no bar is drawn.
  `__tests__/invariants/chart-colors.test.ts` recomputes the lightness
  and contrast rather than pinning hex, and fails on any screen that
  reaches outside the palette.
- **Explain in a sentence, not a code.** A refusal says what is missing
  and what to do — "Priya cannot start without an I-9. Get it on file,
  then activate." — never `DOCUMENTS_BLOCK`. The code is for the
  machine; the sentence is the product.

The test for any screen: would somebody who has done this job for ten
years, and never seen Etyme, do the right thing on the first try? If the
honest answer needs the word "once they understand", it is not done.

---

## Pricing — decided 2026-08-29

**Free while testing; the price is set after five real vendors are using
it.** Founding firms keep the terms agreed with them, in writing, when a
price exists. Until then no agent invents a number, a range, or a unit —
on the page, in a deck, or in a conversation. The home page states the
decision; changing it is the founder's alone.

---

## Several agents at once

Seven specialists own disjoint parts of the codebase and work at the same
time; two more read only. `docs/how-agents-work.md` is the working
agreement; `.claude/agents/` holds the definitions.

**Parallelism is bought with a boundary, not with coordination.**
`src/lib/domains.ts` maps every file to exactly one owner and
`__tests__/invariants/domain-ownership.test.ts` fails when a new file has
none or two. A page describing who owns what is wrong within a month; a
test is wrong for exactly one commit.

`prisma/schema.prisma` belongs to nobody. Every domain wants a column in
the same file and it is the one artefact where two individually correct
changes still produce a wrong result, so it queues through
`etyme-architect`. A domain agent that needs a column says what it needs
and why, and stops.

| Agent | Use it for |
|---|---|
| `etyme-money` | How a figure is calculated, when it is billed, what somebody is paid |
| `etyme-regulatory` | Anything with a legal consequence |
| `etyme-conversation` | How something is said, to whom, on which channel, how often |
| `etyme-demand` | Between a manager needing somebody and a person being chosen |
| `etyme-supply` | The bench as a business |
| `etyme-market` | Public words, positioning, and moving work between companies without leaking |
| `etyme-architect` | Schema, shared components, decisions crossing two domains |
| `etyme-scout` | "Does this already exist and who owns it" — read only |
| `etyme-release` | Deciding whether it ships — read only |

Work moves: scout → schema → spec as test names → build → release →
preview URL. Different domains may run at the same time. Two agents in
one domain may not, and neither may anything touching the schema
concurrently.

`docs/delivery-matrix.html` carries L1 to L4 with the owning agent per
L2 group. A change to L3 or L4 belongs in the same commit as the code
that caused it.
