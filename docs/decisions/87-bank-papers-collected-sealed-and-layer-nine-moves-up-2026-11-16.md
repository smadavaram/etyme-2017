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

### The supplier's own profile, the way a procurement network keeps it — 2026-11-17

The founder asked whether the vendor master is self-managed, and answered:
*"Do what [the procurement network he named] does."* (The network is named
here by kind only, under the rule that no real company is named.) A
procurement network keeps the vendor master like this, and Etyme now
follows it:

1. **The supplier keeps one profile of its own**: legal name, tax form
   (W-9), addresses, and its remit-to bank accounts. It enters the profile
   once, and every customer it trades with reads it. A customer never
   types a supplier's details.
2. **A supplier may keep more than one remit-to account and choose which
   account each customer pays.** The payment, the run file and the bill
   read the account chosen for that customer, falling back to the
   supplier's default. This refines the one-row rule of record 85: there
   is one row per customer, not one row for all customers.
3. **Each customer registers and approves the supplier for itself**, in
   its own workflow. That workflow is the existing four-role supplier walk
   (department lead, Procurement, HR, Finance), with the customer's own
   questions. One customer's approval never counts for another.
4. **A change the supplier makes to its profile goes to every customer it
   trades with, for that customer's approval**, as record 86 says for
   bank details: a recorded call back, a second person, then three days.
   Until a customer approves the change, that customer keeps paying under
   the details it last approved, or holds payment where the bank changed.
5. **An approved change goes to the customer's own system** as a
   monitored message, so its vendor record in its accounting system is
   updated (Layer 9). The message is a "supplier changed" message, keyed
   by the customer's own vendor number for that supplier. It carries no
   full account number. The customer's system confirms the bank on its own
   side.
6. **Payment advice comes back to the supplier**, which Layer 9 already
   does.

A worker's own W-4 and voided check stay as decided above: she enters
them on her own page, her employer's HR or payroll checks them, and they
go to the payroll provider.
