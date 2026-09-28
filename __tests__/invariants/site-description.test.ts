import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  verdict,
  namedCompanies,
  priceClaims,
  promisesAnAccount,
  sizesAgainstIncumbents,
  readsAsAimedAtSuppliers,
} from '@/lib/positioning'
import { GET_THE_AUDIT, ASK_A_PERSON } from '@/lib/public-site/funnel'
import { NEXT_STEP_LEAD } from '@/app/demo/seats'

/**
 * Two edges of the public site that no page-level guard reached.
 *
 * The layout's description is what every page but the home page says it
 * is — in a search result, a link preview, a browser tab — and it went
 * on reading "the system of record for contingent hiring … verified"
 * for a week after the home page stopped. `lib/positioning` read the
 * pages and never the layout.
 *
 * `/demo` is where the first rung of the funnel lands, and it had no
 * second rung on it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** The founder's category sentence, decided 2026-09-27 (CLAUDE.md). */
const CATEGORY_SENTENCE =
  'Contingent workforce management for companies with 20 to 200 contractors. ' +
  'The vendor management system, sized for fifty contractors rather than five thousand.'

/** The one literal `description:` in a metadata object, joined if concatenated. */
function descriptionIn(source: string): string {
  const m = source.match(/description:\s*((?:'[^']*'\s*\+?\s*)+)/)
  expect(m, 'no literal description in the metadata').not.toBeNull()
  return [...m![1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('')
}

describe('what the site says it is, outside the home page', () => {
  const layout = read('src/app/layout.tsx')
  const description = descriptionIn(layout)

  it('every page but the home page describes Etyme by the category the founder chose', () => {
    expect(description).toBe(CATEGORY_SENTENCE)
  })

  it('the home page declares no description of its own, so it inherits the layout’s and the two can never disagree', () => {
    // Until 2026-09-28 the home page carried the same literal as the
    // layout, and this test held the two equal. The category changed that
    // day and the two files have two owners, so the page stopped carrying
    // a copy: a tab and a search result read one sentence, declared once.
    const home = read('src/app/page.tsx')
    const metadata = home.slice(home.indexOf('export const metadata'), home.indexOf('\n}\n', home.indexOf('export const metadata')))
    expect(metadata).toContain('title:')
    expect(metadata).not.toMatch(/\bdescription:/)
  })

  it('the site-wide description never calls Etyme a hiring tool or claims something is verified', () => {
    expect(description).not.toMatch(/\bhiring\b/i)
    expect(description).not.toMatch(/\bverified\b/i)
  })

  it('the site-wide description passes the same guards as the public pages: no AI, no named company, no price', () => {
    const v = verdict({ hero: [description], body: [] })
    expect(v.ok, v.says).toBe(true)
    expect(v.findings).toEqual([])
    expect(namedCompanies(description)).toEqual([])
    expect(priceClaims(description)).toEqual([])
    expect(sizesAgainstIncumbents(description)).toEqual([])
    expect(readsAsAimedAtSuppliers(description)).toEqual([])
  })

  it('the layout still adds the product name to every tab, so no page has to', () => {
    expect(layout).toContain("template: '%s | Etyme'")
  })
})

describe('the demo door back into the funnel', () => {
  const page = read('src/app/demo/page.tsx')

  it('the demo door offers the audit and a person, never an account', () => {
    // The words come from the funnel, imported rather than retyped, so the
    // demo cannot drift from the ladder every other page draws.
    expect(page).toContain("from '@/lib/public-site/funnel'")
    expect(page).toContain('GET_THE_AUDIT.href')
    expect(page).toContain('ASK_A_PERSON.href')
    expect(GET_THE_AUDIT.href).toBe('/census')
    expect(ASK_A_PERSON.href).toBe('/contact#ask')

    const line = `${NEXT_STEP_LEAD} ${GET_THE_AUDIT.t}, or ${ASK_A_PERSON.t.toLowerCase()}.`
    expect(promisesAnAccount([NEXT_STEP_LEAD, GET_THE_AUDIT.t, ASK_A_PERSON.t, line])).toEqual([])
    expect(priceClaims(line)).toEqual([])
    expect(namedCompanies(line)).toEqual([])
  })

  it('the next step is one quiet line at the foot of the demo, after every door, and not a banner', () => {
    const at = page.indexOf('{NEXT_STEP_LEAD}')
    expect(at).toBeGreaterThan(page.lastIndexOf('CANDIDATE_SEATS'))
    const block = page.slice(page.lastIndexOf('<p', at), at)
    expect(block).toContain('text-etyme-muted')
    expect(block, 'a filled button or banner is not a quiet line').not.toMatch(/bg-etyme-action|bg-etyme-attention/)
    // Exactly one line: the lead appears once on the page.
    expect(page.split('{NEXT_STEP_LEAD}').length - 1).toBe(1)
  })
})
