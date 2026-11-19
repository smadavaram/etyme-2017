## The tester's list of 2026-11-18: what blocks real use

**What was sent**, in the order the items block real use. The first two
were found that day on production (deploy 17f680c4).

1. **Ask submissions vanish (H2).** A public Ask on a firm's page says
   "waiting for them on Etyme", and then appears nowhere in the tenant:
   not in conversations, not assigned, not searchable. A real
   consultant's question was lost to view that day. Every Ask submission
   must land in the tenant's Ask queue, visible and assignable.
2. **No onboarding path for employees (H3).** Tapin's nine consultants
   have no records: not users, not candidates, not on the bench. A login
   alone creates nothing. It must be: record or invite first, then the
   person's login lands on the record that exists.
3. **Resending an invitation delivers nothing (D1).** The Owner is
   offered Resend, and the staff log shows the mail provider answering
   403.
4. **The invitation email's layout (H1, remainder).** One branded
   button, no raw address. Then a test invitation checked on a phone,
   then the 21 resends for his second firm.
5. **Two Owner identities to merge (D3, D4).** One person holds two
   Owner seats on two addresses, which is the root of the
   tenant-switching trouble. A Candidates record named after the firm
   carries his address.
6. **Add to Bench is a dead end (F1).** "Choose somebody first", with no
   way forward to create a person.
7. **Company profile fields missing (A6).** No website, description,
   industry or type, specialty, or markets served.
8. **Entity type is never filled (B3)** on any company row.
9. **Companies import (G7)** still reads "not built yet".
10. **Minor.** One name for a timesheet's state ("Waiting on you" and
    "Submitted" are both shown). The Companies list takes about ten
    seconds. The firm is missing as a row in its own Companies list.

**What was read from the code that day** (not run).
- *Item 1, the cause.* The public Ask route writes only notification
  rows for up to a few seats that may put people forward
  (`src/app/api/site/[slug]/ask/route.ts`). The Notifications page was
  deleted (CLAUDE.md, "Ask Etyme and the twin"), and nothing else lists
  those rows. The question is in the database; no screen shows it. The
  email copy of each notice goes through the same mail provider as
  item 3, so it most likely failed as well.
- *Item 3, the likely cause, not confirmed.* The mail goes out from
  one configured address. A 403 from a mail provider usually means the
  sending domain is not verified with it, or the key may send only to
  the account's own address. That would explain why invitations to his
  own address arrive and those to others do not. It is a setting on the
  provider's side, checked there by the founder.
- *Item 4.* The layout shipped in deploy 17f680c4 (record 97). An
  invitation sent after that deploy carries the button. Waiting on his
  test on a phone.

**Order of work**, after the usage allowance resets: 1, 2, 3 (whatever
is left in code once the provider is set right), 6, 5, 7, 8, 9, 10.
Items 1 and 2 are found faults on a trust flow, so each becomes a
browser case that fails first, a contract line, and a line here.
