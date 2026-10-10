# Demo names

`/demo` is public and names Nike, Corning and Terumo BCT. That implies
they are customers — the claim stripped off the home page a day earlier
— and ships three trademarks in a product we sell. One invented name
per firm; sector kept so the stories still read, initial letter kept.

## The sheet

| Old | Role | Sector | New | Why it is safe |
|---|---|---|---|---|
| Nike | Client | Athletic apparel | **Northbend Athletic** | Keeps N and the Pacific Northwest register. North Bend is a town, not a brand; "Athletic" holds the sector, so the planning-analyst story reads. |
| Corning | Client | Specialty glass | **Cavanaugh Glassworks** | Keeps C and the surname-founder pattern of American glassmakers. No glass firm carries it. |
| Terumo BCT | Client | Medical devices | **Talvern Medical** | Keeps T and the invented-Latin register of device makers. Not a word or a mark. Holds the Denver-area example in `distribution.ts`. |
| Adobe Systems | Client (spine) | Software | **Auralis Software** | Keeps A and the Latin-root software register; the sector word does the work. |
| *a real workforce MSP, name retired* | MSP (spine) | Workforce MSP | **Maren MSP** | Keeps M and the one abstract word MSPs brand with; sits beside the seed's Kestrel MSP. A given name, not a firm. |
| Vertex Talent | Recommended supplier | Staffing | **Veritan Talent** | Keeps V and fixes a collision the seed has: Vertex Global is a different firm in the same world. |
| Columbia Sportswear | Reference contact | Outdoor apparel | **Ridgeline Outfitters** | Familiar in outdoor apparel; not a mark |
| Adidas | Reference contact | Athletic apparel | **Ascent Athletic** | Keeps A, keeps the sector. |

**Locations move too**, because a headquarters town names the company:
Beaverton → **Tualatin, OR**; Corning → **Elmira, NY**; Lakewood →
**Westminster, CO**, still the Denver area.

**Leave alone.** Every supplier, MSP and integrator in `seed-world` is
already invented, as are the four other clients and all people. Low
priority: Ravensbourne (a real UK university) and TechVista (a real
Dubai IT firm).

## Worse than a display name

- `prisma/seed.ts:143,156` set `domain: 'terumobct.com'` and
  `'nike.com'`, `domainVerified: true`, and six seeded people hold
  `@terumobct.com` addresses. Mail to a demo tenant resolves to a real
  company. Use `.example`.
- `prisma/seed.ts:416` is Terumo BCT's actual street address.

## Slugs stay

Agreed. `world-nike` is an address, and the American-English decision
set that precedent by keeping `world-nike-programme@`. Display names
touch eight files; slugs touch roughly 130, because every integration
test and `POST /api/demo` keys off them — a test-breaking pass buying
one word out of a URL bar nobody types. Revisit only if the founder
minds the residue.

## Files to change

| File | Lines |
|---|---|
| `src/lib/seed-world.ts` | 54, 66–68 |
| `src/lib/seed-programmes.ts` | 150, 152, 155–188, 208–232, 248–287 (`loc` strings, and 287's plant title), 554–557 |
| `prisma/seed.ts` | 141–143, 154–156, 415–418, 472–476, 561–565, 651 |
| `src/app/demo/seats.ts` | client and supplier blurbs (architect's file) |
| `src/app/demo/page.tsx` | 52–54 |
| `__integration__/full-spine.test.ts` | 136, 148, plus prose throughout |
| `__integration__/client-programme.test.ts` | 26–27 (prose only) |
| `CLAUDE.md` | 311, 584 (Infosys → Teleworld), 589, 1039, 1055, 1102 |

## The names landed — what is closed, 2026-09-17

The sheet above is applied. Three lines survived it, because they were
in three other agents' files and the architect who applied the sheet
could not write there. All three are customer-facing and all three are
now closed, each carrying a dated cross-domain comment on the precedent
of `c126c1c4` and `f901e914`:

| File | Was | Now |
|---|---|---|
| `src/lib/onboarding.ts` (etyme-supply) | `example: 'Terumo BCT, Nike'` on the live sign-up picker | `example: 'Talvern Medical, Northbend Athletic'` |
| `src/lib/onboarding.ts` (etyme-supply) | `example: 'Infosys, Accenture'` | `example: 'Teleworld Solutions, Sundara Systems'` |
| `src/app/dashboard/access/page.tsx` (etyme-regulatory) | placeholder `Joining the Terumo delivery team` | `Joining the Talvern Medical delivery team` |
| `src/app/dashboard/suppliers/page.tsx` (etyme-demand) | paste example `Vertex Talent Ltd, priya@vertextalent.io` | `Veritan Talent Ltd, priya@veritantalent.example` |

The integrators were the closer call: Infosys and Accenture were used as
examples of *a kind of firm*, not as customers. They went anyway,
because the example sat one line under two real client names and reads
as the same claim. The replacements are the two integrators the seeded
world already invented — Teleworld Solutions and Sundara Systems — so
the picker, the demo and the world say one thing.

**And the comments behind them, 2026-09-17.** The three files above were
then held out of the guard, because each still named a real company in a
code comment — `"Nike Inc"` and `terumobct.com` in `onboarding.ts`'s
header, `Infosys` in its posture note, `"I cannot see the Nike contract"`
in `access/page.tsx`. Nobody reads a comment, but the guard reads the
whole file, and the guard reading these files is the only thing that
stops a fourth recurrence on the screens. All four are reworded from this
sheet and teach what they taught; the one historical line — the dated note
recording that the picker "named four real firms" — keeps the history and
names none of them.

**Buyable domains in the paste example, same day.** `veritantalent.io`,
`cloudepa.com` (see 2026-10-04 below — it was never invented) and
`brightmoor.co.uk` were taken for invented firms at addresses
anybody can register — the seeded `nike.com` hazard exactly: joining beats
creating, so a real owner of one would be seated at a firm we made up.
They are `.example` now, the pattern the seeds use. `onboarding.ts`'s
`user@mail.corp.com` comment went the same way, to `acme.example`.

**Still carrying the old names: roughly 120 unit fixtures.** Found by
the architect. `Nike`, `Corning` and `Terumo` as `const` strings inside
`__tests__/` and `__integration__/`. None is customer-facing, none is
rendered, and a fixture name is not a claim about who uses this — the
rule is about what a visitor or a signing-up company reads. Sweep when
something else takes those files; do not open 120 files for it.

## Where the wall is

`__tests__/invariants/demo-names.test.ts` (etyme-architect's) is the
guard. It fails on any retired name in these, and only these:

- the demo doors — `src/app/demo/seats.ts`, `src/app/demo/page.tsx`,
  `src/components/try-demo.tsx`
- the routes behind them — `src/app/api/demo/route.ts`,
  `src/app/api/seed-world/route.ts`, `src/lib/readiness.ts`
- the seeds that fill them — `src/lib/seed-world.ts`,
  `src/lib/seed-programmes.ts`, `src/lib/demo-seed.ts`,
  `src/lib/demo-seed-client.ts`, `src/lib/demo-seed-consultant.ts`,
  `prisma/seed.ts`
- the evals' fixtures — `src/lib/evals/surfaces.ts`
- **the signed-in screens the residue was actually found on, added
  2026-09-17** — `src/lib/onboarding.ts` (the sign-up picker),
  `src/app/dashboard/access/page.tsx`, `src/app/dashboard/suppliers/page.tsx`

and it runs `namedCompanies` from `lib/positioning` over the two a
visitor actually reads. `lib/positioning` itself reads `app/page.tsx`.
Every file in the list is also held to reserved addresses and reserved
domains, which is why the paste example moved.

**The wall now covers the three screens the names came back on, and not
the rest of the signed-in app.** A name on a screen behind sign-in is
still a name on a screen, and the honest position is that the next
residue elsewhere under `src/app/dashboard/**` will be found the way
these were: by somebody looking, not by the suite. Adding the whole
dashboard is a different piece of work — a whole-repo grep with a long
allow-list for skills and systems (`Workday Studio`, `Oracle Retail`) —
and it has not been done, which is not an argument that it should not
be. What has changed is that these three cannot regress silently.

## CloudEPA → Techpeple, 2026-10-04

**Why:** a real company of that name asked for its own tenancy,
2026-10-04. CloudEPA was the seeded bench vendor — the sub-vendor under
Computer Systems, two rungs below the client, in most of the chain
stories — and `cloudepa.com` was its example domain in fixtures and on
two screens. A real firm's name in the demo reads as a customer, and its
domain as an example is an address a real employee signs in from.

| Old | Role | New | Chosen by |
|---|---|---|---|
| CloudEPA · Cloudepa · Cloudepa Systems · Cloudepa Inc. | Bench vendor (sub-vendor) | **Techpeple** (Techpeple Inc. where a legal name is printed) | the founder, 2026-10-04, in place of CloudEPA |
| `cloudepa.com` · `cloudepa.example` | example domain | `techpeple.example` | reserved, RFC 2606 |
| `world-cloudepa`, `world-cloudepa-*@demo.etyme.local` | slug and seeded addresses | `world-techpeple`, `world-techpeple-*@demo.etyme.local` | |

**Unlike the 2026-09-17 sheet, the slug moved too**, because the slug is
the firm's name and a real company's name in a URL is still its name.
The live demo already holds `world-cloudepa`, and the demo world may not
be deleted to change it, so the seed **renames it in place**:
`lib/seed-renames` carries the map, and every seeding first moves a firm
still under an old slug to its new slug and name, its seated people to
the new addresses, and the old name out of the words of every row that
belongs to the demo world — a row pointing at one of the world's
companies or at a person seated at one, and nothing outside it. A second
seeding finds nothing old and writes nothing; where both slugs exist it
refuses rather than merging. One automation row records the rename,
without the old name. `__integration__/retired-demo-firm-renamed.test.ts`
rebuilds an old world and proves nothing named CloudEPA is left.

**The wall.** `CloudEPA` and `Cloudepa` are on RETIRED, and
`__tests__/invariants/demo-names.test.ts` now also reads **every text
file in the repository** for the name, case-insensitive. Four files may
spell it, each with its reason: the guard, the rename map, this sheet,
and the integration test above. Every other file still carrying it is on
an `OWED` list with the agent who owns it, and an entry that no longer
carries the name fails too, so the list only shrinks.

**Still owed, 2026-10-04**, because the architect may not write in
another domain's files:

- **Two lines a person reads.** The suppliers page's paste example
  `Cloudepa Systems, Ravi Menon, ravi@cloudepa.example`
  (`src/app/dashboard/suppliers/page.tsx`, etyme-demand) → `Techpeple,
  Ravi Menon, ravi@techpeple.example`; the leads form's refusal "a domain
  like cloudepa.com" (`src/lib/public-site/leads.ts`, etyme-market) → a
  `.example` domain.
- **Code comments** in thirty-five more files across demand, supply,
  money, conversation, regulatory and market, listed in `OWED`.
- **CLAUDE.md**, which uses the name as a worked example in several
  decisions. It changes with the founder's own approval, not on an
  agent's instruction.

**Removed:** `et termguicolors`, a stray file at the repository root —
a 2020 Rails console dump of the legacy company table carrying the real
firm's phone number and address. It stays in history at its commit.

**Not touched:** the per-visitor demo sandboxes already created from
`lib/demo-seed-client` hold a supplier named `Cloudepa Systems`. They
are removed after thirty days unused (`lib/sandbox-expiry`); new ones
say Techpeple.
