## Nine links, no flip, and every first screen names a person — decided by the founder, 2026-10-19

"Build it", on the drawing of every party's first screen and every
public page (https://claude.ai/artifact/A91ZWwSnKqEgD5DyxotzcN), after
his two observations: *"Practically the dashboard switch button seems to
have no value as everything viewable on left navigation"* and *"left
navigation is also exhaustive … [it] will scare anyone from our app …
the UI should be so easy and the UX too."* Three decisions, each the
home page's rule ("The chaos is between people") carried into the app.

**1. Nine links, and a process step is a tab, not a menu entry.** The
menu table carried 133 labels; a supplier's owner read about forty. A
menu entry is now a noun on the person's desk, and everything that was
a neighbor becomes a tab inside that noun's page. The four nouns are the
home page's own: Jobs, Candidates, Timesheets and the money document.

| Party | The nine | Folded inside them, as tabs |
|---|---|---|
| Client | Ask Etyme · Today · Jobs · Candidates · Timesheets · Invoice receipts · Contractors · Suppliers · Settings | Conversations → Ask Etyme. Submissions, Interviews → Candidates. Expenses → Timesheets. AP, Budget → Invoice receipts. Ending soon, Past contractors, Tenure → Contractors. Contacts, Agreements → Suppliers. Program team, Org view, Document requests, Governance → Settings. |
| Supplier, integrator, MSP | Ask Etyme · Today · Jobs · Candidates · Timesheets · Bills · People · Companies · Settings | Conversations → Ask Etyme. Leads, Shared with you → Jobs. Interviews → Candidates. Expenses, Rolloff → Timesheets. Invoice receipts, AR, AP, Payroll → Bills. Bench, Bench pay, Check-ins, Training, Consultants → People. Clients, Suppliers, Contacts, Contracts, POs → Companies. Paperwork, Governance, Team → Settings; Reports → Today. |
| One-person firm | Ask Etyme · Your work · Timesheets · Bills · Contracts · Paperwork · Settings | Conversations → Ask Etyme. Seven: she has no jobs or candidates. |
| Worker | Ask Etyme · Your work · Your page · Your paperwork · Your data | Already five. Unchanged; a worker who also holds a seat at a firm finds its Conversations inside Ask Etyme. |

(History: this table is what 2026-10-19 decided. The words and the
order moved on 2026-11-03; the table under "Navigation per company
type" is the one the code draws.)

Nothing behind the menu is deleted: every page keeps its address,
search still finds it, and every link in a card or a table still lands
on it. The menu stops listing them, and each page gains the tabs that
were its neighbors. The eyebrows follow the nine (`lib/page-framing`),
and the door that decides what a desk-less seat may open is derived
from the pages and their tabs, not from the menu's entries, so folding
a link opens nothing and closes nothing. The section table under
"Navigation per company type" is replaced by this one, and
`sidebar-nav.test.ts` reads this one.

**1b. Ask Etyme and Conversations are one entry.** Decided by the
founder the same day (*"Can Ask Etyme and Conversations be clubbed?"*).
They were two menu entries for one screen: Ask Etyme pinned at the top,
and Conversations under Today, opening the same page with Ask Etyme as
its first row. The Conversations entry leaves every menu. Ask Etyme is
the one door; the other threads stay in the left column beside the chat
on a desktop and behind a back arrow on the phone; and when another
company writes to this seat, the greeting says so in a sentence with a
link ("Brightmoor Staffing wrote to you about the HCM integration lead
job."), so a person who never opens the list misses nothing. The count
on the mark already covers both.

**1c. The public header is the logo and Sign in; the menu is the
footer.** Decided by the founder the same day (*"even the menu has very
[little] value, it can be on the footer"*). The menu icon of 2026-10-14
and the sheet behind it leave every public page. The one-row footer
carries what the sheet carried: Clients · MSPs · Integrators · Suppliers
· Workers · Demo · Documentation · About · Security · Privacy · Terms ·
DPA · Contact. The four steps are reached through Documentation; Sign up
stays in the band.

**2. The flip is gone.** On a desktop the sidebar is always open and
Today is its second entry, so the flip was a second door to a page an
inch away. On the phone the header is the logo, the Ask Etyme mark with
its number (opening the chat) and the menu icon (opening the nine). On a
desktop the header is the logo and search. The decision of 2026-10-13
that put the mark where the bell was stands; the flip of the same
evening is reversed by this one.

**3. Every first screen names a person and the step in front of them.**
Read against eleven live seats on production. One rule for the greeting
of every party, built from the drawing:
- **Names, not counts.** "Two things need you: Ingrid Sørensen's start,
  and Teleworld's missing agreement." Never "Two things need you; open
  the list." The list link stays at the end of the line.
- **Every decision in the count is a card** in the chat, Yes and Not
  now, in the trade's words, through the one approval route. Today only
  the twin's own questions are cards.
- **"Since you last looked" says who and what.** "Marcus Oyelaran has
  five weeks to approve by Wednesday." Never "Hours to approve — in 3
  days (5 times)."
- **The closing line and the four chips are the party's own.** A
  supplier asks which weeks are signed and not billed, which bills are
  unpaid, who is on the bench, who applied; never "Who is near the time
  limit?" A one-person firm is never told "Ask me anything about the
  program."
- **Money and the week before paperwork** that does not stop the work.
  A worker's first screen opens on her week and her pay, not on two
  upload buttons.
- **The Today headline is one sentence with the names in it.** The six
  figures stay; the paragraph under them becomes one line under the
  figure it explains.
- **Machine talk leaves every first screen:** "0.03 good submissions a
  day, per job · target 5", "Cost per submission: free", the system
  activity log (it lives on the ledger page), "Event created",
  "12:00 AM", "Etyme asked on your authority", and the "QA test message
  — please ignore" thread in the demo. A firm's Today page reads what a
  firm asks on a Tuesday: billing this month, signed and not yet billed,
  rolling off in 30 days, on the bench, each with the names.
- **A seat in another company's program sees only that program** on its
  program page: an MSP's own book never appears on the client's page.

**And the public pages speak as the party's own person.** The home
page's panel (https://claude.ai/artifact/X4CBNEAHcEE1dnQB8gdHuw, drawn
the same day) names the person in front of each step — Marcus Oyelaran,
Helena Marsh, Renata Kowal — and opens on the headline's own question.
The product pages inherit it once, because they share the panel. The
Suppliers, Integrators and Workers doors stop playing Northbend's
program manager and play their own named person from the seed, at the
step that party acts on: Marisa Delacroix at Brightmoor, Bhavesh at
Techpeple, Linnea Qadri on Techpeple's bench, Sunil Raghavan at
Teleworld, Helena Marsh, Colleen Byrne. The line under every panel
names them. Reference pages keep their shape; the documentation flow
chart's role pills wrap instead of cutting a role short. Every name and
figure in a panel is still read against the seed by the story-panel
test.

Two faults found by the walk, not design: the AP clerk's first screen
sat on "Reading the record…" for several seconds on production; the
documentation flow chart truncates role names on a desktop.

**Built in this order**, one domain at a time: the nine links and the
flip (architect); the greeting rule for every party (conversation); the
firm's Today page (architect, with money for the figures); the public
panels and doors (market). A release pass before each deploy.

**Built and shipped the same day** (production a60753b0d, seventeen
commits, release pass green: 11,166 unit, 2,264 integration, build).
Six domains built at once on disjoint files and nothing collided. What
was decided on the way, each the coordinator's call and reversible in a
sentence: an MSP reads eight links, because it has no People of its
own; the worker's menu is Ask Etyme plus her five pages; the phone
header uses the chat bubble for Ask Etyme so two Etyme marks do not sit
side by side; the desktop header keeps "+ New" and the account menu,
which holds the only sign-out; the firm's Today page is served by one
new route (`/api/today`) that logs every person it names; "an I-9", not
"her I-9", because the record stores no pronouns; "Etyme asked Renata",
not "asked her", for the same reason. Two faults the walk found and did
not fix, each with its owner: the bill generator loads only running
placements, so a signed week on a placement that has since ended can
never be billed (Karthik Menon's fourteen weeks, about $72,000; money's
next piece); and the "QA test message — please ignore" thread in the
demo is production data, not seed, and there is no staff route to
delete a thread. The home panel's "across every supplier" answer is
$135,200 for all seven contractors, the seed's figure, not the $60,000
the drawing showed for three of them. Still owed: the queue's own
titles ("Rolloff in 18d", "40h", "3d") are reworded on the Today page
and not yet at their source (demand); the decisions read runs about
twenty-six queries in a row and the mark polls it every minute (demand,
architect); an MSP's questions in Ask Etyme still read its own book
while seated in a client's program (conversation).
