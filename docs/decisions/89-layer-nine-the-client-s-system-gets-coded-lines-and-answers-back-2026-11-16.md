## Layer 9 shipped: the client's system gets coded lines and answers back — 2026-11-16

**What went out.** Deploy commit 907a9b10, from source f5b248c53. It
adds two tables and four columns. The founder chose this order in
record 87.

- **The client's codes.** Any company that pays invoice receipts sets:
  - its company code;
  - the kind of each internal order (internal order, project code, WBS
    element, material code);
  - a profit center on a cost center;
  - its own vendor number for each supplier.

  A supplier never reads any of these.
- **The file is a message.** Every download records each line and share
  as sent, in the same save, so a line is never sent twice. "Send again"
  re-sends only a line that was rejected or failed and has been fixed
  since. The file carries the company code, the profit center, the
  payer's vendor number and the PO line. The client's column choice is
  saved.
- **The answer comes back.** The client's system answers by file, or by
  one typed line for small systems.
  - Accepted is recorded.
  - Rejected is held, and the supplier reads the reason.
  - Paid goes only through the one gate, and only for a whole invoice.

  The same answer twice changes nothing. A row for another company is
  refused and logged.
- **The supplier sees each line's state** on its bill page, with the
  next step for a rejection, and never the client's codes.

**How it was checked.**
- The release check was green: type check, 17,331 unit tests, 3,673
  integration tests and the build.
- The walk said it ships. It confirmed:
  - a second download sent nothing again;
  - a rejection held the invoice;
  - a fixed line went out alone;
  - one paid answer wrote exactly one payment, and a repeat changed
    nothing;
  - no client code reached the supplier.
- Production's readiness page reads that the tables match the code, and
  the security log as proven.
- The smoke check passed.

**Built on the standard model, with the lead's review** (record 82).

**Open.**
- From the walk:
  - The paid-while-rejected refusal does not say "rejected", and it
    repeats per share.
  - The page shows only "N lines were already sent", not each line's date.
  - A resend counts split rows as lines.
  - Saving columns shows no confirmation.
  - A profit center cannot be edited after it is added.
  - No screen edits an allocation's coding.
  - One label is not tied to its box.
- A program seat records a paid answer by API only. No screen draws the
  answer box for it.
- Next, in record 87's order: the sealed bank papers with the masked
  display and the secure reveal, with the second check's core.
