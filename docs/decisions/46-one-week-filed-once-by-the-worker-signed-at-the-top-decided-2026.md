## One week, filed once by the worker, signed at the top — decided 2026-09-28

The founder, asked whether a supplier may file hours on a worker's
behalf and whether a new consultant is marketed by default:

> Yes to marketed by default, worker files their own week only or
> worker take the one approved at highest level can be attributed to
> another lower level contracts in another company. Worker knows the
> complete chain.

Three rules follow:

- **Only the worker files the week.** No supplier, prime or client desk
  enters hours for somebody else. `mayEnter`'s allowance for a vendor
  holding `timesheets.read` to file on the worker's behalf is withdrawn.
  CLAUDE.md station 6 already said this; the code did not.
- **One week, one filing, one signature at the top, attributed down.**
  In a chain the worker files once, and the week the client approves at
  the highest rung is the same week every lower rung bills and pays
  from, in every company below it. Nobody re-keys it per rung and no
  rung holds a second copy. That is what `lib/money` already does —
  each rung bills the same signed hours — and it is now the stated rule
  rather than an implementation detail. A week filed on a rung that is
  not the worker's own is refused (`rungsToFile` in
  `lib/consultant-portfolio`).
- **The worker knows the complete chain.** Their own page shows every
  firm between them and the client, by name. The NDA protecting a
  sub-vendor's name is about the *client* not learning it; the worker
  is employed through it and already knows. Rates of rungs the worker
  is not party to stay closed.

- **The signed week travels down the chain, and each rung accepts it
  in turn.** Asked whether the client's signature is enough for every
  supplier below to pay, the founder, the same day: *"Supplier still
  accepts it on its own, or gets forwarded the worker's approved
  timesheet to approve, and the flow continues."* So the client signs
  first; the signed week is then forwarded to the next rung down, which
  accepts what it pays; then to the rung below that, and so on to the
  worker's employer. No rung pays on a week it has not accepted, no rung
  accepts before the rung above it signed, and every rung accepts the
  same week — never a re-keyed copy. Each rung is told when the week
  reaches it.

- **A client may approve by email, and the proof travels down the
  chain. Decided by the founder, 2026-09-30** (on sharing a worker's
  hours with every layer and attaching evidence "in case client
  approval is required or evidence to bill… once email is approved",
  then: "select contracts to apply — once approved by top layer, lower
  layer can approve too"). Two ways a week is approved at the top
  without the client signing in: a one-time **"Approve by email"**
  link to the client's approver (Approve or Send back, no account,
  recorded as their signature with name, address and time); or
  **evidence attached** — the client's approval email, a PDF or an
  export from its own system — with the approver's name and address
  entered — **always a named person behind it**; evidence without the
  approver's name and address is refused. **Either the worker or the
  supplier's timesheet desk may attach it** (confirmed by the founder
  the same day). Whoever attaches it **selects which contracts in the chain
  it applies to**, all of them by default. Once the top layer's
  approval stands, each lower layer accepts the same week in turn, as
  before. A week approved by evidence says so ("Approved by email:
  Dana Whitfield, Oct 2 — evidence attached"), never that the client
  signed in Etyme; every rung it applies to sees the evidence, and no
  rung sees another rung's rate.
- **What each rung may bill, and when. Decided by the founder,
  2026-09-28** ("1 yes, 2 A, 3 block"):
  1. **A firm bills only the hours the firm above it accepted.** If
     Computer Systems accepts 38 of Helena's 40, Techpeple's bill to
     Computer Systems — generated in Etyme or uploaded — is for 38.
     Generation prices the payer's accepted hours, not the hours worked.
  2. **A firm bills upward on the client's signature**, without waiting
     for the rungs below it to accept. Its own invoice receipts from
     below clear the three-way check when those rungs have accepted; the
     bill upward is not held for them.
  3. **A week the paying firm has not accepted blocks the invoice
     receipt that includes it.** No "approve anyway with a reason" for
     it: accept the week first. Addendum E's WARN-and-proceed does not
     apply, because paying for hours nobody accepted is what the check
     exists to stop.
  4. **When fewer hours are accepted than were worked, the cut comes off
     overtime first, and off the later bill first.** Decided by the
     founder, 2026-09-29. An acceptance records a week's total, not
     which hours; this rule prices the cases that were left off the bill
     rather than guessed at — a week over the overtime line, a week
     crossing a bill's edge. A partial acceptance covering only some days
     is priced on the days it covers.

- **A pay change mid-contract. Decided by the founder, 2026-09-29:**
  *"Follow US law as recommendation, but allow for user input if they
  want to change."* Every hour is paid at the rate in force on the day
  it was worked. Overtime in a week paid at two rates uses the US
  regular rate — the week's straight-time pay divided by its hours
  (29 CFR §778.115) — as the default; a paying firm may choose another
  method for a line, and the choice is recorded with who made it and
  why. A raise dated in the past has its back pay worked out and put
  forward as a one-off payment for a desk to approve, never paid
  silently. The worker is told when a new rate is approved.
  Then, the same day (founder: "yes to all"): the firm's choice of
  overtime method is stored on the pay line with who chose it and why;
  a non-exempt US worker is owed overtime after 40 hours a week even
  where the contract sets no line, because the law sets it; and when an
  employer accepts fewer hours than were worked, the cut comes off the
  worker's **ordinary hours first**, so the worker keeps their overtime
  — the opposite of the billing rule, on purpose, because on the bill
  the firm is protecting its client and on pay it is protecting its
  worker.
  Two more, the same day. **An acceptance at or under the line is the
  hours worked:** where the employer accepts 40 hours or fewer of a
  longer week, those hours are paid at straight time (38 accepted pays
  38 at straight time); above the line the worker keeps their overtime
  as above. **Who owes what, and when:** once the client approves a
  week, the client owes it — to the firm it pays, on that firm's bill.
  Once the employer (or the vendor above the worker) accepts it, having
  checked the client's approval, the employer owes the worker, due on
  the worker's own payment terms. So the worker's page says "owed to
  you" only after the employer's acceptance, with the date it falls due;
  a week the client has signed and the employer has not yet accepted
  reads as waiting on the employer, never as owed.
  **Overtime on a cut week, and it is a setting. Decided by the founder,
  2026-09-30** ("go with your recommendations, but keep settings user
  configurable"). The default is **overtime only on the accepted hours
  above the line**: 41 of 45 accepted pays 40 + 1 at the premium, 42
  pays 40 + 2 — no jump at the line and exactly what the law requires.
  A paying firm may instead choose **"keep the week's overtime"** (the
  ordinary-first rule above: 41 pays 36 + 5) for a pay line, recorded
  with who chose it and why, the same way the overtime method is. At or
  under the line is straight time either way.

- **A week runs Sunday to Saturday, and the weekend can be filed.
  Decided by the founder, 2026-09-30** (with a US calendar as the
  picture): *"Weeks should run from Sunday to Saturday. Typically they
  are both holidays in the US, but they should be able to file hours
  for exchange of pay or hours."* So a timesheet week, the week the
  overtime line counts over, and a seeded week all start on Sunday and
  end on Saturday. Saturday and Sunday are days off by default — not
  expected, not counted as missing — but a worker may enter hours on
  either, and those hours are paid like any other (overtime past the
  line included). "Exchange of hours" is read as moving a day inside the
  same week (a Saturday worked in place of a Friday off), which needs
  nothing special. Banking weekend hours as time off *instead of* pay is
  not offered to a private employer's non-exempt worker by default,
  because US law does not allow comp time in place of overtime pay
  outside the public sector; if a client asks, it is a setting with the
  law said beside it, not a default.
  **And weekend work is normal, not an exception** (founder, the same
  day): *"In India too it's normal for people to work Saturdays to help
  a release."* So a Saturday or Sunday entry is never flagged, held or
  questioned for being on a weekend; it is checked like any other day
  (against the contract's hours and last day). Which days are off by
  default is the **site's calendar** — the tenant → entity → site rule
  above — so a US site defaults to Saturday and Sunday off and an
  Indian site can mark Saturday as a working day. Overtime follows the
  country: the US line is 40 hours in the Sunday-to-Saturday week; an
  Indian worker's overtime is set by state law (commonly past nine hours
  a day or forty-eight a week, at twice the ordinary rate) and is
  `etyme-regulatory`'s to confirm before any Indian pay line prices it.
  **Which days are off is a setting, not a rule** (founder, the same
  day): *"If a company is in Dubai they would have Friday off — this
  should be a configurable setting."* So the days off are a company
  setting now, defaulting to Saturday and Sunday, and move to the site
  when the legal-entity and site layer is built. A company may mark any
  days off — Friday alone, Friday and Saturday, or none. The week still
  starts on Sunday for everyone until a paying client needs another
  start; the days off decide what is expected and what a date shifts
  around, never what may be filed. Worth knowing, not deciding here:
  the UAE federal government moved to a Saturday–Sunday weekend in 2022
  and many private firms followed, so a Dubai company may say either,
  which is exactly why it is the company's to set.
  **When a Sunday-to-Saturday week is due** (founder, the same day: "your
  recommendation is default, but companies can choose to change their
  settings and take up to an additional week to approve"). By default
  a week's hours are due on the Monday after it ends and are approved by
  the Wednesday, so weekend work is in before anybody signs. A company
  may change both, and may give its approvers up to **one extra week**
  (approval by the following Wednesday at the latest), never more. A
  longer window is refused in a sentence, because every day an approval
  waits is a day the bill and the pay wait behind it. These are answers
  the setup asks for (see the onboarding decision), recorded with who
  set them and when.
  **Payroll is run by pay period, and biweekly is the common one**
  (founder, the same day: "many payroll calculations happen
  bi-weekly"). So a payroll run is always for one of the line's own pay
  periods — never "a month" laid over a weekly or biweekly line, which
  paid one week and called the month done. A biweekly period is two
  Sunday-to-Saturday weeks; overtime is still counted per week inside
  it, never averaged over the two. The default for a US employer is
  biweekly, the period ending on a Saturday and paid on the Friday
  after; monthly and semimonthly are choices the setup offers, and some
  states require pay at least twice a month, which the setup says
  beside the choice. A biweekly year has 26 pay days, and 27 in some
  years; a salaried line divided by pay days must say which.

- **The Sunday-to-Saturday week is built, 2026-10-06.** Until this day
  every line above was a decision and the code still said Monday:
  `weekStart` in `lib/overtime` returned the Monday, the worker's own
  page offered Monday-to-Sunday weeks, every seed wrote Monday-to-Friday
  sheets, and the hours packs asked for hours on Friday. Now one function
  decides the week for pay, billing, approvals, filing and the seeds
  (`weekStart`/`weekEnd`), and the packs ask for a week's hours on the
  Monday after its Saturday and the approval on the Wednesday. Two things
  learned on the way, written down so they are not re-derived:
  - **The weekly pack line is expressed as "Friday + 3", not "Saturday
    + 2" or "Monday".** Measured over 2,401 contract shapes: a Saturday
    period boundary drops the last week of every contract ending Sunday
    to Friday — the ordinary Monday-to-Friday placement — and a Monday
    boundary writes a date before a Monday-starting contract begins. The
    dates are the same Monday and Wednesday either way; only the reading
    differs, and the comment beside each line says so.
  - **Days off, hours-due day, approve-by day and the one extra week are
    company settings now** (`Company.daysOff` and friends, one door in
    `lib/days-off`, `PATCH /api/settings/week`). The setting is stored and
    refused in sentences; what does not yet read it is listed on matrix
    row L3.2.2.12 — cycle dates still shift around Saturday and Sunday
    until money passes the company's days into `shiftToWorkingDay`.
  **Three questions asked on the 6th and decided the same day** (founder:
  "go with your recommendations"), now built:
  - **A straddle rule judges a week by its hours.** Under START a week
    bills in the month of its first worked day; under END its last. An
    empty Sunday or Saturday never moves a week. SPLIT is unchanged.
  - **Weekly and biweekly pay periods start on a Sunday.** A biweekly
    period is two Sunday-to-Saturday weeks, the first counted from the
    Sunday on or before the contract start, so a midweek start has a
    short first period that still ends on a Saturday.
  - **The payroll export takes a sheet by overlap** and pays only the
    days inside the window. The IRS deposit date keeps Saturday and
    Sunday, because that is the bank's week, not the firm's.
  Still true: a stored overtime decision keyed to a Monday matches no
  week, so a live world seeded before the 6th must be dropped and
  reseeded.
- **Payroll is the company's choice. Decided by the founder,
  2026-10-07:** *"Give choice to businesses when they want to configure
  payroll."* This answers the Wednesday-or-Thursday question: neither is
  a rule. The recommendation is the default and a company changes it on
  its settings page: pay period (weekly, every other week, twice a
  month, monthly), the day pay is worked out and the day it is paid,
  recorded with who set it and when. Defaults: every other week, worked
  out the Wednesday and paid the Friday after the period's Saturday;
  monthly at month end (the 28th means month end), worked out on the
  25th. Pay
  can never go out before it is worked out. Beside the monthly choice
  the screen says, as a fact and not a rule, that some US states require
  pay at least twice a month; making that a rule per state is
  regulatory's. The setting is one door (`lib/payroll-settings`), and
  the cycle generator reads it over the pack's salary lines.
- **Setup asks five things, then stops. Decided by the founder,
  2026-10-07** ("Ok go", on the finding that production had no sign-in
  door and setup asked one question). After the first sign-in a new
  company walks the five steps the prototype drew: sign in; your company
  (country, currency, type, name); how you work (the week and payroll
  panels, defaults pre-filled, the state note beside twice a month);
  your people (import a file, or skip); your team (invite, or skip).
  Every answer has a default, so a company may click through in a
  minute; what it answers is recorded with who and when. A colleague who
  signs in on a claimed domain gets a seat with a default role at once,
  and the owner is told who joined and what to give them. "Add company"
  and first sign-in create a company through one function, so both get
  the same pack, roles, location and holidays. Turning sign-in on is the
  founder's: the Microsoft and Google app keys and the email server go
  into Vercel; `/ready` says so until they do.
- **A password door, until the single sign-on keys exist. Decided by
  the founder, 2026-10-08:** *"Focus on sign up with email, password,
  subdomain for company and email and password for candidate — good
  where companies don't want to integrate with Microsoft and Google
  directly."* So two sign-up forms: a company signs up with a work
  email, a password and an **Etyme address** (`acme`), and a candidate
  with an email and a password. The address is the tenant for a company
  that has not verified a domain; it may verify its email domain later,
  and until then colleagues come in by invitation or by signing up with
  the same address and being seated as Member. A verified email comes
  before anything else; passwords are hashed with a slow hash, never
  logged, reset by a one-time link, and failures slow the door down. The
  Microsoft and Google doors stay and win when their keys arrive: a
  company that signs in that way with a domain matching an address's
  verified domain joins that tenant. `/ready` counts a password sign-in
  as a real sign-in once a real person has used it.
- **Months served are whole months, never rounded up. Decided by the
  founder, 2026-09-29.** Rounding to the nearest month read 533 days as
  18 months, so three screens said "past the limit" two weeks before the
  block fired. A person has served n months once their days on site
  reach the fewest days any n consecutive calendar months can hold (28,
  181 for six, 365 for twelve). The block itself still counts days
  against the limit and is unchanged.
- **A contract's last day is a day on site, and the break starts the
  day after it. Decided 2026-10-08**, found by round six of the sign-up
  walk: `lib/tenure-days` did not count a contract's end date, so Kwame
  Mensah read 740 days where his dates span 741, and each contract moved
  the time-limit date one day later. Now the start and end day are both
  counted, a day on two lines is still counted once (a handover day
  included), and a 90-day break is 90 days off site, counted from the day
  after the last day. Both moves are in the client's safer direction: the
  limit is reached one day earlier per contract, and "may come back"
  falls one day later (Kwame: Nov 18, not Nov 17; Lucía reaches eighteen
  months Feb 6, 2027, not Feb 7). Made by the coordinator on the
  founder's behalf as the safer reading; **the founder may reverse the
  break's start in one line** if the trade counts the break from the
  last day itself.

And: **a consultant a firm adds is marketed by default**; the firm may
choose to retain them, and nothing reaches past the firm until the
consultant grants it.
