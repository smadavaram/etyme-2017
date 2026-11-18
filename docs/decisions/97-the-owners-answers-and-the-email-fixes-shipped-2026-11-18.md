## The Owner's answers and the email fixes shipped — 2026-11-18

**What went out.** Source 3296d5b11, deploy commit 17f680c4, serving on
both production addresses.
- A public company page prints the firm and no person, unless the Owner
  switches names on in Settings. An Admin is refused in a sentence. Each
  change is logged.
- A holiday added later moves no pay day already written.
- A W-2 week over 40 hours on a line whose work location is in a country
  with no recorded overtime rule is held, whatever the exempt answer. Its
  row offers no exempt buttons and the pay file leaves it off. A trip
  moves nothing (record 94).
- Letters that carry a link go out with a laid-out part beside the plain
  text: one button, no printed address. The invitation, the password
  reset, the sign-up confirmation and the sign-in link are covered.
- A mailed or copied link never carries a one-off deployment address.
  `/ready` says when no lasting address is set.

**How it was checked.**
- Type check clean. Unit suite 17,468. Integration 366 files, 3,751
  tests, run in three parts. Production build.
- The first walk said it does not ship: pressing "Not exempt" released a
  held week at an India site and paid it at the usual rate. Fixed, with
  the pay file. The second walk said it ships.
- Smoke on the production address: health, the public pages,
  `/site/tapin` with no person named, and the inbound email door
  answering 404.

**Open.**
- `/ready` warns that no lasting address is set where only the host's
  production address is known. The mail is right; the line is wrong.
- A week at a changed base: hold the whole week, as built, or only the
  premium, as the advisers recommend. The founder's to say.
- No screen records a country's overtime rule or moves a work location.
- Back pay does not yet say that overtime in an unruled country is left
  out of its figure.
- Letters still sent as plain text: bench invitations, privacy request
  letters, the password-changed notice, the bill link and, most likely,
  the timesheet approval link.
- The local-holiday day kind on a week is not built.

**Lessons, so they are not paid for twice.**
- A hold that reads one answer is released by recording that answer.
  Name every way out of a hold, and test each.
- A test that searches a whole row for a figure will one day find it in
  a random id.
- The build machine restarts when left idle. A long check is run in
  parts in the foreground, so a restart costs one part.
- A pin on an import's name moves when the import is renamed. Search the
  tests for the old name in the same change.
