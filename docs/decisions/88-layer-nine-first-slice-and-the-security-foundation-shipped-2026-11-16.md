## Layer 9's first slice and the security foundation shipped — 2026-11-16

**What went out.** Deploy commit 90cddd91, from source 0b69cd3fc. It
carries:
- *The client's coded line file* (Layer 9, slice 1, record 87). On an
  approved payment run, the paying client downloads one row per invoice
  line, or one row per cost-center share. The file is in its own codes,
  with a column picker and no bank details.
  - Shares add back to the line to the cent.
  - A line with no code, a receipt recorded only as a total, and a
    receipt the pay gate refuses are each held and named.
  - A download writes no payment and logs who is on the lines.
  - Built on the standard model.
- *The security foundation* (Layer 7, slice S0, record 86). It adds new
  tables for:
  - the security log;
  - passkeys and authenticator apps;
  - a bank-change request;
  - one bank confirmation per paying client.

  The database itself refuses to change, delete or empty a row of the
  security log. No screen changed, and who may pay did not change. Built
  on the strongest model.

**How it was checked.**
- The release check was green: type check, 17,268 unit tests, 3,638
  integration tests and the build.
- A walk said it ships. It confirmed:
  - three shares summed to the cent;
  - every refusal was a sentence;
  - no payment was written;
  - every attempt to change the security log was refused by the
    database.
- After the deploy, production's readiness page reads "The security log
  cannot be changed: Proven". That proves the tables arrived and the
  guard is in place.
- The smoke check passed: every public page and `/site/tapin` answered
  200, and the inbound email door answered 404.

**Open, from the walk and the builders.**
- The sentence for a receipt with only a total does not say who fixes it.
- "Nothing to pay" sits beside an approved run on the same panel.
- A held week's sentence breaks the payroll table's pay-rate cell.
- Accounts Receivable holds the permission to download the file. That is
  as the route says; whether it should is the founder's call.
- The column choice is not saved yet.
- The file cannot yet carry:
  - a company code or profit center;
  - a PO line;
  - the payer's own vendor number;
  - a WBS, project or material code.
- A run can be downloaded twice, until slice 2's message record.
- When the pay gate switches to the per-payer confirmation, every old
  check is carried to the payer that made it, wherever the record shows
  which payer that was. The rest are listed for the founder before the
  switch.
