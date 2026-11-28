## Layer 4 of the fix list shipped: findability and access — 2026-11-15

**What it is.** The fourth of five layers of the fix list of 2026-11-14
(record 72): areas C, "findability", and D, "people and access". It went
out as its own deploy, with no database change.

**The founder's rulings, 2026-11-15** ("go with your recommendations").
- The tab row's first pill, which repeats the menu link's name, stays. It
  is the way back to the register.
- The aged-bills tab keeps "AR" and the aged-receipts tab "AP". Each
  page heading glosses its tab once: "Accounts receivable (AR)",
  "Accounts payable (AP)".
- Only an invitation email that left counts against the invitation
  limits. A failed email never locks a seat out for the hour.
- Wherever a person, or a choice for a person, is described, the Member
  role reads "No role yet". Settings > Roles keeps the role's name.

**What the read-only pass found.**
- *C1, duplicate menus.* By design: the menu link and its first tab
  share a name. Kept, by ruling.
- *C2, search.* The box already said "Search pages". Its empty state said
  nothing about where records are found.
- *C3, many names.* Two of three were already fixed. AR and AP were the
  rest.
- *C4, rows that open.* Rows had a pointer and nothing else. The bench
  card of a person asked was plain text.
- *C5, the slow Companies list.* Each row asked the database five
  questions in turn, so a list of a few hundred took twenty seconds.
- *C6, cut sentences.* Not in the code: the tester's notes cut each
  quote at one hundred characters.
- *D1, failed invites.* The resend worked; the count and the log did not
  say which emails had failed.
- *D2 to D5.* Wording and missing sentences: a grant to an invited
  person, two records of one person, "Member" against "No role yet", an
  Owner named as the company, a row with no buttons and no word.

**What went out.**
- The Companies list asks whether two firms work together once for every
  row. On a test firm, thirty more companies cost 44 queries, not 224.
- When no page matches, search says where people and companies are
  found, with links. It empties when the page changes.
- A row that opens a drawer has its name in link color, a hover fill and
  a focus ring.
- An asked person's name on Bench opens her record on Candidates. Before
  her yes it shows only what the firm typed. Another firm's id opens
  nothing and says so.
- The invited figure says how many emails did not go, or that none can
  leave here. A failed resend is logged as tried. An invitation is always
  logged, even when its email step crashes.
- A grant to a person who has not signed in says it starts once they
  sign in, with their address.
- The Owners page shows each address. A new sign-up is never named after
  the company.
- Sign-in says which default applies and why.
- A person with no role is told who gives one: the inviter, the roles
  that may, or an Owner or Admin. Every joining sentence, the invitation
  email, the welcome and the Owners' notice say "with no role yet".
- A row with no Pause or End says why. Sites show each address with its
  ZIP, and the country where it is not the company's own.

**An access fault, found while building and closed.** Users & permissions
let an Owner give a role "until <date>" and said "This ends on <date>
unless renewed". Nothing ended it: a seat past its date still signed in
and acted. Now the caller check passes over such a seat. An Owner's seat,
and the last seat that may manage access, are never ended by a date, so
a firm is never locked out. The person reads "Your access at <company>
ended on <date>. An Owner or Admin there can renew it." The seat is
listed under "Access ended" with Renew, which opens Change role with the
same role. Counts, pickers, "who may" sentences, Teams, the account menu,
the joined notice and the nightly watch all read the date through one
rule (`seatByDate` in `lib/account-lifecycle`).

**Not built, because each is new.** A header search of records. A link
between two addresses of one person. Renaming "Add consultant" to "Add
candidate".

**How it was checked.**
- Two read-only readers before building, one per area.
- A reader who built none of it found two faults to fix: an invitation
  with no log row when its email crashed, and "joins as Member" in the
  joining sentences. Both fixed, with the smaller ones.
- Two full release checks. The first was red on one integration test
  that demanded the same query count with thirty more companies; the
  full run showed one more (28 against 27). It now holds that no query is
  made per company. The second, on the commit deployed, was green: 16,934
  unit tests, 3,448 integration tests, the build.
- One walker pressed twelve items in a browser. Eleven passed: the list
  drew in a quarter second at seed scale; the ended seat, Renew and the
  kept Owner all read right. One stopped: "Member" in five places after a
  role change, and "read-only access" for a seat with no role. Fixed; the
  coordinator pressed it on the built app.

**The deploy.** Pushed 22:35 UTC, serving 22:42 UTC: deploy commit
07c99196 (source 042760efa), on top of 3b4a520a. 28 commits, no schema
line. Health: database ready. Every public page, sign-in, sign-up and
`/site/tapin` answered 200. The inbound email door answered 404.

**For the founder.** Any live seat already past an end date stops
working from this deploy until it is renewed. Renew it under Settings >
Users & permissions > Access ended > Renew.

**Left for later.** The Give access list of roles as groups still says
"Member", naming the role. The nightly watch rounds a few hours to "0
days". A long list of smaller words the walker found goes to Layer 5 and
the retest batch.

**Lessons, so they are not paid for twice.**
- A promise on a screen ("ends on <date>") is traced to the code that
  keeps it.
- One state, one word: a test reads every place that names it.
- A query-count test holds a bound, not an exact number.
- Two choices that do the same thing are one choice.
