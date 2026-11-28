## Layer 5 of the fix list shipped: the bench — 2026-11-16

**What it is.** The last of five layers of the fix list of 2026-11-14
(record 72): area F, the bench, with the smaller bench faults the readers
and walkers of layers 3 and 4 found. It went out as its own deploy, with
no database change. With it, every item on the fix list has shipped.

**What went out.**
- *F1.* Add to bench, finding nobody, says so and links to Add
  consultant, which adds the person and asks her. It never makes a
  person itself.
- *F2.* The dialog says "Asked, not answered yet" for somebody asked,
  and "Already on your bench" only after her yes. Where the Who sees them
  box is hidden, one line says why. Its button is never greyed without
  words.
- *F3.* The invented "$78" on Bench check-ins is gone. Each check-in row
  is named by what it was ("bench invitation", "sent again", "asked to
  renew"), never "reply" for what the firm sent, and a try that did not
  go says why on the row. Today shows "N asked, not answered yet".
- *One count of the bench.* Today, Candidates and Bench agree. A person
  placed today through any firm's line is off this firm's bench; nothing
  of the other firm's deal is read beyond that. An ended line reads the
  same on every page.
- *Before her yes, a firm reads only what it typed*, now also on:
  - Add to bench, which refuses a person the firm does not know (as an
    id that does not exist, logged first) and never writes or says her
    own name;
  - her lowest rate, which no answer reveals, however many rates a firm
    tries;
  - the drawer's tier ("Not shown until they say yes");
  - the order of the Candidates list (asked rows last, newest first);
  - Bench check-ins, the sample-person line, and a "no" she says;
  - the sign-in line, which no longer tells a firm whether an address
    has an account.
- Bench buttons are drawn only for a seat its route will take; others are
  told who may. Rate boxes name the firm's currency. A sample person is
  offered nothing to send. Imports keep the name the sheet typed. Whose
  record it is counts every listing ever. The scorecard says "First
  resume", and a client with suppliers never reads "No suppliers yet."
- The password page tells a firm's own test person on a reserved address
  that no email can reach it, never that it is the Etyme demo.

**Choices the coordinator made, for the founder to overrule.**
- A person placed today through any firm counts as off this firm's bench.
- Asked, unanswered rows are listed last on Candidates, newest first,
  rather than by her own name.
- Before her yes her lowest rate is not checked at all, so nothing can
  reveal it.

**How it was checked.**
- One read-only reader before building, and one who built none of it
  after, which found the rate-floor probe and a placement line that could
  be untrue. Both fixed.
- Two full release checks, both green; the second, on the commit
  deployed: 17,034 unit tests, 3,495 integration tests, the build.
- One walker pressed twelve items in a browser. Nine passed. It stopped
  on three: her own name on Bench check-ins and the sample line before
  her yes; "No suppliers yet." beside 25 suppliers; a greyed button. All
  fixed, with two more leaks of the same kind the builders found. The
  coordinator pressed the three on the built app.

**The deploy.** Pushed 00:45 UTC, serving 00:50 UTC: deploy commit
082c79fa (source a82ee2ca3), on top of 07c99196. 17 commits, no schema
line. Health: database ready. Every public page, sign-in, sign-up and
`/site/tapin` answered 200. The inbound email door answered 404.

**Worth knowing.** Bench profit for a person whose placement ends today
now counts that day as a day on site, so it stops accruing a day later
than before.

**Open, for the founder.**
- A placement ended early keeps its planned end date, so the person
  reads free only after it. Recording the real last day changes tenure
  counting; it waits for his yes.
- A range a firm saves before her yes is not checked against her floor,
  and her yes page does not show it. Should it?
- A firm that invites an address to a seat (not to the bench) can still
  tell from her row whether the address already signs in. Close it?

**Left for the retest batch.** The check-in letter's rate is written
with a dollar sign. A rate change says "already on your bench" before
her yes. Sign-up asks the whole form before refusing an address no email
reaches. A withdrawn ask reads her record. The smaller words from the
layer 4 walk.

**Lessons, so they are not paid for twice.**
- "Before her yes" is checked on every page that names her, and a
  refusal is a reader too: a sentence that moves with her data leaks it.
- A missing line is a signal; before her yes every person reads the same.
- An empty state is checked against the same page's own figures.
