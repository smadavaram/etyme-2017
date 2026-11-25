import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { paperFactsOf, attachPaperFacts, type ItemRow, type DocRow, type CheckRow } from '@/lib/document-stages/line-paper-facts'

/**
 * Record 117, step 2: each paper on a contract line says what was asked,
 * what arrived, who examined it, and for a screening, the provider's own
 * word. Facts beside the state, never a second reader of "on file".
 */
const d = (s: string) => new Date(`${s}T12:00:00Z`)
const item = (o: Partial<ItemRow> = {}): ItemRow => ({
  key: 'NDA', state: 'PENDING', receivedAt: null, fileName: null, reviewedAt: null, reviewerName: null,
  packetCreatedAt: d('2026-11-01'), firmId: 'f1', firmName: 'Halcyon Talent', ...o,
})
const doc = (o: Partial<DocRow> = {}): DocRow => ({
  key: 'NDA', status: 'SENT', sentAt: d('2026-11-02'), signedAt: null, fileName: null, examinedAt: null, examinerName: null,
  firmId: 'f1', firmName: 'Halcyon Talent', ...o,
})
const check = (o: Partial<CheckRow> = {}): CheckRow => ({
  status: 'CLEAR', providerSays: 'Clear: no records found', provider: 'Sterling', reference: 'ST-1', date: d('2026-11-03'), ...o,
})

describe('each paper on a contract line says what was asked, what arrived, who examined it and what is missing', () => {
  it('a paper asked by a request link says when it was asked and that the link was the way', () => {
    const f = paperFactsOf('NDA', { items: [item()], docs: [], check: null })
    expect(f.asked).toMatchObject({ when: d('2026-11-01'), via: 'REQUEST', firmName: 'Halcyon Talent' })
    expect(f.received).toBeNull()
    expect(f.examined).toBeNull()
  })

  it('a paper asked from the placement says when it was asked and that the ask on the paper was the way', () => {
    const f = paperFactsOf('NDA', { items: [], docs: [doc()], check: null })
    expect(f.asked).toMatchObject({ when: d('2026-11-02'), via: 'PAPER' })
  })

  it('where the paper was asked twice the later ask is the one read', () => {
    const f = paperFactsOf('NDA', { items: [item()], docs: [doc({ sentAt: d('2026-11-09') })], check: null })
    expect(f.asked).toMatchObject({ when: d('2026-11-09'), via: 'PAPER' })
  })

  it('a paper only about another type is never read into this one', () => {
    const f = paperFactsOf('NDA', { items: [item({ key: 'I9_EVERIFY', state: 'RECEIVED', receivedAt: d('2026-11-04') })], docs: [], check: null })
    expect(f.asked).toBeNull()
    expect(f.received).toBeNull()
  })
})

describe('a paper nobody has examined reads "Arrived, not examined" and is never counted as on file', () => {
  it('an upload nobody has looked at has arrived, with its file name, and examined says not examined', () => {
    const f = paperFactsOf('NDA', { items: [], docs: [doc({ status: 'UPLOADED', signedAt: d('2026-11-05'), fileName: 'nda.pdf' })], check: null })
    expect(f.received).toMatchObject({ when: d('2026-11-05'), fileName: 'nda.pdf' })
    expect(f.examined).toEqual({ state: 'NOT_EXAMINED', by: null, when: null, firmId: 'f1', firmName: 'Halcyon Talent' })
  })

  it('a request answer waiting for its checker reads not examined too', () => {
    const f = paperFactsOf('NDA', { items: [item({ state: 'RECEIVED', receivedAt: d('2026-11-04'), fileName: 'a.pdf' })], docs: [], check: null })
    expect(f.examined?.state).toBe('NOT_EXAMINED')
  })

  it('a paper somebody examined names who and when, and an accepted request item reads accepted', () => {
    const f = paperFactsOf('NDA', {
      items: [item({ state: 'ACCEPTED', receivedAt: d('2026-11-04'), reviewedAt: d('2026-11-06'), reviewerName: 'Dana Whitfield' })],
      docs: [], check: null,
    })
    expect(f.examined).toMatchObject({ state: 'ACCEPTED', by: 'Dana Whitfield', when: d('2026-11-06') })
  })

  it('a request item sent back reads sent back, with who sent it back', () => {
    const f = paperFactsOf('NDA', {
      items: [item({ state: 'REJECTED', receivedAt: d('2026-11-04'), reviewedAt: d('2026-11-06'), reviewerName: 'Dana Whitfield' })],
      docs: [], check: null,
    })
    expect(f.examined).toMatchObject({ state: 'SENT_BACK', by: 'Dana Whitfield' })
  })

  it('an uploaded paper with an examination on it reads accepted, with the examiner and the day', () => {
    const f = paperFactsOf('NDA', { items: [], docs: [doc({ status: 'UPLOADED', signedAt: d('2026-11-05'), examinedAt: d('2026-11-07'), examinerName: 'Dana Whitfield' })], check: null })
    expect(f.examined).toMatchObject({ state: 'ACCEPTED', by: 'Dana Whitfield', when: d('2026-11-07') })
  })

  it('an agreement that was signed is received and is not given an examination it never had', () => {
    const f = paperFactsOf('NDA', { items: [], docs: [doc({ status: 'SIGNED', signedAt: d('2026-11-05') })], check: null })
    expect(f.received).not.toBeNull()
    expect(f.examined).toBeNull()
  })
})

describe('a screening result shows the provider’s own word, name, reference and date', () => {
  it('a recorded verdict carries the provider’s words exactly as recorded', () => {
    const f = paperFactsOf('BACKGROUND_CHECK', { items: [], docs: [], check: check() })
    expect(f.verdict).toEqual({ word: 'Clear: no records found', provider: 'Sterling', reference: 'ST-1', date: d('2026-11-03') })
  })

  it('a check that was only ordered has no word yet and says so with null, never a made-up one', () => {
    const f = paperFactsOf('BACKGROUND_CHECK', { items: [], docs: [], check: check({ status: 'IN_PROGRESS', providerSays: null }) })
    expect(f.verdict?.word).toBeNull()
  })

  it('a paper that is not a screening never carries a verdict, even where a check row exists', () => {
    expect(paperFactsOf('NDA', { items: [], docs: [], check: check() }).verdict).toBeNull()
  })
})

describe('the papers view reads "on file" only from the contract checklist, and no second reader decides it', () => {
  it('adding the facts leaves every item’s state, owner and block exactly as the checklist gave them', () => {
    const items = [{ key: 'NDA', state: 'NEEDED', owedByRole: 'WORKER', blocks: false }]
    const out = attachPaperFacts(items, { NDA: paperFactsOf('NDA', { items: [item()], docs: [], check: null }) })
    expect(out[0]).toMatchObject({ key: 'NDA', state: 'NEEDED', owedByRole: 'WORKER', blocks: false })
    expect(out[0].asked).not.toBeNull()
  })

  it('an item with nothing read for it carries empty facts, not a missing field', () => {
    const out = attachPaperFacts([{ key: 'NDA', state: 'NEEDED' }], {})
    expect(out[0]).toMatchObject({ asked: null, received: null, examined: null, verdict: null })
  })

  it('the facts file never says whether a paper is on file, and has no boolean verdict on a person', () => {
    const src = readFileSync('src/lib/document-stages/line-paper-facts.ts', 'utf8')
    expect(src).not.toMatch(/onFile|ALREADY_HELD|cleared|overallVerdict/)
  })

  it('work authorization is given no waive control by the facts', () => {
    const src = readFileSync('src/lib/document-stages/line-paper-facts.ts', 'utf8')
    expect(src).not.toMatch(/waive/i)
  })
})

describe('the Ask button and the ask route agree on which line a paper is asked on', () => {
  it('the doors are read from a sell line only, and the ask route keeps a sell line only, so no ask is made from a buy line', () => {
    const arrived = readFileSync('src/lib/document-stages/arrived-papers.ts', 'utf8')
    const read = arrived.slice(arrived.indexOf('export async function arrivedOnLine'), arrived.indexOf('export async function paperDoorsForLine'))
    expect(read).toContain('db.sellContract.findUnique')
    expect(read).not.toContain('buyContract')
    const route = readFileSync('src/app/api/documents/route.ts', 'utf8')
    const ask = route.slice(route.indexOf("if (type === 'ask')"), route.indexOf("if (type === 'instance')"))
    expect(ask).toContain('prisma.sellContract.findFirst')
    const doors = readFileSync('src/lib/document-stages/paper-doors.ts', 'utf8')
    expect(doors).toMatch(/kind: 'ASK', label: `Ask \$\{first\(line\.personName\)\}`, contractId: line\.contractId/)
  })
})
