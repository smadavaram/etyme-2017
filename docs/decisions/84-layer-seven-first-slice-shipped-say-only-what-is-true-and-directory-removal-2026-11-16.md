## Layer 7, first slice shipped: say only what is true, and directory removal ends access — 2026-11-16

**What it is.** The first deploy of Layers 7 to 10 (record 80). It was
built to the founder's model split (record 82):
- the labels and wording on the standard model;
- the directory proof on the strongest model.

**What went out.**
- *Honest labels.*
  - A stored SAML directory reads "Stored, not built yet", never "On", in
    the sign-in refusal's own words.
  - A team-structure directory says when it was last read, and that it
    is read only on request. It never says "Connected".
  - The Teams setting says Teams does not confirm a notice arrived.
- *Email.*
  - Wherever an email the provider accepted is shown, it reads "Handed to
    the email service. Delivery is not confirmed yet."
  - A Teams post reads "Posted to the channel. Teams does not confirm it
    arrived."
- *No training on a public page.* A company page serves only its known
  headings, and never one that says the firm trains. Live Tapin was
  checked after the deploy.
- *Directory removal ends access.*
  - A person turned off or deleted in the directory is refused on her
    next request, on every seat route. The refusal is logged first, and an
    identity ledger row is written.
  - A mapped group gives a role, and takes it away, on the next request.
  - A directory-only company refuses every other door, each refusal
    logged: password, email link, consumer sign-in, a sign-in link and an
    invitation link.
  - A revoked SCIM token is logged.
  - A SCIM address change off the company's domains is refused.
- *A refusal names the page the reader opened.* The jobs route reads
  "Jobs", never "Training".

**How it was checked.**
- The release check on 4fca70ccc was green: type check, 17,209 unit tests,
  3,600 integration tests and the build.
- A walk on ab9440839 stopped on one sentence, a client reading "Training
  is not part of your seat". It was fixed with a test that fails first.
- A second walk on 4fca70ccc said it ships.

**The deploy.**
- Deploy commit 7fdf630e, with no database change.
- Smoke check:
  - production served 7fdf630e, and its health page read the database as
    ready;
  - every public page answered 200, and `/site/tapin` answered 200 with no
    training heading;
  - the inbound email door answered 404.

**Open.**
- Three gaps need a database change:
  - a failed directory read is not kept;
  - an unknown SCIM token cannot be logged;
  - group membership is not stored.
- Group roles follow the directory only through SCIM.
- A W-2 row on the Data page's People sheet is not seated. Whether it
  should be is the founder's call.
- The money security piece waits on the founder's ten answers. The
  payment gate faults that break standing rules are being fixed now.
