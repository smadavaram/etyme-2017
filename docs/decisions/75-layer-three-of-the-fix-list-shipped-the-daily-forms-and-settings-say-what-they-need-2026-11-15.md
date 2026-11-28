## Layer 3 of the fix list shipped: the daily forms and Settings say what they need — 2026-11-15

**What it is.** The third of five layers of the fix list of 2026-11-14
(record 72): areas A and G, "daily flows". The forms a person fills every
day (a contact, a colleague, a consultant, a site) and the Settings
pages. It went out as its own deploy, with two database columns.

**What went out.**
- *Add contact* asks Name, Email, Works for, Role, Title, then Phone, in
  one column. The box is "Works for". The company is read from the
  email's domain against the firm's own Companies list, by the reader
  that decides a company's identity, and the form says which domain
  matched. Where no company uses that domain, the form says a new company
  will be added, not classified, with nobody emailed, and shows its name
  in a box to correct before saving. The company and the contact are
  saved together, through the code Add a company runs. A personal mail
  domain infers nothing. The firm's own domain picks the firm.
- A company made from an email on a subdomain is kept under the domain
  somebody registered, the one its name is read from.
- *Add a company* has a neutral example name, and each Kind says in one
  line what it means.
- *Inviting a colleague* asks for the email first and checks it as it is
  typed. Each role is explained in the picker. Invite sends only once a
  role, or "Decide later", is chosen. One sentence says what a person
  with no role sees, on the form, in the answer and in the legend: Ask
  Etyme and their own pages, and nothing of the firm's.
- *Add consultant* asks for the name and email first, says beside the
  Email box when the firm already keeps that person, and puts the
  optional pay boxes last under one line.
- *A site's address* has a ZIP or postal code, and a country typed by
  name is read as its code or refused in a sentence. The time zone line
  says what is true.
- *Settings.* Every greyed Save says why beside it. A setting that is
  recorded and not enforced says so at its control. Ask Etyme says one
  true sentence for the switch and the deployment. Holidays offers a year
  only when it is not on the calendar. Sign-in links to where a domain is
  proved, and its directory address is the production one. Import records
  points to the Suppliers paste. The activity log draws no tile or filter
  that can never show anything.
- The firm's own scorecard says under each empty figure what fills it.
- An answer the model stopped at its length limit is shown to its last
  whole sentence, with a line saying it was shortened.
- No example in a box names a real-looking person or firm, a software
  maker, or a domain anybody could register. A test holds it.
- A refusal names only seats the firm has filled.

**A consent leak, found by the reader and closed.** It was live before
this layer. A firm that asked somebody onto its bench by an address that
already had an account, or that another firm kept, read her own name,
skills, place, education and work authorization on its Candidates list
before she had said yes. Now, until her yes, a firm that asked her on a
record whose words are not its own reads only what it typed: the name,
title, skills, place and note on its own listing. No search or filter
finds her by her own words. The name the firm typed is kept on its
listing at every ask (`BenchListing.firmName`). One reader decides it
(`firmReadsAt` in `lib/consultant-portfolio/before-her-yes`). After her
yes everything reads as before. Two doors of the same kind were closed
beside it: reading one person by her record's id checked nothing about
whose list she was on, and Ask Etyme named somebody who asked to join
from a firm's page by the name on her own record.

**Not built, because each is something new.** Pay terms asked after a
consultant says yes. Fields for a firm's industry, specialty, markets or
description. A Companies and Contacts import. Walling more screens. A
mapping screen for accounting codes.

**How it was checked.**
- A reader who built none of it found three faults to fix and six small
  ones: the consent leak above; example boxes still naming a software
  maker and domains anybody could register; and a test that named the
  demo's made-up supplier. It also caught that a fix to one address had
  changed the base address of every mailed link; that was put back.
- Two full release checks, both green: one before the press, and one on
  the commit deployed (16,756 unit tests, 3,385 integration tests, the
  build).
- One walker pressed nine items in a browser. Eight passed, the consent
  fix among them: a second firm saw only what it typed, no search found
  her by her own words, and a person only one firm keeps answered "not
  found" to another. One stopped: the answer after inviting with "Decide
  later" did not say the one sentence. It was fixed with two small things
  the walker reported: an invitation's log line at a firm with no domain
  read "is outside , so", and Add consultant's button did nothing for
  somebody the firm already keeps. The coordinator pressed the three on
  the built app.

**The deploy.** Pushed 17:06 UTC, serving 17:13 UTC: deploy commit 3b4a520a
(source a21e0ffe1), on top of 9233ec91. 22 commits. Two nullable
columns, nothing removed. The build applied them: read-only requests
through the public demo door, to the Candidates list, the bench and the
Sites read, each answered 200. Health: database ready. Every public page,
sign-in, sign-up and `/site/tapin` answered 200. The inbound email door
answered 404.

**Left for a later layer, from the walker's smaller list.** A log row
says an invitation was "sent again" where no email can leave (Layer 4's
failed-invites item). A bench row in the log shows a machine word. "Kept
on the notice for staff to pass on" does not say which notice or which
staff. The rate boxes on Add consultant are not marked optional. Sign-in
says "Nothing is set yet" under "by invitation only". A person invited
with no role is never told who gives her one. Add to bench takes any
record's id. Log rows written before today keep their old words.

**Open, for the founder.**
- The demo's made-up supplier name is read by the tester as a real firm
  in the network. If it is one, the demo firm is renamed.
- For an address that already has an account, three things still differ
  from a new person, and each is his to rule: a rate range below her
  lowest rate is refused; "through their own company" terms succeed where
  her company is on record; her row says the record is "theirs to
  change".
- Should Timesheets, Bills and Invoice receipts be walled by account?
- May an invitation go with no role at all, or is "Decide later" enough?
- Should Add a company stop asking "What are they to you?"

**Lessons, so they are not paid for twice.**
- Before her yes, a firm reads what it typed and nothing else. Every
  reader of a person goes through the one reader, and a filter is a
  reader.
- A route no screen calls is still a door, twice now. A read by id asks
  whose list the record is on.
- A fix to one address is checked against every caller of the function
  it changed.
- One true sentence is written once and read in every place that says
  it.
- A column added by the formatter realigns its neighbors; the schema
  gate reads the change with whitespace ignored.
- The health page proves the database answers, not that a new column is
  there. After a deploy that adds a column, one read-only request that
  reads the changed table proves it.
- A press that does nothing is a fault even where the reason is already
  on the screen. The button is greyed and the reason sits beside it.
