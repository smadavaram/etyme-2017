import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  rateBoxLabel, tierShown, TIER_BEFORE_YES, alreadyAskedSays, tierBoxHiddenSays, NOBODY_FOUND_SAYS,
  saysNobodyFound, askedOntoBenchSays, freeOnTheBench, ON_A_PLACEMENT_TODAY, readBench, type Free,
} from '@/lib/bench-filter'
import { firmKnowsForBench, nameAskedUnder, askedLastWindow } from '@/lib/consultant-portfolio/before-her-yes'
import { recordKeptBy } from '@/lib/consultant-portfolio/firm-view'
import { whoAsksOntoBenchSays, whoAddsSays } from '@/lib/consultant-portfolio/who-adds'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

/**
 * Layer five of the fix list, the bench (2026-11-15). Every firm and
 * person here is made up.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const BENCH_PAGE = read('src/app/dashboard/bench/page.tsx')
const CANDIDATES = read('src/app/dashboard/consultants/page.tsx')
const LISTINGS_ROUTE = read('src/app/api/bench/listings/route.ts')
const LIST_ROUTE = read('src/app/api/consultants/route.ts')
const ONE_ROUTE = read('src/app/api/consultants/[id]/route.ts')
const SCORECARDS = read('src/app/dashboard/scorecards/page.tsx')

describe('Add to bench says so when its search finds nobody (F1)', () => {
  it('a search of two or more characters that finds nobody says who is searched and where somebody new is added', () => {
    expect(NOBODY_FOUND_SAYS).toBe('Nobody by that name is on your Candidates. Add consultant adds them and asks them to join your bench.')
    expect(saysNobodyFound({ query: 'Wr', searching: false, searched: true, results: 0 })).toBe(true)
  })

  it('nothing is said while typing one character, while the search runs, or when somebody was found', () => {
    expect(saysNobodyFound({ query: 'W', searching: false, searched: true, results: 0 })).toBe(false)
    expect(saysNobodyFound({ query: 'Wren', searching: true, searched: false, results: 0 })).toBe(false)
    expect(saysNobodyFound({ query: 'Wren', searching: false, searched: false, results: 0 })).toBe(false)
    expect(saysNobodyFound({ query: 'Wren', searching: false, searched: true, results: 1 })).toBe(false)
  })

  it('the line links to Add consultant only for a seat that may add one, and otherwise names who adds', () => {
    expect(BENCH_PAGE).toContain("{mayAdd\n                  ? <Link href={'/dashboard/consultants?new=1' as Route}")
    expect(BENCH_PAGE).toContain(': whoAdds}')
    expect(BENCH_PAGE).toContain('mayAdd={writesBench}')
    expect(whoAddsSays({ kind: 'VENDOR', companyName: 'Northwind Staffing' })).toContain('Recruiter')
  })
})

describe('Add to bench reads what the person said (F2)', () => {
  it('somebody asked who has not answered reads as asked, never as already on the bench', () => {
    expect(alreadyAskedSays('INVITED', 'ROW')).toBe('Asked, not answered yet. You can set their rate here.')
    expect(alreadyAskedSays('INVITED', 'CHOSEN')).not.toContain('Already on your bench')
  })

  it('only somebody who said yes reads as already on your bench', () => {
    expect(alreadyAskedSays('GRANTED', 'ROW')).toMatch(/^Already on your bench\./)
    expect(alreadyAskedSays('DECLINED', 'ROW')).not.toContain('Already on your bench')
  })

  it('where the Who sees them box is not drawn, one line says why', () => {
    expect(tierBoxHiddenSays('GRANTED')).toBe('Who sees them is changed from their row on Bench.')
    expect(tierBoxHiddenSays('INVITED')).toBe('Who sees them is changed from their row on Bench once they say yes.')
    expect(BENCH_PAGE).toContain('{tierBoxHiddenSays(listed.get(selectedConsultant.id)?.consent ?? null)}')
    expect(BENCH_PAGE).not.toContain('Already on your bench — choose to set their rate')
  })
})

describe('Add to bench asks only somebody the firm knows (a)', () => {
  it('Add to bench refuses a person this firm does not know, as an id that does not exist', () => {
    expect(firmKnowsForBench({ seatHere: false, listedHereEver: false, onPartnerBench: false })).toBe(false)
    // The refusal is written before it is sent, and reads as a missing id.
    const refusal = LISTINGS_ROUTE.indexOf('if (!firmKnowsForBench(')
    expect(refusal).toBeGreaterThan(0)
    const block = LISTINGS_ROUTE.slice(refusal, LISTINGS_ROUTE.indexOf('// The name the firm asks her under'))
    expect(block.indexOf('await recordRefusal(')).toBeLessThan(block.indexOf('return NextResponse.json('))
    expect(block).toContain("{ error: { code: 'NOT_FOUND', message: 'Consultant not found' } }")
  })

  it('a firm knows somebody it employs, somebody it ever listed, and somebody a partner shows it on its bench', () => {
    expect(firmKnowsForBench({ seatHere: true, listedHereEver: false, onPartnerBench: false })).toBe(true)
    expect(firmKnowsForBench({ seatHere: false, listedHereEver: true, onPartnerBench: false })).toBe(true)
    expect(firmKnowsForBench({ seatHere: false, listedHereEver: false, onPartnerBench: true })).toBe(true)
  })

  it('Add to bench never writes or says her own name before her yes', () => {
    // Asked again on a listing taken back: the name the firm typed then.
    expect(nameAskedUnder({ existing: { firmName: 'W. Abernathy' }, email: 'wren@harborline-tech.example', shownName: 'Wren Abernathy' }))
      .toEqual({ firmName: 'W. Abernathy', says: 'W. Abernathy' })
    // A listing from before the name column: the address the firm asked at.
    expect(nameAskedUnder({ existing: { firmName: null }, email: 'wren@harborline-tech.example', shownName: 'Wren Abernathy' }))
      .toEqual({ firmName: null, says: 'wren@harborline-tech.example' })
    // The route writes and says only that name.
    expect(LISTINGS_ROUTE).not.toContain('firmName: consultant.person.name')
    expect(LISTINGS_ROUTE).not.toContain('Bench listing requested for "${consultant.person.name}"')
    expect(LISTINGS_ROUTE).toContain('askedOntoBenchSays(shown)')
  })

  it('the sentence after asking is the founder’s own, the one Rolloff says', () => {
    expect(askedOntoBenchSays('W. Abernathy')).toBe('Asked W. Abernathy to agree to be on your bench. Nobody can put them forward until they say yes.')
    expect(read('src/app/api/rolloff/[id]/resolve/route.ts')).toContain('to agree to be on your bench. Nobody can put them forward until they say yes.')
    expect(LISTINGS_ROUTE).not.toContain('Consultant must grant it before submissions can be made')
  })
})

describe('Resend and Copy link are drawn only where the seat may send (b)', () => {
  it('every Resend, Copy link and Ask to renew on Bench sits behind the one permission its route asks', () => {
    expect(BENCH_PAGE).toContain("!writesBench ? null : row.consent === 'INVITED' ? (")
    expect(BENCH_PAGE).toContain("{a.consent === 'INVITED' && writesBench && (")
    expect(BENCH_PAGE).toContain('{writesBench && <span className="flex gap-3">')
    expect(BENCH_PAGE).toContain('const writesBench = mayAddConsultant(session.permissions)')
    expect((BENCH_PAGE.match(/>Resend</g) ?? []).length).toBe(2)
    expect((BENCH_PAGE.match(/>Copy link</g) ?? []).length).toBe(3)
  })

  it('a seat that may not send reads who may, by role', () => {
    const says = whoAsksOntoBenchSays({ kind: 'VENDOR', companyName: 'Northwind Staffing' })
    expect(says).toMatch(/^Asking somebody onto the bench or sending their invitation again is done by /)
    expect(says).toContain('Recruiter')
    expect(BENCH_PAGE).toContain('{whoAsks}')
  })
})

describe('Rates are labeled in the firm’s own currency (c)', () => {
  it('the rate boxes name the firm’s currency, never a dollar sign', () => {
    expect(rateBoxLabel('LOW', 'INR')).toBe('Lowest rate per hour (INR, optional)')
    expect(rateBoxLabel('HIGH', 'gbp')).toBe('Highest rate per hour (GBP, optional)')
    expect(rateBoxLabel('LOW', null)).toBe('Lowest rate per hour (USD, optional)')
  })

  it('neither Add consultant nor Add to bench prints $/hr', () => {
    expect(CANDIDATES).not.toContain('$/hr')
    expect(BENCH_PAGE).not.toContain('$/hr')
    expect(BENCH_PAGE).toContain("{rateBoxLabel('LOW', currency)}")
  })
})

describe('Copy link stays the answer where no email can leave (d)', () => {
  it('no shipped role may ask somebody onto the bench without being able to open Bench, so Copy link is always in reach', () => {
    const kinds = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const
    const writeOnly: string[] = []
    for (const kind of kinds) {
      for (const opts of [{}, { narrowAdmin: true }, { foundingAdmin: true }]) {
        for (const r of rolesFor(kind, opts)) {
          if (hasPermission(r.permissions, 'consultants.write') && !hasPermission(r.permissions, 'consultants.read')) {
            writeOnly.push(`${kind} ${r.name}`)
          }
        }
      }
    }
    expect(writeOnly).toEqual([])
  })
})

describe('Bench’s rows read the list its tile counts (e)', () => {
  const free: Free = { state: 'NOW', on: '2026-11-15', says: 'Free now' }

  it('a person the one bench list does not name reads under the placement words, so the tile and the rows agree', () => {
    expect(freeOnTheBench(free, false)).toEqual({ state: 'PLACED', on: null, says: ON_A_PLACEMENT_TODAY })
    expect(ON_A_PLACEMENT_TODAY).toBe('On a placement')
  })

  it('a person it names, or a reading that did not say, keeps the free date read off the work', () => {
    expect(freeOnTheBench(free, true)).toEqual(free)
    expect(freeOnTheBench(free, null)).toEqual(free)
    const placed: Free = { state: 'PLACED', on: '2026-12-01', says: 'On a placement until Nov 30, 2026' }
    expect(freeOnTheBench(placed, false)).toEqual(placed)
  })

  it('the page reads the route’s onBenchToday for every row', () => {
    const r = readBench({ data: { tiers: { RETAINED: [], MARKETING: [{ id: 'l1', consent: 'GRANTED', onBenchToday: false, consultant: { id: 'c1', person: { id: 'p1', name: 'Wren Abernathy' } } }] } } })
    expect(r.ok && r.rows[0].onBenchToday).toBe(false)
    expect(BENCH_PAGE).toContain('free: freeOnTheBench(r.free, r.onBenchToday)')
  })
})

describe('The drawer on Candidates shows no tier before her yes (f)', () => {
  it('the tier is shown only on a yes, or where there is no listing to answer', () => {
    expect(tierShown('GRANTED')).toBe(true)
    expect(tierShown(null)).toBe(true)
    expect(tierShown('INVITED')).toBe(false)
    expect(tierShown('DECLINED')).toBe(false)
    expect(TIER_BEFORE_YES).toBe('Not shown until they say yes')
  })

  it('the drawer and the table read the one rule', () => {
    expect(CANDIDATES).toContain('{tierShown(consultant.consent) ? wordFor(consultant.tier) : TIER_BEFORE_YES}')
    expect(CANDIDATES).toContain('row.tier && tierShown(row.consent)')
    expect(CANDIDATES).not.toContain('{wordFor(consultant.tier)}</p>')
  })
})

describe('The Candidates list never hints at a name the firm was not shown (i)', () => {
  it('people the firm reads only as typed come after everyone else, and every page adds up', () => {
    const othersTotal = 30
    const typedTotal = 22
    const limit = 25
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const w = askedLastWindow({ othersTotal, skip: (page - 1) * limit, limit })
      const others = Array.from({ length: w.others.take }, (_, i) => `o${w.others.skip + i}`)
      const typed = Array.from({ length: Math.max(0, Math.min(w.typed.take, typedTotal - w.typed.skip)) }, (_, i) => `t${w.typed.skip + i}`)
      expect(w.others.take + w.typed.take).toBe(limit)
      seen.push(...others, ...typed)
    }
    expect(seen).toHaveLength(othersTotal + typedTotal)
    expect(new Set(seen).size).toBe(seen.length)
    // Every other row before the first typed one.
    expect(seen.findIndex((s) => s.startsWith('t'))).toBe(othersTotal)
  })

  it('a page past the others reads only typed rows, from where the others ran out', () => {
    expect(askedLastWindow({ othersTotal: 3, skip: 10, limit: 5 })).toEqual({ others: { skip: 3, take: 0 }, typed: { skip: 7, take: 5 } })
    expect(LIST_ROUTE).toContain("orderBy: [{ invitedAt: { sort: 'desc', nulls: 'last' } }, { consultantId: 'asc' }]")
  })
})

describe('Whose record it is counts every listing, as firmReadsAt does (j)', () => {
  it('a record another firm once listed is theirs, even after that listing was taken back', () => {
    expect(recordKeptBy({ ownAccount: false, otherFirms: 1 })).toBe('THEM')
    for (const src of [LIST_ROUTE, ONE_ROUTE]) {
      expect(src).not.toContain("listings: { where: { revokedAt: null, ...(companyId ? { companyId: { not: companyId } } : {}) } }")
      expect(src).toContain("listings: { where: { ...(companyId ? { companyId: { not: companyId } } : {}) } }")
    }
  })
})

describe('The client’s scorecards say resume (k)', () => {
  it('the scorecard figure reads First resume, never First CV', () => {
    expect(SCORECARDS).toContain('<Fig label="First resume"')
    expect(SCORECARDS).not.toContain('First CV')
  })
})

describe('A placement’s last day is a day on site, on Bench profit too (12)', () => {
  it('on the last day of a placement that ends at midnight, the person is placed, not on the bench', async () => {
    const { benchSpell } = await import('@/lib/bench-profit')
    const line = { id: 'l1', startsOn: new Date('2026-03-02T00:00:00Z'), endsOn: new Date('2026-06-30T00:00:00Z') }
    const lastDayAfternoon = new Date('2026-06-30T15:00:00Z')
    expect(benchSpell({ joinedBench: null, lines: [line], now: lastDayAfternoon }).kind).toBe('STRAIGHT_ON')
    // The day after, she is on the bench from the day it ended.
    const dayAfter = benchSpell({ joinedBench: null, lines: [line], now: new Date('2026-07-01T09:00:00Z') })
    expect(dayAfter.kind).toBe('NOW')
  })

  it('a line papered to start later today is not counted as starting tomorrow', async () => {
    const { benchSpell } = await import('@/lib/bench-profit')
    const line = { id: 'l2', startsOn: new Date('2026-07-06T13:00:00Z'), endsOn: null }
    const s = benchSpell({ joinedBench: new Date('2026-07-01T00:00:00Z'), lines: [line], now: new Date('2026-07-06T09:00:00Z') })
    expect(s.kind).toBe('BEFORE')
  })
})

describe('On the bench today with a placement to come, the row says both (13)', () => {
  it('a person the tile counts, with a line that starts later, reads on the bench and the day it starts', () => {
    const starts: Free = { state: 'PLACED', on: null, says: 'Starts a placement on Dec 1, 2026', startsOn: '2026-12-01' }
    expect(freeOnTheBench(starts, true)?.says).toBe('On the bench · starts a placement on Dec 1, 2026')
    // Not counted on the bench: the row keeps the placement words alone.
    expect(freeOnTheBench(starts, false)?.says).toBe('Starts a placement on Dec 1, 2026')
  })
})

describe('Candidates and Today count the people asked the same way (14)', () => {
  it('the Candidates list reads Today’s own count of who was asked and has not answered', () => {
    expect(LIST_ROUTE).toContain('askedAt(companyId!)')
    expect(LIST_ROUTE).not.toContain("prisma.benchListing.count({ where: { companyId: companyId!, revokedAt: null, state: 'INVITED' } })")
  })
})
