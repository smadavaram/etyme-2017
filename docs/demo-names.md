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
| Magnit | MSP (spine) | Workforce MSP | **Maren MSP** | Keeps M and the one abstract word MSPs brand with; sits beside the seed's Kestrel MSP. A given name, not a firm. |
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
| `src/app/dashboard/suppliers/page.tsx` (etyme-demand) | paste example `Vertex Talent Ltd, priya@vertextalent.io` | `Veritan Talent Ltd, priya@veritantalent.io` |

The integrators were the closer call: Infosys and Accenture were used as
examples of *a kind of firm*, not as customers. They went anyway,
because the example sat one line under two real client names and reads
as the same claim. The replacements are the two integrators the seeded
world already invented — Teleworld Solutions and Sundara Systems — so
the picker, the demo and the world say one thing.

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

and it runs `namedCompanies` from `lib/positioning` over the two a
visitor actually reads. `lib/positioning` itself reads `app/page.tsx`.

**So the wall does not cover the signed-in app.** Nothing reads
`src/app/dashboard/**` or `src/lib/onboarding.ts`, which is exactly why
these three lines lived through the rename — and why the first of them
was on the picker every new company sees. A name on a screen behind
sign-in is still a name on a screen. The next real-company residue will
be found the way these were: by somebody looking, not by the suite.
Extending the guard to the dashboard is a whole-repo grep with a long
allow-list for skills and systems (`Workday Studio`, `Oracle Retail`),
which is the reason it has not been done, not an argument that it
should not be.
