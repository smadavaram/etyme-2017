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
 * the seeded world uses. Wherever one appears, the same sentence carries
 * the founder's label, "a demo company — not a customer"; and no sentence
 * names two of them together, because two names side by side is a
 * customer list whatever the sentence around it says.
 *
 * The label was "invented" for an hour. The founder asked what that
 * meant, which is the proof it did not land, and the CRO's question was
 * "are these your customers?" — which "not a customer" answers in his
 * own words.
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
import { PARTY_PAGES, copyOfPartyPage } from '@/lib/public-site/parties'
import { ON_SCREEN } from '@/lib/public-site/skeleton-words'
import { COMPANY_PAGES, copyOfCompanyPage } from '@/lib/public-site/company'
import { docSlugs, copyOfDoc, copyOfDocsHome } from '@/lib/public-site/docs/index'
import { frameCopy } from '@/lib/public-site/nav'
import { closeBandCopy, WAYS_FORWARD } from '@/lib/public-site/funnel'
import { ASK_COPY } from '@/lib/public-site/leads'
import { CENSUS_COPY, promises } from '@/lib/census-copy'
import { sampleFirms } from '@/lib/public-site/sample-desk'
import { SAMPLE_LABEL } from '@/lib/public-site/sample-desk-view'

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
  // A consultant's own corporation, named in the self-employed documentation.
  spine.push('Byrne Critical Care LLC')
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

/** The founder's label, both halves in the one sentence. */
const SAYS_IT_IS_A_DEMO = (sentence: string) =>
  /\bdemo compan(?:y|ies)\b/i.test(sentence) && /\bnot (?:a )?customers?\b/i.test(sentence)

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

  // The home page's frame names the sample program in its chrome strip,
  // in the drawing's words, and says under the frame that every firm on
  // it is a demo company and not a customer (2026-10-14). The two are one
  // caption, drawn together by one component, so they are read as one.
  // Since the same day the frame and its caption are drawn from the
  // skeleton the home page shares with every product page and party door.
  const front = read('src/app/page.tsx') + '\n' + read('src/lib/public-site/skeleton-words.ts')
  const chrome = front.match(/chrome: '([^']+)'/)![1]
  const onScreen = front.match(/const ON_SCREEN = '([^']+)'/)![1]
  const doorScreen = front.match(/const ON_SCREEN_DOOR = '([^']+)'/)![1]
  add('/', copyFrom(front).filter((t) => t !== chrome && t !== onScreen && t !== doorScreen))
  out.push({ where: '/ (the frame’s caption)', unit: `${chrome} ${onScreen}` })

  // A product page and a party door draw the same frame with the same
  // caption under it; a door's caption line says whose screen it is.
  for (const m of MODULES) {
    const c = copyOfModule(m)
    add(m.route, [...c.hero, ...c.body].filter((t) => t !== chrome && t !== onScreen))
    out.push({ where: `${m.route} (the frame’s caption)`, unit: `${chrome} ${onScreen}` })
  }
  for (const p of PARTY_PAGES) {
    const c = copyOfPartyPage(p)
    add(p.route, [...c.hero, ...c.body].filter((t) => t !== chrome && t !== doorScreen))
    out.push({ where: `${p.route} (the frame’s caption)`, unit: `${chrome} ${doorScreen}` })
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

  it('no public page names an example company without saying, in the same sentence, that it is a demo company and not a customer', () => {
    const bare = SAID
      .filter((s) => firmsIn(s.unit).length > 0 && !SAYS_IT_IS_A_DEMO(s.unit))
      .map((s) => `${s.where}: ${s.unit}`)
    expect(bare, `say "a demo company — not a customer" in the same sentence:\n  ${bare.join('\n  ')}`).toEqual([])
  })

  it('no public page lists two example companies together, because two names side by side is a customer list', () => {
    const lists = SAID
      .filter((s) => firmsIn(s.unit).length > 1)
      .map((s) => `${s.where}: ${firmsIn(s.unit).join(', ')} — ${s.unit}`)
    expect(lists, lists.join('\n  ')).toEqual([])
  })

  it('the home page names one example company, the sample program in its frame, and only in a caption that says every firm on it is a demo company and not a customer', () => {
    // Since 2026-10-14 the product is in the page: the sample program
    // manager's screens at Northbend Athletic, live and read-only. The
    // chrome strip names the program, in the drawing's words, and the line
    // under the frame, always shown, carries the founder's label. The
    // frame's title, read by a screen reader instead, says both at once.
    const home = SAID.filter((s) => s.where.startsWith('/') && s.where.split(' ')[0] === '/')
    const named = [...new Set(home.flatMap((s) => firmsIn(s.unit)))]
    expect(named).toEqual(['Northbend Athletic'])
    for (const s of home.filter((x) => firmsIn(x.unit).length > 0)) {
      expect(SAYS_IT_IS_A_DEMO(s.unit), s.unit).toBe(true)
    }
    expect(home.some((s) => s.where === '/ (the frame’s caption)')).toBe(true)
  })

  it('the live product on the home page is labeled under it, always visible, because its screens list names the text guard cannot read', () => {
    // The three screenshots and their captions left on 2026-10-14. The
    // frame shows the seeded world's real rows, which no test reads, so
    // the label under it carries the disclaimer for everything on it: one
    // line, drawn by the one component that draws the frame, never hidden
    // at any width.
    // Since 2026-10-14 the same label sits under the frame on every product
    // page, and a door's says the same of every firm under its own caption.
    const page = read('src/app/page.tsx')
    expect(ON_SCREEN).toBe('You are the program manager. Every firm on this screen is a demo company, not a customer.')
    expect(read('src/lib/public-site/skeleton.tsx')).toContain('label = ON_SCREEN')
    const frame = read('src/lib/public-site/home-demo.tsx')
    const line = frame.match(/<p className=\{`([^`]+)`\}>\{label\}<\/p>/)
    expect(line, 'the label is drawn as its own line').not.toBeNull()
    expect(line![1]).not.toMatch(/(?:^|\s)(?:hidden|sr-only|sm:hidden|md:hidden)(?:\s|$)/)
    expect(page).not.toContain('<img')
    // And the word that did not land is gone from what a reader reads.
    expect(copyFrom(page).join(' ')).not.toMatch(/\binvented\b/)
  })

  it('the sample program drawn in code is off the home page, so no seeded row reaches a reader as if it were a customer’s', () => {
    // The founder's edit of 2026-10-12: three real screens, not a sample
    // drawn in code. The sample's files stay, unused, held by their own
    // test against the seed, for the founder to place.
    const page = read('src/app/page.tsx')
    expect(page).not.toContain('<SampleDesk')
    expect(page).not.toContain("from '@/lib/public-site/sample-desk-view'")
    for (const firm of sampleFirms()) expect(FIRMS, firm).toContain(firm)
    expect(SAMPLE_LABEL).toBe('Sample data from the demo')
  })

  it('catches a caption that names a seeded firm as if it were a customer', () => {
    expect(firmsIn('The program manager at Northbend Athletic signs the week.')).toEqual(['Northbend Athletic'])
    expect(firmsIn('Trusted by Northbend Athletic and Talvern Medical.')).toHaveLength(2)
    expect(SAYS_IT_IS_A_DEMO('The program manager at Northbend Athletic signs the week.')).toBe(false)
    expect(SAYS_IT_IS_A_DEMO('Northbend Athletic, an invented company, signs the week.')).toBe(false)
    expect(SAYS_IT_IS_A_DEMO('Northbend Athletic, a demo company, signs the week.')).toBe(false)
    expect(SAYS_IT_IS_A_DEMO('Northbend Athletic, a demo company — not a customer.')).toBe(true)
    // And it knows a firm by its own first word, the way a screen shortens it.
    expect(firmsIn('Nobody can be submitted through Brightmoor.')).toEqual(['Brightmoor Staffing'])
  })

  it('leaves the example program’s own door as the one page that shows the companies, and it says they are not real', () => {
    // /demo is Platform's page. Its sentence says "the companies are
    // invented" today and is queued to take the founder's label; either
    // wording passes, so the change is not blocked by this file.
    const demo = read('src/app/demo/page.tsx')
    expect(demo).toMatch(/the companies are invented|not a customer|not customers/)
  })
})
