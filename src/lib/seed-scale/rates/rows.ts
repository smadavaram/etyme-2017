/**
 * The generated world's rates, the row half (etyme-money).
 *
 * Given a frame, and the lines supply has written, this writes what money
 * owns on them, and nothing else:
 *
 *   1. the terms on every agreement (the frame writes its own at
 *      creation; this brings a one-person company's to the same): the buyer's own
 *      rhythm, net days and what they run from, the billable expense
 *      kinds, the seller's margin floor, and a client's rate card
 *   2. the bench pay columns on bench firms and integrators
 *   3. for the generated lines: a sell line takes its agreement's terms
 *      (unless it recorded a reason to differ); a live line hangs on one
 *      order per buyer and seller (the header only, no ledger, decision
 *      four of 2026-10-20); its opening rate goes on the record, approved;
 *      and its due dates are written, by the same rule `writeCyclesFor`
 *      writes them. An ended line carries no cycles and no order.
 *
 * Every id is derived from a stable key and sorts after the base world's,
 * every write is a batch, and every write is preceded by one read of what
 * is there: a second run reads and writes nothing. Reads and writes go
 * through `RatesIo`, so the arithmetic is proven against a hand-built
 * frame in `__tests__/invariants/seed-scale-rates.test.ts`, and the one
 * Prisma adapter at the bottom is the only thing that touches a database.
 */

import { createHash } from 'node:crypto'
import { idFor, batch } from '@/lib/seed-scale/kit'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { shareOf } from '@/lib/seed-steps'
import { orderNumbers, orderNumberAttempt, headerWindow, ORDER_RHYTHM } from '@/lib/award'
import { headerRhythmFrom } from '@/lib/money/order-terms'
import { planCyclesFor, chosenPayroll } from '@/lib/contract-cycles'
import { policyFrom } from '@/lib/cycle-shift'
import { holidayKeysFrom } from '@/lib/holidays'
import {
  SCALE_SLUG_PREFIX,
  type ScaleFrame, type ScaleFirm, type SeedRates, type Share,
} from '@/lib/seed-scale/types'
import { agreementTermsFor, benchPolicyFor, doorTerms, type AgreementTerms, type BenchPolicyColumns } from './pure'

// ── Ids ───────────────────────────────────────────────────────────────

/** A deterministic id from the architect's kit: cuid-shaped, beginning `cz`, sorting after the base world's. */
export function rateId(key: string): string {
  return idFor(key)
}

const DAY = 86_400_000
/** A live line is any line not ended or cancelled whose last day is on or after the world's birthday. */
const NOT_LIVE = new Set(['ENDED', 'CANCELLED'])
/** One in this many live sell lines has a rise asked for and waiting on somebody. */
export const RISE_ONE_IN = 20
/** The hours a week a ceiling is counted at, as the award's own valuation does where nothing else is said. */
const CEILING_HOURS_A_WEEK = 40

// ── What it reads ─────────────────────────────────────────────────────

export interface AgreementRow {
  id: string
  vendorId: string
  clientId: string
  paymentTerms: number
  paymentTermsFrom: string
  billFrequency: string | null
  billAnchor: string | null
  billStraddle: string | null
  billableExpenseKinds: string[]
  billableExpenseKindsSaid: boolean
  currency: string
  minMarginPct: number | null
  rateCard: unknown
}

export interface CompanyRow {
  id: string
  name: string
  kind: string
  templatePack: string | null
  benchPolicy: string
  benchRateBps: number | null
  benchCarryDays: number | null
  reserveBps: number | null
  reserveOnExit: string
  cycleShiftHours: string
  cycleShiftPay: string
  cycleShiftBill: string
  daysOff: number[]
  payPeriod: string
  payCalcOffsetDays: number
  payDayOffsetDays: number
  payDaysOfMonth: number[]
  payCalcDaysBefore: number
  paySettingsSetAt: Date | null
  paySettingsSetById: string | null
}

export interface SellRow {
  id: string
  companyId: string
  clientCompanyId: string
  personId: string
  billRate: number
  startDate: Date
  endDate: Date | null
  state: string
  workOrderId: string | null
  msaId: string | null
  engagementId: string | null
  paymentTerms: number
  paymentTermsFrom: string
  billFrequency: string
  billAnchor: string
  billStraddle: string
  termsDifferReason: string | null
  /** The work site's country, where the line names a site. */
  siteCountry: string | null
}

export interface BuyRow {
  id: string
  companyId: string
  vendorCompanyId: string | null
  contractType: string
  state: string
  startDate: Date
  endDate: Date | null
  workOrderId: string | null
  paymentTermsFrom: string
  termsDifferReason: string | null
  candidates: { personId: string; payRate: number }[]
}

export interface LinkRow { sellContractId: string; buyContractId: string }
export interface HolidayRow { companyId: string; date: Date; isRecurring: boolean; country: string | null }

// ── What it writes ────────────────────────────────────────────────────

export type AgreementTermsData = Omit<AgreementTerms, 'minMarginPct'>

export interface OrderRow {
  id: string
  number: string
  sellerNumber: string
  title: string
  issuedById: string
  issuedToId: string
  recordedById: string
  /** Whole dollars: `WorkOrder.amount` is currency, not cents. */
  amount: number
  currency: string
  billingBasis: 'TIME'
  billFrequency: string
  billAnchor: string
  billStraddle: string
  paymentTerms: number
  paymentTermsFrom: string | null
  autoApproveTimesheets: false
  msaId: string | null
  engagementId: string | null
  status: 'OPEN'
  startDate: Date
  endDate: Date | null
}

export interface SellUpdate {
  id: string
  workOrderId: string | null
  billFrequency: string
  billAnchor: string
  billStraddle: string
  paymentTerms: number
  paymentTermsFrom: string
}

export interface BuyUpdate { id: string; workOrderId: string | null; paymentTermsFrom: string }

export interface RateRow {
  id: string
  contractType: 'SELL' | 'BUY'
  contractId: string
  rate: number
  rateType: 'HOURLY'
  fromDate: Date
  toDate: null
  reason: string
  changedById: string
  previousRate: number | null
  approvalState: 'APPROVED' | 'PROPOSED'
  approvedById: string | null
  approvedAt: Date | null
  createdAt: Date
}

export type CycleRow =
  | { id: string; sellContractId: string; kind: string; dueOn: Date }
  | { id: string; buyContractId: string; kind: string; dueOn: Date }

/** The reads and writes the row half needs, and no others. */
export interface RatesIo {
  readAgreements(ids: string[]): Promise<AgreementRow[]>
  /** Every generated firm, the one-person companies included. */
  readCompanies(): Promise<CompanyRow[]>
  /** Every line held by a generated firm, both sides, and the links between them. */
  readLines(): Promise<{ sell: SellRow[]; buy: BuyRow[]; links: LinkRow[] }>
  readHolidays(companyIds: string[]): Promise<HolidayRow[]>
  /** Each company's first-granted seat, who records its rates. */
  readFirstSeats(companyIds: string[]): Promise<Map<string, string>>
  readExisting(table: 'workOrder' | 'rateHistory' | 'cycle', ids: string[]): Promise<Set<string>>
  /** Lines carrying a due date this file did not write (an award's), which it then leaves alone. */
  readLinesWithOtherCycles(lineIds: string[]): Promise<Set<string>>
  updateAgreements(ids: string[], data: Partial<AgreementTerms>): Promise<number>
  updateCompanies(ids: string[], data: BenchPolicyColumns): Promise<number>
  createOrders(rows: OrderRow[]): Promise<number>
  setSellLines(rows: SellUpdate[]): Promise<number>
  setBuyLines(rows: BuyUpdate[]): Promise<number>
  createRateRows(rows: RateRow[]): Promise<number>
  createCycles(rows: CycleRow[]): Promise<number>
}

export interface RatesWritten {
  agreements: number
  benchFirms: number
  orders: number
  sellLines: number
  buyLines: number
  rateRows: number
  cycles: number
  /** Agreements the frame names that are not in the database: the frame was not seeded first. */
  agreementsMissing: number
  /** W2 buy lines that carry an order: a contradiction the writer of the line should hear about. */
  w2WithOrder: number
}

// ── The plan, pure ────────────────────────────────────────────────────

/** Every agreement the frame names, with its terms, keyed by agreement id. */
export function planAgreementTerms(frame: ScaleFrame): Map<string, { buyerId: string; sellerId: string; terms: AgreementTerms }> {
  const out = new Map<string, { buyerId: string; sellerId: string; terms: AgreementTerms }>()
  for (const t of frame.trades) {
    if (!t.agreementId) continue
    const buyer = frame.byId.get(t.buyer)
    if (!buyer) continue
    out.set(t.agreementId, {
      buyerId: t.buyer,
      sellerId: t.seller,
      terms: agreementTermsFor(t, buyer, { runByMsp: frame.mspOf(t.buyer) !== null, industries: frame.industries }),
    })
  }
  return out
}

/** The bench pay columns on every firm that gets them. */
export function planBenchPolicies(frame: ScaleFrame): Map<string, BenchPolicyColumns> {
  const out = new Map<string, BenchPolicyColumns>()
  for (const f of frame.firms) {
    const p = benchPolicyFor(f)
    if (p) out.set(f.id, p)
  }
  return out
}

/** A stable JSON, keys sorted, so a card read back from jsonb compares equal to the one written. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

function buyerTermsOf(t: AgreementTerms): AgreementTermsData {
  const { minMarginPct: _floor, ...rest } = t
  return rest
}

function buyerTermsDiffer(row: AgreementRow, t: AgreementTermsData): boolean {
  return (
    row.paymentTerms !== t.paymentTerms ||
    row.paymentTermsFrom !== t.paymentTermsFrom ||
    row.billFrequency !== t.billFrequency ||
    row.billAnchor !== t.billAnchor ||
    row.billStraddle !== t.billStraddle ||
    canonical(row.billableExpenseKinds) !== canonical(t.billableExpenseKinds) ||
    row.billableExpenseKindsSaid !== t.billableExpenseKindsSaid ||
    row.currency !== t.currency ||
    canonical(row.rateCard ?? null) !== canonical(t.rateCard)
  )
}

const live = (l: { state: string; endDate: Date | null }, birthday: Date) =>
  !NOT_LIVE.has(l.state) && (l.endDate === null || l.endDate.getTime() >= birthday.getTime())

const ymd = (d: Date) => d.toISOString().slice(0, 10)

function weeksBetween(start: Date, end: Date | null): number {
  if (!end) return 52
  return Math.max(1, Math.ceil((end.getTime() - start.getTime() + DAY) / (7 * DAY)))
}

/** What `planCyclesFor` is handed as a database: it reads nothing when the policy and the payroll are passed. */
const NO_READS = {
  sellContract: {
    findUnique: () => {
      throw new Error('The cycle plan asked the database for a company the seed had already read.')
    },
  },
} as unknown as Parameters<typeof planCyclesFor>[0]

// ── The run ───────────────────────────────────────────────────────────

/**
 * Write money's rows for the generated world. A share takes a slice of
 * the agreements, the firms and the buyer-and-seller pairs, so a header,
 * every line on it and their due dates land in one step; every share
 * reads what it needs again, and the shares together write what one run
 * writes.
 */
export async function seedRatesWith(frame: ScaleFrame, io: RatesIo, share?: Share): Promise<RatesWritten> {
  const out: RatesWritten = {
    agreements: 0, benchFirms: 0, orders: 0, sellLines: 0, buyLines: 0, rateRows: 0, cycles: 0,
    agreementsMissing: 0, w2WithOrder: 0,
  }
  const birthday = frame.clock.birthday

  // ── 1. Agreement terms ──────────────────────────────────────────────
  //
  // The frame writes every agreement it names with these terms at creation
  // (`agreementTermsFor`), so they are planned here and not written: the
  // lines below take them. What the frame does not name, a one-person
  // company's agreement with the prime it sells to, is written by the
  // people step with net days alone and brought to the prime's standard
  // paper below.
  const agreements = planAgreementTerms(frame)

  // ── 2. Bench pay ────────────────────────────────────────────────────
  const companies = await io.readCompanies()
  const companyById = new Map(companies.map((c) => [c.id, c]))
  const policies = planBenchPolicies(frame)
  const policyGroups = new Map<string, string[]>()
  for (const firmId of shareOf([...policies.keys()].sort(), share)) {
    const want = policies.get(firmId)!
    const have = companyById.get(firmId)
    if (!have) continue
    const same =
      have.benchPolicy === want.benchPolicy && have.benchRateBps === want.benchRateBps &&
      have.benchCarryDays === want.benchCarryDays && have.reserveBps === want.reserveBps &&
      have.reserveOnExit === want.reserveOnExit
    if (same) continue
    const k = canonical(want)
    policyGroups.set(k, [...(policyGroups.get(k) ?? []), firmId])
  }
  for (const ids of policyGroups.values()) {
    await io.updateCompanies(ids, policies.get(ids[0])!)
    out.benchFirms += ids.length
  }

  // ── 3. The lines ────────────────────────────────────────────────────
  const { sell, buy, links } = await io.readLines()
  if (sell.length === 0 && buy.length === 0) return out

  const firmOf = (id: string): ScaleFirm | undefined => frame.byId.get(id)
  const solo = (companyId: string | null) =>
    !!companyId && (companyById.get(companyId)?.kind === 'CONSULTANT_CORP' || firmOf(companyId)?.position === 'SOLO')
  const nameOf = (id: string) => companyById.get(id)?.name ?? firmOf(id)?.name ?? 'Supplier'

  // A one-person company sells on its buyer's standard subcontract, the
  // same paper the buyer gives every sub-vendor.
  for (const l of sell) {
    if (!solo(l.companyId) || !l.msaId || agreements.has(l.msaId)) continue
    const buyer = firmOf(l.clientCompanyId)
    if (!buyer) continue
    const t = { agreementId: l.msaId, relationship: 'PRIME' as const }
    agreements.set(l.msaId, {
      buyerId: buyer.id, sellerId: l.companyId,
      terms: agreementTermsFor(t, buyer, { runByMsp: frame.mspOf(buyer.id) !== null, industries: frame.industries }),
    })
  }
  const soloIds = shareOf([...agreements.keys()].filter((id) => !frame.trades.some((t) => t.agreementId === id)).sort(), share)
  const onFile = soloIds.length ? await io.readAgreements(soloIds) : []
  out.agreementsMissing = soloIds.length - onFile.length
  // One standard agreement per buyer, so one write per buyer whose paper differs.
  const byBuyer = new Map<string, string[]>()
  const byFloor = new Map<number, string[]>()
  for (const row of onFile) {
    const plan = agreements.get(row.id)!
    if (buyerTermsDiffer(row, buyerTermsOf(plan.terms))) byBuyer.set(plan.buyerId, [...(byBuyer.get(plan.buyerId) ?? []), row.id])
    if (row.minMarginPct !== plan.terms.minMarginPct) byFloor.set(plan.terms.minMarginPct, [...(byFloor.get(plan.terms.minMarginPct) ?? []), row.id])
  }
  const touched = new Set<string>()
  for (const ids of byBuyer.values()) {
    await io.updateAgreements(ids, buyerTermsOf(agreements.get(ids[0])!.terms))
    ids.forEach((id) => touched.add(id))
  }
  for (const [floor, ids] of byFloor) {
    await io.updateAgreements(ids, { minMarginPct: floor })
    ids.forEach((id) => touched.add(id))
  }
  out.agreements = touched.size

  // The agreement between a seller and its buyer, by the line's own pointer first.
  const agreementByPair = new Map<string, string>()
  for (const [id, a] of agreements) agreementByPair.set(`${a.buyerId}|${a.sellerId}`, id)
  const termsFor = (buyerId: string, sellerId: string, msaId: string | null): { id: string; terms: AgreementTerms } | null => {
    const id = (msaId && agreements.has(msaId) ? msaId : null) ?? agreementByPair.get(`${buyerId}|${sellerId}`) ?? null
    return id ? { id, terms: agreements.get(id)!.terms } : null
  }

  // Every buyer-and-seller pair a line sits on.
  const sellOnPair = new Map<string, SellRow[]>()
  const buyOnPair = new Map<string, BuyRow[]>()
  for (const s of sell) {
    const k = `${s.clientCompanyId}|${s.companyId}`
    sellOnPair.set(k, [...(sellOnPair.get(k) ?? []), s])
  }
  const buyById = new Map(buy.map((b) => [b.id, b]))
  for (const b of buy) {
    if (!b.vendorCompanyId) continue
    const k = `${b.companyId}|${b.vendorCompanyId}`
    buyOnPair.set(k, [...(buyOnPair.get(k) ?? []), b])
  }
  const allPairs = [...new Set([...sellOnPair.keys(), ...buyOnPair.keys()])].sort()

  // Headers for every pair, numbered over the whole world before slicing,
  // so a number never depends on which share raised it.
  const ordered = (b: BuyRow) => b.contractType !== 'W2' && !!b.vendorCompanyId && !solo(b.vendorCompanyId)
  const headers = new Map<string, OrderRow>()
  const taken = new Map<string, Set<string>>()
  for (const pair of allPairs) {
    const [buyerId, sellerId] = pair.split('|')
    if (solo(sellerId)) continue // paid through their own company: the terms they agreed, never an order
    const liveSell = (sellOnPair.get(pair) ?? []).filter((s) => live(s, birthday))
    const liveBuy = (buyOnPair.get(pair) ?? []).filter((b) => live(b, birthday) && ordered(b))
    const on = liveSell.length ? liveSell : liveBuy
    if (on.length === 0) continue
    const start = new Date(Math.min(...on.map((l) => l.startDate.getTime())))
    const end = on.some((l) => l.endDate === null) ? null : new Date(Math.max(...on.map((l) => l.endDate!.getTime())))
    const cents = liveSell.length
      ? liveSell.reduce((n, s) => n + s.billRate * CEILING_HOURS_A_WEEK * weeksBetween(s.startDate, s.endDate), 0)
      : liveBuy.reduce((n, b) => n + (b.candidates[0]?.payRate ?? 0) * CEILING_HOURS_A_WEEK * weeksBetween(b.startDate, b.endDate), 0)
    if (cents <= 0) continue // an order needs a ceiling, and none can be stated
    const a = termsFor(buyerId, sellerId, liveSell[0]?.msaId ?? null)
    const base = orderNumbers({ buyerId, sellerId, on: start })
    const used = taken.get(buyerId) ?? new Set<string>()
    let n = 1
    while (used.has(orderNumberAttempt(base.number, n))) n++
    const number = orderNumberAttempt(base.number, n)
    used.add(number)
    taken.set(buyerId, used)
    const rhythm = a ? { ...ORDER_RHYTHM, ...headerRhythmFrom(doorTerms(a.terms, a.id)) } : ORDER_RHYTHM
    const window = headerWindow({ start, end })
    headers.set(pair, {
      id: rateId(`order/${buyerId}/${sellerId}`),
      number, sellerNumber: base.sellerNumber,
      title: firmOf(buyerId)?.position === 'CLIENT' ? `Contingent staffing — ${nameOf(sellerId)}` : `Subcontract — ${nameOf(sellerId)}`,
      issuedById: buyerId, issuedToId: sellerId, recordedById: buyerId,
      amount: Math.ceil(cents / 100), currency: 'USD', billingBasis: 'TIME',
      billFrequency: rhythm.billFrequency, billAnchor: rhythm.billAnchor, billStraddle: rhythm.billStraddle,
      // The agreement's net days; with no agreement, the line's own, as the
      // award passes the cascade's; a header with only a buy line and no
      // paper reads the column's own default.
      paymentTerms: a?.terms.paymentTerms ?? liveSell[0]?.paymentTerms ?? 30,
      paymentTermsFrom: a?.terms.paymentTermsFrom ?? null,
      autoApproveTimesheets: false,
      msaId: a?.id ?? null,
      engagementId: liveSell[0]?.engagementId ?? null,
      status: 'OPEN',
      startDate: window.startDate, endDate: window.endDate,
    })
  }

  const pairs = shareOf(allPairs, share)
  const sellUpdates: SellUpdate[] = []
  const buyUpdates: BuyUpdate[] = []
  const liveSellHere: SellRow[] = []
  for (const pair of pairs) {
    const [buyerId, sellerId] = pair.split('|')
    const header = headers.get(pair) ?? null
    for (const s of sellOnPair.get(pair) ?? []) {
      const isLive = live(s, birthday)
      if (isLive) liveSellHere.push(s)
      // A line that recorded why it differs keeps every term it says; it
      // only joins its order. Otherwise it takes the agreement's terms, or,
      // with no agreement, the rhythm of the order it joins.
      const own = s.termsDifferReason !== null
      const a = own ? null : termsFor(buyerId, sellerId, s.msaId)
      const fromHeader = !own && !a && isLive && header !== null
      const want: SellUpdate = {
        id: s.id,
        workOrderId: isLive && header ? header.id : s.workOrderId,
        billFrequency: a ? a.terms.billFrequency : fromHeader ? ORDER_RHYTHM.billFrequency : s.billFrequency,
        billAnchor: a ? a.terms.billAnchor : fromHeader ? ORDER_RHYTHM.billAnchor : s.billAnchor,
        billStraddle: a ? a.terms.billStraddle : fromHeader ? ORDER_RHYTHM.billStraddle : s.billStraddle,
        paymentTerms: a ? a.terms.paymentTerms : s.paymentTerms,
        paymentTermsFrom: a ? a.terms.paymentTermsFrom : s.paymentTermsFrom,
      }
      if (
        want.workOrderId !== s.workOrderId || want.billFrequency !== s.billFrequency || want.billAnchor !== s.billAnchor ||
        want.billStraddle !== s.billStraddle || want.paymentTerms !== s.paymentTerms || want.paymentTermsFrom !== s.paymentTermsFrom
      ) sellUpdates.push(want)
    }
    for (const b of buyOnPair.get(pair) ?? []) {
      if (b.contractType === 'W2' && b.workOrderId) out.w2WithOrder++
      const a = b.termsDifferReason ? null : termsFor(b.companyId, b.vendorCompanyId!, null)
      const want: BuyUpdate = {
        id: b.id,
        workOrderId: live(b, birthday) && ordered(b) && header ? header.id : b.workOrderId,
        paymentTermsFrom: a ? a.terms.paymentTermsFrom : b.paymentTermsFrom,
      }
      if (want.workOrderId !== b.workOrderId || want.paymentTermsFrom !== b.paymentTermsFrom) buyUpdates.push(want)
    }
  }
  for (const b of buy) if (!b.vendorCompanyId && b.contractType === 'W2' && b.workOrderId) out.w2WithOrder++

  // Headers first: a line cannot point at an order that is not there.
  const wantedHeaders = pairs.map((p) => headers.get(p)).filter((h): h is OrderRow => !!h)
  if (wantedHeaders.length) {
    const have = await io.readExisting('workOrder', wantedHeaders.map((h) => h.id))
    const missing = wantedHeaders.filter((h) => !have.has(h.id))
    if (missing.length) out.orders = await io.createOrders(missing)
  }
  if (sellUpdates.length) out.sellLines = await io.setSellLines(sellUpdates)
  if (buyUpdates.length) out.buyLines = await io.setBuyLines(buyUpdates)

  if (liveSellHere.length === 0) return out

  // ── 4. The opening rate, and a rise or two asked for ────────────────
  const buyOf = new Map<string, BuyRow[]>()
  for (const l of links) {
    const b = buyById.get(l.buyContractId)
    if (b) buyOf.set(l.sellContractId, [...(buyOf.get(l.sellContractId) ?? []), b])
  }
  const seats = await io.readFirstSeats([...new Set(liveSellHere.map((s) => s.companyId))])
  const rateRows: RateRow[] = []
  for (const s of liveSellHere) {
    const seat = seats.get(s.companyId)
    if (!seat) continue
    const opening = (side: 'SELL' | 'BUY', contractId: string, rate: number): RateRow => ({
      id: rateId(`rate/${side}/${contractId}/opening`), contractType: side, contractId, rate, rateType: 'HOURLY',
      fromDate: s.startDate, toDate: null, reason: 'Agreed at award', changedById: seat, previousRate: null,
      approvalState: 'APPROVED', approvedById: seat, approvedAt: s.startDate, createdAt: s.startDate,
    })
    rateRows.push(opening('SELL', s.id, s.billRate))
    for (const b of buyOf.get(s.id) ?? []) {
      const pay = b.candidates.find((c) => c.personId === s.personId) ?? b.candidates[0]
      if (pay && pay.payRate > 0) rateRows.push(opening('BUY', b.id, pay.payRate))
    }
    if (parseInt(createHash('sha256').update(`rise/${s.id}`).digest('hex').slice(0, 8), 16) % RISE_ONE_IN === 0) {
      rateRows.push({
        id: rateId(`rate/SELL/${s.id}/rise`), contractType: 'SELL', contractId: s.id,
        rate: Math.round((s.billRate * 1.04) / 100) * 100, rateType: 'HOURLY',
        fromDate: new Date(birthday.getTime() + 30 * DAY), toDate: null,
        reason: 'Asked for at renewal: the market for this skill has moved.',
        changedById: seat, previousRate: s.billRate,
        approvalState: 'PROPOSED', approvedById: null, approvedAt: null,
        createdAt: new Date(birthday.getTime() - 2 * DAY),
      })
    }
  }
  if (rateRows.length) {
    const have = await io.readExisting('rateHistory', rateRows.map((r) => r.id))
    const missing = rateRows.filter((r) => !have.has(r.id))
    if (missing.length) out.rateRows = await io.createRateRows(missing)
  }

  // ── 5. Due dates, on the live lines only ────────────────────────────
  //
  // By `planCyclesFor`, the rule `writeCyclesFor` writes with, handed the
  // company's weekend rule and payroll so it reads nothing, and floored at
  // the world's birthday: the generated weeks before it carry no
  // timesheets, so a reminder for one would be overdue for ever.
  const dated = liveSellHere.filter((s) => s.endDate !== null)
  const lineIds = dated.flatMap((s) => [s.id, ...(buyOf.get(s.id) ?? []).map((b) => b.id)])
  const theirs = lineIds.length ? await io.readLinesWithOtherCycles(lineIds) : new Set<string>()
  const holidayRows = await io.readHolidays([...new Set(dated.flatMap((s) => [s.companyId, s.clientCompanyId]))])
  const holidaysOf = new Map<string, HolidayRow[]>()
  for (const h of holidayRows) holidaysOf.set(h.companyId, [...(holidaysOf.get(h.companyId) ?? []), h])

  const cycles = new Map<string, CycleRow>()
  for (const s of dated) {
    const company = companyById.get(s.companyId)
    if (!company || theirs.has(s.id)) continue
    const below = (buyOf.get(s.id) ?? []).find((b) => !theirs.has(b.id)) ?? null
    const [y0, y1] = [s.startDate.getUTCFullYear(), s.endDate!.getUTCFullYear()]
    const site = s.siteCountry ?? 'US'
    const holidays = holidayKeysFrom(holidaysOf.get(s.clientCompanyId) ?? [], y0, y1, site,
      holidayKeysFrom(holidaysOf.get(s.companyId) ?? [], y0, y1, site))
    const planned = await planCyclesFor(NO_READS, {
      sell: { id: s.id, startDate: s.startDate, endDate: s.endDate },
      buy: below ? { id: below.id, contractType: below.contractType, vendorCompanyId: below.vendorCompanyId } : null,
      packId: company.templatePack ?? 'US_IT',
      holidays,
      policy: policyFrom(company as Parameters<typeof policyFrom>[0]),
      payroll: chosenPayroll(company as Parameters<typeof chosenPayroll>[0]),
      noneDueBefore: birthday,
    })
    for (const r of planned.rows) {
      const line = 'sellContractId' in r ? r.sellContractId : r.buyContractId
      const id = rateId(`cycle/${line}/${r.kind}/${ymd(r.dueOn)}`)
      if (!cycles.has(id)) cycles.set(id, { id, ...r } as CycleRow)
    }
  }
  if (cycles.size) {
    const rows = [...cycles.values()]
    const have = await io.readExisting('cycle', rows.map((r) => r.id))
    const missing = rows.filter((r) => !have.has(r.id))
    if (missing.length) out.cycles = await io.createCycles(missing)
  }
  return out
}

// ── The database ──────────────────────────────────────────────────────

type Db = typeof prisma

/** The one adapter that touches a database: one query per read, `createMany` and set-based updates in batches. */
export function prismaRatesIo(db: Db = prisma): RatesIo {
  const generated = { slug: { startsWith: SCALE_SLUG_PREFIX } }
  const existingIn = async (find: (ids: string[]) => Promise<{ id: string }[]>, ids: string[]) => {
    const out = new Set<string>()
    for (const chunk of batch(ids, 5000)) for (const r of await find(chunk)) out.add(r.id)
    return out
  }
  return {
    readAgreements: (ids) =>
      db.masterAgreement.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, vendorId: true, clientId: true, paymentTerms: true, paymentTermsFrom: true,
          billFrequency: true, billAnchor: true, billStraddle: true,
          billableExpenseKinds: true, billableExpenseKindsSaid: true, currency: true, minMarginPct: true, rateCard: true,
        },
      }),
    readCompanies: () =>
      db.company.findMany({
        where: generated,
        select: {
          id: true, name: true, kind: true, templatePack: true,
          benchPolicy: true, benchRateBps: true, benchCarryDays: true, reserveBps: true, reserveOnExit: true,
          cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true, daysOff: true,
          payPeriod: true, payCalcOffsetDays: true, payDayOffsetDays: true, payDaysOfMonth: true, payCalcDaysBefore: true,
          paySettingsSetAt: true, paySettingsSetById: true,
        },
        orderBy: { id: 'asc' },
      }),
    readLines: async () => {
      const [sell, buy, links] = await Promise.all([
        db.sellContract.findMany({
          where: { company: generated },
          select: {
            id: true, companyId: true, clientCompanyId: true, personId: true, billRate: true,
            startDate: true, endDate: true, state: true, workOrderId: true, msaId: true, engagementId: true,
            paymentTerms: true, paymentTermsFrom: true, billFrequency: true, billAnchor: true, billStraddle: true,
            termsDifferReason: true, workLocation: { select: { country: true } },
          },
          orderBy: { id: 'asc' },
        }),
        db.buyContract.findMany({
          where: { company: generated },
          select: {
            id: true, companyId: true, vendorCompanyId: true, contractType: true, state: true,
            startDate: true, endDate: true, workOrderId: true, paymentTermsFrom: true, termsDifferReason: true,
            candidates: { select: { personId: true, payRate: true }, orderBy: { startDate: 'asc' } },
          },
          orderBy: { id: 'asc' },
        }),
        db.contractLink.findMany({
          where: { sellContract: { company: generated } },
          select: { sellContractId: true, buyContractId: true },
        }),
      ])
      return {
        sell: sell.map(({ workLocation, state, ...s }) => ({ ...s, state: String(state), siteCountry: workLocation?.country ?? null })),
        buy: buy.map((b) => ({ ...b, state: String(b.state), contractType: String(b.contractType) })),
        links,
      }
    },
    readHolidays: (companyIds) =>
      companyIds.length
        ? db.holiday.findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true, date: true, isRecurring: true, country: true } })
        : Promise.resolve([]),
    readFirstSeats: async (companyIds) => {
      const out = new Map<string, string>()
      if (companyIds.length === 0) return out
      for (const s of await db.context.findMany({
        where: { companyId: { in: companyIds }, type: 'EMPLOYEE' },
        select: { companyId: true, personId: true },
        orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
      })) {
        if (s.companyId && !out.has(s.companyId)) out.set(s.companyId, s.personId)
      }
      return out
    },
    readExisting: (table, ids) =>
      existingIn(
        (chunk) =>
          table === 'workOrder'
            ? db.workOrder.findMany({ where: { id: { in: chunk } }, select: { id: true } })
            : table === 'rateHistory'
              ? db.rateHistory.findMany({ where: { id: { in: chunk } }, select: { id: true } })
              : db.cycle.findMany({ where: { id: { in: chunk } }, select: { id: true } }),
        ids
      ),
    readLinesWithOtherCycles: async (lineIds) => {
      const out = new Set<string>()
      for (const chunk of batch(lineIds, 5000)) {
        for (const c of await db.cycle.findMany({
          where: { NOT: { id: { startsWith: 'cz' } }, OR: [{ sellContractId: { in: chunk } }, { buyContractId: { in: chunk } }] },
          select: { sellContractId: true, buyContractId: true },
          distinct: ['sellContractId', 'buyContractId'],
        })) {
          if (c.sellContractId) out.add(c.sellContractId)
          if (c.buyContractId) out.add(c.buyContractId)
        }
      }
      return out
    },
    updateAgreements: async (ids, data) => {
      const { rateCard, ...rest } = data
      const r = await db.masterAgreement.updateMany({
        where: { id: { in: ids } },
        data: {
          ...rest,
          ...(rateCard !== undefined ? { rateCard: rateCard === null ? Prisma.DbNull : (rateCard as unknown as Prisma.InputJsonValue) } : {}),
        },
      })
      return r.count
    },
    updateCompanies: async (ids, data) => (await db.company.updateMany({ where: { id: { in: ids } }, data })).count,
    createOrders: async (rows) => {
      let n = 0
      for (const b of batch(rows)) n += (await db.workOrder.createMany({ data: b, skipDuplicates: true })).count
      return n
    },
    setSellLines: async (rows) => {
      let n = 0
      for (const b of batch(rows)) {
        const values = Prisma.join(
          b.map((r) => Prisma.sql`(${r.id}, ${r.workOrderId}, ${r.billFrequency}, ${r.billAnchor}, ${r.billStraddle}, ${r.paymentTerms}, ${r.paymentTermsFrom})`)
        )
        n += await db.$executeRaw`
          UPDATE "SellContract" AS s
             SET "workOrderId" = v.w::text, "billFrequency" = v.f::text, "billAnchor" = v.a::text,
                 "billStraddle" = v.st::text, "paymentTerms" = v.t::int, "paymentTermsFrom" = v.pf::text,
                 "updatedAt" = now()
            FROM (VALUES ${values}) AS v(id, w, f, a, st, t, pf)
           WHERE s.id = v.id::text`
      }
      return n
    },
    setBuyLines: async (rows) => {
      let n = 0
      for (const b of batch(rows)) {
        const values = Prisma.join(b.map((r) => Prisma.sql`(${r.id}, ${r.workOrderId}, ${r.paymentTermsFrom})`))
        n += await db.$executeRaw`
          UPDATE "BuyContract" AS b
             SET "workOrderId" = v.w::text, "paymentTermsFrom" = v.pf::text, "updatedAt" = now()
            FROM (VALUES ${values}) AS v(id, w, pf)
           WHERE b.id = v.id::text`
      }
      return n
    },
    createRateRows: async (rows) => {
      let n = 0
      for (const b of batch(rows)) n += (await db.rateHistory.createMany({ data: b, skipDuplicates: true })).count
      return n
    },
    createCycles: async (rows) => {
      let n = 0
      for (const b of batch(rows)) n += (await db.cycle.createMany({ data: b, skipDuplicates: true })).count
      return n
    },
  }
}

/** `lib/seed-scale/rates` for the steps: the row half against the database. */
export const seedRates: SeedRates = async (frame, share) => {
  await seedRatesWith(frame, prismaRatesIo(), share)
}
