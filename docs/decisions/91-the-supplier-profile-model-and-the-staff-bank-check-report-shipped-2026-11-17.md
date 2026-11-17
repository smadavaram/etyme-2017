## The supplier profile model and the staff bank-check report shipped — 2026-11-17

**What went out.** Deploy commit 72cdea1c, from source 099e3e9c1. It adds
two tables, RemitToChoice and SupplierChangeMessage.

- *The supplier profile, as a procurement network keeps it* (record 87).
  This deploy carries the schema and the readers:
  - a remit-to account chosen per customer;
  - the list of customers that must confirm a change;
  - the "supplier changed" message, built but not sent;
  - the per-payer standing.
- *The supplier walk.* When a customer's Finance marks the bank item, it
  confirms the bank for that customer only. Reopening the item clears
  only that customer's check.
- *The staff bank-check report* at `/dashboard/superadmin/bank-checks`.
  - It is read-only and for Etyme's staff only.
  - It counts the old bank checks that name no paying customer, and lists
    those suppliers with four digits only.

**Held back on purpose.** The founder chose option B. The switch that
makes every payment door, bill and run file follow each customer's own
confirmation (7bb7c7da9) was reverted for this deploy (f23ececa9).
Payments read as they did before. The switch returns after the founder
reads the live report.

**How it was checked.**
- The release check on 099e3e9c1 was green: the type check, 17,418 unit
  tests, 3,738 integration tests and the build.
- A walk said it ships:
  - the report wrote nothing and showed four digits only;
  - staff alone could open it;
  - seeded payments and payroll worked as before.
  On the seeded world the report read 45 suppliers held. The seeded checks
  name no payer.
- After the deploy, the readiness page read the tables as matching the
  code, and the smoke check passed.

**Waiting on the founder.**
- The live report's numbers.
- Whether a bill to a client that is not on Etyme shows the supplier's
  chosen account, with a line to confirm it by phone.
- `ETYME_SECOND_CHECK_KEY`.
