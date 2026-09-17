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

About 120 test files use the names as fixtures — not customer-facing;
sweep later.

**The gap that let this survive.** `positioning.ts` reads `app/page.tsx`
only, so it stripped these names off the home page and never saw `/demo`
one click away. Extend it to the demo surfaces once the names land.
