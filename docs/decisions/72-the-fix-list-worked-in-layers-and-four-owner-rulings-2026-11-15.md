## The fix list, worked in layers, and four owner rulings — 2026-11-15

**Why.** On 2026-11-14 the founder's tester pressed the live Tapin tenant:
43 companies and 117 contacts typed in by hand, the Settings pages, the
firm's own profile, and six jobs (add a consultant and put her on the
bench, approve a timesheet, release a bill, extend a company, find a
record, invite a colleague). Every item on the list was seen live;
none is a request for something new. The list names real companies and
people, so it is kept outside the repository. Its items are given below
by number, with no name.

**The founder's framing, 2026-11-15, in his words.**
- "Fix Etyme.com and Tapin at the same time — Tapin first, as the live
  tenant that must run its whole business on Etyme."
- "Working loop: you build and deploy one batch → Pax tests Tapin in
  production (real flows + UX pass) → Pax sends a numbered fix list
  grouped by area → you fix and redeploy → Pax retests only what failed.
  No new features — fix what exists."
- "Work this in deployment layers — ship each layer as its own batch,
  blockers first, each layer independently deployable. Do not hold
  everything for one big release; the business is running on Tapin while
  this ships." The tester retests only the areas a deploy touched, and an
  item closes only on what production shows.
- "Make the app flowy. Every fix should leave the flow smooth end to end
  — no dead ends, no silent no-ops, no form that blocks without saying
  why; a blocked screen links directly to the action that unblocks it.
  Check each fix across all four layers — logical, UX, UI, and
  database/linkage — not just the surface."

**The layers.**
1. *Unblock the business (database and linkage)*: areas H and B.
2. *Money chain*: area E.
3. *Daily flows*: areas A and G.
4. *Findability and access*: areas C and D.
5. *Bench*: area F.
The coordinator reports what shipped per layer.

**Four owner rulings.**
- *The email is the identifier* (2026-11-14). "A contact's email domain
  tells you where he works for." The tester's reading for companies: a
  company's identity is its domain; the same name on a different domain
  is a different company.
- *No dead ends* (2026-11-14). "If a company does not exist while adding
  a contact, it is created in that flow": not classified, and nobody is
  emailed, by the rules of Add a company (record 60).
- *Etyme owns each company's website* (2026-11-15). "The tenant's Etyme
  address is its public storefront, rendered from the same record."
  "Clients, SIs and MSPs get a supplier portal on Etyme, not their whole
  website."
- *The two inventories* (2026-11-15). "Talent is the inventory on the
  lower side of the chain; client control is the inventory on the upper
  side."

**Two decisions are the owner's alone.** No agent settles them and the
tester does not answer them: the Sunday the first pay period starts on,
and whether a W-2 week over forty hours worked outside the US is held.

**The list, by area.**
- *A. Forms.* A1 Add contact: Name, Email, Works for, Role, Title, with
  Works for straight after Email. A2 Works for is read from the email's
  domain, and a missing company is created in the same save. A3 Invite a
  colleague: email first, each role explained in the picker, the role
  checked. A4 Add consultant: email early, a duplicate email caught, pay
  terms after she accepts. A5 A site's address has no postal code, and
  Country cuts what is typed to two letters with no word. A6 A company
  has nowhere to keep its website, a description, its industry, its
  specialty, its markets or a contact address; "Change type" is greyed
  with no words; the firm's own scorecard is empty and says nothing of
  what fills it. A7 Add a company shows a real firm's name as its
  example; two Kind options are not explained.
- *B. Companies and contacts.* B1 A company is refused as a duplicate by
  name where the domain differs. B2 The counts above the list do not add
  up to its total. B3 The domain and entity type typed at add time are
  not on the list; names are drawn from the domain with no spaces. B4
  The Contacts page's Companies tab says there are none. B5 The drawer
  says a company on the list is not on the list. B6 Adding a contact is
  not on the activity log.
- *C. Navigation, search and labels.* C1 The same pages on two or three
  menus, grouped differently. C2 The search box at the top finds pages
  only and does not say so. C3 One area under several names. C4 Rows
  that open a drawer do not look pressable; an invited person's card
  leads nowhere. C5 The Companies list takes twenty seconds to open. C6
  Opening sentences cut off mid-word.
- *D. People and access.* D1 An invitation that was never sent has no
  remedy that works, and the count does not tell sent from never sent.
  D2 Access can be given to a person who has never signed in. D3 One
  person holds three records. D4 The same person's role reads two ways;
  the company's name is listed as an Owner. D5 Confirm a person with
  access can be removed.
- *E. Money chain.* E1 Timesheets shows nothing to approve and does not
  say what must happen first. E2 The Bills page and its dialog name
  different conditions for a bill; the act is called "Generate". E3
  Extending a company commits on one press, and "Can be undone" has no
  undo. E4 Two Settings pages say opposite things about approvals. E5 No
  first pay-period day could be set (answered by the second deploy,
  record 71; to be retested). E6 Integrations shows a choice with
  nothing mapped.
- *F. Bench.* F1 Add to bench cannot add a new person. F2 Its dialog
  says "already on your bench" of somebody only asked, then changes
  shape with no word. F3 One consultant shows three facts that disagree.
- *G. Settings.* G1 Ask Etyme reads off, on and not set up at once. G2
  Sign-in points to the wrong page for proving a domain. G3 A setting
  that is recorded and not enforced does not say so at the control. G4
  Holidays offers a year already added. G5 A site's time zone reads "The
  company's", and the company has none. G6 Controls drawn as if greyed
  or pressed; a sentence printed twice. G7 Companies cannot be imported.
- *H. The firm's own people.* H1 The firm is not a company in its own
  list, so its own employees cannot be added with "Works at" set to it.
  H2 Add contact will not save without a Role.

**How each layer is worked.** A read-only pass traces every item to its
cause and owner. A second reader tries to refute it. Then the owners
build, a reader who built none of it checks, the release check runs
alone, the layer's items are pressed on screens, and the layer deploys
on its own. An item that would be something new is tested against "no
new features" and reported, not built.
