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
