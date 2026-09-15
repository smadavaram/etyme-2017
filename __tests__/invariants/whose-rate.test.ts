import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { payerScope, sellContractScope } from '@/lib/resolve-client-company'
import { payerRung, chainTop, type DatedRung } from '@/lib/chain-top'
import { mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import type { CallerContext } from '@/lib/api-context'

/**
 * Whose rate is on the row.
 *
 * Nike buys Helena from Computer Systems at $145. Computer Systems buys
 * her from CloudEPA at $118. Both contracts name Nike as the end
 * client, because that is where she physically works and that is how
 * tenure aggregates — so a list scoped by end client hands Nike both
 * rows, and $145 − $118 is Computer Systems' entire margin, computable
 * off its own customer's screen.
 *
 * The same shape has now been found four times in this codebase: a
 * narrow helper exists beside a broad one and a caller reaches for the
 * broad one. These tests are written to fail loudly if the broad one
 * comes back.
 */

const NIKE = 'nike'
const CSI = 'computer-systems'
const CLOUDEPA = 'cloudepa'

const caller = (kind: string, companyId: string): CallerContext =>
  ({
    person: { id: 'p1', name: 'Somebody' },
    company: { id: companyId, kind },
    context: { type: 'EMPLOYEE' },
    permissions: ['*'],
  }) as unknown as CallerContext

const onBench = (personId: string, companyId: string): CallerContext =>
  ({
    person: { id: personId, name: 'Helena Marsh' },
    company: { id: companyId, kind: 'VENDOR' },
    context: { type: 'CONSULTANT' },
    permissions: [],
  }) as unknown as CallerContext

/** Helena's chain, as two rows in a database. */
const SUB: DatedRung & { billRate: number } = {
  id: 'sub', personId: 'helena', companyId: CLOUDEPA, clientCompanyId: CSI,
  startDate: new Date('2026-02-27'), endDate: new Date('2027-02-22'), billRate: 11800,
}
const TOP: DatedRung & { billRate: number } = {
  id: 'top', personId: 'helena', companyId: CSI, clientCompanyId: NIKE,
  startDate: new Date('2026-02-27'), endDate: new Date('2027-02-22'), billRate: 14500,
}

describe('a client sees the rate it pays, never the rate its supplier pays underneath', () => {
  it('scopes a client to the contracts it is itself billed on', () => {
    expect(payerScope(caller('CLIENT', NIKE))).toEqual({ clientCompanyId: NIKE })
  })

  it('never widens a client to every rung standing at its sites', () => {
    // endClientFilter is the shape that leaked: both of Helena's legs
    // carry Nike as end client, so this is the clause that must never
    // come back on a list carrying a rate.
    for (const scope of [payerScope(caller('CLIENT', NIKE)), sellContractScope(caller('CLIENT', NIKE))]) {
      expect(JSON.stringify(scope)).not.toContain('endClientCompanyId')
    }
  })

  it('has only one answer left, so there is no broad helper to pick by mistake', () => {
    // sellContractScope used to be a second, wider answer. Two routes
    // picked it and both printed a sub-vendor's rate on the client's
    // own screen. It is the same function now.
    for (const kind of ['CLIENT', 'VENDOR', 'MSP', 'GSI']) {
      expect(sellContractScope(caller(kind, 'x'))).toEqual(payerScope(caller(kind, 'x')))
    }
  })

  it('leaves a vendor seeing its own book and an MSP both sides of its own', () => {
    expect(payerScope(caller('VENDOR', CLOUDEPA))).toEqual({ companyId: CLOUDEPA })
    expect(payerScope(caller('MSP', 'kestrel'))).toEqual({
      OR: [{ companyId: 'kestrel' }, { clientCompanyId: 'kestrel' }],
    })
  })

  it('is never an empty clause, which would return every contract in the database', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'MSP', 'GSI']) {
      const scope = payerScope(caller(kind, 'x'))
      expect(scope).not.toBeNull()
      expect(Object.keys(scope!).length).toBeGreaterThan(0)
    }
  })

  it('entitles a caller with no company to nothing at all', () => {
    const homeless = {
      person: { id: 'p', name: 'Somebody' },
      company: null,
      context: { type: 'EMPLOYEE' },
      permissions: [],
    } as unknown as CallerContext
    expect(payerScope(homeless)).toBeNull()
  })
})

describe('the same person bought through a chain is one row and one rate on the client’s list', () => {
  it('walks a week filed on the bottom leg up to the contract the client pays', () => {
    expect(payerRung(SUB, [SUB, TOP])?.billRate).toBe(14500)
  })

  it('leaves a top rung where it is, because there is nothing above it', () => {
    expect(payerRung(TOP, [SUB, TOP])?.id).toBe('top')
  })

  it('leaves a direct placement alone, since most placements have no chain', () => {
    const direct: DatedRung & { billRate: number } = {
      id: 'omar', personId: 'omar', companyId: 'brightmoor', clientCompanyId: NIKE,
      startDate: new Date('2026-08-01'), endDate: new Date('2027-08-01'), billRate: 13200,
    }
    expect(payerRung(direct, [direct])?.billRate).toBe(13200)
  })

  it('keeps two separate placements for one person apart, instead of merging them into a chain', () => {
    // Lucía worked for Nike through Brightmoor in 2025 and works there
    // now through Pinnacle. Both are tops. Neither is above the other.
    const then: DatedRung & { billRate: number } = {
      id: 'then', personId: 'lucia', companyId: 'brightmoor', clientCompanyId: NIKE,
      startDate: new Date('2025-06-02'), endDate: new Date('2026-07-02'), billRate: 8900,
    }
    const now: DatedRung & { billRate: number } = {
      id: 'now', personId: 'lucia', companyId: 'pinnacle', clientCompanyId: NIKE,
      startDate: new Date('2026-08-16'), endDate: new Date('2027-08-16'), billRate: 9800,
    }
    expect(payerRung(then, [then, now])?.billRate).toBe(8900)
    expect(payerRung(now, [then, now])?.billRate).toBe(9800)
    expect(chainTop([then, now]).map((c) => c.id)).toEqual(['then', 'now'])
  })

  it('does not follow somebody else’s contract up the chain', () => {
    const other: DatedRung & { billRate: number } = {
      id: 'other', personId: 'omar', companyId: CSI, clientCompanyId: NIKE,
      startDate: new Date('2026-02-27'), endDate: null, billRate: 99900,
    }
    expect(payerRung(SUB, [SUB, other])?.id).toBe('sub')
  })

  it('returns nothing rather than a guess where two contracts both cover the week', () => {
    // A rate picked out of an unreadable chain is a number nobody can
    // stand behind, and on this screen it is either the prime's margin
    // or an understated bill.
    const twin = { ...TOP, id: 'twin', billRate: 13900 }
    expect(payerRung(SUB, [SUB, TOP, twin])).toBeNull()
  })

  it('takes the leg that covers this week when the other one is a different year', () => {
    const old = {
      ...TOP, id: 'old', billRate: 12000,
      startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31'),
    }
    expect(payerRung(SUB, [SUB, TOP, old])?.billRate).toBe(14500)
  })

  it('stops rather than looping where two firms each appear to buy from the other', () => {
    const a: DatedRung = { id: 'a', personId: 'x', companyId: 'one', clientCompanyId: 'two', startDate: new Date('2026-01-01'), endDate: null }
    const b: DatedRung = { id: 'b', personId: 'x', companyId: 'two', clientCompanyId: 'one', startDate: new Date('2026-01-01'), endDate: null }
    expect(payerRung(a, [a, b])?.id).toBe('b')
  })
})

describe('what a client has approved is valued at the rate that client is billed', () => {
  /** The screen's own arithmetic: hours at the rate the reader is owed. */
  const valued = (hours: number, rateCents: number | null) =>
    rateCents == null ? null : hours * rateCents

  it('prices a chained week at the top of the chain, not the bottom', () => {
    const rate = payerRung(SUB, [SUB, TOP])!.billRate
    expect(valued(40, rate)).toBe(40 * 14500)
    expect(valued(40, rate)).not.toBe(40 * 11800)
  })

  it('understates the client by the prime’s whole margin when it reads the wrong leg', () => {
    // 3 approved weeks of Helena: $17,400 at what Nike pays, $14,160 at
    // what its supplier pays. The $3,240 gap is the bug, and it is also
    // exactly the margin the client must not be able to compute.
    const atTop = valued(120, TOP.billRate)!
    const atSub = valued(120, SUB.billRate)!
    expect(atTop).toBe(1_740_000)
    expect(atSub).toBe(1_416_000)
    expect(atTop - atSub).toBe(324_000)
  })

  it('leaves the value blank rather than valuing an unknown rate at zero', () => {
    expect(valued(40, null)).toBeNull()
  })
})

describe('a consultant sees what they are paid and never what they are billed at', () => {
  it('gives a consultant seat only the rows that are about them', () => {
    expect(payerScope(onBench('helena', CLOUDEPA))).toEqual({ personId: 'helena' })
  })

  it('does not read their context as membership of the agency whose bench they sit on', () => {
    // Their context points at the agency. Read as employment it handed
    // a contractor the agency's whole book.
    expect(payerScope(onBench('helena', CLOUDEPA))).not.toEqual({ companyId: CLOUDEPA })
  })
})

describe('nobody is shown a button the server will refuse them', () => {
  const parties = {
    personId: 'helena',
    vendorCompanyId: CLOUDEPA,
    clientCompanyId: CSI,
    endClientCompanyId: NIKE,
  }

  it('refuses the person whose week it is, however much else they hold', () => {
    const her = { personId: 'helena', companyId: CLOUDEPA, permissions: ['*'] }
    expect(approvingOwnHours(her, parties)).toBe(true)
  })

  it('offers the buyer the signature, because approving is the buyer saying the work happened', () => {
    const nike = { personId: 'marcus', companyId: NIKE, permissions: ['timesheets.approve'] }
    expect(approvingOwnHours(nike, parties)).toBe(false)
    expect(mayApprove(nike, parties).ok).toBe(true)
  })

  it('refuses a firm that is a stranger to the week, in a sentence rather than a code', () => {
    const stranger = { personId: 'x', companyId: 'pinnacle', permissions: ['timesheets.approve'] }
    const verdict = mayApprove(stranger, parties)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('Only the company being billed for this work can approve it.')
  })
})

describe('every link on the client’s dashboard reaches a page that exists', () => {
  /**
   * The biggest card on the client's home screen pointed at
   * /dashboard/contractors, which has never existed. A bare Next 404:
   * no shell, no nav, no way back. The sidebar's own "Contractors"
   * correctly pointed at /dashboard/people all along.
   */
  const CLIENT_DESK = join(process.cwd(), 'src/app/dashboard/program')
  const DASHBOARD = join(process.cwd(), 'src/app/dashboard')

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p)
    }
    return out
  }

  /** A route resolves when its folder chain ends in a page, dynamic segments included. */
  function resolves(route: string): boolean {
    let dir = DASHBOARD
    for (const seg of route.split('/').filter(Boolean).slice(1)) {
      const literal = join(dir, seg)
      if (existsSync(literal) && statSync(literal).isDirectory()) {
        dir = literal
        continue
      }
      const dynamic = readdirSync(dir).find(
        (n) => n.startsWith('[') && statSync(join(dir, n)).isDirectory()
      )
      if (!dynamic) return false
      dir = join(dir, dynamic)
    }
    return existsSync(join(dir, 'page.tsx'))
  }

  it('sends every card, row and stat somewhere real', () => {
    const dead: string[] = []
    for (const file of walk(CLIENT_DESK)) {
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/['"`](\/dashboard\/[a-zA-Z0-9\-_/]*)['"`?]/g)) {
        const route = m[1].replace(/\/$/, '')
        if (route === '/dashboard') continue
        if (!resolves(route)) dead.push(`${route} — ${file}`)
      }
    }
    expect(dead).toEqual([])
  })

  it('knows what a dead link looks like, so the check above is not vacuous', () => {
    expect(resolves('/dashboard/contractors')).toBe(false)
    expect(resolves('/dashboard/people')).toBe(true)
  })
})
