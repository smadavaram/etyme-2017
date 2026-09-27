/**
 * An invented company never reads as a customer.
 *
 * A buyer-side review of the live site, 2026-09-27. The founder showed it
 * to a CRO, who asked: "All companies you listed are real? If they are
 * not active customers it might be too much." An example company that
 * reads as a customer is fake social proof, and the question alone loses
 * the moment a buyer decides whether to trust the page.
 *
 * So every public page is read here, sentence by sentence, for the names
 * the seeded world uses. Wherever one appears, the same sentence says the
 * company is invented or an example; and no sentence names two of them
 * together, because two names side by side is a customer list whatever
 * the sentence around it says.
 *
 * `/demo` is the one exception, named here with its reason: it is the
 * door into the example program, the companies are its subject, and it
 * says at the top that every one of them is invented.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyFrom } from '@/lib/positioning'
import { MODULES, copyOfModule } from '@/lib/public-site/modules'
import { COMPANY_PAGES, copyOfCompanyPage } from '@/lib/public-site/company'
import { docSlugs, copyOfDoc, copyOfDocsHome } from '@/lib/public-site/docs/index'
import { frameCopy } from '@/lib/public-site/nav'
import { closeBandCopy, WAYS_FORWARD } from '@/lib/public-site/funnel'
import { ASK_COPY } from '@/lib/public-site/leads'
import { CENSUS_COPY, promises } from '@/lib/census-copy'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── The names the seeded world uses ──────────────────────────────────

/**
 * Every firm the seeds build, read from the seeds rather than retyped,
 * so a firm added to the world is guarded the day it is added.
 */
function seededFirms(): string[] {
  const world = read('src/lib/seed-world.ts')
  const fromWorld = [...world.matchAll(/slug: '[^']+',\s*name: '([^']+)'/g)].map((m) => m[1])
  const client = read('src/lib/demo-seed-client.ts')
  const fromClientDemo = [...client.matchAll(/\{ name: '([^']+)', bandOfMax/g)].map((m) => m[1])
  // The program spine, named in CLAUDE.md and seeded by lib/seed-programmes.
  const spine = ['Veritan Talent', 'Auralis Software', 'Maren MSP']
  return [...new Set([...fromWorld, ...fromClientDemo, ...spine])]
}

const FIRMS = seededFirms()

/**
 * How a firm is recognized in a sentence: its full name, or its first
 * word where that word is its own ("Brightmoor", "Teleworld"). A first
 * word that is an ordinary English word is not enough on its own.
 */
const ORDINARY = new Set(['Computer'])
function firmsIn(sentence: string): string[] {
  return FIRMS.filter((firm) => {
    const first = firm.split(' ')[0]
    const forms = ORDINARY.has(first) ? [firm] : [firm, first]
    return forms.some((f) => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(sentence))
  })
}

const SAYS_IT_IS_INVENTED = /\b(?:invented|example)\b/i

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

// ── What each public page says ───────────────────────────────────────

interface Said {
  where: string
  /** One sentence, or one card whose first line is quoted off a screen. */
  unit: string
}

/**
 * A card that quotes a screen verbatim is read as one caption: the quote
 * is the software's own words and is not rewritten, so the line under it
 * is where the page says the firm in the quote is invented.
 */
function everything(): Said[] {
  const out: Said[] = []
  const add = (where: string, texts: string[]) => {
    for (const t of texts) for (const s of sentences(t)) out.push({ where, unit: s })
  }

  add('/', copyFrom(read('src/app/page.tsx')))

  for (const m of MODULES) {
    const c = copyOfModule(m)
    const cards = new Set(m.refuses.flatMap((r) => [r.says, r.then]))
    add(m.route, [...c.hero, ...c.body].filter((t) => !cards.has(t)))
    for (const r of m.refuses) out.push({ where: `${m.route} (what it refuses)`, unit: `${r.says} ${r.then}` })
  }

  for (const p of COMPANY_PAGES) {
    const c = copyOfCompanyPage(p)
    add(p.route, [...c.hero, ...c.body])
  }

  const home = copyOfDocsHome()
  add('/docs', [...home.hero, ...home.body])
  for (const slug of docSlugs()) {
    const c = copyOfDoc(slug)
    if (c) add(`/docs/${slug}`, [...c.hero, ...c.body])
  }

  add('/census', [
    ...copyFrom(read('src/app/census/page.tsx')),
    ...Object.values(CENSUS_COPY).flatMap(function flat(v: unknown): string[] {
      if (typeof v === 'string') return [v]
      if (Array.isArray(v)) return v.flatMap(flat)
      if (v && typeof v === 'object') return Object.values(v).flatMap(flat)
      return []
    }),
    ...promises().flatMap((p) => [p.heading, p.says]),
  ])

  add('every header, footer and close', [
    ...frameCopy(), ...closeBandCopy(), ...WAYS_FORWARD.map((w) => w.d),
    ...Object.values(ASK_COPY).filter((v): v is string => typeof v === 'string'),
  ])

  return out
}

const SAID = everything()

// ────────────────────────────────────────────────────────────────────────

describe('An invented company never reads as a customer', () => {

  it('reads the names from the seeds, and finds them on the public pages', () => {
    // Not passing on nothing: the seeds name twenty-odd firms, and the
    // public pages name some of them.
    expect(FIRMS.length).toBeGreaterThan(20)
    expect(FIRMS).toEqual(expect.arrayContaining(['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical', 'Brightmoor Staffing']))
    expect(SAID.length).toBeGreaterThan(500)
    expect(SAID.filter((s) => firmsIn(s.unit).length > 0).length).toBeGreaterThan(5)
  })

  it('no public page names an example company without saying, in the same sentence, that it is invented', () => {
    const bare = SAID
      .filter((s) => firmsIn(s.unit).length > 0 && !SAYS_IT_IS_INVENTED.test(s.unit))
      .map((s) => `${s.where}: ${s.unit}`)
    expect(bare, `say "invented" or "example" in the same sentence:\n  ${bare.join('\n  ')}`).toEqual([])
  })

  it('no public page lists two example companies together, because two names side by side is a customer list', () => {
    const lists = SAID
      .filter((s) => firmsIn(s.unit).length > 1)
      .map((s) => `${s.where}: ${firmsIn(s.unit).join(', ')} — ${s.unit}`)
    expect(lists, lists.join('\n  ')).toEqual([])
  })

  it('the home page names one example company, and says it is invented in the line that names it', () => {
    const home = SAID.filter((s) => s.where === '/')
    const named = [...new Set(home.flatMap((s) => firmsIn(s.unit)))]
    expect(named).toEqual(['Northbend Athletic'])
    for (const s of home.filter((x) => firmsIn(x.unit).length > 0)) {
      expect(s.unit).toMatch(/an invented company/)
    }
  })

  it('catches a caption that names a seeded firm as if it were a customer', () => {
    expect(firmsIn('The program manager at Northbend Athletic signs the week.')).toEqual(['Northbend Athletic'])
    expect(firmsIn('Trusted by Northbend Athletic and Talvern Medical.')).toHaveLength(2)
    expect(SAYS_IT_IS_INVENTED.test('The program manager at Northbend Athletic signs the week.')).toBe(false)
    expect(SAYS_IT_IS_INVENTED.test('Northbend Athletic, an invented company, signs the week.')).toBe(true)
    // And it knows a firm by its own first word, the way a screen shortens it.
    expect(firmsIn('Nobody can be submitted through Brightmoor.')).toEqual(['Brightmoor Staffing'])
  })

  it('leaves the example program’s own door as the one page that shows the companies, and it says they are invented', () => {
    const demo = read('src/app/demo/page.tsx')
    expect(demo).toContain('the companies are invented')
  })
})
