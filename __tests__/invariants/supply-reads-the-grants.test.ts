import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayReadBenchProfit, peopleInReach, benchReachSays, FIRM_WIDE_ONLY_SAYS } from '@/lib/bench-profit'
import { opensLine, firmWideRefusal } from '@/lib/consultant-portfolio/margin-reach'
import { rateOnEndingSoon } from '@/lib/releasing-soon'
import { grantFactsFrom, reachWords } from '@/app/api/me/grants'
import { ownCommissionRow, ownCommissionsAsk, monthOf, MARGIN_WITHHELD_SAYS, type OwnRowFacts } from '@/lib/consultant-portfolio/own-commissions'
import type { GrantRow } from '@/lib/permission-grants'

/**
 * The Owner decides who sees what, by team, by role or for the whole
 * company (founder, 2026-11-08), read on supply's side: bench profit, the
 * bill rate beside a person's placement, the firm-wide money figures,
 * `/api/me`, and a person's own commissions.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const reader = (roleName: string | null, marginScope?: 'COMPANY' | 'UNIT' | 'PERSON' | 'NONE') =>
  mayReadBenchProfit({ companyName: 'Pellwright Validation Partners', companyKind: 'VENDOR', roleName, consultantSeat: false, marginScope })

describe('bench profit reads the Owner’s grants', () => {
  it('the owner, the admin and finance read the firm’s whole bench, whatever a grant says', () => {
    for (const role of ['Owner', 'Admin', 'Finance']) expect(reader(role, 'NONE')).toEqual({ ok: true, scope: 'COMPANY' })
  })

  it('a manager given margin on her team reads bench profit over her team', () => {
    expect(reader('Resource Manager', 'UNIT')).toEqual({ ok: true, scope: 'UNIT' })
  })

  it('a recruiter given margin on his own work reads bench profit over his own people', () => {
    expect(reader('Recruiter', 'PERSON')).toEqual({ ok: true, scope: 'PERSON' })
  })

  it('a recruiter with no grant is refused in a sentence naming who reads bench profit and that the Owner gives it', () => {
    const v = reader('Recruiter', 'NONE')
    expect(v).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
    if (!v.ok) {
      expect(v.message).toBe(
        'Bench profit at Pellwright Validation Partners is read by the owner, the admin and finance, and by anybody the Owner gives the right to read what placements make. ' +
          'Your seat (Recruiter) has neither. Ask the Owner.'
      )
    }
  })

  it('a grant never opens bench profit to a client or to a consultant’s own seat', () => {
    expect(mayReadBenchProfit({ companyName: 'Northbend', companyKind: 'CLIENT', roleName: 'Owner', consultantSeat: false, marginScope: 'COMPANY' })).toMatchObject({ ok: false, code: 'CLIENT' })
    expect(mayReadBenchProfit({ companyName: 'Pellwright', companyKind: 'VENDOR', roleName: null, consultantSeat: true, marginScope: 'COMPANY' })).toMatchObject({ ok: false, code: 'NOT_STAFF' })
  })

  it('the firm’s reach reads everybody, and no reach reads nobody', () => {
    expect(peopleInReach({ scope: 'COMPANY', onLinesInReach: [] })).toBeNull()
    expect([...peopleInReach({ scope: 'NONE', onLinesInReach: ['a'], readerPersonId: 'me' })!]).toEqual([])
  })

  it('a team reader sees the people placed through the team and the firm’s own people seated in it, and nobody listed on the bench alone', () => {
    const s = peopleInReach({ scope: 'UNIT', onLinesInReach: ['tobias'], seatedInUnits: ['hector'], putForwardByReader: ['noor'], readerPersonId: 'me' })!
    expect([...s].sort()).toEqual(['hector', 'tobias'])
  })

  it('an own-work reader sees the people on their own placements, the people they put forward, and themselves', () => {
    const s = peopleInReach({ scope: 'PERSON', onLinesInReach: ['noor'], seatedInUnits: ['hector'], putForwardByReader: ['ifeoma'], readerPersonId: 'me' })!
    expect([...s].sort()).toEqual(['ifeoma', 'me', 'noor'])
  })

  it('a narrowed bench says whose it is, so it never reads as the firm’s, and the firm’s says nothing', () => {
    expect(benchReachSays('UNIT', 'the Dayton team', 'Pellwright')).toBe(
      'You read bench profit for the Dayton team and every team under it: the people placed through it and the firm’s own people seated in it. ' +
        'The Owner reads Pellwright’s whole bench.'
    )
    expect(benchReachSays('PERSON', 'your team', 'Pellwright')).toContain('your own people only')
    expect(benchReachSays('COMPANY', 'your team', 'Pellwright')).toBeNull()
    expect(FIRM_WIDE_ONLY_SAYS).toContain('whole firm')
  })

  it('the bench profit route narrows the people at the query, before it reads a line, and shows a narrowed reader no course and no utilization', () => {
    const route = src('src/app/api/bench/profit/route.ts')
    expect(route).toContain('marginScope: reach?.scope')
    expect(route).toContain('benchPeopleInReach(')
    expect(route).toContain('const ids = [...names.keys()].filter(reaches)')
    expect(route.indexOf('filter(reaches)')).toBeLessThan(route.indexOf('prisma.sellContract.findMany'))
    expect(route).toContain('firmWide ? byCourse')
    expect(route).toContain('util = firmWide ? utilization(roster) : null')
  })

  it('the bench page draws the Bench profit tab for a seat holding margin by a grant, by the route’s own rule', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toMatch(/marginScope: hasPermission\(session\.permissions, 'margin\.read'\) \|\| hasPermission\(session\.permissions, 'pnl\.read'\)/)
  })
})

describe('a bill rate beside a placement is read on the lines the grant reaches', () => {
  const line = { id: 'dayton-1', billRate: 13_200, companyId: 'pellwright', clientCompanyId: 'sundara' }

  it('a seat given margin on its team reads the price on its team’s line and on no other', () => {
    const lines = { all: false, ids: new Set(['dayton-1']) }
    expect(rateOnEndingSoon({ companyId: 'pellwright', permissions: ['margin.read'], lines }, line)).toBe(13_200)
    expect(rateOnEndingSoon({ companyId: 'pellwright', permissions: ['margin.read'], lines }, { ...line, id: 'belfast-1' })).toBeNull()
  })

  it('the client reads the price it pays, whatever the supplier’s grants say', () => {
    expect(rateOnEndingSoon({ companyId: 'sundara', permissions: [], lines: { all: false, ids: new Set() } }, line)).toBe(13_200)
  })

  it('a seat with margin across the company reads every line’s price, as before', () => {
    expect(rateOnEndingSoon({ companyId: 'pellwright', permissions: ['margin.read'] }, line)).toBe(13_200)
    expect(opensLine({ all: true, ids: new Set() }, 'anything')).toBe(true)
    expect(opensLine({ all: false, ids: new Set(['a']) }, 'b')).toBe(false)
  })

  it('the consultant page, the rate history and Ending soon read the bill rate through the grant’s lines', () => {
    expect(src('src/app/api/consultants/[id]/route.ts')).toContain('opensLine(lineReach, c.id)')
    expect(src('src/app/api/consultants/[id]/rate-progression/route.ts')).toContain('opensLine(lineReach, matchedSell.id)')
    expect(src('src/app/api/rolloff/route.ts')).toContain('await billRateReach(caller)')
  })

  it('concentration and a supplier’s money are the whole firm’s, so a team or own-work grant reads neither, said in a sentence', () => {
    expect(firmWideRefusal('Concentration', { scope: 'UNIT', unitNames: ['Dayton'] }, 'Pellwright')).toBe(
      'Concentration is a figure about the whole of Pellwright. You read margin for the Dayton team, so it is read by the Owner, and by anybody the Owner gives the whole company’s margin.'
    )
    expect(src('src/app/api/vendors/concentration/route.ts')).toContain('if (!firmMargin.firm)')
    expect(src('src/app/api/vendors/risk/route.ts')).toContain('(await readsFirmMargin(caller)).firm')
  })
})

describe('/api/me says what a grant gave the seat', () => {
  const seat = { companyId: 'pellwright', roleId: 'recruiter', contextId: 'ctx-ana' }
  const g = (over: Partial<GrantRow>): GrantRow => ({
    id: 'g', companyId: 'pellwright', permission: 'margin.read', roleId: null, contextId: 'ctx-ana', scope: 'PERSON', orgUnitId: null, revokedAt: null, ...over,
  })

  it('a granted permission is in the seat’s permissions, with its reach said, beside the role’s own', () => {
    const f = grantFactsFrom(seat, ['consultants.read'], [g({ scope: 'UNIT', orgUnitId: 'dayton' })], new Map([['dayton', 'Dayton']]))
    expect(f.permissions).toEqual(['consultants.read', 'margin.read'])
    expect(f.granted).toEqual(['margin.read'])
    expect(f.grants).toEqual([
      { permission: 'margin.read', label: 'read what placements make', scope: 'UNIT', unit: { id: 'dayton', name: 'Dayton' }, reachSays: 'for the Dayton team and every team under it' },
    ])
  })

  it('a grant at another company, a revoked grant and another person’s grant give the seat nothing', () => {
    const f = grantFactsFrom(seat, ['consultants.read'], [
      g({ companyId: 'brightmoor' }),
      g({ revokedAt: new Date() }),
      g({ contextId: 'ctx-somebody-else' }),
    ], new Map())
    expect(f.permissions).toEqual(['consultants.read'])
    expect(f.granted).toEqual([])
    expect(f.grants).toEqual([])
  })

  it('the right to give access is said apart and is never a permission a screen can draw a button from', () => {
    const f = grantFactsFrom(seat, [], [g({ permission: 'grants.give', scope: 'COMPANY' })], new Map())
    expect(f.mayGiveAccess).toBe(true)
    expect(f.permissions).toEqual([])
    expect(f.grants).toEqual([])
  })

  it('a reach is said in words, never as a code', () => {
    expect(reachWords('COMPANY', null)).toBe('for the whole company')
    expect(reachWords('PERSON', null)).toBe('for your own work')
  })

  it('/api/me hands every seat its grant facts, the active one included', () => {
    const route = src('src/app/api/me/route.ts')
    expect(route.match(/\.\.\.seatFacts\(/g)?.length).toBe(2)
  })
})

describe('a person reads their own commissions', () => {
  const facts = (over: Partial<OwnRowFacts> = {}): OwnRowFacts => ({
    id: 'row-1', kind: 'RECRUITING', basis: 'SHARE_OF_MARGIN', accrueOn: 'ACCEPTED', side: 'BUY',
    firmName: 'Pellwright Validation Partners',
    person: { name: 'Noor Abernathy' }, client: { name: 'Sundara Systems' },
    rateBps: 1000, fixedCents: null, capCents: 200_000, alreadyCents: 50_000, postedCents: null, state: 'ACCRUED',
    accrual: { amountCents: 38_400, capped: false, currency: 'USD', weeks: 4, hours: 160, says: '$384.00: 10% of $3,840.00 margin over 4 weeks.', blankedBecause: null },
    ...over,
  })

  it('a recruiter with no margin reads what a share of the margin earned, and the share, and never the margin', () => {
    const r = ownCommissionRow(facts(), false)
    expect(r.says).toBe('$384.00: 10% of the margin on this placement over 4 weeks.')
    expect(r.says).not.toContain('3,840')
    expect(r.withheldSays).toBe(MARGIN_WITHHELD_SAYS)
    expect(r.thisPeriodCents).toBe(38_400)
  })

  it('a seat whose margin reaches the placement reads money’s own sentence, margin and all', () => {
    const r = ownCommissionRow(facts(), true)
    expect(r.says).toBe('$384.00: 10% of $3,840.00 margin over 4 weeks.')
    expect(r.withheldSays).toBeNull()
  })

  it('a share of what was billed is said without the bill to a seat that reads no margin', () => {
    const r = ownCommissionRow(facts({ basis: 'SHARE_OF_BILLED', accrual: { ...facts().accrual, says: '$384.00: 10% of $3,840.00 billed over 4 weeks.' } }), false)
    expect(r.says).toBe('$384.00: 10% of what was billed on this placement over 4 weeks.')
  })

  it('a fixed amount an hour is the person’s own terms, said in full', () => {
    const r = ownCommissionRow(facts({ basis: 'PER_HOUR', rateBps: null, fixedCents: 500, accrual: { ...facts().accrual, says: '$800.00: 160 accepted hours at $5.00 an hour.' } }), false)
    expect(r.rate).toBe('$5.00 an hour')
    expect(r.says).toBe('$800.00: 160 accepted hours at $5.00 an hour.')
    expect(r.withheldSays).toBeNull()
  })

  it('each row says which line it is on, which cap it is under and what was paid before, and where it stands', () => {
    const r = ownCommissionRow(facts(), false)
    expect(r.line).toBe('Noor Abernathy at Sundara Systems, on the buy line')
    expect(r.kind).toBe('Recruiting commission')
    expect(r.cap).toBe('$2,000.00 cap, $500.00 already paid before this period')
    expect(r.stateSays).toBe('Earned this period, not yet on payroll')
    expect(ownCommissionRow(facts({ capCents: null }), false).cap).toBe('No cap')
  })

  it('a share that reached its cap says so without naming the margin', () => {
    const r = ownCommissionRow(facts({ accrual: { ...facts().accrual, capped: true, amountCents: 20_000 } }), false)
    expect(r.says).toBe('$200.00: 10% of the margin on this placement over 4 weeks; the $2,000.00 cap is reached.')
  })

  it('a commission that cannot be worked out is blank with the reason, never a zero', () => {
    const r = ownCommissionRow(facts({ state: 'BLANK', accrual: { ...facts().accrual, amountCents: null, says: 'x', blankedBecause: 'The weeks are billed in USD and EUR, and two currencies are never added.' } }), false)
    expect(r.thisPeriodCents).toBeNull()
    expect(r.says).toBe('The weeks are billed in USD and EUR, and two currencies are never added.')
  })

  it('nobody reads another person’s commissions on this page, and the refusal says where the firm’s are read', () => {
    expect(ownCommissionsAsk('me', null)).toEqual({ ok: true })
    expect(ownCommissionsAsk('me', 'me')).toEqual({ ok: true })
    const no = ownCommissionsAsk('me', 'somebody')
    expect(no.ok).toBe(false)
    if (!no.ok) expect(no.says).toContain('Payroll, Commissions')
  })

  it('a month is read as year and month, and anything else is not a month', () => {
    expect(monthOf('2026-02')).toEqual({ from: new Date('2026-02-01T00:00:00Z'), to: new Date('2026-02-28T00:00:00Z') })
    expect(monthOf('2026-13')).toBeNull()
    expect(monthOf('November')).toBeNull()
  })
})
