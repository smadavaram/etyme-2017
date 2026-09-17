import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { namedCompanies } from '@/lib/positioning'

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
  'src/lib/demo-seed.ts': read('src/lib/demo-seed.ts'),
  'src/lib/demo-seed-client.ts': read('src/lib/demo-seed-client.ts'),
  'src/lib/demo-seed-consultant.ts': read('src/lib/demo-seed-consultant.ts'),
  'prisma/seed.ts': read('prisma/seed.ts'),
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
  // `talent.cloudepa.com` is buyable by anybody, which is the hazard the
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
  // A headquarters town names a company as surely as the company does.
  { was: 'Beaverton', now: 'Tualatin, OR' },
  { was: 'Lakewood', now: 'Westminster, CO' },
]

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
      const left = Object.entries(SURFACES).flatMap(([file, source]) =>
        stillNames(source, was).map((where) => `${file} ${where}`)
      )
      expect(
        left,
        `"${was}" is still written down. The sheet in docs/demo-names.md moves it to "${now}". ` +
          'A real company named in the demo reads as a customer whatever the sentence around ' +
          'it says, and nobody at that company has agreed to appear here.'
      ).toEqual([])
    })
  }

  it('runs the home page own real-company guard over the two demo surfaces, which are one click from it', () => {
    // Only the two a visitor actually reads. The seeds name skills —
    // Workday Studio, Oracle Retail, Salesforce Commerce — and a skill
    // on a consultant's profile is not a claim about a customer.
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
