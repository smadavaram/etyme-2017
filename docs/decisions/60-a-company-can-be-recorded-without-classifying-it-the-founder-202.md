## A company can be recorded without classifying it — the founder, 2026-11-12

The founder's brief, saved word for word in the session's notes. He
wants to load the firms and people he already knows into Tapin as plain
Company and Contact records, and classify them later. Add a company
forced him to call each one a supplier or a client on day one. His
ruling: *"do not load them mislabelled as Vendor/supplier. Fix the
product first."*

His rules:
- **Add a company gains a first choice: "Company — not classified
  yet."** Only the name is required. "What are they to you?" is not
  asked, and nothing is stored as supplier by default.
- **Kind and position are two facts.** Kind is what a company is.
  Position is where it sits to us: Customer above us, Supplier below
  us. Position is set by the contract or relationship record, never by
  Kind.
- **One company can hold both positions at once**, under two
  relationships. Removing one leaves the other.
- **"Extend to Supplier" and "Extend to Customer"** add the position
  in one step, on the row and in the detail view. Extending never reads
  or changes the Kind, and it is recorded with who and when.
- **A company with no position appears only on the Companies list, with
  a "Not classified" badge, and in the Contacts "Works at" choice.** It
  is in no supplier or client list or count, not in the send-a-job
  picker, and in no supplier or client workflow.
- **"Saving a company never emails them."** The form says so. Nothing
  is sent or notified by recording a company, adding a contact or
  extending.
- **Existing companies are untouched.** No migration changes a kind or
  a relationship.

The coordinator's calls, each reversible by the founder in a sentence:
1. No new table. A recorded company is the firm's own unclaimed record
   with one new Kind value, "not classified". Its position is a row on
   the existing register.
2. Extend to Customer writes the Customer position and an unsigned
   agreement record. The company reads as a Customer with "no agreement
   signed yet" until it is signed.
3. Extend to Supplier does not start supplier qualification. That still
   starts from Suppliers.
4. A position cannot be removed while real work hangs off it: an
   order, a placement, a bill, a signed agreement, an open invitation.
   The refusal says which.
5. The same name twice on one firm's list is refused, with a link to
   the first.
6. A firm already on Etyme is not copied. The reply offers "Ask them to
   link", and only that press contacts them.
7. A recorded company cannot be named on a contract or an order until
   it holds that position. The refusal names the step.
8. A recorded company cannot be invited to take its page until its
   Kind is set. Nobody is ever seated at a company with no roles.
9. The Kind of a firm's own unclaimed record can be set later from its
   drawer. Only a firm's own Owner sets the Kind of a firm on Etyme.
10. A seated person adding a company is not registering one. So a
    partner invited on a public address can add a company; before, the
    form refused them.

Built by the architect in two stages (rules and routes, then screens),
with one test that walks his six acceptance lines and the three layer
additions. The record of what shipped goes under this line.
