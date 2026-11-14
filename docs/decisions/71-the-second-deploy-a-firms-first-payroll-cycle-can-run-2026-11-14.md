## The second deploy: a firm's first payroll cycle can run — 2026-11-14

**Why.** The founder, 2026-11-14: "plan is to add invites to candidates
and they will self onboard", then contracts on the fewest papers, "with
focus on running the payrolls in [the next] cycle", and "W2 first,
outside payroll provider, biweekly" (record 68). This deploy is that
path, walked and fixed. Nothing else was started.

**What went out.** Production serves deploy commit ccc1da3e (source
09d77f102), on top of 8e6ee322. Forty-two commits. In it:
- *People.* "Invite candidates" on Candidates: several addresses in one
  press, each answered on its own line, nobody seated before her yes, an
  unanswered invitation resent from its row.
- *Papers.* An I-9 reads "I-9" and claims no check nobody recorded. A
  client's own default papers read "Asked of the client, not checked at
  the start". Compliance names who activates by the roles the firm has
  seated.
- *The pay period.* The Owner or an Admin sets the Sunday the pay periods
  are counted from (`Company.payFirstPeriodStart`, the one new column).
  Payroll lists the company's own periods, each with its pay day. A
  change of that Sunday is on the activity log with the old and new day.
- *The week.* A week over forty hours at a client not on Etyme is
  approved by its attached approval, with the client's reason and its
  overtime answer in boxes on the form.
- *The pay run.* A W-2 week over forty hours, for a person nobody has
  said is exempt, is held off the run, the total and the pay file until
  the Payroll row records the answer; it is then paid once with any
  overtime. A period whose new week nobody worked out goes back to
  Calculate. A period part paid says what was paid and what is still to
  pay. One pay file per period, or per month for a firm that pays by the
  month, always with what was paid already taken off. The older export
  gives no file.
- *Her own page.* She reads her pay day by her employer's own pay
  periods, the day Payroll names. A week Payroll is holding reads "On
  hold", with who holds it and why, no amount and no pay day, in no
  total.
- *The books.* Every dollar a run pays has its wage posting, an overtime
  premium recorded later included.
- *Public pages.* A firm's page counts only work that started, counts
  skills only of people who said yes to being shown, and no longer says
  it trains anybody. About no longer says Etyme runs no bench (record
  69).

**The release checks.** Each full run on a quiet copy.
- 7b8883001: green.
- 2e0417046: one unit red. The pay file's held-week note formatted its
  own date. Fixed in b23233a09, same words; that run was fully green
  (16,193 unit, 3,187 integration, build).
- 0cfc134cb: type check clean, 3,211 of 3,211 integration, build green,
  one unit red: the delivery matrix page had not been regenerated after
  a line was added to the matrix. Regenerated in 09d77f102, one
  generated file; the whole unit suite then passed, 16,256 of 16,256.
  09d77f102 is the version deployed.

**Who checked the pay, and how.** Three readers who built none of it
worked every figure by hand through the routes, then two presses in a
browser.
- *First reader, on the dates* (earlier the same day): the periods and
  pay days for three first Sundays, a holiday moving a Friday pay day to
  Thursday.
- *Second reader:* every overtime figure at $96 and $45 for 40, 46 and
  60 hours matched. It found the worker's page reading January 8 where
  Payroll read December 24, and a month file that listed a paid week
  again.
- *Third reader:* no hour paid twice or never. It found the month
  file's "Pay day" cell copying the next open pay day from today.
- *First press, two walkers:* the Payroll side right on every figure.
  Stopped by her own page pricing a held week at the usual rate on the
  wrong day; a month file naming a pay day that pays the month before;
  a public page counting drafts as placements.
- *Second press, one walker:* all eight items passed on screens. The
  walker still wrote "does not ship", because the delivery matrix did
  not list the day's new files and tests. The coordinator shipped it and
  told the founder; the architect added the lines in 18dd1b250, which
  rides the next deploy.

**What the checks found, by class.**
- *Pay at the usual rate by silence.* A W-2 week over forty hours was
  paid with nobody asked whether overtime was owed.
- *An hour payable twice.* A second pay file for a month listed a week
  already paid. A late week could be paid without a new Calculate.
- *Two screens, two answers.* Her page and Payroll named different pay
  days, three ways: the line's monthly rhythm, a late approval, and a
  held week priced as owed. Her page now reads Payroll's own rule for
  each.
- *The books behind the run.* A premium was paid with no wage posting,
  so the year's W-2 figure showed a gap of the premium.
- *A date from another period.* A pay day was placed by the gap between
  dates, not by the period its own row names.
- *A public figure nobody could check.* Drafts counted as placements.
- *A sentence that is not true.* "This applies from the next contract",
  "gets no due dates", "Added 2 public holidays" with no day named.

**The deploy.** Pushed 22:26 UTC, serving 22:31 UTC. Health: database
ready, email set up and sending. Every public page, sign-in, sign-up and
`/site/tapin` answered 200, so the build added the one new column. The
inbound email door answered 404.

**Decided on the way, to be confirmed.**
- A week approved after its period's pay day reads on her page "fell
  due on your pay day of Oct 30 and has not been paid", the day Payroll
  names. It read the next pay day after the approval. Regulatory is to
  confirm it.
- "Record a placement" for a W-2 person is refused, naming the Owner's
  step, once a firm has saved every week or every other week and has not
  set its Sunday.

**Open after this deploy.**
- *For the founder.* Which Sunday the first pay period starts on.
  Whether pay days already written on a placement move when a holiday is
  added later; today they keep theirs, so holidays go in before
  placements are recorded. Whether a firm's public page may print the
  Owner's name from "The people in charge". Whether a W-2 week over
  forty hours worked outside the US is held until the per-country
  setting exists (record 70); today it is paid at the usual rate, with a
  sentence saying why.
- *Small, and waiting for his word.* The 90-day forecast leaves out a
  W-2 line with no end date. The Payroll table download has no "Still
  to pay" column. Calculate and Process change the row with no
  confirming sentence. Ask Etyme does not say a held week is held. A
  held week is posted at the usual rate until the answer is recorded.
- *Not started.* The overtime settings (record 70), the one-step
  timesheet, the coding block (record 64), the party pages (record 63).

**Lessons, so they are not paid for twice.**
- A hold put on the pay run is put on every screen that prices the same
  week, in the same commit. Her page was missed and showed a figure
  Payroll was refusing to pay.
- A pay day is read from the period its own row names, never worked out
  from the spacing of dates.
- A file handed to an outside payer carries what is still to pay and
  what was paid already, from the same rows the screen shows.
- A builder who may not write the matrix hands the lines over in the
  same wave, and the coordinator checks the matrix before the last
  press, not after it.
- A generated page is regenerated by whoever changes its source. The
  release check found two such misses in one evening.
- A reader working figures by hand through the routes costs less than
  a press on screens and found most of the pay faults. A press found
  what only a screen shows: her page.
