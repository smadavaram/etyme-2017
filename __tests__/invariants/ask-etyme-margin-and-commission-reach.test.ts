import { describe, it, expect, vi } from 'vitest'
import { respond, readAsk, type Readers, type MarginRow } from '@/app/api/conversations/twin/ask'
import { scopeLine, asksFirmWide } from '@/app/api/conversations/twin/access'
import {
  readCommission, commissionAnswer, othersRefusal, CLIENT_COMMISSION_REFUSAL,
  type CommissionRead, type CommissionLine,
} from '@/app/api/conversations/twin/commission-answer'

/**
 * The Owner decides who sees what (founder, 2026-11-08), and commission is
 * a row on the line it is earned on (the same day). Ask Etyme answers a
 * team's margin with that team's figures only, refuses the firm's in one
 * sentence that names the reach, and answers "what did I earn in
 * commission" from money's rows for the seat's own person.
 */

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
const asFirm = (text: string, r: Readers) =>
  respond(text, r, { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ['margin.read'] })

const DAYTON: MarginRow = {
  personId: 'p-raj', person: 'Rajesh Iyer', client: 'Northbend Athletic', live: true,
  spreadMinor: 3900, spreadPct: 30, spreadMissing: null,
  earnedMinor: 75920, earnedRevenueMinor: 520000, earnedPct: 14.6, currency: 'USD', href: '/dashboard/placements/s1',
}
const DAYTON_LINE = scopeLine('margin.read', 'UNIT', ['Dayton'])!

describe('margin read under the Owner’s grants', () => {
  it('a seat given margin on the Dayton team is answered with the Dayton team’s figures only, and told its reach', async () => {
    // Profitability's own read is narrowed at the query; the chat shows what it returns and nothing more.
    const margins = vi.fn(async () => ({ ok: true as const, rows: [DAYTON] }))
    const a = await asFirm('What is our margin?', readers({ margins, scopeLine: async () => DAYTON_LINE }))
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.table?.rows.map((r) => r.cells[0])).toEqual(['Rajesh Iyer'])
    expect(a.says.endsWith('You read margin for the Dayton team; ask the Owner for the firm’s.')).toBe(true)
  })

  it('asked for the firm’s figure, a seat that reads one team is refused in one sentence that names the scope', async () => {
    const margins = vi.fn(async () => ({ ok: true as const, rows: [DAYTON] }))
    const a = await asFirm('What is the firm’s margin?', readers({ margins, scopeLine: async () => DAYTON_LINE }))
    expect(a).toEqual({
      kind: 'TEXT',
      says: 'You read margin for the Dayton team; ask the Owner for the firm’s.',
      links: [{ label: 'Open Profitability', href: '/dashboard/profitability' }],
    })
    // Nothing is read for a figure the seat may not see.
    expect(margins).not.toHaveBeenCalled()
  })

  it('“our total margin”, “margin across the company” and “every team” are each the firm’s figure', () => {
    for (const q of ['what is our total margin', 'margin across the company this month', 'show me margin for every team', 'the whole firm’s profit', 'company-wide margin']) {
      expect(asksFirmWide(q.toLowerCase())).toBe(true)
    }
    for (const q of ['what is our margin?', 'what is our margin on rajesh?', 'margin for the dayton team']) {
      expect(asksFirmWide(q)).toBe(false)
    }
  })

  it('the firm’s figure asked by consultant is refused the same way, before Profitability is read', async () => {
    const marginCut = vi.fn()
    const a = await asFirm('Which consultant made the whole firm the most this month?', readers({ marginCut, scopeLine: async () => DAYTON_LINE }))
    expect(a.kind === 'TEXT' && a.says).toBe('You read margin for the Dayton team; ask the Owner for the firm’s.')
    expect(marginCut).not.toHaveBeenCalled()
  })

  it('a seat that reads the firm’s margin is answered with the firm’s figure when it asks for it', async () => {
    const a = await asFirm('What is the firm’s margin?', readers({ margins: async () => ({ ok: true as const, rows: [DAYTON] }), scopeLine: async () => null }))
    expect(a.kind).toBe('LIST')
  })

  it('a seat with no grant at all is refused as today, naming who reads it', async () => {
    const says = 'Your Owner or Finance reads what your placements earn; ask the Owner to give you access.'
    const a = await asFirm('What is the firm’s margin?', readers({ margins: async () => ({ ok: false as const, says }), scopeLine: async () => null }))
    expect(a).toEqual({ kind: 'TEXT', says })
  })
})

// ── Commission ────────────────────────────────────────────────────────

const ME = 'p-dana'
const line = (over: Partial<CommissionLine>): CommissionLine => ({
  earnedById: ME, earnedBy: 'Dana Whitfield', kind: 'RECRUITING', person: 'Rajesh Iyer', client: 'Northbend Athletic',
  amountMinor: 64000, currency: 'USD', blankedBecause: null, ...over,
})
const read = (over: Partial<CommissionRead> = {}): CommissionRead => ({
  reach: 'OWN', from: '2026-11-01', to: '2026-11-30', selfId: ME,
  readers: ['Owner', 'Contract Manager', 'AP & Payroll'],
  rows: [line({}), line({ kind: 'SALES', person: 'Omar Haddad', amountMinor: 60000 })],
  ...over,
})
const asAt = (text: string, r: Readers, party: 'FIRM' | 'CLIENT' = 'FIRM') =>
  respond(text, r, { env: {}, party, companyKind: party === 'CLIENT' ? 'CLIENT' : 'VENDOR', ownCompany: party === 'CLIENT' ? 'Northbend Athletic' : 'Brightmoor Staffing', permissions: [] })

describe('commission in Ask Etyme', () => {
  it('“What did I earn in commission this period?” is answered from money’s rows for the seat’s own person, with the total and each line', async () => {
    const commissions = vi.fn(async () => ({ ok: true as const, ...read() }))
    const a = await asAt('What did I earn in commission this period?', readers({ commissions }))
    expect(commissions).toHaveBeenCalledTimes(1)
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.says).toBe('For Nov 1 – Nov 30 you have earned $1,240.00 in commission: a recruiting commission on Rajesh Iyer at Northbend Athletic, $640.00; a sales commission on Omar Haddad at Northbend Athletic, $600.00. Checked just now.')
  })

  it('a commission money cannot stand behind is said as not worked out, with money’s reason, and is never added into the total', () => {
    const a = commissionAnswer(read({ rows: [line({}), line({ kind: 'SALES', person: 'Omar Haddad', amountMinor: null, blankedBecause: 'The employer has not accepted the week yet.' })] }), { whose: 'OWN' })
    expect(a.says).toContain('you have earned $640.00 in commission')
    expect(a.says).toContain('a sales commission on Omar Haddad at Northbend Athletic, not worked out because the employer has not accepted the week yet')
  })

  it('two currencies are never added into one figure', () => {
    const a = commissionAnswer(read({ rows: [line({}), line({ person: 'Aoife Kelly', amountMinor: 30000, currency: 'EUR' })] }), { whose: 'OWN' })
    expect(a.says).toMatch(/you have earned \$640\.00 and €300\.00 in commission/)
  })

  it('a seat with no commission rows is told so plainly, with no figure', () => {
    expect(commissionAnswer(read({ rows: [] }), { whose: 'OWN' }).says).toBe('You have no commission on the record for Nov 1 – Nov 30. Checked just now.')
  })

  it('asking for another person’s commissions from a seat that reads only its own is refused, naming who may read them', async () => {
    const a = await asAt('What did Ruth Ellis earn in commission?', readers({ commissions: async () => ({ ok: true as const, ...read() }), vocabulary: async () => ({ people: ['Ruth Ellis'], firms: [] }) }))
    expect(a).toEqual({ kind: 'TEXT', says: 'What other people earn in commission is read by your Owner, Contract Manager or AP & Payroll; ask them. You can ask what you earned.' })
    expect(othersRefusal([])).toBe('What other people earn in commission is read by the Owner; ask them. You can ask what you earned.')
  })

  it('a seat that reads the firm’s commissions is answered for the person it names, and only that person', () => {
    const rows = [line({}), line({ earnedById: 'p-ruth', earnedBy: 'Ruth Ellis', kind: 'SALES', person: 'Omar Haddad', amountMinor: 52000 })]
    const a = commissionAnswer(read({ reach: 'FIRM', rows }), { whose: 'OTHERS', name: 'Ruth' })
    expect(a.says).toBe('For Nov 1 – Nov 30 Ruth Ellis earned $520.00 in commission: a sales commission on Omar Haddad at Northbend Athletic, $520.00. Checked just now.')
    expect(a.rows.map((r) => r.earnedBy)).toEqual(['Ruth Ellis'])
  })

  it('asking about yourself by name is your own commission, never refused', () => {
    const a = commissionAnswer(read(), { whose: 'OTHERS', name: 'Dana Whitfield' })
    expect(a.says).toMatch(/^For Nov 1 – Nov 30 you have earned \$1,240\.00/)
  })

  it('a client never hears a supplier’s commissions, and nothing is read', async () => {
    const commissions = vi.fn()
    const a = await asAt('What commission does Brightmoor pay its recruiters?', readers({ commissions }), 'CLIENT')
    expect(a).toEqual({ kind: 'TEXT', says: CLIENT_COMMISSION_REFUSAL })
    expect(commissions).not.toHaveBeenCalled()
  })

  it('commission questions are read as commission, whose they are, and never as the margin cut or a page', () => {
    expect(readAsk('What did I earn in commission this period?')).toEqual({ kind: 'COMMISSION', asked: { whose: 'OWN' } })
    expect(readAsk('my commissions this month')).toEqual({ kind: 'COMMISSION', asked: { whose: 'OWN' } })
    expect(readAsk('Which recruiter earned the most commission?')).toEqual({ kind: 'COMMISSION', asked: { whose: 'OTHERS', name: null } })
    expect(readCommission('What did Ruth earn in commission?')).toEqual({ whose: 'OTHERS', name: 'Ruth' })
    expect(readCommission('Show me Ruth Ellis’s commission')).toEqual({ whose: 'OTHERS', name: 'Ruth Ellis' })
    expect(readAsk('Where are commissions?').kind).toBe('WHERE')
    expect(readCommission('What is our margin?')).toBeNull()
  })
})

// ── The period a person names, and a name that is not a firm ─────────

import { periodAsked, mergeMonths } from '@/app/api/conversations/twin/commission-answer'
import { anotherFirmsMoney, anotherFirmsMoneyOnRecord } from '@/app/api/conversations/twin/transaction'

const NOV_8 = new Date('2026-11-08T12:00:00Z')

describe('commission for the period the person names', () => {
  it('no period named is this month, said with its days', () => {
    expect(periodAsked('What did I earn in commission?', NOV_8)).toEqual({ kind: 'MONTHS', months: [{ y: 2026, m: 10 }], words: 'this month', from: '2026-11-01', to: '2026-11-30' })
  })

  it('“last month”, “in October”, “this quarter” and “so far this year” are read as money’s months, each its own pay period', () => {
    expect(periodAsked('my commission last month', NOV_8)).toMatchObject({ months: [{ y: 2026, m: 9 }], words: 'last month', from: '2026-10-01', to: '2026-10-31' })
    expect(periodAsked('What did I earn in commission in October?', NOV_8)).toMatchObject({ months: [{ y: 2026, m: 9 }], words: 'October 2026' })
    expect(periodAsked('my commission in December', NOV_8)).toMatchObject({ months: [{ y: 2025, m: 11 }], words: 'December 2025' })
    expect(periodAsked('my commission this quarter', NOV_8)).toMatchObject({ months: [{ y: 2026, m: 9 }, { y: 2026, m: 10 }], words: 'this quarter so far', from: '2026-10-01', to: '2026-11-30' })
    const year = periodAsked('commission so far this year', NOV_8)
    expect(year).toMatchObject({ words: 'so far this year', from: '2026-01-01', to: '2026-11-30' })
    expect(year.kind === 'MONTHS' && year.months.length).toBe(11)
  })

  it('a period that has not started, or one shorter than a month, is said as such and never given a figure', () => {
    expect(periodAsked('my commission next month', NOV_8).kind).toBe('CANNOT')
    expect(periodAsked('my commission in December 2026', NOV_8)).toEqual({ kind: 'CANNOT', says: 'December 2026 has not started, so no commission is earned in it yet.' })
    expect(periodAsked('my commission this week', NOV_8)).toMatchObject({ kind: 'CANNOT', says: expect.stringMatching(/^Commission is worked out by the month/) })
  })

  it('“May I see my commission?” is not read as the month of May', () => {
    expect(periodAsked('May I see my commission?', NOV_8)).toMatchObject({ words: 'this month' })
  })

  it('the answer says which period its figure is for', async () => {
    const commissions = vi.fn(async (when?: { words: string; from: string; to: string }) => ({ ok: true as const, ...read({ from: when!.from, to: when!.to, periodWords: when!.words }) }))
    const a = await respond('What did I earn in commission last month?', readers({ commissions }), { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: [], now: NOV_8 })
    expect(commissions.mock.calls[0][0]).toMatchObject({ words: 'last month' })
    expect(a.kind === 'LIST' && a.says).toMatch(/^For last month \(Oct 1 – Oct 31\) you have earned \$1,240\.00 in commission/)
  })

  it('a period that has not started is answered before anything is read', async () => {
    const commissions = vi.fn()
    const a = await respond('What will I earn in commission next month?', readers({ commissions }), { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: [], now: NOV_8 })
    expect(a.kind === 'TEXT' && a.says).toMatch(/has not started/)
    expect(commissions).not.toHaveBeenCalled()
  })

  it('a row read over several months adds its months up, and a month money could not work out leaves the period not worked out, never a partial sum', () => {
    const oct = [line({ rowId: 'r1', amountMinor: 40000 }), line({ rowId: 'r2', kind: 'SALES', amountMinor: 10000 })]
    const nov = [line({ rowId: 'r1', amountMinor: 24000 }), line({ rowId: 'r2', kind: 'SALES', amountMinor: null, blankedBecause: 'The employer has not accepted the week yet.' })]
    const merged = mergeMonths([oct, nov])
    expect(merged.find((l) => l.rowId === 'r1')!.amountMinor).toBe(64000)
    expect(merged.find((l) => l.rowId === 'r2')).toMatchObject({ amountMinor: null, blankedBecause: 'The employer has not accepted the week yet.' })
  })
})

describe('a firm is recognized by the record, never by capitals', () => {
  it('a colleague missing from the reader’s people list is not read as a firm, so her commission gets the commission refusal', async () => {
    const a = await asAt('What did Ruth Ellis earn in commission?', readers({ commissions: async () => ({ ok: true as const, ...read() }), firmOnRecord: async () => false }))
    expect(a).toEqual({ kind: 'TEXT', says: 'What other people earn in commission is read by your Owner, Contract Manager or AP & Payroll; ask them. You can ask what you earned.' })
  })

  it('a firm on Etyme’s record that the reader does not trade with is still another company’s book', async () => {
    expect(await anotherFirmsMoneyOnRecord('What does Pinnacle Resourcing pay its people?', 'Techpeple', { people: [], firms: [] }, async (n) => n === 'Pinnacle Resourcing')).toBe(true)
  })

  it('an unknown capitalized name is not a firm by the words alone, but a legal form still is', () => {
    expect(anotherFirmsMoney('What does Ruth Ellis pay?', 'Techpeple', { people: [], firms: [] })).toBe(false)
    expect(anotherFirmsMoney('What does Halden Systems Inc pay its people?', 'Techpeple', { people: [], firms: [] })).toBe(true)
  })
})
