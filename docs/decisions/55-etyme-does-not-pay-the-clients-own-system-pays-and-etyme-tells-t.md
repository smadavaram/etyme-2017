## Etyme does not pay; the client's own system pays, and Etyme tells the supplier — the founder, 2026-11-12

*"Most clients don't want to pay here. They want ERP systems to pay
them. Smaller vendors would pay them to work with ADP or send ACH
checks, but not larger clients. That easy integration is required for
payment runs, and notify suppliers when payments are completed."*
Tested against the five questions: core problem strong (an AP clerk
re-keys approved invoice receipts into the system that pays, and the
supplier is never told it was paid); credit strong (a supplier that
knows the day it is paid is what a lender advances against);
micro-distribution partial; the stepping stone is a live connection per
accounting system a paying client names; simple strong ("Approve here,
pay from your own system, your supplier is told"). Verdict: build now,
files first.
- **Etyme never moves money.** A payment run is the list of invoice
  receipts that passed the three-way check and were approved to pay.
  It is not a payment.
- **A large client pays from its own system.** The approved run leaves
  Etyme as a file its system reads (one row per invoice receipt: the
  supplier, the pay-to details on record as the bank name, account name
  and last four digits only, the invoice number, the order, the amount,
  the currency, the due date). When its system has paid, the
  confirmation comes back as a file or a typed-in reference; Etyme
  marks each receipt paid through the one payment function and never
  marks one the confirmation does not name.
- **A small firm pays through its payroll provider or its bank.** The
  same run exports in the shape its provider or bank takes. Which
  provider is a setting the firm picks by name, a label and never an
  argument; a bank file is built only to a format confirmed with its
  published specification, and Etyme still sends nothing to a bank.
- **The supplier is told the day it is paid**: which invoice, how much,
  the reference, and on which bill of its own it lands, in the app and
  by email, once per payment.
- **Built in this order:** the run's export and the confirmation's
  import on the existing payment run, generic file first (money); the
  supplier's notice (conversation); a named format per provider only
  when a paying client or a real firm names one.
