## Bank instructions and integrations, the way an enterprise ERP does them — 2026-11-16

**What he said.** The founder's words: *"do what [the enterprise ERP he named] would do
for bank instructions and integrations"*. He said this in answer to the ten
questions the Layer 7 step-up plan put to him (record 80, Layer 7;
record 85). He named one enterprise ERP as the standard to follow (named here by
kind only, under the rule that no real company is named), so the
answers below take its established practice. A decision this record
leaves open stays his.

**What that practice is, in plain words.**
- *Bank details on a supplier are sensitive data.* A change to them is
  not live until a second person confirms it. Until then the supplier is
  blocked for payment. The payment run skips a blocked supplier and lists
  it as an exception. It does not stop the run.
- *The person who enters a change never confirms it.* The company that
  pays owns the confirmation. Each paying company confirms for itself.
- *Every change leaves a change record that cannot be altered.* A
  separate security audit log records sign-ins and security events. The
  two are kept apart.
- *A payment run has steps:* proposal, then approval (release) by
  somebody other than the person who prepared it, then the payment file
  to the bank, then the bank's statement to reconcile. Release is signed.
  Each release of a batch asks the approver to authenticate again. The
  signature belongs to the release, not to the session.
- *Recording that the bank paid,* from the bank's own statement, is
  reconciliation. It is not a second release.
- *Interfaces are monitored messages.* Every message in or out has a
  status. A failed one sits in an error list where a person sees it and
  reprocesses it. A duplicate is detected and not posted twice. The
  monitor answers "what happened to this document" end to end. This is
  the founder's stability bar already (record 80), and it is now named
  as the model for Layers 8 to 10.

**The ten answers, taken that way.**
1. *A separate security log that nothing can change.* **Yes.** It sits
   apart from the access log and the activity log, as the security audit
   log sits apart from change records. This supersedes the 2026-11-11
   words "not a third ledger" for security events only.
2. *One check for five minutes of approvals.* **No.** Each act that
   releases money asks for its own check. A payment run is one act,
   however many lines it holds.
3. *The client's own directory check standing in for Etyme's.* **No.**
   The release check happens inside Etyme, whatever door she signed in
   by.
4. *A Teams payment card.* **It opens Etyme for the check.** No money
   is released inside Teams.
5. *A lost device.* **Reset by a second person, never by herself.**
   Another Owner does the reset. Every Owner is told, and it is logged.
   At a company with one Owner, the reset is the Superadmin's recovery
   act, under the standing recovery rule: seven days, with payments and
   bank changes frozen.
6. *A bank change.*
   - The change is entered by the supplier.
   - It is blocked for payment until each paying client confirms it. The
     confirmation is that client's own act, with a call back on a number
     from that client's own records, recorded.
   - The founder's Layer 7 rule also asks for a cooling-off. It runs
     three days from the confirmation, with payments to that supplier
     held and a sentence saying why.
   - Every Owner of the supplier is told at once, on the addresses held
     before the change, with "This was not us".
7. *The second approver.* **The paying client is the second person,
   for every supplier**, not only a one-person firm. The supplier enters
   and the payer confirms. Each payer confirms for itself, so one
   client's check never counts for another.
8. *An Admin.* **May not enter or confirm a bank change.** Whoever
   maintains bank details is kept apart from whoever pays. On the
   supplier's side that is the Owner, or a seat that holds the money
   permission for it. On the payer's side it is Finance, or the AP clerk
   where no Finance seat exists. It is never the person who approves the
   run.
9. *Marking a run paid from the bank's file.* **No second check.** It
   is reconciliation, logged. Release is where the check sits. Marking a
   run paid by hand, with no file, records a bank reference and is
   logged.
10. *Sending a bill.* **No check.** A bill asks to be paid. It moves no
    money.

**Already true in production, and kept.** Approving a run that holds a
receipt whose bank is not confirmed is allowed. The receipt is left out
of the file and shown as held, as a payment run lists a blocked
supplier as an exception (deploy 94c1b532, record 85).

**The order of work.** The step-up plan's slices stand, with these
answers in place of its questions:
1. The schema and the security log.
2. The second check, with its enrollment.
3. The lost-device reset.
4. The check on every release door.
5. The bank change with each payer's own confirmation.
6. The words on the public pages.

Security work runs on the strongest model (record 82).

### Where many clients pay — 2026-11-16

The founder's words: *"many companies take invoice line items to their
[procurement network] or ERP and then process payments."*

For such a client, Etyme does not run the payment, and its release step
is the client's own. Etyme's job is in two parts:
1. Deliver the bill to the client's system line by line, coded with the
   client's own codes (record 80, Layer 9) and matched to the PO line and
   the signed week.
2. Take back what that system did with each line: accepted, rejected
   with a reason, approved, or paid with a reference. Then tell the
   supplier.

Both directions are monitored messages under the bar above: a status on
every message, reprocessing after a failure, and no duplicates. The
second check before money is released (record 86, answers 2 and 3)
applies where the payment is released inside Etyme. Where the client's
own system releases it, that system's own controls apply.
