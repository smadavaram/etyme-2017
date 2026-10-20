/**
 * The generated world's rates, worked out with no database.
 *
 * Supply, demand and regulatory import this before any row exists, so it
 * is pure and deterministic: the same role, industry and key always give
 * the same figures, on every machine and every day. Every figure is
 * integer cents per hour, in USD; the generated world bills and pays in
 * one currency, so nothing here ever adds two.
 *
 * The shape of a chain (docs/seed-scale-brief.md, section 3.2):
 *
 *   client ── rates[0] ──▶ rung 0 ── rates[1] ──▶ rung 1 ── … ──▶ worker
 *
 * A placement `rungs` deep has `rungs + 1` rates. Rung r is the r-th
 * supplier from the top: it bills `rates[r]` to the firm above it and
 * pays `rates[r + 1]` to the party below — a sub-vendor's invoice, or,
 * at the last rung, the worker. The last rate is the worker's **W2
 * wage**: the conservative reading, because a wage paid to somebody
 * engaged corp-to-corp only makes the firm's margin larger, while a
 * corp-to-corp rate paid as a wage would push it under the floor once
 * the employer's taxes are added. `pricedLine` prices the corp-to-corp
 * line from the same cost.
 *
 * The rules this file holds, each a sentence in
 * `__tests__/invariants/seed-scale-rates.test.ts`:
 *
 *   · the client sees only the rung it pays (`seenBy`)
 *   · a sub-vendor's rate never exceeds the prime's: rates fall at every rung
 *   · pay never exceeds bill at the same rung
 *   · every rung keeps at least its floor (`MasterAgreement.minMarginPct`),
 *     a W2 line counted after its burden
 *   · a W2 pay line carries the employer's burden; a corp-to-corp line has none
 *   · a floor no chain can clear is refused, never priced
 *
 * The two margin classes (Addendum D, `Requirement.marginClass`):
 * ARBITRAGE is margin that lives in the opacity between rungs, so the
 * firms that pass a person through keep a fuller share; EXPERTISE is
 * margin that lives where the capability is, so the firm that employs,
 * trains and keeps the person earns more and the pass-through rungs
 * less. Neither is treated as extractive by default.
 */

import type {
  Band,
  ChainRates,
  IndustryKey,
  PersonFacts,
  RatePair,
  RoleTemplate,
  Seniority,
} from '@/lib/seed-scale/types'
import { DEFAULT_BURDEN } from '@/lib/profitability'

// ── Deterministic randomness ─────────────────────────────────────────
//
// The same mulberry32 and FNV-1a as `lib/demo-volume`, whose copies are
// not exported. When the architect's `lib/seed-scale/kit` lands with
// `rng` and `hash`, these two are replaced by its import; the algorithm
// is identical, so no figure moves.

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** One draw in [0, 1), keyed. A separate key per question, so adding a question moves no other answer. */
function draw(key: string): number {
  return rng(hash(key))()
}

// ── Constants ─────────────────────────────────────────────────────────

/** The deepest chain the generated world builds: client, prime, sub-vendor, bench firm, worker. */
export const MAX_RUNGS = 4

/** The burden on a W2 wage: employer FICA, FUTA, SUTA, workers' comp, benefits. One figure, `lib/profitability`'s. */
export const W2_BURDEN = DEFAULT_BURDEN.W2

/**
 * The margin floor every generated agreement may carry, in whole percent
 * of the bill rate. Every margin drawn below is at or above it, so an
 * agreement that sets it is never broken by the generator.
 */
export const DEFAULT_FLOOR_PCT = 8

/** The federal minimum wage, cents per hour. No generated W2 wage goes under it. */
export const FEDERAL_MINIMUM_WAGE_CENTS = 725

/** A year's rate progression, for a line priced in the past. */
export const YEARLY_RAISE = 0.03

export type MarginClass = 'ARBITRAGE' | 'EXPERTISE'

/** Margin as a share of the rung's own bill: [low, high]. */
const MARGINS: Record<MarginClass, { passThrough: [number, number]; employer: [number, number] }> = {
  // The spread lives between the rungs.
  ARBITRAGE: { passThrough: [0.1, 0.16], employer: [0.16, 0.22] },
  // The spread lives where the person is employed, trained and kept.
  EXPERTISE: { passThrough: [0.08, 0.11], employer: [0.22, 0.3] },
}

// ── Bands ─────────────────────────────────────────────────────────────

/**
 * What a US client pays per hour for a role, in whole dollars, by
 * industry and seniority. The rate on the client's invitation, rung 0.
 */
const BASE: Record<IndustryKey, Record<Seniority, [number, number]>> = {
  // Junior developer or analyst; mid Java developer; senior architect.
  IT: { JUNIOR: [60, 85], MID: [90, 125], SENIOR: [125, 170] },
  // Nursing assistant or tech; travel or staff nurse, therapist; nurse practitioner.
  HEALTHCARE: { JUNIOR: [34, 50], MID: [85, 120], SENIOR: [120, 175] },
  // Operator or assembler; CNC programmer, quality technician; validation or process engineer.
  MANUFACTURING: { JUNIOR: [30, 45], MID: [50, 75], SENIOR: [85, 125] },
  // Payables or reconciliation clerk; treasury or financial analyst; controller.
  FINANCE: { JUNIOR: [40, 60], MID: [65, 95], SENIOR: [110, 160] },
}

/**
 * Titles a reader would check first, at their own rate. Matched as words
 * inside the title, in lower case; the seniority still moves them.
 * Whole dollars, at MID.
 */
const ANCHORS: { words: string; band: [number, number] }[] = [
  { words: 'travel nurse', band: [90, 125] },
  { words: 'validation engineer', band: [85, 120] },
  { words: 'cnc programmer', band: [48, 70] },
  { words: 'treasury analyst', band: [65, 90] },
  { words: 'java developer', band: [90, 125] },
]

const SENIORITY_OFF_MID: Record<Seniority, number> = { JUNIOR: 0.8, MID: 1, SENIOR: 1.25 }

/** A licensed title carries a premium: fewer people can lawfully do the work. */
const LICENSED_PREMIUM = 1.06

const dollarsDown = (cents: number) => Math.floor(cents / 100) * 100
const dollarsUp = (cents: number) => Math.ceil(cents / 100) * 100

/**
 * The band a client sets for a role: the band on the job's invitation,
 * never on the job (CLAUDE.md, "Rate bands live on RequirementInvitation").
 */
export function bandFor(role: RoleTemplate, industry: IndustryKey): Band {
  const title = role.title.toLowerCase()
  const anchor = ANCHORS.find((a) => title.includes(a.words))
  const [lo, hi] = anchor
    ? [anchor.band[0] * SENIORITY_OFF_MID[role.seniority], anchor.band[1] * SENIORITY_OFF_MID[role.seniority]]
    : BASE[industry][role.seniority]
  // Two roles of one seniority do not pay the same: up to 7% either way, by title.
  const tilt = anchor ? 1 : 0.93 + 0.14 * draw(`band/${industry}/${role.title}`)
  const lift = (role.licensed ? LICENSED_PREMIUM : 1) * tilt
  return { minCents: dollarsDown(lo * 100 * lift), maxCents: dollarsUp(hi * 100 * lift), currency: 'USD' }
}

/**
 * The margin class a job for this role carries: specialist work earns an
 * expertise margin, commodity work an arbitrage one. Demand writes it on
 * `Requirement.marginClass`; `pairFor` reads the same answer, so a job
 * and the lines placed on it agree.
 */
export function marginClassFor(role: RoleTemplate): MarginClass {
  return role.seniority === 'SENIOR' || role.licensed ? 'EXPERTISE' : 'ARBITRAGE'
}

// ── Chains ────────────────────────────────────────────────────────────

export interface ChainOptions {
  /** Defaults to ARBITRAGE, the thinner shape at the firm that employs. */
  marginClass?: MarginClass
  /** Each rung's floor, whole percent; one number for every rung. Defaults to `DEFAULT_FLOOR_PCT`. */
  floorPct?: number
  /** Years before today the line was priced; each takes a year's raise off the top. */
  yearsBack?: number
}

/**
 * Rung rates for a placement `rungs` deep, inside the band, top first.
 *
 * Each rung's share is drawn from its own key (`<key>/rung/<r>`), so a
 * rung's draw does not depend on how deep the chain is: the same person
 * passed through one firm or three keeps the same top rate and the same
 * first spread. Every rate is floored to a whole dollar, which can only
 * widen a margin, never narrow it.
 */
export function chainFor(band: Band, rungs: number, key: string, options: ChainOptions = {}): ChainRates {
  if (!Number.isInteger(rungs) || rungs < 1 || rungs > MAX_RUNGS) {
    throw new RangeError(`A chain is one to ${MAX_RUNGS} suppliers deep; ${rungs} was asked for.`)
  }
  if (!(band.minCents > 0) || band.maxCents < band.minCents) {
    throw new RangeError(`A band of ${band.minCents} to ${band.maxCents} cents cannot be priced.`)
  }
  const shape = MARGINS[options.marginClass ?? 'ARBITRAGE']
  const floor = (options.floorPct ?? DEFAULT_FLOOR_PCT) / 100
  if (floor < 0 || floor >= 1) throw new RangeError(`A margin floor of ${options.floorPct}% cannot be met.`)

  // The client's rate: toward the middle of the band, never at its edges.
  const at = 0.3 + 0.5 * draw(`${key}/top`)
  const deflate = Math.pow(1 - YEARLY_RAISE, Math.max(0, options.yearsBack ?? 0))
  const top = Math.max(band.minCents, dollarsDown((band.minCents + (band.maxCents - band.minCents) * at) * deflate))

  const rates: number[] = [top]
  for (let r = 0; r < rungs; r++) {
    const employer = r === rungs - 1
    const [lo, hi] = employer ? shape.employer : shape.passThrough
    const share = Math.max(floor, lo + (hi - lo) * draw(`${key}/rung/${r}`))
    const bill = rates[r]
    // The employer's share is counted after the burden on the wage it pays.
    const next = employer ? Math.floor((bill * (1 - share)) / (1 + W2_BURDEN)) : dollarsDown(bill * (1 - share))
    if (next <= 0) {
      throw new RangeError(
        `A ${Math.round(floor * 100)}% floor at each of ${rungs} rungs leaves nothing to pay the worker on a ` +
          `$${(top / 100).toFixed(0)} rate; the chain is refused rather than priced below its floor.`
      )
    }
    rates.push(next)
  }
  return rates
}

// ── One line ──────────────────────────────────────────────────────────

type PersonKey = Pick<PersonFacts, 'id' | 'role' | 'industry'>

export interface PairOptions {
  marginClass?: MarginClass
  floorPct?: number
  yearsBack?: number
}

/** The chain one person sits in, keyed on them, so every rung of one placement reads the same chain. */
export function chainOf(person: PersonKey, rungs: number, options: PairOptions = {}): ChainRates {
  return chainFor(bandFor(person.role, person.industry), rungs, `rate/${person.id}`, {
    marginClass: options.marginClass ?? marginClassFor(person.role),
    floorPct: options.floorPct,
    yearsBack: options.yearsBack,
  })
}

/**
 * One line's bill and pay rate, for a person at one rung.
 *
 * At the last rung the pay is a W2 wage; `pricedLine` gives the
 * corp-to-corp rate for the same cost. The rung below always bills
 * exactly what this rung pays, because both read one chain.
 */
export function pairFor(person: PersonKey, rung: number, rungs: number, options: PairOptions = {}): RatePair {
  if (!Number.isInteger(rung) || rung < 0 || rung >= rungs) {
    throw new RangeError(`Rung ${rung} is not on a chain ${rungs} deep.`)
  }
  const chain = chainOf(person, rungs, options)
  return { billCents: chain[rung], payCents: chain[rung + 1], currency: 'USD' }
}

/** How the party below a rung is engaged, in `lib/profitability`'s words. */
export type EngagedAs = 'W2' | 'C2C' | 'IND_1099'

export interface PricedLine extends RatePair {
  rung: number
  engagedAs: EngagedAs
  /** Share of pay the employer adds on top: 0.22 on a W2 wage, nothing otherwise. */
  burden: number
  /** What one hour costs the firm at this rung: pay plus burden. */
  costCents: number
  /** (bill − cost) ÷ bill, in percent to one decimal. */
  marginPct: number
}

/**
 * A line priced as the firm at this rung actually pays it.
 *
 * Above the last rung the firm pays a sub-vendor's invoice, which is
 * corp-to-corp by definition, and a W2 line there is refused. At the
 * last rung a W2 wage carries the burden; a corp-to-corp or 1099 rate
 * carries none and is the wage plus what the burden would have cost,
 * floored to a dollar, so the firm's cost is never higher than on the W2
 * line and the margin floor holds either way.
 */
export function pricedLine(
  person: PersonKey,
  rung: number,
  rungs: number,
  engagedAs: EngagedAs,
  options: PairOptions = {}
): PricedLine {
  const pair = pairFor(person, rung, rungs, options)
  const last = rung === rungs - 1
  if (!last && engagedAs === 'W2') {
    throw new RangeError(`Rung ${rung} of ${rungs} pays a sub-vendor's invoice, not a wage; it cannot be a W2 line.`)
  }
  const burden = last && engagedAs === 'W2' ? W2_BURDEN : 0
  const payCents = last && engagedAs !== 'W2' ? dollarsDown(pair.payCents * (1 + W2_BURDEN)) : pair.payCents
  const costCents = Math.round(payCents * (1 + burden))
  return {
    billCents: pair.billCents,
    payCents,
    currency: 'USD',
    rung,
    engagedAs,
    burden,
    costCents,
    marginPct: Math.round(((pair.billCents - costCents) / pair.billCents) * 1000) / 10,
  }
}

// ── Who sees what ─────────────────────────────────────────────────────

/**
 * The rates one party may read on a chain. The client reads the one it
 * pays and nothing below it (`lib/chain-top`); a rung reads what it bills
 * and what it pays, and nothing above or below those two.
 */
export function seenBy(chain: ChainRates, party: 'CLIENT' | number): number[] {
  if (party === 'CLIENT') return [chain[0]]
  if (!Number.isInteger(party) || party < 0 || party >= chain.length - 1) {
    throw new RangeError(`Rung ${party} is not on a chain ${chain.length - 1} deep.`)
  }
  return [chain[party], chain[party + 1]]
}

// ── A person on a bench ───────────────────────────────────────────────

/**
 * The range a person is listed at on a bench: what the firm employing
 * them bills the firm above, from a chain three deep (the lowest) to two
 * deep (the highest) — a bench firm usually sells to a prime or a
 * sub-vendor, not to the client itself.
 */
export function listingRate(person: PersonKey): Band {
  const bottomBill = (rungs: number) => chainOf(person, rungs)[rungs - 1]
  return { minCents: bottomBill(3), maxCents: bottomBill(2), currency: 'USD' }
}

/**
 * The lowest rate a person will take: the lowest W2 wage any chain up to
 * `MAX_RUNGS` deep pays them, so every placement the generator makes for
 * their own role clears it. The sift compares it with a job's top rate
 * (`rateWorks` in lib/bench-filter), and it is always under the top of
 * their role's band, so nobody is sifted out of their own trade.
 */
export function floorFor(person: PersonKey): number {
  let lowest = Number.POSITIVE_INFINITY
  for (let rungs = 1; rungs <= MAX_RUNGS; rungs++) lowest = Math.min(lowest, chainOf(person, rungs)[rungs])
  return lowest
}
