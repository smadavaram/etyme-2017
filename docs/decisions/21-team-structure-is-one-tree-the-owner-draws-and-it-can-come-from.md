## Team structure is one tree the Owner draws, and it can come from the directory — the founder, 2026-11-09

*"Use hierarchical mindmap like top down hierarchy flow chart path to
define team structure, along department and facilitate global teams."*
Then, on the first drawing: *"Make it more easy: drag and drop, add box
under or same level, delete a box. A team can have 8-10 names vertically
at same level and last node"*; *"Make right click over the box have
actions like adding a node or roles"*; *"Can it be integrated or imported
from Active Directory"*. "Build it", on the second drawing
(https://claude.ai/artifact/SZSWPQH7k2JjAdKbZsJeH9, Corvane Packaging
from the seed). Tested against the five questions: core problem strong (a
company with sites in eight countries cannot say who answers for which),
real economy partial, the stepping stone strong (approvals, alerts and
Ask Etyme route to a team's lead), money partial, simple strong ("see who
leads every team, in every country"). Verdict: build now; most of it is
on the record already (`OrgUnit` is a tree, a REGION unit scopes a seat,
a grant reaches a unit and everything under it).

- **One screen, Settings → Team structure**, the Owner and Admin only.
  The company at the top, then departments, regions, sites and teams,
  drawn top down; the last level stacks downward; each box shows its
  kind, its lead, its people (ten names, then "and N more"), its
  contractors, open jobs, nearest time limit, countries and currencies,
  and the chosen box's editor beside the tree. On a phone it is an
  indented list.
- **Every act is one gesture and one route.** Drag a box onto a box to
  put it under, onto its edge to put it beside; drag a name onto a box to
  move that person; "+ Under" and "+ Beside" (U and B); delete with a
  confirmation that says what moves up; undo; and a right-click menu
  (press and hold on a phone) on a box (add under or beside, add a
  person, rename, name the lead, change the lead's role, change the kind,
  fold, move, give access, delete) and on a name (make lead, change role,
  move, take off). Every change is recorded with who and when.
- **A box has one named lead**, a seat at the company, recorded with who
  set it and when; it never grants a permission by itself (a grant is
  still made under Users & permissions).
- **Deleting a box moves what was under it up one level**, people and
  teams; a site with contractors at it is refused in a sentence; nothing
  about a person's history or time on site changes when a team moves.
- **Contractors move by their charging unit.** Dragging a contractor's
  name changes which unit their line is charged to
  (`SellContract.orgUnitId`), recorded; never their supplier, rate or
  dates (coordinator's call, reversible in a sentence).
- **The directory is read, never written.** Microsoft Entra ID (the
  Active Directory in the cloud the sign-in already uses, by one read-only
  directory consent from the client's IT admin), Google Workspace, or a
  CSV exported from Active Directory on the client's own servers.
  `department` becomes a box, `manager` its lead and the box above,
  `officeLocation` the site, `country` its country, `jobTitle` the role.
  The Owner or Admin reads a preview of every change and ticks what is
  made; nothing is deleted (a box gone from the directory is shown, not
  removed); an edit made on the screen wins and a disagreement is asked;
  contractors are not in a directory and are never moved by an import;
  an optional nightly check tells the Owner in Ask Etyme what changed.
- **Built in this order:** the tree's schema (a lead with who and when,
  the move and delete rules) and its routes, then the screen with drag,
  the menu and the editor (architect); the directory import, CSV first
  because it needs no keys, then Entra ID and Google Workspace behind
  the founder's app consent (architect, with regulatory for the access
  log of every directory read); the nightly difference as a line in the
  Owner's greeting (conversation).

**Shipped to production 2026-11-09, evening (9c7107747 on the deploy
branch, source 90ff7868a), on the founder's "deploy when green".**
Architect (13a7916fd to 90ff7868a): `OrgUnit` gains a lead with who and
when, an order among siblings and the site a SITE box stands for;
`OrgChange` keeps every change with who, when, the sentence, the source
(SCREEN or DIRECTORY) and what undoes it; Corvane is seeded with
Operations (Astrid Berge) over its six regions, Finance (Margaret Osei,
Lucas Fairbairn) and Compliance (Yvette Marchetti); one route for the
tree and one for the directory, Owner and Admin only, every refusal
logged before it is sent; the screen with drag, + Under and + Beside,
the right-click and press-and-hold menus, the choosers for moving a
person or a contractor, delete and undo; the import from a file
exported from Active Directory with a ticked preview; Entra ID and
Google Workspace readers behind "not connected". Coordinator's and
architect's calls, each reversible in a sentence: a seat that sets the
company up is never put on a region or a site; a box that rules,
grants, budgets, seats or orders name cannot be deleted; a change that
widens or narrows what somebody reads says so; the tree keeps the names
on Sites in step; Change role and Give access open Users & permissions;
undo is the caller's own last change only; a directory names a lead
only where more than half of the box's people on the record report to
them, and never moves an existing box or replaces a named lead without
the Owner's tick. Release pass 50 on eedf74b81 fully green (14,731
unit, 2,822 integration, type check, build), and on 90ff7868a the type
check, 14,732 unit and the build. Walk 10 (does not ship: an import
that moved Operations on one row, the company box off screen, three
menu items that did nothing), 10b (does not ship: the centering and a
held name on a phone) and 10c (ships: the company box in view 20 of 20,
a held name's own menu, a contractor charged elsewhere changing only
the charging unit), reports under `scratchpad/walk-saves/report10*.md`.
Gates: no Ruby, brand kit present, no source difference; the schema
only adds (the three "removed" lines are a comment). Smoke: health
"Serving 9c710774" with the database ready and the schema there; every
public page, the four doors, `/site/tapin` and the new screen 200; the
inbound email door 404 to a POST. **Open:** where an Entra or Google
consent is kept (no column yet, so neither connects); the privacy
notice and DPA line for a directory read, for the founder's yes before
any connection; the nightly difference line (conversation); access-log
action names of their own (regulatory); press and hold on a real phone.
