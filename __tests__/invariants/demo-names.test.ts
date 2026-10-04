import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { namedCompanies } from '@/lib/positioning'
import { writableEmail } from '@/lib/contacts'
import { reservedAddress } from '@/lib/demo-session'
import { WORLD_CLIENTS } from '@/lib/seed-world'
import { costCenterCode, clientTag } from '@/lib/seed-coding'
import { SECTOR_SUPPLIERS } from '@/lib/seed-sector-suppliers'
import { RATE_CHANGE_DEPARTMENT } from '@/lib/seed-rate-change'

/**
 * No real company's name, anywhere a visitor can reach.
 *
 * ── Why this exists, one file away from `positioning` ─────────────────
 *
 * `lib/positioning` catches a trademark on the home page, and it was
 * doing its job: the line "Or sit at a running program — Nike, Corning,
 * Terumo BCT" was found and taken off `app/page.tsx`. What nothing
 * caught is that the button under it went to `/demo`, where the same
 * three names were the headings on three doors, and from there into a
 * seeded world where they were the companies themselves.
 *
 * The guard read one file. The claim lived in six. A name stripped off
 * the page and left one click behind it is not stripped off anything —
 * it is the same implication with an extra step, and the extra step is
 * a button the page tells you to press.
 *
 * So the same rule runs over the surfaces the page hands a visitor to,
 * and over the seeds that fill them: the seat list, the demo page, the
 * "Look around" button, the world seed, the program seed, the demo
 * seeds, the evals' fixtures and the legacy database seed.
 * `docs/demo-names.md` is the sheet the invented names came from.
 *
 * ── Why capitalized, and why slugs are left alone ─────────────────────
 *
 * The decision was that slugs stay: `world-nike` is an address, nobody
 * reads it, and changing it would break every integration test and
 * every `POST /api/demo {"as":"world-nike"}` written down anywhere —
 * the same precedent the American-English decision set when it kept the
 * demo desk key `programme`. Only what a human reads changes.
 *
 * A capital letter is exactly that line. `slug: 'corning'` is an
 * address; `name: 'Corning'` is a word on a screen. So these match the
 * capitalized form, which is what a display name is and what a slug in
 * this codebase never is.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Everything the demo hands a visitor, and everything that fills it. */
const SURFACES: Record<string, string> = {
  'src/app/demo/seats.ts': read('src/app/demo/seats.ts'),
  'src/app/demo/page.tsx': read('src/app/demo/page.tsx'),
  // The other door, and the one the founder actually presses: the
  // "Look around" button on the home page, which names the firm each
  // seat sits at right there on the door.
  'src/components/try-demo.tsx': read('src/components/try-demo.tsx'),
  // Where the evals judge a page's words against a made-up company.
  'src/lib/evals/surfaces.ts': read('src/lib/evals/surfaces.ts'),
  // The doors themselves, and what /ready says about the world behind
  // them — a sentence on that page named one of the three until today.
  'src/app/api/demo/route.ts': read('src/app/api/demo/route.ts'),
  'src/app/api/seed-world/route.ts': read('src/app/api/seed-world/route.ts'),
  'src/lib/readiness.ts': read('src/lib/readiness.ts'),
  'src/lib/seed-world.ts': read('src/lib/seed-world.ts'),
  'src/lib/seed-programmes.ts': read('src/lib/seed-programmes.ts'),
  // What each door opens onto: the four people the demo seats a visitor
  // as, and the two firms whose door led to an empty book.
  'src/lib/seed-doors.ts': read('src/lib/seed-doors.ts'),
  // The layers above and below the placement, added 2026-09-17. They
  // name no firm — every one is looked up by slug — and they are read
  // here anyway, because the sweep is only worth having if it covers
  // every file that writes a seeded row.
  'src/lib/seed-calendar.ts': read('src/lib/seed-calendar.ts'),
  'src/lib/seed-standing.ts': read('src/lib/seed-standing.ts'),
  'src/lib/seed-order-to-cash.ts': read('src/lib/seed-order-to-cash.ts'),
  'src/lib/seed-pipeline.ts': read('src/lib/seed-pipeline.ts'),
  // 2026-09-29: the pay rise and the two suppliers outside IT name their
  // own firms and people, so the wall reads them too.
  'src/lib/seed-rate-change.ts': read('src/lib/seed-rate-change.ts'),
  'src/lib/seed-sector-suppliers.ts': read('src/lib/seed-sector-suppliers.ts'),
  'src/lib/demo-seed.ts': read('src/lib/demo-seed.ts'),
  'src/lib/demo-seed-client.ts': read('src/lib/demo-seed-client.ts'),
  'src/lib/demo-seed-consultant.ts': read('src/lib/demo-seed-consultant.ts'),
  'prisma/seed.ts': read('prisma/seed.ts'),
  // The public security statement names the demo tenants as proof they
  // hold no real people. It went on naming Nike, Corning and Terumo BCT
  // for eleven days after the sheet retired them, because nothing read
  // it — the same one-click-behind failure the demo page had.
  'SECURITY.md': read('SECURITY.md'),
  // etyme-market, 2026-09-17. A cross-domain edit in etyme-architect's file,
  // on the precedent of c126c1c4: the three below are the signed-in screens
  // the sheet's last real names lived on — the sign-up picker every new
  // company reads, the access explainer, the supplier paste box — and they
  // were held out of this list only because each still named a company in a
  // code comment. The comments are reworded now, so the wall covers them,
  // which is the whole point of having walked them once by hand.
  'src/lib/onboarding.ts': read('src/lib/onboarding.ts'),
  'src/app/dashboard/access/page.tsx': read('src/app/dashboard/access/page.tsx'),
  'src/app/dashboard/suppliers/page.tsx': read('src/app/dashboard/suppliers/page.tsx'),
  // etyme-architect, 2026-09-17. Not a screen, and here anyway: the host
  // rules are the first thing every request passes through and their
  // worked example named a domain an invented firm would have to own.
  // `talent.<firm>.com` is buyable by anybody, which is the hazard the
  // seeds and the screens were just cleared of, and this file was outside
  // the wall only because nothing thought to read it.
  'src/middleware.ts': read('src/middleware.ts'),
}

/**
 * The names that were on these surfaces until the sheet was applied,
 * and the towns that named the companies.
 *
 * The list is the sheet, not a trademark database — there is no way to
 * tell a real company from an invented one by looking at a string, and
 * a rule that tried would refuse Brightmoor Staffing and Harlow Health,
 * which are inventions and have to stay. These are the ones that were
 * actually here.
 */
const RETIRED: { was: string; now: string }[] = [
  { was: 'Nike', now: 'Northbend Athletic' },
  { was: 'Corning', now: 'Cavanaugh Glassworks' },
  { was: 'Terumo', now: 'Talvern Medical' },
  { was: 'Adobe', now: 'Auralis Software' },
  { was: 'Magnit', now: 'Maren MSP' },
  { was: 'Columbia Sportswear', now: 'Ridgeline Outfitters' },
  { was: 'Adidas', now: 'Ascent Athletic' },
  // Invented, but it collided with Vertex Global in the same world, so
  // the sheet moved it too.
  { was: 'Vertex Talent', now: 'Veritan Talent' },
  // A real company of this name asked for its own tenancy on 2026-10-04,
  // and the founder chose the new name. Both spellings the code used.
  { was: 'CloudEPA', now: 'Techpeple' },
  { was: 'Cloudepa', now: 'Techpeple' },
  // A headquarters town names a company as surely as the company does.
  { was: 'Beaverton', now: 'Tualatin, OR' },
  { was: 'Lakewood', now: 'Westminster, CO' },
]

/** The two that are places rather than companies. Surfaces only — see below. */
const TOWNS = new Set(['Beaverton', 'Lakewood'])

/** Where a retired name still appears, with the line, so somebody can go and look. */
function stillNames(source: string, was: string): string[] {
  const pattern = new RegExp(`\\b${was.replace(/ /g, '\\s+')}\\b`)
  return source
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, n }) => `line ${n}: ${line.trim()}`)
}

describe('The demo names no real company, on any surface a visitor reaches', () => {
  for (const { was, now } of RETIRED) {
    it(`says ${now} and never ${was} — not on the seat list, not on the page, not in any seed`, () => {
      const left = Object.entries(SURFACES)
        .filter(([file]) => !(RETIRED_FIRM.test(was) && OWED.has(file)))
        .flatMap(([file, source]) => stillNames(source, was).map((where) => `${file} ${where}`))
      expect(
        left,
        `"${was}" is still written down. The sheet in docs/demo-names.md moves it to "${now}". ` +
          'A real company named in the demo reads as a customer whatever the sentence around ' +
          'it says, and nobody at that company has agreed to appear here.'
      ).toEqual([])
    })
  }

  it('runs the home page own real-company guard over the two demo surfaces, which are one click from it', () => {
    // Only the two a visitor actually reads. The company guard below is
    // about customers; the product-name guard further down is about
    // vendors, and the seeds answer to both now.
    //
    // The slugs come out first. `world-nike` is the address `POST
    // /api/demo` answers to and stays by decision; the guard is about
    // what a visitor reads, and nobody reads a slug.
    const withoutAddresses = (s: string) =>
      s.replace(/slug:\s*'[^']*'/g, '').replace(/'world-[^']*'/g, '')
    for (const file of ['src/app/demo/seats.ts', 'src/app/demo/page.tsx']) {
      expect(namedCompanies(withoutAddresses(SURFACES[file])), file).toEqual([])
    }
  })

  it('reads real words out of every file it claims to read, rather than passing on an empty one', () => {
    for (const [file, source] of Object.entries(SURFACES)) {
      expect(source.length, file).toBeGreaterThan(500)
    }
    // And the guard itself still bites: the old page, put back, fails.
    expect(stillNames('    name: \'Nike\',', 'Nike')).toHaveLength(1)
    expect(stillNames("    slug: 'world-nike',", 'Nike')).toEqual([])
  })
})

/**
 * And no product's name either, in anything the seeds put on a screen.
 *
 * ── Why a screenshot is what made this a test ─────────────────────────
 *
 * Decided 2026-09-20, after the home page was rebuilt to show real
 * screens from the seeded demo under the hero and beside each of the
 * four steps. Four of the seven images carried a vendor's product on
 * them — an ERP finance lead, an HCM integration lead and a planning
 * team each carrying a product's name, and a log-analytics skill chip —
 * because that is what the seeded titles said.
 *
 * `lib/positioning` reads words and cannot see inside a PNG. So the
 * guard has to sit where the words are written, which is the seed, one
 * step before the screen and two before the image.
 *
 * ── Why these ten and no attempt at more ──────────────────────────────
 *
 * The same reasoning as the sheet above: there is no way to tell a
 * trademark from an invented word by looking at a string, and a rule
 * that tried would refuse "Etyme". These are the ones that were
 * actually on the seeded screens, plus two enterprise VMS products,
 * which belong nowhere near a consultant's skill chip.
 *
 * Naming a customer and naming a product are different wrongs. A
 * customer has not agreed to appear; a product has not agreed to be
 * implied as a specialism of a firm that does not exist. Both read, to
 * a buyer looking at a screenshot, as a claim.
 *
 * The list is a guard, so it has to spell the names it refuses.
 */

const PRODUCTS = [
  'SAP', 'Workday', 'Oracle', 'Kinaxis', 'Splunk',
  'Snowflake', 'Salesforce', 'ServiceNow', 'Fieldglass', 'Beeline',
  // Not a word boundary case: "S/4HANA" contains no standalone "SAP",
  // and it was on three seeded roles.
  'S/4HANA',
]

/** Every file that writes a seeded row a visitor can end up looking at. */
const SEEDS = [
  'src/lib/seed-world.ts',
  'src/lib/seed-programmes.ts',
  'src/lib/seed-doors.ts',
  'src/lib/seed-pipeline.ts',
  'src/lib/seed-calendar.ts',
  'src/lib/seed-standing.ts',
  'src/lib/seed-order-to-cash.ts',
  'src/lib/demo-seed.ts',
  'src/lib/demo-seed-client.ts',
  'src/lib/demo-seed-consultant.ts',
  // The two doors, which name each seeded program in a sentence.
  'src/app/demo/seats.ts',
  'src/app/demo/page.tsx',
]

describe('No seeded job title, skill or sentence names a real product', () => {
  it('reads every seed file it claims to read, rather than passing on a path that moved', () => {
    for (const file of SEEDS) expect(read(file).length, file).toBeGreaterThan(500)
  })

  for (const product of PRODUCTS) {
    it(`no seeded role, skill or sentence says ${product}, because a screenshot of one is a claim nothing can retract`, () => {
      const pattern =
        product === 'S/4HANA' ? /S\/4HANA/ : new RegExp(`\\b${product}\\b`)
      const left: string[] = []
      for (const file of SEEDS) {
        read(file)
          .split('\n')
          .forEach((line, i) => {
            if (pattern.test(line)) left.push(`${file} line ${i + 1}: ${line.trim()}`)
          })
      }
      expect(
        left,
        `"${product}" is written into a seed. The home page shows real screens from the ` +
          'seeded demo, `lib/positioning` cannot read a PNG, and a buyer looking at the image ' +
          'reads a vendor name as a claim about what Etyme is for. Use the trade\'s own words ' +
          'instead — ERP finance, HCM integration, log analytics, cloud data warehouse.'
      ).toEqual([])
    })
  }

  it('still bites: a seeded role written the old way is found', () => {
    expect(/\bSAP\b/.test("{ role: 'SAP S/4 finance lead', skills: ['SAP FICO'] }")).toBe(true)
    expect(/\bSAP\b/.test("{ role: 'ERP finance lead', skills: ['ERP finance'] }")).toBe(false)
  })
})

/**
 * And the fixtures, which are where the names come back from.
 *
 * ── Why a test file is on this list at all ────────────────────────────
 *
 * Nobody demos a test. The sweep above is about what a visitor reads,
 * and a visitor never reads `__tests__`. This half is about the other
 * direction: where a retired name comes back from once it has been
 * taken off every screen.
 *
 * It comes back from a fixture. A seed is written by reading the test
 * that describes the thing being seeded, and a fixture that still says
 * `name: 'Nike'` is a name sitting one copy-paste away from a screen.
 * That is exactly how this was found — `concentration.test.ts` named
 * two of the three retired clients in its exposure fixtures for two
 * days after the sheet was applied, because the sweep read the seeds
 * and not the tests the seeds are written against.
 *
 * ── The company names, not the towns ─────────────────────────────────
 *
 * The sheet retired two towns as well, because a headquarters town
 * names a company as surely as the company does when it is printed on
 * a door beside it. In a fixture it does not: `location: 'Lakewood,
 * CO'` on a requirement is a city where a job is, next to an invented
 * firm, and the seeded world's own towns — Tualatin, Westminster — are
 * equally real places. So this half reads the company names only, and
 * the towns stay a rule about surfaces.
 *
 * ── The two files that must name a real company ──────────────────────
 *
 * A guard is only worth having if something proves it bites, and both
 * proofs need the thing being guarded against. This file holds the
 * sheet itself; `positioning.test.ts` feeds the retired line back into
 * `namedCompanies` to show the home-page guard still catches it. Every
 * other file under both directories is swept.
 */

const FIXTURE_DIRS = ['__tests__', '__integration__']

/** The files that are allowed to say a retired name, and why. */
const MAY_NAME = new Set([
  '__tests__/invariants/demo-names.test.ts',
  '__tests__/invariants/positioning.test.ts',
  // Rebuilds the world under the retired name in order to rename it, and
  // says in its own test name that nothing of it is left afterwards.
  '__integration__/retired-demo-firm-renamed.test.ts',
])

function testFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...testFiles(path))
    else if (/\.tsx?$/.test(entry.name) && !MAY_NAME.has(path)) out.push(path)
  }
  return out
}

describe('The names are gone from the fixtures too, which is where they come back from', () => {
  const files = FIXTURE_DIRS.flatMap(testFiles)

  it('finds the test files at all, rather than passing on a directory it never opened', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  for (const { was, now } of RETIRED.filter((r) => !TOWNS.has(r.was))) {
    it(`no fixture, no comment and no test name under __tests__ or __integration__ still says ${was} — it is ${now}`, () => {
      const left = files.flatMap((file) =>
        stillNames(read(file), was).map((where) => `${file} ${where}`)
      )
      expect(
        left,
        `"${was}" is still written down in a test. The sheet in docs/demo-names.md moves it to ` +
          `"${now}". A fixture is where a name comes back from: the next seed is written by ` +
          'reading the test that describes it, and a screen is one copy-paste away.'
      ).toEqual([])
    })
  }
})

/**
 * ── And no seeded code either ────────────────────────────────────────
 *
 * The sweep above reads what a seed writes as a literal. A cost center
 * code was not a literal: it was built from the first four letters of the
 * slug, and the slugs are the retired names kept as addresses. So the
 * budget list on Northbend Athletic's job request form read
 * `APPS-NIKE-4100`, and the job request and the Program page printed it,
 * with every file above clean. Found by a tester on 2026-09-30.
 *
 * So the codes are computed here from the same list the world seed
 * writes, and a code built from a slug again fails by name.
 */
describe('Every seeded budget code is built from the name a person reads, never from a retired name kept in a slug', () => {
  const DEPARTMENTS = [
    'APPS', 'SEC', 'RND1', RATE_CHANGE_DEPARTMENT.code,
    ...SECTOR_SUPPLIERS.map((s) => s.department.code),
  ]
  const retired = RETIRED.filter((r) => !TOWNS.has(r.was)).map((r) => r.was.split(' ')[0].toUpperCase())

  it('Northbend Athletic\u2019s budgets read APPS-NORTHBEND-4100 and never APPS-NIKE-4100', () => {
    expect(costCenterCode('APPS', 'Northbend Athletic')).toBe('APPS-NORTHBEND-4100')
    expect(costCenterCode('DIST', 'Cavanaugh Glassworks')).toBe('DIST-CAVANAUGH-4100')
    expect(costCenterCode('EHS', 'Talvern Medical')).toBe('EHS-TALVERN-4100')
  })

  it('no seeded cost center code at any client carries a retired company\u2019s name, whole or cut to four letters', () => {
    expect(WORLD_CLIENTS.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical'])
    )
    const left: string[] = []
    for (const client of WORLD_CLIENTS) {
      for (const dept of DEPARTMENTS) {
        const code = costCenterCode(dept, client.name)
        for (const was of retired) {
          if (code.includes(was) || code.split('-').includes(was.slice(0, 4))) left.push(`${client.name}: ${code} (${was})`)
        }
      }
    }
    expect(left).toEqual([])
  })

  it('every seeded client\u2019s code names that client as a person reads it, never its slug', () => {
    for (const client of WORLD_CLIENTS) {
      expect(client.name.toUpperCase().startsWith(clientTag(client.name)), client.name).toBe(true)
    }
    for (const s of SECTOR_SUPPLIERS) {
      expect(WORLD_CLIENTS.find((c) => c.slug === s.client)?.name, s.slug).toBe(s.clientName)
    }
  })

  it('no seed builds a code a person reads from a slug; the old shape is read only to rename a row in place', () => {
    const fromSlug = /[sS]lug\.slice\(0,\s*\d+\)\.toUpperCase\(\)/
    const left: string[] = []
    for (const file of [...SEEDS, 'src/lib/seed-coding.ts', 'src/lib/seed-sector-suppliers.ts', 'src/lib/seed-rate-change.ts']) {
      const lines = read(file).split('\n')
      lines.forEach((line, i) => {
        if (!fromSlug.test(line)) return
        const inLegacy = lines.slice(Math.max(0, i - 3), i + 1).some((l) => /export function legacyCostCenterCode/.test(l))
        if (!inLegacy) left.push(`${file} line ${i + 1}: ${line.trim()}`)
      })
    }
    expect(left).toEqual([])
  })
})

describe('A seeded firm\u2019s files are named for that firm', () => {
  it('Veritan Talent\u2019s tax form, certificate of insurance and rate card say Veritan, never another firm in the world', () => {
    const seed = read('src/lib/seed-programmes.ts')
    const files = [...seed.matchAll(/fileName: '([^']+)'/g)].map((m) => m[1])
    expect(files).toEqual(expect.arrayContaining(['Veritan-W9-2026.pdf', 'Veritan-COI-2026.pdf', 'Veritan-rate-card.pdf']))
    expect(files.filter((f) => /^Vertex-/.test(f))).toEqual([])
  })
})

describe('The slugs stay, because an address is not a word anybody reads', () => {
  it('still answers to world-nike, world-corning and world-terumo-bct, which every test and every demo link uses', () => {
    const seats = SURFACES['src/app/demo/seats.ts']
    for (const slug of ['world-nike', 'world-corning', 'world-terumo-bct']) {
      expect(seats, slug).toContain(slug)
    }
  })

  it('shows the invented name beside each of those addresses', () => {
    const seats = SURFACES['src/app/demo/seats.ts']
    for (const name of ['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical']) {
      expect(seats, name).toContain(name)
    }
  })
})

/**
 * Worse than a display name.
 *
 * The seed set `domain: 'nike.com'` with `domainVerified: true`, and the
 * sign-in rule in `lib/onboarding` is that joining wins whenever a
 * company already holds your domain. So somebody at the real Nike,
 * signing in for the first time, would have been offered a seat inside
 * a fictional Nike full of seeded contractors, rates and invoices. A
 * display name is an implication; that is a stranger inside somebody
 * else's data.
 *
 * Every seeded domain is therefore one nobody can register: `.example`,
 * `.invalid`, `.test` and `.localhost` are reserved by RFC 2606 and RFC
 * 6761 precisely for this, and `.local` is mDNS and equally unbuyable.
 */
const UNBUYABLE = /\.(example|invalid|test|local|localhost)$/

describe('No seeded company holds a domain somebody could really sign in from', () => {
  const domains = Object.entries(SURFACES).flatMap(([file, source]) =>
    [...source.matchAll(/domain:\s*'([^']+)'/g)].map((m) => ({ file, domain: m[1] }))
  )

  it('finds the seeded domains at all, rather than passing on a pattern that stopped matching', () => {
    expect(domains.length).toBeGreaterThan(5)
  })

  it('gives every seeded company a domain at a reserved name, so a real employee signing in is never seated at a demo tenant', () => {
    const buyable = domains
      .filter(({ domain }) => !UNBUYABLE.test(domain))
      .map(({ file, domain }) => `${file}: ${domain}`)
    expect(
      buyable,
      'A seeded company is domain-verified, and joining beats creating, so a real employee of ' +
        'whoever owns that domain would be seated inside the demo tenant on their first sign-in. ' +
        'Use a reserved name: .example, .invalid or .test.'
    ).toEqual([])
  })

  it('gives every seeded person an address at a reserved name too, so nothing the demo sends can reach a real inbox', () => {
    // The founder's own address is the one exception, and it is a
    // person rather than a company: it grants him the owner seat on the
    // legacy seed's vendor. `example.com` is reserved by the same RFC.
    const allowed = new Set(['gmail.com', 'example.com'])
    const wrong: string[] = []
    for (const [file, source] of Object.entries(SURFACES)) {
      for (const m of source.matchAll(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)) {
        const at = m[1].toLowerCase()
        if (allowed.has(at) || UNBUYABLE.test(at)) continue
        wrong.push(`${file}: ${at}`)
      }
    }
    expect(wrong).toEqual([])
  })
})

/**
 * ── And no seeded address is read out on a screen ────────────────────
 *
 * The rule above keeps a seeded address unreachable. This one keeps it
 * out of sight, and it is a different failure: the browser walk of
 * 2026-09-21 opened Contacts as Vertex Global and read
 * `world-corning-procurement@demo.etyme.local`,
 * `world-terumo-bct-hr@demo.etyme.local` and
 * `world-corning-programme@…` printed in blue as three people's email
 * addresses. Two retired company names and a British spelling, on a
 * screen, inside a string nobody was supposed to read.
 *
 * The slugs stay — CLAUDE.md is explicit that an address is not a word
 * anybody reads, and every integration test signs in with one. What
 * changes is that a screen does not print an address at a domain that
 * can never receive mail.
 */
describe('a seeded sign-in handle is never printed as somebody’s email', () => {
  it('shows no address for a seeded client desk', () => {
    expect(writableEmail('world-corning-procurement@demo.etyme.local')).toBeNull()
    expect(writableEmail('world-terumo-bct-hr@demo.etyme.local')).toBeNull()
  })

  it('shows no address for a seeded consultant either', () => {
    expect(writableEmail('helena.marsh@seed.etyme.invalid')).toBeNull()
  })

  it('shows the address of somebody a person could actually write to', () => {
    expect(writableEmail('dana@northbend.com')).toBe('dana@northbend.com')
  })

  it('a domain that merely contains a reserved word is still a real domain', () => {
    // `example.com` can be bought. `.example` cannot.
    expect(reservedAddress('somebody@example.com')).toBe(false)
    expect(reservedAddress('somebody@northbend-athletic.example')).toBe(true)
  })

  it('the rolodex suppresses it at the edge, after the merge has used it', () => {
    // The address tells one person from two before it is dropped —
    // otherwise a contact typed in by hand and the same person's seat
    // would show as two rows.
    const route = read('src/app/api/contacts/route.ts')
    expect(route.indexOf('known.has(p.email.toLowerCase())'))
      .toBeLessThan(route.indexOf('writableEmail(c.email)'))
  })
})


/**
 * ── The firm that was real, swept across the whole repository ────────
 *
 * Decided 2026-10-04. The seeded bench vendor carried the name of a real
 * company, and that company asked for its own tenancy on Etyme. Its name
 * in the demo reads as a customer, its domain in an example is an address
 * somebody really signs in from, and joining beats creating — so a real
 * employee of the firm could have been offered a seat at the made-up one.
 *
 * The sweeps above read the demo's surfaces and the fixtures. This one
 * reads every text file in the repository, because the earlier names came
 * back from the files nobody listed, and this name was in two hundred of
 * them: seeds, screens, placeholders, comments, docs and the matrix.
 *
 * Three files may spell it, permanently, and each says why. Every other
 * file still carrying it is on the OWED list below with the agent who owns
 * it: the architect who swept the rest may not write in another domain's
 * files. An entry that no longer needs to be there fails too, so the list
 * can only shrink.
 */

const RETIRED_FIRM = /cloudepa/i

/** The files allowed to spell it for good, and why. */
const MAY_SPELL: Record<string, string> = {
  '__tests__/invariants/demo-names.test.ts': 'the RETIRED entry and this guard',
  'src/lib/seed-renames.ts': 'the rename map the seed renames the live demo firm by',
  'docs/demo-names.md': 'the sheet, which records the decision',
  '__integration__/retired-demo-firm-renamed.test.ts': 'rebuilds the old world to prove the rename leaves nothing',
}

/**
 * Still carrying the name on 2026-10-04, in files the architect may not
 * write. Every one is a code comment except two that a person reads: the
 * suppliers page's paste example (`Cloudepa Systems`) and the leads form's
 * refusal ("a domain like …com"), both of which want the new name and a
 * reserved domain. CLAUDE.md was renamed on the founder's request the same day.
 */
const OWED = new Map<string, string>([
  ['src/lib/forwarding.ts', 'etyme-conversation'],
  ['src/lib/interview-notices.ts', 'etyme-conversation'],
  ['src/lib/interviews.ts', 'etyme-conversation'],
  ['src/lib/watch.ts', 'etyme-conversation'],
  ['src/app/api/people/[id]/ask/route.ts', 'etyme-demand'],
  ['src/app/api/program/org/route.ts', 'etyme-demand'],
  ['src/app/api/submissions/[id]/award/route.ts', 'etyme-demand'],
  ['src/app/api/submissions/adopt.ts', 'etyme-demand'],
  ['src/app/api/suppliers/direct.ts', 'etyme-demand'],
  ['src/app/api/suppliers/join/route.ts', 'etyme-demand'],
  ['src/app/api/suppliers/route.ts', 'etyme-demand'],
  ['src/app/api/timesheets/chain-turn.ts', 'etyme-demand'],
  ['src/app/api/timesheets/route.ts', 'etyme-demand'],
  ['src/app/api/why/[type]/[id]/route.ts', 'etyme-demand'],
  ['src/app/dashboard/requisitions/[id]/page.tsx', 'etyme-demand'],
  ['src/app/dashboard/suppliers/page.tsx', 'etyme-demand'],
  ['src/lib/award.ts', 'etyme-demand'],
  ['src/lib/chain-top.ts', 'etyme-demand'],
  ['src/lib/join-companies.ts', 'etyme-demand'],
  ['src/lib/resolve-client-company.ts', 'etyme-demand'],
  ['src/lib/supplier-list.ts', 'etyme-demand'],
  ['src/lib/public-site.ts', 'etyme-market'],
  ['src/lib/public-site/leads.ts', 'etyme-market'],
  ['src/lib/bench-policy.ts', 'etyme-money'],
  ['src/lib/invoice-match.ts', 'etyme-money'],
  ['src/lib/money/billed-elsewhere.ts', 'etyme-money'],
  ['src/lib/money/payers-acceptance.ts', 'etyme-money'],
  ['src/lib/money/rung-billing.ts', 'etyme-money'],
  ['src/lib/work-chain.ts', 'etyme-money'],
  ['src/app/api/compliance/route.ts', 'etyme-regulatory'],
  ['src/lib/seat.ts', 'etyme-regulatory'],
  ['src/app/api/alumni/route.ts', 'etyme-supply'],
  ['src/app/api/bench/burn/route.ts', 'etyme-supply'],
  ['src/app/api/me/work/route.ts', 'etyme-supply'],
  ['src/app/dashboard/my-work/page.tsx', 'etyme-supply'],
  ['src/app/dashboard/training/page.tsx', 'etyme-supply'],
  ['src/lib/consultant-portfolio.ts', 'etyme-supply'],
])

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.vercel', 'coverage'])
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|pdf|docx?|xlsx?|pptx?|zip|gz|woff2?|ttf|otf|rdb|mp4|mov|lock)$/i

function everyTextFile(dir = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(process.cwd(), dir || '.'), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...everyTextFile(path))
    } else if (entry.isFile() && !BINARY.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

describe('The retired firm’s name is nowhere in the repository but the rename map, the sheet and its guard', () => {
  const files = everyTextFile().filter((f) => {
    try { return statSync(join(process.cwd(), f)).size < 5_000_000 } catch { return false }
  })
  const carrying = files.filter((f) => RETIRED_FIRM.test(read(f)))

  it('reads the whole repository, rather than passing on a directory it never opened', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files).toContain('src/lib/seed-world.ts')
    expect(files).toContain('docs/demo-names.md')
  })

  it('no seed, screen, test, doc or comment names the retired firm, outside the rename map and the files still owed', () => {
    const left = carrying.filter((f) => !(f in MAY_SPELL) && !OWED.has(f))
    expect(
      left,
      'A real company of this name asked for its own tenancy on 2026-10-04. The demo firm is Techpeple now ' +
        '(docs/demo-names.md), and a real firm’s domain is never an example: use techpeple.example.'
    ).toEqual([])
  })

  it('every file still owed carries the name, so the owed list only ever shrinks', () => {
    const fixed = [...OWED.keys()].filter((f) => !carrying.includes(f))
    expect(fixed, 'These no longer carry the name. Take them off OWED.').toEqual([])
  })

  it('the rename map is the one piece of code that spells it, and it names the new firm beside it', () => {
    const map = read('src/lib/seed-renames.ts')
    expect(map).toMatch(/fromName: 'CloudEPA'/)
    expect(map).toMatch(/toName: 'Techpeple'/)
    expect(map).toMatch(/toSlug: 'techpeple'/)
  })

  it('the demo door seats a visitor at world-techpeple, never at the old address', () => {
    expect(SURFACES['src/app/demo/seats.ts']).toContain("'world-techpeple'")
    expect(SURFACES['src/components/try-demo.tsx']).toContain("'world-techpeple'")
  })

  it('no seeded company or person holds an address at the retired firm’s domain or any alias of it', () => {
    // A file still owed is held by the sweep above instead; the paste
    // example on the suppliers page is one of them.
    const surfaces = Object.entries(SURFACES).filter(([file]) => !OWED.has(file)).map(([, source]) => source)
    const domains = surfaces.flatMap((source) =>
      [...source.matchAll(/domain:\s*'([^']+)'/g)].map((m) => m[1])
    )
    expect(domains.filter((d) => RETIRED_FIRM.test(d))).toEqual([])
    const addresses = surfaces.flatMap((source) =>
      [...source.matchAll(/[\w.+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map((m) => m[1])
    )
    expect(addresses.filter((d) => RETIRED_FIRM.test(d))).toEqual([])
  })
})
