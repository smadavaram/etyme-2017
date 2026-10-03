import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  weekState, waitingCard, payStageOf, signingOrder, weekDoor, signedWeeksCard, ratesSaid,
  type WeekSigner,
} from '@/lib/consultant-portfolio'
import { rateOnEndingSoon, clientEndingChoices, mayWorkRolloff } from '@/lib/releasing-soon'
import { hrNotice } from '@/lib/internal-moves'

/**
 * The worker side walked on a phone, 2026-10-03 (commit e80773ab9), and
 * the client's Ending soon on the same walk. What the walk found in
 * supply's files, as sentences.
 */

const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

// Helena Marsh: Northbend Athletic ← Computer Systems Inc ← CloudEPA.
const HELENA: WeekSigner[] = [
  { companyId: 'nb', name: 'Northbend Athletic', role: 'CLIENT_APPROVAL' },
  { companyId: 'cs', name: 'Computer Systems Inc', role: 'PASS_THROUGH' },
  { companyId: 'ce', name: 'CloudEPA', role: 'EMPLOYER_ACCEPTANCE' },
]

describe('one week has one state, the same on every tile and row', () => {
  it('a week the client signed and a firm below has not accepted reads as waiting on that firm', () => {
    const s = weekState({ status: 'SUBMITTED', billed: false, waitingOn: 'Computer Systems Inc', pay: null })
    expect(s.kind).toBe('WAITING')
    expect(s.word).toBe('waiting on Computer Systems Inc')
  })

  it('a week still waiting on any firm is never also counted as approved', () => {
    // Helena's Sep 21 week was "approved", "waiting on approval" and
    // "waiting on CloudEPA" at once. Approved weeks now count only weeks
    // every firm has accepted; the waiting card counts the rest.
    const card = signedWeeksCard({ notBilled: 0, employed: { paid: 0, owed: 3, unknown: 0, employer: 'CloudEPA' } })
    expect(card).toEqual({ label: 'Approved weeks', value: 3, note: '3 owed to you' })
    const waiting = waitingCard([
      weekState({ status: 'SUBMITTED', billed: false, waitingOn: 'Computer Systems Inc', pay: null }),
      weekState({ status: 'APPROVED', billed: true, waitingOn: null, pay: 'OWED' }),
    ])
    expect(waiting.value).toBe(1)
  })

  it('the waiting card names the firm each week is with, not the firm that pays her', () => {
    const card = waitingCard([
      weekState({ status: 'SUBMITTED', billed: false, waitingOn: 'Computer Systems Inc', pay: null }),
      weekState({ status: 'SUBMITTED', billed: false, waitingOn: 'Northbend Athletic', pay: null }),
      weekState({ status: 'SUBMITTED', billed: false, waitingOn: 'Northbend Athletic', pay: null }),
    ])
    expect(card).toEqual({
      label: 'Waiting on approval',
      value: 3,
      note: '1 with Computer Systems Inc · 2 with Northbend Athletic',
    })
    expect(card.note).not.toContain('CloudEPA')
  })

  it('a week paid in full reads paid in Your hours, never approved', () => {
    expect(weekState({ status: 'APPROVED', billed: false, waitingOn: null, pay: 'PAID' }).word).toBe('paid')
  })

  it('a week accepted and not yet paid reads owed to you, never billed', () => {
    expect(weekState({ status: 'APPROVED', billed: true, waitingOn: null, pay: 'OWED' }).word).toBe('owed to you')
  })

  it('a worker whose pay is not run on Etyme keeps the trade’s words: billed or approved', () => {
    expect(weekState({ status: 'APPROVED', billed: true, waitingOn: null, pay: null }).word).toBe('billed')
    expect(weekState({ status: 'APPROVED', billed: false, waitingOn: null, pay: null }).word).toBe('approved')
  })

  it('a week whose days fall in a week with anything still owed reads owed; all paid reads paid', () => {
    const owed = [
      { weekOf: '2026-08-31', stage: 'OWED' as const, priced: true },
      { weekOf: '2026-08-03', stage: 'PAID' as const, priced: true },
    ]
    expect(payStageOf({ '2026-09-01': 8, '2026-09-02': 8 }, '2026-08-31', owed)).toBe('OWED')
    expect(payStageOf({ '2026-08-04': 8 }, '2026-08-03', owed)).toBe('PAID')
    expect(payStageOf({ '2026-07-07': 8 }, '2026-07-06', owed)).toBeNull()
  })

  it('a week with no figure is not called paid or owed', () => {
    expect(payStageOf({ '2026-09-01': 8 }, '2026-08-31', [{ weekOf: '2026-08-31', stage: 'PAID', priced: false }])).toBeNull()
  })

  it('the tiles, the pay section and Your hours read one state through one function', () => {
    const route = src('app/api/me/work/route.ts')
    expect(route).toContain('awaitingApproval: waitingSummary.value')
    expect(route).toContain('state: stateOf(t,')
    expect(route).not.toMatch(/awaitingApproval: timesheets\.filter/)
    const page = src('app/dashboard/my-work/page.tsx')
    expect(page).toContain('t.state?.word')
    expect(page).not.toContain("t.billed ? 'billed' : t.status.toLowerCase()}\n                </Chip>")
  })
})

describe('approval by email is offered only where it can work', () => {
  const base = { id: 'w1', status: 'SUBMITTED', clientApproved: false, approvedBy: null }

  it('a week over the job’s hours does not offer email; it says the client signs it in Etyme', () => {
    const door = weekDoor({
      ...base,
      email: { clientName: 'Northbend Athletic', refused: '45h claimed on a 40h-a-week job …', linkWaiting: null },
    })
    expect(door).toEqual({ href: '/dashboard/weeks/w1', says: 'Northbend Athletic signs this week in Etyme' })
  })

  it('once a link is sent, the row says who it went to and when, and offers no second one', () => {
    const door = weekDoor({
      ...base,
      email: { clientName: 'Northbend Athletic', refused: null, linkWaiting: { to: 'Marcus Oyelaran', on: 'Oct 3' } },
    })
    expect(door?.says).toBe('Link sent to Marcus Oyelaran, Oct 3')
    expect(door?.says).not.toContain('Ask the client')
  })

  it('a week the rules allow still offers to ask the client by email', () => {
    expect(weekDoor({ ...base, email: { clientName: 'Northbend Athletic', refused: null, linkWaiting: null } })?.says)
      .toBe('Ask the client to approve by email')
  })

  it('the worker’s list asks lib/week-approval, the page’s own door, rather than deciding a second way', () => {
    const route = src('app/api/me/work/route.ts')
    expect(route).toContain('readWeekApprovals(readerOf(caller)')
    expect(route).toContain('email: emailAnswer.get(t.id)')
    expect(route).not.toMatch(/prisma\.weekApproval/)
  })
})

describe('the filing card names everybody who signs, in order', () => {
  it('a chain of three reads the client first, then each firm below in turn', () => {
    expect(signingOrder(HELENA)).toBe(
      'After you send, Northbend Athletic approves them first. Then Computer Systems Inc and CloudEPA accept them, in that order.'
    )
  })

  it('a client buying straight from her employer reads two names', () => {
    expect(signingOrder([HELENA[0], HELENA[2]])).toBe(
      'After you send, Northbend Athletic approves them first. Then CloudEPA accepts them.'
    )
  })

  it('the card no longer says the employer and the client each sign', () => {
    const page = src('app/dashboard/my-work/page.tsx')
    expect(page).not.toContain('and the client each sign them after you send')
    expect(page).toContain('current.signs')
  })
})

describe('Ending soon, as a client and as a supplier reads it', () => {
  const line = { billRate: 13_200, companyId: 'teleworld', clientCompanyId: 'northbend' }

  it('the page prints the rate, never the code that should have printed it', () => {
    const page = src('app/dashboard/rolloff/page.tsx')
    // A template's \${…} with its dollar sign lost prints itself.
    expect(page).not.toMatch(/[^$]\{compact\(/)
  })

  it('the last day reads as the dashboard says it, never 10/21/2026', () => {
    const page = src('app/dashboard/rolloff/page.tsx')
    expect(page).not.toMatch(/toLocaleDateString\(\)/)
  })

  it('a client reads the rate it pays', () => {
    expect(rateOnEndingSoon({ companyId: 'northbend', permissions: [] }, line)).toBe(13_200)
  })

  it('a supplier desk without the price permission reads no bill rate', () => {
    expect(rateOnEndingSoon({ companyId: 'teleworld', permissions: ['consultants.read'] }, line)).toBeNull()
  })

  it('the supplier’s price desk reads what it charges', () => {
    expect(rateOnEndingSoon({ companyId: 'teleworld', permissions: ['margin.read'] }, line)).toBe(13_200)
  })

  it('a client is offered extend, backfill or let it end — never claim, back on bench or lost', () => {
    const labels = clientEndingChoices({ sellContractId: 'sc1', endsOn: 'Oct 21, 2026' }).map((c) => c.label).join(' | ')
    expect(labels).toContain('Extend')
    expect(labels).toContain('Backfill')
    expect(labels).toContain('let it end on Oct 21, 2026')
    expect(labels).not.toMatch(/Claim|bench|Lost/)
  })

  it('the supplier’s buttons are drawn only for a supplier', () => {
    const page = src('app/dashboard/rolloff/page.tsx')
    expect(page).toContain('{!isClient && !event.claimedById && !event.outcome && (')
    expect(page).toContain('{!isClient && !event.outcome && (')
    expect(page).toContain('readOnly={isClient}')
  })

  it('only the firm whose contract it is may claim its rolloff, and anybody else is told whose it is', () => {
    const own = { companyId: 'teleworld', companyName: 'Teleworld Solutions' }
    expect(mayWorkRolloff({ companyId: 'teleworld', isConsultantSeat: false }, own)).toEqual({ ok: true })
    const client = mayWorkRolloff({ companyId: 'northbend', isConsultantSeat: false }, own)
    expect(client.ok).toBe(false)
    if (!client.ok) expect(client.says).toBe('Only Teleworld Solutions works this offboarding, because the contract is theirs.')
    expect(mayWorkRolloff({ companyId: 'teleworld', isConsultantSeat: true }, own).ok).toBe(false)
  })

  it('the claim route asks where the caller sits, not only who is signed in', () => {
    const route = src('app/api/rolloff/[id]/claim/route.ts')
    expect(route).toContain('mayWorkRolloff(')
    expect(route).not.toContain('getSessionEmail')
  })

  it('Teleworld’s Northbend project is at the Tualatin site, where every other Northbend job is', () => {
    const seed = src('lib/seed-internal-moves.ts')
    expect(seed).not.toMatch(/city: 'Portland'/)
    expect(seed).toContain("site: { name: 'Tualatin site', city: 'Tualatin', state: 'OR' }")
  })
})

describe('a week paid at more than one rate says so', () => {
  const today = new Date('2026-10-03T00:00:00Z')
  const rates = new Map([
    [6_600, { hours: 16, first: '2026-08-03' }],
    [7_000, { hours: 24, first: '2026-08-05' }],
  ])

  it('the raise week names the hours at each rate and the day the raise took effect', () => {
    expect(ratesSaid('2026-08-03', rates, [{ rateCents: 7_000, fromDate: new Date('2026-08-05T00:00:00Z') }], 'USD', today))
      .toBe('16 at $66 and 24 at $70, because your raise took effect on Aug 5.')
  })

  it('where no rate change starts inside the week, the first day worked at the new rate is the day said', () => {
    expect(ratesSaid('2026-08-03', rates, [], 'USD', today)).toContain('took effect on Aug 5.')
  })

  it('a cut in pay is called a change of rate, never a raise', () => {
    const cut = new Map([
      [7_000, { hours: 16, first: '2026-08-03' }],
      [6_600, { hours: 24, first: '2026-08-05' }],
    ])
    expect(ratesSaid('2026-08-03', cut, [], 'USD', today)).toBe('16 at $70 and 24 at $66, because your rate changed on Aug 5.')
  })
})

describe('what a firm and its HR desk are told about the bench', () => {
  it('HR told of a move onto a manager’s own project reads who was placed, by name', () => {
    const n = hrNotice('MOVE', {
      personName: 'Amara Nwosu', firmName: 'Teleworld Solutions', actorName: 'Rahul Deshpande',
      forTitle: 'ERP finance migration', toClient: 'Harlow Health', toCity: 'San Jose',
      startsOn: new Date('2026-11-16T00:00:00Z'), movedAs: 'LINE',
    })
    expect(n.body).toMatch(/^Rahul Deshpande placed Amara Nwosu on ERP finance migration at Harlow Health in San Jose, starting /)
  })

  it('a firm told about a person’s bench stay is told as bench news, which opens the bench, never as a submission', () => {
    const lib = src('lib/bench-stay-record.ts')
    const tell = lib.slice(lib.indexOf('export async function tellFirm'), lib.indexOf('return desks.length'))
    expect(tell).toContain("type: 'BENCH'")
    expect(tell).not.toContain("type: 'SUBMISSION'")
  })
})
