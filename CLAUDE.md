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

This file uses both words throughout its older sections, written before
the rule; read them as the replacements above. New text here follows
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

## What Etyme is — say this, not something else

**Etyme is the system of record for contingent workers: the layer between
a company and every staffing supplier it uses.**

Category first, before anything clever. The span is requisition → suppliers → submissions →
screening → interviews → onboarding → timesheets → invoices →
compliance. Naming one station makes the whole product read as that
station.

**Tenure is the moat, not the wedge. Decided 2026-09-17.** This section
has now been corrected twice, and the second correction reverses what the
first left standing.

On the 15th it said tenure was the wedge because it is "a legal exposure
rather than a saving". The founder pushed back: nobody is fined at month
nineteen, there is no tenure regulator, enterprises have run eighteen-month
rules on spreadsheets for years and mostly nothing happens. The reason was
replaced — tenure is the number nobody can produce — and the conclusion
was kept.

On the 17th the founder pushed back on the conclusion: **"Tenure is
nobody's problem — only you expect it to be solved."** And that was right
too. Cross-supplier identity resolution and the union of periods are
beautiful engineering problems, and a builder mistakes a problem that is
satisfying to solve for one somebody is paying to have solved. Every
agent read "the sharpest wedge is tenure" and built toward it; no buyer
ever said it.

**A wedge is why they buy. A moat is why they cannot leave.** The two
were conflated here. Tenure is a plausible moat — once every supplier's
contracts for a client are in one place, a number is computable that no
VMS and no supplier can produce, and that gets harder to walk away from
over time. It is a bad wedge — nobody wakes up worried about it, and "we
have never been caught" is true.

So: **keep the tenure ledger, computed correctly, as one line in the
picture. Stop leading with it.** The screens were already more honest
than this paragraph — the client dashboard shows tenure as one panel of
six, and the home page hooks on not-knowing, not on tenure. What was
wrong was the sentence agents were steered by.

**What the wedge actually is is not decided here**, on purpose. It is one
of the four questions below, and which is sharpest is something a buyer
says, not something an agent derives. Twice now an agent has picked
confidently and been repeating somebody else's confidence. The fastest
way to find out is one client answering their CFO with this instead of a
spreadsheet.

**Compliance is the justification, not the motivation.** People buy
because somebody asks a basic question about their own workforce and they
cannot answer it — how many contractors do we have, what are we spending,
who has been here longest, are we paying two suppliers differently for one
skill. Every answer is "I'll get back to you", then three weeks, then a
number nobody trusts. That happens monthly. The penalty is hypothetical.

They then justify the purchase to finance with the exposure. Two
sentences doing two jobs, and anything user-facing needs both: **the hook
is the not-knowing; the business case is what it costs when somebody
finally asks.** Leading with the penalty is selling a fear the buyer does
not actually hold.

**Say it to the client.** The page may not address hiring companies,
primes, subs and bench operators as four equal audiences — that is the
old plan, from before the client became the customer on 2026-09-10.
Speaking to four is speaking sharply to none: a hiring manager who reads
"primes, subs, bench operators" concludes this is software for staffing
firms and leaves. Write to the client and let the suppliers read over
their shoulder; they come anyway, because their client is there.

**Never lead with AI.** It is in there, it does real work, and it is the
least defensible thing in the product. Roughly half of what looks like
AI is plain rules, and that is a feature.

**Two constraints this positioning creates:**
- Horizontal, never vertical. Nothing in the core may assume IT staffing —
  the same product has to work for a travel nurse or a validation engineer.
- Neutrality is absolute. Etyme never runs a bench and never places
  anybody. The moment it competes with its own suppliers the network
  stops growing.

**Show the product, and name the category by comparison. Decided
2026-09-20, after a real buyer read the page.** The founder gave the home
page to the CTO of a two-billion-dollar company with forty to fifty IT
contractors, the exact buyer. He said he did not understand what the app
does, and that the page looked like an AI app and did not connect. The
founder named the category it belongs to, and it connected at once. Two
rules follow:

- **Screens before sentences.** A buyer understands a product by seeing it
  used. The page shows the real product, from the seeded demo: the list of
  contractors with the supplier, the rate and the time on site beside each;
  a timesheet being approved; one invoice matched to signed hours; the four
  questions answered on the dashboard. Dense tables with numbers read as
  enterprise software. Prose about "a record" reads as a pitch deck.
- **Name the category and the size, and no company. Corrected the same
  evening.** The page briefly compared Etyme to two named enterprise
  vendors. The founder read it on his phone and struck it: naming them
  "will trigger more questions than answers." A competitor's name on a page invites "how are you different",
  "are you certified like them", "who else uses you", and the page cannot
  finish that argument. So the page says the category and the size: "A
  vendor management system for companies with twenty to two hundred
  contractors, sized for a company with fifty contractors rather than five
  thousand." The guard
  in `lib/positioning` refuses any named company on the page again, with
  no exception.
- **Never name the enterprise incumbents anywhere. Decided by the
  founder, 2026-09-28:** naming the enterprise ERP and VMS vendors in
  documentation or any other content "makes it sound like we copied
  them." No page, document, letter, screen, test name, code comment,
  commit message or reply to the founder names one as the source or the
  model for a rule. A rule
  here stands on its own reason — the party who issues a document names
  it; an order is a header and its lines; the timesheet is the receipt —
  never on "because a vendor does it". The one exception is a functional
  integration target a customer picks by name (an export format for the
  accounting system they already run), which is a label on a setting,
  never an argument.
- **The category is contingent workforce management; VMS is the word
  beside it. Decided by the founder, 2026-09-27.** The sentence above is
  replaced by: *"Contingent workforce management for companies with 20
  to 200 contractors. The vendor management system, sized for fifty
  contractors rather than five thousand."* The product spans the whole
  of contingent work — requisition, suppliers, timesheets, invoices,
  tenure, compliance, and the program office option — and a VMS is one
  piece of that, so the category names the whole. "Vendor management
  system" stays in the second sentence because it is the word a buyer's
  procurement searches for and the word that made the CTO understand the
  product. **The label is not where the competition thins out**: the
  contingent-workforce umbrella holds the same enterprise VMS vendors
  plus freelancer platforms and employer-of-record firms. What is
  uncrowded is the size — companies with 20 to 200 contractors, too small
  for the enterprise vendors and too big for a spreadsheet. The niche is
  the size, not the word.
- **Enterprise contingent workforce management, for every size. Decided
  by the founder, 2026-09-28, superseding the size line above.** The
  category is declared as **"Enterprise contingent workforce
  management"**, and the page no longer limits the buyer to 20–200
  contractors: *"Don't limit to 50–500 consultants — keep the business
  open for all."* So no public page states a contractor range or "sized
  for fifty rather than five thousand". What this gives up, said once so
  it is a choice and not an accident: the size line was the one claim
  that set Etyme apart from the enterprise vendors, who now share the
  category word. The difference has to be carried by what the page shows
  — every supplier on one record, the program office option, set up in
  days — rather than by a number. ~~"Vendor management system" may still
  appear as the word procurement searches for.~~ **Superseded the same
  day: "vendor management system" is banned on public pages** (founder,
  2026-09-28, via the go-to-market review). The category is
  "enterprise contingent workforce management" and nothing else. The
  bare acronym **VMS stays** in exactly two uses: the founder's label
  for the choice ("Etyme as VMS software" beside "Etyme as MSP
  provider"), because a buyer knows those two words, and the buyer's
  own systems ("your ATS, your VMS"). It never names Etyme's category.
- **Plain words on public pages, defined once. Decided by the founder,
  2026-09-28.** The page says *job*, not role or requisition; *job
  request* where the object is meant; *bill*, never invoice, with the
  three-way *check* defined on first use as "the hours, the invoice
  receipt, and the contract rate must all agree" (founder, 2026-09-29 —
  the check is made on what a supplier sends); *time limit*, not tenure cap. A
  trade term a US IT buyer may not know is glossed on first use and
  then used plainly: "US work visa (H-1B)", "US work form (I-9)", "paid
  through her own company" for corp-to-corp, and "bench" as "workers
  waiting for a project". ~~This governs the public site and the demo
  hub, not the product screens, whose words stay the trade's.~~
  **Extended to the product screens the same day** (founder: "the
  product screens change too"), so the documentation and the screens it
  describes say the same words. On a screen: *job request* for
  requisition, *job* where a position is meant (an access role stays a
  role), *bill* for the document sent to a customer. The supplier side
  keeps the rule from "Bill, invoice receipt, payroll": what a
  supplier sends is *its invoice*, received as an *invoice receipt*,
  because the party who issues a document names it — so "bill"
  replaces "invoice" only where the firm is the one billing. Machine
  names, routes, models and event names do not move.
  **Stated plainly by the founder, the same day:** *"When you receive a
  bill from the layer down, we call it invoice receipt. When you issue
  an invoice to the layer up, call it bill."* So on every screen and
  page: what a firm **issues upward** to whoever pays it is a **bill**;
  what a firm **receives from below** is an **invoice receipt** — the
  client's screen of what its suppliers sent is "Invoice receipts", not
  "Supplier invoices". The supplier's own document may still be called
  its invoice in a sentence ("Techpeple sends its invoice"); the list, the
  heading and the step are "invoice receipt".
- **Plain English for a global reader. Decided by the founder,
  2026-09-29:** *"Simple plain English that people in India, the US, the
  UK and Australia, and even non-native readers, can read and
  understand. Don't throw prose."* Every public page, the demo page and
  the documentation read like the home page: a short heading, then
  cards, steps, lists and tables — not paragraphs. One idea per line,
  sentences of about fifteen words and never past twenty-five, common
  words, no idioms or metaphors, and who-does-what said plainly. Cut
  words, never facts.
- **The reader is a technical IT buyer, and the goal is trust, not a
  pitch. Decided by the founder, 2026-09-28:** *"You are targeting
  well-versed IT people; they rarely buy anything because of claims. Our
  main goal is registering as a trustworthy brand."* So every public
  sentence is either something the reader can check on the site — the
  demo with no account, the real screens, public documentation, the
  security position that says what is not done yet, the DPA — or a plain
  description of what the product does. No superlatives, no hype
  adjectives, no promised speed or result, no certification, uptime or
  customer count Etyme cannot show. The honest security page is an
  asset to this reader, not a weakness to hide.
- **Concrete nouns only above the fold**: contractors, suppliers,
  timesheets, invoices, rates, months on site. "Record" is allowed once
  the reader has seen the list it refers to.
- **Say what it does in four numbered steps** a CTO recognizes: post a
  role to your suppliers; they submit people; approve timesheets; pay one
  matched invoice per supplier. Everything else is below.

**The future being sold, in the founder's words — decided 2026-09-21.**
Asked what future Etyme sells, the way Tesla and Anthropic sell one, the
founder answered:

> If the future is more outsourcing work of speciality skills than getting
> it done in-house because we enable it, then we need to sell that without
> fear of losing employees and budgets, and we need to help, push and
> enable suppliers towards that path.

So the future is this: **a company buys most of its specialist work from
outside, and governs all of it as one workforce.** Employment becomes one
way of sourcing work among several, and the record does not care which.
Three rules follow, and none of them changes the page:

- **The client is sold control, never outsourcing.** A CTO with fifty
  contractors has already outsourced. The fear is losing control of the
  spend and the decision. The record answers it with more control: within
  plan a role publishes itself, an order carries a ceiling nothing bills
  past, and contingent spend is shown, not moved. Once a company can see
  what it buys from outside, buying a specialist for six months stops
  being a risk and becomes a line. The behavior follows the visibility;
  nobody argues for it.
- **Suppliers are enabled by the record and never pushed by Etyme.**
  Neutrality is absolute, so the push comes from what the record makes
  visible: the commodity work taken off the recruiter (the BRD's first
  thesis), the rate spread that exposes arbitrage and leaves expertise
  alone, and — still to build — a supplier's expertise margin made
  visible to the client beside its rate (Addendum D's margin class:
  certifications held, tenure of its people, outcomes on prior
  placements). The word "push" appears nowhere a supplier reads; every
  line about them says what the record takes off their plate.
- **The page still sells the category.** This future is the sentence for
  the room, and never with the word AI in
  front of it. The future is the record; what runs on it is the least
  defensible part.

### The public site and documentation follow one sequence — decided 2026-09-30

The founder, on the home page's four steps landing readers in the
middle of documentation pages: *"It lands them abruptly on sites in the
middle of the page, with no links to the previous or next content, and
not explaining the complete functional process."* Decided:

- **The four steps are the one spine** for the home page, the product
  pages and the documentation, in the same order. The product pages
  that are not one of the four hang under the step they belong to.
- **A step page starts at its own top**: "Step n of 4", Previous and
  Next at the top and the bottom, what you do, the real screen, who is
  involved, what happens next. **No link from one page lands in the
  middle of another** — a process gets its own page, with a contents
  list of the whole flow and "you are here".
- **Every step ends with "See this step in the demo"**, opening the
  exact screen as the right desk.
- **The documentation is split in three**, in the founder's words:
  "split job requirement and master data like business partner
  (customer, vendor) and consultant management, and matching, screening,
  application tracking." So: **the process** (a job request through to
  pay and offboarding, in order); **master data** (business partners —
  customers and suppliers — and consultants); and **recruiting**
  (matching, screening, application tracking).
- **The home page's content stays; only its navigation is fixed**
  (founder, the same day: "home page looks good — just fix
  navigationally"). And every public page and documentation page is
  **less prose, practical daily English, and neat flow charts**: a
  process is shown as a flow chart first (boxes and arrows, who does
  each step), with short lines under it, never as paragraphs.
- **"Source", not "Hire"** (founder, the same day; superseded 2026-10-14 by Job, Candidates, Timesheets, Invoices — see below). The first stage of
  the process is **Source** on every menu, page and flow chart: a
  contingent worker is sourced from a supplier, not hired. And a job
  request is a requirement: one object (`Requirement`), one screen
  word — **"Job requests"** on every party's menu, never "Requirements"
  on one party's and "Job requests" on another's.
- **Navigation is agreed party by party before any of it is built**:
  public visitor, client, program office, prime or integrator,
  supplier, one-person firm, worker.

### The home page leads with the cost question — decided by the founder, 2026-10-09

The founder's brief for the public site, given whole: redesign Etyme to
Apple-level UX quality on the existing architecture, and make the home
page convert an enterprise buyer into a qualified lead. Three things in
it change what this file said, and are recorded so nobody reverts them
by reading the older line:

- **The hero is "Know what every contractor costs, across every
  supplier."** The category sentence ("Enterprise contingent workforce
  management") moves to the supporting message under it. The hook is
  still the not-knowing; this is the not-knowing said as one question.
- **The home page's steps are three: Connect. Control. Reconcile.** The
  four steps (Source · Submit · Approve · Pay) stay the spine of the
  documentation and the product pages; the home page summarizes them as
  three. Both say who does what in one line.
- **The primary call is "Get a Free Contractor Spend Audit", and it is
  the census.** `/census` already exists as the door to the service
  (2026-09-20); the audit is that door under the buyer's own word. The
  secondary call is "Explore the Live Demo". The navigation is
  Platform, Solutions, How It Works, Security, and the primary call.

What does not change: no named vendor or company, no AI lead, no supply
claim, no certification Etyme does not hold, no customer or figure
presented as real (sample data is labelled as the demo's), plain
English, and the client as the reader. The lead form posts to a real
route and says success only on a real success.

### Three screens and a global section — decided by the founder, 2026-10-12

The founder, on the home page: *"Too many screenshots on home page"*,
and, on how to change it: *"Don't write code. Prototype the page first
and then take it."* Decided, after two prototypes and his choosing the
live page's bones over a page from scratch:

- **A page is prototyped before it is built.** A home-page change is
  drawn first, as a clickable page with every change marked, and the
  founder reads it; code starts on his "build it". A prototype is not
  a wireframe of grey boxes: it is the live page's own words and
  screens with the edits applied, because he reads the difference, not
  the drawing.
- **Three real screens, one per step it proves.** The dashboard in the
  hero answers the headline's question; a week being signed sits under
  Control; a matched bill under Reconcile. No mock cards in the hero,
  no separate "screens" section, no icon grid. Eleven screens read as a
  gallery; three read as proof.
- **One section on specialist teams around the world**, in the page's
  voice: what the record does per country, and what a client sets once
  per site. It is the global reading of the same category, not a new
  category and not a size claim.
- **"Each desk sees its own work" stays.** It is the parties section,
  written to the client. The mural of every party does not return to the
  home page: it speaks to four audiences at once, it is a picture of how
  it is built, and it competes with the one screen. The full picture
  lives on a "who uses it" page and in the documentation.
- **The header stays as it is live**: wordmark, Sign in, Free audit,
  Menu. Documentation is linked from the menu, the trust card and the
  footer, never a section of its own.

### The home page is the product, and the slop is gone — decided by the founder, 2026-10-14

"Build it", on the drawing he corrected three times
(https://claude.ai/artifact/6QSTnKXDiQJKqiT1qXLU3G). What the home page
is now, and the test for every word on it: which buyer asked for it,
and can the reader check it by clicking something on this page.

- **Three sections, about a hundred words.** The question and the
  category line, kept word for word. The live product under them. The
  sign-up band. Then the footer. The header stays as it is live.
- **The product is in the page, live and read-only.** The seeded
  Northbend Athletic program manager's screens, served inside the home
  page in a frame from a shared read-only demo seat: no sandbox is made
  for a visitor who only looks, every write is refused in a sentence
  that offers the visitor's own demo, and nothing a stranger does can
  touch the seeded world. "Open the demo, no account" opens the full
  demo as before. The three screenshots and "Screen 1 of 3" are gone.
- **Four chips under the product: Source, Submit, Approve, Pay.** Each
  moves the frame to that screen. The steps are walked, not read; the
  Platform section's eight cards of text are gone.
- **Sign-up sits right under the product**, because a buyer signs up
  after seeing it, not instead of seeing it: "Seen enough? Set up your
  company." The audit stays as the second call. One small line inside
  the same band carries every party's door, Clients first, and the
  footer carries the same five links. No section of their own, and the
  page keeps speaking to the client.
- **Security is one line and the link.** The honest security page stays
  whole.
- **Cut, and why:** "The problem" (the demo answers the four questions
  on its first screen); "The platform" (the chips); the global section
  and "what you set once" (documentation, under the step they belong
  to); "Solutions by desk" and the Platform menu (six audiences on one
  page speak to none); the security band's four cards; every adjective
  and every promise that cannot be checked by clicking; the trust card.
- **Teams and Ask Etyme are not sold on the page.** Ask Etyme is the
  first screen of the demo, so the reader meets it rather than reads
  about it. Teams goes on the page the day a real card has been tapped
  in a real tenant, as one line, in a customer's words.
- **Measured by one number**: demo visitors who reach the matched bill
  screen, and how many of those sign up or ask for the audit. A page
  element that does not move it is deleted the next week.

### Every product page and party door follows the home page's structure — decided by the founder, 2026-10-14

*"Make sure even the sub pages and doors follow the same structure."*
One skeleton for every public page that sells or explains the product:

1. **One question as the headline**, the reader's own, and one line
   under it saying what this page is for.
2. **The live product in the page**, the same read-only frame, opened at
   the step this page is about (a module page at its step; a party door
   at the screen that party acts on). No screenshots anywhere.
3. **At most three short lines** under the frame: what you do here, who
   is involved, what happens next. No card grids, no "day one" panels,
   no growth story, no bands.
4. **The sign-up band**, the same as the home page, with every party's
   door on its one line.
5. **One security line, and the footer.**

About a hundred and fifty words at most, checked by a test, the same
cut test as the home page: which reader asked for it, and can they
check it by clicking something on this page.

What keeps its own shape, because it is reference, not selling: the
documentation (the four-step spine, Previous and Next, flow charts);
the security position (whole, honest); the legal pages; the census and
demo doors (their forms). They share the header and the footer, and
nothing else is forced on them.

**One footer on every public page, the five doors first in sequence.
Decided by the founder, 2026-10-15** (*"Footer is missing clients
which links to home page"*; *"Clients, MSPs, Integrators, Suppliers,
Workers in sequence"*; *"security and documentation pages have footer
different from home page site? Is that right"*). It was not: the
documentation, security and legal pages still drew the older
four-column footer. Now every page draws the one row: Clients (the
home page) · MSPs · Integrators · Suppliers · Workers · Documentation ·
Security · Privacy · Terms · DPA · Contact. The legal pages say they
are drafts in their own headline; the neutrality line is said on the
supplier's and the worker's doors.

**Every public page fits on one screen. Decided by the founder,
2026-10-15** (*"AI slop … no one is reading large content … make it
real and make it simple"*; "Build it" on
https://claude.ai/artifact/Kj6C1QnoSgd8G7X2KQNg3Z). Security is what is
done, what is not, and what comes next, in order. About is five lines.
The documentation is four step pages and "When the work ends", each a
flow of who does what, a few rules and at most three refusals; the
nine process pages folded into them and the ten party pages into one
"Who does what" table, every old address redirecting. No station
tables, glossaries or L-codes on a public page. The demo is "Pick a
company and a role", every seat kept behind a fold. A test caps each page's words.
**The legal pages are not part of the cut** (founder, the same day: *"I
thought you were not changing privacy/terms"*): Privacy, Terms and the
DPA show their whole text, open, the way a legal page is read, with the
shared header and footer and nothing summarized or folded. Three things
the cut removed came back on his word: the industry under every demo
company, visible on a phone; how Etyme is paid when it runs a program
(suppliers pay a share of what they bill), on About's price line; and
"What a miss costs" on every step page, one or two plain lines with no
figure, beside what Etyme stops.

**Four doors, two with tabs, each headline a statement. Decided by the
founder, 2026-10-16** ("build it" on
https://claude.ai/artifact/NMSKv7vLFfZaxQRcKjbAWU). MSPs, Integrators,
Suppliers (Prime vendor, Sub-vendor, Bench vendor) and Workers (Worker,
Solopreneur); a tab is a link at its own address, so an advertisement can
open it, and it changes the words and never the panel. Each headline is
the party's single biggest win, said as a statement, replacing the
question of 2026-10-14. No price on any door: the founder's direction,
for when prices are set, is that only solopreneurs are ever free forever.
A door, or one of its tabs, may carry up to 165 words.

### The audit form is deleted and the menu is an icon — decided by the founder, 2026-10-14

*"Menu into icon. Does anyone need the audit form? I think it's
useless."* So:
- **The public header is the logo, "Sign in" and a menu icon.** The
  word "Menu" and the "Free audit" button go.
- **"Get a Free Contractor Spend Audit" leaves every page**: the header,
  the sign-up band, the footer, the documentation. The sign-up band has
  one button, Sign up. This reverses the 2026-10-09 line that made the
  audit the primary call; nobody had used it, and a second call on
  every page is a decision the buyer has to make before the one that
  matters.
- **`/census` stays reachable for 30 days, linked from nowhere**, so a
  link already sent or advertised does not land on a missing page;
  then it is deleted with its form and route. A buyer who is not ready
  to sign up has "Contact" in the footer.
- The program office offer (Etyme as MSP provider) loses its door with
  it. It returns, if it returns, as one line on Contact, not as a form.

### The page shows the product working, and the four steps are the trade's words — decided by the founder, 2026-10-14

"Build it", on the drawing at https://claude.ai/artifact/CtD3WDgeDiQNffeBTzSzo8,
after he found the live frame either blank or a wall of raw tables,
too large, and without Ask Etyme doing anything.

- **The big live frame is replaced by one compact panel** on the home
  page and on every product page and door. It plays the four steps on
  its own, a step every few seconds, as an Ask Etyme conversation (a
  question, an answer, a decision card that presses itself) beside the
  table that answer changes. The chips jump to a step; each page starts
  at its own step. About two thirds of the old frame's height; on a
  phone the chat sits over a short table. "Open the demo, no account"
  stays under it.
- **It is drawn from the seeded demo's own names and figures and cannot
  be blank**: it does not wait on a frame, a reseed or a network call.
  A test checks every name and figure in it against the seed, so the
  page never shows something the demo does not.
- **The four steps are Job, Candidates, Timesheets, Invoices**, on the
  chips, the product pages, the documentation spine, the menus and the
  flow charts. This replaces Source, Submit, Approve and Pay (the
  "Source, not Hire" line of 2026-09-30 is superseded): they are the
  four nouns a buyer already has on their own desk, and each is the
  thing the step produces. Machine names and routes do not move.
- **Every line in it is the trade's phrasing**: send the job to approved
  suppliers; who applied; schedule an interview; approve a timesheet;
  pay an invoice; on hold.

### The chaos is between people — decided by the founder, 2026-10-19

On a proposed galaxy hero for the home page: *"I see us solving the
chaos within the people and not planet or galaxy."* So the picture
Etyme sells is never cosmic, abstract or decorative. It is people doing
their day: a hiring manager who cannot say what her contractors cost,
a worker whose week is waiting on somebody's signature, an AP clerk
holding an invoice for two hours nobody signed, a recruiter chasing an
I-9. The chaos is the handoffs between them; the record is what makes
the handoffs plain. Every hero, panel, drawing and document shows a
named person and the step in front of them, in their own words — never
a planet, a network graph, particles or a metaphor for scale. The
ASD-STE100 test at about 80% (short sentences, one idea each, common
words; a staffing VP repeats the line after one read) is the copy test;
a diagram beats a paragraph in the documentation, never on the home
page, where the product itself is the picture.

### Why this is written down

It was agreed in conversation and the landing page went on saying
something else for a week — "Stop reading bad submissions", which is one
module describing itself, over a hero showing a shortlist. It read as a
hiring tool. Nothing caught it, because positioning has no test and the
founder had not seen the page.

Copy and framing drift the moment a decision lives only in a chat log.
Anything user-facing gets checked against this section before it ships.

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

**LinkedIn** is a profile field (URL), not an auth provider. Candidates paste it;
we do not use LinkedIn OAuth.

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

6. **Ready is the edges, and `/ready` is the only measure of it.** Tests
   prove the inside. An edge with the outside world — a real tenant
   signing in, a real file imported, an email that left, a Teams channel
   that heard, a company that is not seed — is proven only when the
   outside world has done it once on that deployment (`lib/readiness`).
   Every edge has three states: missing, set up but never used, proven.
   Nothing is production ready while a required edge is not proven,
   however many tests are green. The matrix's BUILT means built.

---

## Etyme runs the program — decided 2026-09-20

**Etyme is a program office provider.** The founder changed the strategy on
2026-09-20: Etyme offers to run a client's contractor program itself, as a
vendor-neutral MSP, on its own record. This reverses the note written two
hours earlier on the matrix row L3.7.5.1 ("not now; after the first paying
client"). The row, the home page, the competitive page and the census now
follow this decision, not that note.

**The client chooses one of two, in the founder's words (2026-09-20): Etyme
as VMS software, where the client's own program office runs the program on
Etyme; or Etyme as MSP provider, where Etyme's program office runs it for
them on the same software.** Both stand on the same record. A screen or a
page that offers the choice uses those two labels, because a buyer knows
them; the category sentence still comes first.

What it means, stated so nobody re-derives the old plan:

- **The record stays the product underneath.** Everything in "Who pays"
  below still holds: the client is the customer, every supplier's
  contractors on one record. The program office is the service sold on top
  of it, to clients too small for the enterprise program vendors to want.
- **Vendor-neutral only. Neutrality is still absolute.** Etyme places
  nobody and runs no bench. A program office decides who may supply and at
  what band, releases roles, coordinates rounds, matches bills and watches
  paperwork. It never fills a role itself. The master-vendor model, where
  the firm running the program also supplies people, is excluded
  permanently.
- **The seat comes first.** A program office that is not the client acts
  in a seat the client grants, under the client's rules, every read logged
  (the 2026-09-14 decision). That seat is a table with no reader and no
  writer today. Etyme cannot run anybody's program until it exists, so it
  is the first build after the census.
- **The census is the door to the service.** A client sends what it has,
  gets one page back, and the same named Etyme person who wrote the page
  is the one offering to run the program.
- **Pricing is unchanged.** Supplier-funded, a percentage on billings, the
  way MSPs are paid, and no number until the founder sets one. Free while
  testing still holds for the record.
- **The competitive page changes, but does not declare a rival.**
  Superseded the same day by the bullet below: the first version of this
  line said the incumbents' MSPs "become the firms we are measured
  against", and that framing was removed from the pages within hours. What
  stands: the incumbents are no longer called partners; the page describes
  the record, mentions the service once, and makes no rivalry claim, because
  Etyme has run no programs yet and a claim it cannot stand behind is worth
  less than silence.
- **Sell it quietly, as value added. Decided 2026-09-20, later the same day.**
  The founder: "MSP selling should be undercover selling and more as value
  addition rather than fully pitching for the market. Remove the threat if
  any to supply chain." So: the record is what the page sells. The MSP
  provider option appears once, as a quiet second way to use the record
  ("if you would rather not staff a program office, Etyme can run it for
  you on the same record"), never as a headline, never sized against the
  incumbents, never as a new category. The competitive page does not
  declare rivalry with MSPs; it describes the record and mentions the
  service once. Nothing on any page, letter or screen reads as a threat to
  a supplier: a supplier's rates and its sub-vendors' names stay private,
  its client stays its client, Etyme never supplies a person, and a
  program Etyme runs is said to make a supplier's life easier (faster
  approvals, bills matched and paid, fewer spreadsheets), not to watch it.
  A sentence that a supplier would read as "this is aimed at you" is
  removed, and `lib/positioning` holds a guard for it.
- **The MSP desks are Etyme's own.** Program Manager, Supplier Manager,
  Coordinator, AP Clerk, Compliance Officer already exist as a company
  kind. Etyme staff hold them in each client's program through the seat.

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

## Every sign-in door shows the account chooser, and setup asks for addresses and papers — decided by the founder, 2026-10-20

The founder, trying to sign in to Tapin as sharath@etyme.com while
already signed in to a Gmail account: the Google door reused the
signed-in account and gave no way to switch, so he was seated as a
candidate (a consumer domain is a person, by the domain rule) and
offered a one-person company's two steps, the week and the payroll.
He asked whether Teams would do the same, and said he expects a
company's setup to be "more elaborate: addresses, invitations, doc
flows". Decided:

- **Both OAuth doors ask the provider for the account chooser on every
  sign-in** (`prompt=select_account` on Google and on Microsoft), and
  the sign-in page and the first screen after it carry "Not you? Use
  another account". Microsoft without it behaves exactly as Google
  did, so this is one fix for both. The password door (work email,
  password, Etyme address) stays the way in that never touches a
  provider.
- **The domain rule stands.** A consumer address is a candidate; that
  was right for the address and wrong only because of the account
  mix-up.
- **Setup grows by one step and two fields, every answer still
  defaulted** (this extends "Setup asks five things, then stops" of
  2026-10-07): *Your company* asks the legal and billing address,
  because every bill names them, and a site address per place people
  work, which the days-off calendar hangs on; a new step, **Papers you
  require**, is pre-filled from the shipped default sets for a W2, a
  corp-to-corp worker and a sub-vendor (`lib/document-type`,
  `lib/document-requirements`), so a company sees what it will ask for
  before it asks, and adds or waives with a reason; *Your team* is
  unchanged, invitations already live there. A company-level required
  set is a schema request for the architect (today a set belongs to an
  order or a line); the step writes that, and every order inherits it
  as its floor.
- **Built in this order:** the account chooser first, because it keeps
  the founder out of Tapin today (architect); then the setup fields and
  the papers step (architect, with regulatory for the sets).

**Shipped to production 2026-10-21 (4d7ac5d4f on the deploy branch,
source 23b545d89):** both sign-in doors ask for the account chooser
and the first screen says "Not you? Use another account"; every notice
names who and what; the queue holds the invoice receipts a person owes
a payment on; a worker files their own expense, billable only where
the agreement says; a placed worker reads their own pay line's rate
history from their own seat; the twin's question says who and what; a
week approved by email tells the worker once and never asks a
one-person firm to accept its own; a site has a time zone and a day on
the week can be a local holiday (two nullable columns, pushed on that
deploy). Release pass green on a quiet copy: type check, 11,411 unit,
2,312 of 2,313 integration with the one red (the census page's access
log count) green alone and judged a timing flake of the fire-and-forget
bulk log, build. **Open for the founder:** `DB_PUSH_ON_BUILD` on the
production project was set to 1 for that deploy and could not be set
back to 0 afterwards (the Vercel connection dropped); until it is
flipped, every production deploy reconciles the database to the schema,
which is harmless for additions and must be off before any deploy that
removes a column.

**Shipped to production 2026-10-22 (0c4b50536 on the deploy branch,
source 3a758ca9e):** the document-flow fixes from the walk; the steps
after a flagged background report as rows of their own; who examined a
paper; the I-94 and work-permit papers; an extension that checks every
added day against the person's and the supplier's papers; bills that
stay correct under load and tell the payer in the same save; the
nightly agent run and its approvals under load; one nightly letter per
person; a worker's greeting that says the notices other firms wrote;
jobs with one title told apart and a minute's batch sent as one
notice; and the forwarded-email intake, **closed**: the inbound
address answers 404 and writes nothing until `EMAIL_INTAKE_LIVE=1`,
which waits for the founder's attack walk and his yes on the privacy
and DPA draft (`src/lib/legal/drafts/forwarded-email.md`). Release
pass on a quiet copy: type check clean, unit and integration green
after one test list was brought up to the nightly jobs, build clean;
every "removed" schema line was re-aligned whitespace, nothing dropped.

**The admin's setup is a checklist, every item skippable, and it comes
back until it is done. Decided by the founder, the same day**, after
reading the 2017 code: *"I am glad it's easy, but shouldn't the admin
account be more elaborate, even if it means giving a 'skip for now'
option and asking them to complete onboarding in future?"* The 2017
registration asked four things (type, domain, name, owner) and the
admin then filled, over weeks and from six screens: the company's
profile (legal name, DBA, entity type, established, website, logo,
phone, time zone, currency), its locations with addresses, the people
in charge (owner, HR manager, billing contact, the accounts email),
bank details, company contacts, the firms it already traded with, four
document sets (what it required from candidates, employees, vendors
and customers), the payroll configuration, and domain verification.
The rebuild asks four and stops. So, superseding "Setup asks five
things, then stops" (2026-10-07) in its second half only:
- **Sign-in and "Your company" stay a minute long**, and a company can
  post its first job after them.
- **After that, the Owner or Admin reads one checklist**, each item a
  screen with its defaults filled and a **"Skip for now"**: your company
  (the profile above); addresses (legal, billing, each site); the
  people in charge (owner, HR, billing contact, accounts email, each an
  invitation if they are not seated yet); how you work (week, days off,
  holidays, payroll); papers you require (one set per party it deals
  with: workers, employees, suppliers, customers, from the shipped
  defaults); bank details (for a firm that gets paid, through the same
  Finance verification a supplier walks); your companies (the clients
  and suppliers it already trades with, by name and address, each an
  invitation); your team; your domain (verify it, so colleagues join
  by signing in); integrations (Teams, the accounting export). The
  2017 six screens become these ten items, in the trade's words.
- **A skipped item comes back**: the setup reminder already lists what
  is outstanding (`lib/setup-steps`, `components/setup-reminder`); it
  now carries every item, in the order above, with "complete setup" on
  Today and in the Ask Etyme greeting until the list is empty. Nothing
  nags daily; it is one line that stays.
- **A skipped item refuses only the act that needs it, in a sentence
  that names the step**: no bill without a billing address, no payment
  to a firm without verified bank details, no colleague joining by
  domain until the domain is verified, no I-9 chased for a party whose
  set was never confirmed. Everything else works on the defaults.
- **What is answered is recorded with who and when**, as before.
- **The brief for the whole of it, in the founder's words: "real easy
  but secure and neat."** Easy: one item per screen, every field
  filled with a default, Skip for now on every item, a minute each,
  and the company works before any of it is done. Secure: only the
  Owner and Admin see the checklist; bank details go through the same
  Finance verification a supplier walks and are shown as the bank, the
  account name and four digits; the domain is claimed only by
  verification; every answer carries who and when; nothing in it is
  readable by another company. Neat: one column, the brand kit, the
  home page's density, a short heading and plain fields, no cards of
  explanation, no progress bars with percentages, the trade's words
  (ASD-STE100 at about 80%). The drawing is judged on those three
  words before the build.

## Onboarding is tested as every party and fills itself from what the company already has — decided by the founder, 2026-10-27

*"So test and ease onboarding for every party; fetch from any source of
info."* Walked the same day, as eight strangers on a local copy of the
seeded world (165 screens, timed): every party signs up in about two
minutes and every setup answer has a default, so the doors are easy.
Behind them the trust breaks, and the verdict was "do not ship
onboarding as eased":
- a supplier that signed up and is then approved by a client is
  **founded again** as a second company, and the owner is seated on
  both; a sub-vendor's "Add company" founds a third;
- a client with one person **can never approve a supplier**: the card
  tells her to invite a second person, and tells the second person the
  same, which breaks "an approver nobody has named falls back; it
  never refuses";
- an MSP **cannot be seated from any screen** (the grant is API only),
  and has no way to ask;
- an integrator's W2 import lands its people as **bench consultants**,
  commits through a browser pop-up, and shows machine words;
- a person who signed up herself **can never be asked onto a bench**;
  a solopreneur cannot put her own license on file and is asked to ask
  herself; a sub-vendor cannot record its agreement or the prime's
  order on any screen; "On file" is ticked with no file or verdict
  behind it;
- the ten-item checklist, the addresses and "Papers you require"
  decided on 2026-10-20 and 2026-10-22 **are not built**: setup is still
  four steps, and no seeded firm is reminded of anything.
And the scout found one rule breach: the import's document reader called
the model whenever a key existed, with no per-company switch, no masking
and no log. Fixed first (c6f202d52): an import reads with the model only
where the company turned it on, masked through one shared door in
`lib/model-boundary` (names, firms, rates, emails, phones), every prompt
and answer logged.

**Decided, on the walk, each the coordinator's call and reversible by
the founder in a sentence:**
1. **One firm, one tenant.** A firm already on Etyme is found, never
   founded again: by verified domain, then Etyme address, then an exact
   name whose owner shares the email domain (`findFirm` in
   `lib/company-create`). A claim link taken by somebody seated at a
   firm on the same domain joins that firm; approval attaches to the
   firm that applied; a counterparty already on Etyme is linked, never
   copied.
2. **A one-person client is told which role to invite**, and that
   person can decide on arrival; the recommender still never decides.
3. **An MSP is seated from the client's Settings**, and asks for a seat
   from its own first screen.
4. **A W2 row imports as the firm's own employee**, never a bench
   listing; owners and managers are never "on your payroll" unless the
   work says so.
5. **A firm asks a person who already has an account onto its bench
   with the same yes**, never a second record of her.
6. **The apply form is filled once**: labels that stay, the firm's own
   record pre-filled, and a second client reuses the papers and
   references in one click.
7. **Nothing is "On file" without the file or the verdict**: a vendor
   screening carries the provider, reference and date; a D&B report
   carries the file or its number and date.
8. **Every new party's first greeting names its one next act and the
   link** (recommend a supplier; ask a client for a seat; add your
   people; turn on Your page; record your contract and your papers).

**"Fetch from any source", the rule before any of it is built.** The
setup fills itself from, in this order, and says where each answer came
from so a person corrects it in a word:
- **the work email's domain** (company name, country, currency, the
  Etyme address, the domain claim), already in code for the OAuth door
  and now the password door too;
- **a paper the company uploads** (a W-9 carries the legal name, the
  address and the EIN; a certificate of insurance carries the insurer
  and the dates; a license its number, issuer and expiry): read by
  rules first, by the model only where the company turned it on,
  masked and logged, and every read value shown with the quote it came
  from and confirmed by a person before it is recorded;
- **a file the company already has** (its contractor list, supplier
  list, sites, holidays, purchase orders): the import that exists;
- **the company's own website**, by an address the Owner pastes: a new
  outside read, so it is built only with its guard: https only, no
  redirects followed, no private or link-local address, a size cap, a
  timeout, text only (title, the organization's structured data,
  address and phone), never a page the person did not name, never a
  crawl; what it finds is a suggestion the person confirms.
- **Never a mailbox, never a registry Etyme has no agreement with,
  never a page fetched on the person's behalf without their asking**,
  and nothing read from one company fills another's setup.

**Built in this order:** the trust breaks above, one domain per set of
files, the same day (architect: one tenant, the MSP seat screen, the
import, the sign-up's guesses; demand: the one-person approval, the
apply form, the job form's defaults; supply: the bench ask, the roster,
roll-off without a line; regulatory: the evidence behind "On file", a
firm's own papers, the default paper sets as data; money: the
sub-vendor's agreement and sales order on screen, the Buy tab;
conversation: the invited colleague lands in, every first greeting's
next act, the rescue link where no email can be sent; market: the
footer's Clients). Then the checklist with its fill sources, **drawn
first** (https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq: the ten
items with their state, and Your company, Addresses and Papers you
require open, every answer carrying where it came from)
and built on "build it": the schema for the profile, the addresses and
the company-level paper sets (architect), the screens, the reminder on
every page until the list is empty, and the refusals that name the
step.

**Shipped to production 2026-10-27, evening (5a0eb15e9 on the deploy
branch, source 483e96b34):** the whole onboarding fix wave, every trust
break above closed on the record. One firm, one tenant (`findFirm`,
`claimOrJoin`; the supplier's approval attaches to the firm that signed
up; a counterparty already on Etyme is linked where the two trade and
never copied); a one-person client is told which role to invite and the
invited person decides on arrival; an MSP asks a client for a seat from
its first screen and the client grants one from Settings naming the
role (`ProgramSeatRequest`, additive); an integrator's W2 rows import as
its own employees, the import commits from the page in the trade's
words, and a roll-off can be flagged with no project line
(`ProjectRelease.sellContractId` optional); a firm asks a person who
already has an account onto its bench on her own record, and the
thank-you page offers her own page; the apply form has labels that stay,
is filled from the firm's record, and a second client reuses its papers
in one click; nothing is "On file" without the file or the verdict; a
one-person firm files its own W-9, insurance and license, a worker her
own license, certification or degree with the copy kept on her record
(`VerificationDoc` bytes, `CERTIFICATION`, `DEGREE`); a firm's own
staff are offered for petitions and papers as "on your staff"; a
sub-vendor records its agreement and the prime's order on screen, the
Buy tab shows buy lines, and an order raised by hand asks for its first
line; every new party's first greeting names its one next act; an
invited colleague lands signed in; sign-up stays open with no email
key, the confirmation link kept on the notice for staff (a reset link
never is); the sign-up form guesses the Etyme address, country and
currency; owners and managers are staff, never "on your payroll"; the
band's Clients door is the home page. Release pass on a quiet copy of
6e1825fc3: type check clean, 12,164 unit (the one red the posture's
route count, a docs-only fix after), 2,538 integration, build clean.
Gates: no source difference, no Ruby, brand kit present, the seven
"removed" schema lines re-aligned whitespace and the one column going
nullable. Smoke: every public page and both sign-up forms 200, the
inbound email door 404 to a POST, health names the password door. The
second onboarding walk as the same eight strangers runs on a local
copy of this source and records its verdict under this line.

**The second walk, on the same source, said: six of eight parties
eased, two still blocked.** Eased: the client (address, country and
currency guessed; the first act named; the invited Program Manager
decides on arrival), the bench vendor, the integrator (W2s on the
roster, a roll-off flagged with no line), the MSP (asks, is granted,
reads the program), the worker (her page, her papers, a bench ask on
her own record), the one-person firm (her own papers). Mostly eased:
the prime supplier (first apply 23 fields; the second client one click).
Blocked: **a prime and its sub-vendor cannot link**: "one firm, one
tenant" stopped the copy, and each side is now told to ask the other
to add it, with no door that does; so the sub-vendor's agreement and
order pickers stay empty. And **an invited colleague lands on "Select
a conversation"**, not her welcome, and the welcome contradicts the
line above it. Three coordinator's calls, reversible in a sentence:
(1) **two firms already on Etyme link by a request one side sends and
the other accepts in one click**, the way a seat is asked and granted;
the request names the relationship (your client / your sub-vendor);
nothing is recorded until the other side's yes; a vendor adding its own
sub-vendor checks the sub-vendor's papers (W-9, insurance, good
standing, the agreement) and never walks a client's four roles.
(2) **An outside firm is never granted a client's Owner role** on a
seat. (3) **A worker may name a client not yet on Etyme**, as text,
matched the day that company joins. The rest of the walk's list is
wording and wrong doors, routed with the three.

**Shipped to production 2026-10-27, night (42085f3b1 on the deploy
branch, source aa890b891):** the second wave. Two firms already on
Etyme link by one ask and one yes (`TradeLinkRequest`,
`POST /api/trade-links`; a yes writes the counterparty record on both
sides in one transaction; "Add company" for a firm on Etyme offers
"Ask them to link"); a firm never lists itself among its companies; a
vendor adding its own sub-vendor checks its papers (W-9, insurance,
good standing, the agreement) by one person and never walks a client's
four roles; a second client's apply form carries every answer the firm
gave the first, dates included, and HR confirms the supplier's dates
rather than re-typing them; an order raised by hand, by either end,
asks for its first line, and a buy line goes only on an open order
this firm raised to the firm it pays; with nobody to record an
agreement with, the form says to link first; an invited colleague
lands in Ask Etyme itself with her welcome first, and "nothing waits"
is said only when nothing does; every first-act link opens the screen
that does the act; a bench vendor's first act is its bench; an
invitation never claims an email went when none could and never hands
out a sign-in address the person cannot use; a one-person firm's
paperwork speaks to her as the firm; an outside firm's seat never
holds the Owner, the Approver, a role that grants seats or one that
signs hours (regulatory's rule, read from permissions); a worker names
a client not yet on Etyme and it is honored the day exactly one
company of that name joins (`DoNotSubmit.companyName`); the Pay column
never shows a bill rate; a bench invitation's link is kept on the
notice for staff where no email can leave; a pending firm reads the
day it was recommended and one name for its step. Release pass on a
quiet copy of aa890b891, fully green: type check, 12,187 unit, 2,547
integration, build. Gates: no source difference, no Ruby, brand kit
present, the seven "removed" schema lines re-aligned whitespace and
one column going nullable. Smoke: every public page and both sign-up
forms 200, the inbound email door 404 to a POST. Still waiting on
"build it": the setup checklist with its fill sources
(https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq) and the four doors'
maps.

## Tapin gets agents, not a website — "Go", the founder, 2026-10-29

The founder asked whether Tapin should have a public website of its own
to attract clients and candidates, or whether to build agents first to
transact and let firms host a website elsewhere. Tested against the five
questions, the website scored on nothing but micro-distribution and the
agents on the core problem (a recruiter's day lost to handoffs), credit
(a signed week that moves itself is what a lender can advance against)
and the one number (acts per day). **Decided: agents first, and the
generated company page is the website.** Every company already has a
public page at `/site/<slug>`, read from its own record (what it does,
who is coming free, the positions it works, an ask box into Ask Etyme),
and it fills itself the moment Tapin's people are on its bench. No
separate marketing site, blog, SEO pages or careers portal; a firm that
wants those hosts them anywhere and links to its Etyme page. Built in
this order, on "Go":
1. **Tapin's week on Etyme**, walked on screens on a local copy as a
   supplier signing up fresh: people onto the bench by their yes, the
   first prime linked by one ask and one yes, papers filed, a job
   answered, a week filed and signed, the bill drafted. Every gap is
   the roadmap (release).
2. **The supplier-side agents**: the twin's acts turned toward a
   supplier, each a new act kind in the role contract first with its
   tier (architect), then a card in the supplier's Ask Etyme
   (conversation): put a matching bench person forward to a job the
   firm was sent; ask a person for the papers a start needs; draft the
   bill the day the week is signed (exists); ask for a renewal before a
   paper lapses (exists); tell the recruiter who is coming free and who
   is idle. Yes and Not now, through the one approval route; NEVER
   floor unchanged.
3. **"Join the bench" on the generated page**: one door for a candidate
   into the bench ask that already exists, never a second record of
   them (market, on the public page; supply's bench ask unchanged).
4. **`tapin.etyme.com` opens Tapin's generated page**, and a firm's own
   domain later: a host mapping, not a site (architect).

**Built and shipped to production the same day (b0881c5a6 on the deploy
branch, source f0e939f76).** The supplier's three act kinds in the role
contract (`bench.put_forward`, needs a yes from the seat holding
`submissions.create` and never the Owner where another seat holds it,
performed through `POST /api/submissions` itself so consent, the time
limit, licenses and the band are the route's own, a yes with no rate
refused, a yes from Teams sent to the web; `papers.ask_for_start`, acts
alone through regulatory's clearance ask where `mayChasePaper` says the
set is confirmed; `bench.coming_free`, acts alone, one summary a week
by name to the seats that submit, nothing outside the firm), the
supplier's default contract listing all five with `bill.draft` and
`bill.send`, the nightly run raising them for every supplier-kind firm
(`runSupplierActs` after `runSupplierBills`), every entry ledgered under
the Owner's role and the supplier's twin named in the access log; the
three cards in the supplier's Ask Etyme (the why on tap, a rate box,
`NEEDS_RATE` and `PUT_FORWARD_SIGNED_IN` reused from the performers,
the start ask as "Ask Etyme asked <person> for <papers>", the refused
ask carrying the gate's sentence with the link to setup, coming free as
one line of names never counted in the mark); "Join the bench" on a
staffing or bench firm's generated page, the yes from the invitation
letter and never on the page, one reply on every path, a cap per page
per hour, through supply's one function `askOntoBench` in
`lib/consultant-portfolio/bench-ask` that Add consultant calls too, the
public lookup logged as `PUBLIC_PAGE_ADDRESS_LOOKUP` with no actor
before the reply; the do-not-return picker reading the bench listing;
a corp-to-corp worker about to start chased against her own set; and
a firm's Etyme address on `<slug>.etyme.com` opening `/site/<slug>`
through the middleware (the app's own pages sent to the main host, a
stranger's subdomain the home page) once `*.etyme.com` points at the
deployment, which is the founder's DNS line. Coordinator's calls on the
way, each reversible in a sentence: a brand-new person asked onto a
bench no longer gets a seat at the firm before their yes (the
2026-10-22 rule applied to both doors); no Owner-only exception for
putting somebody forward (a firm where only the Owner submits is told
to put them forward from the job's page); the twin offers only
existing matches of 70 or more with confidence above LOW, at most three
people per job per night; coming free goes out once a week; no
role-contract rows are seeded, so the shipped default reaches every
firm. Release pass on a quiet copy of 107ba513b: type check clean,
12,358 of 12,359 unit (the one red the posture's route count, fixed in
f0e939f76), 2,592 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
every public page and the four doors 200, `/site/tapin` 200 on
production, the inbound email door 404 to a POST. **Open:** the
founder's DNS line for `*.etyme.com`; the setup page has no address for
a single item, so the refused start ask links to the checklist, not
to Papers you require; the start-papers line reaches only seats that
get HR's notice; the Tapin walk on screens records its verdict under
this line.

## The setup checklist and the four doors' maps are built — "Build it", the founder, 2026-10-28

"Build it", on the two drawings waiting since 2026-10-27: the setup
checklist with its fill sources
(https://claude.ai/artifact/1DGk7epPUy76NzXsWV1hQq, eleven items now,
Sites after Addresses) and the four doors' maps (MSPs
https://claude.ai/artifact/CPJviSYK5Uws6bFXLkMgL7, Integrators
https://claude.ai/artifact/AYzwwuCAYXSHj9KS5FosgT, Suppliers
https://claude.ai/artifact/3teoAA3AMXxo1d6GSYpfGq, Workers
https://claude.ai/artifact/6LHDsk2pMnj1aPBNMZCKT8). Read as both,
because both were listed under "waiting on your build it" in the same
line; the checklist first. Built in this order: the checklist's schema
(the company profile, the legal and billing addresses, the people in
charge, the company-level paper sets) and its screens, the reminder on
every page until the list is empty, and the refusals that name the
step (architect, with regulatory for the paper sets as data); the
Integrators, Suppliers and Workers maps from their drawings, every
figure read from the seed (market), the MSP map after the architect
seeds Aptiva's three missing seats. A release pass, then production.

**Built and shipped to production the same day (957f5f38b on the
deploy branch, source 2d68a5de9).** The checklist: `SetupItem`,
`SetupAnswer` (source DOMAIN · PAPER · IMPORT · WEBSITE · PERSON, with
the quote), `CompanyAddress`, `CompanyInCharge`, the profile columns on
`Company`, `RemitTo.accountName` and the Finance check (who, when, for
which client; only the last four digits ever stored), a company-level
paper set per party as every line's floor; `/dashboard/settings/setup`
with the eleven items, Owner and Admin only, each skippable with the
line saying what skipping stops; a W-9 or insurance certificate read by
rules first and by the model only where the company turned it on, every
value shown with its quote and confirmed before it is recorded; the
reminder on Today and one line in the Owner's Ask Etyme greeting
("Finish setting up: your company, addresses, your sites and 8 more.
Complete setup"), never counted in the mark. The gates in
`lib/setup-gates`, each wired: no bill sent without a billing address
(route, Today, chat, twin); no firm paid until its bank is checked
(payment, receipt page, payment run, the twin's question); no paper
chased for a party whose set was never confirmed (the dated chase, the
never-filed and cover letters, the cover re-ask, the license renewal),
with what was held back named in the night's report; a colleague joins
by domain only once the domain is verified. Finance holding the
supplier walk's bank item records who checked the bank and for which
client; a bank change clears the check everywhere it is written
(`bankChange` in `lib/money/remit-change`). The four doors' maps, each
in its party's roles, every name and figure read from the seed or live
through `door-map-facts` under `mayReadLive` (only the seed's own
firms, at reserved addresses; anything else reads "on the demo").
Coordinator's calls on the way, each reversible in a sentence: the
paper sets use regulatory's four parties (W2 workers, corp-to-corp,
sub-vendors, customers); a client is never asked for bank details and
a one-person firm gets no team, sites, people in charge or domain item;
"Your people" (the import) stays on `/start` and leaves the checklist;
every seeded firm that bills gets an address and checked payment
details, so no seeded bill or payment is refused; `PAPER_CHASE_WITHHELD`
is planned (L0) until regulatory writes it; the MSP door's Supplier
manager and Coordinator tabs open Rashida Coleman's seat and say so,
because the demo has no key for those two roles; "Read from our
website", the logo upload and a scanned paper are not built. Release
pass on a quiet copy of c0cef3357: type check clean, 12,312 of 12,315
unit (the three reds a hand-formatted date, a phone grid and a link to
a missing page, fixed in 2d68a5de9 and re-run green with the type check
and the build), 2,592 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, every "removed" schema line
re-aligned whitespace and one unique key widened. Smoke: every public
page and all four doors 200, the inbound email door 404 to a POST.
**Open:** Halcyon's 12-day cover at Cavanaugh is dead seed data (the
chain writes 200 days first); the people in charge are read by no
screen but setup; the walk as every party on the new setup runs next.

## Sites — where people work, who hires there, and which suppliers fill jobs there — decided by the founder, 2026-10-28

The founder: *"Are you also setting up branch offices … Branch offices
with plants where hirings and placements from suppliers can happen."*
Then "Build it, sites sounds good" on the drawing
(https://claude.ai/artifact/HqTdsPPMNSwxKyUjp2ynur), drawn as Corvane
Packaging from the seed. The word is **Sites** on every screen (a plant,
a branch office, a warehouse, a hospital are all sites); "plants" is a
buyer's word in manufacturing and is not a screen word.

- **A site is where a contractor works**, and it already exists
  (`CompanyLocation`: country, time zone, region). What is new: **a job
  request names its site by id**, never as free text; **a site names
  which approved suppliers may fill jobs there** (a supplier is approved
  for the company first, by Procurement, then named at sites; a job at a
  site goes to that site's suppliers by default, and a supplier not
  approved at the site is refused in a sentence that says to ask
  Procurement); and **a site names its hiring managers**, read from the
  jobs they posted where nobody typed it.
- **The placement inherits the job's site**, so its week follows the
  site's days off and time zone, the regional manager sees it under her
  region, and the time limit still counts the person's days at the
  company across every site.
- **One screen, Settings → Sites**, in the drawing's shape: every site
  grouped by region with its regional manager, country, time zone,
  hiring managers, suppliers and contractors; one site open with its
  address, days off, managers and the supplier ticks; every answer
  saying where it came from (the contractor list import, the company's
  website by the guarded read, a person). It is also the **Sites item
  of the setup checklist**, the eleventh, after Addresses, and until the
  checklist is built it is a line on the setup reminder.
- **Skipping stops one thing only:** a job with no site is posted at the
  primary site and goes to every approved supplier, and says so.
- **Refused:** a site named by a supplier or a seated MSP; a regional
  manager editing a site outside her region; a site deleted while a
  placement is at it.
- **Not built, on purpose:** the legal-entity layer per branch (own
  currency, tax registration, bank), which waits for a client that bills
  from two entities, per "One tenant is one domain name".
- **Built in this order:** the schema and the Sites screen (architect,
  with Corvane's per-site suppliers and managers in the seed); the job
  form's site and supplier defaults, the distribute refusal and the
  placement's site (demand); the words on the map and the documentation
  (market). A release pass, then production.
- **Built, the first piece, 2026-10-28 (architect, 2ed499317 and
  54fdd1d44).** `Requirement.locationId`, `SiteSupplier`,
  `SiteHiringManager`, and `source` (IMPORT · WEBSITE · PERSON) with who
  and when on every site; Settings → Sites in the drawing's shape;
  `jobSiteDefaults` and `checkSiteSupplier` in `lib/sites` for every
  reader; the Sites step in setup after Your company, skippable, with
  the line saying what skipping stops; Corvane's plants name their
  suppliers and each client names its approved suppliers at its primary
  site. Four coordinator's calls made on the way, each reversible in a
  sentence: a site that names no supplier reads as every approved
  supplier, so a client that never opens Sites is not blocked; a site's
  hiring managers are read from the jobs posted there first, and the
  join row is only for somebody with nothing at the site yet; the
  source is recorded once per site, not per field ("Guessed from the
  state" is not built); and a supplier claimed from a client's
  invitation now opens setup at Sites, then its week and payroll (this
  moves the 2026-10-07 line that opened it at How you work). "Read
  sites from our website" is left out until the guarded website read
  exists. The `seed-step-size` test sits on its 350-query line at the
  rate-change step with or without this change; cutting that step is
  architect's.
- **Built, the rest, the same night (demand 27491ce86 and 3f2550d36,
  architect e1f7e9934 and f9c94f5b5, market b5b178cd2, e6457ecc2 and
  1d7b44089, conversation 53442be64).** The job form opens on the
  primary site with "Your site. Days off, the time limit and the pay
  currency follow it."; "Send the job to" ticks the site's suppliers,
  each "approved at Dayton", with the sentence under them; a firm not
  approved at the site is refused on the raise and on distribute; the
  award writes the placement's site from the job; "Who applied" shows
  "supplier · Dayton, Ohio"; a seat in a client's program posts at the
  client's sites, a region seat at its region's; **a hiring manager's
  ticks are kept** (`Requirement.sendToSupplierIds`, who and when) and
  the job goes only to the ones left when it clears by rule or on the
  last yes, each firm checked again that day; every release panel
  offers only the site's suppliers. By region, the region rollup, Ask
  Etyme's region answers and the home page map's headings all say
  "site"; Corvane's own sentences about its plants stay. Two
  coordinator's calls on the way, each reversible by the founder in a
  sentence: **a hiring manager's ticks send the job**, narrowed only,
  though that role never chose who sees a job before, because whoever
  named the site's suppliers under Settings → Sites already made the
  choice (**confirmed by the founder, 2026-10-28: "Keep it"**; this
  qualifies station 2 of Phase 1, "a hiring manager cannot": the
  manager may remove names from the site's list and never add one); and **a job raised with no ticks or no site** (imports, older
  callers, the simulation) goes where it went before. Known gap:
  unticking every supplier saves an empty list, which reads as the
  site's default. Still on the free-text `location`: the matching
  checks, the consent text, the edit form and parse (demand); the
  match engine, internal moves and the bench routes (supply);
  `seed-standing` (architect), each reading the site's name the raise
  writes there.
- **Shipped to production 2026-10-28 (8ec26a51f on the deploy branch,
  source 428307d9d).** Release pass on a quiet copy of 53442be64: type
  check clean, 12,222 of 12,224 unit (the two reds the posture's route
  count and the new `sites` folder under requisitions read as a job id,
  both fixed in 428307d9d and green), 2,563 of 2,565 integration (the
  two reds, the payroll and week settings seat tests, "No Context
  found", green alone and judged a seat collision under the full run),
  build clean. Gates: no source difference, no Ruby, brand kit present,
  the three "removed" schema lines re-aligned whitespace. Smoke: every
  public page 200, the inbound email door 404 to a POST. Production's
  world still has no Corvane, so Settings → Sites there shows each
  seeded client's primary site with its approved suppliers; the walk as
  Corvane's owner, a regional manager and Marcus Hollins runs on a
  local copy and records its verdict under this line.

## Business email reaches Etyme only when the company forwards it, and security beats everything — decided by the founder, 2026-10-22

The founder: *"Can you integrate user business email, like Muse, and
capture relevant information to contracts, and not every information in
their inbox — jobs, submissions, contracts, timesheets, payments,
payroll and AR revenues."* Then, on the answer: *"As long as security
is taken care of — security beats everything."* So it is built, and a
security rule outranks every convenience in it:

- **Etyme never reads a mailbox.** No Gmail or Outlook mail permission
  is asked for. Each company gets one forwarding address on a
  subdomain of its own (`<company>-<random>@in.etyme.com`), and the
  company's own mail rule forwards only what it chooses. What is never
  forwarded is never seen.
- **Off by default.** The Owner or Admin turns it on; the address is
  random, shown once, and can be replaced, which kills the old one.
- **Only real mail from the company's own people is accepted.** The
  forwarder must be a seated person at that company, and the message
  must pass SPF and DKIM for the forwarder's domain. Anything else is
  dropped, logged with the reason, and never shown.
- **Email is data, never an instruction.** The body is turned to plain
  text, links are never followed, HTML is never rendered, and nothing in
  an email can trigger an act. Rules read it first; the model reads it
  only where the company turned the model on, masked, and fills fixed
  fields only.
- **Attachments are held, not trusted.** Allowed types only (PDF,
  image, Word, spreadsheet, CSV), a size cap, never opened on the
  server beyond reading text, and stored the way every paper's file is.
- **Nothing becomes a record without a person's yes.** Each email
  becomes a draft card in Ask Etyme for the seat that holds the
  permission, Yes and Not now, through the one approval route: a job
  request, a candidate waiting for the person's own consent, an
  agreement or order to examine, approval evidence on a week, an
  invoice receipt for the three-way check, a remittance against a bill,
  a payroll confirmation on its run.
- **Kept only what is used.** The attachment is kept when it is filed
  as evidence; the body is deleted once the card is decided, and after
  30 days if nobody decides. Every email in and every drop is logged;
  "what came in and what was kept" is a query for the company.
- **One company, one address.** An address maps to exactly one
  company; nothing crosses tenants.
- **It ships after it is attacked.** The release walk tries a forged
  sender, a mail from a stranger, an email that tells Etyme to do
  something, an oversized and a wrong-typed attachment, and an address
  aimed at another company, and each must be refused, before the
  privacy notice and DPA name forwarded email and it goes to
  production.

**Built in this order:** the secure intake first — the address, the
checks, the hold, the log, the switch (architect); the privacy notice
and DPA line (regulatory); then the cards (conversation) and each kind
of email's draft by the agent that owns its record (demand, money,
regulatory). The setup screen is drawn before it is built.

## Nine links, no flip, and every first screen names a person — decided by the founder, 2026-10-19

"Build it", on the drawing of every party's first screen and every
public page (https://claude.ai/artifact/A91ZWwSnKqEgD5DyxotzcN), after
his two observations: *"Practically the dashboard switch button seems to
have no value as everything viewable on left navigation"* and *"left
navigation is also exhaustive … [it] will scare anyone from our app …
the UI should be so easy and the UX too."* Three decisions, each the
home page's rule ("The chaos is between people") carried into the app.

**1. Nine links, and a process step is a tab, not a menu entry.** The
menu table carried 133 labels; a supplier's owner read about forty. A
menu entry is now a noun on the person's desk, and everything that was
a neighbor becomes a tab inside that noun's page. The four nouns are the
home page's own: Jobs, Candidates, Timesheets and the money document.

| Party | The nine | Folded inside them, as tabs |
|---|---|---|
| Client | Ask Etyme · Today · Jobs · Candidates · Timesheets · Invoice receipts · Contractors · Suppliers · Settings | Conversations → Ask Etyme. Submissions, Interviews → Candidates. Expenses → Timesheets. AP, Budget → Invoice receipts. Ending soon, Past contractors, Tenure → Contractors. Contacts, Agreements → Suppliers. Program team, Org view, Document requests, Governance → Settings. |
| Supplier, integrator, MSP | Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · People · Companies · Settings | Conversations → Ask Etyme. Leads, Shared with you → Jobs. Interviews → Candidates. Expenses, Rolloff → Timesheets. Invoice receipts, AR, AP, Payroll → Bills. Bench, Bench pay, Check-ins, Training, Consultants → People. Clients, Suppliers, Contacts, Contracts, POs → Companies. Paperwork, Governance, Team → Settings; Reports → Today. |
| One-person firm | Ask Etyme · Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Seven: she has no jobs or candidates. |
| Worker | Ask Etyme · Your work · Your page · Your paperwork · Your data | Already five. Unchanged; a worker who also holds a seat at a firm finds its Conversations inside Ask Etyme. |

Nothing behind the menu is deleted: every page keeps its address,
search still finds it, and every link in a card or a table still lands
on it. The menu stops listing them, and each page gains the tabs that
were its neighbors. The eyebrows follow the nine (`lib/page-framing`),
and the door that decides what a desk-less seat may open is derived
from the pages and their tabs, not from the menu's entries, so folding
a link opens nothing and closes nothing. The section table under
"Navigation per company type" is replaced by this one, and
`sidebar-nav.test.ts` reads this one.

**1b. Ask Etyme and Conversations are one entry.** Decided by the
founder the same day (*"Can Ask Etyme and Conversations be clubbed?"*).
They were two menu entries for one screen: Ask Etyme pinned at the top,
and Conversations under Today, opening the same page with Ask Etyme as
its first row. The Conversations entry leaves every menu. Ask Etyme is
the one door; the other threads stay in the left column beside the chat
on a desktop and behind a back arrow on the phone; and when another
company writes to this seat, the greeting says so in a sentence with a
link ("Brightmoor Staffing wrote to you about the HCM integration lead
job."), so a person who never opens the list misses nothing. The count
on the mark already covers both.

**1c. The public header is the logo and Sign in; the menu is the
footer.** Decided by the founder the same day (*"even the menu has very
[little] value, it can be on the footer"*). The menu icon of 2026-10-14
and the sheet behind it leave every public page. The one-row footer
carries what the sheet carried: Clients · MSPs · Integrators · Suppliers
· Workers · Demo · Documentation · About · Security · Privacy · Terms ·
DPA · Contact. The four steps are reached through Documentation; Sign up
stays in the band.

**2. The flip is gone.** On a desktop the sidebar is always open and
Today is its second entry, so the flip was a second door to a page an
inch away. On the phone the header is the logo, the Ask Etyme mark with
its number (opening the chat) and the menu icon (opening the nine). On a
desktop the header is the logo and search. The decision of 2026-10-13
that put the mark where the bell was stands; the flip of the same
evening is reversed by this one.

**3. Every first screen names a person and the step in front of them.**
Read against eleven live seats on production. One rule for the greeting
of every party, built from the drawing:
- **Names, not counts.** "Two things need you: Ingrid Sørensen's start,
  and Teleworld's missing agreement." Never "Two things need you; open
  the list." The list link stays at the end of the line.
- **Every decision in the count is a card** in the chat, Yes and Not
  now, in the trade's words, through the one approval route. Today only
  the twin's own questions are cards.
- **"Since you last looked" says who and what.** "Marcus Oyelaran has
  five weeks to approve by Wednesday." Never "Hours to approve — in 3
  days (5 times)."
- **The closing line and the four chips are the party's own.** A
  supplier asks which weeks are signed and not billed, which bills are
  unpaid, who is on the bench, who applied; never "Who is near the time
  limit?" A one-person firm is never told "Ask me anything about the
  program."
- **Money and the week before paperwork** that does not stop the work.
  A worker's first screen opens on her week and her pay, not on two
  upload buttons.
- **The Today headline is one sentence with the names in it.** The six
  figures stay; the paragraph under them becomes one line under the
  figure it explains.
- **Machine talk leaves every first screen:** "0.03 good submissions a
  day, per job · target 5", "Cost per submission: free", the system
  activity log (it lives on the ledger page), "Event created",
  "12:00 AM", "Etyme asked on your authority", and the "QA test message
  — please ignore" thread in the demo. A firm's Today page reads what a
  firm asks on a Tuesday: billing this month, signed and not yet billed,
  rolling off in 30 days, on the bench, each with the names.
- **A seat in another company's program sees only that program** on its
  program page: an MSP's own book never appears on the client's page.

**And the public pages speak as the party's own person.** The home
page's panel (https://claude.ai/artifact/X4CBNEAHcEE1dnQB8gdHuw, drawn
the same day) names the person in front of each step — Marcus Oyelaran,
Helena Marsh, Renata Kowal — and opens on the headline's own question.
The product pages inherit it once, because they share the panel. The
Suppliers, Integrators and Workers doors stop playing Northbend's
program manager and play their own named person from the seed, at the
step that party acts on: Marisa Delacroix at Brightmoor, Bhavesh at
Techpeple, Linnea Qadri on Techpeple's bench, Sunil Raghavan at
Teleworld, Helena Marsh, Colleen Byrne. The line under every panel
names them. Reference pages keep their shape; the documentation flow
chart's role pills wrap instead of cutting a role short. Every name and
figure in a panel is still read against the seed by the story-panel
test.

Two faults found by the walk, not design: the AP clerk's first screen
sat on "Reading the record…" for several seconds on production; the
documentation flow chart truncates role names on a desktop.

**Built in this order**, one domain at a time: the nine links and the
flip (architect); the greeting rule for every party (conversation); the
firm's Today page (architect, with money for the figures); the public
panels and doors (market). A release pass before each deploy.

**Built and shipped the same day** (production a60753b0d, seventeen
commits, release pass green: 11,166 unit, 2,264 integration, build).
Six domains built at once on disjoint files and nothing collided. What
was decided on the way, each the coordinator's call and reversible in a
sentence: an MSP reads eight links, because it has no People of its
own; the worker's menu is Ask Etyme plus her five pages; the phone
header uses the chat bubble for Ask Etyme so two Etyme marks do not sit
side by side; the desktop header keeps "+ New" and the account menu,
which holds the only sign-out; the firm's Today page is served by one
new route (`/api/today`) that logs every person it names; "an I-9", not
"her I-9", because the record stores no pronouns; "Etyme asked Renata",
not "asked her", for the same reason. Two faults the walk found and did
not fix, each with its owner: the bill generator loads only running
placements, so a signed week on a placement that has since ended can
never be billed (Karthik Menon's fourteen weeks, about $72,000; money's
next piece); and the "QA test message — please ignore" thread in the
demo is production data, not seed, and there is no staff route to
delete a thread. The home panel's "across every supplier" answer is
$135,200 for all seven contractors, the seed's figure, not the $60,000
the drawing showed for three of them. Still owed: the queue's own
titles ("Rolloff in 18d", "40h", "3d") are reworded on the Today page
and not yet at their source (demand); the decisions read runs about
twenty-six queries in a row and the mark polls it every minute (demand,
architect); an MSP's questions in Ask Etyme still read its own book
while seated in a client's program (conversation).

## Every transaction is simulated end to end, and agents close them without asking — decided by the founder, 2026-10-20

*"Post and simulate transactions in every step from job posting to
approval to submissions to matching to interviewing and hiring to
contract on buy and sell sides for all parties, timesheets submission,
approval, expenses submission and approval and billing and payroll or
vendor payments — load test with hundreds of simulated transactions.
Don't ask for my approvals — let agents talk to each other, harness,
learn like humans do and close transactions like in the real world."*

What this changes, and the shape it takes:

- **A simulation harness drives the real routes, as each party's seat.**
  Never rows written into tables: a hiring manager posts a job through
  `POST /api/requisitions`, HR and Procurement clear it through the
  approval routes, suppliers submit through `POST /api/submissions`
  with the person's consent on a bench listing, the worker files the
  week through the worker's own route, the client signs it, each rung
  accepts, bills are generated and sent, invoice receipts recorded,
  the three-way check run, the AP clerk pays, payroll runs. Every
  actor is a seeded seat opened through the demo door, so the same
  rules, refusals and logs apply as to a person. The harness lives in
  `scripts/simulate/` and runs against a local build on a fresh copy of
  the seeded world template (`__integration__/templates.ts`).
- **Hundreds of placements, in parallel, with timings.** Across the
  three seeded clients and every seeded supplier and sub-vendor, a
  year of weeks each. The run reports what closed at every station,
  what refused and why, and how long each route took under load. That
  is the load test; a route that falls over under two hundred
  concurrent weeks is a fault with an owner.
- **A refusal is a lesson, not a stop.** When a rule refuses an actor
  (a missing I-9, a supplier not cleared, a week over the line), the
  harness records the sentence and the owning domain decides: the
  actor was wrong and learns (files the I-9 first, asks Procurement to
  clear the firm), or the rule was wrong and is fixed. Either way the
  run goes again. The founder is not asked; every change is reversible
  in a sentence and recorded here.
- **The new test files the testing budget held back are now allowed
  for this:** the simulation itself, and the screen-by-screen walk that
  opens every link and tab of every seat against the simulated world,
  asserts every figure on a screen against its own API, and keeps a
  screenshot per page to diff against the last run.
- **Built in this order**, one domain per set of files: the harness,
  the actors and the report (architect); the job-to-award stage
  (demand); bench, consent and matching (supply); paperwork and the
  start (regulatory); weeks, expenses, bills, receipts, payments and
  payroll (money); the notices between parties as the handoffs
  (conversation). Then one full run, a release pass and the report.
- **What the seed becomes:** the simulation's closing state is a
  world of thousands of real transactions made the way people make
  them, and that is what the demo shows. The hand-written seed stays as
  the day-one world the simulation starts from.

**The harness is built, 2026-10-20 (architect).** `npm run simulate --
--placements 200 --weeks 12` copies today's world template to
`etyme_sim_<stamp>`, builds the app into `.next-sim` when anything
changed (never `.next`, which somebody's `next dev` may be writing),
starts it on a free port, runs the stations, stops it by its pid, and
writes `reports/simulation-<stamp>.md` with the JSON ledger beside it.
What a station author needs to know:
- **A station is one file in its owner's folder**,
  `scripts/simulate/stages/<domain>/<station>.ts`, and `stage.ts` says
  what it is handed: the seats (`ctx.cast`), the facts earlier stations
  made (`ctx.world`), the run's flags, `ctx.parallel` and
  `ctx.expectRefusal`. `stages/demand/post-jobs.ts` is the worked
  example. Every other station is a stub that says whose it is.
- **Every seat opens through the demo door.** A worker or a firm's
  role the demo page has no door for gets the same signed session the
  door would set, keyed `worker/` or `staff/`, never a row.
- **Reading is allowed, writing is impossible.** `ctx.read` connects as
  a database role that can only select, in read-only transactions.
- **There is no clock override.** "Today" is the real day; a station
  works in real weeks, and the nightly jobs run when a station calls
  `ctx.cast.cron('<name>')`.
- **Nothing leaves the machine.** The server is started without the
  email, model and Teams keys.

**The first full run, 2026-10-20, after one fix wave.** A hundred
jobs and twelve weeks, from an isolated copy of 10220d0a7, every one of
the twenty stations: 87 of 100 jobs published themselves within plan
and 13 were approved by the people they were routed to; 269 people put
forward, 534 matches, 180 interview rounds booked with all three sides,
80 awarded (the one refusal a time limit, correctly); 83 of 83 started,
56 of them refused first and learning (an I-9 filed, a certificate
sent); 168 weeks filed by the workers, 163 signed by the client (23 by
email evidence, 5 left waiting on purpose), 161 accepted by every rung
below; 9 expenses accepted up the chain; 66 bills landed as invoice
receipts and passed the three-way check, 2 keyed-in ones held over the
hours and one waived with a reason; 71 paid; 39 pay periods worked out
before they were paid. No server error on any route; every route's
95th percentile under a second except the nightly twin run at 8.8
seconds (architect). The handoffs station read 260 seats: 659 of 757
handoffs told by a notice, the mark matching the greeting on every
seat, no notice sent twice word for word; what was still wrong was the
approve-by-email path saying "Timesheet approved" without the week and
the twin's question title saying nothing about what, both fixed in the
wave after. What the fix wave itself changed, so it is not re-derived:
a person on a placement, a submission or a bench listing with no seat
anywhere gets their own company-less seat on first sign-in; the seeded
plans let most jobs publish themselves; payroll cannot be processed
before it is worked out; a worker files their own expense; every
notice names who and what; the queue holds the invoice receipts a
person owes a payment on; the award reads its facts at once.

**The world is built to the founder's scale next. Set by the founder,
2026-10-20:** *"10 clients, 10 system integrators, 5 MSPs, 100 prime
vendors and sub vendors and bench vendors and at least 2000 candidates
— freshers to very experienced, moving from bench to self-employed,
some looking for a job while employed, some experienced in different
industries and domains."* The hand-written world is 7 clients, 2
integrators, 2 MSPs, 16 suppliers, one one-person firm and 145 people,
so the simulation so far is a correctness run with timings, not a load
test at the scale the founder means. Decided, on his "don't ask for my
approvals": a generated world at that scale, in its own folder
(`lib/seed-scale`), built one domain at a time — the firm frame, seats,
agreements and who trades with whom (architect); two thousand people
with careers and papers in every state (supply, regulatory); jobs and
rate cards across industries (demand, money) — and the simulation run
on it, locally for correctness and then against a preview deployment
with its own database for the real numbers, because timings from a
four-core container say nothing about the hosted platform. Nothing in
the core may assume IT: the world carries healthcare, manufacturing
and finance beside it, per "horizontal, never vertical".

**Nine decisions for the generated world, made by the coordinator on
the scout's brief, 2026-10-20, each reversible in a sentence:** it is
a separate sealed template (`etyme_tpl_scale_<day>`), built in the same
call and keyed to the same day as the base template, because 199
integration files copy the base and assert its shape; a client's panel
holds six to twelve suppliers and an MSP runs five of the ten clients;
ended careers carry no cycles; the generated live placements get the
order header through money's existing function and no ledger; every
generated person's address ends `.scale.invalid` and the four base
reads that sweep reserved suffixes exclude it, with generated ids
sorting after the base world's; `demo-volume` and `seed-world` export
their random and anchor helpers; `createCompany` takes an optional
`createdAt`; the folder gets its matrix row and its domain entries in
the first commit (`lib/seed-scale` platform, `/people` supply,
`/papers` regulatory, `/jobs` demand, `/rates` money); and the
generator may have one test file, because it is the simulation's own
world and the 2026-10-20 decision admits the simulation's tests: every
generated firm holds the roles the simulation looks for, a second
seeding writes nothing, no two people at one firm share a name, no
skill is under four letters, every job's skills come from its
industry's list, every person opens as a seat. Prime, sub-vendor and
bench are positions, not a kind: `supplierPosture` is written
explicitly, which no seed has done before, so every screen that reads
it meets a value for the first time.

**Ten thousand documents through the real routes. Set by the founder,
2026-10-20:** *"Exchange 10000 documents like insurance, W-9, NCA
during submissions and screening and background checks."* So the
simulation gains a documents station (regulatory): on a supplier's
first submission to a client it sends what a supplier owes (W-9,
certificates of insurance, good standing, the signed NDA and NCA, the
MSA where none stands); at screening the candidate sends what a
candidate owes from their own page (résumé, ID, the I-9 completed from
a named document, education, the consent and identifiers for a
background check, never the report) and HR examines each; the
background-check package goes out and the provider's verdict comes
back verbatim with name, reference and date. Every file is a real
small file through the real upload routes, every ask tells the person,
every refusal is a lesson, and the report counts documents by kind and
bytes stored, with the paper routes' timings under that load. The
station runs unchanged on the generated world.

**Ten thousand documents moved, 2026-10-21 (regulatory, 9ea70513d).**
One run at 520 placements and two weeks moved 10,990 documents through
the real routes as the real seats and stored 2,792 real files (8.8
MB): at a supplier's first submission to a client the compliance
officer asks for the W-9, three certificates of insurance, good
standing, the signed NDA and non-compete, and the MSA where none
stands, the supplier answers each with a file and the client examines
it (82 papers from 12 suppliers); at screening 1,600 papers from 400
candidates; 29 sent back with a reason and answered again; 359 of 372
placements started, 246 refused first and learning, 13 on hold after a
flagged background report with the pre-adverse notice given and the
wait not over. No server error; every paper route's 95th percentile
under half a second. Two moves that did not exist were built:
`POST /api/documents/:id/examine` (accepted with the dates and edition
printed on it, an agreement countersigned, a certificate recorded on
the supplier's standing, or sent back with a reason) and
`POST /api/compliance/adverse-action` (the FCRA steps, the waiting
periods kept as data per place, refused outside the US rather than
guessed). **The founder's screening list was corrected by the rule
table, not dropped:** asking for the ID, the I-9 and the background
check before an offer is unlawful in most of the US (document abuse;
criminal checks before a conditional offer), so those move to the
award and the two questions that stand in for them are asked at
screening. Every expected refusal held: a worker cannot send a
background report, a paper nobody asked for cannot go on file, nobody
examines their own paper, the AP clerk examines nothing, a supplier
cannot open another supplier's paper, the final adverse notice is
refused during the wait. The walk's fixes landed in 81ec7ab50 with a
sentence each; the I-9 edition retirement dates are from research and
are to be checked before anybody relies on them.

**The document flow was walked as every person, 2026-10-21, on the
founder's "Can you test the docflow."** The rules hold: nobody starts
without an I-9; an I-9 is refused unless the document it was completed
from is named; lapsed cover blocks; work authorization cannot be
waived; a supplier cannot change what its client's order asks for; the
AP clerk can neither start anybody nor read people's papers; the
sub-vendor's name stays hidden from the client while the client sees
that firm's insurance standing; a provider's verdict is recorded
verbatim with name, reference and date. Five things broke trust, and
the verdict was "do not ship the document flow as a finished trust
layer" until they are fixed, each with an owner: the no-sign-in link
that asks a worker for her start papers stores the file's name and
not the file (regulatory); a newer "flagged" background report is
ignored when an older "clear" one exists (regulatory); an I-9 on an
old edition starts a person without a word, because the start never
reads the edition list (regulatory); the first nightly check sent 266
emails, 21 to one compliance officer, and told workers to "upload the
renewal" of a background check they never hold (conversation); HR is
told a person is "due to start today" a week early (regulatory). Also
found: a corp-to-corp line never reaches its own default set; a blank
waiver writes an override instead of refusing; the client's page and
the nightly check disagree by a day on a lapse; good standing is
required on running lines and nothing watches it; the supplier's
onboarding link keeps no file (demand); "work may begin" on a start a
week early (money). The note above that four readers "still carry
their own list" is out of date: they merge the line's set over their
own floor since 2026-09-22, and disagree in three named places. This
fix wave goes ahead of other work, per "the two trust flows get the
first seat at every release"; it does not hold the account chooser,
which touches no paper.

**Papers at every stage, walked on screens, 2026-10-22, on the
founder's "simulate request of documents at every stage and give me a
test script."** The script is published for him
(https://claude.ai/artifact/Az8wBZ9ELQmB7d6r7TBK5e): 41 steps across
the seven stages, each walked in a browser on a fresh seeded world.
The lesson, written down because the simulation hid it: **the rules
hold through the routes, and the screens do not reach them.** A paper
that arrives has no button to accept it or send it back; recording an
I-9 with its named document, a provider's verdict and the adverse-action
steps are API only; so a person whose I-9 is missing can never be
started from the screens alone. A simulation that drives routes proves
the rules; only a walk on screens proves a person can do the job. Also
found: a firm can ask a candidate for a passport before any offer from
the Paperwork screen; a person only invited reads as on the bench and
can be asked for papers before her yes; every Extend button asks for a
reason and gives no box; a licensed job is checked only at the start;
supplier onboarding marks the MSA and NDA on file with no signed copy.
Each has an owner; the screen fixes go ahead of new work, because the
document flow is a trust layer and the verdict was "do not ship it as
finished". From now on **every wave that changes a trust flow ends
with a walk on screens, not only a simulation.**

## Ask Etyme runs parallel to the dashboard, and the CFO gets exceptions, not a page — decided 2026-10-22 to 2026-10-26

**The question, from the founder, 2026-10-22:** *"Verify if Ask Etyme
conversation also works parallel to Dashboard."* Walked as fifteen seats
in a browser on a fresh copy of the seeded world. The verdict was no:
the mark, the greeting and Today agreed on thirteen seats and a week or
an expense decided on either side showed on the other, but the chat told
Techpeple to bill four weeks Computer Systems already held its invoices
for (a double-billing prompt), a receipt could not be paid from the
chat and the twin's yes paid nothing, the MSP seated at Cavanaugh read a
different queue from the program page, and plain trade questions ("Who
applied?", "Which invoice receipts can I pay?", "Who is missing an
I-9?") fell through to "needs the model". Fixed across six domains and
shipped in this wave; every fault had an owner and a test sentence. What
stands now, so it is not re-derived:
- **One list, read by both doors.** The chat's weeks-to-bill, bench,
  and program queue are the same reads Today and the program page use
  (`firmTuesday`, `benchAt`, `programQueue`). A second computation of a
  figure the dashboard already computes is the bug, whichever door it is
  in.
- **Another company's book is refused by rule, before the model**, in one
  sentence. "Needs the model" is never the answer to a cross-tenant
  question.
- **Plain trade questions are answered from the record, rules first**,
  through the same routes the pages read, and the chips are chosen by the
  seat's permissions so no chip refuses the person it is shown to.
- **Every decision in the count is a card with Yes and Not now**, and
  one receipt is one item: the twin's question rides on the receipt's row
  (`twinApprovalId`), never beside it. A receipt that fails the three-way
  check is never offered Pay; it reads held, with the hours and the way
  forward.
- **Paying an invoice receipt from the chat.** Three coordinator's calls,
  each reversible by the founder in a sentence: a yes pays the balance
  owed; the card asks for the bank reference before the yes, and a yes
  with none is refused ("Enter the bank reference so the AP clerk can
  reconcile it"); `invoice_receipt.pay` replaces `invoice_receipt.approve`
  for `Invoice` receipts (one card per receipt; `approve` stays for
  typed-in receipts). The payment is written by one function,
  `recordInvoicePayment` in `lib/money/invoice-payment`, which the
  receipt's page and the twin's performer both call, behind the same
  gate; the `invoice.paid` event goes out after the commit, never inside
  the transaction.
- **The mark re-reads after any act** on either screen, not on the
  minute.
- **A bill is dated by its agreement on the day it is sent**, and where
  the agreement's date has already passed the card says so before the
  yes ("38 days past due the day it arrives"). Where nobody said what the
  net days run from, they run from the day the bill is sent; that needs
  `paymentTermsFrom` to be nullable (four columns, five readers in other
  domains, ~30 seed writes), sequenced after this wave in the order that
  keeps every commit green.

**The CFO page is not built. Decided on the founder's question,
2026-10-22:** *"Are we still the simple system that's connecting people
like a well-oiled engine, or bothering higher-ups with another overflow
of information tool that they won't need?"* He asked for a thousand
indirect VPs' feedback. A thousand invented executives (not real
people; roles, industries, regions, contractor counts, current tool,
pain and worry drawn from the buyer profile) were each shown three
things and judged one at a time, eight batches, four of them caught
using a formula and redone by hand (https://claude.ai/artifact/JMgRNXaiJ15GeEBfmJQhkm).
Read for who and why, never for how many: 228 of 1,000 would take a
call, which real cold outreach never does. What it said, and what
follows:
- **The engine is wanted; the CFO page is the overflow tool.**
  Operations and procurement wanted the plant-level engine; CFOs wanted
  exceptions only (64 of 158 would use it, 17 ignored it) and ignored the
  engine; the five-number, four-flow CFO page drawn on 2026-10-22
  (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo) sat in the middle
  for every role, the mark of a tool nobody asked for. **So: no CFO page.
  The CFO gets one sentence a week naming only exceptions, and Ask
  Etyme's answer when asked.** Regional managers keep a filtered list of
  their region, which is the drawing's only surviving new screen, built
  when a client with sites in two regions asks.
- **Papers sell before money.** "Nobody starts without papers, audit
  ready" was the value named most, ahead of total spend and matched
  invoices. Public pages and first messages lead with the two things a
  buyer can check: nobody starts without papers, nothing is paid on hours
  nobody signed.
- **Nobody wants to hear about the assistant.** Ask Etyme and the chat
  were named as clutter more than anything else (287 times). It is met in
  use, never sold; this is the "never lead with AI" rule measured.
- **Aim at 200 to 5,000 contractors on spreadsheets or one-agency-per-
  plant, after a pain signal.** Under fifty contractors took 7 calls in
  173; low pain took 2 in 261. Say "sites", not "plants", outside
  manufacturing. The fixable blocker is security (SOC 2, data location,
  the DPA on one downloadable page); lock-in to a VMS, an ERP module or
  an MSP contract is not.
- **The region drawing stands as a drawing**, not a build: the hiring
  manager's own list exists; a region on a site, a regional manager's
  seat and the rollup wait for a paying client with sites in two
  regions. The rules per country shown on it are research, confirmed by
  regulatory before any is built.
- **Corrected by the founder, 2026-10-27:** *"This can be gold. I
  haven't tested, but it was easy to make, but [a] decision."* The
  no-CFO-page verdict above rests on invented buyers, which is the
  borrowed confidence this file warns about. So the verdict is
  **undecided, not rejected**: the drawing
  (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo) is kept and shown
  to three real people who hold those jobs, one question each ("would
  you open this on a Monday, and what would you do after?"), and the
  build or the cut follows their answers, not the simulation's.
- **Built, on the founder's "go ahead and build this", 2026-10-27**, after
  he said the drawing *"explains the product the best, like a beast, and
  nothing else"*. Why it does: it is the only picture of the whole product
  at once from the seat of the person who signs the order — a company's
  every contractor and supplier across every country on one record, the
  four flows (matched, hired, papers, money) side by side, what is stuck
  named, and three seats (CFO, regional manager, hiring manager) reading
  one record at three altitudes. Everything else shows one person at one
  step. The map sells; the engine keeps them. What is built, in order:
  1. **A seeded multi-site client, Corvane Packaging** (architect, with
     money for rates and regulatory for the per-country sets): sites in
     the US, Mexico, Brazil, Colombia, Vietnam, India, Belgium and
     Northern Ireland, grouped in six regions, ten or more hiring
     managers, each plant's suppliers and contractors with rates in the
     site's own currency, a few weeks, receipts (one held), and starts
     (one on hold), so every figure the map shows is on the demo and read
     against the seed. Reached from `/demo` like the other clients.
  2. **A region on a site, and a seat scoped to a region** (architect):
     `CompanyLocation.region`, an org unit of kind REGION, and a program
     seat that reads only its region's sites, through the existing
     isolation at the query. Nothing a regional manager reads crosses
     regions.
  3. **The three views** (demand, with money for the figures): the
     hiring manager's own list exists; the regional manager's list of
     hiring managers (contractors, open jobs, weeks to sign, papers,
     receipts, nearest time limit, spend in the plant's currency); and
     the head-of-operations / CFO rollup, one row per region, the four
     flows with what stopped, spend in one currency. One route, one read,
     the program page's own tabs ("By region"); never a second
     dashboard. The CFO's weekly exception line stays the decision for
     daily use; this is the map.
  4. **Papers and pay per country as data** (regulatory): the rules the
     drawing shows are research; each is confirmed with its source before
     it is shown, and an unconfirmed one is not shown.
  5. **The map on the home page's second screen** (market, after the
     seed lands): drawn from Corvane's seeded figures, inline, checked by
     the story-panel test like every other figure. The seven doors' two
     drawings stay.
  Release pass, preview, production, and a walk as the CFO, a regional
  manager and a hiring manager at Corvane before it is called done.
- **The map is the vision, and it is the home page. Decided by the
  founder, 2026-10-27:** *"This type of home page will sell with clients
  and system integrators big time. This is the vision of Etyme."* So the
  map is not a second screen under the panel; it is the picture the home
  page is built around, drawn from Corvane's seeded figures, with the
  hero's question and the demo button above it and the panel beside or
  below it, and the same map for integrators on their door, drawn from
  an integrator's own people across client sites and regions. The
  integrator's map needs a seeded integrator at that scale (Teleworld
  has four people on site), which is the architect's next seed after
  Corvane. The seven doors' two drawings stay under the fold. The home
  page is drawn before it is built, as every home-page change is.
- **Drawn 2026-10-27, waiting on "build it"**
  (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp). The question and
  the category line stay. The lede under them becomes "Every contractor,
  every supplier, every site and every country, on one record. Read it
  as the CFO, a regional manager or a site's hiring manager ("plant's" until 2026-10-28)." Under the
  buttons, the map: Corvane Packaging's 359 contractors, 25 suppliers and
  31 sites in 8 countries, with three seat tabs that re-read the same
  record (Margaret Osei, CFO, one row per region; Valeria Montes, Latin
  America, her six plants and their hiring managers; Marcus Hollins,
  Dayton, his fourteen contractors and the start on hold). Each seat's
  first line names what stopped: the held Dayton receipt, $42 over the
  signed hours; Maria Lee's start waiting on an I-9; Aoife Kelly in
  Belfast fourteen days from the time limit. Every figure is read from
  `lib/seed-corvane` (`programMonthlySpend` at 160 hours a month,
  `spendInReporting` at the sample rates, labelled as sample). The
  Northbend panel, the two drawings, the four lines, the band and the
  footer follow unchanged. The integrator's map waits for its seed.
- **"Build it", 2026-10-27, with two corrections from the founder's
  phone.** The tabs are the four roles, not people's names, as on the
  region drawing he chose: **CFO · Head of operations · Regional
  manager · Hiring manager**, and under them the line "Signed in as
  Margaret Osei, CFO. Reads every region. Signs nothing a plant's own
  people sign." (*"Clicking on CFO, hiring managers like in the link was
  better … this highlighting tells the story."*) The head of operations
  is Astrid Berge, every plant on one list: 48 weeks waiting across
  22 plants, six people within 30 days of the limit, one row per region
  with its regional manager. And **every party's door gets the same map
  in its own roles** (*"Do it for all parties like those"*): the four
  tabs on a door are that party's roles reading that party's own book,
  drawn from the seed before each is built, one drawing per door. The
  home page is built first, from the corrected drawing
  (https://claude.ai/artifact/VBYzE7NFTtJxTyebWSzirp, version 2); the
  doors follow their drawings.
- **The four doors' maps are drawn, 2026-10-27, waiting on "build it"**,
  each in that party's own roles, every name and figure from the seed
  (the scout's read of `seed-world`, `seed-programmes`, `seed-doors`,
  `seed-internal-moves`, `seed-rate-change`): MSPs
  (https://claude.ai/artifact/CPJviSYK5Uws6bFXLkMgL7): Aptiva Workforce
  in Cavanaugh Glassworks' program as Program manager (Rashida Coleman),
  Supplier manager, Coordinator and AP clerk; the last three seats are
  not seeded at Aptiva and the drawing says so, a seed addition for the
  architect on "build it". Integrators
  (https://claude.ai/artifact/AYzwwuCAYXSHj9KS5FosgT): Teleworld as
  Ingrid Solberg and Rahul Deshpande (delivery managers), Farah Haddad
  (HR), Ravi Kalathil (AP & Payroll). Suppliers
  (https://claude.ai/artifact/3teoAA3AMXxo1d6GSYpfGq): Brightmoor as
  Jenna Okafor (Owner), Marisa Delacroix (Account manager), Imelda
  Santoro (Accounts receivable), Desmond Achebe (AP & Payroll); the
  sub-vendor and bench tabs read Techpeple the same way. Workers
  (https://claude.ai/artifact/6LHDsk2pMnj1aPBNMZCKT8): Helena Marsh
  (Worker) and Colleen Byrne (Solopreneur). Two figures in them are
  computed at seeding (Rosa Delgado's weeks to bill, the bill from
  Nimbus) and the build reads them live, never as literals.

**Shipped to production 2026-10-27 (4bac05708 on the deploy branch,
source e7a589ec7):** the map home page, built from the corrected
drawing (the four role tabs, each a link at its own address, the
"Signed in as" line, every figure read from `lib/seed-corvane` and
checked by `story-panel-map.test.ts`; the seed overrode the drawing in
three places and the test holds each: receipts "clear the three-way
check" rather than "paid", because the seed pays none; Vietnam's spend
is ₫924,000,000; Maria Lee starts in 5 days); under the panel the two
drawings and the four lines, with "Talk to a person" in the hero and
the band (the papers drawing names Ingrid Sørensen, the one start
Northbend's seed holds for an I-9, not Priya Raman, who has no start in
the seed: the founder's word if he wants Priya); Corvane Packaging
seeded with a region on every site, a regional seat that reads only its
region, Ask Etyme and the thread list for that seat, the By region
views, a company's reporting currency and its own rates with who set
each, Corvane's receipts in the books with a Vietnamese one, its orders'
paper sets, its lines' due dates with pay dates from the world's day
on; and the nightly paper letters reading each night's lines, chains,
seats and names once (the night test went from over 30 s to under 10
with 360 more people). Release pass: type check clean, 12,020 unit,
2,483 integration, build clean, on a quiet copy; the last one-file
commit (the ladder's view of the log write) re-ran its two unit files
and the build. Gates: no source difference, no Ruby, brand kit present,
the three "removed" schema lines re-aligned whitespace. Smoke: every
public page 200, the inbound email door 404 to a POST.
**Open for the founder:** production's world has no Corvane yet: the
map reads the seed and shows, but "Open the demo as Margaret Osei"
answers "There is no world-corvane in this deployment's world" until
`POST /api/seed-world` runs with the cron secret, which the coordinator
does not hold; the walk as the CFO, a regional manager and a hiring
manager runs on a local copy of the seeded world meanwhile. The four
doors' maps wait on "build it" on their drawings.

**The walk as the CFO and an indirect procurement director, 2026-10-27,
said: the home page ships, the first screens behind it do not yet.**
On production the procurement director understands the product in
twenty seconds, every figure on the map adds up, and the four tabs
re-read one company convincingly; but "Open the demo as Margaret Osei"
lands on an unseeded door until the founder reseeds. On a local copy
of the seeded world, the figures agree on every screen and the region
wall holds (Valeria Montes is refused United States, Dayton and a
Dayton thread in a sentence); what disagrees is the words and the
counts: the CFO's greeting names the weeks instead of the $42 and
Aoife Kelly; the head of operations gets the CFO's greeting and "You
are in head of operations"; Valeria is given a count where the home
page names Fernanda Albuquerque; Marcus Hollins hears "three things"
in the chat and "two" on By region, and the chat refuses him the I-9
his own page shows; By region shows local money only, no dollars per
region, a footnote that contradicts its card, "0 paid" in attention
color, and its spend column off the edge at 1440 wide. On production
the Northbend AP clerk's PR-2026-0441 card has Open and Not now and
no Pay. Each is routed: conversation (the greetings, the refusal, the
card shape), demand (By region), market (the demo link until Corvane
exists, the US money cell, "Two minutes" and two unverifiable claims,
the phone table), money (why the pay card is missing on production).
One rule the walk itself broke and discarded: a first pass ran the
browser with certificate checks off; every screenshot kept came from
a run that pinned the proxy's certificate.

**Fixed the same day, with four coordinator's calls, each reversible
by the founder in a sentence.** (1) **The mark counts decisions
only.** "N things need you" and the mark are demand's one list (a held
receipt, a start on hold, weeks waiting), read by By region and by Ask
Etyme from the same `greeting()` data, so one person never sees two
numbers; a time limit is not a decision, so the greeting names it as
its own line after the counted things ("Aoife Kelly in Belfast reaches
the time limit in 14 days") and never counts it. (2) **The pay card
was missing on production because the twin refused itself:** the
twin's own older "approve" question on a receipt made the ledger's
segregation guard refuse every night's "pay" question as the twin
deciding what it drafted (money's diagnosis, reproduced on a copy). An
act may now name the question it replaces (`invoice_receipt.pay`
replaces `invoice_receipt.approve`); the guard ignores the twin's own
earlier questions of a replaced act, and the run closes them as
overtaken. The next nightly run repairs production on its own. And **a
pay question put off with "Not now" is asked once more, the day before
the receipt falls due, and never a third time**; a no with a reason is
a no. (3) **The home page asks the database once whether Corvane is
seeded** and waits at most 800 ms; where it is not, each role's link
reads "The demo is being set up" and leads nowhere, so a buyer never
meets an empty door; a slow answer reads as not seeded on that visit.
(4) **Corvane's head of operations is Astrid Berge**, so one page never
shows two Ingrids. Also: "Two minutes" left the sign-up band (a
promised speed, and `lib/positioning` now refuses one written as a
sentence); the two claims in "In it" link to the page where a reader
checks them; on a phone each region is a short block with the hold and
the held receipt first. Open: a region's order on the record (schema
request: `OrgUnit.position` on REGION units, written in the seed's
order; until then the home region leads and the rest follow by
contractor count); the head of operations' "within 30 days" line
counts regions, not people, until demand's figures carry that count.

**Shipped to production 2026-10-27, afternoon (ccdc8bde9 on the deploy
branch, source fa7195340):** the whole fix wave above. Release pass on
a quiet copy of 60aa99f6e: type check clean, 12,052 of 12,054 unit
(the two reds, a date formatted by hand in By region's note and the
map test's literal "Ingrid Solberg", fixed in the two commits after and
their files re-run green with the type check and the build on
fa7195340), 2,493 integration, build clean. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
every public page 200, the inbound email door 404 to a POST; production's
home page says "The demo is being set up" under each role, because
Corvane is not in its world until the founder reseeds. The pay card on
production repairs itself at the twin's next nightly run (06:00 UTC,
2026-10-28), when PR-2026-0441 gets its Pay question and the old
"Approve IN-FMDSDT-20260901" card closes as overtaken.

**The phone keeps the drawing's shape. Decided 2026-10-27, on the
founder's "Why doesn't home look like this website"** (the drawing).
On a desktop the built page matched; on his phone it did not, because
the walk's fix for the hidden columns had turned each region into a
stacked block of eleven lines and the five figures into one per row,
so the map ran several screens long. Reverted: the five figures sit
two to a row on a phone, the one table scrolls inside its own box with
the Region cell pinned on the left, the page never scrolls sideways,
exactly as the drawing renders at 390 wide. Shipped to production the
same hour (73ade6358 on the deploy branch, source 9f2790db4; type
check, the public-site unit files and the build green on the quiet
copy; smoke clean). The lesson, so it holds: a fix to a drawn page
that changes its shape goes back through the drawing, not straight to
code.

**Also in this wave, each with its owner and test sentences:** the
screen fixes from the 2026-10-22 papers walk (a firm accepts or sends
back a paper that arrived; the I-9, a provider's verdict and the
adverse-action steps recorded on screen; a passport refused before an
offer; only a yes puts somebody on the bench; every Extend takes a
chosen day and a reason and shows the route's refusal; a licensed job
checked at submission; the client's NDA asked at interview; supplier
onboarding requires the signed copy and the W-9's edition; a client
reads its order's paper set; the worker answers the screening questions
in words; a license renewal sends its number, issuer and expiry as
fields); a non-compete is not asked where the state voids it for workers
(CA, MN, ND, OK, each with its statute); a renewal request falls due
fourteen days before the paper lapses and a lapsed paper is asked for
once; an I-9 edition is read the way the issuer prints it; Marta
Kowalczyk at Talvern Medical works on a work permit ending six weeks
after her line, so extending her is refused on papers in the demo; a
license warning at submission has its rung on the automation ladder;
the simulation report prints each station's own table. Release pass on
a quiet copy of 7ccfc89ff: type check clean, 11,807 unit (the one red
the generated matrix page, regenerated), 2,401 integration, build clean.

**Shipped to production 2026-10-26 (fd050ca52 on the deploy branch,
source 7ccfc89ff, decisions c0e6c7903):** everything in the two
paragraphs above. Gates on the replay: no source difference, no Ruby,
brand kit present, no schema line removed; the one schema change is the
additive `W9` verification type. Smoke: every public page and the chat
200; the inbound email door still answers 404 to a POST, closed until
`EMAIL_INTAKE_LIVE=1`. The walk on production as fifteen seats runs
after this line is written, and its verdict is recorded under it.

**The second walk, on production fd050ca52, said no again, and the
reasons narrowed.** Fixed and confirmed: the chat's weeks-to-bill equal
Today's for every supplier; the seated MSP's chat reads its client's
program; held receipts read held on both doors; most trade questions
are answered. What stopped the yes, and what was decided fixing it,
each reversible by the founder in a sentence:
- **The pay card is created by the twin's nightly job**, which had not
  run since the deploy; locally, after the job, paying from the chat
  worked end to end. The job runs on its own schedule; the coordinator
  holds no cron secret and does not run it by hand.
- **The 2026-10-19 decision #2 covers the bill, not the button.** A bill
  the twin drafted is sent by the seat holding `invoices.issue`; the
  Owner sends it only where nobody else at the firm does, whether the
  press is in Ask Etyme or on Today, and the refusal names who may
  ("Imelda Santoro or Rosalind Tay sends this bill"). One function,
  `maySendBill` in `lib/money/bill-send`, is read by the send route,
  Today's Send button and the chat. A bill a person drafted is unchanged.
- **A seat in a client's program is in that program for the whole
  session.** Today, Needs attention, the mark and the chat all read the
  program's queue; the firm's own book is read only at home. One person
  never sees two numbers. Open for the founder: a seated MSP is never
  offered the client's weeks to sign, even where its seat may sign them.
- **A screen never offers an act the route will refuse**: the held
  receipt's page draws no Pay (`receiptPayPanel`, the same gate as the
  queue and the payment route).
- **A one-person firm is spoken to as herself and never accepts her own
  week.** Her own acceptance leaves the queue, her page, the seed and the
  chat; the automatic stand-in the routes write stays, because payroll
  reads it; once the client signs, her week waits on the firm above her,
  never on herself. A count stored in a sentence on the night a request
  was raised ("runs out in 24 days") is rebuilt on the day it is read.
- **The notice title names the receipt and the supplier at the source**,
  so email and Teams carry it; a clean receipt's reason says "Pay it".

Release pass on a quiet copy of adb269b56, fully green: type check,
11,866 unit, 2,418 integration, build. Two reds on the way were the
harness, not the product: an import path tripping a guard, and the
seeded stand-in acceptance stamped at the same second as the signature
it stands behind.

**Shipped to production 2026-10-26, evening (4279c3a7f on the deploy
branch, source adb269b56):** every fix above. Gates: no source
difference, no Ruby, brand kit present, no schema line removed. Smoke:
public pages and the chat 200, the inbound email door 404 to a POST.
The pay card appears on production after the twin's nightly job next
runs (06:00 UTC); the third walk on production records its verdict
under this line.

**The third walk, on production 4279c3a7f, said yes.** On all fifteen
seats and Brightmoor's Finance seat, the mark, the greeting and Today
carry one number; every item is on both screens; an act on one shows on
the other; all nine faults of the second walk are closed, paying from
the chat proven on a local copy of the same source after the nightly
job. Three small disagreements remain, each with an owner: a one-person
firm's Timesheets list says "Submitted" where every other screen says
signed and waiting on Halcyon (demand); a bill card drafted before the
past-due sentence existed never gets it, and a stored "sent <day>" count
goes stale, the same rule as the renewal count, to be rebuilt on the day
it is read (money, conversation); the raw decisions route still answers
a seated MSP's own queue though no screen reads it (demand). Wording:
"near the time limit" for a person past it; the digest title says
"need approval" over items that say "Pay"; the AP clerk is called "the
AP clerk" to her face.

**All of those leftovers shipped to production 2026-10-26, night
(7f1bb5f31 on the deploy branch, source 76f1fefc6):** a one-person
firm's Timesheets row reads "Signed · waiting on Halcyon Talent"; a
seated firm's bare queue answers its program; a drafted bill's card
reads its past-due line on the day it is drawn, in the chat and in
Teams; "past the time limit" is said as past; the Teams digest titles
payments as paying; every sentence addressed to the person paying says
"you"; a renewal request names the firm asking on every screen and in
the stored row. Release pass fully green on a quiet copy: type check,
11,876 unit, 2,425 integration, build. Gates clean, smoke clean, the
inbound email door still 404. Still to look at once: the pay card on
production after the twin's nightly run (06:00 UTC, 2026-10-27).

## Below the fold, every public page says why in two drawings and four lines — decided by the founder, 2026-10-27

The founder, as a client's indirect procurement manager reading the home
page: what stops him buying is commercial, not product — no price, nothing
for a vendor-risk review, no reference, no integration line, no setup path,
nobody to talk to. Then, on the first drawing of a fix (six cards, tags,
notes): *"filled with AI slop … a customer gives less than a minute to make
the buy decision … you have 20 seconds to establish category and why they
buy Etyme, what it contains, who to reach."* Then: *"The chat/table is a
good picture of what they would get live. The hero section is good right
now. It's only later sections that can be improved."* And: *"Does the
client care how many levels Etyme supports? It can be a security
concern. The client should get clarity on what benefits they have, not
Etyme's business model."* "Build it", on the seven drawings.

- **Above the fold nothing moves**: the category line, the question, the
  demo button, the chat-and-table panel with that party's own person.
  One addition: **"Talk to a person"** beside "Open the demo", and beside
  "Sign up" in the band. The header stays the logo and Sign in.
- **Below the panel, two drawings and four lines, about ninety words.**
  Each drawing is a named person from the seed and one outcome, drawn as
  plain inline lines (no image, no library), with one claim under it and
  one sentence under the claim. The four lines: *In it* (the nouns, and
  that suppliers and contractors join at no cost and nobody needs
  training); *Price* ("free while we test; founding firms keep their
  terms", and "free, for you, always" on the worker's and the
  solopreneur's); *Security* ("what is done and what is not, on one page;
  no SOC 2 yet, it is next"); *Talk to a person* (support@etyme.com, one
  sentence is enough). Then the band and the footer as they are.
- **The drawings show the party's benefit, never Etyme's shape.** The
  first version drew the supply chain as a staircase; it was struck
  because a buyer reads it as "my data goes down to firms I don't know",
  and the client never sees below the supplier it pays anyway. No level,
  rung, prime, sub or "for clients, MSPs, suppliers and workers" on a
  page addressed to one of them.
- **The seven, with their drawings** (files under the coordinator's
  scratchpad `home-proto/`, published as artifacts the founder approved):
  Clients (home: Priya's papers; Renata's three-way check);
  MSPs (a start held for an I-9 on the client's program; the client's AP
  clerk paying what the three agree on); Integrators (Ingrid flags who
  rolls off and Sunil reserves them; Karthik starts as the firm's own
  employee with papers checked); Suppliers, prime (Marcus signs Omar's
  week and the bill goes out on it; Jonas on the bench by his yes, papers
  asked first); sub-vendor (Bhavesh accepts the week signed above him,
  pays and bills the same hours; his rate and his people stay his); bench
  vendor (a bench shown only where each said yes; Ifeoma's I-9 before the
  start); Workers (Helena files once and reads what she is owed and when;
  her papers move with her); solopreneur (Colleen files once and bills
  accepted hours; her license told 13 days before it lapses, and who
  asked).
- **Every name and figure in a drawing is read against the seed by the
  story-panel test**, as the panels already are. The word cap on a public
  page rises only by what these ninety words need, and the test says so.
- **Not on any page:** a customer name (none exists; "who runs on it" is
  not said until a founding client agrees to be named), a number of days,
  a certification, an accounting or ERP vendor's name.

## Cash flow and document flow are the trust layers — decided by the founder, 2026-10-20

The founder, on the four flows the simulation exercised: *"Cashflow,
document flow for compliance, network flow to stabilize business, and
matching to business speed in the futuristic AI flow."* Then: *"Cash
flow and document flow are the trust layers of business."* So:

- **Trust is built in two places and nowhere else:** the money moves
  exactly as the signed week says (one filing, signed at the top,
  accepted down, billed, received, checked, paid, payroll by period);
  and nobody starts without the paper that lets them (asked, sent,
  examined or the provider's verdict recorded, the start refused until
  it holds). The network (who trades with whom, benches shared by
  consent) stabilizes the business on that trust; matching gives it
  speed. Neither of those two can create trust, so neither is built or
  sold ahead of the first two.
- **The two trust flows get the hardest tests and the first seat at
  every release.** A fault in either stops the ship; a fault in the
  other two is a lesson with an owner.
- **The public pages prove the trust flows and describe the rest.** The
  panel plays a week signed and a bill matched; the security page says
  what is done and what is not. Speed and matching are shown as what
  trust buys, never first.
- **"Money will be replaced by tokens"** (the founder, the same hour),
  tested against the five questions: the token, in Etyme's own words, is
  the signed and accepted week, which already travels the chain without
  being re-keyed; the next step is a third party advancing cash against
  it, which is factoring on a record that can be trusted. Verdict: build
  later, after the first paying client; on a page it is said as "paid
  the day the client signs", never as tokens, because an IT buyer reads
  tokens as crypto.

## One tenant is one domain name — decided 2026-09-21

**The founder's rule: one tenant = one domain name.** A company signs in
through its OAuth tenant, and the verified corporate domain is the tenant.
Everything that shares that domain is one tenant, however many legal
entities, countries or branches sit under it. Terimo Inc. in the US and
Terimo Ltd. in Canada, both on `terimo.com`, are **one tenant**, not two
companies.

What follows, so nobody models a group as two companies:

- **The legal entity is a layer under the tenant, not a tenant of its
  own.** It is what signs an agreement, raises an
  order, receives and pays an invoice, and employs or engages a person. It
  carries a country, a currency, a tax regime, registration numbers and a
  bank. Every money document names exactly one legal entity. A person's
  seat is at the tenant; their placement is with an entity; their tenure
  is at the tenant, across entities.
- **A branch is a site under a legal entity.** It carries a calendar, a
  time zone, a state or province, and hiring managers. Work happens at a
  site. Tenure never depends on the site.
- **Rules live on the tenant and are overridden at the entity, then the
  site.** Approval chains, rate bands, required documents and caps are set
  once; an entity overrides currency, tax and the document set; a site
  overrides the calendar and the language.
- **A group with several domains** (`terimo.com`, `terimo.ca`) maps the
  extra domains onto the one tenant as aliases. A verified alias joins the
  tenant; it never creates a second one.
- **Today `Company` is both tenant and legal entity**, with one currency
  and US documents. The legal-entity layer is a schema request for
  `etyme-architect`, sequenced as the first Phase 3 piece a paying client
  funds. Until it exists, two entities under one domain are still one
  company on the record, and the two ledgers are a report, not a table.
  Two companies on the record for one group is the wrong workaround and is
  not used.

## A site has a country and a time zone, and a local holiday is a day on the week — decided 2026-10-20

The founder: *"Can clients and businesses have tens of locations
globally and have their own calendar of operations, a local HR
calendar and a sales calendar that a worker has to report to? A
contractor working from India has Diwali, but a client may agree to
it or not."* Then, on the first answer (three calendars, an agreed
list per placement, a reminder from the twin): *"Is this over
engineering?"* It was. The question is one worker, one day, one
client: is this day a holiday for this placement, and who pays for
it. What answers it with what already exists, and nothing more:

- **A site has a country and a time zone.** `CompanyLocation` already
  carries the country; it gains a time zone. Its holidays are the
  country's public holidays, which `Holiday.country` already keeps off
  another site's dates. Nobody edits a site's calendar until a paying
  client with sites in two countries asks for it.
- **The placement's site decides which days are expected.** A
  placement already names the site where the work is done; the week
  is checked against that site's country and days off. An Indian
  worker on a US client's site is expected on Diwali unless the day is
  taken.
- **A local holiday is a kind of day on the week, and the client's
  signature is the agreement.** The worker marks the day "local
  holiday — Diwali" the way they mark leave; the week shows it in
  words; the client signs the week or sends it back, which is the
  "agree or not" the founder named, through the signature that
  already exists. No agreed list, no second table, no reminder.
- **Pay and billing follow what is already there**: a holiday day is
  not billed; whether the worker is paid for it is the employer's
  existing holiday policy (the bench setting of 2026-10-03, off by
  default, on for GSIs), applied to placements too.
- **The generated world's firms still get sites in several
  countries**, because it costs one column and proves "horizontal,
  never vertical" in the simulation. Everything else above waits for
  the first paying client who asks, per the sequencing rule.

Cost: one column on the site, one value in the day kinds, one line
in the week's words. The earlier design (three calendars, agreed
holidays per placement, a twin reminder) is recorded here as what was
cut, so it is not re-derived until a client needs it.

## Who pays — decided 2026-09-10

**The client is the customer.** An enterprise with a dozen suppliers pays
for the one thing none of its suppliers can give it: every contractor on
its sites, across every supplier, with tenure added up, paperwork on
file, hours signed and invoices matched — from the desk of whoever does
that job. Suppliers are on the platform because their clients are.

This replaces the earlier plan to sell tooling to vendors first. A
vendor at a hundred dollars a month buys efficiency and can manage
without it; a client at fifty thousand a year buys a legal exposure it
cannot see any other way. The phases below are cut on that.

### Phase 1 — one hire, from every desk (built; ships on this)

The ten stations of one placement, walked from the client's own desks
and refused at each to whoever has no business there:

1. the hiring manager posts a requirement; within plan it publishes
   itself, every desk cleared by rule and by name; a miss goes to the
   desk that owns it — HR reads the role, Procurement audits the
   suppliers, the lead who owns the cost centre signs the money, after
   both — and nobody, the manager least of all, signs their own
2. the programme office chooses which suppliers see it; a hiring
   manager cannot
3. a supplier submits; the client awards; a supplier cannot award its own
4. both contracts and their due dates are written by the award
5. nobody starts without an I-9; a lapsed certificate blocks; a missing
   background check warns and records the reason; a stranger to the
   contract cannot touch it and the AP clerk, a party, still cannot
   start anybody
6. the worker files their own week; nobody else may
7. the client signs the work, the supplier accepts what it pays; nobody
   signs their own hours
8. the supplier invoices its own engagement only
9. the client pays what came through the match — never an invoice the
   supplier has not submitted — and the payment says who paid whom
10. tenure is the person's, across every supplier, counted once per day
    on site, and every read of it leaves a trail

`__integration__/client-programme.test.ts` is that walk, as sentences.

**Three client demo accounts** — Northbend Athletic, Cavanaugh Glassworks,
Talvern Medical — each with a
programme manager, hiring manager, VP, AP clerk and compliance officer
holding the real roles from `lib/company-defaults`, several suppliers,
a history across suppliers, and something waiting at every desk. Built
by `lib/seed-programmes` inside the world seed; reached from `/demo`, or
`POST /api/demo {"as":"world-nike","desk":"ap"}`. Seed once per
deployment with `POST /api/seed-world` and the `CRON_SECRET`.

### Phase 2 — governance and the supplier's own operation

Approval chains beyond one VP · rate bands and headcount enforced at
requisition · three-way match exceptions routed to a desk · rate
variance across suppliers · multi-manager org · the supplier's bench,
releasing-soon and rolloff · screening and interviews as a pipeline ·
1099 and sub-vendor payment down the chain · matching with reasons.

**A program office that is not the client.** Decided 2026-09-14, over
the uniform test. An MSP runs a client's program and places nobody, so
nothing ties it to a client the way a placement ties a supplier — and
so it cannot raise a requisition at all. Letting a firm's own record of
a counterparty stand in would let any firm claim any client, which is
worse than the gap. The answer is a seat: the client grants the MSP a
desk in its program office, the way it grants one to its own people,
and the MSP acts there under the client's own rules with every read
logged. Until that is built the refusal says what is missing rather
than "No client company found for this caller"
(`lib/resolve-client-company`), and
`__integration__/party-uniform.test.ts` holds the sentence.

### The assurance gate — decided 2026-09-22

The founder, after a second conversation with the CTO of the
two-billion-dollar company who is the exact buyer: **without SOC 2 Type
II and ISO 27001 there is almost no chance of an enterprise contract.**

That reverses the sequencing this file and the matrix both carried. The
old line said the attestations start after the first contract that
requires one, on the reasoning that buying one ahead of a buyer is a
year of cost with nobody on the other side. Half of that is still true
and the other half is now wrong: the buyer is asking before he will sign
anything at all, so for him the attestation is **Phase 1, not Phase 3.**

Three things follow, and none of them is a product change:

- **Type II cannot be bought quickly.** It attests that controls
  *operated* over a window, commonly six months. The window is the long
  pole and the only part that cannot be compressed later, so the clock
  starts now or the delay is paid in full later. Type I is a
  point-in-time assessment of design, takes weeks, and is the bridge a
  buyer accepts meanwhile. The penetration test still runs first, because
  a report written over controls nobody has attacked is the wrong order.
- **Most of the hard evidence already exists**, built for its own
  reasons: every read of another person's data logged including refusals,
  every unprompted act on a declared ladder, retention as code with the
  legal basis cited or its absence stated, erasure, the breach clock, and
  a deploy that is a reviewed replay through two gates. Firms usually
  start this with nothing and collect for six months.
- **It is one buyer describing his own procurement**, and he is very
  likely right about it. Two or three of the hundred leads asked the same
  question would say whether it is the market or the man, and that costs
  nothing to find out.

The sequencing rule below still holds for everything else. This is the
one exception, and it is an exception because the gate is commercial
rather than technical: the product is finished enough to sell and cannot
be bought.

### Phase 3 — scale

Multi-region programmes · IR35, GST, withholding · supplier scorecards
and tiers · document templates and attestations · reporting and export ·
commissions · sourcing at volume.

**The sequencing rule, kept from the BRD:**

> Phases 1–2 must ship to PAYING customers before enterprise scale work
> begins. The 2017 sprawl happened because everything was built at once.

The 2017 build reached 4,197 commits and stalled on adoption, not on
engineering. Building is now cheap, which makes over-building the primary
risk. If you find yourself scaffolding Phase 3 while a client is not yet
paying for Phase 1, stop.

**Prototypes (reference, not production):** `prototypes/client-console.tsx`
and `prototypes/rolloff-console.tsx` still define the target look of the
client and vendor consoles. `BUILD.md` §6 lists what the 2017 system had
that this one does not yet.

---

## The hardest things in this system

Named so you approach them with care, not speed.

1. **Cycle generation.** Nineteen kinds, five frequencies, business-day shifting
   against a per-company holiday calendar, month ends, February, and idempotency on
   extension.

   **This paragraph used to say the 2017 implementation "is correct and was earned
   over years", and that was false.** It was read against the Rails source on
   2026-09-16, before the tree was deleted, and the engine it told you to port is
   substantially a stub: `Contracts::Cycle#get_next_date` — the function every
   timesheet, invoice and salary date derives from — has its body commented out
   under a live TODO and returns `last_date + 1.day`. `group_by_biweekly` is a
   copy of `group_by_weekly`, so legacy "biweekly" generated weekly periods. Nine
   of the nineteen kinds were commented out; nineteen was a string constant, not
   nineteen generators. `twice_a_month_submit_date` could raise, which is why
   `Contract.set_cycle` wrapped every contract in a bare rescue — contracts
   silently got no cycles at all.

   The claim survived because nobody read the file, and it steered the rebuild for
   months. **`lib/cycle-generator` is now the reference implementation.** It is
   shorter, tested, and correct on more cases than the original ever was. Nothing
   remains to port.

   What is genuinely still open is listed under "The cycle engine, honestly" below.
   **Write the tests first** still holds, and money arithmetic still gets asked
   about rather than guessed.

2. **Field-level permissions.** Cannot be retrofitted. Every read path filters by
   context from the first commit, or you audit every query later.

3. **Cross-vendor identity resolution.** Required for tenure aggregation. Deterministic
   matching on consented identifiers only; probabilistic matches surfaced for human
   confirmation, never silently merged.

### The cycle engine, honestly

Found by reading the Rails source against `lib/cycle-generator` on 2026-09-16.
Written down here because the tree that would have shown them is gone, and
because two of them are money.

1. **Extending a placement writes no cycles.** `api/contracts/[id]/extend`
   moves `endDate` and logs it; its own comment claims it writes the billing
   and pay cycles behind it and it does not. Three months added to a placement
   have no hours-due, invoice or pay rows. It also moves only the sell leg —
   the `BuyContract` end date is left behind. Generate over `[oldEnd, newEnd]`
   only and pass the existing `dueOn` set per kind into `generateCycles`'s
   `existingDates`, which exists and no production caller passes.
2. **No final partial period.** A contract ending on a Wednesday has no hours
   cycle and no invoice cycle for its last two days; generation stops at the
   last whole boundary. The Rails version emitted the short trailing group.
3. **Business days only shift forward.** US payroll pays a Saturday pay day on
   the Friday before; this moves it to the Monday after, which pays after the
   work. The direction is a money decision, per kind rather than globally —
   pay backward, bill forward. Nobody has made it.
4. **No salary lag.** A contract's payment term is not mapped into `offsetDays`,
   so pay day is the period end itself.
5. **Nothing marks pay cleared.** Legacy ran calculate → process → clear. If AP
   needs a settlement date it is a cycle kind, not a status.
6. **DAILY frequency was dropped** with no note. Per-diem work exists. If it was
   deliberate, say so beside the `ON_COMPLETION` comment.
7. **`Cycle` stores no period bounds**, so `cycle-complete` reconstructs which
   period a cycle covers heuristically. It holds for the packs shipped and is
   guesswork the legacy row did not need. `periodStart`/`periodEnd` is a schema
   request for the architect.
   Until they exist, `cycle-complete` reads which date a week's event closes
   from the line's whole series, generated again with no floor through
   `planCyclesFor`, and falls back to the old estimate from the usual gap only
   where that series no longer contains the written date (a weekend rule or
   calendar changed since the award). It still cannot say which of several
   weeks sharing one invoice date is the last, so the first week billed closes
   it, and each later week then closes the next open date; that is for the
   founder to decide.
8. **Holiday shifting is timezone-fragile.** `shiftToBusinessDay` builds dates in
   local time and looks holidays up by UTC key. Under `TZ=Asia/Kolkata` a holiday
   does not shift at all. Correct under UTC and US zones, so Vercel is fine
   today and a second region would not be.
9. **And a second, separate timezone fault in the same file changes a
   count.** Found 2026-09-22 by `etyme-money`, measuring rather than
   reading. `dayInMonth` builds `new Date(year, month, day)` in **local**
   time and compares it against **UTC**-midnight `start`/`end` bounds, so
   a boundary date falls outside the range. Under
   `TZ=America/New_York` a twelve-month monthly billing series generates
   **eleven dates instead of twelve** — a month of revenue with no
   invoice date. This is not item 8: no holidays were passed in any of
   those runs. Vercel is UTC so nothing is wrong today, and moving a
   range boundary in the generator moves cycle dates for every contract,
   which is why it is written down here rather than slipped into an
   unrelated commit. It is `etyme-money`'s next piece of work.

### The monthly packs anchor an approval to a calendar day, not to the hours

Measured 2026-09-22 by `etyme-money` over every start day of the month,
after regulatory fixed the weekly and semimonthly cases. Recorded because
one of the three needs the founder and two do not, and because the first
version of this note — written from a relayed claim rather than from the
source — was wrong in a way worth remembering.

**The claim that was wrong:** that `IN_DELIVERY` approves a month's
hours twenty-seven days before they are submitted. It does not.
`MEANS_MONTH_END = 28` in `lib/cycle-generator`, so `dayOfMonth: 28`
means month-end, the submission lands on the 30th or 31st, and the
approval on the 1st is nought to three days *after* the hours. A relayed
number that nobody re-derived is how the old "the 2017 cycle engine is
correct" claim survived for months.

**What is genuinely wrong, and it is narrow.** A monthly
`TIMESHEET_APPROVE` on `dayOfMonth: 1` is anchored to a calendar day of
its own rather than to the hours it approves, so on **one start day in
twenty-eight — a contract starting on the 1st** — the first approval
precedes the first submission and the last month's hours have no
approval date at all. That is the natural start date for a monthly
India or UK engagement. The repair is `offsetDays` off month-end, not a
different `dayOfMonth`; the same argument as the weekly case.

**Monthly invoicing on the 1st is the same shape and needs no
decision.** UK `INVOICE_GENERATE`, UK `VENDOR_BILL_GENERATE` and
`IN_DELIVERY`'s `INVOICE_GENERATE` all bill on `dayOfMonth: 1`, which
leaves one month of work per contract with no invoice date and a first
date that bills nothing. Unlike the semimonthly case this is a coherent
intent — "bill on the 1st for last month" — so the repair preserves it:
`dayOfMonth: 28, offsetDays: 1`, every date staying on the 1st, the
spurious head gone and the tail appearing. Worse on the vendor side,
because `VENDOR_BILL_GENERATE` is a PAY kind and shifts **backward** off
a weekend: six of twenty-four dates fell into the previous month, a
supplier invoice recorded 30 January for a February that has not begun.

### India: the law constrains the pay date, and the packs have no pay date

The founder asked, on the 25th-of-the-month salary calculation in the
India pack: *"I don't know — can you research and make sure we meet
compliance there."* Researched 2026-09-26. Three findings, and the third
is the one that matters.

**1. Calculating on the 25th is lawful, and the question was the wrong
one.** Nothing in Indian law says when payroll may be *computed*. The
**Code on Wages, 2019** — in force nationwide since **21 November 2025**
by notification S.O. 5322(E), which repealed the Payment of Wages Act
1936 and three other Acts — constrains when wages must be **paid**: for a
monthly wage period, before the expiry of the **7th day of the following
month** in an establishment with fewer than 1,000 employees, and the
**10th** at 1,000 or more. So the 25th stands, and the reason is written
down here so the next agent does not "fix" it.

**2. The Code widened who is covered, which is why this is not academic.**
The 1936 Act protected only employees under a wage ceiling. The Code on
Wages extends timely payment and authorized deductions to **all**
employees whatever they earn — so every contractor on an Indian payroll
is inside it now, including the senior ones who were outside before.

**3. What the packs actually lack is every statutory date after the
calculation.** `SALARY_CALCULATE` on the 25th is the only date in the
India pack. There is no pay date, and there are no deposit dates, and
four separate deadlines with four separate penalties hang off the month:

| What | Due | If late |
|---|---|---|
| **Wages paid** | 7th of the following month (10th at 1,000+ employees) | a claim under the Code, with compensation |
| **TDS on salary** | 7th of the following month; **30 April** for March | 1.5% per month |
| **EPF** | 15th of the following month | 12% a year plus 1% a month damages — and PF deducted and not deposited is a **criminal** offence |
| **ESI** | 15th of the following month | interest and damages |
| **Professional tax** | 15th of the following month, and it varies by state | state penalties |

Each goes to a different authority, so one late run triggers several
penalties at once. This is the shape CLAUDE.md already argues for
elsewhere — a settlement date is a cycle kind, not a status (item 5 in
the honest list) — and it is `etyme-regulatory`'s next piece after the
monthly dates land, with the arithmetic `etyme-money`'s.

**4. And the 25th has a real hole that is not about the law.** A fixed
salary can be computed before the month ends because nothing about it
depends on the month. **Hourly work cannot.** `IN_DELIVERY` carries a
monthly timesheet, so it is a pack for work paid by the hour, and eight
of its twelve salary-calculate dates fall before that month's hours are
filed. For a salaried employee that is normal Indian practice; for a
contractor paid by the hour it is a number computed from days not yet
worked. The answer is not a different date for everybody — it is that
the calculation follows the **pay model**: the 25th where pay is fixed,
the hours where pay is hourly. Nobody has built that, and it is the
question to put to the first client who actually runs an Indian payroll.

### Where the 2017 Rails tree went

Deleted from the working tree on 2026-09-16 after its business rules were
extracted to `LEGACY_RULES.md` and the cycle engine was read against the
rebuild.

It is not lost, but it lives in exactly one place: the history of
**`github.com/smadavaram/etyme-2017`**, where the last commit carrying all
876 Ruby files is **`763c6f57`**. It has never existed in `etyme2040`,
whose history was built by replaying app-only commits. So:

```
git show 763c6f57:legacy-app/models/contract_cycle.rb
git checkout 763c6f57 -- legacy-app/
```

**`etyme-2017` is therefore archived, never deleted.** Whatever else moves,
that repository is the only copy of four thousand commits of how this
business actually worked, and no other copy is coming.

An annotated tag would be friendlier and this repository's token is refused
on any tag ref with a 403, so the commit is written down instead.

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

## Design system — the brand kit for the surface, the prototypes for the rest

**The brand kit is adopted. Decided by the founder, 2026-09-26.** It
arrived from the marketing site as `brand-kit/` and it now decides
**color, type, corners, shadows, motion, icons and the logo.** The
prototypes in `prototypes/` still decide **layout, screens and
behavior** — what is on a page, in what order, and what happens when
somebody clicks it. Where the two disagree about a color or a typeface,
the kit wins; where they disagree about what a screen does, the
prototypes win.

The old line — *if the production build does not look like the
prototypes, we have failed* — still holds for everything the kit does
not cover, which is most of what a screen actually is.

**The kit is a copy, and a copy drifts.** It is maintained on the
marketing site and this folder is a duplicate of it. Two homes for one
design system is how the landing page spent a week saying something this
file had already replaced. Either the product's tokens become generated
from the kit, or one person owns the sync on purpose — but nobody should
assume the folder is current because it is checked in.

### Design tokens

The neutrals were already identical on both sides and do not move:

```
canvas:   #F0EEE6    surface:  #FBFAF7    raised:   #FFFFFF    sunk: #E7E4DA
ink:      #1F1E1D    muted:    #6B6862    faint:    #9C9891    rule: #E3DFD5
```

**The accents, and the three decisions inside them.** Every figure below
was computed with the same WCAG arithmetic
`__tests__/invariants/chart-colors.test.ts` uses, not chosen by eye.

| Role | Value | Why |
|---|---|---|
| **action, on a filled button** | `#5228FF` | the site's violet; white text on it scores 6.76 |
| **action, as text** — links, chips, active nav, small type | `#4421D6` | **8.26** on surface against the brighter violet's 6.48, and **7.27** on its own chip wash against 5.70. The deeper violet is materially easier to read at the sizes most of the product is set in |
| **attention** | `#C0622E` | unchanged |
| **verified** | `#4F6F52` — **ours, kept** | the kit proposes `#2F7D3E`, which scores **4.46** on the verified chip's own wash where ours scores **4.94**. The verified chip is the most-read small text in the product and the kit's green takes it from passing to just under. Ask the kit's author for a darker green that clears 4.5 on `#EDF1ED`; until then this token does not move |
| **danger** | `#B83A3A` | unchanged |

**The vivid green `#00C800` is the logo and nothing else, ever.** White
text on it scores **2.27**, which is unusable on any control. The kit
says logo-only and it is right; this is the enforcement.

**The chart palette survives the swap and had to be checked.** `SERIES`
opens on the brand's action color, and the whole five-color set is
validated for color-blind separation. Swapping blue for violet costs
nothing: the worst-separated pair is the clay against the olive, which
the kit does not touch, so the separation is identical before and after.
Every series color stays above the contrast floor. The test sentence
that says the series *"opens on the brand's blue"* is the one artifact
that has to be reworded when the swap lands.

**What this costs, so nobody over-plans it.** Five files carry the token
change — `tailwind.config.ts`, `globals.css`, `layout.tsx`, `logo.tsx`,
`lib/chart-colors.ts`. The 88 files using `etyme-action`, the 95 using
`etyme-attention` and the 56 using `etyme-verified` do **not** move,
because the names stay and only their values change. The September sweep
that pulled twenty-seven off-brand colors onto tokens is what makes this
a five-file change instead of a two-hundred-file one.

### Typography

- **Serif** (headlines, hero numbers): Iowan Old Style → Palatino → Georgia
- **Sans** (body, UI): Inter → system sans
- **Mono** (data): IBM Plex Mono (rolloff console)
- Tabular figures inside tables (`font-variant-numeric: tabular-nums`)
- Serif headlines are set loose (`letter-spacing: -0.02em`) with `text-wrap: balance`

### Two surface types (from `Etyme_UX_Stress_Test.md`)

| | Decision surfaces | Working surfaces |
|---|---|---|
| Examples | Yours to decide, rolloff fan-out, rate approval | Bench list, requirements, timesheets, invoices |
| Voice | Prose, reasoning, confidence, calm | Tables, search, filters, bulk, density |
| Volume | 3–10 items | Hundreds |
| Typography | Serif headlines, generous space | Tabular figures, tight rows |
| Success | User decides well and leaves | User finds and acts fast |

The theme stays the same on both — warm canvas, ink, one blue, clay for
attention. What changes is density and voice.

### Components (extracted from prototypes)

- **Shell** — sticky header (logo + org + role), sidebar nav with section
  groups (Sell / Procure / Operate / Grow), mobile pill nav
- **Panel** — surface background, 1px rule border, serif title, optional
  subtitle
- **Stat** — label (uppercase 10px) + serif number + optional subtitle.
  Tone variants: default (ink), attention (clay), verified (green)
- **Chip** — small rounded label with tone-coded background: attention,
  verified, action, passive
- **Why** (reasoning disclosure) — score + confidence label, expandable to
  show factors (bar chart), basis, and unknowns
- **Head** — eyebrow label + serif h1 + optional prose subtitle
- **Lbl** — 10px uppercase letter-spaced label

### Navigation per company type

Nine links, and a process step is a tab (founder, 2026-10-19; see "Nine
links, no flip, and every first screen names a person"). A menu entry is
a noun on the person's own work; every other page is a tab inside one of
them.

| Party | The links | Folded inside them, as tabs |
|---|---|---|
| Client | Ask Etyme · Today · Jobs · Candidates · Timesheets · Invoice receipts · Contractors · Suppliers · Settings | Conversations → Ask Etyme. By region → Today. Interviews → Candidates. Expenses → Timesheets. AP, Budget, POs → Invoice receipts. Contracts, Ending soon, Past contractors, Tenure, Duplicate check → Contractors. Contacts, Agreements, Supplier scorecards → Suppliers. Users & permissions, Program team, MSPs, Org view, Compliance, Document requests, Program twin, Data requests, Your data, Import, Sites → Settings. |
| Supplier | Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · People · Companies · Settings | Conversations → Ask Etyme. Reports, Profitability, Rate history, Our scorecard → Today. Leads, Shared with you → Jobs. Interviews → Candidates. Expenses, Rolloff → Timesheets. AR, AP, Payroll, Commissions → Bills. Bench, Bench pay, Bench check-ins, Training → People. Suppliers, Contacts, Sell contracts, Buy contracts, POs → Companies. Users & permissions, Setup, Sites, Import, Integrations, Automation, Paperwork, Missing paperwork, Document requests, Screening packs, Compliance, Check queue, DNR list, Data requests, Your data → Settings. |
| Integrator | Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · People · Companies · Settings | The supplier's, with no Leads: its jobs arrive from the client it already has. |
| MSP | Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · Companies · Settings | The supplier's, with no People, no Payroll, no Commissions and no Our scorecard: an MSP places nobody and pays nobody. Supplier scorecards → Companies. |
| One-person firm | Ask Etyme · Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Your page, Who has you → Your work. Expenses → Timesheets. AR → Bills. POs → Contracts. Your paperwork, Compliance → Paperwork. Your data → Settings. |
| Worker | Ask Etyme · Your work · Your page · Who has you · Your data · Your paperwork | Unchanged: a list under "You", not nouns with tabs. |

Each link opens the first of its pages the reader may open, and on any
of them the shell draws the tab row under the page header, the noun's
own page first (`components/shell/section-pills`). Nothing behind the
menu is deleted: every page keeps its address, and search and the +
button still find it. There are no sub-headings and no Network group
any more: the firms a party trades with are one noun (Companies, or a
client's Suppliers), and both lines of a contract sit side by side
under it, or under Contractors at a client. A link is one of the nine
on every menu; the worker's "You" is the one list.
`__tests__/invariants/sidebar-nav.test.ts` reads this table — the links
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

**A person who is also a worker keeps their firm's links and gains "You"
at the end.** Decided 2026-09-17, on the founder opening Karthik Menon's
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

### Eight things to build before features (from UX Stress Test)

1. **Search on every list.** Before anything else.
2. **Restore the plus button** with its four sections.
3. **Working-surface table** — dense, sortable, filterable, paginated,
   bulk-selectable, exportable. One component, used everywhere.
4. **Batch submission.** The 2017 `temp_candidates` pattern with per-item
   error collection.
5. **Progressive explanation.** One line by default, reasoning on click.
6. **Tabular figures inside tables.** Serif for headlines and hero only.
7. **Scope the undo promise** to what is actually built.
8. **Missing states** — loading, error, empty, partial, denied.

### Prototype files (reference, not production code)

- `prototypes/rolloff-console.tsx` — vendor-side rolloff (BRD §16)
- `prototypes/client-console.tsx` — client operations (BRD §17.1)
- `prototypes/Etyme_Demo_AllViews.jsx` — all four company views
- `prototypes/Etyme_Onboarding.jsx` — five-step onboarding flow
- `prototypes/Etyme_UX_Stress_Test.md` — UX analysis and resolution

---

## Who sells and who buys — corrected 2026-09-17

From the founder, and it changes what a prime is:

> Prime, GSI and MSP can bring their own W2s as well and don't need a
> supplier all the time. A GSI delivery manager can bring people from
> another internal PM or delivery manager; HR can bring an internal
> employee who is currently on bench to the project. Prime and GSI can be
> both sell and buy — unlike the client, who only buys, from every other
> party, all of whom can be suppliers.

So the positions on a deal are:

| Party | Sells | Buys from |
|---|---|---|
| **Client** | never | everyone below |
| **Prime / GSI / MSP** | to the client | a sub-vendor by PO, **or its own W2 employee with no PO** |
| **Sub-vendor / bench** | to the prime | its own people |
| **Consultant** | is the person | — |

The buy side already knew this: `BuyContract.workOrderId` is nullable
because you do not raise a PO to your own employee, and `cyclesFor` writes
salary cycles where there is no vendor below and vendor-bill cycles where
there is. **The sell side did not, until 2026-09-17.** `SubmissionKind.INTERNAL`
sat in the schema with nothing computing it, and `POST /api/submissions`
demanded a `ConsultantProfile` and a consented `BenchListing` from every
person — a schema that knew and a route that forbade. It is computed now:
where the submitting firm holds an EMPLOYEE context for the person, the
door skips the listing, tells the employee, logs the read and writes
INTERNAL (`app/api/submissions/kind.ts`). Since 2026-09-30 matching also
brings a firm's own employees between projects to a job request, and they
go forward as INTERNAL from the match (`lib/match-pool`).

**What a prime needs that a staffing vendor does not**, in the founder's
words — building teams dynamically:

- **Its own bench**: employees between projects, visible to the delivery
  managers and HR who allocate them. Not a `BenchListing` — that is a
  consultant consenting to be sold; this is an employer's roster.
- **Internal mobility**: one delivery manager pulling a person from
  another's project as it winds down, and HR placing somebody from the
  bench, without a submission, an invitation or a marketplace between
  two desks of the same firm.
- **Submitting its own employee** to a client requisition as INTERNAL,
  alongside a sub-vendor's person as NETWORK, on the same requirement.

**The consent line — decided 2026-09-17.** CLAUDE.md's firmest invariant
is that a submission requires a bench listing the consultant granted. For
a W2 employee the employment contract *is* the consent to be assigned —
nobody asks an employee's permission to staff them on a project. But
recording an employee on a client's site, with their tenure and
paperwork, is not nothing, and neutrality is absolute here. So the
carve-out is narrow and the founder confirmed it in these terms: **an
employer may submit its own W2 without a listing; the employee is told,
not asked; the read is logged like any other.** "Own W2" means the firm
holds an EMPLOYEE context for the person — answerable from `Context`
today, no schema. A firm submitting somebody it does *not* employ still
needs the listing, the consent and `maySubmit`, exactly as before. The
invariant in "Invariants the database must enforce" reads accordingly.

---

## The bench is the difference, and it is built now — decided 2026-09-30

The founder, over the sequencing rule and saying so: *"Bench is our wow
factor and what differentiates us from the crowd. Let's do the bench
right and now."* So the bench is Phase 1 work, not Phase 2, and it is
the one supplier-side exception to "the client is the customer" first.

**Two kinds of bench creator, one flow for everybody else**, in his
words: *"The flow would remain the same for companies except for GSI
companies — bench creators can be project managers on different client
sites that are coming off their projects, while bench-based supplier
companies focus on a niche skill, offer trainings to attract people to
their bench, that they place with sub-vendors, prime vendors and
clients."*

- **An integrator's bench is its own people rolling off.** The creator
  is the project or delivery manager on a client site, flagging who
  comes off a project and when. This is the employer's roster from "Who
  sells and who buys" — its own W2s between projects, visible to the
  firm's other delivery managers and HR, redeployed internally without
  a submission, and submitted as INTERNAL where a client needs them. Not
  a consultant consenting to be sold: the employment is the consent.
- **A bench supplier's bench is its business.** It picks a niche skill,
  attracts people with training (`lib/training` already enrolls,
  starts, completes and drops), keeps them warm, and places them with
  sub-vendors, primes and clients. Every person is on it by their own
  consent (`BenchListing`), and every firm they are shown to is a grant
  they gave.
- **How an integrator's people move between its projects — decided by
  the founder the same day**, in his example: a project manager on one
  client's project in Portland publishes who is rolling off; another
  manager of the same firm on a different client's project in San Jose
  sees them, asks, and takes one into his open position. So:
  1. The releasing manager flags a person with the day they come off.
     They appear on the firm's **Our bench** with skills, place, free
     date and who is releasing them — seen by the firm's own managers
     and HR, never by any client, and one client never sees another's
     project.
  2. Another manager asks the releasing one (a thread inside the firm)
     and **reserves** the person for his position — one hold at a
     time.
  3. **The releasing manager confirms the date; the receiving manager
     places the person** — as INTERNAL on the new client's job request
     where there is one, or straight onto a line of his own project's
     existing order where the seat is his, starting after the old one
     ends. No approval from HR, **but HR is told of every flag, hold,
     release and move** (founder: "HR must be informed").
  4. A releasing manager may keep somebody — "staying with me until
     [date]" — and they read as free from that date.
  5. The person is told at each step, not asked: the employment is the
     consent. A move to another city says so.
  6. **A delivery manager may put the firm's own employee forward on a
     client's job request** (founder, 2026-09-30, "yes"), as INTERNAL —
     it is his people. A person the firm does not employ still needs a
     recruiting desk, the person's listing and consent, exactly as before.
- **Demo housekeeping, decided by the founder the same day ("yes to
  all").** The 569 seed rows found on visitors' demo sandboxes are
  deleted; the one tie that can be released is released and the six
  test bench listings inside visitors' sandboxes are deleted, so the
  live demo can be rebuilt with the newest data. None of it belonged to
  a real company. And **a visitor's demo sandbox is removed after 30
  days without use**, with a warning first where the visitor left an
  address, so sandboxes stop piling up and cannot tie the demo world
  down again.
- **Bench profit, next after the integrator flow — decided by the
  founder the same day** ("go"). A section on Our bench, read by the
  owner, admin and finance desks: **per person, bench to bill** — days
  on the bench times what those days cost under the firm's bench pay
  policy, against the margin earned since placement, and when they paid
  it back; **per niche or training group** — what the course cost, how
  many were placed, how fast and at what margin; and **for an
  integrator, utilization** — the share of its people billing against
  on the bench, across projects, with what an internal move saved
  against bench cost or a sub-vendor. It reads what Profitability,
  Bench burn and the reserve already compute and adds no money rule.
  A client never sees a supplier's margin; what reaches the client is
  the supplier's expertise evidence (Addendum D), built later.
- **Holidays on the bench are a company setting, off by default.
  Decided by the founder, 2026-10-03:** *"A company setting, defaulting
  to no-pay, and each candidate needs to be activated. GSI companies do
  autopay."* So a firm's bench pay policy does not pay a public holiday
  unless the firm turns holiday pay on, and then only for the people it
  switches on, one by one — a bench supplier's trainee is not paid for a
  holiday because the firm said yes for somebody else. An integrator
  (GSI) is the exception: its bench is its own salaried employees between
  projects, so holiday pay is on by default for all of them, and it may
  switch a person off. Who turned it on or off, and when, is recorded.
  Bench cost, bench burn and bench profit all count a holiday the same
  way from this setting, never from a rule of their own.
- **Bench profit per profile is one subtraction. Decided by the
  founder, 2026-10-08:** *"Bench profitability comes from client/customer
  billing for the timesheet or the period − vendor payment / employee
  payroll for the period − expenses − admin costs − commission, per
  profile."* So for each person and each period: what the client was
  billed for their signed weeks, less what was paid for them (a
  sub-vendor's invoice receipt or the firm's own payroll with its burden),
  less expenses the firm carried for them that were not billed on, less
  the firm's admin cost for the period, less the commission paid on the
  placement. Every term is a figure already on the record except admin
  cost, which is a company setting: the firm's **fixed costs for the
  period** (rent, software, back office — one figure a month), **allocated
  equally over the number of contracts live in that period** (founder, the
  same day: "can be fixed costs that's allocated by number of contracts").
  Read as "not set" until the firm enters it — the line then says the
  profit is before admin costs, never a guess. The bench cost
  (days on the bench under the bench pay policy) sits beside it as the
  thing the profit pays back.
  The founder, the same day: *"bench profitability on training is
  small."* So the per-training-group figures stay the one line they are
  (what the course cost, how many were placed, how fast, at what margin)
  and get no more build; the per-profile subtraction is the piece. One service computes it (money); the Bench
  profit screen reads it (supply).
- **Everybody else** — primes, sub-vendors, clients — receives bench the
  same way: they say what they want, see who is offered, and put a
  person forward to their own job request.

Neutrality still holds: Etyme runs nobody's bench and places nobody.
The firms do; the record carries the consent, the offer and the trail.

**How bench reaches a job — the founder, the same day:**

> Rarely would end clients be interested in seeing the bench, but if
> they have a great relation the bench creator can share the bench via
> email. We have a matching feature that will bring available and
> matching bench to requirements, with priority to existing vendors,
> that they can add to the application. In case the matching bench is
> not a vendor, client-side recruiters can request creators to be added
> as prime vendor or sub-vendor and work through their MSP or prime
> vendor, or designate Etyme as prime vendor and work with them.

- **A client does not browse a bench.** The bench comes to the client
  through **matching on a job request**, not a bench page. Where a
  creator has a close client, it may send its bench by email — a
  consented share like any other, logged.
- **Matching brings available bench to a job request, existing
  vendors first.** A match from a firm already on the client's supplier
  panel ranks ahead and can be added to the application in one step.
  Every match carries its reasons (factors, basis, confidence,
  unknowns), per the invariant.
- **A match from a firm that is not a vendor is a door, not a
  dead end.** The client's recruiter asks for that firm to be added —
  as a prime vendor or as a sub-vendor under the client's MSP or an
  existing prime — and it walks supplier onboarding like any other
  firm before its person can be submitted.
- **Etyme is never a prime vendor. Decided by the founder, the same
  day:** *"Etyme can be an MSP and not prime vendor. Etyme at all times
  should maintain neutrality."* So a firm that is not yet a supplier
  comes in as a prime vendor or as a sub-vendor under the client's MSP
  — which may be Etyme's own program office — or under an existing
  prime. Etyme never holds the contract for a person, never bills for
  one and never pays one.
- **Bench is shared only between firms that already trade**, one rung
  at a time (the founder, the same day). A sub-vendor's name stays the
  prime's to keep. A share by email follows the same rule.
- **A person chooses how long they stay on a bench** (founder, the
  same day): *"Allow candidate to stay on bench for 5, 7, 15, 25, 50, 60,
  500 days or until cancelled."* The choice is the person's, made when
  they say yes and changeable later from their own page; "until
  cancelled" is the default, so saying yes is never a second question.
  When the time runs out the listing ends by itself: they leave every
  match and cannot be put forward, and a submission already made stands.
  They are reminded before it ends and can renew in one tap; the firm is
  told when it ends.
- **The words, chosen by the founder the same day** (he found
  "Received bench" and "Bench wanted" unclear and not a pair): a firm's
  own people are **"Our bench"**; the people partner firms offer it are
  **"Partner bench"**; and what it asks partners to offer — skills,
  places, rate range and the desk that receives — is **"What we need"**,
  shown at the top of Partner bench. "Received bench" and "Bench wanted"
  are not used anywhere.
- **Matching may suggest a firm that is not a supplier yet; sharing
  may not reach one.** Decided by the founder, the same day. A match
  from a non-supplier is a suggestion only: the client sees the firm,
  the skills, availability and the reasons — never the person's name or
  rate — and cannot submit or contact the person. Its one action is
  "ask to add this firm", which walks supplier onboarding under the
  client's MSP or an existing prime. A person appears this way only if
  they agreed that their bench firm may show them in matches beyond the
  firms it already trades with.

## One week, filed once by the worker, signed at the top — decided 2026-09-28

The founder, asked whether a supplier may file hours on a worker's
behalf and whether a new consultant is marketed by default:

> Yes to marketed by default, worker files their own week only or
> worker take the one approved at highest level can be attributed to
> another lower level contracts in another company. Worker knows the
> complete chain.

Three rules follow:

- **Only the worker files the week.** No supplier, prime or client desk
  enters hours for somebody else. `mayEnter`'s allowance for a vendor
  holding `timesheets.read` to file on the worker's behalf is withdrawn.
  CLAUDE.md station 6 already said this; the code did not.
- **One week, one filing, one signature at the top, attributed down.**
  In a chain the worker files once, and the week the client approves at
  the highest rung is the same week every lower rung bills and pays
  from, in every company below it. Nobody re-keys it per rung and no
  rung holds a second copy. That is what `lib/money` already does —
  each rung bills the same signed hours — and it is now the stated rule
  rather than an implementation detail. A week filed on a rung that is
  not the worker's own is refused (`rungsToFile` in
  `lib/consultant-portfolio`).
- **The worker knows the complete chain.** Their own page shows every
  firm between them and the client, by name. The NDA protecting a
  sub-vendor's name is about the *client* not learning it; the worker
  is employed through it and already knows. Rates of rungs the worker
  is not party to stay closed.

- **The signed week travels down the chain, and each rung accepts it
  in turn.** Asked whether the client's signature is enough for every
  supplier below to pay, the founder, the same day: *"Supplier still
  accepts it on its own, or gets forwarded the worker's approved
  timesheet to approve, and the flow continues."* So the client signs
  first; the signed week is then forwarded to the next rung down, which
  accepts what it pays; then to the rung below that, and so on to the
  worker's employer. No rung pays on a week it has not accepted, no rung
  accepts before the rung above it signed, and every rung accepts the
  same week — never a re-keyed copy. Each rung is told when the week
  reaches it.

- **A client may approve by email, and the proof travels down the
  chain. Decided by the founder, 2026-09-30** (on sharing a worker's
  hours with every layer and attaching evidence "in case client
  approval is required or evidence to bill… once email is approved",
  then: "select contracts to apply — once approved by top layer, lower
  layer can approve too"). Two ways a week is approved at the top
  without the client signing in: a one-time **"Approve by email"**
  link to the client's approver (Approve or Send back, no account,
  recorded as their signature with name, address and time); or
  **evidence attached** — the client's approval email, a PDF or an
  export from its own system — with the approver's name and address
  entered — **always a named person behind it**; evidence without the
  approver's name and address is refused. **Either the worker or the
  supplier's timesheet desk may attach it** (confirmed by the founder
  the same day). Whoever attaches it **selects which contracts in the chain
  it applies to**, all of them by default. Once the top layer's
  approval stands, each lower layer accepts the same week in turn, as
  before. A week approved by evidence says so ("Approved by email:
  Dana Whitfield, Oct 2 — evidence attached"), never that the client
  signed in Etyme; every rung it applies to sees the evidence, and no
  rung sees another rung's rate.
- **What each rung may bill, and when. Decided by the founder,
  2026-09-28** ("1 yes, 2 A, 3 block"):
  1. **A firm bills only the hours the firm above it accepted.** If
     Computer Systems accepts 38 of Helena's 40, Techpeple's bill to
     Computer Systems — generated in Etyme or uploaded — is for 38.
     Generation prices the payer's accepted hours, not the hours worked.
  2. **A firm bills upward on the client's signature**, without waiting
     for the rungs below it to accept. Its own invoice receipts from
     below clear the three-way check when those rungs have accepted; the
     bill upward is not held for them.
  3. **A week the paying firm has not accepted blocks the invoice
     receipt that includes it.** No "approve anyway with a reason" for
     it: accept the week first. Addendum E's WARN-and-proceed does not
     apply, because paying for hours nobody accepted is what the check
     exists to stop.
  4. **When fewer hours are accepted than were worked, the cut comes off
     overtime first, and off the later bill first.** Decided by the
     founder, 2026-09-29. An acceptance records a week's total, not
     which hours; this rule prices the cases that were left off the bill
     rather than guessed at — a week over the overtime line, a week
     crossing a bill's edge. A partial acceptance covering only some days
     is priced on the days it covers.

- **A pay change mid-contract. Decided by the founder, 2026-09-29:**
  *"Follow US law as recommendation, but allow for user input if they
  want to change."* Every hour is paid at the rate in force on the day
  it was worked. Overtime in a week paid at two rates uses the US
  regular rate — the week's straight-time pay divided by its hours
  (29 CFR §778.115) — as the default; a paying firm may choose another
  method for a line, and the choice is recorded with who made it and
  why. A raise dated in the past has its back pay worked out and put
  forward as a one-off payment for a desk to approve, never paid
  silently. The worker is told when a new rate is approved.
  Then, the same day (founder: "yes to all"): the firm's choice of
  overtime method is stored on the pay line with who chose it and why;
  a non-exempt US worker is owed overtime after 40 hours a week even
  where the contract sets no line, because the law sets it; and when an
  employer accepts fewer hours than were worked, the cut comes off the
  worker's **ordinary hours first**, so the worker keeps their overtime
  — the opposite of the billing rule, on purpose, because on the bill
  the firm is protecting its client and on pay it is protecting its
  worker.
  Two more, the same day. **An acceptance at or under the line is the
  hours worked:** where the employer accepts 40 hours or fewer of a
  longer week, those hours are paid at straight time (38 accepted pays
  38 at straight time); above the line the worker keeps their overtime
  as above. **Who owes what, and when:** once the client approves a
  week, the client owes it — to the firm it pays, on that firm's bill.
  Once the employer (or the vendor above the worker) accepts it, having
  checked the client's approval, the employer owes the worker, due on
  the worker's own payment terms. So the worker's page says "owed to
  you" only after the employer's acceptance, with the date it falls due;
  a week the client has signed and the employer has not yet accepted
  reads as waiting on the employer, never as owed.
  **Overtime on a cut week, and it is a setting. Decided by the founder,
  2026-09-30** ("go with your recommendations, but keep settings user
  configurable"). The default is **overtime only on the accepted hours
  above the line**: 41 of 45 accepted pays 40 + 1 at the premium, 42
  pays 40 + 2 — no jump at the line and exactly what the law requires.
  A paying firm may instead choose **"keep the week's overtime"** (the
  ordinary-first rule above: 41 pays 36 + 5) for a pay line, recorded
  with who chose it and why, the same way the overtime method is. At or
  under the line is straight time either way.

- **A week runs Sunday to Saturday, and the weekend can be filed.
  Decided by the founder, 2026-09-30** (with a US calendar as the
  picture): *"Weeks should run from Sunday to Saturday. Typically they
  are both holidays in the US, but they should be able to file hours
  for exchange of pay or hours."* So a timesheet week, the week the
  overtime line counts over, and a seeded week all start on Sunday and
  end on Saturday. Saturday and Sunday are days off by default — not
  expected, not counted as missing — but a worker may enter hours on
  either, and those hours are paid like any other (overtime past the
  line included). "Exchange of hours" is read as moving a day inside the
  same week (a Saturday worked in place of a Friday off), which needs
  nothing special. Banking weekend hours as time off *instead of* pay is
  not offered to a private employer's non-exempt worker by default,
  because US law does not allow comp time in place of overtime pay
  outside the public sector; if a client asks, it is a setting with the
  law said beside it, not a default.
  **And weekend work is normal, not an exception** (founder, the same
  day): *"In India too it's normal for people to work Saturdays to help
  a release."* So a Saturday or Sunday entry is never flagged, held or
  questioned for being on a weekend; it is checked like any other day
  (against the contract's hours and last day). Which days are off by
  default is the **site's calendar** — the tenant → entity → site rule
  above — so a US site defaults to Saturday and Sunday off and an
  Indian site can mark Saturday as a working day. Overtime follows the
  country: the US line is 40 hours in the Sunday-to-Saturday week; an
  Indian worker's overtime is set by state law (commonly past nine hours
  a day or forty-eight a week, at twice the ordinary rate) and is
  `etyme-regulatory`'s to confirm before any Indian pay line prices it.
  **Which days are off is a setting, not a rule** (founder, the same
  day): *"If a company is in Dubai they would have Friday off — this
  should be a configurable setting."* So the days off are a company
  setting now, defaulting to Saturday and Sunday, and move to the site
  when the legal-entity and site layer is built. A company may mark any
  days off — Friday alone, Friday and Saturday, or none. The week still
  starts on Sunday for everyone until a paying client needs another
  start; the days off decide what is expected and what a date shifts
  around, never what may be filed. Worth knowing, not deciding here:
  the UAE federal government moved to a Saturday–Sunday weekend in 2022
  and many private firms followed, so a Dubai company may say either,
  which is exactly why it is the company's to set.
  **When a Sunday-to-Saturday week is due** (founder, the same day: "your
  recommendation is default, but companies can choose to change their
  settings and take up to an additional week to approve"). By default
  a week's hours are due on the Monday after it ends and are approved by
  the Wednesday, so weekend work is in before anybody signs. A company
  may change both, and may give its approvers up to **one extra week**
  (approval by the following Wednesday at the latest), never more. A
  longer window is refused in a sentence, because every day an approval
  waits is a day the bill and the pay wait behind it. These are answers
  the setup asks for (see the onboarding decision), recorded with who
  set them and when.
  **Payroll is run by pay period, and biweekly is the common one**
  (founder, the same day: "many payroll calculations happen
  bi-weekly"). So a payroll run is always for one of the line's own pay
  periods — never "a month" laid over a weekly or biweekly line, which
  paid one week and called the month done. A biweekly period is two
  Sunday-to-Saturday weeks; overtime is still counted per week inside
  it, never averaged over the two. The default for a US employer is
  biweekly, the period ending on a Saturday and paid on the Friday
  after; monthly and semimonthly are choices the setup offers, and some
  states require pay at least twice a month, which the setup says
  beside the choice. A biweekly year has 26 pay days, and 27 in some
  years; a salaried line divided by pay days must say which.

- **The Sunday-to-Saturday week is built, 2026-10-06.** Until this day
  every line above was a decision and the code still said Monday:
  `weekStart` in `lib/overtime` returned the Monday, the worker's own
  page offered Monday-to-Sunday weeks, every seed wrote Monday-to-Friday
  sheets, and the hours packs asked for hours on Friday. Now one function
  decides the week for pay, billing, approvals, filing and the seeds
  (`weekStart`/`weekEnd`), and the packs ask for a week's hours on the
  Monday after its Saturday and the approval on the Wednesday. Two things
  learned on the way, written down so they are not re-derived:
  - **The weekly pack line is expressed as "Friday + 3", not "Saturday
    + 2" or "Monday".** Measured over 2,401 contract shapes: a Saturday
    period boundary drops the last week of every contract ending Sunday
    to Friday — the ordinary Monday-to-Friday placement — and a Monday
    boundary writes a date before a Monday-starting contract begins. The
    dates are the same Monday and Wednesday either way; only the reading
    differs, and the comment beside each line says so.
  - **Days off, hours-due day, approve-by day and the one extra week are
    company settings now** (`Company.daysOff` and friends, one door in
    `lib/days-off`, `PATCH /api/settings/week`). The setting is stored and
    refused in sentences; what does not yet read it is listed on matrix
    row L3.2.2.12 — cycle dates still shift around Saturday and Sunday
    until money passes the company's days into `shiftToWorkingDay`.
  **Three questions asked on the 6th and decided the same day** (founder:
  "go with your recommendations"), now built:
  - **A straddle rule judges a week by its hours.** Under START a week
    bills in the month of its first worked day; under END its last. An
    empty Sunday or Saturday never moves a week. SPLIT is unchanged.
  - **Weekly and biweekly pay periods start on a Sunday.** A biweekly
    period is two Sunday-to-Saturday weeks, the first counted from the
    Sunday on or before the contract start, so a midweek start has a
    short first period that still ends on a Saturday.
  - **The payroll export takes a sheet by overlap** and pays only the
    days inside the window. The IRS deposit date keeps Saturday and
    Sunday, because that is the bank's week, not the firm's.
  Still true: a stored overtime decision keyed to a Monday matches no
  week, so a live world seeded before the 6th must be dropped and
  reseeded.
- **Payroll is the company's choice. Decided by the founder,
  2026-10-07:** *"Give choice to businesses when they want to configure
  payroll."* This answers the Wednesday-or-Thursday question: neither is
  a rule. The recommendation is the default and a company changes it on
  its settings page: pay period (weekly, every other week, twice a
  month, monthly), the day pay is worked out and the day it is paid,
  recorded with who set it and when. Defaults: every other week, worked
  out the Wednesday and paid the Friday after the period's Saturday;
  monthly at month end (the 28th means month end), worked out on the
  25th. Pay
  can never go out before it is worked out. Beside the monthly choice
  the screen says, as a fact and not a rule, that some US states require
  pay at least twice a month; making that a rule per state is
  regulatory's. The setting is one door (`lib/payroll-settings`), and
  the cycle generator reads it over the pack's salary lines.
- **Setup asks five things, then stops. Decided by the founder,
  2026-10-07** ("Ok go", on the finding that production had no sign-in
  door and setup asked one question). After the first sign-in a new
  company walks the five steps the prototype drew: sign in; your company
  (country, currency, type, name); how you work (the week and payroll
  panels, defaults pre-filled, the state note beside twice a month);
  your people (import a file, or skip); your team (invite, or skip).
  Every answer has a default, so a company may click through in a
  minute; what it answers is recorded with who and when. A colleague who
  signs in on a claimed domain gets a seat with a default role at once,
  and the owner is told who joined and what to give them. "Add company"
  and first sign-in create a company through one function, so both get
  the same pack, roles, location and holidays. Turning sign-in on is the
  founder's: the Microsoft and Google app keys and the email server go
  into Vercel; `/ready` says so until they do.
- **A password door, until the single sign-on keys exist. Decided by
  the founder, 2026-10-08:** *"Focus on sign up with email, password,
  subdomain for company and email and password for candidate — good
  where companies don't want to integrate with Microsoft and Google
  directly."* So two sign-up forms: a company signs up with a work
  email, a password and an **Etyme address** (`acme`), and a candidate
  with an email and a password. The address is the tenant for a company
  that has not verified a domain; it may verify its email domain later,
  and until then colleagues come in by invitation or by signing up with
  the same address and being seated as Member. A verified email comes
  before anything else; passwords are hashed with a slow hash, never
  logged, reset by a one-time link, and failures slow the door down. The
  Microsoft and Google doors stay and win when their keys arrive: a
  company that signs in that way with a domain matching an address's
  verified domain joins that tenant. `/ready` counts a password sign-in
  as a real sign-in once a real person has used it.
- **Months served are whole months, never rounded up. Decided by the
  founder, 2026-09-29.** Rounding to the nearest month read 533 days as
  18 months, so three screens said "past the limit" two weeks before the
  block fired. A person has served n months once their days on site
  reach the fewest days any n consecutive calendar months can hold (28,
  181 for six, 365 for twelve). The block itself still counts days
  against the limit and is unchanged.
- **A contract's last day is a day on site, and the break starts the
  day after it. Decided 2026-10-08**, found by round six of the sign-up
  walk: `lib/tenure-days` did not count a contract's end date, so Kwame
  Mensah read 740 days where his dates span 741, and each contract moved
  the time-limit date one day later. Now the start and end day are both
  counted, a day on two lines is still counted once (a handover day
  included), and a 90-day break is 90 days off site, counted from the day
  after the last day. Both moves are in the client's safer direction: the
  limit is reached one day earlier per contract, and "may come back"
  falls one day later (Kwame: Nov 18, not Nov 17; Lucía reaches eighteen
  months Feb 6, 2027, not Feb 7). Made by the coordinator on the
  founder's behalf as the safer reading; **the founder may reverse the
  break's start in one line** if the trade counts the break from the
  last day itself.

And: **a consultant a firm adds is marketed by default**; the firm may
choose to retain them, and nothing reaches past the firm until the
consultant grants it.

## Agreement, order, contract — one document, a header and its lines

A recurring confusion, settled here so nobody has to guess: **a sell
contract is not an order, and a buy contract is not an order either.**
Three layers, each answering a different question.

| Layer | The question it answers | Sell side | Buy side |
|---|---|---|---|
| **Agreement** | Are we allowed to trade at all? | `MasterAgreement` | `MasterAgreement` |
| **Order** | How much may be spent, on what, by when? | `WorkOrder` | `WorkOrder` |
| **Contract** | What rate, for which person, for how long? | `SellContract` | `BuyContract` |

Two sentences carry the whole distinction:

- **An order carries a ceiling. A contract carries a rate.**
- **An order is about money. A contract is about a person.**

### It was six, and one of them was two rows for one document

**Corrected 2026-09-17, by the founder, in two statements an hour apart:**

> Work order is not separate from PO — the client gives it to the
> supplier and it agrees rate, duration, resource and location of work.

> The PO on the client side is the sales order on the vendor side.

So the order layer is **one commercial document with three names**
depending on which end of it you stand at: the client raises a **purchase
order**, the supplier receives it as its **sales order**, and the trade
calls the whole thing a **work order**. The product modeled that as two
rows, `PurchaseOrder` and `SalesOrder`, and the two were not duplicates —
each carried what the other lacked, which is why neither could be deleted
without moving fields.

**Only the thin one was ever written.** Nothing anywhere had created a
`SalesOrder`, and three things followed from that, one of them costing
money every night:

- **Auto-approval of timesheets could never fire.** `cron/auto-approve`
  reads `autoApproveTimesheets` off the order. No order row existed to
  carry it, so the flag was false on every timesheet in the world and the
  nightly job approved nothing from the day it was written.
- **Milestone billing was unreachable**, and the Milestones screen was
  permanently empty for every user.
- **The four-party split was unreachable** — a client that signs in one
  entity, is billed through a shared service center, has the work done at
  a third site and pays from a fourth. The first thing a large enterprise
  asks for.

One row now: **`WorkOrder`**. The name is the trade's own and belongs to
neither end, which is the point — `lib/order-naming` decides what each
reader is shown, and nothing user-facing ever says "work order" to
somebody who is a party to it. The URL stays `/api/purchase-orders` and
the event stays `purchase_order.raised`, by the same precedent that kept
the demo slug `world-nike`: an address is not a word anybody reads.

### Corrected again, 2026-09-18 — one document, a header and its lines

The founder, the morning after the order merge:

> Sell contract (how sales documents flow from the upper layer to the
> company) and sales order (how money flows, the rules) are duplicated.
> Buy contract and purchase order are also duplicates. Master contract
> is something that links both for profitability analysis. We don't
> need a master contract if there is no budget profile — sell PO linked
> to buy PO or payroll.

He is right, and the section above over-defended a split that is real
in the tables and wrong in the product. The evidence is in the schema:

- **Six fields are carried on both rows** — `billFrequency`,
  `billAnchor`, `billStraddle`, `paymentTerms`, `startDate`, `endDate`
  sit on `WorkOrder` *and* on `SellContract`, and nothing reconciles
  them. `BuyContract` repeats the set against its own `workOrderId`.
  Two places for one fact is one wrong number waiting.
- **The award still never sets `workOrderId`.** A person awards, a
  contract appears, no order is raised or required. That is the exact
  symptom of a duplicated object: one half is never written, and it
  took a seed audit to notice that `WorkOrder` had zero rows for the
  life of the product.
- **`SellContract` has four optional parents** — `msaId`,
  `engagementId`, `workOrderId`, `projectOrderId` — four different
  attempts at "which deal is this part of."

**The resolution — and the swim-lane drawing already had it before the
prose did:** a purchase order is a **header and its lines**.
The header is the commitment to a counterparty — who, ceiling, dates,
terms, the four partner functions, whether silence approves a week. A
line is one person at one rate at one site. There is no "buy contract"
beside the order's line; the line *is* the contract for that service,
and the timesheet receipt posts against it. The sell side is
the mirror: a sales contract as the header, sales order items as the
lines, one item per worker.

So the words change and the two rows stay:

| The trade says | The row | What it is |
|---|---|---|
| **Purchase order · sales order · work order** — one document, three names | `WorkOrder` | the **header**: counterparty, ceiling, dates, terms, partners |
| **a line on it** — this person, this rate, this site | `SellContract` / `BuyContract` | the **lines**: per person, carrying the rate and everything that hangs off a person |

**What a line does — the founder, later the same morning:**

> Sell contract will bill customer. Buy contract will pay supplier or
> run payroll for candidate.

That is the reason the lines stay rows: **each is the source of one
direction of money.** The sell line is what the firm bills from — it
carries the bill rate and the hours the customer signs, and AR raises
the bill against it. The buy line is what the firm pays from — to a
supplier by invoice receipt where a sub-vendor is below, or to the
candidate by payroll where the firm employs them — and `cyclesFor` in
`lib/cycle-kinds` already writes vendor-bill or salary cycles on exactly
that split. The header carries the ceiling and the terms; a line carries
a rate and moves money one way.

It is also why "sell contract" and "buy contract" are the founder's own
words and may appear on a screen — **as lines of a document, never as a
document of their own** with a page, a number and a flow beside the
order. A screen that offers "New sell contract" as a thing to create
standalone has reintroduced the second document.

**What this fixes, in order:**

1. **One document on every screen, created once.** The award writes the
   header and its first line together. A single-person deal — most of
   them — is a header with one line, and the person never meets two
   things. Five people on one PO is one header, five lines. A W2 is a
   line whose header is the firm's own, with no external number,
   because you do not raise a PO to your own employee; an employee is
   a person on the payroll, not a vendor.
2. **Four of the six fields are the header's; the two dates are the
   line's.** Corrected by `etyme-money` on 2026-09-19 against the
   seeded world, and ratified. The billing rhythm and the net days —
   `billFrequency`, `billAnchor`, `billStraddle`, `paymentTerms` — are
   read from the document the line is on, because a line's own copy
   cannot report its silence: those columns carry schema defaults, so
   `MONTHLY` on a line may mean "agreed" or "nobody asked", and a value
   that cannot say it did not say must not beat one somebody typed.
   **`startDate` and `endDate` stay the line's**, because a line is a
   person and an order is not — a line's start is never a default, it
   is the day *this person* starts. The header's window is *reported*
   beside the line's dates and never applied: twenty-nine seeded lines
   end a month to a year before their order does, on purpose, because
   an order that closes the day the work does cannot carry the final
   invoice, and reading the header's dates onto them would have billed
   a fortnight's placement for thirteen months. A line outside its
   order's window is a sentence on the screen, not a correction.
   `lib/money/order-terms` is the one door (`termsFor`, side explicit),
   and `terms-through-one-door.test.ts` fails on any reader in any
   domain that decides a period from a line's own copy.

   Two things the work surfaced, written down so they are not
   rediscovered: the header and the line did not even share a
   vocabulary for the same four fields — `CONTRACT_START` against
   `CONTRACT`, `TO_LATER` against `END` — which is its own evidence
   nothing had reconciled them; the helper translates, and one
   vocabulary is an enum change for the architect. And `billFrequency`
   decides what an *invoice period* is and nothing else: cycle dates
   come from the template pack, so a header that says WEEKLY does not
   yet move an hours-due or a pay day. Making the document's rhythm
   reach the cycle dates is real, separate money work, documented in
   `lib/contract-cycles`.
3. **The MSA is the legal umbrella and nothing more, and it is
   optional.** No route requires one today; `Engagement.msaId` is the
   one hard dependency and it becomes optional too. A client that sends
   one PO and a contractor should never be made to paper an agreement
   first. "We don't need a master contract if there is no budget
   profile" is exactly right.
4. **The thing that links sell to buy for profitability already
   exists, and it has a name — the 2017 one.** It is `ContractLink` (a
   sell line joined to the buy line that funds it) settling into
   `ProjectOrder` (the roll-up). The founder calls the roll-up the
   **master contract**, and that is what a screen calls it. See "The
   master contract" below.

**What survives from the argument above**, restated as header and
lines rather than as two objects: an order still carries a ceiling and
a line still carries a rate; a header still covers five people where a
line covers one; a W2 line still has no external PO. Those were true.
They were reasons to keep two *rows*. They were never reasons to show
two *documents*, and the section read as if they were.

### The master contract — the 2017 word, kept, and made optional

The founder, on where the two lines came from:

> Our original contract form in Etyme-2017 had these both under one
> form under master contract, but now we are splitting them and letting
> companies tag them to master contract if they want to see contract
> profitability.

The archive (`763c6f57`) bears it out exactly. `LEGACY_RULES.md` §2.1:
a single `Contract` was *"the master container"*, polymorphic on a
Company or a Candidate, and every one spawned two children — a
`SellContract` holding `customer_rate` and a `BuyContract` holding
`payrate`, numbered `SC_` and `BC_`. The 2018 migration then flattened
both onto **one row** — `customer_rate` beside `payrate`,
`buy_company_id`, `b_time_sheet`, `b_show_accounting_to_employee`, the
`b_` prefix marking the buy side — so margin was a subtraction on the
row. A child's invoice created its parent's: *"margin = parent total −
child total"* (§4). That is the form he means.

**So "master contract" is the trade's word — this trade's, since 2017
— for the profitability roll-up, and it is kept.** What changes is that
it is no longer the container every contract is born inside. The lines
come first; the master is a tag.

| Level | The word | The row | Optional? |
|---|---|---|---|
| a sell line and the buy line that funds it | **the pair** — a placement's own margin | `ContractLink` | no — written by the award, because a buy line always pays for some sell line |
| several pairs a company reads as one deal | **master contract** | `ProjectOrder` | **yes** — a company tags lines to one when it wants to see contract profitability; `projectOrderId` is nullable on both lines |
| the legal umbrella between two firms | **agreement · MSA** | `MasterAgreement` | yes, since this morning |

**Two words, never confused on a screen.** `MasterAgreement` is shown as
"Agreement" or "MSA" today — thirteen and two occurrences, and "master
agreement" spelled out nowhere — and it stays that way. "Master
contract" is the roll-up and nothing else. A screen that puts "master
agreement" beside "master contract" has made two things sound like one.

**What is already built, and what is not.** `ProjectOrder` exists,
carries `budgetCents` — the founder's "budget profile" — and a kind
(time-and-materials, fixed price, milestone, retainer). `orderFor` in
`lib/order-postings` groups lines into one **by engagement**, so six
consultants on a project share a bucket, and every posting settles into
it. What is not built is the name a person recognizes, and the
**choice**: today the system decides the grouping, where the founder
wants the company to tag a line to the master it belongs to — or to
none. That is `etyme-money`'s screen work after the current pieces land,
and it needs no schema.

**What 2017 got wrong, stated so it is not rebuilt.** The master was
mandatory, so a firm recording one contractor on one PO had to paper a
container it did not want. And the propagated invoice let the parent's
rate and the child's total disagree with the hours between them. Etyme
bills each rung on the same signed hours through the chain instead, and
the master *reads* what was posted rather than creating anything.

**Sequencing.** This is a schema move and queues through
`etyme-architect`. The cheap half — award creates the header, the six
fields stop being written to lines, the screens show one document with
lines, `Engagement.msaId` goes optional — needs no table dropped and
should go first. Whether the tables themselves merge afterwards is a
question to answer with a paying client's data in the system, not
before.

### Billing and paying follow the agreement between each pair — decided by the founder, 2026-10-18

*"AR and AP is always based on the agreed MSA between client and
supplier and supplier and subvendor/candidate."* So every rung bills and
pays on its own agreement, never on a rule the platform sets:
- **What a firm bills upward** (AR) follows its agreement with the firm
  above: the client and the prime, the prime and the sub-vendor.
- **What a firm pays downward** (AP or payroll) follows its agreement
  with the party below: the sub-vendor's agreement, or the candidate's
  own contract or employment agreement.
- **The terms are the agreement's**: when a bill is raised, the period it
  covers, the net days and what they run from, the currency. A twin that
  drafts a bill drafts it on that agreement's date for that agreement's
  period, and never earlier than the week was signed above.
- **Built the same day:** every term — rhythm, net days, what they run
  from, currency — is read agreement first (`agreementFirst` in
  `lib/billing-cascade`, `termsFor` in `lib/money/order-terms`); the order
  and the line differ only with a recorded reason. The supplier's twin
  drafts a bill the day after the agreement's billing period ends, from
  weeks signed above, through the Bills page's own generator, and asks
  for a yes to send it (`lib/money/supplier-bills`). It acts on the
  Owner's authority, so Accounts Receivable, Finance or Admin say the yes
  (coordinator's call, reversible).
- This qualifies "the MSA is optional" above: where two parties signed
  no separate MSA, the order or the contract between them is their
  agreement, and its terms govern the same way.
- **The agreement sets the terms; an order or a placement may differ
  only with a reason recorded** (founder, the same day: "go with your
  recommendation, build it"). A one-off deal still works, the reason and
  who gave it sit beside the term, and the screen says which document set
  each term. A difference with no reason is refused in a sentence.
- **Built in this order:** the rhythm onto the agreement and the reason
  on a difference (architect); one cascade, agreement first, read by
  billing, paying and the twin (money); the supplier's twin drafting the
  bill on the agreement's date for Accounts Receivable to send, and a
  sent-back bill landing as a card (money, conversation); then Ask Etyme
  for workers.

**Four decisions on the founder's "go with your recommendations",
2026-10-19**, each reversible in a sentence:
1. **An expense is accepted like a week.** The worker's employer approves
   it for reimbursement; each firm above accepts it before it pays it,
   the client first and then down the chain, nobody accepting their own;
   whether a kind of expense is billable comes from the agreement between
   each pair, not from the supplier's own flag. Today only the firm that
   raised the expense approves it, and the payer never does; that is the
   gap this closes. Schema: an acceptance per firm on the expense, and
   billable kinds on the agreement (architect), then money.
2. **Where nobody but the Owner sends bills, the Owner may say yes to
   the twin's bill in Ask Etyme.** "Nobody signs their own" protects money
   going out; a bill is a request for money coming in, and the Owner is
   reviewing the machine's draft, not their own work. The exception
   applies only when no other seat at the firm holds `invoices.issue`,
   and the ledger records that it applied. Anywhere a second person
   exists, that person says yes and the Owner still cannot.
3. **A sub-vendor's overtime is priced on the decision made when the
   client signed the week**, carried down the chain the way the hours
   already are; never on the sub-vendor's own contract alone.
4. **On a cut week, a sub-vendor's invoice loses overtime first**, the
   same as every bill, because to the firm paying it, it is a bill. The
   worker's own pay keeps the pay rule, which since 2026-09-30 is:
   overtime only on the accepted hours above the line by default, and
   "keep the week's overtime" (ordinary hours cut first) as a setting
   the paying firm may choose, recorded with who and why. (Corrected
   2026-10-20: the first version of this line said the worker's pay
   "keeps the opposite rule, ordinary hours first", which was the
   2026-09-29 default that 2026-09-30 superseded; the simulation found
   the two lines disagreeing.)

**And the privacy notice and DPA name the saved Ask Etyme conversation**
(founder, the same day, "go with your recommendations" on the lines
shown to him): a row in sections 3 and 10, four words in section 11,
two cells of the DPA's section 3, "Last updated" October 19, 2026 — a
fact correction, nothing else moved.

### Why collapsing the layers still breaks real cases — read now as header and lines

**A sell contract is per person; an order is not.** One order for a
five-person project produces five sell contracts. That survived the merge
unchanged and is the reason the order layer exists at all — treating them
as one object makes a five-person project impossible to bill as one
commitment.

**A buy contract to a W2 employee has no order.** You do not raise a
purchase order to your own employee. This is the clearest proof they are
different things: `BuyContract.workOrderId` is nullable precisely because
roughly half of all buy contracts have none. Where there *is* a
sub-vendor, the buy contract and the order describe the same commercial
relationship from two angles — the contract carries the rate, the order
carries the ceiling it draws down — and linking them stops the two
records disagreeing.

**An order belongs to whoever pays.** `WorkOrder.issuedById` is the
buyer, which is why one model serves both directions:
`SellContract.workOrderId` is the *client's* order authorizing spend with
us; `BuyContract.workOrderId` is *our* order authorizing spend with a
sub-vendor. Same model, opposite direction, and which direction a reader
is looking from decides whether the screen says "purchase order" or
"sales order".

### And the two that are neither

- **`Engagement`** — the project or statement of work under an
  agreement. Groups several people and several contracts.
- **`ProjectOrder`** — the cost object that accumulates actual revenue
  and cost. Not a commercial document at all; nobody signs one. See the
  note on `InternalOrder`, which is the client's own coding and an
  interface value only.

### The invariant that is not yet enforced

A `BuyContract` with `contractType: W2` and a `workOrderId` set is a
contradiction — a purchase order raised to an employee. `POST
/api/contracts` refuses it on the way in; nothing refuses it on an
update. It belongs in `etyme-money`'s next piece of work.

---

## Bill, invoice receipt, payroll — the party who issues a document names it

**Decided 2026-09-17, by the founder**, over three statements. The
first:

> Use bill for customer and invoice for vendor/supplier payment and
> payroll for employee across the system.

Read alone that sounds like an inversion of what accounting software
says, and it was briefly written down here as one. It is not. The second
statement corrected the reading:

> Companies bill (also called invoice) a customer. Companies do
> invoice-receipt for supplier and payroll for employees.

**"Invoice receipt" is the word an enterprise finance team already
uses** for the step where a supplier's invoice is received and matched,
so the vocabulary settles on words the buyer already knows:

| Direction | Etyme says |
|---|---|
| **Out to the customer** | **bill** |
| **In from a supplier** | **invoice receipt**; the supplier issues its invoice, we receive it |
| **To our own employee** | **payroll** — never billed, never invoiced |

**The rule underneath:** the party who *issues* a document names it. We issue the bill, so
we bill. The supplier issues its invoice, so we do not raise one — we
receive it. An employee issues nothing, so payroll is neither.

**The half that is wrong in the code today is the supply side.** The
client document is a `Bill` and the code calls it an `Invoice`, which
the founder's own parenthesis permits. But `VendorBill` is wrong twice
over: what a sub-vendor sends is **its invoice**, not a bill, and "bill"
now belongs to the customer direction. A screen reading "Vendor bill to
raise" has the wrong party doing the wrong thing.

### The receipt is the timesheet

Worth stating because it falls straight out and the app half-built it
already. A three-way check matches an order against a **receipt** of
what was delivered and an **invoice receipt**. Nothing is delivered in a
staffing firm, so the founder named the equivalent, 2026-09-17:

> Our goods receipt equivalent is timesheet receipt or expense receipt.

That is the right word and it is the trade's, not a system's; CLAUDE.md
is explicit that a screen uses the reader's word. So the check is:

**work order ↔ timesheet receipt (or expense receipt) ↔ supplier invoice**

with the approved timesheet as the receipt: the proof that what was ordered actually
happened, signed by the party who received it.

Three things can be the receipt, and the app already treats all three
the same way, which is the sign the shape is right:

| Receipt | What proves it | Bills as |
|---|---|---|
| **Timesheet receipt** | the client signed the week | an hours line |
| **Expense receipt** | the expense was approved | an expense line |
| **Milestone receipt** | the client accepted the milestone | a milestone line |

`WorkOrder` is the ceiling, the receipt is the proof, the supplier's
invoice is what gets matched against both — and a client pays what came
through the match, never an invoice with no receipt behind it. The
three-way check exceptions that route to the AP desk are the
receipt-against-invoice exception queue, in the trade's words.

**Accounting integrations.** QuickBooks and Xero say *Invoice* for the
customer document and *Bill* for the received supplier one. That maps
cleanly and needs no inversion — their Invoice is our bill, their Bill
is our invoice receipt. State the mapping once at the boundary rather
than adopting their words on a screen.

**What changes and what does not.** The words a person reads change. The
machine names do not: `Invoice` and `VendorBill` keep their model names,
`/api/invoices` and `/api/ap/bills` keep their paths, and
`invoice.issued` stays an event name — by the same precedent that kept
the demo slug `world-nike` and `/api/purchase-orders` under a screen
that says "sales order". An address is not a word anybody reads.

---

## Paperwork — the shapes a document actually comes in

From the founder, 2026-09-16, and written down because it is trade
knowledge the code was guessing at. Every row is a real document a
staffing firm handles, and the columns are the properties that differ.
**In contracting and staffing these are not filing; they are business
continuity.** A lapsed certificate stops a supplier working, an expired
work authorization stops a person working, and neither fails loudly on
its own.

### Who renders the verdict — decided 2026-09-22

From the founder, and it is a liability rule before it is a product rule:

> Ultimately background check companies are the ones that confirm
> background pass or fail — the risk is passed there to background check
> companies; our job would be to collect all info and pass it to them to
> verify in today's market.

So paperwork divides once more, underneath the three purposes:

- **A document somebody else issued, which we hold and read.** An
  insurance certificate, a visa, a green card, a degree. The insurer,
  the government or the university made the assertion; a desk reading
  the dates off it and recording them is honest, and that is what
  supplier onboarding does when HR verifies a certificate.
- **A verdict a third party renders about a person.** A background
  check, a drug screen, a sanctions and litigation screening, an
  education verification. Sterling or HireRight says clear or not clear,
  on their letterhead, and carries the professional liability for that
  opinion. **Etyme never renders that verdict and no desk in Etyme
  renders it either.** The job is to collect the consent and the
  identifiers, pass the package to the provider, and record what came
  back — verbatim, with their name, their reference and their date on
  it. A reader must be able to tell "Sterling said clear on 12 March,
  reference 4471" from "somebody here ticked a box", and a screen never
  says Etyme verified a check.

**What does not transfer, and it is the trap in the sentence.** The
verdict is theirs; the *process* stays with the employer. Under US law
the firm ordering the check owns the consent and the disclosure before
it, and the adverse action steps after an unfavourable result — the
pre-adverse notice, a copy of the report, a waiting period, the final
notice. A product that reads "the provider decides" as "we have no
process left" drops exactly the step that generates lawsuits. Passing
the verdict on does not pass the paperwork around it on.

**What this means for the loop built on 2026-09-21.** A chase letter
must not tell a worker to upload her background check as though it were
a paper she holds — the report goes to the firm that ordered it, not to
her. What she owes is her consent and her identifiers. The required set
can ask for either; the sentence has to know which it is asking for.

### The list is not the domain — the purpose is

Corrected by the founder the same day, before anybody built to the table
below: *"companies can have more documents they would need on — some for
compliance, some for agreement and some for proof."*

So the seven documents in the table are **examples of the shapes, not the
set of types**. Any client or supplier will need types nobody here has
heard of, and they must be able to add one without a migration or a
release. A fixed enum of document kinds is wrong the first week a client
asks for a drug screen, a security clearance, a works council
notification or a client-specific code of conduct.

What is fixed is the **purpose**, and the purpose is what decides
behavior:

| Purpose | Behaves like | Examples |
|---|---|---|
| **Compliance** | has a validity window, watched for expiry, blocks or warns, gets chased | I-9, insurance, licenses, background checks, good standing |
| **Agreement** | signed — possibly by both sides — has a term, amended and versioned | MSA, NDA, statement of work |
| **Proof** | attached as evidence, usually never expires, supports something else rather than standing alone | degrees, transcripts, certifications |

**That is roughly the split the four models already fell into**, which is
the useful part of the finding: `Verification`/`VerificationDoc` is
compliance, `DocInstance`/`DocTemplate` with `MasterAgreement` is
agreement, and attachments are proof. They were not arbitrary — they were
three purposes nobody had named. `DocumentPacket`/`PacketItem` is
orthogonal to all three: it is the request-and-collect mechanism, and any
purpose can be requested through it.

So the five properties below are **declared by a type**, not hardcoded
per document. A type says whether it has a start, an end, or neither;
whether it is signed and by how many sides; whether it is reissued and
so has an edition; and what other types it needs behind it. The I-9 is
then the first type that happens to say "reissued: yes", rather than a
special case in the code.

Defaults ship, because CLAUDE.md says default aggressively and zero
training means nobody defines an I-9 before they can hire. A company
extends and renames from there.

| Document | Valid from | Valid until | Signed by | Supplied by |
|---|---|---|---|---|
| **Master service agreement** | yes | yes | **both parties, countersigned** | the two firms |
| **Visa** | — | yes | — | the government |
| **I-9** | — | see below | the worker and the employer | the worker |
| **License, green card, passport** | — | usually | — | the worker |
| **Education documents** | — | **never expires** | — | the candidate |
| **Certificate of insurance** | **yes** | yes | — | the supplier |
| **Certificate of good standing** | **yes** | yes | — | the supplier |

Five properties fall out of that table, and no single model in this
codebase holds all five:

1. **Validity is three shapes, not one.** No dates at all (a degree
   certificate is true forever). An end only (a visa runs out). A start
   *and* an end (insurance cover, a certificate of good standing) —
   and the start matters, because cover that begins next month does not
   cover a person starting this week. `Verification.expiresAt` already
   says "null = permanent (e.g. education evaluation)", which is the
   right instinct; it has `issuedAt` and nothing reads it as a floor.
2. **A signature can need two sides.** An MSA is not executed until both
   firms have signed, and the date that matters is the later of the two.
   `MasterAgreement` learned this on 2026-09-16; `DocInstance`, which is
   what an NDA or a signed contract uses, has no concept of a
   countersignature and no dates at all.
3. **The form itself has an edition.** The government reissues the I-9
   every year. Which edition somebody signed is a fact about the
   document, and an old edition is not a small problem — it is the
   finding in an audit. Nothing here records a form version.
4. **A document can require other documents.** An I-9 is not proof of
   anything on its own; it is a form that must be backed by evidence of
   the right to work — a license, a visa, a green card. So a "held"
   I-9 with nothing behind it is not held. This is composition, and no
   model expresses it.
5. **Who owes it differs, and that decides who is chased.** A candidate
   attaches their own education documents. A supplier produces its own
   insurance — and a firm asks its **sub-vendor** for theirs, which is
   why the certificate shows up in supplier onboarding rather than in
   somebody's personal file.

### Where a document lives — on the line, on the side it protects

**Decided 2026-09-18, by the founder**, the morning the order became a
header and its lines:

> Compliance should live in sell and buy contracts. The MSA from the
> client or customer is signed by the company that is supplying
> contingent talent. Similarly the employee contract or MSA, NDA, NCA
> and the build of HR documents — visa as attachment, background
> verification — or company insurance and good-standing certificate for
> a supplier will all live on the buy contract side.

So paperwork attaches to the **line**, on the side of the trade it
protects:

| Line | Carries | Because |
|---|---|---|
| **Sell** — bills the customer | the customer's paper the firm signs as its supplier: the MSA, and the customer's compliance line inherited from the header | it is what the customer may hold the firm to |
| **Buy** — pays the supplier or runs payroll | everything about the party the firm pays: an employment contract or the sub-vendor's MSA; NDA, NCA; visa, background check, licenses; for a supplier, its insurance and good standing | it is what the firm may hold *them* to, and what stops the money if it lapses |

This is the "two greens" gate at station 5 stated as data. Candidate
green and company green are both **buy-side** facts — the person and
the firm being paid — and the header carries the customer's required
set, so a hospital role and a warehouse role under the same MSA can
demand different things and each line knows which.

**What this does and does not move.** Evidence stays where it is: a
person's I-9 is the person's (`Verification`), a supplier's certificate
is the company's, and copying a passport onto every placement would be
the duplication this whole section exists to end. What moves to the
line is the **requirement and the verdict** — which documents this line
needs, from whom, and whether it is green. `DocInstance` already hangs
off both `SellContract.docs` and `BuyContract.docs`, so signed papers
have a home.

**What a line requires now exists. Landed 2026-09-21**, on the
founder's instruction: *"Ensure the loop of documents never cracks
between parties."* `DocumentRequirement` carries one row per document
per owner, and the owner is exactly one of three — the order (the
buyer's default set, inherited by every line under it), a sell line, or
a buy line. A line with none of its own reads its order's; a line on no
order at all falls back to the default for its shape, computed from
`lib/document-type` for a W2, a corp-to-corp and a sub-vendor. The
default set is a **floor** rather than a starting point: an order adds
to it, and nobody orders their way out of a federal form. A line may
override one item and the override says who and why; a waived item
stays on the list, marked, with the reason and the name, because
Addendum E says WARN, capture a reason, proceed and never silently
permit — and work authorization cannot be waived at all, a waiver
against one being refused rather than honored quietly. `owedBy` is a
party role — WORKER, SUPPLIER, CUSTOMER, US — and never a `personId`,
so a line whose subject is not a person still carries a set. One door,
`lib/document-requirements`, and it materializes nothing: a required
set frozen into rows on the day a line was created is a set that cannot
learn. `DocInstance` gained dates, an edition and a countersignature in
the same change, so an NDA can be watched the way a certificate is, and
a certificate of good standing now blocks the way lapsed cover does.
What is **still owed** is the rewiring: `lib/contract-clearance`,
`lib/packets`, `lib/outbound-pack` and `lib/supplier-onboarding` each
still carry their own list and must read this one instead, which is
`etyme-regulatory`'s next piece of work; the lapse letters, per party,
are `etyme-conversation`'s. Until that lands the table is written by the
seed and read by its own door, and nothing that computes a verdict today
has changed meaning.

**Four models overlap here and none is a superset:** `Verification` and
`VerificationDoc` (the person's compliance evidence, expiry watched by
`cron/watch`), `DocInstance` and `DocTemplate` (papers sent for signature,
no dates), `DocumentPacket` and `PacketItem` (a request with a link
window, where `validUntil` is the link's life and not the document's),
and `VisaPetition` (its own lifecycle and its own watch). They were built
one at a time for one need each, which is why the same certificate can be
represented three ways.

Do not unify them in one pass because the table above is tidy. Do use
the table as the test: a change to any of the four is wrong if it makes
one of the five properties harder to express.

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

---

## Completed tasks

### LEGACY_RULES.md ✓

`LEGACY_RULES.md` — business rules from 4,197 commits, in plain English
with file references. Covers all 14 sections: cycle engine, contracts,
submissions, invoicing, company structure, documents, conversations,
compliance, commissions, database constraints, routing, background jobs,
seed data. Seven known bugs documented for the new build to fix.

### Service object extraction ✓

Phase 1: 5 service objects (901 lines extracted).
Phase 2: 14 service objects (2,085 lines extracted from 13 controllers).

### Business logic extraction ✓ (2026-09)

Cycles are money only, on the side of the trade they describe, on the
day the pack asks for (`lib/cycle-kinds`, `lib/cycle-generator`,
`lib/contract-cycles`). The timeline is three words on the thread —
hours, pay, bill (`api/placements/[id]`). Paperwork is a checklist, not
a signing workflow: I-9 and lapsed cover block, the rest warns with a
reason (`lib/contract-clearance`).

### The client path, closed ✓ (2026-09-10)

Five routes that authenticated and did not authorise — activate,
payments, invoice generation, timesheet entry, convert — now refuse a
stranger in words. Awarding writes the cycles. A client pays only what
came through the match. Tenure counts a day on site once, however many
firms billed it, and only days served. Three client programmes seeded
with a desk per job. `__integration__/client-programme.test.ts`.

### Interviews, and the requisition chain as three desks ✓ (2026-09-12)

A client can interview a candidate from the row: rounds in turn, the
supplier and the candidate told on their own channels, the candidate
answering from their own page, the client's notes never leaving the
client (`lib/interview-proposal`, `lib/interview-notices`,
`components/propose-interview`). Only whoever is hiring may set up or
decide a round.

The chain is three desks, not a dollar line: HR reads the role,
Procurement audits the suppliers, the lead who owns the cost centre
signs the money — alongside at one rank, the lead after both; within
plan every desk clears by rule and by name and the requisition publishes
itself; nobody signs their own (`lib/requisition-approval`). HR and
Procurement are standing desks named per business unit, nearest wins
(`ApprovalRule.kind`). A requirement has an owner distinct from who
raised it, a panel, and the suppliers Procurement cleared; the release
stays within them. Words change on a published requirement with every
supplier told; money goes back through approval
(`lib/requisition-change`). Requirements read Draft · Awaiting approval
· Needs changes · Published · Cancelled · Archived — filled is a
placement's word, read in Submissions. `/demo` seats the account owner,
HR and Procurement at each programme.

### Phases 2 and 3, the pieces that were words on the schema ✓ (2026-09-14)

Directed by the founder over the sequencing rule, and said so. Every
status that a scan found nothing writing now moves, each as sentences
in tests and a story on the seeded world:

- an approved, client-billable expense rides on the next invoice as a
  line of its own and is PAID with it (`lib/expense-billing`); the
  three-way match takes the approved expense as the receipt
- a document asked for is SENT (the person told), UPLOADED or SIGNED by
  attestation from their own page (`lib/document-request`, Paperwork
  page, `/api/me/papers`)
- a visa petition is FILED, gets an RFE and the answer, is APPROVED with
  the date it runs out, STAMPED, ACTIVE, and the watch job runs it out
  (`lib/visa-petition`, Visas tab on compliance)
- a course is added and somebody enrolled, started, finished with a
  score, or dropped with a reason (`lib/training`)
- a supplier's standing — probation, approved, preferred — is set from
  the suppliers page and read by the VENDOR_TIER rule
  (`lib/supplier-tier`); a seat unadvertised for six weeks goes COLD
  (`cron/cold-openings`); a unit of every kind can be added
  (`/api/program/units`)
- a milestone the client accepted bills on the next invoice as a line
  with the acceptance as its receipt (INVOICED); a commission-type buy
  contract is paid by a run that posts COMMISSION against the order,
  once per period, under the cap (`lib/commission`,
  `/api/payroll/commissions`); somebody else takes a seat as a new
  contract on the same terms with the old one ENDED and the candidate
  REPLACED (`lib/replacement`); a bill that did not match is a decision
  on the AP desk; a holiday marked for another country does not move
  this site's dates (`appliesTo` in `lib/holidays`)

`InvoiceLine.timesheetId`, `sellContractId` and `personId` are optional
now: a line is an hours line, an expense line or a milestone line.

### Every table moves ✓ (2026-09-14)

"We need all tables to keep moving their respective statuses across
the app." A scan of every status column against every writer found
where they stopped, and `__integration__/status-ledger.test.ts` now
walks one placement and reads every table at every station. Fixed:
the hours, invoice and vendor-bill cycles are marked done when the
thing they waited for happens (`lib/cycle-complete`), so the placement
timeline stops saying "overdue" about a week that was paid; a contract
whose last day has passed is ENDED by the daily job (`cron/end-contracts`),
both sides; activation moves the buy contract with the sell contract;
a supplier can decline an invitation and whoever is hiring is told
(`invitations/[id]/decline`); submitting through the bulk route accepts
the invitation. Left as words on the schema and now corrected: a
timesheet has no PARTIAL status; fewer hours accepted is `acceptedHours`.

### Somebody is told when it breaks ✓ (2026-09-13)

`/ready` measures the edges (`lib/readiness`); two of its red rows are
now built. The daily job writes a `JobRun` before its first job and
after its last, and sends staff a heartbeat either way, so the alert
channel is proven on a day nothing broke. Every failure in an API route
goes through `reportError` (`lib/alerts`): an `Incident` row, and one
email per place per hour to `ETYME_STAFF_EMAILS`. A page that throws
shows a sentence and reports itself (`app/error`, `app/global-error`,
`POST /api/incidents`). Found on the way and fixed: eleven cron routes
accepted the literal header "Bearer undefined" on a deployment with no
secret; all use `cronAuthorized` now. What production still needs from
the founder: `ETYME_STAFF_EMAILS`.

### The client dashboard reads as a desk ✓ (2026-09-13)

"Client dashboard need to be lot better." It opens on a sentence about
the reader — "6 things need you. 6 are urgent." or "Nothing needs you
today." — with the queue under it and Approve on the row, then the
picture: on site, suppliers, this month, ending soon, tenure,
requirements, each a link (`app/dashboard/program`). Four numbers were
real and computed the wrong way round, and each is now a sentence in
`__tests__/invariants/client-desk.test.ts`: a person bought through a
chain was counted once per rung and a sub-supplier's rate reached the
client's page (`lib/chain-top`: the client sees the contract it pays);
monthly spend was divided by a hundred twice; a role filled by history
was "still waiting"; and the desk that signs the work was never told a
week was waiting, because decisions scoped hours to the employer only.
A client now sees the hours, through the supplier it pays, and signs
from the dashboard.

Then, on "fix the gaps and improvise": a week is checked against its
contract before anybody signs it — over the role's hours, or past the
last day — and says so in a sentence (`lib/timesheet-flag`); the
headline counts exceptions; "Approve anyway" takes a reason and puts it
on the signature. Under the queue, what was done today. Somebody
starting soon shows the paperwork verdict a week early, in activation's
own words. Each supplier carries its standing; a published role nobody
has answered in five days says so; a client with nothing on it yet is
told what to do first. The generic demo client's book is mostly history
now, and the seeded Northbend Athletic desk has one 44-hour week to read.

### Network ✓ (2026-09-13)

"People & Suppliers can be changed to Network; contractors and
suppliers should have a table view as well as the feed; filter
suppliers by their existing contractors, and contractors by recent
engagement, favorites, location, blocked." The nav group is Network.
Both pages switch between the feed and a table of the same rows
(`components/network-view`), under one filter bar that asks the same
five questions on both — Everyone · On site now · Recent engagement ·
Favorites · Blocked — and a place (`lib/network-filters`). A favorite
is the opposite of a block: a person or a firm this company would take
again, marked with a star on the row, kept per company and never read
across companies (`Favorite`, `/api/favorites`). Somebody on site is
engaged today; a block keeps the row on the register but out of every
list except its own. The seeded Northbend Athletic desk stars Helena Marsh and the
firm that supplied her.

### A supplier is a workflow, and a person has a page ✓ (2026-09-13)

"Add supplier is a huge waste of real estate — for an activity that has
to happen through workflow and compliance with indirect procurement.
The hiring manager recommends; his department lead — or sometimes the
program office — audits; the vendor is emailed a link for its
information; indirect Procurement qualifies; HR ensures compliance and
screening; AP Finance screens the bank details." The paste box is gone
from the top of Suppliers. A firm walks four desks in order, the way a
requisition does: the recommender's department lead — the nearest
value-rule approver up their own unit tree, the program office where
none is named — confirms the need; Procurement qualifies the firm on
its experience, references, revenue and delivery proofs, its proposal
and a D&B report; HR clears compliance on the certificate of insurance
and a sanctions and litigation screening; Finance verifies the tax form
and the bank details and says the last yes. Each desk verifies its own
items and no other's, and says yes only when its own are verified or
waived with a reason (`lib/supplier-onboarding`, `lib/supplier-desks`,
`SupplierRequest`, `/api/supplier-requests`). Nobody decides their own
recommendation and nobody decides two desks. Every desk is told by
email as well as in the app, and finds the firm on its own dashboard as
a decision. The firm gets a link of its own the moment it is
recommended (`/apply/[token]`, `/api/supplier-apply`): no sign-in,
files recorded by name against the item they answer, bank details kept
to the bank, the account name and four digits; what the firm supplies
is received, never verified, until the desk says so. The link stops
working once the client has decided; in time it is the supplier's door
into the client portal. A firm in the pipeline shows on the suppliers
list, feed and table, as Pending with the desk it is on. Procurement's
own import of firms it approved before is folded away at the bottom.
Walked desk by desk in the browser, sixteen screens, and in
`__integration__/supplier-onboarding.test.ts`.

"Can a hiring manager save a consultant as a favorite, and how will he
invite?" One page per person as this client knows them — where they are
today, time here across every supplier against the cap, every
submission and what each firm asked, interviews, paperwork, who can put
them forward — opened only for somebody put in front of this company,
every read logged (`/api/people/[id]`, `app/dashboard/people/[id]`).
The star is on it. "Ask for them" picks a published role and goes to
the supplier holding their consent on its bench, else whoever last
submitted them, on the thread for that role — never to the consultant,
because Etyme places nobody (`/api/people/[id]/ask`). A blocked person,
an unpublished role and a role they are already on are refused in
words. The seeded Northbend Athletic desk holds Veritan Talent with HR, cleared by the
department lead and Procurement, the firm's side in.

### A supplier brings its team in ✓ (2026-09-13)

"Can Brightmoor add or onboard their team members — account managers,
HR, recruiters, contract managers, finance — so it is easy to
coordinate?" A staffing firm's roles are in its own words now: Owner,
Admin, Recruiter, Resource Manager, Account Manager (the client
relationship — roles, rates, submissions, what was billed; never
payroll or P&L), HR (the firm's own people's paperwork; no money at
all), Contract Manager (agreements, orders, extensions, rates; neither
submits nor pays), Accounts Receivable (bills the client and records
what came in; never accepts hours for pay or runs payroll), AP &
Payroll (pays the consultant or the sub-vendor: accepts hours, runs
payroll, settles bills; never issues a client invoice), Finance (the
whole desk at a small firm; was Accountant), Compliance Officer. A
company formed before a role existed gets it the next time somebody
opens Users & permissions; a renamed role keeps its seats
(`lib/company-roles`). The page has "Invite a teammate": name, work
email, what they do here; the person is emailed and the seat is theirs
the moment they sign in — an own-domain address is welcome, not
refused, because an owner setting up four desks should not wait for
each to find the door. Once seated, they appear on every client's
Contacts page under their firm, sorted into the right chips
(`__tests__/invariants/supplier-team.test.ts`,
`__integration__/supplier-team.test.ts`).

### Every list, two ways ✓ (2026-09-13)

"All tables must have feed and table options like the contractor
table." One component, `ListSurface`, wraps the working-surface table
and adds the feed: the same rows as cards, title from the first column,
subtitle from the second, the rest as lines; action columns stay off
the card. A page that wants a richer card passes one. Nineteen pages
that drew a bare table now offer both; Requirements, Ending soon, POs
and Contacts, which had only cards, now have a table. The reader's
choice is remembered per list on their device.

### What this section taught, for the rest of the app (2026-09-13)

Written after a week on the client's Network — dashboard, suppliers,
contractors, contacts, teams — because each was learned by getting it
wrong first.

1. **Fill from the work, not from data entry.** The People tab was empty
   because it listed only what somebody typed in. Every list should be
   derived from the flows that already know the facts — seats, contracts,
   submissions, threads — with hand entry as the exception. If a screen
   is empty on the seeded world, that is the bug, not the seed.
2. **Every figure on a screen has a sentence on the seeded world.** Five
   contractors for three people, $972 for $60,000, seven roles waiting
   when two were open, six approvals nobody was told about: all real
   numbers computed the wrong way round, none caught until the founder
   looked. A formatter takes minor units only; a chain is counted at
   the rung the client pays; a "waiting" is checked against status.
3. **The desk that acts is the desk that hears.** Decisions were scoped
   to the employer, so the client who signs the work read "Nothing needs
   you". Route every "needs you" through who may act, not who owns the
   row, and tell them by email as well as in the app.
4. **A form is a workflow in disguise.** "Add supplier" was a paste box
   doing indirect procurement's job in one keystroke. Anything with a
   compliance consequence walks desks in order, each verifying only its
   own items, nobody deciding their own or twice, and the counterparty
   supplies its side through a link of its own.
5. **Roles in the trade's words, per kind of company, reaching existing
   companies.** Account Manager, HR, Contract Manager, Accounts
   Receivable, AP & Payroll — not "Accountant". A role added later must
   appear for a firm formed earlier without a migration.
6. **The same five questions on every list.** Everyone · On site now ·
   Recent engagement · Favorites · Pending · Blocked, and a place. A
   filter learned once is learned everywhere; a filter with nothing
   behind it is not offered.
7. **Walk it as each person, and keep the screens.** The mapping bug that
   filed an account manager under Accounts payable was invisible in the
   unit tests and obvious in one screenshot. Every module ends with a
   browser walk as every desk it touches, and the screenshots go to the
   founder.
8. **Segregation is a BLOCK, said in a sentence.** "You recommended this
   firm, so the desks decide it without you." Never a disabled button
   with no words.

### The charts were audited against the validator ✓ (2026-09-13)

"Audit and improvise the sites and UX." Every chart in the app was run
through the palette validator instead of being looked at, and three of
them failed:

- the AR page drew 31–60 and 61–90 days in the identical clay — ΔE 0.0,
  the worst score the validator gives, two bands nobody could tell apart
- the same five age bands were drawn in three different palettes on
  three pages: brand tokens on AR, four unrelated Tailwind reds on
  Invoices, four more on Reports
- the report's contract pipeline put a green segment beside a gray one
  at ΔE 5.6 for normal vision, under the floor of 15, and printed white
  counts inside segments that a narrow band clipped

All three now draw from `lib/chart-colors`: `AGE_BANDS` — the good
status color for current, then a validated one-hue ramp darkening
through the overdue bands — and `SERIES` for identity, opening on the
brand's blue and clay. Both sets pass every check; the runs are quoted
in the file. Segments carry a 2px surface gap; counts moved to the
legend; a legend swatch only stands for a segment that is drawn.
Twenty-seven off-brand Tailwind colors across thirteen screens — a dozen
`bg-red-600` toasts among them — were swept onto the brand tokens, and
a test now fails on any that come back.

### Demand opens, supply answers ✓ (2026-09-13)

A client writes to one supplier from the role or from the candidate's
row; the supplier is told, reads it and answers on the same thread, and
cannot start one — the refusal says to submit or answer the invitation
instead (`lib/threads`, `components/thread`, `Conversation.withCompanyId`).
A firm not on the deal is told nothing is there. Discussion stays the
company's own. The 2017 rule, kept because the demand side still wants
it. Requirements name the person they are for, first, every time; a
paused requisition refuses submissions in a sentence.

### The demo names nobody real, and seeds twice ✓ (2026-09-17)

The home page stopped naming Nike, Corning and Terumo BCT on
2026-09-15, and `/demo` — the button under that line — went on using
them as the headings on three doors. `lib/positioning` read
`app/page.tsx` and nothing else, so a name stripped off the page and
left one click behind it was not stripped off anything.

The sheet in `docs/demo-names.md` is applied: **Northbend Athletic**,
**Cavanaugh Glassworks** and **Talvern Medical** are the three client
programs, with **Auralis Software** and **Maren MSP** on the spine and
**Veritan Talent** the recommended supplier; the towns moved with them
(Tualatin, Elmira, Westminster). **Slugs stay** — `world-nike` is an
address, by the same precedent that kept the demo desk key `programme`,
and only what a human reads changed.

Worse than a display name, and the reason this was urgent: the seed set
`domain: 'nike.com'` and `'terumobct.com'` with `domainVerified: true`,
and joining beats creating, so a real employee of either signing in
would have been seated inside a fictional tenant full of seeded rates
and invoices. Every seeded company now holds a reserved name nobody can
register — `.example`, `.invalid`, `.local` — and
`__tests__/invariants/demo-names.test.ts` reads the seat list, the demo
page, the "Look around" button, `/ready`, the world and program seeds,
the demo seeds and `prisma/seed.ts`, and fails on a retired name or a
buyable domain coming back.

**A seeded world keeps the day it was born.** Every seeded date is
counted in days from today, so re-seeding on a later day found none of
the weeks it had written and wrote the lot again — and exactly seven
days later it died halfway through on a duplicate invoice line, leaving
the world half rewritten. `seedWorld` now reads the first company's
`createdAt` and counts from there (`lib/seed-days`), so a second seeding
is a true no-op whenever it happens. The cost is that a world seeded in
March goes on reading as March: to move the dates forward, drop the
world and seed it again. `__integration__/reseed-across-days.test.ts`.
