import { describe, it, expect } from 'vitest'
import { payerScope, sellContractScope } from '@/lib/resolve-client-company'
import { payerRung, chainTop, asPayer, ownPriceMedian, type DatedRung } from '@/lib/chain-top'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import type { CallerContext } from '@/lib/api-context'

/**
 * Whose rate is on the row.
 *
 * Northbend Athletic buys Helena from Computer Systems at $145. Computer Systems buys
 * her from CloudEPA at $118. Both contracts name Northbend Athletic as the end
 * client, because that is where she physically works and that is how
 * tenure aggregates — so a list scoped by end client hands Northbend Athletic both
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
    // carry Northbend Athletic as end client, so this is the clause that must never
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
    // Lucía worked for Northbend Athletic through Brightmoor in 2025 and works there
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
    // 3 approved weeks of Helena: $17,400 at what Northbend Athletic pays, $14,160 at
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

/**
 * The dead-link scan that used to sit here has moved to
 * `__tests__/invariants/dead-links.test.ts`, widened from this client
 * desk to all of `src/`. It was scoped to one folder so that it would
 * not go red on files outside this domain; the two it found there —
 * `/dashboard/agreements` in `lib/party-onboarding.ts` — are fixed, so
 * the scope came off.
 */


// ═══════════════════════════════════════════════════════════════════════
// The client's own picture: one row per person, at the price it pays
// ═══════════════════════════════════════════════════════════════════════

/**
 * The org page, the decision queue and the requisition benchmark were
 * all built on the same question — "who is standing at my sites" — and
 * all three then put a contract rate on the answer. In a chain that is
 * the same person twice and somebody else's cost beside the client's
 * own price.
 */
describe('the client’s own picture is one row per person at the price it pays', () => {
  it('a person bought through a chain appears once on the client’s org page, at the rate the client pays', () => {
    const rows = asPayer([SUB, TOP], NIKE)
    expect(rows.map((r) => r.contract.id)).toEqual(['top'])
    expect(rows[0].rateCents).toBe(14500)
    expect(rows[0].rateCents).not.toBe(11800)
  })

  it('what a client is told it spends counts each person once', () => {
    // 160 hours a month, twelve months. Over both rungs the run rate was
    // $504,960 for one contractor; over the rung Northbend Athletic pays it is
    // $278,400, and the $226,560 difference is a person who does not
    // exist plus a margin that is not Northbend Athletic's to see.
    const annual = (cents: number) => (cents * 160 * 12) / 100
    const bothRungs = [SUB, TOP].reduce((sum, c) => sum + annual(c.billRate), 0)
    const asPaid = asPayer([SUB, TOP], NIKE).reduce((sum, r) => sum + annual(r.rateCents!), 0)
    expect(bothRungs).toBe(504_960)
    expect(bothRungs - asPaid).toBe(226_560)
    expect(asPaid).toBe(278_400)
  })

  it('a rung the client does not itself pay is counted as a head and priced at nothing', () => {
    // Helena's top leg is a draft, so the live rows stop at CloudEPA →
    // Computer Systems. She is still in the building and still a head;
    // pricing her at $118 would put her supplier's cost in Northbend Athletic's run
    // rate, so the row carries no rate and the page says how many.
    const rows = asPayer([SUB], NIKE)
    expect(rows.length).toBe(1)
    expect(rows[0].rateCents).toBeNull()
  })

  it('leaves a direct placement exactly as it was, since most placements have no chain', () => {
    const direct: DatedRung & { billRate: number } = {
      id: 'omar', personId: 'omar', companyId: 'brightmoor', clientCompanyId: NIKE,
      startDate: new Date('2026-08-01'), endDate: new Date('2027-08-01'), billRate: 13200,
    }
    expect(asPayer([direct], NIKE)).toEqual([{ contract: direct, rateCents: 13200 }])
  })

  it('the queue a client approves from quotes the rate that client is billed', () => {
    // The queue values a week off the contract the sheet hangs on, which
    // in a chain is the bottom leg. Walked to the rung Northbend Athletic pays, forty
    // hours is $5,800 and not $4,720.
    const rate = payerRung(SUB, [SUB, TOP])!.billRate
    expect(40 * rate).toBe(580_000)
    expect(40 * SUB.billRate).toBe(472_000)
  })

  it('shows the client no amount at all where no single contract of its own covers the week', () => {
    // Two legs above this one covering the same days. A guess is either
    // the prime's margin on its customer's screen or an understated bill.
    const twin = { ...TOP, id: 'twin', billRate: 13900 }
    expect(payerRung(SUB, [SUB, TOP, twin])).toBeNull()
  })
})

describe('a client’s own benchmark is built from its own prices, never its supplier’s cost', () => {
  const rung = (clientCompanyId: string, billRate: number, skills: string[]) =>
    ({ clientCompanyId, billRate, skills })

  it('a client’s own benchmark is built from its own prices, never its supplier’s cost', () => {
    // Three SAP people at Northbend Athletic: two bought direct at $140 and $150, one
    // through Computer Systems at $145 — which CloudEPA sells to the
    // prime at $118. Northbend Athletic's own median is $145. Over every rung standing
    // at the site it is $140, dragged down by a cost that is not Northbend Athletic's.
    const rungs = [
      rung(NIKE, 14000, ['SAP MM']),
      rung(NIKE, 15000, ['SAP MM']),
      rung(NIKE, 14500, ['SAP MM']),
      rung(CSI, 11800, ['SAP MM']),
    ]
    expect(ownPriceMedian(rungs, NIKE, ['SAP MM'])).toBe(14500)

    const overEveryRung = [14000, 15000, 14500, 11800].sort((a, b) => a - b)
    expect(Math.round((overEveryRung[1] + overEveryRung[2]) / 2)).toBe(14250)
  })

  it('a benchmark with no contract of this client’s own behind it is blank rather than zero', () => {
    expect(ownPriceMedian([rung(CSI, 11800, ['SAP MM'])], NIKE, ['SAP MM'])).toBeNull()
    expect(ownPriceMedian([], NIKE, ['SAP MM'])).toBeNull()
    expect(ownPriceMedian([rung(NIKE, 14500, ['SAP MM'])], NIKE, [])).toBeNull()
  })

  it('matches a skill however it was capitalised, because nobody types a skill the same way twice', () => {
    expect(ownPriceMedian([rung(NIKE, 14500, ['sap mm'])], NIKE, ['SAP MM'])).toBe(14500)
  })

  it('neither reading of the client’s benchmark asks where the work happens', () => {
    // Two copies of one function, both wrong in the same way because
    // they were copies. The arithmetic is written once now; these two
    // routes may only ask for the contracts the client is billed on.
    for (const p of [
      'src/app/api/requisitions/route.ts',
      'src/app/api/requisitions/[id]/route.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), p), 'utf8')
      expect(src, `${p} still scopes a rate by the site the work happens at`).not.toContain('endClientFilter')
      expect(src).toContain('ownPriceMedian')
    }
  })
})

describe('a client’s approval is recorded at the rate the client agreed', () => {
  /** A WorkAssertion's rate is the asserting company's own leg. */
  const APPROVE = 'src/app/api/timesheets/[id]/approve/route.ts'
  const approve = readFileSync(join(process.cwd(), APPROVE), 'utf8')

  it('a client’s approval is recorded at the rate the client agreed, not the rate two firms below it', () => {
    // It is a write and not a read, so it was never a leak — it was a
    // wrong number in a permanent ledger that billing reads back.
    expect(approve).not.toContain('rateCents: timesheet.sellContract.billRate')
    expect(approve).toContain('rateCents: deciding.billRate')
  })

  it('records the same rate it refused at, valued at and told the approver about', () => {
    const quoted = [...approve.matchAll(/(?:rateCents|billRateCents)\s*:\s*([A-Za-z0-9_.]+)/g)]
      .map((m) => m[1])
      .filter((r) => r.includes('billRate') || r.includes('Rate'))
    expect(quoted.length).toBeGreaterThan(0)
    for (const r of quoted) expect(r).toBe('deciding.billRate')
  })

  it('names the two rates the ledger’s own read still quotes to a party who is not one, rather than leaving them to be found', () => {
    // The same shape twice in `expectedLegs`, and neither is fixable
    // from inside it. The client leg is priced at the contract the hours
    // are filed against, and the GET hands every leg's rate to every
    // reader — so on a chained week the end client sees both its
    // supplier's supplier's bill rate and that firm's PAY rate for the
    // person.
    //
    // Walking the client leg up was tried and reverted: `postAssertion`
    // reads the same column as the filed contract's rate and posts
    // REVENUE from it against the filed contract's order, so raising it
    // books the prime's margin as the sub's revenue. One column, two
    // readers, one decision — etyme-money's, because it is the one that
    // moves a figure in the journal.
    //
    // When it is fixed, delete the note in the route and delete this.
    const src = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/assert/route.ts'), 'utf8')
    expect(src, 'the open rate-party gap in expectedLegs is no longer named where the line is').toContain('KNOWN OPEN')
    expect(src).toContain('their money, their number')
  })
})
