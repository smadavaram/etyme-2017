# The contractor census — brief

Written 2026-09-20 for the founder and the agents. Plain English. Every
sentence is an outcome, a benefit, a method, or a rule.

## What it is

A client sends us what they already have about their contractors. Within
five working days they get back one page: how many contractors they have,
what they spend by supplier, whether two suppliers are paid differently
for one skill, and who has been on site longest counting every supplier.

It is free. It needs no login. It is the first step of the funnel because
it produces the number the client's own systems cannot, and that is the
moment the sale is made.

## Why enterprise is different, and what that changes

An enterprise will not upload supplier invoices to a website it found
yesterday. Before any file moves, four people need a yes: the program
manager who wants the number, the CFO who will read it, procurement who
owns the supplier relationships, and legal or security who owns the data.
So the census is designed for that committee, not for one person.

1. **A one-page census agreement comes first.** It says what we receive,
   who at Etyme can see it, where it sits, that we never contact their
   suppliers or their contractors, and the day we delete it. Legal reads
   one page, not a contract.
2. **They choose how much to send.** Two options, and the lighter one is
   the default. Option A: a filled spreadsheet template with one row per
   contractor: supplier, role, site, start date, end date, rate, hours per
   week. No names required; a reference number is enough. Option B: raw
   supplier invoices and timesheets, for clients who have nothing tidier.
   Option A has almost no personal data in it. That is the point.
3. **A named person at Etyme runs it.** Not a bot. The client knows who is
   reading their file. That person is a staff seat with every read logged.
4. **The output is a document, not a dashboard.** One PDF page addressed to
   the CFO. Enterprise buyers forward documents. They do not forward logins.
5. **Deletion is a date, not a promise.** The census data is deleted 30 days
   after the page is delivered unless the client starts a program. The
   deletion is done by the nightly retention job that already exists, and
   the client is told the day it ran.
6. **No urgency tricks.** The only true scarcity is that we run a small
   number of censuses well at once. We say that, and we say the queue
   position.

## The flow, step by step

| Step | Who acts | What happens | What the client sees |
|---|---|---|---|
| 1 | Client | Opens `/census`, reads what they get and what they send | The page, the template, the agreement |
| 2 | Client | Fills name, company, work email, desk (program, finance, procurement), suppliers count, chooses option A or B | A confirmation with their queue position and the named Etyme person |
| 3 | Client's legal | Accepts the one-page agreement by name and date | The agreement as a PDF they can file |
| 4 | Client | Uploads the template or the files through a signed link that expires | "Received, 4 files, 2.1 MB. Deleted on 20 October unless you start a program." |
| 5 | Etyme staff | Creates a private client sandbox for them, imports the rows as contracts and placements, runs the four numbers | Nothing yet |
| 6 | Etyme staff | Reviews the page, writes the "what we could not see" notes, sends it | The one-page PDF by email, and a link to the same numbers live in their sandbox |
| 7 | Client | Reads the page. Opens the sandbox if they want to. Starts a program, or does nothing | Their choice. Either way the deletion date stands |

## The one page

Addressed to the CFO by name. Serif headline, one number per section,
tabular figures. Sections in this order:

1. **Contractors on your sites today.** One number. Under it, by supplier.
2. **Spend this quarter.** One number. Under it, by supplier, and the
   share of the total each supplier holds.
3. **Same skill, different price.** For each role that two or more
   suppliers fill, the lowest and highest rate and the gap. If no role is
   filled by two suppliers, the page says so.
4. **Longest on site.** The five people with the most days on site counting
   every supplier, as reference numbers, and how many are past 12 and past
   18 months. If tenure limits apply to them, it says how many are past the
   limit.
5. **What we could not see.** Every gap in the data, plainly: rows with no
   end date, invoices with no hours, suppliers with no rates. This section
   is never empty and never hidden. It is what makes the other four numbers
   believable.
6. **How this was computed.** Three sentences: the rows were loaded into a
   private program on Etyme, the same arithmetic the product runs for a
   live client produced the numbers, and the data is deleted on the date
   shown unless a program starts.

## What already exists

- Private client sandboxes: `POST /api/demo` already creates one per
  visitor. The census sandbox is the same thing with a real company name.
- The four numbers: the client dashboard computes on-site count, spend,
  rate variance across suppliers, and the tenure ledger from contracts and
  placements (`app/dashboard/program`, `lib/tenure-days`, `lib/chain-top`).
- Import: the reference-data importer and the supplier paste import exist;
  a contracts-and-placements import from a spreadsheet does not.
- Signed links without login: `/apply/[token]` and the packet links.
- Retention: the nightly job deletes what has passed its period and logs
  each deletion as irreversible (`lib/retention`).
- Staff identity by address, every read logged (`lib/staff`,
  `lib/access-log`).
- Lead capture and nurture: `lib/lead-capture` and the nurture sequence
  exist on the market side.

## What must be built, by domain

**Architect (schema, one pass).**
- `CensusRequest`: company name, contact name, work email, desk, supplier
  count, option (TEMPLATE or FILES), status (REQUESTED, AGREED, RECEIVED,
  IN_REVIEW, DELIVERED, PROGRAM_STARTED, DELETED), queue position, the
  staff person assigned, agreement accepted by and at, files received
  (count, bytes, stored like resumes), sandbox company id, delivered at,
  page document, delete by, deleted at.
- Registration of the new paths in `domains.ts`; a matrix row under the
  market's group, status NONE until built.

**Market (the page and the funnel).**
- `/census`: what you get, what you send, the template to download, the
  agreement to read, the form. Plain English by the home page's rule:
  outcome, benefit, method.
- Confirmation page and emails: received, agreed, files received with the
  deletion date, page delivered, deleted. Each one sentence per fact.
- The nurture: three emails over three weeks after delivery, one question
  each, no urgency.

**Regulatory (the agreement and the data).**
- The one-page census agreement as data in `lib/legal`, rendered like the
  other legal documents, with the six things a procurement lead asks.
- A retention line for census data: 30 days after delivery, deleted by the
  nightly job, the client told.
- The census request and its files as a category in what we hold, with
  export and erasure working for it like everything else.
- Every staff read of a census file logged.

**Money (the numbers).**
- The spreadsheet template and its importer: one row per contractor into
  contracts and placements in the sandbox, with each row's gaps recorded.
- The one-page document: the four numbers plus the gaps and the method,
  generated from the sandbox by the same functions the dashboard uses, as
  a printable page and a PDF.

**Conversation (the words that go out).**
- The five emails above, and the one to the named staff person when a
  census arrives or a deadline is near.

## Tests, as sentences the founder reads

- a client can ask for a census without creating an account
- nothing moves until somebody at the client has accepted the agreement by name
- the template asks for no names, and a census from the template holds no personal data beyond a work email
- a census file is opened only by the staff person assigned, and every read is logged
- the four numbers on the page equal what the client dashboard shows in the sandbox
- the page never hides a gap: a row with no end date appears in "what we could not see"
- the deletion date is on the confirmation, on the page, and in the nightly job, and they agree
- thirty days after delivery, with no program started, the census is deleted and the client is told
- a census that becomes a program keeps its data and the deletion is cancelled with a reason
- no email in the sequence invents a deadline

## Sequencing

Architect first, then regulatory and money in parallel, then market and
conversation. About two weeks of agent work. The pen test scope gains the
census upload path the day it exists.

## Not in this

No self-serve computation before a human has read the file. No public
benchmark numbers across clients. No price. No AI claim anywhere on the
census page.
