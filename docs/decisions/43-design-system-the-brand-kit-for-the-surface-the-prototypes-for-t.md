## Design system — the brand kit for the surface, the prototypes for the rest

**The brand kit is adopted. Decided by the founder, 2026-09-26.** It
arrived from the marketing site as `brand-kit/` and it now decides
**color, type, corners, shadows, motion, icons and the logo.** The
prototypes in `prototypes/` still decide **layout, screens and
behavior** — what is on a page, in what order, and what happens when
somebody clicks it. Where the two disagree about a color or a typeface,
the kit wins; where they disagree about what a screen does, the
prototypes win.

The old line — *if the production build does not look like the
prototypes, we have failed* — still holds for everything the kit does
not cover, which is most of what a screen actually is.

**The kit is a copy, and a copy drifts.** It is maintained on the
marketing site and this folder is a duplicate of it. Two homes for one
design system is how the landing page spent a week saying something this
file had already replaced. Either the product's tokens become generated
from the kit, or one person owns the sync on purpose — but nobody should
assume the folder is current because it is checked in.

### Design tokens

The neutrals were already identical on both sides and do not move:

```
canvas:   #F0EEE6    surface:  #FBFAF7    raised:   #FFFFFF    sunk: #E7E4DA
ink:      #1F1E1D    muted:    #6B6862    faint:    #9C9891    rule: #E3DFD5
```

**The accents, and the three decisions inside them.** Every figure below
was computed with the same WCAG arithmetic
`__tests__/invariants/chart-colors.test.ts` uses, not chosen by eye.

| Role | Value | Why |
|---|---|---|
| **action, on a filled button** | `#5228FF` | the site's violet; white text on it scores 6.76 |
| **action, as text** — links, chips, active nav, small type | `#4421D6` | **8.26** on surface against the brighter violet's 6.48, and **7.27** on its own chip wash against 5.70. The deeper violet is materially easier to read at the sizes most of the product is set in |
| **attention** | `#C0622E` | unchanged |
| **verified** | `#4F6F52` — **ours, kept** | the kit proposes `#2F7D3E`, which scores **4.46** on the verified chip's own wash where ours scores **4.94**. The verified chip is the most-read small text in the product and the kit's green takes it from passing to just under. Ask the kit's author for a darker green that clears 4.5 on `#EDF1ED`; until then this token does not move |
| **danger** | `#B83A3A` | unchanged |

**The vivid green `#00C800` is the logo and nothing else, ever.** White
text on it scores **2.27**, which is unusable on any control. The kit
says logo-only and it is right; this is the enforcement.

**The chart palette survives the swap and had to be checked.** `SERIES`
opens on the brand's action color, and the whole five-color set is
validated for color-blind separation. Swapping blue for violet costs
nothing: the worst-separated pair is the clay against the olive, which
the kit does not touch, so the separation is identical before and after.
Every series color stays above the contrast floor. The test sentence
that says the series *"opens on the brand's blue"* is the one artifact
that has to be reworded when the swap lands.

**What this costs, so nobody over-plans it.** Five files carry the token
change — `tailwind.config.ts`, `globals.css`, `layout.tsx`, `logo.tsx`,
`lib/chart-colors.ts`. The 88 files using `etyme-action`, the 95 using
`etyme-attention` and the 56 using `etyme-verified` do **not** move,
because the names stay and only their values change. The September sweep
that pulled twenty-seven off-brand colors onto tokens is what makes this
a five-file change instead of a two-hundred-file one.

### Typography

- **Serif** (headlines, hero numbers): Iowan Old Style → Palatino → Georgia
- **Sans** (body, UI): Inter → system sans
- **Mono** (data): IBM Plex Mono (rolloff console)
- Tabular figures inside tables (`font-variant-numeric: tabular-nums`)
- Serif headlines are set loose (`letter-spacing: -0.02em`) with `text-wrap: balance`

### Two surface types (from `Etyme_UX_Stress_Test.md`)

| | Decision surfaces | Working surfaces |
|---|---|---|
| Examples | Yours to decide, rolloff fan-out, rate approval | Bench list, requirements, timesheets, invoices |
| Voice | Prose, reasoning, confidence, calm | Tables, search, filters, bulk, density |
| Volume | 3–10 items | Hundreds |
| Typography | Serif headlines, generous space | Tabular figures, tight rows |
| Success | User decides well and leaves | User finds and acts fast |

The theme stays the same on both — warm canvas, ink, one blue, clay for
attention. What changes is density and voice.

### Components (extracted from prototypes)

- **Shell** — sticky header (logo + org + role), sidebar nav with section
  groups (Sell / Procure / Operate / Grow), mobile pill nav
- **Panel** — surface background, 1px rule border, serif title, optional
  subtitle
- **Stat** — label (uppercase 10px) + serif number + optional subtitle.
  Tone variants: default (ink), attention (clay), verified (green)
- **Chip** — small rounded label with tone-coded background: attention,
  verified, action, passive
- **Why** (reasoning disclosure) — score + confidence label, expandable to
  show factors (bar chart), basis, and unknowns
- **Head** — eyebrow label + serif h1 + optional prose subtitle
- **Lbl** — 10px uppercase letter-spaced label

### Navigation per company type

**Since 2026-11-08 ("One app, two tabs"), the top of the left column is
one switch, Ask Etyme | Dashboard, with the seat's number on Ask Etyme.**
In Ask Etyme the column holds New conversation, search, Pinned and the
conversations; in Dashboard it holds the role's menu, below. A firm's
menu reads the founder's sketch: Today · Network (Candidates, Companies)
· Jobs · Submissions · HR (Contracts, Timesheets, Expenses) · Accounting
(Receivables, Payables, Payroll, Reports) · Settings ("Money is
Accounting", 2026-11-08: Receivables is the Bills page and Payables the
Invoice receipts page; the pages keep the trade's words, and only the
menu names the two ledgers). Reports is cash flow and profitability
(founder, 2026-11-08): Profitability is a page of the Reports link at
its own address, and Reports is offered only where the seat may open
Receivables' AR, Payables or Profitability. A client reads Accounting
with Payables and Reports since 2026-11-12, its Reports being what it
owes its suppliers, paid and due, and the forecast of it, never a
margin and never Profitability. A group
is a heading and never a link, and a link is drawn only where the role
may open one of its pages. Ask Etyme is not on the menu: the switch is
Ask Etyme. In the table, "Network: Candidates, Companies" is the heading
Network over two links.

The tabs behind each link have not moved (founder, 2026-10-19 for the
tabs; 2026-11-03 for the words; 2026-11-04 for Network, the Paperwork
tab and the order: see "Master data sits under Network", "Paperwork is
a tab of Contracts", "The process order, in the founder's words" and
"Network sits above Jobs"). A menu entry is a noun on the person's own
work; every other page is a tab inside one of them. Submissions is who
was put forward to a job, Contracts is the line from the award on, and
Network holds the two lists a firm keeps: Candidates, the people it
keeps, and the firms it trades with (Companies, or a client's
Suppliers).

| Party | The links | Folded inside them, as tabs |
|---|---|---|
| Client | Today · Network: Candidates, Suppliers · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Payables, Reports · Settings | Conversations → Ask Etyme. By region → Today. Contacts, Agreements, Supplier scorecards → Suppliers. Interviews → Submissions. Ending soon, Past contractors, Tenure, Duplicate check, Compliance, Document requests → Contracts. AP, Budget, POs → Payables. Users & permissions, Team structure, Owners, Sign-in, Program team, MSPs, Sites, Import records, Program twin, Org view, Data requests, Your data → Settings. |
| Supplier | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | Conversations → Ask Etyme. Rate history, Our scorecard → Today. Bench, Bench pay, Bench check-ins, Training → Candidates. Suppliers, Contacts → Companies. Leads, Shared with you → Jobs. Interviews → Submissions. Sell contracts, Buy contracts, POs, Paperwork, Missing paperwork, Document requests, Screening packs, Compliance, Check queue → Contracts. Rolloff → Timesheets. AR → Receivables. AP → Payables. Profitability → Reports. Commissions → Payroll. Users & permissions, Team structure, Owners, Sign-in, Setup, Sites, Integrations, Import records, Activity log, Data requests, Your data, DNR list → Settings. |
| Integrator | Today · Network: Candidates, Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Payroll, Reports · Settings | The supplier's, with no Leads: its jobs arrive from the client it already has. |
| MSP | Today · Network: Companies · Jobs · Submissions · HR: Contracts, Timesheets, Expenses · Accounting: Receivables, Payables, Reports · Settings | The supplier's, with no Candidates under Network, no Payroll link and no Our scorecard: an MSP places nobody and pays nobody. AR → Receivables. AP → Payables. Profitability → Reports. Suppliers, Supplier scorecards, Contacts → Companies. |
| One-person firm | Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Your page, Who has you → Your work. Expenses → Timesheets. AR → Bills. POs → Contracts. Your paperwork, Compliance → Paperwork. Your data → Settings. |
| Worker | You: Your work, Your page, Who has you, Your data, Your paperwork | Unchanged: a list under "You", not nouns with tabs. |

Each link opens the first of its pages the reader may open, and on any
of them the shell draws the tab row under the page header, the noun's
own page first (`components/shell/section-pills`). Nothing behind the
menu is deleted: every page keeps its address, and search and the +
button still find it. Network, Contracts and Settings are the links whose
tab rows are grouped (Settings: People · Company · Records): each group's name, then its pages ("Candidates:
Bench · Bench pay · … | Companies: Suppliers · Contacts"; "Contracts:
Sell contracts · Buy contracts · POs | Paperwork: Missing paperwork ·
Document requests · …"), the group's name being the link to its own
register where one is named after it, so Bench, Contacts or Document
requests is one click from the link. Settings keeps Papers you require
(the setup checklist's item), the DNR list and the activity log.
The tab row's groups are not the menu's headings: the eyebrow over a
page still reads the noun it is a tab of (Network over Bench, Timesheets
over Expenses, Today over Profitability), because the tabs did not move. The money is three links in the founder's order:
Bills (what the firm issues upward, with AR, where payments in are
recorded), Invoice receipts (what it receives from below: AP, where
payments out are recorded; there is no separate payments page, so each
is the AR or AP page in its own words), and Payroll (its own employees,
with Commissions). Nothing on a menu is hidden by a firm's posture: a
bench vendor reads the supplier's whole menu. Sites stay under
Settings; the worker's "You" is the one list.
`__tests__/invariants/sidebar-nav.test.ts` reads this table — the links
and headings the Dashboard column prints (`menuFor` in lib/nav-table)
and every page named in the third column — and fails when the code and
it disagree, so a link renamed in one and not the other breaks the
build rather than the founder's walk.

**A one-person corporation reads its own short menu. Decided
2026-09-21.** A `CONSULTANT_CORP` had no row here and fell through to
Vendor, so an ICU travel nurse paid corp-to-corp through her own LLC was
handed a staffing agency's forty-nine links — Leads, Bench, Consultants,
Bench check-ins, Training, Rolloff, Payroll commissions, Profitability —
for a firm whose only consultant is herself. She is the person **and**
the firm, so she gets the firm's week (her contracts, the order behind
one, her hours, what she billed and what came back) and her own record,
because a solo corporation's owner is always somebody the work is about.
Since 2026-10-19 her own pages sit inside her seven links (Your work,
Paperwork, Settings) rather than in a "You" list appended after them.
Nothing about
a bench, a pipeline or a recruiter's commission: a screen offering to
add another consultant is a screen asking her about herself in the third
person.

**And her two hats are named apart on her one menu.** Every other party
reads "Paperwork" as a tab of its Settings, where it is plainly the
firm's own documents. She is the firm *and* the worker, so her Paperwork
link opens two tabs side by side, **"Company paperwork"** for the firm's
and **"Your paperwork"** for her own, which is the rule her other pages
already follow: your work, your page, your data.
Two entries reading the same word on one menu is the duplicate class the
founder has reported three times, and a heading cannot disambiguate it
for somebody who is both things at once.

**A person who is also a worker wears two hats, one at a time.** Since
2026-11-03 (see "One person, two hats, switched in the account menu"):
the account menu at the top right lists every firm seat the person
holds and "You" where the work makes them a worker; the left menu
shows one hat's links and nothing else, the firm's in the firm hat and
the worker's own pages in the You hat. A link into a worker's own page
opens the You hat. The hat is a view, never a permission: every route
still answers the seat it always answered. The paragraphs below are the
history it replaces.

**Until 2026-11-03: a person who is also a worker kept their firm's
links and gained "You" at the end.** Decided 2026-09-17, on the founder opening Karthik Menon's
demo door and saying "Candidate Karthik is all buggy". He is a systems
integrator's own W2 — the case "Who sells and who buys" added the same day
— so his only context is EMPLOYEE at Teleworld and the shell read identity
off the seat's type: he was served Teleworld's whole integrator menu, and
the four pages that are actually his appeared nowhere at all. The demo door
dropped him on `/dashboard/my-work` and nothing in his own navigation
pointed back to it.

Appended, never substituted. He is Teleworld staff with a real seat **and**
the person the work is about, and giving him the consultant menu instead
would be the same bug facing the other way. Whether somebody is a worker is
read off the work — a placement, a submission, a contract that pays them
(`ownPage` in `lib/consultant-portfolio`) — and never off a context type,
because every staffer of every firm holds an EMPLOYEE context and a
client's bookkeeper is not a contractor. Somebody whose seat already **is**
the consultant seat reads the Consultant row and nothing changes for them.

**Corrected 2026-10-08, by the sign-up walk: the firm's sections are a
desk's, and a seat with no desk reads Today and You.** Round five seated a
Member with no desk at a populated client and typed every URL: the
firm's money and people came back. Round four had tested the same seat
at an empty company, where every page is empty whatever the rules say.
Two things followed, both in `lib/nav-table` and one door in
`lib/api-context` (`lib/deskless-door`):
- **"No desk" means "holds nothing beyond own-work reads"**
  (`assignments.read`, `timesheets.read`), not "holds no permission". A
  desk is any permission that acts on the firm's book or reads across
  it. Karthik's two reads were meant to open his own placements and
  weeks; they opened the firm's submissions with rates, a commercial
  thread and colleagues' placements.
- **One door, not a gate per route.** Every dashboard route passes
  through the shared caller check, which refuses a desk-less seat on
  anything its menu does not show it, in a sentence, the refused read
  logged before the refusal goes out. The allowlist is derived from the
  menu table, so it cannot drift. A route that scopes itself to the
  caller's own rows declares that and is let through.
  `__tests__/invariants/every-route-has-a-door.test.ts` fails on any API
  route that goes through none of the shared door, the cron check or the
  staff check and is not on the named list of public token routes.
So Karthik's menu is now Ask Etyme, with his conversations inside it,
and You (Notifications went on 2026-10-13, and Conversations folded into
Ask Etyme on 2026-10-19). He lands in Ask Etyme like every seat ("Ask
Etyme is the app"); his own work is one click behind it. The paragraph
above still holds for a worker who holds a role at the firm: a delivery
manager who is also on a placement keeps the firm's links and gains You. **For the
founder to confirm:** this narrows what a firm's own W2 sees by default;
if an integrator wants its engineers to read the firm's lists, that is a
desk the firm gives them, not the default.

**A menu entry the route will refuse is a menu entry that lies.** The same
rule as the buttons, one layer up: a nav item names the permission the page
behind it actually asks for, read off that route's own GET handler, and a
seat that holds none of them is not shown the link. A link with no
permission beside it opens a page that refuses nobody — it scopes itself to
the caller's company and shows what that company has. The + button and ⌘K
are filtered from the same answer, so the three doors into a page cannot
disagree. Where a route's gate refuses the very desk the page is named for
— `/api/ar` and `/api/ap` ask for `margin.read` and the Accounts Receivable
desk does not hold it — the link stays unfiltered and the gate is the bug,
because hiding a desk from itself is worse than a refusal.

**Eyebrow labels are company-type-specific.** A page's eyebrow names the
link it sits under on the reader's own menu, and since 2026-10-19 that is
one of the nine: a tab is headed by its noun, so Interviews reads
"Candidates" and Payroll reads "Bills". A client company (Northbend
Athletic, Talvern Medical) sees the same data under its own links — its
suppliers' invoices read "Invoice receipts" where a supplier's own bills
read "Bills". The eyebrow, nav link and page subtitle adapt to the
viewer's company type; the underlying data and pages are shared, the
framing is not. `lib/page-framing` derives every eyebrow from the same
nav table the sidebar draws, so a supplier's contracts read "Companies"
and a client's read "Contractors", and
`__tests__/invariants/page-framing.test.ts` fails on an eyebrow that names a
link the reader's menu does not have. Since 2026-09-21 the framing also
takes the seat: a program office at a client's desk reads the client's words
over the client's book, with one clause saying whose book it is.

### Eight things to build before features (from UX Stress Test)

1. **Search on every list.** Before anything else.
2. **Restore the plus button** with its four sections.
3. **Working-surface table** — dense, sortable, filterable, paginated,
   bulk-selectable, exportable. One component, used everywhere.
4. **Batch submission.** The 2017 `temp_candidates` pattern with per-item
   error collection.
5. **Progressive explanation.** One line by default, reasoning on click.
6. **Tabular figures inside tables.** Serif for headlines and hero only.
7. **Scope the undo promise** to what is actually built.
8. **Missing states** — loading, error, empty, partial, denied.

### Prototype files (reference, not production code)

- `prototypes/rolloff-console.tsx` — vendor-side rolloff (BRD §16)
- `prototypes/client-console.tsx` — client operations (BRD §17.1)
- `prototypes/Etyme_Demo_AllViews.jsx` — all four company views
- `prototypes/Etyme_Onboarding.jsx` — five-step onboarding flow
- `prototypes/Etyme_UX_Stress_Test.md` — UX analysis and resolution
