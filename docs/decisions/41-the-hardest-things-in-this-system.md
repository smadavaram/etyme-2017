## The hardest things in this system

Named so you approach them with care, not speed.

1. **Cycle generation.** Nineteen kinds, five frequencies, business-day shifting
   against a per-company holiday calendar, month ends, February, and idempotency on
   extension.

   **This paragraph used to say the 2017 implementation "is correct and was earned
   over years", and that was false.** It was read against the Rails source on
   2026-09-16, before the tree was deleted, and the engine it told you to port is
   substantially a stub: `Contracts::Cycle#get_next_date` — the function every
   timesheet, invoice and salary date derives from — has its body commented out
   under a live TODO and returns `last_date + 1.day`. `group_by_biweekly` is a
   copy of `group_by_weekly`, so legacy "biweekly" generated weekly periods. Nine
   of the nineteen kinds were commented out; nineteen was a string constant, not
   nineteen generators. `twice_a_month_submit_date` could raise, which is why
   `Contract.set_cycle` wrapped every contract in a bare rescue — contracts
   silently got no cycles at all.

   The claim survived because nobody read the file, and it steered the rebuild for
   months. **`lib/cycle-generator` is now the reference implementation.** It is
   shorter, tested, and correct on more cases than the original ever was. Nothing
   remains to port.

   What is genuinely still open is listed under "The cycle engine, honestly" below.
   **Write the tests first** still holds, and money arithmetic still gets asked
   about rather than guessed.

2. **Field-level permissions.** Cannot be retrofitted. Every read path filters by
   context from the first commit, or you audit every query later.

3. **Cross-vendor identity resolution.** Required for tenure aggregation. Deterministic
   matching on consented identifiers only; probabilistic matches surfaced for human
   confirmation, never silently merged.

### The cycle engine, honestly

Found by reading the Rails source against `lib/cycle-generator` on 2026-09-16.
Written down here because the tree that would have shown them is gone, and
because two of them are money.

1. **Extending a placement writes no cycles.** `api/contracts/[id]/extend`
   moves `endDate` and logs it; its own comment claims it writes the billing
   and pay cycles behind it and it does not. Three months added to a placement
   have no hours-due, invoice or pay rows. It also moves only the sell leg —
   the `BuyContract` end date is left behind. Generate over `[oldEnd, newEnd]`
   only and pass the existing `dueOn` set per kind into `generateCycles`'s
   `existingDates`, which exists and no production caller passes.
2. **No final partial period.** A contract ending on a Wednesday has no hours
   cycle and no invoice cycle for its last two days; generation stops at the
   last whole boundary. The Rails version emitted the short trailing group.
   **Decided by the founder, 2026-11-09** ("yes to both pay-date
   recommendations"): the last regular period runs through the contract's
   end date, so the final short stretch has its hours-due, invoice and pay
   dates; it is not a stranded short cycle, because an extension moves the
   end and the last period with it. Needs `Cycle.periodStart`/`periodEnd`
   (architect) before money builds it.
3. **Business days only shift forward.** US payroll pays a Saturday pay day on
   the Friday before; this moves it to the Monday after, which pays after the
   work. The direction is a money decision, per kind rather than globally —
   pay backward, bill forward. **Decided by the founder, 2026-11-09, in
   three steps the same day.** First "yes" to pay before, bill after
   (built in fabf99073, not deployed). Then *"Billing date is always a
   working date earlier to weekend if it comes in weekend."* Then, the
   rule that stands: *"If Saturday - move the pay date and bill date to
   the day before vacation. If Sunday - move the pay date and bill date to
   day after weekend/holiday. In any case make this as a config settings
   for owner/admin."* So pay dates and bill dates move to the **nearest
   working day**. A Saturday goes back to the Friday, or the Thursday when
   the Friday is a holiday. A Sunday goes forward to the Monday, or the
   Tuesday when the Monday is a holiday. Hours dates still move to the
   working day after. It is a company setting the Owner or Admin changes,
   recorded with who and when. Three coordinator's calls, each reversible
   by the founder in a sentence:
   - **A tie that is not a Saturday or a Sunday moves back.** A weekday
     holiday is a tie (a Wednesday holiday moves to the Tuesday). A
     Monday-holiday date is nearest to the Tuesday and moves there.
   - **On a Friday and Saturday weekend, the first day goes back and the
     last day goes forward.** A Dubai Friday moves to Thursday, a
     Saturday to Sunday.
   - **Every company already on Etyme moves onto the rule.** Each row
     holds the old default, and nothing records that anybody chose it.
   Before money builds it, a read-only check measures every pack under
   the rule. It looks for pay landing before it is worked out, India's
   7th-of-the-month wage deadline, bills landing before their last week
   is approved, and hours that could go unbilled. Regulatory reads each
   US state's rule on a payday that falls on a non-workday, and the
   screen says a state's rule beside the choice where it differs.
4. **No salary lag.** A contract's payment term is not mapped into `offsetDays`,
   so pay day is the period end itself.
5. **Nothing marks pay cleared.** Legacy ran calculate → process → clear. If AP
   needs a settlement date it is a cycle kind, not a status.
6. **DAILY frequency was dropped** with no note. Per-diem work exists. If it was
   deliberate, say so beside the `ON_COMPLETION` comment.
7. **`Cycle` stores no period bounds**, so `cycle-complete` reconstructs which
   period a cycle covers heuristically. It holds for the packs shipped and is
   guesswork the legacy row did not need. `periodStart`/`periodEnd` is a schema
   request for the architect.
   Until they exist, `cycle-complete` reads which date a week's event closes
   from the line's whole series, generated again with no floor through
   `planCyclesFor`, and falls back to the old estimate from the usual gap only
   where that series no longer contains the written date (a weekend rule or
   calendar changed since the award). It still cannot say which of several
   weeks sharing one invoice date is the last, so the first week billed closes
   it, and each later week then closes the next open date; that is for the
   founder to decide.
8. **Holiday shifting is timezone-fragile.** `shiftToBusinessDay` builds dates in
   local time and looks holidays up by UTC key. Under `TZ=Asia/Kolkata` a holiday
   does not shift at all. Correct under UTC and US zones, so Vercel is fine
   today and a second region would not be.
9. **And a second, separate timezone fault in the same file changes a
   count.** Found 2026-09-22 by `etyme-money`, measuring rather than
   reading. `dayInMonth` builds `new Date(year, month, day)` in **local**
   time and compares it against **UTC**-midnight `start`/`end` bounds, so
   a boundary date falls outside the range. Under
   `TZ=America/New_York` a twelve-month monthly billing series generates
   **eleven dates instead of twelve** — a month of revenue with no
   invoice date. This is not item 8: no holidays were passed in any of
   those runs. Vercel is UTC so nothing is wrong today, and moving a
   range boundary in the generator moves cycle dates for every contract,
   which is why it is written down here rather than slipped into an
   unrelated commit. It is `etyme-money`'s next piece of work.

### The monthly packs anchor an approval to a calendar day, not to the hours

Measured 2026-09-22 by `etyme-money` over every start day of the month,
after regulatory fixed the weekly and semimonthly cases. Recorded because
one of the three needs the founder and two do not, and because the first
version of this note — written from a relayed claim rather than from the
source — was wrong in a way worth remembering.

**The claim that was wrong:** that `IN_DELIVERY` approves a month's
hours twenty-seven days before they are submitted. It does not.
`MEANS_MONTH_END = 28` in `lib/cycle-generator`, so `dayOfMonth: 28`
means month-end, the submission lands on the 30th or 31st, and the
approval on the 1st is nought to three days *after* the hours. A relayed
number that nobody re-derived is how the old "the 2017 cycle engine is
correct" claim survived for months.

**What is genuinely wrong, and it is narrow.** A monthly
`TIMESHEET_APPROVE` on `dayOfMonth: 1` is anchored to a calendar day of
its own rather than to the hours it approves, so on **one start day in
twenty-eight — a contract starting on the 1st** — the first approval
precedes the first submission and the last month's hours have no
approval date at all. That is the natural start date for a monthly
India or UK engagement. The repair is `offsetDays` off month-end, not a
different `dayOfMonth`; the same argument as the weekly case.

**Monthly invoicing on the 1st is the same shape and needs no
decision.** UK `INVOICE_GENERATE`, UK `VENDOR_BILL_GENERATE` and
`IN_DELIVERY`'s `INVOICE_GENERATE` all bill on `dayOfMonth: 1`, which
leaves one month of work per contract with no invoice date and a first
date that bills nothing. Unlike the semimonthly case this is a coherent
intent — "bill on the 1st for last month" — so the repair preserves it:
`dayOfMonth: 28, offsetDays: 1`, every date staying on the 1st, the
spurious head gone and the tail appearing. Worse on the vendor side,
because `VENDOR_BILL_GENERATE` is a PAY kind and shifts **backward** off
a weekend: six of twenty-four dates fell into the previous month, a
supplier invoice recorded 30 January for a February that has not begun.

### India: the law constrains the pay date, and the packs have no pay date

The founder asked, on the 25th-of-the-month salary calculation in the
India pack: *"I don't know — can you research and make sure we meet
compliance there."* Researched 2026-09-26. Three findings, and the third
is the one that matters.

**1. Calculating on the 25th is lawful, and the question was the wrong
one.** Nothing in Indian law says when payroll may be *computed*. The
**Code on Wages, 2019** — in force nationwide since **21 November 2025**
by notification S.O. 5322(E), which repealed the Payment of Wages Act
1936 and three other Acts — constrains when wages must be **paid**: for a
monthly wage period, before the expiry of the **7th day of the following
month** in an establishment with fewer than 1,000 employees, and the
**10th** at 1,000 or more. So the 25th stands, and the reason is written
down here so the next agent does not "fix" it.

**2. The Code widened who is covered, which is why this is not academic.**
The 1936 Act protected only employees under a wage ceiling. The Code on
Wages extends timely payment and authorized deductions to **all**
employees whatever they earn — so every contractor on an Indian payroll
is inside it now, including the senior ones who were outside before.

**3. What the packs actually lack is every statutory date after the
calculation.** `SALARY_CALCULATE` on the 25th is the only date in the
India pack. There is no pay date, and there are no deposit dates, and
four separate deadlines with four separate penalties hang off the month:

| What | Due | If late |
|---|---|---|
| **Wages paid** | 7th of the following month (10th at 1,000+ employees) | a claim under the Code, with compensation |
| **TDS on salary** | 7th of the following month; **30 April** for March | 1.5% per month |
| **EPF** | 15th of the following month | 12% a year plus 1% a month damages — and PF deducted and not deposited is a **criminal** offence |
| **ESI** | 15th of the following month | interest and damages |
| **Professional tax** | 15th of the following month, and it varies by state | state penalties |

Each goes to a different authority, so one late run triggers several
penalties at once. This is the shape CLAUDE.md already argues for
elsewhere — a settlement date is a cycle kind, not a status (item 5 in
the honest list) — and it is `etyme-regulatory`'s next piece after the
monthly dates land, with the arithmetic `etyme-money`'s.

**4. And the 25th has a real hole that is not about the law.** A fixed
salary can be computed before the month ends because nothing about it
depends on the month. **Hourly work cannot.** `IN_DELIVERY` carries a
monthly timesheet, so it is a pack for work paid by the hour, and eight
of its twelve salary-calculate dates fall before that month's hours are
filed. For a salaried employee that is normal Indian practice; for a
contractor paid by the hour it is a number computed from days not yet
worked. The answer is not a different date for everybody — it is that
the calculation follows the **pay model**: the 25th where pay is fixed,
the hours where pay is hourly. Nobody has built that, and it is the
question to put to the first client who actually runs an Indian payroll.

### Where the 2017 Rails tree went

Deleted from the working tree on 2026-09-16 after its business rules were
extracted to `LEGACY_RULES.md` and the cycle engine was read against the
rebuild.

It is not lost, but it lives in exactly one place: the history of
**`github.com/smadavaram/etyme-2017`**, where the last commit carrying all
876 Ruby files is **`763c6f57`**. It has never existed in `etyme2040`,
whose history was built by replaying app-only commits. So:

```
git show 763c6f57:legacy-app/models/contract_cycle.rb
git checkout 763c6f57 -- legacy-app/
```

**`etyme-2017` is therefore archived, never deleted.** Whatever else moves,
that repository is the only copy of four thousand commits of how this
business actually worked, and no other copy is coming.

An annotated tag would be friendlier and this repository's token is refused
on any tag ref with a 403, so the commit is written down instead.
