import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  payersRole, payersAcceptanceOn, payersAcceptance, type PayableWeek,
} from '@/lib/money/payers-acceptance'
import { matchVendorBill } from '@/lib/three-way-match'

/**
 * A supplier's invoice is matched against what the firm paying it
 * accepted — its own signature on the week, and nobody else's.
 *
 * Northbend Athletic ← Computer Systems ← CloudEPA, Helena Marsh. The
 * week is filed on CloudEPA's contract. Computer Systems pays CloudEPA
 * and accepts as PASS_THROUGH; CloudEPA pays Helena and accepts as
 * EMPLOYER_ACCEPTANCE. Before this, the match read only the employer's
 * acceptance, so CloudEPA's own signature stood behind CloudEPA's own
 * invoice.
 */

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DAYS = { '2026-09-14': 8, '2026-09-15': 8, '2026-09-16': 8, '2026-09-17': 8, '2026-09-18': 8 }

// Computer Systems' buy contract from CloudEPA, and the link on Computer
// Systems' own sell contract to Northbend that says when it was in force.
const CS_BUY = 'cs-buys-from-cloudepa'
const CS_LINKS = [{ buyContractId: CS_BUY, sellContractId: 'cs-sells-to-northbend', effectiveFrom: D('2026-03-01'), effectiveTo: null }]

function helenasWeek(
  signed: { companyId: string; role: string; hours: number; rateCents: number }[],
  over: Partial<PayableWeek> = {}
): PayableWeek {
  return {
    id: 'helena-week',
    periodStart: D('2026-09-14'),
    periodEnd: D('2026-09-18'),
    days: DAYS,
    sellContract: {
      companyId: 'cloudepa', clientCompanyId: 'cs', endClientCompanyId: 'northbend',
      buyLinks: [{ buyContractId: 'cloudepa-w2', sellContractId: 'cloudepa-sells-to-cs', effectiveFrom: D('2026-03-01'), effectiveTo: null }],
    },
    assertions: signed,
    ...over,
  }
}

const NORTHBEND = { companyId: 'northbend', role: 'CLIENT_APPROVAL', hours: 40, rateCents: 14500 }
const CS_ACCEPTS = (hours: number) => ({ companyId: 'cs', role: 'PASS_THROUGH', hours, rateCents: 11800 })
const CLOUDEPA_ACCEPTS = (hours: number) => ({ companyId: 'cloudepa', role: 'EMPLOYER_ACCEPTANCE', hours, rateCents: 9000 })

describe('a supplier’s invoice is matched against the paying firm’s own acceptance', () => {
  it('the firm in the middle of a chain pays on its pass-through acceptance, because the hours sit on its supplier’s contract', () => {
    expect(payersRole('cs', helenasWeek([]))).toBe('PASS_THROUGH')
  })

  it('a firm that carries its person’s hours on its own contract pays on its employer acceptance, as it always has', () => {
    expect(payersRole('cloudepa', helenasWeek([]))).toBe('EMPLOYER_ACCEPTANCE')
  })

  it('CloudEPA’s acceptance of what it pays Helena never stands in for Computer Systems accepting what it pays CloudEPA', () => {
    const week = helenasWeek([NORTHBEND, CLOUDEPA_ACCEPTS(40)])
    expect(payersAcceptanceOn('cs', week)).toBeNull()
    expect(payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [week], payerLinks: CS_LINKS })).toBeNull()
  })

  it('the client’s approval never stands in for the paying firm’s acceptance either', () => {
    const week = helenasWeek([NORTHBEND])
    expect(payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [week], payerLinks: CS_LINKS })).toBeNull()
  })

  it('a week Computer Systems has accepted is matched at the hours Computer Systems accepted, not the hours CloudEPA accepted', () => {
    const week = helenasWeek([NORTHBEND, CS_ACCEPTS(38), CLOUDEPA_ACCEPTS(40)])
    const ours = payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [week], payerLinks: CS_LINKS })
    expect(ours).toMatchObject({ hours: 38, count: 1, waiting: 0, firstRateCents: 11800 })
    expect(ours!.firstDay).toEqual(D('2026-09-14'))
    expect(ours!.lastDay).toEqual(D('2026-09-18'))
  })

  it('a week the paying firm has not accepted adds no hours, and is counted as waiting rather than priced', () => {
    const accepted = helenasWeek([NORTHBEND, CS_ACCEPTS(40)])
    const notYet = helenasWeek([NORTHBEND], { id: 'next-week', periodStart: D('2026-09-21'), periodEnd: D('2026-09-25'), days: {} })
    const ours = payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [accepted, notYet], payerLinks: CS_LINKS })
    expect(ours).toMatchObject({ hours: 40, count: 1, waiting: 1 })
    expect(ours!.lastDay).toEqual(D('2026-09-18'))
  })

  it('on a supplier’s contract, only the days the buy contract being billed was in force are its hours', () => {
    // Computer Systems swapped buy contracts on Wednesday the 16th.
    const links = [
      { buyContractId: CS_BUY, sellContractId: 'cs-sells-to-northbend', effectiveFrom: D('2026-03-01'), effectiveTo: D('2026-09-15') },
      { buyContractId: 'cs-new-buy', sellContractId: 'cs-sells-to-northbend', effectiveFrom: D('2026-09-16'), effectiveTo: null },
    ]
    const week = helenasWeek([CS_ACCEPTS(40)])
    const ours = payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [week], payerLinks: links })
    expect(ours!.hours).toBe(16)
  })

  it('on a supplier’s contract with no link on record, every hour there is the buy contract’s, because that contract is the only one it buys', () => {
    const week = helenasWeek([CS_ACCEPTS(40)])
    const ours = payersAcceptance({ payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [week], payerLinks: [] })
    expect(ours!.hours).toBe(40)
  })

  it('a firm on its own contract divides the week by that contract’s links, exactly as before', () => {
    const own = helenasWeek([{ companyId: 'cloudepa', role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 9000 }], {
      sellContract: {
        companyId: 'cloudepa', clientCompanyId: 'cs', endClientCompanyId: 'northbend',
        buyLinks: [
          { buyContractId: 'cloudepa-w2', sellContractId: 'cloudepa-sells-to-cs', effectiveFrom: D('2026-03-01'), effectiveTo: D('2026-09-16') },
          { buyContractId: 'cloudepa-c2c', sellContractId: 'cloudepa-sells-to-cs', effectiveFrom: D('2026-09-17'), effectiveTo: null },
        ],
      },
    })
    const ours = payersAcceptance({ payerCompanyId: 'cloudepa', buyContractId: 'cloudepa-w2', weeks: [own], payerLinks: [] })
    expect(ours!.hours).toBe(24)
  })

  it('an invoice from CloudEPA to Computer Systems fails the receipt check until Computer Systems has accepted the week', () => {
    const before = payersAcceptance({
      payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [helenasWeek([NORTHBEND])], payerLinks: CS_LINKS,
    })
    const bill = {
      id: 'b', number: 'CE-1', totalCents: 40 * 11800, currency: 'USD',
      periodStart: D('2026-09-14'), periodEnd: D('2026-09-18'), hours: 40, rateCents: 11800, duplicateOfBillId: null,
    }
    const accepted = (a: typeof before) =>
      a ? { hours: a.hours, contractRateCents: 11800, firstDay: a.firstDay, lastDay: a.lastDay, count: a.count } : null
    const refused = matchVendorBill({ bill, accepted: accepted(before), po: null, poRequired: false })
    expect(refused.checks.find((c) => c.code === 'RECEIPT')?.outcome).toBe('FAIL')

    const after = payersAcceptance({
      payerCompanyId: 'cs', buyContractId: CS_BUY, weeks: [helenasWeek([NORTHBEND, CS_ACCEPTS(40)])], payerLinks: CS_LINKS,
    })
    const matched = matchVendorBill({ bill, accepted: accepted(after), po: null, poRequired: false })
    expect(matched.checks.filter((c) => c.outcome === 'FAIL')).toEqual([])
  })

  it('the supplier-invoice route reads the paying firm’s acceptance through one door, and names no single role of its own', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/ap/bills/route.ts'), 'utf8')
    expect(route).toContain('payersBook(')
    expect(route).not.toMatch(/role:\s*'EMPLOYER_ACCEPTANCE'/)
  })
})
