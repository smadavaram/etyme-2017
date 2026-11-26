# 126 — The enterprise edition is free for 60 days, then it pays — 2026-11-25

**The owner's pricing ruling (Sharath, Nov 25), relayed by the tester with
the architect's mechanics.**

This replaces the "product free for everyone" lock of Nov 23 for the
enterprise edition. It also replaces the Pricing section's "free while
testing" for enterprises.

## The ruling

1. **The enterprise edition is not free forever.** An enterprise starts
   free for 60 days, and then it pays.
2. **An enterprise's suppliers use it free, as users.** When a supplier
   is invited into an enterprise's record to work with it, that access is
   free.
3. **A supplier that uses Etyme for its own business pays.** That means
   its own tenant and its own record.

## How it works (the architect)

- **The spread loop.** An enterprise adopts Etyme. Its suppliers come in
  free, as users. They then adopt it for their own books, and pay. Keep
  that loop frictionless. Never meter or gate a supplier's access as a
  user inside a client's record.
- **The 60 days start when the tenant is activated.** On day 61 an unpaid
  tenant becomes read-only:
  - nothing is deleted (hide, never delete);
  - agents stop;
  - its data stays intact;
  - access returns on payment.
- **A supplier's own-business tenant gets the same 60-day trial.**
- **Unchanged:**
  - agent use is still metered per action on the ledger, on top of the
    price;
  - solving work is still consulting at $200 an hour;
  - Tapin and the second firm stay the internal proving tenants, under
    the sales gate.
- **Record 124 is amended.** "Switching it on is free" now reads:
  switching it on follows the tenant's edition, so a paying enterprise
  tenant switches modules on as a paid tenant. The plugin ruling itself
  stands.
- **The home page.** The line "Enterprise free for 60 days" replaces the
  old "Free for the first five firms" copy. It is on the Saturday batch
  list. No live pricing or copy changes before the Saturday release.

## Not decided here

The enterprise price is the owner's money decision. The tester brings him
a structured recommendation separately. No agent invents a price.

## Amended by the owner, Nov 25: the rule is recursive

The owner: "Same for customer/client of a supplier."

The rule "free as a user, pay for your own business" applies at every
level of the network, not only from an enterprise to its suppliers.

- **A supplier's customers and clients are free as users.** That holds
  when the supplier invites them into its record. They pay only when they
  run their own business on their own tenant.
- **End clients named on placements are free as users too.**
- **Every company is a free user in someone else's record**, and a
  potential paying tenant in its own. That is how Etyme spreads, at every
  level.

## The tester's rulings on the two open questions, 2026-11-26

1. **"Own business" is ruled as a rule the code can test.** A company
   runs its own business on its own tenant when this count, read from its
   own tenant record, is above zero:
   - placements where the tenant is the supplier of record, plus
   - invoices the tenant issued.

   Being a user inside another tenant's record never counts. That covers
   viewing, working together, and being named on a placement there. The
   test decides whether a tenant pays. The 60-day clock still starts when
   the tenant is activated.
2. **Day 61 read-only, and work already done, is the owner's money call.**
   It is with the owner now. The tester's recommendation is on the record:
   - On day 61, block new work: no new placements, no new agent actions
     and no new invoices.
   - Work already done completes its money cycle. Timesheets in progress
     can still be approved and invoiced, so workers already placed are
     paid and nothing earned is trapped.

   The 60-day mechanics are not built until the owner answers. The rest of
   the queue does not wait for it.
