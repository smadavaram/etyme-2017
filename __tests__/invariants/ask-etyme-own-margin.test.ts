import { describe, it, expect, vi } from 'vitest'
import { respond, marginSays, marginRowsNamed, type Readers, type MarginRow } from '@/app/api/conversations/twin/ask'

/**
 * Release walk three, 2026-11-03: Brightmoor's Owner asked "Compare our
 * margin on Rajesh with Omar" and was told "Etyme never shows a firm’s
 * margin to anybody else", as if a stranger had asked. A firm's own
 * margin is its own to read where the seat holds margin.read, answered
 * from the figures Profitability already computes; refused only to a
 * seat that does not hold it, in a sentence naming who does.
 */
const row = (over: Partial<MarginRow>): MarginRow => ({
  personId: 'p', person: 'Rajesh Iyer', client: 'Northbend Athletic', live: true,
  spreadMinor: 3900, spreadPct: 30, spreadMissing: null,
  earnedMinor: 75920, earnedRevenueMinor: 520000, earnedPct: 14.6, currency: 'USD', href: '/dashboard/placements/s1', ...over,
})
const BOOK = [
  row({}),
  row({ personId: 'o', person: 'Omar Haddad', spreadMinor: 3600, spreadPct: 27.3, earnedMinor: 388368, earnedRevenueMinor: 3445200, earnedPct: 11.3, href: '/dashboard/placements/s2' }),
  row({ personId: 'd', person: 'Dmitri Eriksen', href: '/dashboard/placements/s3' }),
]
function readers(over: Partial<Readers> = {}): Readers {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
    model: async () => null, logPrompt: async () => undefined,
    ...over,
  } as Readers
}
const asFirm = (text: string, r: Readers) => respond(text, r, { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ['*'] })

describe('a firm reads its own margin', () => {
  it('the Owner of the firm that holds both reads its margin on Rajesh and Omar from Profitability’s own figures', async () => {
    const margins = vi.fn(async () => ({ ok: true as const, rows: BOOK }))
    const a = await asFirm('Compare our margin on Rajesh with Omar', readers({ margins }))
    expect(margins).toHaveBeenCalledTimes(1)
    if (a.kind !== 'LIST') throw new Error(`expected a list, got ${JSON.stringify(a)}`)
    expect(a.says).toBe('From Profitability: Rajesh Iyer at Northbend Athletic: $39.00 an hour agreed (30%), $759.20 made on $5,200.00 billed (14.6%); Omar Haddad at Northbend Athletic: $36.00 an hour agreed (27.3%), $3,883.68 made on $34,452.00 billed (11.3%). Checked just now.')
    expect(a.table?.rows.map((r) => r.cells[0])).toEqual(['Rajesh Iyer', 'Omar Haddad'])
    expect(a.links).toEqual([{ label: 'Open Profitability', href: '/dashboard/profitability' }])
    expect(a.says).not.toContain('never shows a firm')
  })

  it('a seat that does not hold margin.read is refused in the sentence that names who reads it', async () => {
    const says = 'Your Owner or Admin reads what your placements earn; ask them.'
    const a = await asFirm('What is our margin on Rajesh?', readers({ margins: async () => ({ ok: false as const, says }) }))
    expect(a).toEqual({ kind: 'TEXT', says })
  })

  it('a client asking about margin is still refused: a supplier’s margin is never shown to the firm that pays it', async () => {
    const margins = vi.fn(async () => ({ ok: true as const, rows: BOOK }))
    const a = await respond('What margin does Brightmoor make on Rajesh?', readers({ margins }), { env: {}, party: 'CLIENT', companyKind: 'CLIENT', ownCompany: 'Northbend Athletic', permissions: ['*'] })
    expect(margins).not.toHaveBeenCalled()
    expect(a.kind === 'TEXT' && a.says).toMatch(/^(Etyme never shows a firm’s margin|I answer only about your company’s own)/)
  })

  it('where Profitability cannot say what a placement cost, the answer says so and gives no figure for what it made', () => {
    const says = marginSays([row({ earnedMinor: null, earnedPct: null })], { named: true })
    expect(says).toContain('what it costs is not on the record, so what it made is not said')
    expect(says).not.toContain('made on')
  })

  it('a margin question that names nobody reads the whole book, three by name and the rest counted', () => {
    expect(marginRowsNamed('What is our margin?', BOOK)).toEqual([])
    const four = [...BOOK, row({ personId: 'x', person: 'Lena Brook' })]
    expect(marginSays(four)).toMatch(/^Your margin, from Profitability: Rajesh Iyer .*Dmitri Eriksen .*\. And one more on Profitability\. Checked just now\.$/)
  })
})
