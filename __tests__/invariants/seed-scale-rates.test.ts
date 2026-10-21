/**
 * The generated world's rates (etyme-money): the pure half that supply,
 * demand and regulatory import, and the rows money writes from a frame.
 * docs/seed-scale-brief.md sections 3.2 and 5.2; CLAUDE.md, "Nine
 * decisions for the generated world" (2026-10-20).
 */

import { describe, it, expect } from 'vitest'
import type { IndustryKey, RoleTemplate } from '@/lib/seed-scale/types'
import {
  bandFor, chainFor, chainOf, pairFor, pricedLine, seenBy, listingRate, floorFor, marginClassFor,
  MAX_RUNGS, W2_BURDEN, DEFAULT_FLOOR_PCT, FEDERAL_MINIMUM_WAGE_CENTS,
} from '@/lib/seed-scale/rates'

const role = (title: string, seniority: RoleTemplate['seniority'], licensed = false): RoleTemplate => ({
  title, skills: ['Placeholder'], seniority, licensed,
})

/** A spread of roles in every industry, the way the vocabulary will carry them. */
const ROLES: [IndustryKey, RoleTemplate][] = [
  ['IT', role('Junior QA analyst', 'JUNIOR')],
  ['IT', role('Java developer', 'MID')],
  ['IT', role('Cloud solutions architect', 'SENIOR')],
  ['HEALTHCARE', role('Certified nursing assistant', 'JUNIOR', true)],
  ['HEALTHCARE', role('Travel nurse', 'MID', true)],
  ['HEALTHCARE', role('Nurse practitioner', 'SENIOR', true)],
  ['MANUFACTURING', role('Machine operator', 'JUNIOR')],
  ['MANUFACTURING', role('CNC programmer', 'MID')],
  ['MANUFACTURING', role('Validation engineer', 'SENIOR')],
  ['FINANCE', role('Accounts payable clerk', 'JUNIOR')],
  ['FINANCE', role('Treasury analyst', 'MID')],
  ['FINANCE', role('Controller', 'SENIOR')],
]

/** Two hundred people, spread over every role. */
const PEOPLE = Array.from({ length: 200 }, (_, i) => {
  const [industry, r] = ROLES[i % ROLES.length]
  return { id: `sx-person-${String(i).padStart(4, '0')}`, role: r, industry }
})

const dollars = (cents: number) => cents / 100

describe('the generated world’s rates: bands', () => {
  it('a Java developer, a travel nurse, a validation engineer, a CNC programmer and a treasury analyst each get a band a US client would recognize', () => {
    const at = (i: IndustryKey, r: RoleTemplate) => bandFor(r, i)
    const java = at('IT', role('Java developer', 'MID'))
    const nurse = at('HEALTHCARE', role('Travel nurse', 'MID', true))
    const validation = at('MANUFACTURING', role('Validation engineer', 'SENIOR'))
    const cnc = at('MANUFACTURING', role('CNC programmer', 'MID'))
    const treasury = at('FINANCE', role('Treasury analyst', 'MID'))
    expect([dollars(java.minCents), dollars(java.maxCents)]).toEqual([90, 125])
    expect(dollars(nurse.minCents)).toBeGreaterThanOrEqual(85)
    expect(dollars(nurse.maxCents)).toBeLessThanOrEqual(140)
    expect(dollars(validation.minCents)).toBeGreaterThanOrEqual(90)
    expect(dollars(validation.maxCents)).toBeLessThanOrEqual(160)
    expect([dollars(cnc.minCents), dollars(cnc.maxCents)]).toEqual([48, 70])
    expect([dollars(treasury.minCents), dollars(treasury.maxCents)]).toEqual([65, 90])
  })

  it('every role in every industry has a band in whole dollars, in USD, with its minimum under its maximum', () => {
    for (const [i, r] of ROLES) {
      const b = bandFor(r, i)
      expect(b.currency).toBe('USD')
      expect(b.minCents % 100).toBe(0)
      expect(b.maxCents % 100).toBe(0)
      expect(b.minCents).toBeGreaterThan(0)
      expect(b.minCents).toBeLessThan(b.maxCents)
    }
  })

  it('a senior role’s band sits above a junior role’s in the same industry', () => {
    for (const industry of ['IT', 'HEALTHCARE', 'MANUFACTURING', 'FINANCE'] as IndustryKey[]) {
      const [junior, , senior] = ROLES.filter(([i]) => i === industry).map(([i, r]) => bandFor(r, i))
      expect(senior.minCents).toBeGreaterThan(junior.maxCents)
    }
  })

  it('specialist and licensed work carries an expertise margin, and commodity work an arbitrage one', () => {
    expect(marginClassFor(role('Nurse practitioner', 'SENIOR', true))).toBe('EXPERTISE')
    expect(marginClassFor(role('Travel nurse', 'MID', true))).toBe('EXPERTISE')
    expect(marginClassFor(role('Machine operator', 'JUNIOR'))).toBe('ARBITRAGE')
  })
})

describe('the generated world’s rates: chains', () => {
  const band = bandFor(role('Java developer', 'MID'), 'IT')

  it('the same key always gives the same chain', () => {
    expect(chainFor(band, 3, 'sx/line/0001')).toEqual(chainFor(band, 3, 'sx/line/0001'))
    expect(chainFor(band, 3, 'sx/line/0001')).not.toEqual(chainFor(band, 3, 'sx/line/0002'))
  })

  it('a chain is one rate per supplier and one for the worker, and the client pays the first, inside the band', () => {
    for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
      for (let k = 0; k < 50; k++) {
        const c = chainFor(band, rungs, `k${k}`)
        expect(c).toHaveLength(rungs + 1)
        expect(c[0]).toBeGreaterThanOrEqual(band.minCents)
        expect(c[0]).toBeLessThanOrEqual(band.maxCents)
        expect(c.every((x) => Number.isInteger(x))).toBe(true)
      }
    }
  })

  it('a sub-vendor’s rate never exceeds the prime’s, at any depth', () => {
    for (const p of PEOPLE) {
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
        const c = chainOf(p, rungs)
        for (let r = 1; r < c.length; r++) expect(c[r]).toBeLessThan(c[r - 1])
      }
    }
  })

  it('every rung keeps at least the agreement’s minimum margin, the firm that employs counted after the W2 burden', () => {
    for (const floorPct of [DEFAULT_FLOOR_PCT, 15, 20]) {
      for (const p of PEOPLE) {
        for (let rungs = 1; rungs <= 3; rungs++) {
          const c = chainOf(p, rungs, { floorPct })
          for (let r = 0; r < rungs; r++) {
            const cost = r === rungs - 1 ? c[r + 1] * (1 + W2_BURDEN) : c[r + 1]
            expect((c[r] - cost) / c[r]).toBeGreaterThanOrEqual(floorPct / 100 - 1e-9)
          }
        }
      }
    }
  })

  it('a floor no chain can clear is refused rather than priced', () => {
    expect(() => chainFor(band, 3, 'k', { floorPct: 100 })).toThrow(/cannot be met/)
    expect(() => chainFor(band, 0, 'k')).toThrow(RangeError)
    expect(() => chainFor(band, MAX_RUNGS + 1, 'k')).toThrow(RangeError)
    expect(() => chainFor({ minCents: 0, maxCents: 0, currency: 'USD' }, 1, 'k')).toThrow(/cannot be priced/)
  })

  it('an expertise job keeps more at the firm that employs the person, and less at the firms that pass the person through', () => {
    let passA = 0, passE = 0, empA = 0, empE = 0
    for (let k = 0; k < 200; k++) {
      const a = chainFor(band, 3, `k${k}`, { marginClass: 'ARBITRAGE' })
      const e = chainFor(band, 3, `k${k}`, { marginClass: 'EXPERTISE' })
      passA += (a[0] - a[1]) / a[0]; passE += (e[0] - e[1]) / e[0]
      empA += (a[2] - a[3] * (1 + W2_BURDEN)) / a[2]; empE += (e[2] - e[3] * (1 + W2_BURDEN)) / e[2]
    }
    expect(passE).toBeLessThan(passA)
    expect(empE).toBeGreaterThan(empA)
  })

  it('a line from years back is priced lower than the same line today', () => {
    const p = PEOPLE[1]
    expect(chainOf(p, 2, { yearsBack: 5 })[0]).toBeLessThan(chainOf(p, 2)[0])
  })
})

describe('the generated world’s rates: one line', () => {
  it('pay never exceeds bill at the same rung, and the rung below bills exactly what the rung above pays', () => {
    for (const p of PEOPLE) {
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) {
        for (let r = 0; r < rungs; r++) {
          const pair = pairFor(p, r, rungs)
          expect(pair.payCents).toBeLessThan(pair.billCents)
          expect(pair.currency).toBe('USD')
          if (r + 1 < rungs) expect(pairFor(p, r + 1, rungs).billCents).toBe(pair.payCents)
        }
      }
    }
  })

  it('a W2 pay line carries the employer’s burden, and its cost to the firm still clears the margin floor', () => {
    for (const p of PEOPLE) {
      const line = pricedLine(p, 1, 2, 'W2')
      expect(line.burden).toBe(W2_BURDEN)
      expect(line.costCents).toBe(Math.round(line.payCents * (1 + W2_BURDEN)))
      expect(line.costCents).toBeLessThan(line.billCents)
      expect(line.marginPct).toBeGreaterThanOrEqual(DEFAULT_FLOOR_PCT)
    }
  })

  it('a corp-to-corp pair carries no burden, is paid more an hour than the W2 wage, and costs the firm no more than the W2 line', () => {
    for (const p of PEOPLE) {
      const w2 = pricedLine(p, 0, 1, 'W2')
      const c2c = pricedLine(p, 0, 1, 'C2C')
      expect(c2c.burden).toBe(0)
      expect(c2c.costCents).toBe(c2c.payCents)
      expect(c2c.payCents).toBeGreaterThan(w2.payCents)
      expect(c2c.costCents).toBeLessThanOrEqual(w2.costCents)
      expect(c2c.payCents).toBeLessThan(c2c.billCents)
      expect(c2c.marginPct).toBeGreaterThanOrEqual(DEFAULT_FLOOR_PCT)
    }
  })

  it('a firm paying a sub-vendor is never handed a W2 pay line', () => {
    expect(() => pricedLine(PEOPLE[0], 0, 2, 'W2')).toThrow(/not a wage/)
    expect(pricedLine(PEOPLE[0], 0, 2, 'C2C').burden).toBe(0)
  })

  it('a rung that is not on the chain is refused rather than priced', () => {
    expect(() => pairFor(PEOPLE[0], 2, 2)).toThrow(RangeError)
    expect(() => pairFor(PEOPLE[0], -1, 2)).toThrow(RangeError)
  })

  it('the client sees only the rate it pays, and a sub-vendor never sees the client’s rate', () => {
    const c = chainOf(PEOPLE[2], 3)
    expect(seenBy(c, 'CLIENT')).toEqual([c[0]])
    expect(seenBy(c, 0)).toEqual([c[0], c[1]])
    expect(seenBy(c, 1)).not.toContain(c[0])
    expect(seenBy(c, 2)).toEqual([c[2], c[3]])
    expect(() => seenBy(c, 3)).toThrow(RangeError)
  })

  it('a W2 wage at the deepest chain on the lowest band is above the federal minimum wage', () => {
    for (const p of PEOPLE) expect(chainOf(p, MAX_RUNGS)[MAX_RUNGS]).toBeGreaterThan(FEDERAL_MINIMUM_WAGE_CENTS)
  })
})

describe('the generated world’s rates: a person on a bench', () => {
  it('a person’s floor is at or under every W2 wage any chain pays them, and under the top of their role’s band', () => {
    for (const p of PEOPLE) {
      const floor = floorFor(p)
      for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) expect(floor).toBeLessThanOrEqual(pairFor(p, rungs - 1, rungs).payCents)
      expect(floor).toBeLessThan(bandFor(p.role, p.industry).maxCents)
    }
  })

  it('a person’s listing range starts at or above their floor and is a real range', () => {
    for (const p of PEOPLE) {
      const l = listingRate(p)
      expect(l.currency).toBe('USD')
      expect(l.minCents).toBeGreaterThanOrEqual(floorFor(p))
      expect(l.minCents).toBeLessThan(l.maxCents)
    }
  })
})

// ── The row half, against a hand-built frame ─────────────────────────

import type { ScaleFrame, ScaleFirm, Trade, Position, Industry } from '@/lib/seed-scale/types'
import {
  seedRatesWith, rateId, planAgreementTerms, RISE_ONE_IN,
  type RatesIo, type AgreementRow, type CompanyRow, type SellRow, type BuyRow, type LinkRow, type HolidayRow,
  type OrderRow, type RateRow, type CycleRow,
} from '@/lib/seed-scale/rates/rows'
import { agreementTermsFor, benchPolicyFor } from '@/lib/seed-scale/rates'

const DAY_MS = 86_400_000
const BIRTHDAY = new Date('2026-10-20T00:00:00.000Z')
const day = (n: number) => new Date(BIRTHDAY.getTime() + n * DAY_MS)

const INDUSTRY_LIST: Industry[] = [
  { key: 'IT', roles: [role('Java developer', 'MID'), role('Cloud solutions architect', 'SENIOR')], places: [], firmStems: [], niches: [] },
  { key: 'HEALTHCARE', roles: [role('Travel nurse', 'MID', true)], places: [], firmStems: [], niches: [] },
]

function firm(id: string, position: Position, kind: ScaleFirm['kind'] = 'VENDOR'): ScaleFirm {
  const f = {
    index: 0, id, slug: `world-sx-${id}`, name: `Firm ${id}`, kind, position,
    posture: position === 'PRIME' ? 'PRIME' : position === 'BENCH' ? 'BENCH' : null,
    industries: ['IT'], niche: null, country: 'US', sites: [],
    seats: [{ personId: `${id}-owner`, email: `${id}@people.scale.invalid`, name: 'Owner', role: 'Owner', roleKey: 'owner', companyId: id, grantedAt: BIRTHDAY }],
    seat: () => null,
  }
  return f as unknown as ScaleFirm
}

/** Two clients (one run by an MSP), a prime, a sub-vendor, a bench firm, an integrator and a one-person company. */
function handBuiltFrame(): ScaleFrame {
  const firms = [
    firm('client-a', 'CLIENT', 'CLIENT'), firm('client-b', 'CLIENT', 'CLIENT'), firm('msp', 'MSP', 'MSP'),
    firm('prime', 'PRIME'), firm('sub', 'SUB_VENDOR'), firm('bench', 'BENCH'), firm('gsi', 'GSI', 'GSI'),
    firm('solo', 'SOLO', 'CONSULTANT_CORP'),
  ]
  ;(firms[1] as { industries: string[] }).industries = ['IT', 'HEALTHCARE']
  const paper = (seller: string, buyer: string, relationship: Trade['relationship']): Trade => ({
    seller, buyer, relationship, tier: null, disclosesSubVendors: false,
    agreementId: relationship === 'CLIENT' || relationship === 'PRIME' ? `agreement-${seller}-${buyer}` : null,
  })
  const trades: Trade[] = [
    paper('prime', 'client-a', 'CLIENT'), paper('gsi', 'client-a', 'CLIENT'), paper('bench', 'client-a', 'CLIENT'),
    paper('prime', 'client-b', 'CLIENT'), paper('sub', 'prime', 'PRIME'), paper('bench', 'sub', 'PRIME'),
    paper('solo', 'prime', 'PRIME'),
    { seller: 'msp', buyer: 'client-b', relationship: 'RUNS' as Trade['relationship'], tier: null, agreementId: null, disclosesSubVendors: false },
  ]
  const byId = new Map(firms.map((f) => [f.id, f]))
  return {
    firms, byId, bySlug: new Map(firms.map((f) => [f.slug, f])),
    byPosition: (p) => firms.filter((f) => f.position === p),
    trades,
    panelOf: (c) => trades.filter((t) => t.buyer === c && t.relationship === 'CLIENT').map((t) => byId.get(t.seller)!),
    primesOf: (s) => trades.filter((t) => t.seller === s && t.relationship === 'PRIME').map((t) => byId.get(t.buyer)!),
    subsOf: (p) => trades.filter((t) => t.buyer === p && t.relationship === 'PRIME').map((t) => byId.get(t.seller)!),
    mspOf: (c) => (c === 'client-b' ? byId.get('msp')! : null),
    industries: INDUSTRY_LIST,
    clock: { birthday: BIRTHDAY },
  }
}

const sellLine = (id: string, seller: string, client: string, person: string, billRate: number, start: number, end: number, state = 'IN_PROGRESS'): SellRow => ({
  id, companyId: seller, clientCompanyId: client, personId: person, billRate, startDate: day(start), endDate: day(end), state,
  workOrderId: null, msaId: null, engagementId: null, paymentTerms: 30, paymentTermsFrom: 'PERIOD_END',
  billFrequency: 'MONTHLY', billAnchor: 'CALENDAR', billStraddle: 'SPLIT', termsDifferReason: null, siteCountry: null,
})
const buyLine = (id: string, firmId: string, vendor: string | null, type: string, person: string, payRate: number, start: number, end: number, state = 'IN_PROGRESS'): BuyRow => ({
  id, companyId: firmId, vendorCompanyId: vendor, contractType: type, state, startDate: day(start), endDate: day(end),
  workOrderId: null, paymentTermsFrom: 'PERIOD_END', termsDifferReason: null, candidates: [{ personId: person, payRate }],
})

/** The tables, in memory: updates change them, creates skip what is there, and every write is counted. */
function memoryWorld(frame: ScaleFrame) {
  const companies: CompanyRow[] = frame.firms.map((f) => ({
    id: f.id, name: f.name, kind: f.kind, templatePack: null,
    benchPolicy: 'NO_PAY', benchRateBps: null, benchCarryDays: null, reserveBps: null, reserveOnExit: 'PAY_OUT',
    cycleShiftHours: 'AFTER', cycleShiftPay: 'BEFORE', cycleShiftBill: 'AFTER', daysOff: [0, 6],
    payPeriod: 'BIWEEKLY', payCalcOffsetDays: 4, payDayOffsetDays: 6, payDaysOfMonth: [28], payCalcDaysBefore: 3,
    paySettingsSetAt: null, paySettingsSetById: null,
  }))
  // As the frame writes them: net 45 to a client and 30 otherwise, nothing else said.
  const agreements: AgreementRow[] = frame.trades.filter((t) => t.agreementId).map((t) => ({
    id: t.agreementId!, vendorId: t.seller, clientId: t.buyer,
    paymentTerms: t.relationship === 'CLIENT' ? 45 : 30, paymentTermsFrom: 'PERIOD_END',
    billFrequency: null, billAnchor: null, billStraddle: null, billableExpenseKinds: [], billableExpenseKindsSaid: false,
    currency: 'USD', minMarginPct: null, rateCard: null,
  }))
  const sell: SellRow[] = [
    // Ada: client-a ← prime ← sub, the sub employs her on W2. Live.
    sellLine('s-ada-prime', 'prime', 'client-a', 'ada', 10500, -120, 240),
    sellLine('s-ada-sub', 'sub', 'prime', 'ada', 9200, -120, 240),
    // Bo: client-a ← gsi, the integrator's own W2. Live.
    sellLine('s-bo-gsi', 'gsi', 'client-a', 'bo', 11800, -30, 330),
    // Cy: client-b ← prime ← her own company. Live.
    sellLine('s-cy-prime', 'prime', 'client-b', 'cy', 12000, -60, 300),
    sellLine('s-cy-solo', 'solo', 'prime', 'cy', 9800, -60, 300),
    // Di: an ended line at client-a through the bench firm.
    sellLine('s-di-bench', 'bench', 'client-a', 'di', 7000, -700, -200, 'ENDED'),
    // Ed: a live line at client-a through the prime, on the same order as Ada's.
    sellLine('s-ed-prime', 'prime', 'client-a', 'ed', 9900, -10, 170),
  ]
  // Ed's line recorded why it differs from the agreement, so it is left as it is.
  sell[6] = { ...sell[6], billFrequency: 'WEEKLY', termsDifferReason: 'The client asked for weekly bills on this one placement.' }
  const buy: BuyRow[] = [
    buyLine('b-ada-prime', 'prime', 'sub', 'C2C', 'ada', 9200, -120, 240),
    buyLine('b-ada-sub', 'sub', null, 'W2', 'ada', 5900, -120, 240),
    buyLine('b-bo-gsi', 'gsi', null, 'W2', 'bo', 7000, -30, 330),
    buyLine('b-cy-prime', 'prime', 'solo', 'C2C', 'cy', 9800, -60, 300),
    buyLine('b-cy-solo', 'solo', null, 'W2', 'cy', 8000, -60, 300),
    buyLine('b-di-bench', 'bench', null, 'W2', 'di', 4500, -700, -200, 'ENDED'),
    buyLine('b-ed-prime', 'prime', null, 'W2', 'ed', 6000, -10, 170),
  ]
  const links: LinkRow[] = sell.map((s) => ({ sellContractId: s.id, buyContractId: s.id.replace(/^s-/, 'b-') }))
  const holidays: HolidayRow[] = [
    { companyId: 'client-a', date: new Date('2026-11-26T00:00:00Z'), isRecurring: false, country: 'US' },
    { companyId: 'client-a', date: new Date('2026-11-14T00:00:00Z'), isRecurring: false, country: 'IN' },
  ]
  const orders = new Map<string, OrderRow>()
  const rates = new Map<string, RateRow>()
  const cycles = new Map<string, CycleRow>()
  const writes = { count: 0 }
  const createInto = <R extends { id: string }>(m: Map<string, R>, rows: R[]) => {
    writes.count++
    let n = 0
    for (const r of rows) if (!m.has(r.id)) { m.set(r.id, r); n++ }
    return n
  }
  const io: RatesIo = {
    readAgreements: async (ids) => agreements.filter((a) => ids.includes(a.id)).map((a) => ({ ...a })),
    readCompanies: async () => companies.map((c) => ({ ...c })),
    readLines: async () => ({ sell: sell.map((s) => ({ ...s })), buy: buy.map((b) => ({ ...b, candidates: [...b.candidates] })), links }),
    readHolidays: async (ids) => holidays.filter((h) => ids.includes(h.companyId)),
    readFirstSeats: async (ids) => new Map(ids.map((id) => [id, `${id}-owner`])),
    readExisting: async (table, ids) => {
      const m: Map<string, unknown> = table === 'workOrder' ? orders : table === 'rateHistory' ? rates : cycles
      return new Set(ids.filter((id) => m.has(id)))
    },
    readLinesWithOtherCycles: async () => new Set<string>(),
    updateAgreements: async (ids, data) => {
      writes.count++
      for (const a of agreements) if (ids.includes(a.id)) Object.assign(a, JSON.parse(JSON.stringify(data)))
      return ids.length
    },
    updateCompanies: async (ids, data) => {
      writes.count++
      for (const c of companies) if (ids.includes(c.id)) Object.assign(c, data)
      return ids.length
    },
    createOrders: async (rows) => createInto(orders, rows),
    setSellLines: async (rows) => {
      writes.count++
      for (const r of rows) Object.assign(sell.find((s) => s.id === r.id)!, r)
      return rows.length
    },
    setBuyLines: async (rows) => {
      writes.count++
      for (const r of rows) Object.assign(buy.find((b) => b.id === r.id)!, r)
      return rows.length
    },
    createRateRows: async (rows) => createInto(rates, rows),
    createCycles: async (rows) => createInto(cycles, rows),
  }
  return { io, agreements, companies, sell, buy, orders, rates, cycles, writes }
}

describe('the generated world’s rates: the rows, against a hand-built frame', () => {
  it('every agreement carries its buyer’s own terms: one rhythm, one net days and one expense rule for every supplier of one buyer', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const ofClientA = w.agreements.filter((a) => a.clientId === 'client-a')
    expect(ofClientA).toHaveLength(3)
    for (const field of ['paymentTerms', 'paymentTermsFrom', 'billFrequency', 'billAnchor', 'billStraddle', 'billableExpenseKindsSaid'] as const) {
      expect(new Set(ofClientA.map((a) => JSON.stringify(a[field]))).size).toBe(1)
    }
    for (const a of w.agreements) {
      expect(a.billFrequency).not.toBeNull()
      expect(a.minMarginPct).not.toBeNull()
      expect(a.currency).toBe('USD')
    }
  })

  it('an agreement’s margin floor is one every generated chain clears, and a client run by an MSP counts net days from approval or receipt', () => {
    const frame = handBuiltFrame()
    for (const [, a] of planAgreementTerms(frame)) expect(a.terms.minMarginPct).toBeLessThanOrEqual(DEFAULT_FLOOR_PCT)
    const viaMsp = agreementTermsFor({ agreementId: 'x', relationship: 'CLIENT' }, frame.byId.get('client-b')!, { runByMsp: true, industries: INDUSTRY_LIST })
    expect(['APPROVAL_DATE', 'RECEIPT_DATE']).toContain(viaMsp.paymentTermsFrom)
    expect(() => agreementTermsFor({ agreementId: null, relationship: 'MSP' }, frame.byId.get('client-b')!, { runByMsp: true, industries: INDUSTRY_LIST })).toThrow(/no agreement/)
  })

  it('a client’s agreement carries a rate card of every role in its industries at the band it pays, and an agreement between two suppliers carries none', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const toClientB = w.agreements.find((a) => a.id === 'agreement-prime-client-b')!
    const card = toClientB.rateCard as { title: string; minCents: number; maxCents: number }[]
    expect(card.map((c) => c.title).sort()).toEqual(['Cloud solutions architect', 'Java developer', 'Travel nurse'])
    const nurse = card.find((c) => c.title === 'Travel nurse')!
    expect(nurse.minCents).toBe(bandFor(role('Travel nurse', 'MID', true), 'HEALTHCARE').minCents)
    expect(w.agreements.find((a) => a.id === 'agreement-sub-prime')!.rateCard).toBeNull()
  })

  it('a bench firm pays its bench in one of the four shapes and an integrator keeps paying its own people between projects; nobody else is written', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const of = (id: string) => w.companies.find((c) => c.id === id)!
    expect(of('gsi').benchPolicy).toBe('FULL_PAY')
    expect(of('bench').benchPolicy).toBe(benchPolicyFor(frame.byId.get('bench')!)!.benchPolicy)
    for (const id of ['prime', 'sub', 'client-a', 'msp', 'solo']) expect(of(id).benchPolicy).toBe('NO_PAY')
    const shapes = new Set(Array.from({ length: 60 }, (_, i) => benchPolicyFor({ id: `bench-${i}`, position: 'BENCH' })!.benchPolicy))
    expect([...shapes].sort()).toEqual(['FULL_PAY', 'NO_PAY', 'REDUCED_RATE', 'RESERVE_FUNDED'])
    for (let i = 0; i < 60; i++) {
      const p = benchPolicyFor({ id: `bench-${i}`, position: 'BENCH' })!
      expect(p.benchPolicy === 'REDUCED_RATE').toBe(p.benchRateBps !== null)
      expect(p.benchPolicy === 'RESERVE_FUNDED').toBe(p.reserveBps !== null)
    }
  })

  it('a live line hangs on one order per buyer and seller, carrying the agreement’s terms, and a W2 line and a line paid through a person’s own company hang on none', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const line = (id: string) => w.sell.find((s) => s.id === id)!
    const order = w.orders.get(line('s-ada-prime').workOrderId!)!
    expect(order.issuedById).toBe('client-a')
    expect(order.issuedToId).toBe('prime')
    expect(line('s-ed-prime').workOrderId).toBe(order.id)
    const terms = planAgreementTerms(frame).get('agreement-prime-client-a')!.terms
    expect(order.msaId).toBe('agreement-prime-client-a')
    expect(order.paymentTerms).toBe(terms.paymentTerms)
    expect(order.paymentTermsFrom).toBe(terms.paymentTermsFrom)
    expect(order.billFrequency).toBe(terms.billFrequency)
    expect(w.buy.find((b) => b.id === 'b-ada-prime')!.workOrderId).toBe(line('s-ada-sub').workOrderId)
    for (const id of ['b-ada-sub', 'b-bo-gsi', 'b-cy-prime', 'b-cy-solo', 'b-ed-prime']) expect(w.buy.find((b) => b.id === id)!.workOrderId).toBeNull()
    expect(line('s-cy-solo').workOrderId).toBeNull()
    expect(line('s-di-bench').workOrderId).toBeNull()
    expect(w.orders.size).toBe(4)
    for (const o of w.orders.values()) expect(o.id.startsWith('cz')).toBe(true)
  })

  it('an order’s ceiling is what the live lines on it come to, in whole dollars', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const order = w.orders.get(w.sell.find((s) => s.id === 's-ada-prime')!.workOrderId!)!
    const weeks = (a: number, b: number) => Math.ceil((b - a + 1) / 7)
    expect(order.amount).toBe(Math.ceil((10500 * 40 * weeks(-120, 240) + 9900 * 40 * weeks(-10, 170)) / 100))
    expect(order.startDate).toEqual(day(-120))
    expect(order.endDate).toEqual(new Date(day(240).getTime() + 30 * DAY_MS))
  })

  it('a sell line takes its agreement’s terms unless it recorded a reason to differ', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const terms = planAgreementTerms(frame).get('agreement-bench-client-a')!.terms
    const ended = w.sell.find((s) => s.id === 's-di-bench')!
    expect([ended.billFrequency, ended.paymentTerms, ended.paymentTermsFrom]).toEqual([terms.billFrequency, terms.paymentTerms, terms.paymentTermsFrom])
    const ed = w.sell.find((s) => s.id === 's-ed-prime')!
    expect(ed.billFrequency).toBe('WEEKLY')
    expect(ed.paymentTerms).toBe(30)
  })

  it('every live line opens with its rate on the record, approved, on both sides, and an ended line gets none', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const opening = [...w.rates.values()].filter((r) => r.approvalState === 'APPROVED')
    expect(opening.find((r) => r.contractId === 's-ada-prime')!.rate).toBe(10500)
    expect(opening.find((r) => r.contractId === 'b-ada-sub')!.rate).toBe(5900)
    expect(opening.find((r) => r.contractId === 'b-ada-sub')!.contractType).toBe('BUY')
    expect(opening.some((r) => r.contractId === 's-di-bench' || r.contractId === 'b-di-bench')).toBe(false)
    for (const r of opening) expect(r.changedById).toMatch(/-owner$/)
    for (const r of [...w.rates.values()].filter((x) => x.approvalState === 'PROPOSED')) {
      expect(r.previousRate).not.toBeNull()
      expect(r.rate).toBeGreaterThan(r.previousRate!)
      expect(r.approvedById).toBeNull()
    }
    expect(RISE_ONE_IN).toBeGreaterThan(1)
  })

  it('a live line has its due dates and an ended line has none, and nothing falls due before the world was born', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    await seedRatesWith(frame, w.io)
    const rows = [...w.cycles.values()]
    const on = (id: string) => rows.filter((c) => ('sellContractId' in c ? c.sellContractId : c.buyContractId) === id)
    expect(on('s-ada-prime').length).toBeGreaterThan(0)
    expect(on('b-ada-sub').some((c) => c.kind.startsWith('SALARY'))).toBe(true)
    expect(on('b-ada-prime').some((c) => c.kind.startsWith('VENDOR_BILL'))).toBe(true)
    expect(on('s-di-bench')).toHaveLength(0)
    expect(on('b-di-bench')).toHaveLength(0)
    for (const c of rows) expect(c.dueOn.getTime()).toBeGreaterThanOrEqual(BIRTHDAY.getTime())
    for (const c of rows) expect(c.id.startsWith('cz')).toBe(true)
  })

  it('a second run writes nothing', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    const first = await seedRatesWith(frame, w.io)
    expect(first.orders + first.rateRows + first.cycles + first.agreements).toBeGreaterThan(0)
    const before = w.writes.count
    const second = await seedRatesWith(frame, w.io)
    expect(w.writes.count).toBe(before)
    expect(second).toEqual({ agreements: 0, benchFirms: 0, orders: 0, sellLines: 0, buyLines: 0, rateRows: 0, cycles: 0, agreementsMissing: 0, w2WithOrder: 0 })
  })

  it('the same frame split into shares writes exactly what one run writes', async () => {
    const frame = handBuiltFrame()
    const whole = memoryWorld(frame)
    await seedRatesWith(frame, whole.io)
    const split = memoryWorld(frame)
    for (let i = 0; i < 3; i++) await seedRatesWith(frame, split.io, { index: i, of: 3 })
    expect([...split.orders.keys()].sort()).toEqual([...whole.orders.keys()].sort())
    expect([...split.rates.keys()].sort()).toEqual([...whole.rates.keys()].sort())
    expect([...split.cycles.keys()].sort()).toEqual([...whole.cycles.keys()].sort())
    expect(split.agreements).toEqual(whole.agreements)
    expect(split.sell).toEqual(whole.sell)
  })

  it('an agreement the frame names and the database lacks is counted, never invented', async () => {
    const frame = handBuiltFrame()
    const w = memoryWorld(frame)
    w.agreements.splice(0, 1)
    const out = await seedRatesWith(frame, w.io)
    expect(out.agreementsMissing).toBe(1)
    expect(w.agreements).toHaveLength(frame.trades.filter((t) => t.agreementId).length - 1)
    expect(rateId('x')).toMatch(/^cz[0-9a-z]{23}$/)
  })
})

describe('the generated world’s rates: on the real frame and vocabulary', () => {
  it('every role in the generated vocabulary has a band, and its W2 wage at the deepest chain clears the federal minimum wage', async () => {
    const { INDUSTRIES } = await import('@/lib/seed-scale/industries')
    for (const industry of INDUSTRIES) {
      for (const r of industry.roles) {
        const b = bandFor(r, industry.key)
        expect(b.minCents).toBeLessThan(b.maxCents)
        const p = { id: `vocab/${r.title}`, role: r, industry: industry.key }
        expect(chainOf(p, MAX_RUNGS)[MAX_RUNGS]).toBeGreaterThan(FEDERAL_MINIMUM_WAGE_CENTS)
        expect(listingRate(p).minCents).toBeGreaterThanOrEqual(floorFor(p))
      }
    }
  })

  it('on the real frame every agreement gets terms, one standard set per buyer, and every bench firm and integrator a bench pay policy', async () => {
    const { buildFrame } = await import('@/lib/seed-scale/frame')
    const frame = buildFrame()
    const plan = planAgreementTerms(frame)
    expect(plan.size).toBe(frame.trades.filter((t) => t.agreementId).length)
    const perBuyer = new Map<string, Set<string>>()
    for (const a of plan.values()) {
      const { minMarginPct: _f, rateCard: _c, ...rest } = a.terms
      perBuyer.set(a.buyerId, (perBuyer.get(a.buyerId) ?? new Set()).add(JSON.stringify(rest)))
      expect(a.terms.minMarginPct).toBeLessThanOrEqual(DEFAULT_FLOOR_PCT)
    }
    for (const sets of perBuyer.values()) expect(sets.size).toBe(1)
    for (const f of frame.firms) {
      const p = benchPolicyFor(f)
      if (f.position === 'BENCH' || f.position === 'GSI') expect(p).not.toBeNull()
      else expect(p).toBeNull()
    }
  }, 60_000)
})
