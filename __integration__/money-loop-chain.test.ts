/**
 * The money loop against Postgres (Flow B, 2026-11-21 → 105, 107).
 * Builds its own small firm on reserved domains, so nothing depends on
 * which seeded row is first.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { recordTimeline } from '@/lib/record-ledger'
import { decideDecision } from '@/lib/decision-items'
import {
  openChain, advanceChain, resolveDispute, loadClosedChain, chainsForPeriod, periodSummary, chainForPlacement, CHAIN_RECORD,
} from '@/lib/money/money-chain'

const tag = `mc${Date.now()}`
const w: Record<string, any> = {}
const usd = (cents: number) => ({ cents, currency: 'USD' })

async function person(name: string) {
  return prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
}
async function placement(who: any) {
  return prisma.sellContract.create({ data: { companyId: w.firm.id, clientCompanyId: w.client.id, personId: who.id, billRate: 10000, startDate: new Date('2026-09-01') } })
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Chain Firm ${tag}`, slug: `chain-firm-${tag}`, kind: 'VENDOR' } })
  w.client = await prisma.company.create({ data: { name: `Chain Client ${tag}`, slug: `chain-client-${tag}`, kind: 'CLIENT' } as any })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Chain Firm LLC', country: 'US', currency: 'USD' } })
  const ownerRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'Owner', permissions: ['*'] } })
  const payRole = await prisma.role.create({ data: { companyId: w.firm.id, name: 'AP & Payroll', permissions: [] } })
  w.owner = await person('Dana Owner'); w.clerk = await person('Ravi Payroll')
  for (const [p, r] of [[w.owner, ownerRole], [w.clerk, payRole]]) {
    await prisma.context.create({ data: { personId: p.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: r.id } as any })
  }
  w.ana = await person('Ana Consultant'); w.ben = await person('Ben Consultant'); w.cy = await person('Cy Consultant')
  w.anaLine = await placement(w.ana); w.benLine = await placement(w.ben); w.cyLine = await placement(w.cy)
})

const clerk = () => ({ companyId: w.firm.id, actingEntityId: w.entity.id, personId: w.clerk.id, heldAs: 'AP & Payroll' })
const dec = { start: new Date('2026-12-01'), end: new Date('2026-12-31') }
// The day each act below is done on, said out loud, so nothing here depends on the day the file runs.
const IN_DEC = new Date('2026-12-10')

describe('the money chain, on the database', () => {
  it('a live chain opens at timesheet owed for the placement’s own consultant', async () => {
    w.chain = await openChain({ ...clerk(), sellContractId: w.anaLine.id, periodStart: dec.start, periodEnd: dec.end }, IN_DEC)
    expect([w.chain.state, w.chain.personId]).toEqual(['TIMESHEET_OWED', w.ana.id])
  })

  it('a placement has one chain per period', async () => {
    await expect(openChain({ ...clerk(), sellContractId: w.anaLine.id, periodStart: dec.start, periodEnd: dec.end }, IN_DEC)).rejects.toThrow(/already has that month on record/)
  })

  it('a timesheet cannot be marked received without the amount it states', async () => {
    await expect(advanceChain({ ...clerk(), chainId: w.chain.id, to: 'TIMESHEET_RECEIVED', disputeOwnerPersonId: w.owner.id })).rejects.toThrow(/the timesheet states/)
  })

  it('a chain moves one state at a time and never backward', async () => {
    await expect(advanceChain({ ...clerk(), chainId: w.chain.id, to: 'RECONCILED', disputeOwnerPersonId: w.owner.id })).rejects.toThrow(/one state at a time/)
    await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'TIMESHEET_RECEIVED', stated: usd(1600000), disputeOwnerPersonId: w.owner.id })
    const now = await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'RECONCILED', disputeOwnerPersonId: w.owner.id })
    expect(now.state).toBe('RECONCILED')
    await expect(advanceChain({ ...clerk(), chainId: w.chain.id, to: 'TIMESHEET_RECEIVED', stated: usd(1), disputeOwnerPersonId: w.owner.id })).rejects.toThrow(/never back/)
  })

  it('two stated amounts that disagree dispute the chain and open a decision with an owner', async () => {
    const d = await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'INVOICED', stated: usd(1590000), disputeOwnerPersonId: w.owner.id })
    expect([d.state, d.stateBeforeDispute]).toEqual(['DISPUTED', 'RECONCILED'])
    const item = await prisma.decisionItem.findUniqueOrThrow({ where: { id: d.disputeDecisionId! } })
    expect(item.ownerPersonId).toBe(w.owner.id)
    expect(item.proof).toMatch(/\$16,000\.00.*\$15,900\.00/)
    expect(item.proofLinks).toEqual([{ recordType: CHAIN_RECORD, recordId: w.chain.id }])
    // One proposed course, the one taken when the month returns; the amounts are in the proof, never in the question.
    expect(item.question).toBe('Ana Consultant, December 2026: the invoiced amount differs from the timesheet’s. Keep the timesheet’s amount and state the invoiced amount again?')
    w.decision = item
  })

  it('a disputed chain cannot advance until its decision is recorded', async () => {
    await expect(advanceChain({ ...clerk(), chainId: w.chain.id, to: 'INVOICED', stated: usd(1600000), disputeOwnerPersonId: w.owner.id })).rejects.toThrow(/disputed/)
    await expect(resolveDispute({ ...clerk(), chainId: w.chain.id })).rejects.toThrow(/still open/)
    const list = await chainsForPeriod(w.firm.id, dec.start)
    expect(list.find((c) => c.chainId === w.chain.id)?.openDisputeDecisionId).toBe(w.decision.id)
    await decideDecision({ companyId: w.firm.id, actingEntityId: w.entity.id, decisionId: w.decision.id, verdict: 'REJECT', note: 'The invoice was short a day.', personId: w.owner.id, heldAs: 'Owner' })
    const back = await resolveDispute({ ...clerk(), chainId: w.chain.id })
    expect([back.state, back.invoicedAmountCents, back.disputeDecisionId]).toEqual(['RECONCILED', null, null])
    const on = await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'INVOICED', stated: usd(1600000), disputeOwnerPersonId: w.owner.id })
    expect(on.state).toBe('INVOICED')
  })

  it('a chain closes only when the amount paid agrees with the other two', async () => {
    await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'PAYMENT_PENDING', disputeOwnerPersonId: w.owner.id })
    await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'PAID_UNCONFIRMED', stated: usd(1600000), disputeOwnerPersonId: w.owner.id })
    const closed = await advanceChain({ ...clerk(), chainId: w.chain.id, to: 'CONFIRMED_CLOSED', disputeOwnerPersonId: w.owner.id })
    expect(closed.state).toBe('CONFIRMED_CLOSED')
  })

  it('every move is on the chain’s ledger with the entity, the person and the role she held', async () => {
    const rows = await recordTimeline(w.firm.id, CHAIN_RECORD, w.chain.id)
    expect(rows.map((r) => r.action)).toEqual(['OPENED', 'ADVANCED', 'ADVANCED', 'DISPUTED', 'DISPUTE_RESOLVED', 'ADVANCED', 'ADVANCED', 'ADVANCED', 'ADVANCED'])
    for (const r of rows) expect([r.actingEntityId, r.personId, r.heldAs]).toEqual([w.entity.id, w.clerk.id, 'AP & Payroll'])
  })

  it('a chain loaded as history is closed, says its source and its as-of day, and its ledger rows carry today’s date', async () => {
    const before = Date.now() - 1000
    const h = await loadClosedChain({ ...clerk(), sellContractId: w.anaLine.id, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), source: 'October payroll sheet', asOf: new Date('2026-11-15'), amounts: { timesheet: usd(1500000), invoiced: usd(1500000), paid: usd(1500000) } }, IN_DEC)
    expect([h.state, h.source, h.asOf?.toISOString().slice(0, 10)]).toEqual(['CONFIRMED_CLOSED', 'October payroll sheet', '2026-11-15'])
    const rows = await recordTimeline(w.firm.id, CHAIN_RECORD, h.id)
    expect(rows).toHaveLength(7)
    for (const r of rows) {
      expect(r.createdAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(r.summary).toMatch(/Loaded as history on .*as of Nov 15, 2026, from October payroll sheet/)
    }
  })

  it('each of the seven rows of a history load says its own state, and the three that state an amount say the amount', async () => {
    const h = await prisma.moneyChain.findFirstOrThrow({ where: { sellContractId: w.anaLine.id, periodStart: new Date('2026-10-01') } })
    const said = (await recordTimeline(w.firm.id, CHAIN_RECORD, h.id)).map((r) => r.summary.split(' Loaded as history')[0])
    expect(said).toEqual([
      'Timesheet owed.', 'Timesheet received: $15,000.00 stated on the timesheet.', 'Reconciled.', 'Invoiced: $15,000.00 was invoiced.',
      'Payment pending.', 'Paid, not confirmed: $15,000.00 was paid.', 'Confirmed and closed.',
    ])
  })

  it('a month that has not begun cannot be opened, and nothing is written for it', async () => {
    const jun = { periodStart: new Date('2027-06-01'), periodEnd: new Date('2027-06-30') }
    await expect(openChain({ ...clerk(), sellContractId: w.benLine.id, ...jun }, IN_DEC)).rejects.toThrow('June 2027 has not begun. It can be started from Jun 1, 2027.')
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.benLine.id, periodStart: jun.periodStart } })).toBe(0)
  })

  it('a month that has not ended cannot be saved as paid and closed, and a past one is not true on a day before its last', async () => {
    const amounts = { timesheet: usd(100), invoiced: usd(100), paid: usd(100) }
    const load = (periodStart: string, periodEnd: string, asOf: string) =>
      loadClosedChain({ ...clerk(), sellContractId: w.benLine.id, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd), source: 'the payroll sheet', asOf: new Date(asOf), amounts }, IN_DEC)
    await expect(load('2027-06-01', '2027-06-30', '2026-12-01')).rejects.toThrow(/^June 2027 has not ended/)
    await expect(load('2026-12-01', '2026-12-31', '2026-12-05')).rejects.toThrow(/^December 2026 has not ended/)
    await expect(load('2026-09-01', '2026-09-30', '2026-09-15')).rejects.toThrow('The day this history was true cannot be before the month’s last day, Sep 30, 2026.')
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.benLine.id } })).toBe(0)
  })

  it('a historical chain whose three amounts disagree cannot be loaded as closed', async () => {
    await expect(loadClosedChain({ ...clerk(), sellContractId: w.benLine.id, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), source: 'October payroll sheet', asOf: new Date('2026-11-15'), amounts: { timesheet: usd(100), invoiced: usd(100), paid: usd(99) } }, IN_DEC))
      .rejects.toThrow(/cannot close/)
    expect(await prisma.moneyChain.count({ where: { sellContractId: w.benLine.id } })).toBe(0)
  })

  it('the period total never adds two currencies', async () => {
    const b = await openChain({ ...clerk(), sellContractId: w.benLine.id, periodStart: dec.start, periodEnd: dec.end }, IN_DEC)
    await advanceChain({ ...clerk(), chainId: b.id, to: 'TIMESHEET_RECEIVED', stated: { cents: 50000000, currency: 'INR' }, disputeOwnerPersonId: w.owner.id })
    await openChain({ ...clerk(), sellContractId: w.cyLine.id, periodStart: dec.start, periodEnd: dec.end }, IN_DEC)
    const s = await periodSummary(w.firm.id, dec.start)
    expect(s.statedTotals.map((t) => [t.currency, t.cents, t.label])).toEqual([['INR', 50000000, 'stated'], ['USD', 1600000, 'stated']])
    expect(s.counts).toMatchObject({ CONFIRMED_CLOSED: 1, TIMESHEET_RECEIVED: 1, TIMESHEET_OWED: 1 })
    expect(s.notStated).toBe(1)
  })

  it('a placement reads its current period’s chain and its history with their ledgers', async () => {
    const p = await chainForPlacement(w.firm.id, w.anaLine.id, new Date('2026-12-10'))
    expect(p.current?.chain.id).toBe(w.chain.id)
    expect(p.history.map((h) => h.chain.source)).toEqual(['October payroll sheet'])
    expect(p.history[0].ledger).toHaveLength(7)
  })

  it('a chain is never disputed without its decision, and a decision never opened without its disputed chain', async () => {
    const nov = { start: new Date('2026-11-01'), end: new Date('2026-11-30') }
    const c = await openChain({ ...clerk(), sellContractId: w.cyLine.id, periodStart: nov.start, periodEnd: nov.end }, IN_DEC)
    await advanceChain({ ...clerk(), chainId: c.id, to: 'TIMESHEET_RECEIVED', stated: usd(800000), disputeOwnerPersonId: w.owner.id })
    await advanceChain({ ...clerk(), chainId: c.id, to: 'RECONCILED', disputeOwnerPersonId: w.owner.id })
    // A dispute owed by somebody on the bench cannot open its decision, so the chain does not move either.
    const bench = await person('Bo Bench')
    await prisma.context.create({ data: { personId: bench.id, companyId: w.firm.id, type: 'CONSULTANT' } as any })
    await expect(advanceChain({ ...clerk(), chainId: c.id, to: 'INVOICED', stated: usd(790000), disputeOwnerPersonId: bench.id })).rejects.toThrow(/working seat/)
    const still = await prisma.moneyChain.findUniqueOrThrow({ where: { id: c.id } })
    expect([still.state, still.invoicedAmountCents, still.disputeDecisionId]).toEqual(['RECONCILED', null, null])
    const linked = async () => (await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } })).filter((d) => (d.proofLinks as any[]).some((l) => l.recordId === c.id))
    expect(await linked()).toHaveLength(0)
    // Owed by a working seat, the dispute and its decision are written together.
    const d = await advanceChain({ ...clerk(), chainId: c.id, to: 'INVOICED', stated: usd(790000), disputeOwnerPersonId: w.owner.id })
    const items = await linked()
    expect(items.map((i) => i.id)).toEqual([d.disputeDecisionId])
    expect(d.state).toBe('DISPUTED')
  })
})
