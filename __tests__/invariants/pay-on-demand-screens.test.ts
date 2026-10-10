import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { marginFloorFinding, findingsFor, type ContractInput } from '@/app/api/program/agreements/verdict'
import {
  mayReadLegRate, legAsSeen, positionAsSeen,
  type Assertion, type Leg, type Position, type FiledParties,
} from '@/lib/work-ledger'

/**
 * A person's pay rate, on the demand side's screens.
 *
 * lib/money/pay-visibility says it once: what a person is paid is read by
 * a seat holding consultants.cost — the desks that run pay — or by the
 * person it pays. Two of demand's screens handed it to others: the
 * agreements screen put each colleague's margin beside their bill rate
 * (their pay, one subtraction away) in front of every seat at the seller,
 * and the chain of approvals on a week showed the employer's leg — the
 * pay rate — to every party, the end client included.
 */

const API = join(__dirname, '..', '..', 'src', 'app', 'api')
const read = (...p: string[]) => readFileSync(join(API, ...p), 'utf8')

function contract(over: Partial<ContractInput> = {}): ContractInput {
  return { id: 'c1', personName: 'Ravi Patel', billRateCents: 13000, payRateCents: 10000, live: true, ...over }
}

describe('the agreements screen and what we pay', () => {
  it('a seat that may not read the margin is told the floor is checked by the desks that read margin, and is shown no pay figure', () => {
    const f = marginFloorFinding(contract({ payRateCents: null, marginWithheld: true }), 25)!
    expect(f.code).toBe('MARGIN_WITHHELD')
    expect(f.severity).toBe('NOTE')
    expect(f.says).not.toMatch(/\$|\/hr/)
    expect(f.says).toContain('desks that read margin')
  })

  it('a withheld margin is never reported as a missing pay figure', () => {
    const f = marginFloorFinding(contract({ payRateCents: null, marginWithheld: true }), 25)!
    expect(f.code).not.toBe('MARGIN_UNKNOWN')
  })

  it('a desk that reads pay still sees a contract under the floor, with both rates', () => {
    const f = marginFloorFinding(contract({ billRateCents: 10000, payRateCents: 9000 }), 25)!
    expect(f.code).toBe('MARGIN_FLOOR')
    expect(f.says).toContain('$90')
  })

  it('a client is never told whether its supplier’s margin was withheld, because it is never told the margin at all', () => {
    const f = marginFloorFinding(contract({ payRateCents: null, marginWithheld: true }), 25)!
    expect(findingsFor('CLIENT', [f])).toEqual([])
  })

  it('the agreements route decides each person’s pay through the one pay rule and writes the pay trail', () => {
    const src = read('program', 'agreements', 'route.ts')
    expect(src).toContain("from '@/lib/money/pay-visibility'")
    expect(src).toContain('mayReadPayOf(viewer, personId)')
    expect(src).toContain('writePayTrail(caller, payTrail(viewer, paid)')
    // The raw figure never reaches a row except through the rule.
    expect(src).not.toMatch(/payRateCents: seller \? \(payByPerson\.get/)
  })
})

describe('the agreements screen and what a line bills at', () => {
  const src = read('program', 'agreements', 'route.ts')

  it('a colleague’s bill rate on the agreements screen is read through the price desk rule, and the trail is written', () => {
    expect(src).toContain('mayReadBillRate(billViewer, { sellerId: a.vendorId, clientId: a.clientId })')
    expect(src).toContain('billRateCents: mayBill(a) ? c.billRate : null')
    expect(src).toContain('writeRateTrail(caller, billTrail(')
  })

  it('the margin on a contract needs margin.read, because reading pay is not reading margin', () => {
    expect(src).toContain("hasPermission(desk.acting.permissions, 'margin.read')")
    expect(src).toMatch(/!readsMargin \|\| !mayBill\(a\) \|\| payHidden\(personId\)/)
  })

  it('a client still reads what it pays on the agreements screen, and a seat at its desk reads as the client', () => {
    expect(src).toContain("companyKind: desk.seat ? 'CLIENT' : (caller.company?.kind ?? null)")
  })
})

describe('the timesheets list and what a week bills at', () => {
  const src = read('timesheets', 'route.ts')

  it('a delivery engineer reading the timesheets list is not shown what colleagues bill at, and the row says who reads it', () => {
    expect(src).toContain('if (!mayReadBillRate(viewer, lineOf(r)))')
    expect(src).toContain('cents: null, currency: null, says: BILL_WITHHELD_SAYS')
  })

  it('every bill rate read or withheld on the timesheets list is on the trail', () => {
    expect(src).toContain('await writeBillTrail(caller, billTrail(viewer,')
  })

  it('the client’s own view of the timesheets list is priced as before, at the rung it pays', () => {
    const own = src.slice(src.indexOf('// ── The client ─'))
    expect(own).toContain('payerRung(r.sellContract, rungs)')
    expect(own).not.toContain('mayReadBillRate')
  })
})

describe('the chain of approvals on a week and what the worker is paid', () => {
  const EMPLOYER = 'teleworld'
  const CLIENT = 'corveldt'
  const filed: FiledParties = [EMPLOYER, CLIENT]
  const employerLeg = { companyId: EMPLOYER, role: 'EMPLOYER_ACCEPTANCE' as const }
  const clientLeg = { companyId: CLIENT, role: 'CLIENT_APPROVAL' as const }

  it('a delivery engineer at the employer cannot read a colleague’s pay on the chain', () => {
    expect(mayReadLegRate({ companyId: EMPLOYER, readsWorkerPay: false }, employerLeg, filed)).toBe(false)
  })

  it('the employer’s pay desk still reads what the worker is paid on the chain', () => {
    expect(mayReadLegRate({ companyId: EMPLOYER, readsWorkerPay: true }, employerLeg, filed)).toBe(true)
  })

  it('a client never reads what its supplier pays the worker, even an owner who holds every permission', () => {
    expect(mayReadLegRate({ companyId: CLIENT, readsWorkerPay: true }, employerLeg, filed)).toBe(false)
  })

  it('an end client does not read the price on a contract it is not a party to, because a client never sees a rung below it', () => {
    const chained: FiledParties = ['sub-vendor', 'prime']
    expect(mayReadLegRate({ companyId: 'end-client', readsWorkerPay: true }, { companyId: 'end-client', role: 'CLIENT_APPROVAL' }, chained)).toBe(false)
    expect(mayReadLegRate({ companyId: 'prime', readsWorkerPay: false }, { companyId: 'prime', role: 'PASS_THROUGH' }, chained)).toBe(true)
  })

  it('the two parties to the filed contract still read the price on it', () => {
    expect(mayReadLegRate({ companyId: CLIENT, readsWorkerPay: false }, clientLeg, filed)).toBe(true)
    expect(mayReadLegRate({ companyId: EMPLOYER, readsWorkerPay: false }, clientLeg, filed)).toBe(true)
  })

  it('a withheld leg keeps its hours and loses only its rate, and says it was withheld', () => {
    const assertion = { id: 'a', companyId: EMPLOYER, role: 'EMPLOYER_ACCEPTANCE', hours: 40, rateCents: 6000 } as unknown as Assertion
    const seen = legAsSeen({ companyId: EMPLOYER, readsWorkerPay: false }, { ...employerLeg, companyName: 'Teleworld', says: '', assertion }, filed)
    expect(seen.assertion?.hours).toBe(40)
    expect(seen.assertion?.rateCents).toBeNull()
    expect(seen.rateWithheld).toBe(true)
  })

  it('what the week costs in pay is withheld with the rate it is made from', () => {
    const legs = [
      { ...clientLeg, companyName: 'Corveldt', says: '', assertion: { hours: 40, rateCents: 9000 } as unknown as Assertion },
      { ...employerLeg, companyName: 'Teleworld', says: '', assertion: { hours: 40, rateCents: 6000 } as unknown as Assertion },
    ] as Leg[]
    const p = { billableHours: 40, payableHours: 40, billableCents: 360000, payableCents: 240000, waitingOn: [], complete: true, says: '' } as Position
    const seen = positionAsSeen({ companyId: EMPLOYER, readsWorkerPay: false }, p, legs, filed)
    expect(seen.payableCents).toBeNull()
    expect(seen.payableHours).toBe(40)
    expect(seen.billableCents).toBe(360000)
  })

  it('the chain route reads the worker’s pay through the one pay rule and writes the pay trail, reading and answering alike', () => {
    const src = read('timesheets', '[id]', 'assert', 'route.ts')
    expect(src).toContain('mayReadPayOf(')
    expect(src.match(/await trailPay\(caller/g)?.length).toBe(2)
    expect(src.match(/positionAsSeen\(/g)?.length).toBe(2)
  })
})

describe('a placement converted to a contract', () => {
  it('the record of a conversion names no pay figure, because the automation feed is read by desks that do not read pay', () => {
    const src = read('submissions', '[id]', 'convert', 'route.ts')
    const call = src.slice(src.indexOf("action: 'PLACEMENT_CONVERTED'"), src.indexOf('reversible: false', src.indexOf("action: 'PLACEMENT_CONVERTED'")))
    expect(call).not.toMatch(/payRate/)
  })
})
