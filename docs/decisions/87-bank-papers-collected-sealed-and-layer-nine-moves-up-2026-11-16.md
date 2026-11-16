## Bank papers are collected sealed, and Layer 9 moves ahead — 2026-11-16

**What he said.**
- *"and at that point [the bank-verification service] and [the payroll
  provider] need to know - we capture it through w4 or w9 and void
  check"*.
- To the question on the bank papers, he chose: Etyme collects them,
  sealed.
- To the question on order, he chose: move Layer 9 up.

**The bank papers.** This replaces the 2026-11-14 rule that the payroll
provider holds each person's W-4, bank details and tax number, and that
Etyme holds none of the three.
- Etyme collects the papers as papers on the record:
  - a W-4 for an employee;
  - a W-9 for a contractor or a firm;
  - a voided check for the bank.
- They are sealed. Only HR and payroll may read them, and no AI model
  ever reads them (record 81, Lane C).
- The bank account is verified by the bank-verification service.
- The papers are passed on to the payroll provider.
- The record keeps the bank name, the account name and the last four
  digits in the open, as before. A full account or tax number is never
  written to any log and never put in any export.
- The founder then added: *"bank details should be masked and displayed
  on secure approval"*. So bank details are kept sealed and shown masked
  everywhere (the bank, the account name and the last four).
  - The full details are shown only to a seat whose role may read them,
    and only after a fresh second check inside Etyme (record 86, answer
    2).
  - Each showing is written to the security log.
  - The full details are never in a log, an export, an email or a reply
    from Ask Etyme.
  - How long the sealed papers are kept is a retention rule the founder
    sets. Until then they are kept sealed, and the screen says so.
- Each step is a monitored message under the bar of record 86: when the
  papers were received, verified and passed on, and any failure. A
  change of bank goes to the verification service and the payroll
  provider in the same way, after the confirmation of record 86.

The service and the provider are named only as labels on the company's
own setting.

**The order.** Clients take bill lines into their own procurement or
accounting system and very rarely pay in Etyme (record 86). So Layer 9's
delivery of coded lines to the client's system, and the paid or rejected
status coming back, moves ahead of the rest of Layer 7's money work. The
foundation now being built (the tables and the security log) finishes
first. Then the order is:
1. Layer 9, slice 1: the client's file of its received bills, line by
   line, in its own codes, with a column picker.
2. Layer 9, slice 2: a monitored message for each file and each line.
   Nothing is sent twice, and a rejected line can be sent again after a
   fix.
3. Layer 9, slice 3: the answer file, paid or rejected with a reason.
4. The bank-paper flow above, with its masked display and secure reveal
   (it needs the second check, so the second check's core comes with
   it).
5. Layer 7: the second check before money is released, the lost-device
   reset, and the bank-change confirmation by each payer.
6. Layer 9: country formats (tax columns first), API delivery, and the
   path for bills with no PO.

**Defaults taken for Layer 9, unless he says otherwise.**
- A client's file carries no bank details: the client's own system holds
  the bank.
- A paid answer by file or by hand is enough for small-business and
  local accounting software for now.
- A line the client's system rejects goes back to held, and the supplier
  reads the system's reason.
- Tax columns come before country date and number formats.
- A line with no client code is held from the file and listed as held.
