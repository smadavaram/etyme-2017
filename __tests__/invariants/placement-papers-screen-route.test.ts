import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { factsForReader } from '@/app/api/placements/[id]/paper-facts-for-reader'
import { askedWords, examinedWords, missingWords, owedWords, sidesOf, type PaperRow } from '@/app/dashboard/placements/[id]/papers-table'
import type { PaperFacts } from '@/lib/document-stages/line-paper-facts'

/**
 * Record 117, step 2, demand half: the "Papers for this line" table and
 * the route it reads. The screen draws no route of its own; it draws the
 * doors the placement route sends and the facts the route attaches.
 */
const TABLE = readFileSync('src/app/dashboard/placements/[id]/papers-table.tsx', 'utf8')
const PAGE = readFileSync('src/app/dashboard/placements/[id]/page.tsx', 'utf8')
const ROUTE = readFileSync('src/app/api/placements/[id]/route.ts', 'utf8')
const DOORS = readFileSync('src/app/dashboard/documents/paper-doors.tsx', 'utf8')
const ASK_ROUTE = readFileSync('src/app/api/documents/route.ts', 'utf8')

const when = new Date('2026-11-10T12:00:00Z')
const facts = (over: Partial<PaperFacts>): PaperFacts => ({ asked: null, received: null, examined: null, verdict: null, ...over })
const row = (over: Partial<PaperRow>): PaperRow => ({ key: 'W4', label: 'Tax withholding form', required: true, state: 'NEEDED', note: 'Not on file', blocks: false, owedByRole: 'WORKER', ...over })

describe('the papers table and the route it calls', () => {
  it('every field the ask route reads from the Ask door’s request is one the table’s door sends', () => {
    const block = ASK_ROUTE.slice(ASK_ROUTE.indexOf("if (type === 'ask')"), ASK_ROUTE.indexOf("if (type === 'instance')"))
    const read = new Set([...block.matchAll(/body\.([a-zA-Z]+)/g)].map((m) => m[1]).filter((f) => !['templateId', 'subjectType', 'subjectId'].includes(f)))
    const sent = DOORS.slice(DOORS.indexOf("type: 'ask'"), DOORS.indexOf("type: 'ask'") + 200)
    for (const field of read) expect(sent, `the Ask door sends ${field}`).toContain(field)
  })

  it('the table draws the door the route sent beside every paper that has one, and types no route of its own', () => {
    expect(TABLE).toMatch(/<PaperDoorButtons doors=\{doors\} onDone=\{onDone\} \/>/)
    expect(TABLE).not.toMatch(/fetch\(|\/api\//)
    expect(PAGE).toMatch(/<PapersTable\s+items=\{p\.checklist\.items\}\s+paperDoors=\{p\.checklist\.paperDoors\}/)
  })

  it('the route attaches the facts to the checklist’s items through the one reader, after the doors are read, and masks them for the reader', () => {
    expect(ROUTE).toContain('paperFactsForLine({')
    expect(ROUTE).toContain('factsForReader(facts, mayName)')
    expect(ROUTE).toMatch(/items: checklistItems,/)
  })

  it('the table has the six columns, in order, and one plain line about requests matched by person and firm', () => {
    const heads = [...TABLE.matchAll(/<th className="lbl pb-2[^"]*">([^<]+)<\/th>/g)].map((m) => m[1])
    expect(heads).toEqual(['Paper', 'Asked', 'Received', 'Examined', 'Missing', 'Owed by'])
    expect(TABLE).toContain('Requests are matched by person and firm, so two lines for the same person at the same firm show the same requests.')
  })

  it('on a phone the table scrolls inside its own container and the page never widens', () => {
    expect(TABLE).toMatch(/<div className="overflow-scroll-x">\s*<table/)
  })

  it('dates on the table go through the one date formatter', () => {
    expect(TABLE).toContain("from '@/lib/format-date'")
    expect(TABLE).not.toMatch(/toLocale(Date)?String|toISOString/)
  })
})

describe('what the table says of each paper', () => {
  it('a paper that arrived and nobody examined reads Arrived, not examined', () => {
    expect(examinedWords({ examined: { state: 'NOT_EXAMINED', by: null, when: null, firmId: 'f', firmName: 'F' } })).toBe('Arrived, not examined')
  })

  it('a paper accepted names who accepted it and the day', () => {
    expect(examinedWords({ examined: { state: 'ACCEPTED', by: 'Dana Hill', when: '2026-11-10T00:00:00.000Z', firmId: 'f', firmName: 'F' } })).toBe('Accepted · by Dana Hill · Nov 10, 2026')
  })

  it('a screening row shows the provider’s word, name, reference and date, in the provider’s own words', () => {
    expect(examinedWords({ verdict: { word: 'Clear', provider: 'Northbank Checks', reference: '4471', date: '2026-03-12T00:00:00.000Z' } })).toBe('“Clear” · Northbank Checks · ref. 4471 · Mar 12, 2026')
  })

  it('a paper nobody asked for shows a dash and never a made-up day', () => {
    expect(askedWords({})).toBe('—')
  })

  it('a firm the reader may not name is said as the supplier’s supplier', () => {
    expect(askedWords({ asked: { when: '2026-11-10T00:00:00.000Z', via: 'PAPER', firmId: null, firmName: null } })).toContain('the supplier’s supplier')
  })

  it('a paper on file says nothing is missing and nobody owes it', () => {
    const held = row({ state: 'ALREADY_HELD' })
    expect(missingWords(held)).toBe('—')
    expect(owedWords(held)).toBe('—')
  })

  it('the customer’s papers are one table and the worker’s and supplier’s another', () => {
    const sides = sidesOf([row({ key: 'A', owedByRole: 'CUSTOMER' }), row({ key: 'B' }), row({ key: 'C', owedByRole: 'SUPPLIER' })])
    expect(sides.map((s) => s.items.map((i) => i.key))).toEqual([['A'], ['B', 'C']])
  })
})

describe('what the route lets each reader read of the facts', () => {
  const asked = (firmId: string, firmName: string) => ({ when, via: 'PAPER' as const, firmId, firmName })
  const all = {
    NDA: facts({
      asked: asked('sub', 'Tecwyn'),
      received: { when, fileName: 'a.pdf', firmId: 'sub', firmName: 'Tecwyn' },
      examined: { state: 'ACCEPTED', by: 'Pat at Tecwyn', when, firmId: 'sub', firmName: 'Tecwyn' },
    }),
    SCREEN: facts({ verdict: { word: 'Clear', provider: 'Tecwyn Screening', reference: '9', date: when, firmId: null } }),
    ORDERED: facts({ verdict: { word: 'Clear', provider: 'Northbank Checks', reference: 'R-77', date: when, firmId: 'sub' } }),
  }

  it('a check ordered by a firm the reader may not name keeps its word and date and drops its provider and reference, whatever the provider is called', () => {
    const out = factsForReader(all, (id) => id !== 'sub')
    expect(out.ORDERED.verdict).toMatchObject({ word: 'Clear', provider: null, reference: null, firmId: null })
    expect(out.ORDERED.verdict?.date).toEqual(when)
    expect(factsForReader(all, () => true).ORDERED.verdict?.provider).toBe('Northbank Checks')
  })

  it('a firm the reader may name is named, and its examiner with it', () => {
    const out = factsForReader(all, () => true)
    expect(out.NDA.asked?.firmName).toBe('Tecwyn')
    expect(out.NDA.examined?.by).toBe('Pat at Tecwyn')
  })

  it('a firm the reader may not name is withheld on asked, received and examined, and the examiner is withheld too', () => {
    const out = factsForReader(all, () => false)
    const text = JSON.stringify(out.NDA)
    expect(text).not.toContain('Tecwyn')
    expect(text).not.toContain('sub')
    expect(out.NDA.examined?.state).toBe('ACCEPTED')
  })

  it('a provider’s name that is a withheld firm’s name is dropped from the verdict, and the word and date stay', () => {
    const out = factsForReader(all, () => false)
    // The provider is scrubbed only where a withheld firm is in play on this line.
    expect(out.SCREEN.verdict).toMatchObject({ word: 'Clear', provider: null })
  })
})
