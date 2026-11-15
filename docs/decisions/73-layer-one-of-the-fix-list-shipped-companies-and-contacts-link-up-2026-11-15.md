## Layer 1 of the fix list shipped: companies and contacts link up — 2026-11-15

**What it is.** The first of five layers of the fix list of 2026-11-14
(record 72): areas H and B. The firm's own people as contacts, the Role
on a contact, and the linkage between companies and contacts. It went
out as its own deploy.

**What the read-only pass found.**
- *The 324 extra companies.* They were not the firm's network. They were
  every other company on the deployment. The Companies route asked
  whether the caller was on Etyme's staff list before it asked whether
  she held a seat, and the signed-in address was both. The same cause
  made the drawer refuse a row the list had drawn.
- *Duplicates.* The own-list check compared names only and never read
  the domain that was typed.
- *Typed and lost.* A domain and an entity type typed with a Kind other
  than "not classified", or through the clients form, were dropped with
  no word.
- *The firm's own people.* The contacts route refused the firm's own
  name outright, and the picker never offered it.
- *The picker.* It read a narrower set than the route accepted.
- *Role.* Not required in the code; the form read as if it were.
- *The activity log.* Adding a contact wrote no row.
- No item needed a schema line, and no row the tenant had typed was lost
  or rewritten.

**What went out.**
- A staff address that also holds a seat reads her seat's own book, on
  Companies and on a company's sites. Staff reach is for a staff caller
  with no seat.
- Every row on Companies sits in a tile and the tiles add up. A company
  on the list through work only reads "Works with you"; a firm on Etyme
  the reader only wrote down reads "Not linked yet", shows its name and
  nothing else, and offers "Ask them to link". Her own asks wait under
  "Asked, waiting on them".
- A company is known by its domain among a firm's own records. The same
  domain is the same company whatever the name; two domains are two
  companies under one name; with no domain on either side the name rule
  stands; where one side has a domain, the second is saved and the
  message says they share a name. A personal mail domain is nobody's
  identity. The clients form, the supplier paste and supplier approval
  read the same rule. No firm on Etyme is looked up to decide it.
- A typed domain and entity type are kept by every door and shown.
  Domain is the second column. A typed domain is never written to the
  column other firms join by. An email typed in the domain box gives its
  domain; words that are not a domain are refused at the box.
- A company the firm recorded, and nobody has claimed, can be corrected
  from its drawer: name, domain, entity type. The log says who changed
  what.
- Contacts is people. The firm's own name is the first choice under
  "Works at", with one line saying it gives no login and sends nothing.
  Every company on the Companies list can be chosen, through the list's
  own reader. Role is marked optional. The same person is never saved
  twice without a question. Adding a contact writes one activity-log
  row.
- Suppliers lists the people Contacts lists. A firm pasted a minute ago
  reads as having no work and no agreement. A paste writes one
  activity-log row and says only what happened to its invitations.
- The link that takes a supplier's account is in the letter to the
  supplier and in no reply.

**Defaults the coordinator chose, for the founder to overrule.**
- The firm's own name is the first "Works at" choice and is not a row on
  its own Companies list.
- The Companies tab on Contacts is removed.
- The 117 contacts already typed get no activity-log rows after the
  fact.
- A person at the firm's own firm is a plain contact; no matching
  against seats or candidates.
- One addition: Edit on a recorded company. Without it a mistyped
  domain, or a name made from a domain, could never be corrected.

**How it was checked.**
- A reader who built none of it ran the routes on a tenant shaped like
  the live one and found five faults: a real company's name from the
  list in a test file; a client that only wrote a firm down could read
  that firm's seated people under Contacts; the drawer answered a
  not-linked firm with its Kind; an unreadable domain was dropped with
  no word; clearing a pasted supplier's domain logged a change that did
  not happen. All fixed.
- Four full release checks. The first stopped on a link the build could
  not type and on two tests that pinned dates on the seeded world. The
  second on a test that depended on the order of three rows. The third
  was green. The fourth, on the commit deployed, was green.
- Two presses in a browser, as an Owner who is also on the staff list.
  The first passed the lists, the counts, identity, the firm's own
  people and the log, and stopped on four things: the drawer showed old
  values after a save; her own ask to link showed nowhere; "Update
  them" pointed to a step that does not exist; Suppliers contradicted
  Contacts. The second passed nine items of ten; the tenth was a page
  that refused an Owner before her seat had loaded, fixed and checked in
  a browser on the built app.

**The deploy.** Pushed 08:30 UTC, serving 08:36 UTC: deploy commit aaafbb9f
(source a09c53b5b), on top of ccc1da3e. Sixteen commits, no schema line.
Health: database ready. Every public page, sign-in, sign-up and
`/site/tapin` answered 200. The inbound email door answered 404.

**Open, for the founder.**
- May a company name alone, where exactly one firm on Etyme has it, send
  that firm an ask to link? Today its domain or its Etyme address is
  needed.
- May a firm edit and remove a contact it typed? Neither exists.
- Should a company's site names follow a rename of the company?
- The demo's made-up supplier name is read by the tester as a real firm
  in the network. If it is one, the demo firm is renamed.
- The page behind a supplier's apply link shows an approved supplier the
  link to take its account. Keep it there, or send it by email only?

**Lessons, so they are not paid for twice.**
- A flag that widens a read is asked after the seat, never before it.
- A page address written as a string is checked only by the production
  build. A builder types it, and the coordinator type-checks against the
  build's own types before the release check.
- A test never pins a date on the seeded world or on the clock, and
  never the order of rows that tie.
- A fix list that names real firms stays outside the repository, and
  the reader greps the diff for its names. One reached a test file for
  one commit.
- A link or token that seats somebody is never in a reply, even one no
  screen reads.
- A read-only pass before building found that two items were one cause
  and one item was not in the code at all.
