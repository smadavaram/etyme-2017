## Codes kept by Finance, the coding-fix path, and the second check's core shipped — 2026-11-17

**What went out.** Deploy commit 21384728, from source 1292a7c82. It
made no database change.

- *Who keeps a client's codes.* One permission, `codes.manage`, covers
  the company code, the cost-object kinds, profit centers, vendor numbers
  and a contract's coding.
  - Finance and the Owner hold it. Where a company has no Finance seat,
    the AP clerk holds it.
  - An Admin never holds it, unless the Owner grants it.
  - It reaches existing companies with no migration.
  - The keepers reach the boxes on a new Settings → Cost centers page.
- *Fixing a held line.* "Fix the coding" is offered only to a seat that
  keeps the codes. It opens the line on the side the payer reads it, with
  its coding panel. Every other seat reads who sets the codes.
  - A save that changes nothing is refused.
  - Shares still total 100%.
  - A line split across shares may go again as soon as a rejected share
    is fixed. The screen and the file agree on this.
- *The second check's core* (record 86). A person enrolls a passkey or an
  authenticator app.
  - One check proves one act once, for two minutes.
  - A code used once is refused if used again. Five failures make the
    person wait.
  - Another Owner resets a lost device. Nobody resets their own, and an
    Admin never resets an Owner's.
  - Every check writes a security log row that holds no code or secret.
  - Nothing that moves money asks for the check yet.
  - In production it stays off until the founder sets
    `ETYME_SECOND_CHECK_KEY`. The readiness page says so.
- *Smaller.* The Layer 9 screens now:
  - name the rejected line;
  - list each line's "already sent on";
  - count a split line as one line;
  - give a resend file its own name;
  - confirm that saved columns were saved;
  - let a profit center be edited.

**How it was checked.**
- The release check on 1292a7c82 was green: the type check, 17,382 unit
  tests, 3,720 integration tests and the build.
- The first walk stopped on the coding link and its sentence. After the
  fix, a second walk said it ships.
- An earlier release run caught a function named like a React hook, which
  broke the production build. It also caught a test that read the wrong
  role of two with one name. A grant now reaches the oldest role of that
  name.
- After the deploy:
  - the readiness page reads the tables as matching the code, and the
    security log as proven;
  - "Second check: Missing" names the key to set;
  - the smoke check passed.

**Built by.** The workers ran on the standard model. The lead fixed the
build and the role test (record 82).

**Open.**
- The founder sets `ETYME_SECOND_CHECK_KEY`.
- A cost center's GL box is still open to any settings seat.
- The menu shows Cost centers to an AP clerk who sits beside a Finance
  seat. That clerk reads that Finance sets the codes.
- Next, in record 87's order: the sealed bank papers with the masked
  display and the secure reveal. Then the second check on every door that
  releases money.
