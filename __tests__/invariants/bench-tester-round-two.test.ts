import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  whenFree, benchSubtitle, mayBrowseBench, benchClosedSays, TIER_WORD, wordFor, addedSays, listingRates,
} from '@/lib/bench-filter'
import { stayRow } from '@/lib/bench-stay'
import { costOfDays, benchToBill, isMove, mayReadBenchProfit } from '@/lib/bench-profit'
import { benchCost, burnOf, type Policy } from '@/lib/bench-policy'
import {
  checkHold, checkFlag, keptPastContract, ourBenchRow, personNotice, hrNotice, jobOnly, possessive, onePerJob,
} from '@/lib/internal-moves'
import { MOVE_ACTIONS, fieldable } from '@/lib/training'

/**
 * The bench tester's second walk, on commit e80773ab9 (2026-10-01), one
 * finding at a time, as sentences.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const NOW = d('2026-10-01')
const HALF: Policy = { policy: 'REDUCED_RATE', benchRateBps: 5000, carryDays: 90, reserveBps: null, reserveOnExit: 'PAY_OUT' } as Policy

describe('1 · a partner’s bench never shows another firm’s person’s contact', () => {
  const noHeadline = { headline: null, email: 'samuel.varga@seed.etyme.invalid', skills: ['Process validation', 'Cleaning validation'] }

  it('a partner’s bench shows their skills where they have no headline, never their email', () => {
    expect(benchSubtitle(noHeadline, false)).toBe('Process validation · Cleaning validation')
    expect(benchSubtitle(noHeadline, false)).not.toContain('@')
  })

  it('with no headline and no skills it says so plainly', () => {
    expect(benchSubtitle({ headline: null, email: 'x@y.invalid', skills: [] }, false)).toBe('No headline yet')
  })

  it('the firm’s own bench may show the address it holds for its own people', () => {
    expect(benchSubtitle(noHeadline, true)).toBe('samuel.varga@seed.etyme.invalid')
  })

  it('the route sends no email on the partner bench, and the page reads the subtitle through the one rule', () => {
    expect(src('src/app/api/bench/route.ts')).toContain("email: scope === 'network' ? null : l.consultant.person.primaryEmail")
    expect(src('src/app/dashboard/bench/page.tsx')).toContain("benchSubtitle(row, scope === 'company')")
  })
})

describe('2 · a client never browses a bench', () => {
  it('a client is refused the listed bench and the partner bench in a sentence that points to matching', () => {
    for (const scope of ['company', 'network']) {
      const v = mayBrowseBench({ companyKind: 'CLIENT', scope })
      expect(v.ok).toBe(false)
      if (!v.ok) expect(v.says).toContain('Find matches')
    }
  })

  it('a client still reads its own payroll, which its document desks ask for', () => {
    expect(mayBrowseBench({ companyKind: 'CLIENT', scope: 'payroll' }).ok).toBe(true)
  })

  it('a supplier, an integrator and a program office browse as before', () => {
    for (const k of ['VENDOR', 'GSI', 'MSP']) expect(mayBrowseBench({ companyKind: k, scope: 'network' }).ok).toBe(true)
  })

  it('the route refuses before reading a listing, and the page shows the sentence instead of the tabs', () => {
    const route = src('src/app/api/bench/route.ts')
    expect(route.indexOf('mayBrowseBench(')).toBeLessThan(route.indexOf('prisma.benchListing.findMany'))
    expect(src('src/app/dashboard/bench/page.tsx')).toContain('{clientRefused.says}')
  })
})

describe('4 · the bench cost adds up from what the screen shows', () => {
  it('Hector’s 60 days count the real weekdays after his last day, the same count Bench burn shows, whatever weekday it was', () => {
    // $64 an hour × 8 = $512 a day; half is $256 for each weekday counted.
    for (let k = 0; k < 7; k++) {
      const since = new Date(Date.UTC(2026, 7, 3 + k))
      const c = costOfDays({ days: 60, since, policy: HALF, payRateCents: 6400, contractType: 'W2', currency: 'USD' })
      const burn = burnOf({ payRateCents: 6400, billing: false, benchSince: since }, new Date(since.getTime() + 60 * 86_400_000))
      expect(c.counted, since.toISOString()).toBe(`${burn.workingDays} working days of 60 at 50% of $512.00 a day`)
      expect(c.costCents).toBe(burn.workingDays * 25_600)
      expect(c.says).not.toContain('Five of every seven')
    }
  })

  it('only where the first bench day is not known are five of every seven days counted, and the sentence says so', () => {
    const c = costOfDays({ days: 60, policy: HALF, payRateCents: 6400, contractType: 'W2', currency: 'USD' })
    expect(c.counted).toBe('43 working days of 60 at 50% of $512.00 a day')
    expect(c.says).toContain('Five of every seven days on the bench are counted as working days.')
  })

  it('the working days said are always the ones the bench cost rule paid, never counted a second way', () => {
    for (const days of [1, 6, 7, 13, 35, 49, 60, 89, 90, 120]) {
      for (const rate of [5_000, 6_200, 6_400, 9_999]) {
        const c = costOfDays({ days, policy: HALF, payRateCents: rate, contractType: 'W2', currency: 'USD' })
        const worked = Number(c.counted!.match(/^(\d+) working day/)![1])
        const perDay = (rate * 8 * 5000) / 10_000
        expect(Math.round(worked * perDay), `${days} days at ${rate}`).toBe(c.costCents)
        expect(c.costCents).toBe(benchCost(HALF, { idleDays: days, billingDayRateCents: rate * 8 }).costCents)
      }
    }
  })

  it('the cost column shows what was counted beside the figure, in the table and the feed', () => {
    const page = src('src/app/dashboard/bench/bench-profit.tsx')
    expect(page).toContain('{r.costCounted && <p')
    expect(page).toContain('r.costCounted ? ` (${r.costCounted})`')
  })
})

describe('5 · a hold reaches the day the person is free', () => {
  const base = {
    personName: 'Amara Nwosu', callerId: 'rahul', releaserId: 'ingrid', standing: null,
    isManager: true, untilAsked: null, hasPosition: true, today: NOW,
  }

  it('with no date asked, a hold on somebody free in six weeks lasts until the day they are free', () => {
    const v = checkHold({ ...base, freeOn: d('2026-11-15') })
    expect(v.ok && v.until.toISOString().slice(0, 10)).toBe('2026-11-15')
  })

  it('somebody free now is held for the usual two weeks', () => {
    const v = checkHold({ ...base, freeOn: null })
    expect(v.ok && v.until.toISOString().slice(0, 10)).toBe('2026-10-15')
  })

  it('a hold asked to end before they are free says plainly that it lapses first', () => {
    const v = checkHold({ ...base, freeOn: d('2026-11-15'), untilAsked: d('2026-10-15') })
    expect(v.ok && v.says).toBe(
      'You hold Amara Nwosu until Oct 15, 2026. Nobody else can reserve them before then. ' +
        'It ends before Amara Nwosu is free on Nov 15, 2026: place them before it ends, or it lapses and any manager may reserve them.'
    )
  })

  it('a hold may reach the free day but not past it where that is beyond thirty days', () => {
    expect(checkHold({ ...base, freeOn: d('2026-11-15'), untilAsked: d('2026-11-16') }).ok).toBe(false)
  })

  it('the route passes the free day into the rule', () => {
    expect(src('src/app/api/bench/ours/holds/route.ts')).toContain('freeOn: release ? freeFrom(release) : null')
  })
})

describe('8 · only a placement is a move', () => {
  it('somebody only put forward to a client’s job request is not a move', () => {
    expect(isMove({ placedSellContractId: null, placedSubmissionId: 's1', submissionStatus: 'SUBMITTED' })).toBe(false)
  })

  it('somebody the client placed from that submission is a move', () => {
    expect(isMove({ placedSellContractId: null, placedSubmissionId: 's1', submissionStatus: 'PLACED' })).toBe(true)
  })

  it('a line written onto the manager’s own order is a move', () => {
    expect(isMove({ placedSellContractId: 'c1', placedSubmissionId: null, submissionStatus: null })).toBe(true)
  })
})

describe('9 · a person put forward reads the client’s name where the client belongs', () => {
  it('Karthik reads Corveldt Aerospace as the client and the job as the job, once each', () => {
    const n = personNotice('MOVE', {
      personName: '', firmName: 'Teleworld Solutions', actorName: 'Ingrid Solberg',
      forTitle: 'DO-178C verification engineer', toClient: 'Corveldt Aerospace', toCity: 'Wichita', movedAs: 'SUBMISSION',
    })
    expect(n.title).toBe('You are put forward to Corveldt Aerospace in Wichita')
    expect(n.body).toBe(
      'Teleworld Solutions has put you forward to Corveldt Aerospace for DO-178C verification engineer, as its own employee. ' +
        'You start there only if Corveldt Aerospace chooses you; your employer stays Teleworld Solutions.'
    )
  })

  it('a hold’s title that already names the client is not given the client twice', () => {
    expect(jobOnly('ERP finance migration at Harlow Health', 'Harlow Health')).toBe('ERP finance migration')
    const n = hrNotice('MOVE', {
      personName: 'Amara Nwosu', firmName: 'Teleworld Solutions', actorName: 'Rahul Deshpande',
      forTitle: 'ERP finance migration at Harlow Health', toClient: 'Harlow Health', toCity: 'San Jose',
      startsOn: d('2026-11-15'), movedAs: 'LINE',
    })
    expect(n.body).toContain('placed on ERP finance migration at Harlow Health in San Jose')
    expect(n.body).not.toContain('Harlow Health at Harlow Health')
  })

  it('the person’s own page looks up the client of the job request, never the job’s title', () => {
    const route = src('src/app/api/me/work/route.ts')
    expect(route).toContain("forTitle: req?.title ?? h.forTitle, toClient: toClient ?? 'the client'")
    expect(route).not.toContain(': h.forTitle,\n')
  })
})

describe('10 · bench profit says the real reason a cost is not known', () => {
  it('no pay rate on record is said as the reason, on the cost and on the payback', () => {
    const r = benchToBill({
      spell: { kind: 'NOW', from: d('2026-08-22'), to: NOW, days: 40, startsOn: null },
      policy: HALF, payRateCents: null, contractType: null, currency: 'USD', earned: null,
    })
    expect(r.costCents).toBeNull()
    expect(r.paybackSays).toBe('Not known yet: no pay rate is on record for them.')
    expect(r.costSays).toContain('No pay rate is on record for them')
  })

  it('“because the bench cost is not” is said nowhere', () => {
    expect(src('src/lib/bench-profit.ts')).not.toContain('because the bench cost is not')
  })
})

describe('11 · one door decides who is free, on every page', () => {
  it('somebody on a bench they agreed to, on nothing, is free now', () => {
    expect(whenFree({ lines: [], availableFrom: null, onBenchSince: d('2026-08-02'), now: NOW })).toEqual({ state: 'NOW', on: '2026-10-01', says: 'Free now' })
  })

  it('somebody placed and billing is on a placement until its last day, free the day after', () => {
    const f = whenFree({
      lines: [{ startsOn: d('2026-06-01'), endsOn: d('2026-12-18'), state: 'IN_PROGRESS' }],
      availableFrom: null, onBenchSince: d('2026-04-01'), now: NOW,
    })
    expect(f).toEqual({ state: 'PLACED', on: '2026-12-19', says: 'On a placement until Dec 18, 2026' })
  })

  it('a placement with no end date is never read as free', () => {
    const f = whenFree({ lines: [{ startsOn: d('2026-06-01'), endsOn: null, state: 'IN_PROGRESS' }], availableFrom: null, onBenchSince: NOW, now: NOW })
    expect(f.state).toBe('PLACED')
    expect(f.on).toBeNull()
  })

  it('a placement papered to start later means not free, with the day it starts', () => {
    const f = whenFree({ lines: [{ startsOn: d('2026-10-20'), endsOn: null, state: 'VERIFIED' }], availableFrom: null, onBenchSince: NOW, now: NOW })
    expect(f).toEqual({ state: 'PLACED', on: null, says: 'Starts a placement on Oct 20, 2026' })
  })

  it('a free date of their own in the future is kept, as the later of it and their last placement', () => {
    const f = whenFree({ lines: [], lastEnded: d('2026-09-15'), availableFrom: d('2026-10-20'), onBenchSince: NOW, now: NOW })
    expect(f).toEqual({ state: 'FROM', on: '2026-10-20', says: 'Free from Oct 20, 2026' })
  })

  it('somebody who has agreed to nothing and has nothing on record is never called free', () => {
    expect(whenFree({ lines: [], availableFrom: null, onBenchSince: null, now: NOW }).state).toBe('UNKNOWN')
  })

  it('the bench page, the matches and the training page all read it', () => {
    expect(src('src/app/api/bench/route.ts')).toContain('whenFree({')
    expect(src('src/lib/match-pool.ts')).toContain('whenFree({')
    expect(src('src/app/dashboard/bench/page.tsx')).toContain('availabilityStatus(row.free)')
    expect(src('src/app/dashboard/training/page.tsx')).toContain('fieldable(listings.rows')
  })
})

describe('13 · a link to bench profit shows the server’s sentence to a seat that may not read it', () => {
  it('the recruiter and the client are each refused in a sentence', () => {
    const rec = mayReadBenchProfit({ companyName: 'Pellwright Validation Partners', companyKind: 'VENDOR', roleName: 'Recruiter', consultantSeat: false })
    const client = mayReadBenchProfit({ companyName: 'Corveldt Aerospace', companyKind: 'CLIENT', roleName: 'Owner', consultantSeat: false })
    expect(rec.ok || rec.message).toContain('Your seat (Recruiter) is none of them.')
    expect(client.ok || client.message).toContain('no client reads it')
  })

  it('the page opens bench profit from the link for anybody, so the route’s refusal is what they read', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('profitOpen || (!readsBench && readsProfit')
    expect(page).not.toContain('profitOpen && readsProfit')
  })
})

describe('14 · the finance desk reads bench profit from the Bench page', () => {
  it('a seat that reads bench profit and no people opens on bench profit, never on a refusal code', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('(!readsBench && readsProfit && session.company != null)')
  })

  it('a seat that reads no people is told whose page it is in a sentence, not a permission code', () => {
    expect(benchClosedSays('Pellwright Validation Partners')).toBe(
      'The bench at Pellwright Validation Partners is read by the desks that work with consultants — the recruiters, the resource ' +
        'manager, HR and the owner. Your seat is not one of them. Ask whoever manages roles there.'
    )
    expect(src('src/app/api/bench/route.ts')).not.toContain('You need consultants.read permission')
    expect(src('src/app/api/consultants/route.ts')).not.toContain('You need consultants.read permission')
  })
})

describe('15 · keeping somebody past their contract says the gap', () => {
  it('Amara kept until Nov 15 on a contract ending Oct 26 reads the nineteen days with no contract under them', () => {
    expect(keptPastContract(d('2026-11-15'), d('2026-10-26'))).toBe(
      'The contract ends on Oct 26, 2026, so the 19 days between then and Nov 15, 2026 have no contract under them: ' +
        'no client is billed for them, and your bench pay policy decides what they are paid.'
    )
  })

  it('a keep date on or before the day after the contract ends says nothing more', () => {
    expect(keptPastContract(d('2026-10-27'), d('2026-10-26'))).toBeNull()
    expect(keptPastContract(null, d('2026-10-26'))).toBeNull()
  })

  it('the row on Our bench and the flag both say it', () => {
    const row = ourBenchRow({
      personId: 'amara', name: 'Amara Nwosu', seat: 'Data Engineer', skills: [], place: null,
      release: { id: 'r', rollsOffOn: d('2026-10-26'), keepUntil: d('2026-11-15'), confirmedAt: null, releaserId: 'ingrid', releaserName: 'Ingrid Solberg' },
      current: { client: 'Northbend Athletic', city: 'Portland', endsOn: d('2026-10-26') }, mayNameProject: true,
      lastEnded: null, hold: null, moving: null, today: NOW,
    }, { personId: 'rahul', as: 'MANAGER' })
    expect(row.says).toContain('19 days between then and Nov 15, 2026 have no contract under them')
    const flag = checkFlag({
      personName: 'Amara Nwosu', clientName: 'Northbend Athletic', lineState: 'IN_PROGRESS', lineStart: d('2026-03-01'),
      lineEnd: d('2026-10-26'), rollsOffOn: d('2026-10-26'), keepUntil: d('2026-11-15'), today: NOW, manages: true,
    })
    expect(flag.ok && flag.says).toContain('have no contract under them')
  })
})

describe('17 · adding a consultant says what it did, and one set of words for the tiers', () => {
  it('adding somebody says the ask went by email and that nobody is put forward until they say yes', () => {
    expect(addedSays({ name: 'Rhea Castellano', firm: 'CloudEPA', tier: 'MARKETING', emailed: true })).toBe(
      'Rhea Castellano is added. CloudEPA has emailed them to ask if they will join its bench. ' +
        'Once they say yes they are shown to your partners. Nobody is put forward until they say yes.'
    )
  })

  it('the Consultants form asks who sees them and at what rate, and shows the route’s sentence when done', () => {
    const page = src('src/app/dashboard/consultants/page.tsx')
    expect(page).toContain('tier: form.tier')
    expect(page).toContain('rateMin: rates.rateMin')
    expect(page).toContain('onCreated={(says) => { setAdded(says); fetchConsultants() }}')
    expect(src('src/app/api/consultants/route.ts')).toContain('message: addedSays({')
  })

  it('Add to bench marks somebody already on the bench and saves the rate onto their listing instead of refusing', () => {
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).toContain('Already on your bench — choose to set their rate')
    expect(page).toContain("method: 'PATCH'")
    expect(src('src/app/api/bench/listings/[id]/route.ts')).toContain('return setRates(caller, companyId, id, body)')
  })

  it('a rate range is dollars in and cents out, and refused in a sentence when upside down or under their floor', () => {
    expect(listingRates({ min: '70', max: '85' }, null)).toEqual({ ok: true, rateMin: 7000, rateMax: 8500 })
    expect(listingRates({ min: '90', max: '85' }, null).ok).toBe(false)
    expect(listingRates({ min: '', max: '60' }, 7000)).toEqual({ ok: false, says: 'The highest rate is under the $70.00 an hour they said they take at the least.' })
  })

  it('both pages say “Kept to us” and “Shown to our partners”, and Bench no longer says Retained or Marketing', () => {
    expect(wordFor('RETAINED')).toBe(TIER_WORD.RETAINED)
    expect(wordFor('MARKETING')).toBe(TIER_WORD.MARKETING)
    const page = src('src/app/dashboard/bench/page.tsx')
    expect(page).not.toMatch(/'Retained'|'Marketing'|>Retained<|>Marketing<|Marketing —|Retained —/)
  })
})

describe('18 · the bench row shows the stay the person chose', () => {
  it('a chosen stay reads its end date and the days left', () => {
    expect(stayRow({ state: 'GRANTED', stayDays: 5, staysUntil: d('2026-10-06') }, NOW)).toBe('Stays until Oct 6, 2026 (5 days chosen, 5 days left)')
  })

  it('no chosen end reads until they cancel, and an unanswered ask reads nothing', () => {
    expect(stayRow({ state: 'GRANTED', stayDays: null, staysUntil: null }, NOW)).toBe('Stays until they cancel')
    expect(stayRow({ state: 'INVITED', stayDays: 5, staysUntil: d('2026-10-06') }, NOW)).toBeNull()
  })
})

describe('20 · the Training page', () => {
  it('a course row shows its price a seat', () => {
    expect(src('src/app/dashboard/training/page.tsx')).toContain("`${amount(c.price, c.currency)} a seat`")
  })

  it('every box on the add-a-course form has a label', () => {
    const page = src('src/app/dashboard/training/page.tsx')
    for (const l of ['Course name', 'Kind', 'Hours', 'Price a seat ($)', 'Who', 'Which course']) expect(page).toContain(`>${l}</span>`)
  })

  it('the firm’s own staff are not offered for a course, and the people offered are grouped by how they are here', () => {
    const people = fieldable(
      [{ personId: 'hector', name: 'Hector Valdivia', skills: ['Process validation'], consent: 'GRANTED', free: { state: 'NOW', on: '2026-10-01' } }],
      [
        { personId: 'imogen', name: 'Imogen Hartley', skills: [], standing: 'NOT_ON_THE_RECORD' },
        { personId: 'tobias', name: 'Tobias Wren', skills: ['IQ'], standing: 'ON_PROJECT' },
      ],
      NOW
    )
    expect(people.map((p) => [p.name, p.kind, p.free])).toEqual([
      ['Hector Valdivia', 'BENCH', 'NOW'],
      ['Tobias Wren', 'EMPLOYEE', 'PLACED'],
    ])
    expect(src('src/app/dashboard/training/page.tsx')).toContain('<optgroup label="On your bench">')
  })

  it('the buttons on an enrollment say what they do: Start, Finish, Drop', () => {
    expect(MOVE_ACTIONS).toEqual({ start: 'Start', complete: 'Finish', drop: 'Drop' })
    expect(src('src/app/api/training/route.ts')).toContain('word: MOVE_ACTIONS[m]')
  })
})

describe('22 · the Reserve list names each job once', () => {
  it('a firm’s own resold copy is dropped where the job it was sent is on the list', () => {
    const reqs = [
      { id: 'corveldt', mirroredFromId: null },
      { id: 'teleworld-copy', mirroredFromId: 'corveldt' },
      { id: 'other', mirroredFromId: 'not-sent-to-us' },
    ]
    expect(onePerJob(reqs).map((r) => r.id)).toEqual(['corveldt', 'other'])
  })
})

describe('23 · the small words', () => {
  it('a month in the reserve form keeps its capital letter', () => {
    const page = src('src/app/dashboard/bench/our-bench.tsx')
    expect(page).not.toContain('freeOnSays.toLowerCase()')
    expect(page).toContain("freeOnSays.replace(/^Free/, 'free')")
  })

  it('a firm’s name ending in s takes the apostrophe alone', () => {
    expect(possessive('Teleworld Solutions')).toBe('Teleworld Solutions’')
    expect(possessive('Harlow Health')).toBe('Harlow Health’s')
    expect(src('src/app/dashboard/bench/our-bench.tsx')).toContain('{possessive(firmName)} managers')
  })

  it('matching says why suppliers’ people rank above a suggestion that scores higher', () => {
    expect(src('src/lib/match-pool.ts')).toContain(
      'Your suppliers’ people are listed first and suggestions last, whatever the score, because a firm that is '
    )
  })
})
