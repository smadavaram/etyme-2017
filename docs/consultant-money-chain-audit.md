# The consultant's money chain — audit and requirements

From "they started work" to "they were paid and rated". Eight stages,
audited against the 2017 code, then written up as numbered requirements.

Nothing here is built except three defects that were found while looking
and were too dangerous to leave written down (§4). Everything else is a
requirement waiting for a decision about sequence.

---

## 1. The chain, stage by stage

| # | Stage | 2017 | Now | Verdict |
|---|---|---|---|---|
| 1 | Engaged | Contract + buy/sell pair, document signing, salary terms | `SellContract`, `BuyContract`, `ContractLink`, `DocInstance` | **Works** |
| 2 | Records time | Consultant creates and submits a timesheet against their contract | `/api/timesheets`, `/dashboard/my-work` | **Works** |
| 3 | Time approved | Approver approves, per day or whole, then it mirrors to the sell side | Whole-timesheet approve only, no mirror | **Partial** |
| 4 | Billed | Timesheet → invoice line → invoice → three-way match | `InvoiceLine`, `Invoice`, `InvoiceMatchOverride`, PO match | **Works, better than 2017** |
| 5 | Client pays | `ReceivePayment` against an invoice | `Payment` | **Works** |
| 6 | Consultant paid | `Salary` per period: seven states, advances, carried balance, commissions | Pay items computed from approved timesheets | **Partial — the hardest gap** |
| 7 | Expenses | Consultant submits, three bill types, flows into salary or invoice | `Expense` exists; a consultant cannot create one | **Partial** |
| 8 | Reviewed | Star ratings per category on the company↔consultant relationship | Nothing | **Missing** |

### Stage 3 — approval, in detail

2017 approved a timesheet **day by day**. `TimesheetLog` carries one row
per `transaction_day` with its own status — pending, approved,
partially_approved, rejected — against a contract term. That is what made
`partially_approved` a real state rather than a label: a client could
accept four days and query the fifth, and the four still billed.

We have a `PARTIAL` status with nothing behind it. Approval is all or
nothing, so a disputed Friday holds up the whole week.

2017 also **mirrored the timesheet from the buy side to the sell side** on
approval (`timesheet_approval_service.rb:31-58`): the approved buy-side
timesheet was duplicated onto the sell contract, with its transactions, so
the client-side record appeared without anybody re-entering it. We have
`ContractLink` joining the two contracts and nothing that carries an
approval across it. In a subcontract chain — vendor → prime → client — the
hours are entered once and must appear at every level, and today they do
not.

### Stage 6 — paying the consultant, in detail

This is the largest missing piece and it is worth naming precisely,
because "payroll exists" is not the same as "somebody gets paid".

2017's `Salary` is one row per contract per period with seven states:
pending → open → calculated → commission_calculated → processed →
aggregated → cleared. Around it:

- **Salary items** — the approved timesheets and expenses that make up the
  amount (`salary_calculation_service.rb:10-44`)
- **Salary advance** — money already given, deducted from the total
- **Carried balance** — `process` computes a balance and writes it onto the
  *next* period's `pending_amount`, so an underpayment or overpayment
  follows the person forward instead of being lost
- **Commissions** — `ContractSaleCommision` with its own three cycles
  (calculate, process, clear) and a rate, frequency and cap
- **Three separate cycle dates** — salary calculate, salary process, salary
  clear — each with its own day-of-week, dates and end-of-month rules,
  configured per company in `PayrollInfo`
- **`ContractBook`** — a running ledger per contract per beneficiary:
  previous, total, paid, remaining

We have `/api/payroll` computing pay items from approved timesheets, and
the cycle engine that can generate the dates. We do not have: advances,
carried balance, commissions, the ledger, or any record of a payment
actually made to a person. `BUILD.md` §6 already names bank details and
commissions as gaps; this is the same hole seen from the other end.

### Stage 8 — reviews

2017 rated the **relationship**, not the person: ratings hang off
`CandidatesCompany` (`candidate_review_service.rb`), one overall score plus
a score per `RatingCategory`, averaged and rounded to the half. Written by
somebody at the company, with a description.

Nothing exists here. Which is defensible — a rating written by the party
who profits from the relationship is worth little, and the buyer-reputation
work already prefers counted behaviour over stars. But the consultant
currently accumulates no evidence of how the work went, and "what happened
last time" is the single most useful thing a bench listing could carry.

---

## 2. What 2017 got right, and must survive

Seven rules, earned over years, that any new implementation has to keep.

1. **No skipping a period.** A timesheet may only be submitted for the
   period after the last one submitted; the error names the period they
   owe (`candidate_timesheet_service.rb:96-105`). Without it, weeks go
   missing and are found at year end.
2. **No submitting before the period ends.** `end_date <= now`, checked on
   submit, not on save.
3. **No submitting before the contract's first timesheet date.** The
   message says which date, rather than refusing blankly.
4. **The cycle advances itself.** On save, `first_date_of_timesheet` moves
   to the next date by the contract's own frequency, so the next period is
   already waiting.
5. **Approval mirrors down the chain.** Entered once, appears at every
   level of a subcontract.
6. **The balance follows the person.** An under- or overpayment lands on
   the next period rather than being written off.
7. **Day-level approval.** A disputed day does not hold up the week.

---

## 3. What 2017 got wrong, and must not be ported

- **Money as floats.** `salary_advance`, `pending_amount` and
  `approved_amount` are floats; everything else is decimal. We already use
  integer minor units, and this is why.
- **State in seven places.** Timesheet status, contract cycle status,
  salary status, timesheet log status and expense status all had to agree.
  They did not, and reconciling them is most of what the 2017 payroll code
  does.
- **Amounts recomputed on read.** `set_cost_and_time` recalculates on
  approval from the rate at that moment, so a backdated rate change
  silently rewrites history. Rates need to be read as of the work date.
- **Approval with no authority check** — see below.

---

## 4. Found broken while auditing — fixed

Three defects in the live build. All three are in the money chain, so
writing them down and leaving them open was not an option.

**Anybody signed in could approve any timesheet.** `/api/timesheets/[id]/approve`
checked only that a session existed. No permission, no test that the
approver had anything to do with the contract. An approved timesheet is
the goods receipt — the invoice, the three-way match and the payment all
rest on it. Now: the buyer's side approves, with `timesheets.approve`; the
vendor may approve only where the buyer is not on Etyme, and it is
recorded as that; nobody approves their own hours. Rejecting was equally
open and is now the same check.

**Anybody signed in could submit anybody's timesheet.** Now: the person
whose hours they are, or their agency on their behalf — recorded as on
their behalf, because "who said these hours happened" is the first
question when a timesheet is disputed.

**The consultant's own screen showed the client's bill rate.**
`/api/me/work` returned `billRate` — what the vendor charges — labelled as
their rate, and the approval notification quoted the billed amount. That
is not their number, it hands them the markup regardless of what the
vendor decided about disclosure, and Addendum D makes that disclosure a
per-requirement choice for the vendor. Now: their pay rate from the
agreement that pays them, or a plain line saying it is not recorded here.

---

## 5. System requirements

Numbered for reference. Each carries the test that proves it, written as
the sentence it should read as in the test output.

### A — Time capture

**R1. A timesheet cannot skip a period.**
Submitting for a period after one that is still unsubmitted is refused,
and the refusal names the period owed.
*"a consultant cannot submit next week while last week is still open"*

**R2. A timesheet cannot be submitted before its period ends.**
*"a week cannot be submitted on Wednesday"*

**R3. The next period appears on its own.**
When a period is submitted, the following one is created from the
contract's own frequency and the company's holiday calendar.
*"submitting a week opens the next one"*

**R4. Days can be approved separately.**
An approver may accept some days and query others; accepted days bill,
queried days do not, and the timesheet reads as partly approved.
*"four accepted days bill while the fifth is queried"*

**R5. An approval carries down the chain.**
Where a sell contract is linked to a buy contract, approving on one side
creates the matching approved record on the other, once, idempotently.
*"hours entered once appear at every level of a subcontract"*

**R6. Hours are read at the rate in force on the day worked.**
A rate change dated after the work does not change what that work is
worth.
*"a rate rise in March does not re-price February"*

### B — Paying the consultant

**R7. A pay period is one row with one state.**
Not five records that must agree. States: due → calculated → approved →
paid → cleared.
*"a pay period has one state, and it is the same one everywhere"*

**R8. Advances are recorded and deducted.**
Money already given is visible on the period it is deducted from.
*"an advance in June is deducted from June, once"*

**R9. A balance carries forward.**
Any under- or overpayment lands on the next period rather than
disappearing.
*"forty dollars short in June is forty dollars owed in July"*

**R10. A consultant can see what they are owed and when.**
Amount, the hours behind it, the date it is due, and what is holding it up
if anything is.
*"a consultant can see why they have not been paid yet"*

**R11. Bank and tax details belong to the person and are encrypted.**
Held once, usable by any agency they authorise, never readable by one
because another holds it.
*"an agency cannot read the bank details a different agency collected"*

**R12. A payment to a person is a record, not an assumption.**
Date, amount, method, reference — the same shape as a payment from a
client.
*"a consultant paid in cash still has a payment record"*

**R13. Commissions are computed, capped and visible to whoever earned
them.**
Rate, frequency and cap per contract, with its own calculate and pay
dates.
*"a recruiter's commission stops at the cap"*

### C — Expenses

**R14. A consultant can submit an expense without a company permission.**
Today `/api/expenses` requires `invoices.read`, which no consultant holds.
*"a consultant can claim mileage"*

**R15. An expense knows who bears it.**
Billable to the client, borne by the agency, or an advance against pay —
and it flows to the invoice or the pay period accordingly.
*"a client-billable expense reaches the invoice and not the payslip"*

### D — Reviews and evidence

**R16. What happened is recorded when an engagement ends.**
Finished as agreed, extended, ended early, and by whose decision. Counted
rather than typed.
*"an engagement that ran to its end date says so without anybody writing a
review"*

**R17. A written review is attributed and answerable.**
Where somebody does write one, it names the company that wrote it, and the
consultant may reply once. No anonymous rating of a person.
*"a consultant can answer a review written about them"*

**R18. A rating never travels without its basis.**
Same rule as match scores: a bare number is a bug.
*"a rating carries how many engagements it rests on"*

### E — Documents and identity (blocking the above)

**R19. A resume is a document that belongs to the person.**
Multiple versions, one current, parsed to fill the profile, travelling
with a submission.
*"a submission carries the CV the client will read"*

**R20. Education, certifications and prior experience are records.**
So a new consultant's page is not empty, and so credential evaluation has
something to evaluate.

**R21. Identity fields needed by law are held once and encrypted.**
Date of birth, address, national identifier — collected for I-9, E-Verify
and payroll, never stored in the clear as 2017 did.

---

## 6. Suggested sequence

Ordered by what unblocks the most, not by size.

1. **R14, R15** — expenses a consultant can actually file. Small, and it
   closes the last hole in "what did this engagement cost".
2. **R4, R5** — day-level approval and the mirror down the chain. These are
   the two 2017 behaviours whose absence is felt weekly.
3. **R7–R10, R12** — the pay period, honestly. Then a consultant can see
   what they are owed, which is the question this whole system exists to
   answer for them.
4. **R19, R20, R21** — the document and identity layer. Larger, and needs a
   decision about encryption and retention before any of it is written.
5. **R11, R13** — bank details and commissions, once R21's encryption
   decision exists.
6. **R16–R18** — evidence from engagements. Last, because it is worth
   nothing until there are engagements that ended on Etyme to count.

R1, R2, R3 and R6 should be checked against the current implementation
before being built — some may already hold, and a test naming each is the
cheapest way to find out.
