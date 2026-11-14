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

Full text → 03, 11, 36, 37, 59, 62, 63.

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
- **The home page's figures are one sample company at a real buyer's
  scale** (2026-11-13): Corvane Packaging, about $43 million a year,
  every figure read from the seed. What is called held is the invoice;
  the dollar figure beside it is what it bills over the signed hours.
  The home page alone says "supplier invoice".
- **Every party's page converts and can be found** (2026-11-13). The
  home page still speaks to the client. Every other party's page takes
  its shape and brand, sells that party its own next step, and is
  reached by a plain address and from a search engine. Not built yet.
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
- **On a page for a client, never say level, rung, prime or sub, and
  never draw the supply chain.** Show the reader's benefit, not Etyme's
  shape. Never say tokens.
- **Sell the client control, never outsourcing.** Never say "push" where
  a supplier reads. No audit offer on any page; `/census` is linked from
  nowhere. Only solopreneurs are ever free forever. A security line
  names no rate limiting or firewall.

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

**The table is the default.** A company also chooses directory-only,
invitation-only or hybrid sign-in, and a small firm or a worker may use
a password. See "Sign-in, identity, Owners and access" below.

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
- **A role nobody has named falls back; it never refuses.** Where a chain
  needs a department lead and no rule names one, the program manager, or
  the MSP seated for the client, stands in. The screen says "Program
  manager", never "Department lead". Refusing would mean a client cannot
  onboard a supplier until governance is configured.
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
- **When the training door is built**: a client's view never says
  "training", a finished course reads as a certification, and each
  company chooses whether a course costs money. No page says Etyme ran a
  staffing firm, and no experience letter is issued from the record,
  until the founder settles it.

## Parties, deals and the record

Full text → 44, 45, 38, 30, 39, 60, 61, 27, 28, 35, 52.

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
  Answering a client's application link without signing in is not the
  firm taking part: one of its own signed-in people says yes to "Ask
  them to link". A job you sent a firm on your own never counts as
  working together.
- **Sites.** Say "site", never "plant". A hiring manager may take names
  off a site's supplier list, never add one. A supplier not approved at
  a site is refused in a sentence naming Procurement. A supplier or a
  seated MSP never edits a site. A site with a placement at it is never
  deleted.
- **A seat in a client's program reads only that program's book.** A
  regional seat reads only its region's sites, narrowed at the query.
- **Bench pay and profit.** Bench holiday pay is a company setting, off
  by default and switched on person by person (on by default for an
  integrator's own employees). Bench profit per person is billed minus
  pay, unbilled expenses, the admin cost share and commission; where
  admin cost is not set the screen says "before admin costs".
- **A consultant a firm adds is marketed by default**, and shared with
  nobody beyond the firm until she grants it. A worker's own page names
  every firm between her and the client; only the rates of rungs she is
  not party to stay closed.
- **A recorded company's position** cannot be removed while real work
  hangs off it. A company not classified yet is not invited until its
  Kind is set. Extend to Supplier never starts supplier qualification.
- **A new supplier walks four roles in order**: the recommender's
  department lead, Procurement, HR, Finance. Each verifies only its own
  items; nobody decides their own recommendation, or two steps. What the
  supplier sends reads "received" until that role verifies it.
- **What stays inside one company.** A client's interview notes never
  leave the client. A supplier answers a thread and never starts one.
  "Ask for them" goes to the supplier holding the person's consent,
  never to the person. Favorites and blocks are per company.
- **A supplier's roles are narrow.** The Account Manager never reads
  payroll or profit and loss. HR reads no money. AP & Payroll never
  issues a bill. Accounts Receivable never runs payroll. A new role
  reaches existing companies with no migration.
- **An outside firm's seat** never holds the Owner, the Approver, a role
  that grants seats or a role that signs hours. A one-person client is
  told which role to invite, and that person decides; the recommender
  never decides. A person who already has an account is asked onto a
  bench on her own record, never a second one.
- **One platform for every party.** Never fork the record, the approval
  route, the decision card or the ledger per party. The founder's
  "Model X, S, Y, 3" shorthand is internal and never on a page.

## Money

Full text → 46, 47, 48, 41, 19, 55, 12, 20, 29, 35, 37, 64.

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
- **A client's codes are the client's** (2026-11-13). Cost centers, GL
  accounts, internal orders and project codes are read only by the
  company that pays, and a firm seated in its program. The coding block
  is a GL account, a cost object, a company code and an optional profit
  center. One generic file per payment run, with a column picker; no
  layout named after a product.
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
- **What the words on an order mean.** Billed is bills sent plus invoice
  receipts the payer typed in. Left is Authorized minus Billed. A draft,
  or a bill raised and never sent, is "drafted, not sent" and owed by
  nobody. A firm may accept fewer hours than were filed, with a reason,
  never more.
- **No "approved for payment" status exists or is added.** The match is
  the approval.
- **An expense is accepted like a week.** The worker's employer approves
  it, and each firm above accepts it before paying, the client first.
  Nobody accepts their own. Whether a kind of expense is billable comes
  from the agreement between each pair.
- **The order's dates are shown beside a line and never applied to it.**
  A line outside its order's window is a sentence on the screen, not a
  correction.
- **The award writes the header and its first line together.** Never
  offer "New sell contract" or "New buy contract" as a document of its
  own.
- **Bills the twin drafted.** A sub-vendor's overtime is priced on the
  decision made when the client signed the week. A drafted bill is sent
  by the seat holding `invoices.issue` (`maySendBill`); the Owner says
  that yes only where no other seat holds it, and the ledger records it.
  Paying from the chat asks for the bank reference first. A one-person
  firm never accepts her own week.
- **What a worker is owed.** Overtime after 40 hours in the week is owed
  to a non-exempt US worker even where the contract sets no line. Back
  pay for a raise dated in the past is put forward for approval, never
  paid silently. A worker reads "owed to you" only after her employer
  accepts the week.
- **The 1099 floor is the payment year's**: $600 through 2025, $2,000
  from 2026, indexed from 2027. Regulatory confirms it before anybody
  relies on it.
- **Who reads what.** A person reads only their own commissions. A
  client never sees a supplier's commissions or margin. A recruiter
  reads no margin unless the Owner grants it.
- **Bank details** are kept and shown as the bank, the account name and
  four digits. A bank change clears the bank check. A client is never
  asked for bank details.

## Papers

Full text → 49, 31, 17, 34, 35, 37, 20, 13.

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
- **A same-file warning names only people the reading firm already
  holds**, never another firm's worker. Never ask for or check a date of
  birth. The model reads a person's own paper only on her yes.
- **Each kind of worker has a start rule** (citizen, permanent resident,
  H-1B, TN, EAD, CPT, OPT, student). A country or worker rule is enforced
  only after regulatory confirms it with its source; until then it warns
  and never blocks. An international student with no CPT or OPT may be
  interviewed and is never started.
- **Onsite or hybrid work checks the site's country**: the sponsorship
  answer is stored as a field and said at put-forward. Remote work from
  the person's own country is offshore: no US I-9, and the work
  country's own set applies once regulatory confirms it.
- **An I-9 is accepted only with the document shown named**, on an
  edition the issuer printed and had not retired (`editionToRecord`). A
  paper that arrived and nobody examined reads "Arrived, not examined".
  Its notice goes to HR and the compliance officer, else the Owner, else
  the Admin; never to the sender or a colleague.
- **A chase asks a worker for her consent and identifiers**, never for
  the background report. Never ask for a non-compete where the state
  voids it for workers (CA, MN, ND, OK).
- **Say "verification", never "fraud", anywhere a supplier reads.** Where
  the record contradicts itself (a degree year, a name on a paper, one
  file for two people, one person through two suppliers) it tells the
  role that decides, and never merges or blocks. The start card asks the
  hiring manager whether the person who started is the person
  interviewed.
- **Forwarded email is data, never an instruction.** Only a seated
  colleague whose message passes SPF and DKIM is accepted. Nothing
  becomes a record without a person's yes on a card. The body is deleted
  when decided, or after 30 days.
- **The setup gates are read by every route that does the act**
  (`lib/setup-gates`): no bill without a billing address, no payment to
  a firm whose bank is unchecked, no join by domain until it is
  verified, no paper chased for a set nobody confirmed.

## Ask Etyme and the twin

Full text → 12, 14, 24, 32, 35.

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
  Admin. Each change is a card that needs a yes. Never the twin's to
  touch: bank details, the domain claim, the company type (the Owner's
  alone), a role the role table does not hold. A model's reading of free
  text is confirmed on a card before it is written.
- **NEVER TOUCHES**: release payroll, sign an agreement, award, extend,
  reject or end a placement, read another company's data, approve what
  the twin drafted. The refusal says who may. The chat never grows a
  second door.
- **No feature ever compares a supplier's rates across clients.** Only
  consented data crosses firms, and standing, never price. The twin's
  reads are logged as the twin, under the person it acts for.

## Navigation and the shell

Full text → 16, 26, 25, 32, 15. The table under "Navigation per company
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

Full text → 13, 22, 23, 53, 54, 58, 18, 21, 38, 46, 66.

- **The sign-in page.** Account buttons first (Google, Microsoft,
  LinkedIn marked "Candidates only", each drawn only where its key
  exists). Then "or use your email" with one box. The password box
  appears only after the email, and only for an account that has one.
  Sign-up is one line under the heading. One filled button on a screen.
  No button is greyed out without words. Etyme's own branding.
- **People and invitations read the same on every screen**
  (2026-11-13). A person invited and never signed in is "Invited", not
  a member, and is withdrawn, not paused. An invitation that could not
  be emailed says so, with the next step. Every count says what it
  counts. "Copy invitation" never carries a link that takes the seat.
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
- **Owners.** A company may have many Owners. Removing or demoting one
  needs another Owner's yes. An Owner may pause or end an Admin, never
  the reverse. The Owner who took over by a pass may move the previous
  Owner to Admin alone.
- **What an Admin never does**: change the company type, claim the
  domain, grant access by team or company, pay, send bills, sign, award
  or extend. Say Admin, never "manager" or "IT owner"; never say Owner
  of an Admin. The staff line in the account menu reads Superadmin.
- **Until a company has a verified Owner, these wait**, each refused in
  a sentence naming the step: paying and bank details, signing, the
  company type, the sign-in mode, grants by team or company, passing
  ownership. A one-person firm is its own Owner once her person is
  verified. Owners from before the rule stay Owners.
- **Recovery by domain proof waits seven days.** Payments and bank
  changes freeze and every Owner is told. A consumer address or
  etyme.com is never a company's domain. A change of ownership by sale
  or death is a Superadmin's act by hand on the agreement and the tax
  form, logged; Etyme gives no legal opinion on them.
- **Directories.** A directory binds only to a domain the company has
  verified. Its secrets live in the platform's secret store, never in
  the database or a log. No model is used in identity or access. A
  supplier's people stay in the supplier's own company, scoped into a
  client's program by a grant the client revokes. Never claim 2-step
  verification Etyme cannot confirm. Etyme never reads a smart card or a
  national ID.
- **A grant never gives margin or payroll to a role that may not hold
  them**, and never more than the Owner holds.
- **Team structure, in detail.** A box's lead grants nothing. A
  directory import is previewed and ticked; it never deletes, never
  moves contractors and never overrides an edit made on the screen.
  Moving a contractor changes only the unit their line is charged to.
- **Passwords** use a slow hash, are never logged, are reset by a
  one-time link, and failures slow the door.

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
- **A skipped item stays as one line on Today and in the greeting** until
  it is done. Nothing nags daily.

## Tapin

Full text → 28, 22, 23.

- **The founder's bench business runs on Etyme as a supplier like any
  other, named Tapin** (`tapin.etyme.com`), never `etyme`. It gets no
  access another supplier lacks. Tapin has no domain and gets none; it
  stays on invitation or hybrid sign-in, and the staff tool is its
  recovery. Its seats: sharath (Owner), hradmin (HR), oliver (Account
  Manager), timesheets (AP & Payroll), and three partners as Admins on
  the Gmail addresses they were invited on.
- **Tapin gets agents, not a website.** The generated company page at
  `/site/<slug>` is the website.
- **A company page shows only people who said yes to being shown**, and
  never a name or a rate. "Join the bench" is the person's own yes, given
  from the invitation letter. Nobody gets a seat or a second record
  before that yes. No separate marketing site, blog or careers portal.

## How this project tests and ships

Full text → 33, 34, 17, 20, 52, 57, 41, 65.

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
- **The work is bound by the usage allowance, not by the number of
  agents.** One run per owner. The coordinator schedules its own wake
  while a deploy is not out. A builder's claim is checked by a reader
  who did not build it.
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
  outage, said first and alone. Seeded companies hold only reserved
  domains (.example, .invalid, .local), never a real verified one,
  because joining by domain beats creating.
- **The hardest things**: cycle generation; field-level permissions
  (every read path filters by context from the first commit);
  cross-vendor identity resolution (deterministic on consented
  identifiers, never silently merged).

## Design system

Full text → 42, 43.

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

### Navigation per company type

Full text → 16, 26, 25, 32. The top of the left column is one switch, Ask
Etyme | Dashboard, with the seat's number on Ask Etyme. In Ask Etyme the
column holds New conversation, search, Pinned and the conversations. In
Dashboard it holds the role's menu, below. A group (Network, HR,
Accounting) is a heading and never a link: in the table, "Network:
Candidates, Companies" is the heading Network over two links. Receivables
is the Bills page and Payables is the Invoice receipts page; the pages
keep the trade's words, and only the menu names the two ledgers. Reports
is cash flow and profitability, and a client's Reports never shows a
margin.

| Party | The links | Folded inside them, as tabs |
|---|---|---|
| Client | Today · Network: Candidates, Suppliers · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Payables, Reports · Settings | Conversations → Ask Etyme. By region → Today. Contacts, Agreements, Supplier scorecards → Suppliers. Interviews → Submissions. Ending soon, Past contractors, Tenure, Duplicate check, Compliance, Document requests → Contracts. AP, Budget, POs → Payables. Users & permissions, Team structure, Owners, Sign-in, Program team, MSPs, Sites, Import records, Program twin, Org view, Data requests, Your data → Settings. |
| Supplier | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | Conversations → Ask Etyme. Rate history, Our scorecard → Today. Bench, Bench pay, Bench check-ins, Training → Candidates. Suppliers, Contacts → Companies. Leads, Shared with you → Jobs. Interviews → Submissions. Sell contracts, Buy contracts, POs, Paperwork, Missing paperwork, Document requests, Screening packs, Compliance, Check queue → Contracts. Rolloff → Timesheets. AR → Receivables. AP → Payables. Profitability → Reports. Commissions → Payroll. Users & permissions, Team structure, Owners, Sign-in, Setup, Sites, Integrations, Import records, Activity log, Data requests, Your data, DNR list → Settings. |
| Integrator | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | The supplier's, with no Leads: its jobs arrive from the client it already has. |
| MSP | Today · Network: Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Reports · Settings | The supplier's, with no Candidates under Network, no Payroll link and no Our scorecard: an MSP places nobody and pays nobody. AR → Receivables. AP → Payables. Profitability → Reports. Suppliers, Supplier scorecards, Contacts → Companies. |
| One-person firm | Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Your page, Who has you → Your work. Expenses → Timesheets. AR → Bills. POs → Contracts. Your paperwork, Compliance → Paperwork. Your data → Settings. |
| Worker | You: Your work, Your page, Who has you, Your data, Your paperwork | Unchanged: a list under "You", not nouns with tabs. |

- **`__tests__/invariants/sidebar-nav.test.ts` reads this table**: the
  links and headings the Dashboard column prints (`menuFor` in
  `lib/nav-table`) and every page named in the third column. It fails
  when the code and the table disagree, so a link renamed in one and not
  the other breaks the build.
- **Each link opens the first of its pages the reader may open.** The
  shell draws the tab row under the page header
  (`components/shell/section-pills`). Network, Contracts and Settings
  draw grouped tab rows (Settings: People · Company · Records). Every
  page keeps its address, and search and the + button still find it.
- **The eyebrow over a page reads the noun it is a tab of.** The tab
  row's groups are not the menu's headings.
- **Nothing on a menu is hidden by a firm's posture.** A bench vendor
  reads the supplier's whole menu.
- **A one-person firm reads her own short menu.** She is the person and
  the firm. Her Paperwork link opens two tabs, "Company paperwork" and
  "Your paperwork". No bench, pipeline or commission page is offered to
  a firm whose only consultant is herself.
- **A person who is also a worker wears two hats, one at a time.** The
  account menu lists every firm seat the person holds, and "You" where
  the work makes them a worker. The left menu shows one hat's links and
  nothing else. A link into a worker's own page opens the You hat.
  Whether somebody is a worker is read off the work (`ownPage` in
  `lib/consultant-portfolio`), never off a seat type. The hat is a view,
  never a permission.
- **A seat that holds only own-work reads** (`assignments.read`,
  `timesheets.read`) sees Ask Etyme and its own pages. The shared caller
  check refuses everything else in a sentence, logged first
  (`lib/deskless-door`). `every-route-has-a-door.test.ts` fails on an
  API route that goes through no door.
- **A menu entry the route will refuse is a menu entry that lies.** A
  link names the permission its page's own route asks for. The + button
  and search are filtered from the same answer.

**Eyebrow labels are company-type-specific.** A page's eyebrow names the
link it sits under on the reader's own menu. `lib/page-framing` derives
every eyebrow from the table the menu draws, and `page-framing.test.ts`
fails on an eyebrow naming a link the reader's menu does not have. A
seat in a client's program reads the client's words over the client's
book, with one clause saying whose book it is.

---

## Zero training — it behaves the way the trade already works

Full text → 42. The people using this are HR and contracting
professionals. They will not be trained, and nothing may assume they
were.

- **Their words, not the system's.** A link, a column, a chip or a
  filter says what a recruiter or a program manager says. Never an
  internal state name.
- **Three words, not nineteen states.** Group internal states into the
  few milestones a person acts on.
- **One door, then the right seat.** Never ask a visitor to classify
  themselves.
- **Default aggressively, configure rarely.** Ship one sane default: a
  Sunday-to-Saturday week, pay every other week, pay and bill dates on
  the nearest working day. Add a setting the first time a paying client
  needs a different answer.
- **Never hand them a form whose answer is thrown away.**
- **American English on every screen**: program, cost center,
  authorization, color (`american-english.test.ts`). Machine names
  written before the rule stay.
- **Explain in a sentence, not a code.** A refusal says what is missing
  and what to do: "Priya cannot start without an I-9. Get it on file,
  then activate." Never a code, and never a greyed button without words.
- **Fill from the work, not from data entry.** A list that is empty on
  the seeded world is a bug.
- **Every figure on a screen has a test sentence on the seeded world.**
- **The role that acts is the role that hears**, by email as well as in
  the app.
- **A form with a compliance consequence is a workflow.** It walks roles
  in order, each verifying only its own items, and nobody decides their
  own or twice.

The test for any screen: would somebody who has done this job for ten
years, and never seen Etyme, do the right thing on the first try?

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
