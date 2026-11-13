## Invariants the database must enforce

Not the UI. The database.

- A `Submission` requires a live `BenchListing` granted by the consultant —
  **unless the submitting firm employs the person** (an EMPLOYEE `Context`),
  in which case the employment is the consent, the kind is `INTERNAL`, and
  the employee is told rather than asked. Decided 2026-09-17; see "Who
  sells and who buys".
- `Submission` is unique on `(requirementId, personId)` — first submission wins on duplicates.
- `SubmissionKind` is computed from ownership, never accepted from a client.
- Rate bands live on `RequirementInvitation`, never on `Requirement` where a recipient
  could read another vendor's rate.
- Every read of another person's data writes an `AccessLog` row, including refusals.
  **And a refusal's row is written before the refusal is sent. Decided
  2026-10-08.** Found by the sign-up walk: the row was written without
  waiting, and a serverless host may stop the function the moment the 403
  goes out, so the row could be lost — the invariant held in tests and
  not in production. Now a refused read goes through `recordRefusal` in
  `lib/access-log`, which waits for the write and never throws: if the
  write fails, staff are alerted and the refusal still stands. Successful
  bulk reads stay fire-and-forget on purpose.
  `__tests__/invariants/access-lifecycle-log.test.ts` names every route
  that still logs a refusal without waiting, and that list may only
  shrink.
- Anything the system does unprompted writes an `AutomationLog` row with a plain-English
  reason and an honest `reversible` flag.
- Match scores always carry `factors`, `basis`, `confidence` and `unknowns`.
  A bare number is a bug.
