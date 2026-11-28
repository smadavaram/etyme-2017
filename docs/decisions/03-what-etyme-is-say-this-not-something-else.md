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
