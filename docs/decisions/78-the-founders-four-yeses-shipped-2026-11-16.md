## The founder's four yeses shipped: an early end's real last day, her rate range, no account hint, and paid added days — 2026-11-16

**What he said.** "Go ahead with your recommendations" (2026-11-16), on four
questions left open by the five layers of the fix list (records 73 to 77):
1. When a placement is ended early, record the real last day. He approved
   the tenure arithmetic that follows from it.
2. Her yes page shows the rate range the firm saved. Only she is told when
   it is below her lowest rate.
3. Close the hint that an invited address already has an account.
4. The Layer 5 defaults stand: a person placed anywhere is off our bench,
   and people who were asked and have not answered are listed last.

**What went out.**
- *An early end.* A placement ended early takes the day it is ended as its
  last day on site, in the site's time zone. That day is never after the
  planned end and never before the start. The planned end is kept in the
  log. The pay line, the link window and the open cycles end there. The
  end is refused in a sentence naming the week where a later week is
  already billed, paid or filed, or has only a weekly total. Her row and
  the line's end are kept on a pay line that another open placement of
  hers still pays through.
- *An extension pays the added days.* Extending a placement moves the
  pay window and her row on the pay line to the new end in the same save.
  It never widens a pay period already processed. A window is moved only
  where no other window claims the same days. Where no single pay line is
  in force, nothing on the pay side moves, and the person who extended
  reads why. A save that finds the window changed under it is undone
  whole and says so.
- *A held week and Repair.* A W-2 week worked after the pay window ended,
  on a placement extended before this rule, is held on Payroll. The hold
  names the person and the week and says what to do, and the week is
  never paid or dropped in silence. A seat that runs payroll presses
  Repair the pay window on the row. Every press and every refusal is in
  the access log. Repair is refused where a pay run already paid those
  days, or paid the line as a total without its days.
- *Her rate range.* Her yes page and her My benches page show the range
  each firm saved, in that firm's currency. Where the top of the range is
  under the lowest rate on her record, she alone, signed in, is told in
  one sentence. Nothing the firm reads moves with her floor.
- *No account hint.* A seat invited at an address that signs in at
  another firm reads "Invited" until she opens the seat here. "Signed in"
  is read from this firm's own access log, never from her account
  elsewhere. That reading covers every row, figure and button, the menu,
  Teams, the nightly watch and the caller check. An invitation is marked
  accepted only when its seat is opened, never by a sign-in at another
  firm.
- *A firm's sign-in link* never sets a password on an account anybody has
  used, by any door. Such a person goes to sign in as usual. The link
  works once, and every press is logged with no link in the row. A
  password set from any one-time link tells the person, by email where it
  can leave and in her Ask Etyme always, naming the firm the link was for.

**How it was checked.**
- Two readers who built none of it tried to refute it. They found:
  - an invitation marked accepted by a sign-in at another firm, which
    leaked the account it was meant to hide;
  - a repair route that logged no refusal;
  - an extension that could record a window as moved when it was not;
  - an early end that could stop pay on a second placement.
  All four were fixed before the deploy.
- The release check on d7c917d05 was green: type check, 17,186 unit
  tests, 3,583 integration tests and the build.
- A walk in a browser on the build before (30f2c4d87) said it does not
  ship, on two faults:
  - Signing in on a new device opened the newest seat, which could be
    another firm's invitation. That marked it accepted and leaked the
    account again. Now the seat she already uses opens. An invitation is
    accepted only when she chooses it, or when it is the only seat she
    has.
  - The Owners picker offered somebody invited and never signed in. Now
    the picker and the route refuse her in a sentence.
  It also found smaller faults, each fixed:
  - the password notice showed only its title, with a link to nowhere;
  - the Repair sentence vanished;
  - "Check which pay line" had no link;
  - Complete was drawn for a seat whose press is refused.
  A second walk on d7c917d05 said it ships.

**The deploy.** Source d7c917d05 was replayed as deploy commit e5867b13
on 2026-11-16, with no database change. The smoke check passed:
- production served e5867b13, and its health page read the database as
  ready;
- every public page and `/site/tapin` answered 200;
- the inbound email door answered 404.
The same deploy carried the vendored skill files of record 83 into the
product repository.

**Open, for the founder.**
- A person invited here who has an account elsewhere is shown by the name
  on her own record. The recommendation: no Rename until she opens the
  seat here, and show the name the firm typed. That needs a new column.
- Ending a placement that has not started yet: should it be a cancel
  instead?
- Placements ended early before today keep their planned end. Should they
  be backfilled from the log?
- Placements extended before today: a read-only query lists them, and
  Repair is on Payroll for each held week.
- A week the repair refuses has no next step after the firm reconciles
  with its payroll provider.
- A seat with "No role yet" counts as having come in when it is opened.
- Completing one placement still sets a shared pay line's state to ended.

**Lessons, so they are not paid for twice.**
- "Signed in" is a fact about one firm. A sign-in writes nothing about a
  seat it did not open.
- A count mismatch inside a save throws, so the whole save is undone. A
  plain return commits what had already moved.
- A sentence reworded in one file is searched for in the integration
  tests and the source pins too.
- A default is a choice made for her. Where the default opens a door
  that tells another firm something, it opens only a door she has used.
- A sentence a screen shows after a save outlives the row it came from.
