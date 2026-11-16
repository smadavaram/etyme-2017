## The payment gate pays only a checked account, and payroll waits for a verified Owner — 2026-11-16

**What it is.** A Layer 7 deploy (record 80). While planning the passkey
check, a reader found three faults in live code. Each broke a rule that
already stands: "Payment stays strict", "no payment to a firm whose bank
is unchecked", "A bank change clears the bank check", and "Until a
company has a verified Owner, paying waits". They were fixed without
waiting for the founder's ten questions on step-up and bank changes,
because the rules already decided them. All money work ran on the
strongest model (record 82).

**What went out.**
- *One account pays.* The payment gate, the bank check, the payment-run
  file and every bill read one row: the firm's default, else the first
  entered (`payToRow` and `payToOnBill` in `lib/money/pay-to`). Payment
  waits until that row is checked. A newer unchecked default holds
  payment, even where an older row was checked.
- *A waived bank item checks nothing.*
- *Bills print only the checked account.* Where the row is unchecked, a
  bill, its own pages and the emailed bill page all say "Payment details
  are being confirmed, so no account is printed on this bill yet." They
  never print an older or superseded account.
- *Payroll and payment runs wait for a verified Owner.* This covers
  approving a payment run, approving and processing payroll, off-cycle
  pay, the commission run, and the reserve draw and exit payout. Each
  refusal is logged before it is sent, in payroll's words ("Paying your
  people waits…"). No Process, Run or Approve button is drawn while the
  company waits. A company formed before the proof rule, as Tapin was,
  pays as before.
- *A bank change is saved in full and logged once.* Settings saves the new
  digits, and Settings and Setup clear the check through one rule. Each
  writes one log row showing the bank, the account name and four digits.
  The row is never offered as undone.

**How it was checked.**
- Every fix has a test that fails on the old code.
- The release check on b6157ace8 was green: type check, 17,226 unit
  tests, 3,619 integration tests and the build.
- A walk on the build said it ships. No payment reached an unchecked
  account, no old account was printed, and no full number was stored or
  logged.

**The deploy.** Deploy commit 94c1b532, with no database change. The smoke
check passed: production served 94c1b532, the database read as ready,
every public page and `/site/tapin` answered 200, and the inbound email
door answered 404.

**What a firm will notice.** A firm whose bank details nobody has checked
yet now sends bills with no account printed, saying the details are
being confirmed. The fix is that its client's Finance (or AP) checks
them.

**Open.**
- *Per-client bank check.* One client's check still counts for every
  client of that supplier. This needs schema, and belongs with the
  bank-change build.
- *Approving a run that holds an unchecked receipt is allowed.* Release
  is refused, and the file leaves the receipt out. Whether approval
  should refuse too is not decided.
- *The Setup bank form keeps the last four of a full number typed.* It
  does not refuse it. The Settings route refuses it.
- *"Download the file for your bureau"* on Payroll was not checked while
  the Owner is unverified.
- *The founder's ten questions* on the passkey check and bank changes
  still wait.
