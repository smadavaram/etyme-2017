## The sales-ready batch, and the customer and client split — 2026-11-22

An addendum from the tester to the handover of 2026-11-21 (record 104).
The handover stands; these items join the same list.

**The owner's fact.** Etyme's sales and marketing people start work on
Monday morning, 2026-11-23. The public face and the demo and onboarding
path must be right by then. The customer and client split and the
imports move to the second batch.

**The overnight batch: sales-ready by Monday morning.**
1. The approved home page live in production and checked there: the
   committed build, deployed, not only committed.
2. Six segment pages live: `/for/prime-vendors`, `/for/subvendors`,
   `/for/bench`, `/for/solopreneurs`, `/for/integrators`,
   `/for/contractors`.
3. Privacy, Terms and the DPA published as final, not as drafts.
4. The About page: the ruled-out positioning lines removed; one
   misspelled demo company name and every demo-data typo fixed.
5. The demo tenant cleaned: no real person's name in invented demo
   data, so it is safe to show outside.
6. The onboarding path works end to end: start, the invitation email
   arrives, its link lands correctly, the tenant is usable. Proven with
   one real test invitation.
7. Page analytics on marketing pages only.
8. The email law, for anything that sends mail: BCC and never CC on a
   send to several people; the verified sender is the only way out;
   every send on the ledger (tenant, acting entity, sender, recipients
   as sent including BCC, subject, template or rule version, record);
   agents draft and people approve; a bounce or failure reopens the item
   as "failed delivery", and silence is never delivery; no bulk sends;
   chases are per record and rate-limited; the health of the sending
   domain (SPF, DKIM, DMARC) shown in Settings.

**The second batch, after the tester's morning retest.**
- *A1, the customer and client split* (data model, sequential). Kind
  joins two things today. A **customer** is whoever pays the tenant: the
  payer invoiced, usually the prime. A **client** is the end client
  where the person works: the site, which the tenant rarely deals with
  directly. A **supplier** is whoever supplies the tenant. One company
  can be the customer on one engagement and the client on another, so
  the role lives on the engagement: supplier, then customer, then
  client. Counts and lists show the three as separate groups that sum
  to the total. Existing rows of Kind "client" are not customers by
  default: they are flagged for a person to classify, never relabeled
  silently.
- *A4, imports.* A companies import by CSV (name, role per A1, domain,
  entity type; one company per domain; a dry run that reports creates,
  skips and conflicts before it writes). The people import gains a link
  to a company by its domain.
- Then the stabilization batch in the handover's order.

**Gates, unchanged.** One deploy per batch, then stop. The tester
retests in production. Nothing is done until the retest passes. Claims
are reported as claims with screen and file names.

**Where it meets standing text (the lead's reading, record 108).**
- *A second deploy this weekend.* The weekend contract (record 107)
  says one deploy, and that a second takes the next weekend's first
  slot. Week 1 went out earlier this Sunday. This batch is the owner's
  own direction for the same Sunday, and it is the newer text, so it
  goes out as a second Sunday deploy. It does not go out on Monday: the
  Saturday-and-Sunday rule has no exception.
- *Six segment pages.* The standing text has four doors, with tabs on
  two of them. The six addresses are built as the newer text asks, each
  in the door's own shape; the four doors stay.
- *"Final" legal pages.* Calling a legal text final is the owner's act.
  The draft labels come off on his word here; the text itself is not
  rewritten by an agent beyond what he has already ruled.
- *The demo tenant in production* is rebuilt by a person with the
  secret; no agent holds it. The seed is cleaned in the repository.
- *The real test invitation* is sent by a person in production. An
  agent proves the path on a local copy and names what that cannot
  prove.
- *The email law* touches the standing rule that no screen says mail
  went unless mail can leave, and it adds a ledger of sends. What cannot
  be built and proven tonight is named, never claimed.

### Correction, the same day: whose teams, and the order

"Sales and marketing teams" means the two operating firms' own people:
Tapin's and the second firm's. They start on Monday morning, selling
staffing and working their tenants in Etyme. So the order changes.
Tenant readiness for the two firms comes first; the public face comes
second, still by morning.

1. Staff sign-in proven end to end for both tenants: one real test
   invitation each, the link lands, the tenant is usable.
2. Tapin's real business on the record: its seven billing consultants,
   its three customers, and October's payroll.
3. The customer and client split (A1) moves into the overnight batch.
   The second firm's 33 loaded companies must classify correctly, payers
   as customers and worksites as clients, before its people start.
4. Then the public-face items 1 to 7, unchanged.

The second batch, after the retest: the imports (A4), then the
stabilization batch.

**The lead's reading.**
- Items 1 and 2 are done by a person in production. No agent signs in
  there, sends from there or writes a real record, and no real record
  enters the repository. The lead's part is that the screens they need
  work, proven on a local copy, and a click path written for the tester.
- Item 3 never relabels a row by itself. It gives each engagement its
  payer and its worksite, shows three groups that sum to the total, and
  flags every existing row for a person to classify.

### The owner's correction, the same day: there is no split

"Customer and Client are the SAME for all businesses. There is no
Customer/Client split in Etyme — do NOT build the A1 split (no separate
payer vs worksite company roles, no data-model change for this, no
reclassification of existing companies). Keep the single company
record/Kind as it works today." The second firm's loaded companies stay
exactly as labelled. This supersedes A1 above. Everything else in the
batch stands, in the same order. The home page is confirmed live in
production by the owner, and that item is done.

**What happens to what was built.** The split had been built and
committed (not deployed) before the correction arrived. It is removed
before the deploy: the Classify page and its routes, the three groups
on the Companies list, the two new choices on Add a company, the two
pickers on Record a placement, and the two columns added to the
register row. The screens return to how they worked on 2026-11-21.
Production never held any of it.

**Standing from now.** A company's Kind is one fact. No screen or route
asks whether a company is a customer or a client apart from it, and a
test holds that.
