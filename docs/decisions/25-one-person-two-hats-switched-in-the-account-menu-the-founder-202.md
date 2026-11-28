## One person, two hats, switched in the account menu — the founder, 2026-11-03

On Tapin's Owner seat, whose menu read the firm's nine links and then
"YOU" with five more underneath: *"I think company user and individual
can be switched on the top right menu and focus on business side of
things when in owner mode and switch to individual mode for taking
care of candidate side of responsibilities."* Decided, and it
supersedes the menu half of "A person who is also a worker keeps their
firm's links and gains You at the end" (2026-09-17); the rule that who
is a worker is read off the work, never off a seat type, stands.

- **The account menu lists the person's hats**, one line each: every
  firm seat they hold ("Tapin · Owner", "Brightmoor · Recruiter") and
  "You · Sharath" where the work makes them a worker (a placement, a
  submission, a line that pays them, a bench listing). The current hat
  is marked. Switching is one click, remembered on the device.
- **The left menu shows one hat's links and nothing else.** In a firm
  hat, that firm's nine; in the You hat, the worker's five (Your work,
  Your page, Who has you, Your data, Your paperwork). The "YOU" list
  appended under the firm's links goes.
- **Ask Etyme, the mark and Today follow the hat.** In a firm hat the
  greeting is the firm's queue; in the You hat it is the person's own
  week, pay and papers, and the chips are a worker's. One person never
  sees two numbers for one hat.
- **Nothing is lost by the switch.** Every page keeps its address;
  search and the + button offer the current hat's pages; a link from a
  notice opens the hat it belongs to. A one-person firm already reads
  her two hats as two tabs under Paperwork (2026-09-21) and keeps that;
  her account menu shows one firm hat and no You hat, because she is
  the firm.
- **Built without a drawing**, because the sentence is the drawing: a
  list in a menu that already exists. Architect (the shell, the account
  menu, lib/nav-table's hat), conversation (the greeting and chips per
  hat), in the wave after the 2026-11-03 retest deploy, before the Ask
  Etyme full screen, since both touch the shell.
- **Built 2026-11-03 (architect).** The account menu lists the hats
  (`hatsFor` in `lib/nav-table`, drawn by `components/shell/hat-list`
  in the desktop account menu and at the foot of the phone menu); the
  left menu, search, the + button, the tab row and the eyebrows read
  one hat (`hat` on the menu's seat facts). The hat is remembered in
  one cookie, `etyme_hat` (`firm` or `you`, and the seat after a colon
  where the person holds more than one), which `getCallerContext`
  reads only to choose among the person's own live seats when no
  header names one, and which Ask Etyme reads for the greeting and
  chips per hat (`readHatCookie`); the words per hat are
  conversation's. A link into a worker's own page opens the You hat
  (`hatForPath`). Four coordinator's calls, each reversible in a
  sentence: a worker whose seat holds no desk at the firm (Karthik
  Menon) opens in the You hat, because the firm hat holds only what is
  addressed to them; a Member with no desk and no work keeps their own
  pages beside what is addressed to them, because that is not a second
  hat; the You hat keeps the threads addressed to the person inside Ask
  Etyme; and switching hats reloads the page on Ask Etyme, so the
  greeting and the mark are read again for the hat now worn.
