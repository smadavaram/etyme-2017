import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { rolesFor } from '@/lib/company-defaults'
import { progressionFigures } from '@/lib/consultant-portfolio'

/**
 * The bench's doors onto a pay rate, checked against the pay rule
 * (lib/money/pay-visibility) on 2026-09-30.
 *
 * Four routes in supply return a pay figure: the bench burn, a
 * consultant's rate history, the worker's own work page and `/api/me`.
 * The rule: a pay figure is read by the desks that run pay
 * (`consultants.cost`) or by the person it pays. Karthik Menon — a
 * delivery engineer at Teleworld who reads assignments and timesheets —
 * is the seat that must not read a colleague's pay.
 */

const perms = (kind: 'VENDOR' | 'GSI', name: string) => {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${name} is not a ${kind} role`)
  return r.permissions as string[]
}

const KARTHIK = { permissions: ['assignments.read', 'timesheets.read'], personId: 'karthik' }
const PAYROLL = { permissions: perms('GSI', 'AP & Payroll'), personId: 'desmond' }
const RECRUITER = { permissions: perms('VENDOR', 'Recruiter'), personId: 'rita' }
const OWNER = { permissions: perms('VENDOR', 'Owner'), personId: 'olive' }

const src = (p: string) => readFileSync(p, 'utf8')
const BURN = 'src/app/api/bench/burn/route.ts'
const PROGRESSION = 'src/app/api/consultants/[id]/rate-progression/route.ts'

describe('a rate history shows each figure only to the desk that reads it', () => {
  it("a delivery engineer is shown no pay, no bill rate and no margin on a colleague's rate history", () => {
    expect(progressionFigures(KARTHIK, 'amara')).toEqual({ pay: false, bill: false, margin: false })
  })

  it("a recruiter who reads consultants is shown the history without the colleague's pay", () => {
    expect(progressionFigures(RECRUITER, 'amara').pay).toBe(false)
    expect(progressionFigures(RECRUITER, 'amara').margin).toBe(false)
  })

  it('the payroll desk reads the pay on a rate history but never the bill rate or the margin', () => {
    expect(progressionFigures(PAYROLL, 'amara')).toEqual({ pay: true, bill: false, margin: false })
  })

  it('the owner reads pay, bill rate and margin on a rate history', () => {
    expect(progressionFigures(OWNER, 'amara')).toEqual({ pay: true, bill: true, margin: true })
  })

  it('a worker reads their own pay on their own rate history, and is not handed the bill rate by it', () => {
    expect(progressionFigures(KARTHIK, 'karthik')).toEqual({ pay: true, bill: false, margin: false })
  })

  it('the rate history route asks the one pay rule, writes the pay trail, and says why a figure is blank', () => {
    const s = src(PROGRESSION)
    expect(s).toMatch(/progressionFigures\(viewer, consultant\.personId\)/)
    expect(s).toMatch(/writePayTrail\(/)
    expect(s).toMatch(/PAY_WITHHELD_SAYS/)
    // The bill rate and margin no longer ride on consultants.cost.
    expect(s).not.toMatch(/canSeeCost \? billRate/)
    expect(s).not.toMatch(/canSeeCost \? margin/)
  })

  it("a worker's own rate history is the leg that pays them, never a price between two firms above them", () => {
    expect(src(PROGRESSION)).toMatch(/isSelf \? \{ supplierSellContractId: null \} : \{ companyId \}/)
  })

  it('somebody else’s rate history is never read without a firm to scope it to', () => {
    expect(src(PROGRESSION)).toMatch(/if \(!isSelf && !companyId\)/)
  })
})

describe('the bench burn is the pay desk’s page', () => {
  it('the bench burn is refused whole to a seat that does not read pay, in a sentence naming the desks and never the key', () => {
    const s = src(BURN)
    expect(s).toMatch(/canReadCostAggregates\(fieldCtx\)/)
    expect(s).toMatch(/askTheDesk\(\{\s*doing: 'Reading what the bench costs',\s*needs: READS_PAY/)
    expect(s).not.toMatch(/message: 'Requires/)
  })

  it('every person whose pay the bench burn shows to a desk goes on the access trail', () => {
    expect(src(BURN)).toMatch(/writePayTrail\(\s*caller,\s*payTrail\(/)
  })
})

describe("the worker's own pages read the worker's own pay and nobody else's", () => {
  it('the work page reads pay lines for the person signed in and for nobody named in the request', () => {
    const s = src('src/app/api/me/work/route.ts')
    expect(s).toMatch(/buyContractCandidate\.findMany\(\{\s*where: \{ personId: caller\.person\.id/)
    expect(s).not.toMatch(/searchParams\.get\('personId'\)/)
  })

  it('the work page shows the worker the rate on the leg that pays them, not a price between firms', () => {
    expect(src('src/app/api/me/work/route.ts')).toMatch(/supplierSellContractId === null/)
  })

  it('the signed-in person’s own record carries no pay figure at all', () => {
    const s = src('src/app/api/me/route.ts')
    expect(s).not.toMatch(/payRate:/)
    expect(s).not.toMatch(/buyCandidacies|buyContractCandidate/)
  })
})

describe('My benches reads a day as a person does', () => {
  it('the day a firm started marketing somebody leaves the route as a plain date, not an ISO one', () => {
    expect(src('src/app/api/me/benches/route.ts')).toMatch(/benches: data\.benches\.map\(\(b\) => \(\{ \.\.\.b, since: plainDate\(b\.since\) \}\)\)/)
  })
})
