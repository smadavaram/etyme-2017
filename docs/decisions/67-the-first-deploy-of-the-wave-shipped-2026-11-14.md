## The first deploy of the wave shipped — 2026-11-14

**What went out.** Production serves deploy commit 8e6ee322 (source
ed21b1197), on top of 2c314683. In it: the founder's twenty-two first-day
faults (record 66); the Owner rules and proof (records 22, 54); the
neutral Company (record 60) and the rule that a firm is never tied from
one side (record 61); the sign-in and sign-up pages to his drawing
(record 58); the home page to his reference page, on one sample company
at a real buyer's scale (records 59, 62); a client's codes read only by
the client (record 64); and what the walks found, below.

**The release checks.** Four full runs, each on a quiet copy.
- 216a43b8a: one integration red. The sample company's seed wrote due
  dates on a placement that had ended. Fixed in a943d79a3.
- ff86307d0: one integration red, a timing race inside a test. Fixed in
  1a3228d15.
- b194f08ef: one unit red, a stale count in the security document. Fixed
  in 5c597a3d0.
- ed21b1197, the version deployed: type check clean, 15,864 of 15,864
  unit, 3,051 of 3,051 integration, build green.

**The walks on screens.** Seven walkers on the first build; a usage limit
cut three of them off. Four on the second build. One re-press of
thirteen items on the third, eleven passing. The last two items pressed
on the deployed build: nobody sees either old fault. The reader still
wrote "does not ship" because a menu ends 6.5 pixels above the window's
edge and the builder's own target was 8. The coordinator shipped it and
told the founder. The one-word fix waits for the next deploy.

**What the walks found, by class.**
- *The screen cannot reach the rule.* The contractor's page never said
  she could attach the timesheet her client approved, and its link opened
  the wrong tab. The sentence telling her to ask her firm to add the
  approver was written and never wired. A second screen that records an
  agreement's signature was missed when the first was fixed. An Owner ask
  on Today had no Yes or No. Settings' tabs ran off the screen. People on
  no team were drawn dark on dark. A box's menu fell below the window.
- *A sentence that is not true.* Six screens said an email was sent, or
  would be, where none can leave: the staff screen, pausing somebody, the
  two Owner forms, sign-up, and "Link sent" on a week. Setting a
  company's Kind said "is a supplier now".
- *A leak.* Withdrawing an invitation counted the person's records at
  another company. An approval link was handed back in a reply. A
  client's Owner could open the profit page by typing its address.
- *Money.* The people import rounded a typed rate to whole dollars, then
  stored dollars in a column that holds cents: $52.50 an hour was kept as
  53 cents. Right now for a firm that bills in US dollars; other
  currencies are the next deploy's work, and rows imported earlier are to
  be reported before any is corrected.

**The deploy.** Pushed 08:31 UTC, serving 08:38 UTC. Health: database
ready, email set up and sending. Every public page, sign-in, sign-up and
`/site/tapin` answered 200, so the build updated the database. The
inbound email door answered 404.

**Lessons, so they are not paid for twice.**
- Two screens that call one route are fixed together. A test now finds
  every screen that calls the signing route.
- A fixed element inside a container that spaces its children takes that
  space too.
- A test that reads "everything since this instant" races with a notice
  written without waiting.
- A count written in a document goes stale each time a route gains a
  log. Read it before the release check, not after.
- Seven walkers and four critics at once used a five-hour allowance in
  two hours, and the allowance is the founder's too. Four agents at once
  is the pace.
- A walker's pass mark is what a person would see, not a number of
  pixels.
- The host answers 403 to a burst of requests from one address. The
  smoke pauses between pages, and a 403 marked as the host's own is
  asked again before it is read as a fault.

**Open after this deploy.**
- For the founder: may one payroll person attach the client's approval
  and accept the same week; has Tapin imported people with rates; three
  questions on the bench vendor's page (record 63).
- The sample company on production's own demo keeps its old rows until
  the demo is rebuilt.
- For the next deploy: the coding block and the one file (record 64);
  the party pages (record 63); imports in the firm's own currency; the
  rest of the contractor's week (attach at the moment of filing, the
  approver asked for when a client is recorded); the walkers' lists of
  smaller faults, kept with the walk results.
