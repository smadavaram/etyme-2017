import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { factsForReader } from '@/app/api/placements/[id]/paper-facts-for-reader'
import { PapersTable, askedWords, missingWords, owedWords, type PaperRow } from '@/app/dashboard/placements/[id]/papers-table'
import type { PaperFacts } from '@/lib/document-stages/line-paper-facts'

/**
 * Record 117, step 2: the faults the browser walk found on the papers view,
 * one test per fault, written before the fix.
 */
const ROUTE = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
const PAGE = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')
const when = new Date('2026-11-10T12:00:00Z')
const facts = (over: Partial<PaperFacts>): PaperFacts => ({ asked: null, received: null, examined: null, verdict: null, ...over })
const row = (over: Partial<PaperRow>): PaperRow => ({ key: 'I9', label: 'Employment eligibility form', required: true, state: 'ALREADY_HELD', note: 'On file', blocks: false, owedByRole: 'WORKER', ...over })
const draw = (items: PaperRow[]) => renderToStaticMarkup(createElement(PapersTable, { items, onDone: () => {} }))

describe('a client never reads the name of the firm below its supplier in a screening verdict', () => {
  const hidden = [{ id: 'sub', name: 'Hidden Lab Partners' }]
  const said = (word: string, over: Partial<NonNullable<PaperFacts['verdict']>> = {}) =>
    ({ SCREEN: facts({ verdict: { word, provider: 'Northbank Checks', reference: 'R-1', date: when, firmId: 'sub', ...over } }) })

  it('a screening word that names the firm that ordered the check is dropped, and the date stays', () => {
    const out = factsForReader(said('Hidden Lab Partners reports clear'), (id) => id !== 'sub', hidden)
    expect(out.SCREEN.verdict?.word).toBeNull()
    expect(out.SCREEN.verdict?.date).toEqual(when)
    expect(JSON.stringify(out)).not.toMatch(/hidden lab/i)
  })

  it('a screening word that names a withheld firm is dropped even where nobody on record ordered the check', () => {
    const out = factsForReader(said('Hidden Lab Partners reports clear', { firmId: null }), (id) => id !== 'sub', hidden)
    expect(out.SCREEN.verdict?.word).toBeNull()
  })

  it('a screening word that carries the provider’s own name is dropped where the ordering firm is withheld, since the provider goes with it', () => {
    const out = factsForReader(said('Northbank Checks: clear'), (id) => id !== 'sub')
    expect(out.SCREEN.verdict?.word).toBeNull()
    expect(out.SCREEN.verdict?.provider).toBeNull()
  })

  it('a screening word that names nobody withheld is kept word for word', () => {
    const out = factsForReader(said('Clear'), (id) => id !== 'sub', hidden)
    expect(out.SCREEN.verdict?.word).toBe('Clear')
  })

  it('a reader who may name the ordering firm reads the word, the provider and the reference as recorded', () => {
    const out = factsForReader(said('Hidden Lab Partners reports clear'), () => true)
    expect(out.SCREEN.verdict).toMatchObject({ word: 'Hidden Lab Partners reports clear', provider: 'Northbank Checks', reference: 'R-1' })
  })
})

describe('the route sends a client nothing that names the firm below its supplier', () => {
  it('the checklist’s note, the screening company and its sentence, and the compliance provider are withheld or scrubbed for a reader who may not name the firm', () => {
    expect(ROUTE).toContain("from './checklist-for-reader'")
    expect(ROUTE).toMatch(/checklistForReader\(/)
    expect(ROUTE).toMatch(/providerForReader\(/)
  })
})

describe('a paper that arrived and was not examined is never drawn as on file', () => {
  const arrived = { examined: { state: 'NOT_EXAMINED' as const, by: null, when: null, firmId: 'f', firmName: 'Halcyon Staffing' } }

  it('the table draws no on-file chip for a paper that arrived and nobody examined', () => {
    expect(draw([row(arrived)])).not.toMatch(/on file/i)
  })

  it('Missing says the paper waits for the check', () => {
    expect(missingWords(row(arrived))).toBe('Waiting to be checked')
  })

  it('Owed by names the firm that checks it', () => {
    expect(owedWords(row(arrived))).toBe('Halcyon Staffing checks it')
  })

  it('Owed by says who checks it without naming a firm the reader may not name', () => {
    expect(owedWords(row({ examined: { ...arrived.examined, firmId: null, firmName: null } }))).toBe('Waiting for the check')
  })

  it('a paper that was examined and accepted is still drawn as on file, with nothing missing and nobody owing it', () => {
    const ok = row({ examined: { state: 'ACCEPTED', by: 'Dana Hill', when: '2026-11-10T00:00:00.000Z', firmId: 'f', firmName: 'F' } })
    expect(draw([ok])).toMatch(/on file/i)
    expect(missingWords(ok)).toBe('—')
    expect(owedWords(ok)).toBe('—')
  })

  it('a paper held with no arrival facts at all is still drawn as on file', () => {
    expect(draw([row({})])).toMatch(/on file/i)
  })
})

describe('an I-9 on an out-of-date edition is drawn with the edition warning and not as on file', () => {
  const old = row({ edition: { says: 'Completed on the 07/17/17 edition, which the government has retired.' } })

  it('the table draws the edition sentence and no on-file chip', () => {
    const html = draw([old])
    expect(html).toContain('Completed on the 07/17/17 edition, which the government has retired.')
    expect(html).not.toMatch(/on file/i)
  })

  it('Missing carries the edition warning and Owed by is not a dash', () => {
    expect(missingWords(old)).toContain('retired')
    expect(owedWords(old)).not.toBe('—')
  })
})

describe('the refused placement page says what to do and links back', () => {
  it('the route’s not-found sentence has no “id” in it and points to Contracts', () => {
    expect(ROUTE).not.toContain('No placement by that id.')
    expect(ROUTE).toContain("message: 'You can open only contracts your company is on. Yours are listed under Contracts.'")
  })

  it('the page draws a link back to the contracts list beside the refusal', () => {
    expect(PAGE).toMatch(/<RefusedState says=\{error\} \/>[\s\S]{0,300}href=\{parent\.href\}/)
  })

  it('the refusal is still logged before the answer and is still a 404', () => {
    const at = ROUTE.indexOf('if (!parties || !isParty || notTheirs) {')
    const block = ROUTE.slice(at, at + 1800)
    expect(block.indexOf('await recordRefusal(')).toBeGreaterThan(-1)
    expect(block.indexOf('await recordRefusal(')).toBeLessThan(block.indexOf("code: 'NOT_FOUND'"))
    expect(block).toContain('status: 404')
  })
})

describe('a client never reads wording that draws the supply chain', () => {
  it('a firm the reader may not name is shown as the day alone, never as the supplier’s supplier', () => {
    const t = askedWords({ asked: { when: '2026-11-10T00:00:00.000Z', via: 'PAPER', firmId: null, firmName: null } })
    expect(t).toBe('Nov 10, 2026')
  })

  it('the route says a hidden firm in a door’s sentence is your supplier, and never “<firm>’s supplier”', () => {
    expect(ROUTE).toContain("'your supplier'")
    expect(ROUTE).not.toContain('’s supplier`')
  })

  it('no reader-facing source in the papers view says the supplier’s supplier', () => {
    for (const f of ['src/app/dashboard/placements/[id]/papers-table.tsx', 'src/app/api/placements/[id]/paper-facts-for-reader.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/supplier’s supplier|supplier's supplier/)
    }
  })
})
